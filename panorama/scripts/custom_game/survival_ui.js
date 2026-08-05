(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_ui_state";
    var tableKey = "player_" + playerId;
    var lastSequence = -1;
    var lastSnapshotAt = 0;
    var difficultyRequestPending = false;
    var difficultyOptionsSignature = "";
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

    function selectDifficulty(difficultyId) {
        if (difficultyRequestPending || !difficultyId) return;
        difficultyRequestPending = true;
        var overlay = panel("DifficultySelectionOverlay");
        if (overlay) overlay.SetHasClass("DifficultyPending", true);
        setText("DifficultySelectionError", "正在确认难度……");
        GameEvents.SendCustomGameEventToServer("ui_difficulty_select_request", {
            difficulty_id: difficultyId
        });
    }

    function renderDifficultySelection(wave) {
        var overlay = panel("DifficultySelectionOverlay");
        var container = panel("DifficultySelectionButtons");
        if (!overlay || !container) return;
        var selected = isDifficultySelected(wave);
        var shouldShow = !selected && wave.status === "selecting_difficulty";
        overlay.SetHasClass("DifficultySelectionHidden", !shouldShow);
        if (!shouldShow) {
            difficultyRequestPending = false;
            overlay.SetHasClass("DifficultyPending", false);
            return;
        }

        var options = optionArray(wave.difficulty_options);
        var signature = options.map(function (option) {
            return [
                option.difficulty_id,
                option.display_name,
                option.subtitle,
                option.total_waves
            ].join("|");
        }).join(";");
        if (signature === difficultyOptionsSignature) return;
        difficultyOptionsSignature = signature;
        container.RemoveAndDeleteChildren();
        options.forEach(function (option) {
            var button = $.CreatePanel("Button", container, "");
            button.AddClass("DifficultyOptionButton");
            var header = $.CreatePanel("Panel", button, "");
            header.AddClass("DifficultyOptionHeader");
            var name = $.CreatePanel("Label", header, "");
            name.AddClass("DifficultyOptionName");
            name.text = option.display_name || option.difficulty_id || "";
            var subtitle = $.CreatePanel("Label", header, "");
            subtitle.AddClass("DifficultyOptionSubtitle");
            subtitle.text = option.subtitle || (String(option.total_waves || 0) + " 波");
            button.SetPanelEvent("onactivate", function () {
                selectDifficulty(String(option.difficulty_id || ""));
            });
        });
        if (options.length === 0) {
            var loading = $.CreatePanel("Label", container, "");
            loading.text = "正在读取难度配置……";
        }
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
            shop: Number(snapshot.shop_unlocked || 0) === 1,
            research: Number(snapshot.research_unlocked || 0) === 1
        };
        GameUI.CustomUIConfig().SurvivalShopUnlocks = unlocks;
        var shopButton = panel("CustomShopButton");
        var researchButton = panel("CustomResearchButton");
        if (shopButton) shopButton.SetHasClass("Locked", !unlocks.shop);
        if (researchButton) researchButton.SetHasClass("Locked", !unlocks.research);
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
        var overlay = panel("DifficultySelectionOverlay");
        if (overlay) overlay.SetHasClass("DifficultyPending", false);
        var errorText = payload && payload.error === "difficulty_locked"
            ? "本局难度已经锁定"
            : "难度选择失败，请重试";
        setText("DifficultySelectionError", errorText);
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
        readSnapshot();
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
    CustomNetTables.SubscribeNetTableListener(
        "survival_builder_identity", function (name, key) {
            if (key === "player_" + String(playerId)) {
                scheduleInitialBuilderSelection("identity_update");
            }
        }
    );
    GameEvents.Subscribe("ui_state_snapshot", update);
    GameEvents.Subscribe("ui_notification", showNotification);
    GameEvents.Subscribe("ui_difficulty_select_result", handleDifficultyResult);
    GameEvents.Subscribe("ui_camera_follow_hero", focusHeroWithoutLock);
    GameEvents.Subscribe("survival_select_unit", function (data) {
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
        readSnapshot();
        requestSnapshot();
        pollSnapshot();
    });
})();
