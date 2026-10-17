(function () {
    "use strict";
    var root = $.GetContextPanel();
    var background = $("#StartupLoadingBackground");
    var surface = $("#StartupLoadingSurface");
    // Some phases use an engine-owned ContextPanel around the authored root.
    var layoutRoot = surface && surface.GetParent ? surface.GetParent() : background.GetParent ? background.GetParent() : root;
    surface = surface || layoutRoot;
    var nativeLoadingContext = !!(layoutRoot && layoutRoot.BHasClass
        && layoutRoot.BHasClass("StartupNativeLoadingContext"));
    var imagePath = "file://{images}/custom_game/loading/dawnward_citadel_background.png";
    var state = null, session = "", imageReady = false, imageError = false, stateTimeout = false;
    var imageGeneration = 0, stateGeneration = 0, lastHandshake = -100, lastRetry = -100;
    var clock = 0, disposed = false, tableSubscription = null;
    var diagnostics = {};
    var releasedSession = "", releasedPlayer = -1;
    var lastReportedVisible = false;
    var artworkRetired = false;
    var lastHiddenRepair = -100;

    // A joining Tools client may recompile an older content layout over its
    // game layout. Do not let a missing optional button abort the entire
    // loading script before nettable subscription and the image handshake.
    function ensureButton(id, parent, css, textId, text) {
        var button = $("#" + id), created = false;
        if (!button || !button.IsValid()) {
            button = $.CreatePanel("Button", parent || surface, id);
            button.AddClass(css);
            created = true;
            if ($.Msg) $.Msg("[STARTUP_LAYOUT_COMPAT] created=" + id);
        }
        var label = textId ? $("#" + textId) : null;
        if ((textId && (!label || !label.IsValid())) || (!textId && created)) {
            label = $.CreatePanel("Label", button, textId || "");
            label.text = text;
        }
        return {button: button, label: label};
    }
    var retryControl = ensureButton("StartupLoadingRetry", $("#StartupLoadingErrorBox"),
        "StartupLoadingRetry", null, "重试");

    function setVisible(visible) {
        [root, layoutRoot, surface].forEach(function (panel) {
            if (!panel || !panel.IsValid()) return;
            panel.visible = visible;
            panel.style.visibility = visible ? "visible" : "collapse";
            panel.style.opacity = visible ? "1" : "0";
            panel.hittest = visible;
            panel.hittestchildren = visible;
            panel.style.zIndex = "200000";
            panel.SetHasClass("StartupLoadingHidden", !visible);
        });
        if (visible !== lastReportedVisible) {
            lastReportedVisible = visible;
            if ($.Msg) $.Msg("[STARTUP_VISIBILITY] " + JSON.stringify({visible: visible,
                admission_complete: state && state.admission_complete !== undefined ? yes(state.admission_complete) : null,
                has_state: !!state, session_id: session,
                surface_visible: surface.visible, surface_opacity: surface.style.opacity, artwork_retired: artworkRetired,
                phase: state && state.phase || "", context: String(root.id || "(anonymous)"),
                parent: root.GetParent && root.GetParent() ? String(root.GetParent().id || "(anonymous)") : ""}));
        }
    }
    // Decide from the first nettable snapshot before ever drawing a new phase.
    setVisible(false);

    function parentOf(panel) { return panel && panel.GetParent ? panel.GetParent() : null; }
    function diagnostic(stage) {
        if (!valid() || diagnostics[stage] || !$.Msg) return;
        diagnostics[stage] = true;
        var chain = [], panel = root, depth = 0;
        while (panel && depth++ < 8) {
            chain.push({id: String(panel.id || "(anonymous)"), width: panel.actuallayoutwidth || 0,
                height: panel.actuallayoutheight || 0, visible: panel.visible !== false});
            panel = parentOf(panel);
        }
        $.Msg("[STARTUP_UI] " + JSON.stringify({stage: stage, hierarchy: chain,
            imageWidth: background.actuallayoutwidth || 0, imageHeight: background.actuallayoutheight || 0,
            imageOpacity: background.style.opacity, imageReady: imageReady, imageError: imageError,
            loadedClass: root.BHasClass("StartupLoadingImageReady"), hiddenClass: root.BHasClass("StartupLoadingHidden"),
            nativeHidden: []}));
    }

    function valid() { return !disposed && root && root.IsValid(); }
    function yes(value) { return value === true || value === 1; }
    function number(value) { return typeof value === "number" && isFinite(value); }
    function percent(value) { return number(value) ? Math.max(0, Math.min(100, value)) : 0; }
    function validSession(value) { return typeof value === "string" && value.length > 0 && value.length <= 200; }
    function playerId() {
        try {
            var id = typeof Game !== "undefined" && Game.GetLocalPlayerID ? Game.GetLocalPlayerID() : -1;
            if (number(id) && id >= 0) return id;
            // No full player-info fallback: its native implementation can
            // dereference the missing client PlayerResource during LAN signon.
            return -1;
        } catch (ignored) { return -1; }
    }
    function players() {
        var source = state && state.players, result = [], seen = {};
        if (!source || typeof source !== "object") return result;
        Object.keys(source).forEach(function (key) {
            var row = source[key];
            if (!row || !number(row.player_id) || row.player_id < 0 || row.player_id > 63 || seen[row.player_id]) return;
            seen[row.player_id] = true; result.push(row);
        });
        result.sort(function (a, b) { return a.player_id - b.player_id; });
        return result;
    }
    function assetsReady() {
        var assets = state && state.assets;
        return !!assets && yes(assets.complete) && number(assets.failed) && assets.failed === 0;
    }
    function playerReady(row) {
        return !!row && yes(row.authenticated) && yes(row.client_ready) && yes(row.ready)
            && row.status !== "disconnected" && row.status !== "auth_error";
    }
    function personalProgress(local) {
        var assets = state && state.assets;
        var resourceProgress = assets ? percent(assets.progress) : 0;
        var authentication = local && yes(local.authenticated) ? 20 : 0;
        // The server acknowledges the actual image/UI handshake once per
        // player/session. A replacement HUD must not subtract it while its
        // decorative copy of the same background loads again.
        var client = local && yes(local.client_ready) ? 20 : 0;
        return resourceProgress * 0.6 + authentication + client;
    }
    function send(name) {
        if (!validSession(session) || playerId() < 0) return false;
        try {
            if (typeof GameEvents === "undefined" || !GameEvents.SendCustomGameEventToServer) return false;
            // Identity and authorization are determined by the server event source.
            GameEvents.SendCustomGameEventToServer(name, {session_id: session}); return true;
        } catch (ignored) { return false; }
    }
    function reloadRequired() { return !!state && state.error === "asset_reload_required"; }
    function lateJoin() {
        var id = playerId(), roster = players();
        return !!state && (yes(state.admission_complete) || yes(state.all_ready)) && id >= 0 && roster.length > 0
            && !roster.some(function (row) { return row.player_id === id; });
    }
    function released() {
        var id = playerId();
        return validSession(session) && releasedSession === session
            && (id < 0 || id === releasedPlayer);
    }
    function phaseConfig() {
        try {
            return typeof GameUI !== "undefined" && GameUI.CustomUIConfig ? GameUI.CustomUIConfig() : null;
        } catch (ignored) { return null; }
    }
    function completionMemo(id) {
        var config = phaseConfig(), memo = config && config.SurvivalStartupCompletion;
        return memo && validSession(memo.session_id) && number(memo.player_id) && memo.player_id >= 0
            && (id < 0 || id === memo.player_id) ? memo : null;
    }
    function restoreCompletion(id) {
        var memo = completionMemo(id);
        // This cache is presentation only. Never use it before the current
        // server session is known, or for a different local player/new game.
        if (memo && memo.session_id === session && validSession(session)) {
            releasedSession = session; releasedPlayer = memo.player_id;
        }
    }
    function maybeHandshake(local) {
        if (released() || !imageReady || imageError || !state || reloadRequired() || !validSession(session) || !local || yes(local.client_ready)) return;
        // A dropped message or reconnect can require another real handshake.
        // This timer never advances displayed resource progress or server flags.
        if (clock - lastHandshake >= 3 && send("survival_loading_client_ready")) lastHandshake = clock;
    }
    function retireArtwork() {
        if (artworkRetired) return;
        artworkRetired = true; imageGeneration++;
        // Engine phase wrappers can be composited again after their child was
        // hidden. Retire the actual image as well as the owned paint surface.
        // Late image callbacks must never repopulate that retired render layer.
        background.style.opacity = "0";
        background.SetImage("");
    }
    function render() {
        if (!valid()) return;
        var localId = playerId();
        // Real admission is one-way for this session. Keep the recovery poll
        // alive, but do not repaint an already retired, hidden loading page.
        // Unknown visibility falls back to the original writes; an external
        // wrapper reappearing is corrected on this poll, not after a timeout.
        if (artworkRetired && lastReportedVisible === false && validSession(session)
            && releasedSession === session && (localId < 0 || localId === releasedPlayer)) {
            var needsRepair = [root, layoutRoot, surface].some(function (panel) {
                return panel && panel.IsValid() && (panel.visible !== false
                    || panel.hittest !== false || panel.hittestchildren !== false);
            });
            if (needsRepair || clock - lastHiddenRepair >= 5) {
                lastHiddenRepair = clock; setVisible(false);
                root.SetHasClass("StartupLoadingImageReady", false);
                background.style.opacity = "0";
            }
            return;
        }
        var roster = players(), local = null, count = 0;
        roster.forEach(function (row) { if (row.player_id === localId) local = row; if (playerReady(row)) count++; });
        var late = lateJoin(), reload = reloadRequired();
        var failed = !!(state && (state.error || state.phase === "error" || (state.assets && state.assets.failed > 0)))
            || !!(local && local.status === "auth_error");
        var mineReady = assetsReady() && playerReady(local);
        // Admission is separate from mode-specific profile loading. Once admitted,
        // profile retries and setup changes must never reopen the loading screen.
        var admissionKnown = !!state && state.admission_complete !== undefined;
        var allReady = admissionKnown ? yes(state.admission_complete) && (localId < 0 || !!local)
            : mineReady && !failed && yes(state.all_ready) && roster.length > 0 && count === roster.length;
        // Server release is one-way for this session. A fresh phase can trust
        // its acknowledged client_ready; a missing image callback or temporary
        // player-ID/nettable gap must not reopen an already completed overlay.
        restoreCompletion(localId);
        if (allReady) {
            releasedSession = session; releasedPlayer = localId;
            var config = phaseConfig();
            if (config && localId >= 0) config.SurvivalStartupCompletion = {session_id: session, player_id: localId, admission_complete: admissionKnown};
        }
        // Preserve authoritative admission through missing phase snapshots.
        // Legacy all_ready-only completion has a bounded one-second grace.
        // A valid new session immediately overrides either presentation memo.
        var memo = completionMemo(localId);
        var awaitingSnapshot = !state && !validSession(session) && !!memo && (memo.admission_complete || clock < 1);
        // Native GameRules state queries are unsafe while a remote map creates
        // or tears down its client rules object. A JS catch cannot intercept a
        // native access violation. The authoritative snapshot and completion
        // memo already cover phase gaps without querying engine rule state.
        // Team selection and its Start button belong exclusively to Valve.
        // An unreplicated GameSetup/HUD context must not cover that screen.
        var nativeTeamSetup = !!state && (yes(state.native_team_setup) || state.phase === "team_setup");
        var hidden = released() || awaitingSnapshot || nativeTeamSetup || (!state && !nativeLoadingContext);
        if (hidden && released()) lastHiddenRepair = clock;
        if (hidden && released()) retireArtwork();
        else if (!hidden && artworkRetired) loadImage();
        setVisible(!hidden);
        root.SetHasClass("StartupLoadingImageReady", imageReady && !hidden && !artworkRetired);
        // ContextPanel can be an engine wrapper rather than the authored root.
        // Apply image visibility directly as well as through the theme class.
        background.style.opacity = !hidden && !artworkRetired && imageReady && !imageError ? "1" : "0";
        // Neither timers nor image events assert authenticated / server-ready.
        var progress = nativeTeamSetup ? 0 : personalProgress(local);
        $("#StartupLoadingProgressFill").style.width = progress.toFixed(1) + "%";
        $("#StartupLoadingPercent").text = Math.floor(progress) + "%";
        var showError = late || reload || imageError || failed || stateTimeout;
        $("#StartupLoadingErrorBox").SetHasClass("StartupLoadingHidden", !showError);
        root.SetHasClass("StartupLoadingHasError", showError);
        var errorMessages = {
            backend_connection_pending: "测试后端连接尚未就绪。主机请运行 setup_hammer_backend.cmd，检查助手状态后等待重试。",
            backend_authentication_failed: "服务端认证失败，请检查测试连接后重试。",
            profile_load_failed: "玩家档案读取失败，请检查连接后重试。",
            profile_load_timeout: "玩家档案读取超时，请重试。"
        };
        var preparationError = state && errorMessages[state.error] || "准备尚未完成，请重试。";
        $("#StartupLoadingError").text = late ? "本局已开始，请重新加入下一局。" :
            (reload ? "部分初始资源加载失败，请重新启动测试地图。" :
                (imageError ? "画面加载失败，请重试。" :
                    (stateTimeout && !failed ? "仍在等待游戏准备，请检查连接后重试。" : preparationError)));
        retryControl.button.SetHasClass("StartupLoadingHidden", late || reload);
        retryControl.button.enabled = !late && !reload && clock - lastRetry >= 2;
        maybeHandshake(local);
    }
    function accept(next) {
        if (!valid()) return;
        if (!next || typeof next !== "object" || !validSession(next.session_id)) {
            // Absence during a phase transition is not a new game. Keep the
            // last server snapshot; only a new valid session resets completion.
            render(); return;
        }
        if (next.session_id !== session) {
            session = next.session_id; lastHandshake = -100; stateTimeout = false; stateGeneration++;
            releasedSession = ""; releasedPlayer = -1;
        }
        state = next; render();
    }
    function readState() {
        try {
            if (typeof CustomNetTables === "undefined" || !CustomNetTables.GetTableValue) return false;
            accept(CustomNetTables.GetTableValue("survival_loading", "state"));
            return true;
        } catch (ignored) { return false; }
    }
    function waitForState() {
        var generation = ++stateGeneration;
        $.Schedule(20, function () {
            if (!valid() || generation !== stateGeneration || state) return;
            stateTimeout = true; render();
        });
    }
    function loadImage() {
        var generation = ++imageGeneration;
        artworkRetired = false;
        imageReady = false; imageError = false;
        background.SetImage(imagePath);
        $.Schedule(15, function () {
            if (!valid() || generation !== imageGeneration || imageReady) return;
            imageError = true; render();
        });
    }
    function imageLoaded() {
        if (!valid() || artworkRetired) return;
        imageReady = true; imageError = false; render();
        $.Schedule(0.1, function () { diagnostic("image_loaded"); });
    }
    function imageFailed() {
        if (!valid() || artworkRetired) return;
        imageReady = false; imageError = true; render();
    }
    function retry() {
        if (!valid() || released() || lateJoin() || reloadRequired() || clock - lastRetry < 2) return;
        lastRetry = clock; lastHandshake = -100; stateTimeout = false;
        if (imageError || !imageReady) loadImage();
        send("survival_loading_retry");
        waitForState(); readState(); render();
    }
    function poll() {
        if (!valid()) {
            disposed = true;
            try { if (tableSubscription !== null) CustomNetTables.UnsubscribeNetTableListener(tableSubscription); } catch (ignored) {}
            return;
        }
        clock += 0.5;
        // Refresh available game IDs and actual nettable state across loading,
        // GameSetup and HUD contexts. No countdown or synthetic percent exists.
        // accept() already renders a received/missing state. Preserve the
        // recovery render only if the table/API read could not be attempted.
        if (!readState()) render(); $.Schedule(0.5, poll);
    }
    retryControl.button.SetPanelEvent("onactivate", retry);
    $.RegisterEventHandler("ImageLoaded", background, imageLoaded);
    $.RegisterEventHandler("ImageFailedLoad", background, imageFailed);
    try {
        if (typeof CustomNetTables !== "undefined") {
            tableSubscription = CustomNetTables.SubscribeNetTableListener("survival_loading", function (table, key, value) {
                if (key === "state") accept(value);
            });
        }
    } catch (ignored) {}
    waitForState(); readState(); if (!artworkRetired) loadImage(); render(); $.Schedule(0.5, poll);
    $.Schedule(1, function () { diagnostic("layout_ready"); });
})();
