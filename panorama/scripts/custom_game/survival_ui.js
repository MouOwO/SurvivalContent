(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_ui_state";
    var tableKey = "player_" + playerId;
    var lastSequence = -1;
    var hasSnapshot = false, lastSnapshotReceiptAt = 0;
    var syncEpoch = 0, syncRequestSerial = 0, snapshotRequest = null;
    var retryFailures = 0, nextRetryAt = 0, recoveryUntil = Date.now() / 1000 + 30;
    var builderRecoveryUntil = recoveryUntil, builderRetryPending = false;
    var recoveryTask = null, startupSignature = "";
    var lifecycleConfig = GameUI.CustomUIConfig(), lifecycleContext = $.GetContextPanel();
    var disposed = false, scheduledJobs = [], subscriptions = [];
    var counters = {polls:0, startupReads:0, legacyReads:0, requests:0,
        requestCoalesced:0, retryTimeouts:0, received:0, applied:0, builderSteps:0};
    var previousSync = lifecycleConfig.SurvivalHUDSnapshotSync;
    if (previousSync && previousSync.Dispose) previousSync.Dispose();
    var syncAPI = {
        Inspect:function(){return {epoch:syncEpoch, session:setupSession, hasSnapshot:hasSnapshot,
            inFlight:!!snapshotRequest, retryFailures:retryFailures, recoveryScheduled:!!recoveryTask,
            builderPending:builderRetryPending, builderFinished:initialBuilderSelectionFinished,
            lastReceiptAt:lastSnapshotReceiptAt, disposed:disposed, counters:counters};},
        Dispose:function(){
            if (disposed) return;
            disposed = true;
            scheduledJobs.slice().forEach(cancelHUDJob);
            recoveryTask = null; snapshotRequest = null; builderRetryPending = false;
            subscriptions.forEach(function(item){
                try {
                    if (item.kind === "event" && GameEvents.Unsubscribe) GameEvents.Unsubscribe(item.id);
                    else if (item.kind === "table" && CustomNetTables.UnsubscribeNetTableListener)
                        CustomNetTables.UnsubscribeNetTableListener(item.id);
                } catch (error) {}
            });
            subscriptions = [];
            (notificationItems || []).forEach(function(item){
                if (item && item.IsValid && item.IsValid() && item.DeleteAsync) item.DeleteAsync(0);
            });
            if (profileRetryNotice && profileRetryNotice.IsValid && profileRetryNotice.IsValid()) profileRetryNotice.DeleteAsync(0);
        }
    };
    lifecycleConfig.SurvivalHUDSnapshotSync = syncAPI;
    function syncActive() {
        if (disposed || lifecycleConfig.SurvivalHUDSnapshotSync !== syncAPI) return false;
        try { return !lifecycleContext.IsValid || lifecycleContext.IsValid(); }
        catch (error) { return false; }
    }
    function cancelHUDJob(job) {
        if (!job || job.cancelled) return;
        job.cancelled = true;
        var index = scheduledJobs.indexOf(job);
        if (index >= 0) scheduledJobs.splice(index, 1);
        if (job.handle !== undefined && $.CancelScheduled) {
            try { $.CancelScheduled(job.handle); } catch (error) {}
        }
    }
    function scheduleHUD(delay, callback) {
        var job = {cancelled:false};
        scheduledJobs.push(job);
        job.handle = $.Schedule(delay, function(){
            var index = scheduledJobs.indexOf(job);
            if (index >= 0) scheduledJobs.splice(index, 1);
            if (!job.cancelled && syncActive()) callback();
        });
        return job;
    }
    function subscribeHUD(kind, name, callback) {
        var guarded = function(){
            if (syncActive()) return callback.apply(null, arguments);
        };
        var id = kind === "event" ? GameEvents.Subscribe(name, guarded)
            : CustomNetTables.SubscribeNetTableListener(name, guarded);
        subscriptions.push({kind:kind, id:id});
    }
    function resetSnapshotRecovery(resetBuilder) {
        syncEpoch++;
        hasSnapshot = false; lastSequence = -1; snapshotRequest = null;
        retryFailures = 0; nextRetryAt = 0; lastSnapshotReceiptAt = 0;
        recoveryUntil = Date.now() / 1000 + 30;
        builderRecoveryUntil = recoveryUntil;
        initialBuilderSelectionSerial++;
        builderRetryPending = false;
        if (resetBuilder) {
            initialBuilderSelectionFinished = false;
        }
    }
    function scheduleRecovery(delay) {
        if (!syncActive()) return;
        if (recoveryTask) {
            if (delay !== 0) return;
            cancelHUDJob(recoveryTask);
        }
        var epoch = syncEpoch;
        recoveryTask = scheduleHUD(delay, function(){
            recoveryTask = null;
            if (epoch === syncEpoch) pollSnapshot();
        });
    }
    var difficultyRequestPending = false;
    var difficultyOptionsSignature = "";
    var difficultyWave = null, difficultyChoice = "", difficultyRows = {}, difficultyConfirmed = "";
    var difficultyModal = null, difficultyRequestSerial = 0;
    var difficultyDismissed = false, difficultyPhase = "", difficultyResume = null;
    var startupState = null, setupSession = "", modeChoice = "", modeAcknowledged = "";
    var modePending = false, modeError = "", modeRequestSerial = 0, modeSignature = "", modeRows = {};
    var modeOrder = ["standard", "rich", "cold", "scourge", "ruins", "celestial", "fishing", "pure"];
    var profileRetry = null, profileRetryPending = false, profileRetrySerial = 0, profileErrorShown = false, profileRetryNotice = null;
    var initialBuilderSelectionFinished = false;
    var initialBuilderSelectionSerial = 0;
    var notificationItems = [];

    var waveStatusText = {
        dev_mode: "准备阶段",
        waiting: "准备阶段",
        selecting_difficulty: "选择难度",
        fishing: "自动挂机",
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
        if (target) {
            target.text = String(value);
            if (id === "DifficultySelectionError") target.visible = target.text !== "";
        }
    }

    function numberValue(value) {
        var number = Number(value || 0);
        if (Math.abs(number - Math.round(number)) < 0.001) return String(Math.round(number));
        return number.toFixed(1).replace(/\.0$/, "");
    }

    function compactNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        return formatter && formatter.Format ? formatter.Format(value) : numberValue(value);
    }

    function sequenceOf(snapshot) {
        var sequence = Number(snapshot && snapshot.sequence);
        return isNaN(sequence) ? -1 : sequence;
    }

    function isDifficultySelected(wave) {
        if (difficultyConfirmed || setup() && yes(setup().difficulty_selected)) return true;
        if (wave && wave.game_mode && confirmedMode() && wave.game_mode !== confirmedMode()) return false;
        return !!wave && (wave.difficulty_selected === true || Number(wave.difficulty_selected || 0) === 1);
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
    function difficultyAccessPolicy() {
        return setup() && setup().difficulty_access_policy !== undefined
            ? setup().difficulty_access_policy : difficultyWave && difficultyWave.difficulty_access_policy;
    }
    function readOnlyAcceptance() {
        return setup() && setup().read_only_acceptance !== undefined ? yes(setup().read_only_acceptance)
            : difficultyAccessPolicy() === "read_only_acceptance";
    }
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
            if (!option || modeOrder.indexOf(option.mode_id) < 0 || seen[option.mode_id]) return false;
            seen[option.mode_id] = true; return true;
        }).sort(function (left, right) {
            return modeOrder.indexOf(left.mode_id) - modeOrder.indexOf(right.mode_id);
        });
    }
    function modeUnlocked(option) {
        if (!option || option.pending === true || Number(option.pending) === 1) return false;
        // Original modes remain compatible with older snapshots. Progression
        // modes always require explicit permission from the server.
        return option.unlocked === undefined ? ["standard", "fishing", "pure"].indexOf(option.mode_id) >= 0
            : option.unlocked === true || Number(option.unlocked) === 1;
    }
    function modeDailyCapped(option) {
        return !!option && (option.daily_capped === true || Number(option.daily_capped) === 1
            || option.daily_remaining !== undefined && Number(option.daily_remaining) === 0);
    }
    function modeSelectable(option) {
        return modeUnlocked(option) && !modeDailyCapped(option)
            && option.daily_pending !== true && Number(option.daily_pending) !== 1;
    }
    function modeUnlockHint(option) {
        if (option.daily_pending === true || Number(option.daily_pending) === 1) return option.daily_hint || "正在更新今日奖励额度……";
        if (modeDailyCapped(option)) return option.daily_hint || "今日奖励已达上限";
        if (option.pending === true || Number(option.pending) === 1) return "正在读取解锁进度……";
        return option.unlock_hint || ({rich:"通关常规模式 N10 后解锁", cold:"通关丰饶模式 N10 后解锁",
            scourge:"通关极寒模式 N10 后解锁"}[option.mode_id] || "尚未解锁该模式");
    }
    function acceptStartup(next) {
        if (!next || typeof next.session_id !== "string" || !next.session_id) return;
        if (!syncActive()) return;
        var signature = JSON.stringify(next);
        if (signature === startupSignature) return;
        startupSignature = signature;
        var previousAdmission = admissionComplete(), previousPhase = startupState && startupState.phase;
        var previousProfilesReady = canConfirmDifficulty(), previousMode = confirmedMode();
        if (setupSession !== next.session_id) {
            resetSnapshotRecovery(!!setupSession);
            setupSession = next.session_id; modeChoice = ""; modeAcknowledged = "";
            modePending = false; modeError = ""; modeRequestSerial++;
            difficultyChoice = ""; difficultyConfirmed = ""; difficultyRequestPending = false; difficultyRequestSerial++;
            profileRetryPending = false; profileRetrySerial++;
        }
        startupState = next;
        if (previousAdmission !== admissionComplete() || previousPhase !== next.phase
            || previousProfilesReady !== canConfirmDifficulty() || previousMode !== confirmedMode())
            recoveryUntil = Date.now() / 1000 + 30;
        if (!previousAdmission && admissionComplete()) builderRecoveryUntil = recoveryUntil;
        renderDifficultySelection(difficultyWave);
        if (!hasSnapshot || !initialBuilderSelectionFinished) scheduleRecovery(0);
    }
    function readStartup() {
        counters.startupReads++;
        acceptStartup(CustomNetTables.GetTableValue("survival_loading", "state"));
    }
    function confirmMode() {
        if (!syncActive()) return;
        if (!admissionComplete() || !needsMode() || !modeSelector() || modePending || !setupSession
            || !modeOptions().some(function (option) { return option.mode_id === modeChoice && modeSelectable(option); })) return;
        modePending = true; modeError = "";
        var serial = ++modeRequestSerial, requestedSession = setupSession;
        GameEvents.SendCustomGameEventToServer("survival_loading_mode_select", {session_id: setupSession, mode_id: modeChoice});
        renderDifficultySelection(difficultyWave);
        scheduleHUD(12, function () {
            if (serial !== modeRequestSerial || requestedSession !== setupSession || !modePending || !needsMode()) return;
            modePending = false; modeError = "选择未完成，请检查连接后重试。";
            renderDifficultySelection(difficultyWave);
        });
    }
    function handleModeResult(payload) {
        if (!modePending || !needsMode() || payload && payload.session_id && payload.session_id !== setupSession) return;
        if (payload && yes(payload.success) && payload.mode_id === modeChoice) {
            // Combat modes continue to difficulty in this dialog. Fishing has
            // no difficulty; neither acknowledgement asserts profile readiness.
            modeAcknowledged = payload.mode_id; modePending = false; modeError = ""; modeRequestSerial++;
            renderDifficultySelection(difficultyWave); readStartup(); requestSnapshot(); return;
        }
        modePending = false; modeRequestSerial++;
        var messages = {selection_not_host: "由房主统一选择本局模式。", mode_selector_required: "由房主统一选择本局模式。",
            mode_locked: "本局模式已选择，正在刷新。", invalid_mode: "该模式不可用，请重新选择。",
            mode_profile_pending: "正在读取解锁进度，请稍候。",
            mode_daily_limit_reached: "今日奖励已达上限",
            mode_daily_limits_pending: "正在更新今日奖励额度，请稍候。",
            rich_mode_locked: "通关常规模式 N10 后解锁丰饶模式。", rich_progression_pending: "正在读取解锁进度，请稍候。",
            mode_not_found: "该模式不可用，请重新选择。", match_session_mismatch: "游戏状态已更新，请等待刷新后重试。",
            session_mismatch: "游戏状态已更新，请等待刷新后重试。", startup_not_ready: "入场准备尚未完成，请稍候。"};
        var rejectedOption = modeOptions().filter(function (option) { return option.mode_id === modeChoice; })[0];
        modeError = payload && payload.error === "mode_not_unlocked"
            ? payload.unlock_hint || modeUnlockHint(rejectedOption || {mode_id:modeChoice})
            : messages[payload && payload.error] || "模式选择失败，请重试。";
        readStartup(); renderDifficultySelection(difficultyWave);
    }
    function renderModeChoice(ui) {
        var options = modeOptions(), selector = modeSelector();
        if (!options.some(function (option) { return option.mode_id === modeChoice && modeSelectable(option); })) modeChoice = "";
        var signature = JSON.stringify(options);
        if (signature !== modeSignature) {
            modeSignature = signature; modeRows = {}; panel("MatchModeOptions").RemoveAndDeleteChildren();
            options.forEach(function (option) {
                var button = $.CreatePanel("Button", panel("MatchModeOptions"), ""); button.AddClass("MatchModeOption"); button.hittestchildren = false;
                button.SetHasClass("MatchModeOptionLocked", !modeSelectable(option));
                var name = $.CreatePanel("Label", button, ""); name.AddClass("MatchModeOptionName"); name.html = false;
                name.text = option.display_name || ({pure:"纯净模式",standard:"常规模式",fishing:"摸鱼模式",rich:"丰饶模式",cold:"极寒模式",scourge:"天灾模式",ruins:"归墟模式",celestial:"天域模式"}[option.mode_id] || "常规模式");
                button.SetPanelEvent("onmouseover", function () {
                    if (syncActive() && !modeSelectable(option)) $.DispatchEvent("DOTAShowTextTooltip", button, modeUnlockHint(option));
                });
                button.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip"); });
                ui.State.Bind(button, function () {
                    if (!admissionComplete() || !needsMode() || !modeSelector() || modePending || !modeSelectable(option)) return;
                    modeChoice = option.mode_id; modeError = ""; confirmMode();
                });
                modeRows[option.mode_id] = button;
            });
        }
        options.forEach(function (option) { ui.State.Set(modeRows[option.mode_id], {
            selected: option.mode_id === modeChoice, enabled: selector && !modePending && modeSelectable(option),
            busy: modePending && option.mode_id === modeChoice}); });
        setText("DifficultySelectionTitle", "模式选择");
        var acceptance = readOnlyAcceptance(), hint = selector ? "" : "等待房主选择模式";
        if (acceptance) hint = "临时验收 · 不保存奖励和进度" + (hint ? "\n" + hint : "");
        setText("DifficultySelectionHint", hint);
        var hintPanel = panel("DifficultySelectionHint");
        hintPanel.visible = hint !== ""; hintPanel.hittest = acceptance;
        hintPanel.SetPanelEvent("onmouseover", function () {
            if (acceptance) $.DispatchEvent("DOTAShowTextTooltip", hintPanel,
                "本局仅用于验收怪物强度，模式和难度无需前置通关；不保存奖励和通关进度，也不消耗每日额度。由房主选择。");
        });
        hintPanel.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip"); });
        setText("DifficultySelectionError", modeError);
    }
    function difficultyUnlocked(option) { return !!option && (option.unlocked === true || Number(option.unlocked) === 1); }
    function difficultyTemporary(option) { return !!option && (option.temporary_config === true || Number(option.temporary_config) === 1); }
    function difficultyTemporaryLabel(option) {
        var source = String(option && option.source_difficulty_id || "");
        return "临时配置" + (/^N[1-9][0-9]*$/.test(source) ? " · 沿用 " + source : "");
    }
    function difficultyUnlockHint(option, compact) {
        var text = String(option && option.unlock_hint || "通关前一级难度解锁");
        if (!compact) return text;
        var required = text.match(/N[1-9][0-9]*(?![0-9])/);
        if (required && /队伍所有玩家|全员/.test(text)) return "全员通关 " + required[0] + " 解锁";
        return text.length > 14 ? "未解锁 · 查看条件" : text;
    }
    function difficultySelector() {
        var id = Game.GetLocalPlayerID();
        var selector = setup() ? setup().selector_player_id : difficultyWave && difficultyWave.selector_player_id;
        return id >= 0 && selector !== undefined && id === Number(selector);
    }
    function difficultyAvailable() {
        return admissionComplete() && !!confirmedMode() && confirmedMode() !== "fishing" && !isDifficultySelected(difficultyWave)
            && (!!setup() || difficultyWave && difficultyWave.status === "selecting_difficulty");
    }
    function canConfirmDifficulty() {
        // Authentication already preloads team progression; confirming a difficulty
        // locks the choice but never releases combat's separate profile barrier.
        if (setup() && setup().can_confirm_difficulty !== undefined) return yes(setup().can_confirm_difficulty);
        if (difficultyWave && difficultyWave.can_confirm_difficulty !== undefined) return yes(difficultyWave.can_confirm_difficulty);
        if (startupState && startupState.profiles_ready !== undefined) return yes(startupState.profiles_ready);
        if (difficultyWave && difficultyWave.profile_ready !== undefined) return yes(difficultyWave.profile_ready);
        return true;
    }
    function profilesReady() {
        if (startupState && startupState.profiles_ready !== undefined) return yes(startupState.profiles_ready);
        return !difficultyWave || difficultyWave.profile_ready === undefined || yes(difficultyWave.profile_ready);
    }
    function retryProfiles() {
        if (!syncActive() || profileRetryPending || !setupSession || !setup() || !setup().error || profilesReady()) return;
        profileRetryPending = true; var serial = ++profileRetrySerial;
        GameEvents.SendCustomGameEventToServer("survival_loading_retry", {session_id: setupSession});
        renderDifficultySelection(difficultyWave);
        scheduleHUD(5, function () {
            if (serial !== profileRetrySerial) return;
            profileRetryPending = false; renderDifficultySelection(difficultyWave);
        });
    }
    function renderProfileError(ui) {
        var code = setup() && setup().error;
        var messages = {backend_authentication_failed: "服务端认证失败，请将此提示发给作者。（WS4-03/AUTH）",
            workshop_dedicated_server_required: "当前为本地主机，请在房间中选择线上服务器后重新开局。（WS4-03）",
            workshop_key_api_unavailable: "线上服务器未提供凭据接口，请将此提示发给作者。（WS4-03/API）",
            workshop_key_call_failed: "线上服务器生成凭据失败，请将此提示发给作者。（WS4-03/CALL）",
            workshop_key_empty: "线上服务器返回空凭据，请将此提示发给作者。（WS4-03/EMPTY）",
            workshop_server_key_unavailable: "线上服务器返回的凭据格式无效，请将此提示发给作者。（WS4-03/FORMAT）",
            workshop_connection_invalid: "测试连接配置无效，请联系作者更新游廊。（WS4-03/CONFIG）",
            workshop_server_not_authorized: "测试服务未登记服务器凭据，请将此提示发给作者。（WS4-03/PIN）",
            workshop_backend_unreachable: "游戏服务器未能连接测试服务，请将此提示发给作者。（WS4-03/NETWORK）",
            workshop_backend_rejected: "测试入口拒绝连接，请将此提示发给作者。（WS4-03/HTTP）",
            backend_token_missing: "当前对局未启用游廊测试连接，请重新开局并将此提示发给作者。（WS4-03/ROUTE）",
            profile_load_failed: "玩家档案读取失败，请重试。", profile_load_timeout: "玩家档案读取超时，请重试。",
            player_disconnected: "等待其他玩家重新连接后完成准备。", player_identity_changed: "玩家身份发生变化，请重新加入本局。"};
        var text = !profilesReady() && code ? messages[code] || "玩家档案暂未准备完成，请重试。" : "";
        var pairing = typeof code === "string" && code.match(/^workshop_pairing_([0-9a-f]{16})$/);
        if (!profilesReady() && pairing) text = "测试服务器首次接入，认证指纹：" + pairing[1] + "，请联系作者完成配对。";
        var keyState = typeof code === "string" && code.match(/^workshop_key_state_(Invalid_[A-Za-z0-9_]{1,56})$/);
        if (!profilesReady() && keyState) text = "Valve服务器凭据不可用，请将此状态发给作者。（WS4-03：" + keyState[1] + "）";
        var retryable = !!text && code !== "player_disconnected" && code !== "player_identity_changed";
        panel("MatchSetupRetryHost").visible = retryable;
        if (text) setText("DifficultySelectionError", text);
        else if (profileErrorShown && !difficultyRequestPending) setText("DifficultySelectionError", "");
        profileErrorShown = !!text;
        if (!profileRetry && retryable) profileRetry = ui.ActionButton(panel("MatchSetupRetryHost"), {
            id: "MatchSetupRetry", label: "重试读取档案", enabled: true, action: retryProfiles});
        if (profileRetry) ui.State.Set(profileRetry, {enabled: retryable && !profileRetryPending, busy: profileRetryPending});
        if (!profileRetryNotice) {
            profileRetryNotice = $.CreatePanel("Button", $.GetContextPanel(), "MatchProfileRetryNotice");
            profileRetryNotice.AddClass("MatchProfileRetryNotice");profileRetryNotice.hittestchildren = false;
            var caption = $.CreatePanel("Label", profileRetryNotice, "");caption.text = "档案准备失败 · 点击重试";
            profileRetryNotice.SetPanelEvent("onactivate", retryProfiles);
        }
        profileRetryNotice.visible = retryable && isDifficultySelected(difficultyWave);
        ui.State.Set(profileRetryNotice, {enabled: retryable && !profileRetryPending, busy: profileRetryPending});
    }
    function selectedDifficulty() {
        return difficultyOptions().filter(function (option) {
            return option && String(option.difficulty_id) === difficultyChoice && difficultyUnlocked(option);
        })[0];
    }
    function difficultyOptions() {
        var current = setup(), byMode = current && current.difficulty_options_by_mode;
        var source = byMode && byMode[confirmedMode() || modeChoice] || current && current.difficulty_options;
        return optionArray(source || difficultyWave && difficultyWave.difficulty_options);
    }
    function refreshDifficultyChoice() {
        if (!syncActive()) return;
        var ui = GameUI.CustomUIConfig().SurvivalUI;
        var selected = selectedDifficulty();
        if (!selected || (!canConfirmDifficulty() && !difficultyRequestPending)) difficultyChoice = "";
        Object.keys(difficultyRows).forEach(function (id) {
            var row = difficultyRows[id];
            ui.State.Set(row.button, {selected: id === difficultyChoice,
                enabled: difficultyAvailable() && canConfirmDifficulty() && difficultySelector()
                    && difficultyUnlocked(row.option) && !difficultyRequestPending});
            row.availability.text = !difficultyUnlocked(row.option) ? difficultyUnlockHint(row.option, true)
                : difficultyTemporary(row.option) ? difficultyTemporaryLabel(row.option) : "";
            row.availability.visible = !difficultyUnlocked(row.option) || difficultyTemporary(row.option);
        });
    }
    function selectDifficulty() {
        if (!syncActive()) return;
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
        scheduleHUD(12, function () {
            if (serial !== difficultyRequestSerial || !difficultyRequestPending || !difficultyAvailable()) return;
            difficultyRequestPending = false;
            overlay.SetHasClass("DifficultyPending", false);
            setText("DifficultySelectionError", "确认尚未完成，请检查连接后重试。");
            refreshDifficultyChoice(); requestSnapshot();
        });
    }

    function hideDifficultySelection() {
        difficultyDismissed = true;
        if (difficultyModal) difficultyModal.Close();
        renderDifficultySelection(difficultyWave);
    }

    function renderDifficultySelection(wave) {
        if (!syncActive()) return;
        var overlay = panel("DifficultySelectionOverlay");
        var container = panel("DifficultySelectionButtons");
        if (!overlay || !container) return;
        difficultyWave = wave;
        var choosingMode = needsMode(), shouldShow = admissionComplete() && (choosingMode || difficultyAvailable());
        var phase = setupSession + ":" + (choosingMode ? "mode" : "difficulty");
        if (phase !== difficultyPhase) { difficultyPhase = phase; difficultyDismissed = false; }
        overlay.SetHasClass("DifficultySelectionHidden", !shouldShow || difficultyDismissed);
        // ModalShell writes native visibility. Mirror the authoritative state so
        // a cached window cannot survive a layout reload behind another menu.
        overlay.visible = shouldShow && !difficultyDismissed;
        if (!shouldShow || difficultyDismissed) {
            var hiddenDialog=panel("DifficultySelectionDialog");
            if (hiddenDialog) hiddenDialog.visible=false;
        }
        if (difficultyResume) {
            difficultyResume.visible = shouldShow && difficultyDismissed;
            difficultyResume.__survivalResumeText.text = choosingMode ? "继续选择模式" : "继续选择难度";
        }
        if (!shouldShow) {
            panel("MatchModeOptions").visible = false;
            container.visible = false;
            difficultyRequestPending = false;
            overlay.SetHasClass("DifficultyPending", false);
            if (difficultyModal && difficultyModal.IsOpen()) difficultyModal.Close();
            var sharedUI=GameUI.CustomUIConfig().SurvivalUI;
            var sharedModal=sharedUI&&sharedUI.ModalManager.Get("survival_difficulty");
            if(sharedModal&&sharedModal!==difficultyModal)sharedModal.Close();
            var currentLayers=GameUI.CustomUIConfig().SurvivalUILayers;
            if(currentLayers)currentLayers.Close("survival_difficulty");
            var readyUI = GameUI.CustomUIConfig().SurvivalUI;
            if (readyUI) renderProfileError(readyUI);
            return;
        }
        var ui = GameUI.CustomUIConfig().SurvivalUI;
        if (!ui) { setText("DifficultySelectionError", "正在准备选择界面……"); return; }
        if (!difficultyModal) {
            difficultyModal = ui.ModalShell.Adopt({id: "survival_difficulty", panel: panel("DifficultySelectionDialog"),
                header: panel("DifficultySelectionHeader"), titlePanel: panel("DifficultySelectionTitle"),
                scrim: overlay, root: $.GetContextPanel(), width: 275, height: 670,
                fit: {reference: [1920, 1080]}, closePolicy: "mandatory",
                onClose: hideDifficultySelection});
            panel("DifficultySelectionDialog").AddClass("DifficultyNativeReborn");
            panel("DifficultySelectionDialog").style.backgroundColor = "#111b22";
            panel("DifficultySelectionDialog").style.border = "1px solid #657780";
            panel("DifficultySelectionHeader").style.backgroundColor = "transparent";
            panel("DifficultySelectionHeader").style.borderBottom = "1px solid #71838c66";
            panel("DifficultySelectionTitle").style.color = "#e1e8e9";
            difficultyResume = $.CreatePanel("Button", $.GetContextPanel(), "DifficultySelectionResume");
            difficultyResume.AddClass("DifficultySelectionResume");
            difficultyResume.hittest = true; difficultyResume.hittestchildren = false;
            var resumeText = $.CreatePanel("Label", difficultyResume, "");
            resumeText.text = choosingMode ? "继续选择模式" : "继续选择难度";
            resumeText.hittest = false;
            difficultyResume.__survivalResumeText = resumeText;
            difficultyResume.visible = false;
            difficultyResume.SetPanelEvent("onactivate", function () {
                difficultyDismissed = false; renderDifficultySelection(difficultyWave);
            });
        }
        panel("DifficultySelectionDialog").style.width = "275px";
        var modeNotice = choosingMode && (!!modeError || !modeSelector() || readOnlyAcceptance());
        var extraModeHeight = Math.max(0, modeOptions().length - 2) * 56;
        panel("DifficultySelectionDialog").style.height = (choosingMode ? (modeNotice ? 248 : 190) + extraModeHeight : 670) + "px";
        panel("DifficultySelectionDialog").SetHasClass("MatchSetupMode", choosingMode);
        if (!difficultyDismissed && !difficultyModal.IsOpen()) difficultyModal.Open();
        var wasChoosingMode = panel("MatchModeOptions").visible;
        panel("MatchModeOptions").visible = choosingMode;
        container.visible = !choosingMode;
        if (choosingMode) { panel("MatchSetupRetryHost").visible = false; renderModeChoice(ui); return; }
        setText("DifficultySelectionTitle", "难度选择");
        var options = difficultyOptions().filter(function (option) {
            return option && /^N[1-9][0-9]*$/.test(String(option.difficulty_id));
        }).sort(function (a, b) { return Number(a.difficulty_id.slice(1)) - Number(b.difficulty_id.slice(1)); });
        var highest = "";
        options.forEach(function (option) {if (difficultyUnlocked(option) && Number(String(option.difficulty_id).slice(1)) > Number(highest.slice(1) || 0)) highest = String(option.difficulty_id);});
        var accessPolicy = difficultyAccessPolicy(), acceptance = readOnlyAcceptance();
        var allConfigured = accessPolicy === "all_configured" || accessPolicy === "read_only_acceptance";
        var modeNames = {pure:"纯净模式",standard:"常规模式",rich:"丰饶模式",cold:"极寒模式",scourge:"天灾模式",ruins:"归墟模式",celestial:"天域模式"};
        var hint = !difficultySelector() ? "等待房主选择难度" : !canConfirmDifficulty() ? "正在读取队伍通关进度……" : "";
        if (highest) hint = (modeNames[confirmedMode()] || "本局模式")
            + (allConfigured ? " · 全难度开放至 " : " · 队伍上限 ") + highest + (hint ? "\n" + hint : "");
        if (acceptance) hint += (hint ? "\n" : "") + "临时验收 · 不保存奖励和进度";
        setText("DifficultySelectionHint", hint);
        panel("DifficultySelectionHint").visible = hint !== "";
        var limitNames = optionArray(setup() && setup().difficulty_limit_player_ids).map(function(id){return typeof Players.GetPlayerName === "function" && Players.GetPlayerName(Number(id)) || "玩家 " + id;});
        var hintPanel = panel("DifficultySelectionHint");hintPanel.hittest = true;
        hintPanel.SetPanelEvent("onmouseover", function(){
            $.DispatchEvent("DOTAShowTextTooltip", hintPanel, acceptance
                ? "本局全部已配置难度已开放，无需前置通关；仅验收怪物强度，不保存奖励和通关进度，也不消耗每日额度。仍需完成队伍准备，由房主选择。"
                : allConfigured
                ? "本模式全部已配置难度已开放，无需前置通关；仍需完成队伍准备，由房主选择。"
                : "本局可选难度按全队最低通关进度计算。" + (limitNames.length ? "\n当前进度限制：" + limitNames.join("、") : ""));
        });
        hintPanel.SetPanelEvent("onmouseout", function(){ $.DispatchEvent("DOTAHideTextTooltip"); });
        if (wasChoosingMode) setText("DifficultySelectionError", "");
        var signature = JSON.stringify(options);
        if (signature !== difficultyOptionsSignature) {
            difficultyOptionsSignature = signature; difficultyRows = {};
            container.RemoveAndDeleteChildren();
            options.forEach(function (option) {
            var button = $.CreatePanel("Button", container, "");
            button.AddClass("DifficultyOptionButton"); button.hittestchildren = false;
            button.__difficultyId = String(option.difficulty_id);
            button.SetHasClass("DifficultyOptionLocked", !difficultyUnlocked(option));
            var header = $.CreatePanel("Panel", button, "");
            header.AddClass("DifficultyOptionHeader");
            var diamond = $.CreatePanel("Panel", header, ""); diamond.AddClass("DifficultyOptionDiamond");
            var code = $.CreatePanel("Label", header, ""); code.AddClass("DifficultyOptionCode"); code.html = false;
            code.text = String(option.difficulty_id);
            if (difficultyTemporary(option)) { code.style.horizontalAlign = "left"; code.style.marginLeft = "14px"; }
            var availability = $.CreatePanel("Label", header, ""); availability.AddClass("DifficultyOptionAvailability"); availability.html = false;
            difficultyRows[option.difficulty_id] = {button: button, option: option, availability: availability};
            button.SetPanelEvent("onmouseover", function(){
                var text = !difficultyUnlocked(option) ? difficultyUnlockHint(option, false) : "";
                if (difficultyTemporary(option)) text += (text ? "\n" : "") + (option.description || difficultyTemporaryLabel(option));
                if (text) $.DispatchEvent("DOTAShowTextTooltip", button, text);
            });
            button.SetPanelEvent("onmouseout", function(){ $.DispatchEvent("DOTAHideTextTooltip"); });
            ui.State.Bind(button, function () {
                if (!difficultyAvailable() || !canConfirmDifficulty() || !difficultySelector()
                    || difficultyRequestPending || !difficultyUnlocked(option)) return;
                difficultyChoice = String(option.difficulty_id);
                setText("DifficultySelectionError", ""); selectDifficulty();
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

    function update(snapshot, receipt) {
        if (!syncActive() || !snapshot) return;
        if (snapshot.session_id && setupSession && snapshot.session_id !== setupSession) return;
        if (snapshot.player_id !== undefined && playerId >= 0 && Number(snapshot.player_id) !== playerId) return;
        if (receipt !== false) {
            counters.received++;
            lastSnapshotReceiptAt = Date.now() / 1000;
            snapshotRequest = null; retryFailures = 0; nextRetryAt = 0;
        }
        var sequence = sequenceOf(snapshot);
        // NetTable 轮询会反复读到同一快照；没有新 sequence 时不重写整套
        // HUD，也不重新安装 hover 回调，避免形成固定间隔的客户端卡顿。
        if (sequence >= 0 && sequence <= lastSequence) return;
        if (sequence >= 0) lastSequence = sequence;
        var firstSnapshot = !hasSnapshot;
        hasSnapshot = true;
        snapshotRequest = null; retryFailures = 0; nextRetryAt = 0;
        counters.applied++;
        if (firstSnapshot) scheduleRecovery(0);

        var resources = snapshot.resources || {};
        var actionResources = GameUI.CustomUIConfig().SurvivalActionResources;
        if (actionResources) actionResources.Update(snapshot.resources || null);
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
            wave.game_mode === "fishing" || wave.status === "fishing" ? "摸鱼模式" : (isDifficultySelected(wave)
                ? String(wave.difficulty_id || "N1") + " · " : "")
                + "波次 " + numberValue(wave.current_wave)
                + "/" + numberValue(wave.total_waves || 30)
        );
        var phase = waveStatusText[wave.status] || "准备阶段";
        setText("WaveState", phase);
        setText("WaveTimer", wave.game_mode === "fishing" || wave.status === "fishing" ? "" : "倒计时 " + Math.max(0, Math.ceil(Number(wave.timer || 0))) + "秒");
        setText("AliveValue", "存活 " + numberValue(wave.alive));
        setText("PendingValue", "待生成 " + numberValue(wave.pending));
    }

    function handleDifficultyResult(payload) {
        if (payload && Number(payload.success || 0) === 1) {
            difficultyConfirmed = String(payload.difficulty_id || difficultyChoice || "N1");
            difficultyRequestPending = false; difficultyRequestSerial++;
            setText("DifficultySelectionError", "");
            renderDifficultySelection(difficultyWave);
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
        counters.legacyReads++;
        update(CustomNetTables.GetTableValue(tableName, tableKey), false);
    }

    function expireSnapshotRequest(now) {
        if (!snapshotRequest || now < snapshotRequest.deadline) return;
        snapshotRequest = null;
        retryFailures++;
        counters.retryTimeouts++;
        nextRetryAt = now + Math.min(5, 0.5 * Math.pow(2, Math.min(4, retryFailures - 1)));
    }
    function requestSnapshot(recovery) {
        if (!syncActive()) return false;
        var now = Date.now() / 1000;
        expireSnapshotRequest(now);
        if (snapshotRequest) { counters.requestCoalesced++; return false; }
        if (recovery === true && now < nextRetryAt) return false;
        if (Game.GetLocalPlayerID() < 0) return false;
        var request = {epoch:syncEpoch, deadline:now + 3};
        snapshotRequest = request;
        counters.requests++;
        GameEvents.SendCustomGameEventToServer("ui_request_full_snapshot", {
            request_id: "hud_" + syncEpoch + "_" + (++syncRequestSerial) + "_" + String(Date.now())
        });
        return true;
    }

    function pollSnapshot() {
        if (!syncActive()) return;
        counters.polls++;
        var now = Date.now() / 1000, localId = Number(Game.GetLocalPlayerID());
        if (isFinite(localId) && localId >= 0 && localId !== playerId) {
            playerId = localId; tableKey = "player_" + playerId;
            resetSnapshotRecovery(true);
        }
        // Stable HUDs receive private events. Absence of a new sequence is not
        // a failed connection: the server has no periodic snapshot heartbeat.
        // A sparse startup read only repairs missed session/phase notifications.
        readStartup();
        expireSnapshotRequest(now);
        if (!hasSnapshot && now < recoveryUntil) {
            readSnapshot();
            if (!hasSnapshot) requestSnapshot(true);
        }
        if (!initialBuilderSelectionFinished && admissionComplete()
            && now < builderRecoveryUntil && !builderRetryPending) {
            recoverInitialBuilderSelection("hud_recovery", 20, initialBuilderSelectionSerial);
        }
        var recovering = (!hasSnapshot || !admissionComplete()) && now < recoveryUntil;
        var seekingBuilder = !initialBuilderSelectionFinished && admissionComplete() && now < builderRecoveryUntil;
        scheduleRecovery(recovering || seekingBuilder ? 0.5 : 5);
    }

    function showNotification(payload) {
        if (!payload) return;
        // Endless countdowns use the archive's transient screen-center tip.
        if (payload.kind === "endless_tip") return;
        if (payload.audience === "player" && Number(payload.player_id) !== playerId) return;
        var message = String(payload.message || "");
        if (!message.trim()) return;
        // Rejected resource/queue actions use the same native feedback as a
        // failed ability cast. Queue waiting states remain in the queue panel.
        if (payload.level === "error" && payload.audience !== "all") {
            if (message.trim() === "信仰值不足" || message.trim() === "软妹币不足") {
                var nativeError = lifecycleConfig.SurvivalTooltipPosition;
                if (nativeError && nativeError.ShowNativeError) nativeError.ShowNativeError(lifecycleContext, message.trim());
                else GameEvents.SendEventClientSide("dota_hud_error_message", {reason:80, message:message.trim()});
                return;
            }
            var actionErrors = {
                wood_not_enough: "木材不足", not_enough_wood: "木材不足", insufficient_wood: "木材不足",
                gold_not_enough: "金币不足", not_enough_gold: "金币不足", insufficient_gold: "金币不足",
                population_not_enough: "人口不足", not_enough_population: "人口不足", insufficient_population: "人口不足",
                research_queue_full: "研究队列已满", technology_queue_full: "研究队列已满"
            };
            var actionMatch = message.match(/(木材不足|金币不足|人口不足|研究队列已满|队列研究已满)/);
            var actionError = actionErrors[message.trim()] || (actionMatch && actionMatch[1]);
            if (actionError === "队列研究已满") actionError = "研究队列已满";
            if (actionError) {
                GameEvents.SendEventClientSide("dota_hud_error_message", {reason: 80, message: actionError});
                return;
            }
        }
        var container = panel("NotificationContainer");
        if (!container) return;
        notificationItems = notificationItems.filter(function (entry) {
            return entry && entry.IsValid();
        });
        while (notificationItems.length >= 4) notificationItems.shift().DeleteAsync(0);
        var item = $.CreatePanel("Panel", container, "");
        item.AddClass("Notification");
        item.hittest = false; item.hittestchildren = false;
        if (payload.level === "error") item.AddClass("error");
        var broadcast = payload.audience === "all";
        item.SetHasClass("NotificationBroadcast", broadcast);
        var abilityIcon = String(payload.ability_icon || "");
        var heroName = String(payload.hero_name || "");
        if (/^[a-z0-9_]+$/.test(abilityIcon)) {
            var ability = $.CreatePanel("DOTAAbilityImage", item, "");
            ability.AddClass("NotificationIcon"); ability.abilityname = abilityIcon;
        } else if (broadcast && /^npc_dota_hero_[a-z0-9_]+$/.test(heroName)) {
            var hero = $.CreatePanel("DOTAHeroImage", item, "");
            hero.AddClass("NotificationIcon"); hero.heroname = heroName; hero.heroimagestyle = "icon";
        } else {
            var mark = $.CreatePanel("Label", item, "");
            mark.AddClass("NotificationMark"); mark.text = payload.level === "error" ? "!" : "★";
        }
        function text(value, className, rich) {
            var label = $.CreatePanel("Label", item, "");
            label.AddClass("NotificationText");
            if (className) label.AddClass(className);
            label.html = rich === true;
            label.text = value;
        }
        if (payload.kind === "research_success" && payload.subject) {
            text("研究 ");
            text(String(payload.subject), "NotificationSubject");
            text(" 科技成功");
        } else {
            var actor = String(payload.actor_name || "");
            if (broadcast && actor && message.indexOf(actor) === 0) {
                text(actor + " ", "NotificationActor");
                message = message.slice(actor.length).replace(/^\s+/, "");
            }
            text(message, "", payload.kind === "archive_reward" && payload.rich_text === true);
        }
        notificationItems.push(item);
        scheduleHUD(broadcast ? 5.0 : 3.5, function () {
            if (item && item.IsValid()) {
                item.AddClass("NotificationDismissed");
                item.DeleteAsync(0.25);
            }
        });
    }

    function sendClientDiagnostic(stage, payload) {
        if (!syncActive()) return;
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
        if (!syncActive() || !payload) return;
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
        if (!syncActive() || initialBuilderSelectionFinished || serial !== initialBuilderSelectionSerial
            || !admissionComplete() || Date.now() / 1000 >= builderRecoveryUntil) return;
        counters.builderSteps++;
        var identity = CustomNetTables.GetTableValue(
            "survival_builder_identity", "player_" + String(playerId)
        ) || {};
        var builder = Number(identity.entindex);
        if (!validUnit(builder)) {
            if (attempt < 20 && !builderRetryPending) {
                var epoch = syncEpoch;
                builderRetryPending = true;
                scheduleHUD(0.10, function () {
                    if (epoch !== syncEpoch || serial !== initialBuilderSelectionSerial) return;
                    builderRetryPending = false;
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
        if (!syncActive() || initialBuilderSelectionFinished || builderRetryPending) return;
        builderRecoveryUntil = Date.now() / 1000 + 30;
        var serial = ++initialBuilderSelectionSerial;
        recoverInitialBuilderSelection(String(reason || "unknown"), 0, serial);
        scheduleRecovery(0);
    }

    subscribeHUD("table", tableName, function (name, key, value) {
        if (key === tableKey) update(value);
    });
    subscribeHUD("table", "survival_loading", function (name, key, value) {
        if (key === "state") acceptStartup(value);
    });
    subscribeHUD("table",
        "survival_builder_identity", function (name, key) {
            if (key === "player_" + String(playerId)) {
                scheduleInitialBuilderSelection("identity_update");
            }
        }
    );
    subscribeHUD("event", "survival_ui_private_snapshot", update);
    subscribeHUD("event", "ui_state_snapshot", update);

    subscribeHUD("event", "ui_notification", showNotification);
    subscribeHUD("event", "ui_difficulty_select_result", handleDifficultyResult);
    subscribeHUD("event", "survival_loading_mode_result", handleModeResult);
    subscribeHUD("event", "ui_camera_follow_hero", focusHeroWithoutLock);
    subscribeHUD("event", "survival_select_unit", function (data) {
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
    readStartup();
    scheduleInitialBuilderSelection("hud_ready");
    scheduleHUD(0.10, function () {
        readStartup();
        readSnapshot();
        requestSnapshot();
        scheduleRecovery(0);
    });
    // Explicit Tools console bridge: no UI refresh, request or timer is started.
    function registerReadOnlyIdleInspect() {
        try {
            if (typeof Game.IsInToolsMode !== "function" || !Game.IsInToolsMode()
                || typeof Game.AddCommand !== "function") return;
            var config = GameUI.CustomUIConfig();
            var serial = Number(config.SurvivalHUDIdleInspectSerial || 0);
            serial = isFinite(serial) && serial >= 0 ? Math.floor(serial) + 1 : 1;
            config.SurvivalHUDIdleInspectSerial = serial;
            var command = "survival_hud_idle_inspect_" + Date.now() + "_" + serial;
            var result = Game.AddCommand(command, function(){
                var args = Array.prototype.slice.call(arguments);
                var nonce = args.length ? args[args.length - 1] : null;
                var response = {api:"SurvivalHUDSnapshotSync.Inspect",command:command,readonly:true};
                if ((args.length !== 1 && !(args.length === 2 && args[0] === command))
                    || typeof nonce !== "string" || !/^[0-9a-f]{32}$/i.test(nonce)) {
                    response.status = "invalid_nonce";
                    $.Msg("[IDLE_HUD_INSPECT] " + JSON.stringify(response));
                    return;
                }
                response.nonce = nonce;
                var current = GameUI.CustomUIConfig().SurvivalHUDSnapshotSync;
                if (!syncActive() || current !== syncAPI) {
                    response.status = "inactive_context";
                    $.Msg("[IDLE_HUD_INSPECT] " + JSON.stringify(response));
                    return;
                }
                try {
                    if (!current || typeof current.Inspect !== "function") throw new Error("inspect_unavailable");
                    var state = current.Inspect() || {};
                    response.status = "ok";
                    ["hasSnapshot", "inFlight", "builderPending", "builderFinished", "recoveryScheduled", "disposed"].forEach(function(key){response[key] = typeof state[key] === "boolean" ? state[key] : null;});
                    ["epoch", "retryFailures"].forEach(function(key){
                        var value = state[key];
                        response[key] = typeof value === "number" && isFinite(value) ? value : null;
                    });
                    response.counters = {};
                    ["polls", "startupReads", "legacyReads", "requests", "requestCoalesced", "retryTimeouts", "received", "applied", "builderSteps"].forEach(function(key){
                        var value = state.counters && state.counters[key];
                        response.counters[key] = typeof value === "number" && isFinite(value) ? value : null;
                    });
                } catch (error) { response.status = "inspect_failed"; }
                $.Msg("[IDLE_HUD_INSPECT] " + JSON.stringify(response));
            }, "Tools read-only idle UI counters; requires one 32 hex nonce", 0);
            if (result === false) {
                $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalHUDSnapshotSync.Inspect",status:"registration_failed",readonly:true}));
                return;
            }
            syncAPI.InspectCommand = command;
            $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalHUDSnapshotSync.Inspect",command:command,nonce:"32hex",readonly:true}));
        } catch (error) {
            $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalHUDSnapshotSync.Inspect",status:"registration_failed",readonly:true}));
        }
    }
    registerReadOnlyIdleInspect();
})();
