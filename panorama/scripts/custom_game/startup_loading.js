(function () {
    "use strict";
    var root = $.GetContextPanel();
    var background = $("#StartupLoadingBackground");
    var surface = $("#StartupLoadingSurface");
    // Some phases use an engine-owned ContextPanel around the authored root.
    var layoutRoot = surface && surface.GetParent ? surface.GetParent() : background.GetParent ? background.GetParent() : root;
    surface = surface || layoutRoot;
    var imagePath = "file://{images}/custom_game/loading/server_loading_background.png";
    var state = null, session = "", imageReady = false, imageError = false, stateTimeout = false;
    var imageGeneration = 0, stateGeneration = 0, lastHandshake = -100, lastRetry = -100;
    var clock = 0, disposed = false, tableSubscription = null;
    var rosterSignature = "", rows = {};
    var nativePanels = [], diagnostics = {};
    var releasedSession = "", releasedPlayer = -1;
    var lastReportedVisible = false;
    var artworkRetired = false;

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
    var partyControl = ensureButton("StartupPartyStart", $("#StartupLoadingFooter"),
        "StartupPartyStart", "StartupPartyStartText", "等待房主开始");
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
    function contains(panel, child) {
        for (var depth = 0; child && depth < 32; depth++, child = parentOf(child)) if (panel === child) return true;
        return false;
    }
    function nativeSetupVisibility(blocked) {
        // Valve's team selection is a sibling above the addon loading layer.
        // Only suppress its verified setup controls, never the HUD or escape menu.
        var ids = ["TeamSelectContainer", "TeamsList", "GameAndPlayersRoot"];
        var ancestor = parentOf(root), depth = 0;
        while (blocked && ancestor && depth++ < 16) {
            ids.forEach(function (id) {
                var panel = ancestor.FindChildTraverse ? ancestor.FindChildTraverse(id) : null;
                if (!panel || !panel.IsValid() || contains(panel, root)) return;
                var known = nativePanels.some(function (record) { return record.panel === panel; });
                if (!known) nativePanels.push({panel: panel, visible: panel.visible !== false});
                panel.visible = false;
            });
            ancestor = parentOf(ancestor);
        }
        if (!blocked) {
            nativePanels.forEach(function (record) { if (record.panel.IsValid()) record.panel.visible = record.visible; });
            nativePanels = [];
        }
    }
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
            nativeHidden: nativePanels.map(function (record) { return record.panel.id; })}));
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
    function nickname(player) {
        // The server already owns the roster. Loading panels must not query
        // native client player records before their replication has completed.
        if (typeof player.player_name === "string" && player.player_name.length)
            return player.player_name.replace(/[\x00-\x1f\x7f]/g, " ").slice(0, 64);
        return "玩家 " + (player.player_id + 1);
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
    function statusText(row) {
        if (row.status === "party_waiting") return "已加入";
        if (row.status === "connecting_backend") return "连接测试后端中";
        if (row.status === "disconnected") return "等待重新连接";
        if (row.status === "auth_error") return "需要重试";
        return playerReady(row) ? "已就绪" : "加载中……";
    }
    function renderPlayers(roster, local) {
        var signature = roster.map(function (p) { return p.player_id; }).join(",");
        if (signature !== rosterSignature) {
            $("#StartupLoadingPlayers").RemoveAndDeleteChildren(); rows = {}; rosterSignature = signature;
            roster.forEach(function (p) {
                var line = $.CreatePanel("Panel", $("#StartupLoadingPlayers"), ""); line.AddClass("StartupLoadingPlayer");
                var mark = $.CreatePanel("Panel", line, ""); mark.AddClass("StartupLoadingPlayerMark");
                var name = $.CreatePanel("Label", line, ""); name.AddClass("StartupLoadingPlayerName"); name.html = false;
                var status = $.CreatePanel("Label", line, ""); status.AddClass("StartupLoadingPlayerState"); status.html = false;
                rows[p.player_id] = {line: line, name: name, status: status};
            });
        }
        roster.forEach(function (p) {
            var row = rows[p.player_id];
            row.name.text = nickname(p) + (p.player_id === local ? "（你）" : "");
            row.status.text = statusText(p);
            row.line.SetHasClass("StartupLoadingPlayerReady", playerReady(p));
            row.line.SetHasClass("StartupLoadingPlayerLocal", p.player_id === local);
            row.line.SetHasClass("StartupLoadingPlayerFailed", p.status === "auth_error" || p.status === "disconnected");
        });
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
        var roster = players(), localId = playerId(), local = null, count = 0;
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
        var hidden = released() || awaitingSnapshot;
        if (hidden && released()) retireArtwork();
        else if (!hidden && artworkRetired) loadImage();
        setVisible(!hidden);
        root.SetHasClass("StartupLoadingImageReady", imageReady && !hidden && !artworkRetired);
        // ContextPanel can be an engine wrapper rather than the authored root.
        // Apply image visibility directly as well as through the theme class.
        background.style.opacity = !hidden && !artworkRetired && imageReady && !imageError ? "1" : "0";
        nativeSetupVisibility(!released());
        // Neither timers nor image events assert authenticated / server-ready.
        var party = !!state && state.phase === "party_waiting";
        var host = party && localId >= 0 && state.selector_player_id === localId;
        partyControl.button.SetHasClass("StartupLoadingHidden", !party);
        partyControl.button.enabled = host && !imageError && roster.length > 0;
        partyControl.label.text = host ? "队友到齐，开始加载" : "等待房主开始";
        var progress = party ? 0 : personalProgress(local);
        $("#StartupLoadingProgressFill").style.width = progress.toFixed(1) + "%";
        $("#StartupLoadingPercent").text = Math.floor(progress) + "%";
        $("#StartupLoadingStatus").text = party ? "组队等待 · 等待玩家加入" : late ? "本局已开始" :
            (reload ? "需要重新载入地图" : (mineReady && !failed ? "等待其他玩家" : "加载中……"));
        var detail = "正在准备游戏";
        if (party) detail = host ? "请先让队友连接本局，到齐后点击开始；单人也可直接开始。" : "已加入房间，等待房主开始加载。";
        else if (late) detail = "本局不支持中途加入";
        else if (reload) detail = "部分初始资源加载失败";
        else if (imageError) detail = "加载画面尚未准备完成";
        else if (state && state.phase === "connecting_backend") detail = "正在连接测试后端，请保持主机认证助手运行。";
        else if (failed) detail = "游戏准备暂时遇到问题";
        else if (mineReady) detail = "你的准备已完成，请稍候";
        else if (state && !assetsReady()) detail = "正在准备场景资源";
        else if (local && !yes(local.authenticated)) detail = "正在验证玩家身份";
        else if (state) detail = "正在完成准备";
        $("#StartupLoadingDetail").text = detail;
        $("#StartupLoadingReadyCount").text = party ? roster.length + " 人已加入" : roster.length ? count + " / " + roster.length + " 已就绪" : "等待玩家连接";
        var showError = late || reload || imageError || failed || stateTimeout;
        $("#StartupLoadingErrorBox").SetHasClass("StartupLoadingHidden", !showError);
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
        renderPlayers(roster, localId);
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
            if (typeof CustomNetTables === "undefined" || !CustomNetTables.GetTableValue) return;
            accept(CustomNetTables.GetTableValue("survival_loading", "state"));
        } catch (ignored) {}
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
        readState(); render(); $.Schedule(0.5, poll);
    }
    retryControl.button.SetPanelEvent("onactivate", retry);
    partyControl.button.SetPanelEvent("onactivate", function () {
        if (state && state.phase === "party_waiting" && state.selector_player_id === playerId())
            send("survival_party_start");
    });
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
