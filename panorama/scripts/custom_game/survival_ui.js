(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_ui_state";
    var tableKey = "player_" + playerId;
    var lastSequence = -1;
    var lastSnapshotAt = 0;
    var difficultyRequestPending = false;
    var difficultyOptionsSignature = "";
    var difficultyWave = null, difficultyChoice = "", difficultyRows = {};
    var difficultyModal = null, difficultyConfirm = null, difficultyRequestSerial = 0;
    var startupState = null, setupSession = "", modeChoice = "", modeAcknowledged = "";
    var modePending = false, modeError = "", modeRequestSerial = 0, modeSignature = "", modeRows = {};
    var profileRetry = null, profileRetryPending = false, profileRetrySerial = 0, profileErrorShown = false;
    var initialBuilderSelectionFinished = false;
    var initialBuilderSelectionSerial = 0;

    var waveStatusText = {
        dev_mode: "准备阶段",
        waiting: "准备阶段",
        selecting_difficulty: "选择难度",
        countdown: "准备阶段",
        spawning: "生成阶段",
        fighting: "战斗阶段",
        active: "战斗阶段",
        finished: "已结束",
        all_waves_spawned: "清场阶段"
    };

    function panel(id) {
        return $("#" + id);
    }

    function setText(id, value) {
        var target = panel(id);
        if (target) target.text = String(value);
    }

    function numberValue(value) {
        var number = Number(value || 0);
        if (Math.abs(number - Math.round(number)) < 0.001) return String(Math.round(number));
        return number.toFixed(1).replace(/\.0$/, "");
    }

    function compactNumber(value) {
        var number = Number(value || 0);
        var sign = number < 0 ? "-" : "";
        var absolute = Math.abs(number);
        if (absolute >= 100000000) return sign + (absolute / 100000000).toFixed(2) + "亿";
        if (absolute >= 10000) return sign + (absolute / 10000).toFixed(2) + "万";
        return numberValue(number);
    }

    function sequenceOf(snapshot) {
        var sequence = Number(snapshot && snapshot.sequence);
        return isNaN(sequence) ? -1 : sequence;
    }

    function isDifficultySelected(wave) {
        return wave && (wave.difficulty_selected === true
            || Number(wave.difficulty_selected || 0) === 1);
    }

    function optionArray(options) {
        if (!options) return [];
        if (Array.isArray(options)) return options;
        return Object.keys(options).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return options[key]; });
    }

    function yes(value) { return value === true || value === 1; }
    function setup() { return startupState && startupState.setup; }
    function admissionComplete() {
        if (!startupState) return !setupSession; // Old HUD snapshots have no admission state.
        return startupState.admission_complete !== undefined ? yes(startupState.admission_complete) : yes(startupState.all_ready);
    }
    function confirmedMode() {
        if (setup()) return yes(setup().mode_selected) ? setup().mode_id : modeAcknowledged;
        return difficultyWave && (difficultyWave.mode_selected === undefined || yes(difficultyWave.mode_selected))
            ? difficultyWave.game_mode || "standard" : "";
    }
    function needsMode() { return !!setup() && !confirmedMode(); }
    function modeSelector() {
        return !!setup() && Game.GetLocalPlayerID() >= 0 && Game.GetLocalPlayerID() === Number(setup().selector_player_id);
    }
    function modeOptions() {
        var seen = {};
        return optionArray(setup() && setup().mode_options).filter(function (option) {
            if (!option || (option.mode_id !== "pure" && option.mode_id !== "standard") || seen[option.mode_id]) return false;
            seen[option.mode_id] = true; return true;
        });
    }
    function acceptStartup(next) {
        if (!next || typeof next.session_id !== "string" || !next.session_id) return;
        if (setupSession !== next.session_id) {
            setupSession = next.session_id; modeChoice = ""; modeAcknowledged = "";
            modePending = false; modeError = ""; modeRequestSerial++;
            difficultyChoice = ""; difficultyRequestPending = false; difficultyRequestSerial++;
            profileRetryPending = false; profileRetrySerial++;
        }
        startupState = next;
        renderDifficultySelection(difficultyWave);
    }
    function readStartup() { acceptStartup(CustomNetTables.GetTableValue("survival_loading", "state")); }
    function confirmMode() {
        if (!admissionComplete() || !needsMode() || !modeSelector() || modePending || !setupSession
            || !modeOptions().some(function (option) { return option.mode_id === modeChoice; })) return;
        modePending = true; modeError = "正在确认模式……";
        var serial = ++modeRequestSerial, requestedSession = setupSession;
        GameEvents.SendCustomGameEventToServer("survival_loading_mode_select", {session_id: setupSession, mode_id: modeChoice});
        renderDifficultySelection(difficultyWave);
        $.Schedule(12, function () {
            if (serial !== modeRequestSerial || requestedSession !== setupSession || !modePending || !needsMode()) return;
            modePending = false; modeError = "确认尚未完成，请检查连接后重试。";
            renderDifficultySelection(difficultyWave);
        });
    }
    function handleModeResult(payload) {
        if (!modePending || !needsMode() || payload && payload.session_id && payload.session_id !== setupSession) return;
        if (payload && yes(payload.success) && payload.mode_id === modeChoice) {
            // A successful server acknowledgement moves this same dialog to
            // difficulty immediately; it never asserts profile readiness.
            modeAcknowledged = payload.mode_id; modePending = false; modeError = ""; modeRequestSerial++;
            renderDifficultySelection(difficultyWave); readStartup(); requestSnapshot(); return;
        }
        modePending = false; modeRequestSerial++;
        var messages = {selection_not_host: "由房主统一选择本局模式。", mode_selector_required: "由房主统一选择本局模式。",
            mode_locked: "本局模式已经确认，正在刷新状态。", invalid_mode: "该模式不可用，请重新选择。",
            mode_not_found: "该模式不可用，请重新选择。", match_session_mismatch: "游戏状态已更新，请等待刷新后重试。",
            session_mismatch: "游戏状态已更新，请等待刷新后重试。", startup_not_ready: "入场准备尚未完成，请稍候。"};
        modeError = messages[payload && payload.error] || "模式确认失败，请重试。";
        readStartup(); renderDifficultySelection(difficultyWave);
    }
    function renderModeChoice(ui) {
        var options = modeOptions(), selector = modeSelector();
        if (!options.some(function (option) { return option.mode_id === modeChoice; })) modeChoice = "";
        var signature = JSON.stringify(options);
        if (signature !== modeSignature) {
            modeSignature = signature; modeRows = {}; panel("MatchModeOptions").RemoveAndDeleteChildren();
            options.forEach(function (option) {
                var button = $.CreatePanel("Button", panel("MatchModeOptions"), ""); button.AddClass("MatchModeOption"); button.hittestchildren = false;
                var name = $.CreatePanel("Label", button, ""); name.AddClass("MatchModeOptionName"); name.html = false;
                name.text = option.display_name || (option.mode_id === "pure" ? "纯净模式" : "常规模式");
                var description = $.CreatePanel("Label", button, ""); description.AddClass("MatchModeOptionDescription"); description.html = false;
                description.text = option.description || "";
                ui.State.Bind(button, function () {
                    if (!needsMode() || !modeSelector() || modePending) return;
                    modeChoice = option.mode_id; modeError = ""; renderDifficultySelection(difficultyWave);
                });
                modeRows[option.mode_id] = button;
            });
        }
        options.forEach(function (option) { ui.State.Set(modeRows[option.mode_id], {selected: option.mode_id === modeChoice, enabled: selector && !modePending}); });
        var selected = options.filter(function (option) { return option.mode_id === modeChoice; })[0];
        setText("DifficultySelectionTitle", "模式选择");
        setText("DifficultySelectionMode", "选择模式  ·  选择难度");
        setText("DifficultySelectionHint", selector ? "请选择本局模式，确认后立即选择难度" : "等待房主统一选择本局模式");
        setText("DifficultySelectionCurrent", "当前选择：" + (selected ? selected.display_name || selected.mode_id : "尚未选择"));
        setText("DifficultySelectionError", modeError);
        ui.State.Set(difficultyConfirm, {enabled: selector && !!selected && !modePending, busy: modePending});
    }
    function difficultyUnlocked(option) { return !!option && (option.unlocked === true || Number(option.unlocked) === 1); }
    function difficultySelector() {
        var id = Game.GetLocalPlayerID();
        var selector = setup() ? setup().selector_player_id : difficultyWave && difficultyWave.selector_player_id;
        return id >= 0 && selector !== undefined && id === Number(selector);
    }
    function difficultyAvailable() {
        return admissionComplete() && !!confirmedMode() && (!difficultyWave || !isDifficultySelected(difficultyWave))
            && (!!setup() || difficultyWave && difficultyWave.status === "selecting_difficulty");
    }
    function canConfirmDifficulty() {
        if (startupState && startupState.profiles_ready !== undefined) return yes(startupState.profiles_ready);
        if (difficultyWave && difficultyWave.can_confirm_difficulty !== undefined) return yes(difficultyWave.can_confirm_difficulty);
        if (difficultyWave && difficultyWave.profile_ready !== undefined) return yes(difficultyWave.profile_ready);
        return true;
    }
    function renderProfileError(ui) {
        var code = setup() && setup().error;
        var messages = {backend_authentication_failed: "服务端认证失败，请检查测试连接后重试。",
            profile_load_failed: "玩家档案读取失败，请重试。", profile_load_timeout: "玩家档案读取超时，请重试。",
            player_disconnected: "等待其他玩家重新连接后完成准备。", player_identity_changed: "玩家身份发生变化，请重新加入本局。"};
        var text = !canConfirmDifficulty() && code ? messages[code] || "玩家档案暂未准备完成，请重试。" : "";
        var retryable = !!text && code !== "player_disconnected" && code !== "player_identity_changed";
        panel("MatchSetupRetryHost").visible = retryable;
        if (text) setText("DifficultySelectionError", text);
        else if (profileErrorShown && !difficultyRequestPending) setText("DifficultySelectionError", "");
        profileErrorShown = !!text;
        if (!profileRetry && retryable) profileRetry = ui.ActionButton(panel("MatchSetupRetryHost"), {
            id: "MatchSetupRetry", label: "重试读取档案", enabled: true, action: function () {
                if (profileRetryPending || !setupSession || !setup() || !setup().error || canConfirmDifficulty()) return;
                profileRetryPending = true; var serial = ++profileRetrySerial;
                GameEvents.SendCustomGameEventToServer("survival_loading_retry", {session_id: setupSession});
                renderProfileError(ui);
                $.Schedule(5, function () {
                    if (serial !== profileRetrySerial) return;
                    profileRetryPending = false; renderDifficultySelection(difficultyWave);
                });
            }});
        if (profileRetry) ui.State.Set(profileRetry, {enabled: retryable && !profileRetryPending, busy: profileRetryPending});
    }
    function selectedDifficulty() {
        return difficultyOptions().filter(function (option) {
            return option && String(option.difficulty_id) === difficultyChoice && difficultyUnlocked(option);
        })[0];
    }
    function difficultyOptions() {
        var source = setup() && setup().difficulty_options;
        return optionArray(source || difficultyWave && difficultyWave.difficulty_options);
    }
    function refreshDifficultyChoice() {
        var ui = GameUI.CustomUIConfig().SurvivalUI;
        var selected = selectedDifficulty();
        if (!selected) difficultyChoice = "";
        Object.keys(difficultyRows).forEach(function (id) {
            var row = difficultyRows[id];
            ui.State.Set(row.button, {selected: id === difficultyChoice,
                enabled: difficultySelector() && difficultyUnlocked(row.option) && !difficultyRequestPending});
            row.availability.text = !difficultyUnlocked(row.option) ? row.option.unlock_hint || "通关前一级难度解锁"
                : (id === difficultyChoice ? "已选择" : "可选择");
        });
        setText("DifficultySelectionCurrent", "当前选择：" + (selected ? selected.difficulty_id : "尚未选择"));
        if (difficultyConfirm) ui.State.Set(difficultyConfirm, {enabled: difficultyAvailable()
            && canConfirmDifficulty() && difficultySelector() && !!selected && !difficultyRequestPending, busy: difficultyRequestPending});
    }
    function selectDifficulty() {
        var selected = selectedDifficulty();
        if (!difficultyAvailable() || !canConfirmDifficulty() || !difficultySelector() || difficultyRequestPending || !selected) return;
        difficultyRequestPending = true;
        var serial = ++difficultyRequestSerial;
        var overlay = panel("DifficultySelectionOverlay");
        if (overlay) overlay.SetHasClass("DifficultyPending", true);
        setText("DifficultySelectionError", "正在确认难度……");
        GameEvents.SendCustomGameEventToServer("ui_difficulty_select_request", {
            difficulty_id: String(selected.difficulty_id)
        });
        refreshDifficultyChoice();
        $.Schedule(12, function () {
            if (serial !== difficultyRequestSerial || !difficultyRequestPending || !difficultyAvailable()) return;
            difficultyRequestPending = false;
            overlay.SetHasClass("DifficultyPending", false);
            setText("DifficultySelectionError", "确认尚未完成，请检查连接后重试。");
            refreshDifficultyChoice(); requestSnapshot();
        });
    }

    function renderDifficultySelection(wave) {
        var overlay = panel("DifficultySelectionOverlay");
        var container = panel("DifficultySelectionButtons");
        if (!overlay || !container) return;
        difficultyWave = wave;
        var choosingMode = needsMode(), shouldShow = admissionComplete() && (choosingMode || difficultyAvailable());
        overlay.SetHasClass("DifficultySelectionHidden", !shouldShow);
        if (!shouldShow) {
            difficultyRequestPending = false;
            overlay.SetHasClass("DifficultyPending", false);
            if (difficultyModal && difficultyModal.IsOpen()) difficultyModal.Close();
            return;
        }
        var ui = GameUI.CustomUIConfig().SurvivalUI;
        if (!ui) { setText("DifficultySelectionError", "正在准备选择界面……"); return; }
        if (!difficultyModal) {
            difficultyModal = ui.ModalShell.Adopt({id: "survival_difficulty", panel: panel("DifficultySelectionDialog"),
                header: panel("DifficultySelectionHeader"), titlePanel: panel("DifficultySelectionTitle"),
                scrim: overlay, root: $.GetContextPanel(), width: 1100, height: 820, closePolicy: "mandatory"});
            difficultyConfirm = ui.ActionButton(panel("DifficultySelectionConfirmHost"), {
                id: "DifficultySelectionConfirm", variant: "gold", label: "确认选择", enabled: false,
                action: function () { if (needsMode()) confirmMode(); else selectDifficulty(); }});
        }
        if (!difficultyModal.IsOpen()) difficultyModal.Open();
        var wasChoosingMode = panel("MatchModeOptions").visible;
        panel("MatchModeOptions").visible = choosingMode;
        container.visible = !choosingMode;
        if (choosingMode) { panel("MatchSetupRetryHost").visible = false; renderModeChoice(ui); return; }
        setText("DifficultySelectionTitle", "难度选择");
        setText("DifficultySelectionMode", (confirmedMode() === "pure" ? "纯净模式" : "常规模式") + "  ·  请选择难度");
        setText("DifficultySelectionHint", !difficultySelector() ? "等待房主统一选择本局难度" :
            (canConfirmDifficulty() ? "选中难度后点击确认，本局将无法更改" : "可以先选择难度，玩家档案准备完成后即可确认"));
        if (wasChoosingMode) setText("DifficultySelectionError", "");
        var options = difficultyOptions().filter(function (option) {
            return option && /^N(?:[1-9]|10)$/.test(String(option.difficulty_id));
        }).sort(function (a, b) { return Number(a.difficulty_id.slice(1)) - Number(b.difficulty_id.slice(1)); });
        var signature = JSON.stringify(options);
        if (signature !== difficultyOptionsSignature) {
            difficultyOptionsSignature = signature; difficultyRows = {};
            container.RemoveAndDeleteChildren();
            options.forEach(function (option) {
            var button = $.CreatePanel("Button", container, "");
            button.AddClass("DifficultyOptionButton"); button.hittestchildren = false;
            button.SetHasClass("DifficultyOptionLocked", !difficultyUnlocked(option));
            var header = $.CreatePanel("Panel", button, "");
            header.AddClass("DifficultyOptionHeader");
            var diamond = $.CreatePanel("Panel", header, ""); diamond.AddClass("DifficultyOptionDiamond");
            var code = $.CreatePanel("Label", header, ""); code.AddClass("DifficultyOptionCode"); code.html = false;
            code.text = String(option.difficulty_id);
            var availability = $.CreatePanel("Label", header, ""); availability.AddClass("DifficultyOptionAvailability"); availability.html = false;
            difficultyRows[option.difficulty_id] = {button: button, option: option, availability: availability};
            ui.State.Bind(button, function () {
                if (!difficultyAvailable() || !difficultySelector() || difficultyRequestPending || !difficultyUnlocked(option)) return;
                difficultyChoice = String(option.difficulty_id);
                setText("DifficultySelectionError", ""); refreshDifficultyChoice();
            });
            });
            if (options.length === 0) {
                var loading = $.CreatePanel("Label", container, "DifficultySelectionLoading");
                loading.text = "正在读取难度配置……";
            }
        }
        refreshDifficultyChoice();
        renderProfileError(ui);
    }

    function update(snapshot) {
        if (!snapshot) return;
        var sequence = sequenceOf(snapshot);
        // NetTable 轮询会反复读到同一快照；没有新 sequence 时不重写整套
        // HUD，也不重新安装 hover 回调，避免形成固定间隔的客户端卡顿。
        if (sequence >= 0 && sequence <= lastSequence) return;
        if (sequence >= 0) lastSequence = sequence;
        lastSnapshotAt = Game.GetGameTime();

        var resources = snapshot.resources || {};
        var wave = snapshot.wave || {};
        renderDifficultySelection(wave);
        setText("WoodValue", compactNumber(resources.wood));
        setText("GoldValue", compactNumber(resources.gold));
        setText("PopulationValue", compactNumber(resources.population) + "/" + compactNumber(resources.max_population));
        setText("CityLevelValue", "Lv." + numberValue(snapshot.city_level));
        var unlocks = {
            shop: Number(snapshot.shop_unlocked || 0) === 1
        };
        GameUI.CustomUIConfig().SurvivalShopUnlocks = unlocks;
        var shopButton = panel("CustomShopButton");
        if (shopButton) shopButton.SetHasClass("Locked", !unlocks.shop);
        var shopApi = GameUI.CustomUIConfig().SurvivalShop;
        if (shopApi && shopApi.SetUnlocks) shopApi.SetUnlocks(unlocks);
        var resourceTooltip = "木材 " + numberValue(resources.wood) + "\n金币 " + numberValue(resources.gold)
            + "\n人口 " + numberValue(resources.population) + "/" + numberValue(resources.max_population);
        ["WoodField", "GoldField", "PopulationField"].forEach(function (fieldId) {
            var field = panel(fieldId);
            if (field) field.__survivalResourceTooltipText = resourceTooltip;
            if (field && !field.__survivalResourceTooltipBound) {
                field.__survivalResourceTooltipBound = true;
                field.SetPanelEvent("onmouseover", function () {
                    $.DispatchEvent(
                        "DOTAShowTextTooltip",
                        field,
                        field.__survivalResourceTooltipText || ""
                    );
                });
                field.SetPanelEvent("onmouseout", function () {
                    $.DispatchEvent("DOTAHideTextTooltip");
                });
            }
        });
        setText(
            "WaveNumber",
            (isDifficultySelected(wave)
                ? String(wave.difficulty_id || "N1") + " · " : "")
                + "波次 " + numberValue(wave.current_wave)
                + "/" + numberValue(wave.total_waves || 30)
        );
        var phase = waveStatusText[wave.status] || "准备阶段";
        setText("WaveState", phase);
        setText("WaveTimer", "倒计时 " + Math.max(0, Math.ceil(Number(wave.timer || 0))) + "秒");
        setText("AliveValue", "存活 " + numberValue(wave.alive));
        setText("PendingValue", "待生成 " + numberValue(wave.pending));
    }

    function handleDifficultyResult(payload) {
        if (payload && Number(payload.success || 0) === 1) {
            setText("DifficultySelectionError", "难度已确认，正在开始……");
            requestSnapshot();
            return;
        }
        difficultyRequestPending = false;
        difficultyRequestSerial++;
        var overlay = panel("DifficultySelectionOverlay");
        if (overlay) overlay.SetHasClass("DifficultyPending", false);
        var messages = {
            difficulty_locked: "本局难度已经锁定，正在刷新状态。",
            difficulty_selector_required: "由房主统一选择本局难度。",
            selection_not_host: "由房主统一选择本局难度。",
            difficulty_not_unlocked: "尚未解锁该难度，请先通关前一级。",
            difficulty_progress_locked: "尚未解锁该难度，请先通关前一级。",
            player_not_ready: "游戏准备尚未完成，请稍候再试。",
            startup_not_ready: "游戏准备尚未完成，请稍候再试。",
            profile_not_loaded: "玩家档案尚未就绪，请稍候再试。",
            mode_not_selected: "请先确认本局游戏模式。",
            difficulty_not_found: "该难度不可用，请重新选择。"
        };
        var errorText = messages[payload && payload.error] || "难度选择失败，请重试";
        setText("DifficultySelectionError", errorText);
        if (GameUI.CustomUIConfig().SurvivalUI) refreshDifficultyChoice();
        requestSnapshot();
    }

    function readSnapshot() {
        update(CustomNetTables.GetTableValue(tableName, tableKey));
    }

    function requestSnapshot() {
        GameEvents.SendCustomGameEventToServer("ui_request_full_snapshot", {
            request_id: "hud_" + String(Date.now())
        });
    }

    function pollSnapshot() {
        readStartup();
        readSnapshot();
        if (!initialBuilderSelectionFinished) {
            recoverInitialBuilderSelection("hud_poll", 20, initialBuilderSelectionSerial);
        }
        if (Game.GetGameTime() - lastSnapshotAt > 2.0) requestSnapshot();
        $.Schedule(0.25, pollSnapshot);
    }

    function showNotification(payload) {
        var container = panel("NotificationContainer");
        if (!container) return;
        var item = $.CreatePanel("Panel", container, "");
        item.AddClass("Notification");
        if (payload.level === "error") item.AddClass("error");
        var label = $.CreatePanel("Label", item, "");
        label.text = payload.message || "";
        $.Schedule(3.0, function () {
            if (item && item.IsValid()) item.DeleteAsync(0);
        });
    }

    function sendClientDiagnostic(stage, payload) {
        var data = payload || {};
        data.stage = stage;
        GameEvents.SendCustomGameEventToServer("ui_client_diagnostic", data);
    }

    function setCameraPosition(position) {
        if (!position || typeof GameUI.SetCameraTargetPosition !== "function") {
            return "api_unavailable";
        }
        try {
            GameUI.SetCameraTargetPosition(position, 0.0);
            return "target_position";
        } catch (error) {
            return "api_error:" + String(error);
        }
    }

    function focusHeroWithoutLock(payload) {
        if (!payload) return;
        var entindex = Number(payload.entindex || payload.focus_hero_entindex || -1);
        if (entindex <= 0) return;
        var x = Number(payload.target_x !== undefined
            ? payload.target_x : payload.focus_target_x);
        var y = Number(payload.target_y !== undefined
            ? payload.target_y : payload.focus_target_y);
        var z = Number(payload.target_z !== undefined
            ? payload.target_z : payload.focus_target_z);
        var hasTarget = isFinite(x) && isFinite(y) && isFinite(z);
        var finalPosition = hasTarget ? [x, y, z] : null;
        if (!finalPosition && Entities.IsValidEntity(entindex)) {
            finalPosition = Entities.GetAbsOrigin(entindex);
        }
        var cameraResult = "api_unavailable";
        if (typeof GameUI.MoveCameraToEntity === "function") {
            try {
                GameUI.MoveCameraToEntity(entindex);
                cameraResult = "move_to_entity";
            } catch (error) {
                cameraResult = "move_to_entity_error:" + String(error);
            }
        }
        if (cameraResult !== "move_to_entity") cameraResult = setCameraPosition(finalPosition);
        sendClientDiagnostic("camera_follow_settled", {
            entindex: entindex,
            reason: "non_locking_focus",
            target: finalPosition ? finalPosition.join(",") : "unavailable",
            move_camera_api: typeof GameUI.MoveCameraToEntity,
            camera_api: typeof GameUI.SetCameraTargetPosition,
            camera_result: cameraResult
        });
        $.Msg("[SURVIVAL_CAMERA] NON_LOCKING_FOCUS entindex=", String(entindex),
            " target=", finalPosition ? finalPosition.join(",") : "unavailable",
            " camera=", cameraResult);
    }

    function validUnit(unit) {
        return isFinite(Number(unit)) && Number(unit) >= 0
            && Entities.IsValidEntity(Number(unit));
    }

    function selectedEntities() {
        var selected = [];
        try { selected = Players.GetSelectedEntities(playerId) || []; } catch (error) {}
        if (Array.isArray(selected)) return selected.map(Number).filter(validUnit);
        return Object.keys(selected).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return Number(selected[key]); }).filter(validUnit);
    }

    function recoverInitialBuilderSelection(reason, attempt, serial) {
        if (initialBuilderSelectionFinished || serial !== initialBuilderSelectionSerial) return;
        var identity = CustomNetTables.GetTableValue(
            "survival_builder_identity", "player_" + String(playerId)
        ) || {};
        var builder = Number(identity.entindex);
        if (!validUnit(builder)) {
            if (attempt < 20) {
                $.Schedule(0.10, function () {
                    recoverInitialBuilderSelection(reason, attempt + 1, serial);
                });
            }
            return;
        }

        var selected = selectedEntities();
        var portrait = -1;
        try { portrait = Number(Players.GetLocalPlayerPortraitUnit()); } catch (error) {}
        if (selected.indexOf(builder) >= 0 || portrait === builder) {
            focusHeroWithoutLock({ entindex: builder });
            initialBuilderSelectionFinished = true;
            $.Msg("[SURVIVAL_SELECTION] INITIAL_BUILDER_READY reason=", reason,
                " action=already_selected builder=", String(builder));
            return;
        }

        var hasNonPlaceholderSelection = selected.some(function (unit) {
            return (Entities.GetUnitName(unit) || "") !== "npc_dota_hero_undying";
        });
        var portraitName = validUnit(portrait) ? (Entities.GetUnitName(portrait) || "") : "";
        if (hasNonPlaceholderSelection
            || (validUnit(portrait) && portraitName !== "npc_dota_hero_undying")) {
            initialBuilderSelectionFinished = true;
            $.Msg("[SURVIVAL_SELECTION] INITIAL_BUILDER_READY reason=", reason,
                " action=preserve_player_selection builder=", String(builder),
                " selected=", selected.join(","), " portrait=", String(portrait),
                " portrait_name=", portraitName);
            return;
        }

        GameUI.SelectUnit(builder, false);
        focusHeroWithoutLock({ entindex: builder });
        initialBuilderSelectionFinished = true;
        $.Msg("[SURVIVAL_SELECTION] INITIAL_BUILDER_READY reason=", reason,
            " action=select_builder builder=", String(builder),
            " selected=", selected.join(","), " portrait=", String(portrait),
            " portrait_name=", portraitName);
    }

    function scheduleInitialBuilderSelection(reason) {
        if (initialBuilderSelectionFinished) return;
        var serial = ++initialBuilderSelectionSerial;
        recoverInitialBuilderSelection(String(reason || "unknown"), 0, serial);
    }

    CustomNetTables.SubscribeNetTableListener(tableName, function (name, key, value) {
        if (key === tableKey) update(value);
    });
    CustomNetTables.SubscribeNetTableListener("survival_loading", function (name, key, value) {
        if (key === "state") acceptStartup(value);
    });
    CustomNetTables.SubscribeNetTableListener(
        "survival_builder_identity", function (name, key) {
            if (key === "player_" + String(playerId)) {
                scheduleInitialBuilderSelection("identity_update");
            }
        }
    );
    GameEvents.Subscribe("survival_ui_private_snapshot", update);
    GameEvents.Subscribe("ui_state_snapshot", update);

    GameEvents.Subscribe("ui_notification", showNotification);
    GameEvents.Subscribe("ui_difficulty_select_result", handleDifficultyResult);
    GameEvents.Subscribe("survival_loading_mode_result", handleModeResult);
    GameEvents.Subscribe("ui_camera_follow_hero", focusHeroWithoutLock);
    GameEvents.Subscribe("survival_select_unit", function (data) {
        if (data && data.reason === "builder_ready") {
            scheduleInitialBuilderSelection("builder_ready");
            return;
        }
        var entindex = Number(data && data.entindex);
        if (entindex >= 0 && Entities.IsValidEntity(entindex)) {
            GameUI.SelectUnit(entindex, false);
            initialBuilderSelectionFinished = true;
            $.Msg("[SURVIVAL_SELECTION] INITIAL_BUILDER_READY reason=event",
                " action=select_builder builder=", String(entindex));
        }
    });
    GameUI.CustomUIConfig().SurvivalCamera = {
        FocusHeroWithoutLock: focusHeroWithoutLock
    };
    sendClientDiagnostic("hud_ready", {
        camera_api: typeof GameUI.SetCameraTargetPosition,
        move_camera_api: typeof GameUI.MoveCameraToEntity
    });

    $.Msg("[SurvivalUI] realtime HUD listener ready.");
    scheduleInitialBuilderSelection("hud_ready");
    $.Schedule(0.10, function () {
        readStartup();
        readSnapshot();
        requestSnapshot();
        pollSnapshot();
    });
})();
