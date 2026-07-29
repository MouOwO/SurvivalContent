(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_ui_state";
    var tableKey = "player_" + playerId;
    var lastSequence = -1;
    var lastSnapshotAt = 0;
    var cameraFollowSerial = 0;

    var waveStatusText = {
        dev_mode: "准备阶段",
        waiting: "准备阶段",
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
            "波次 " + numberValue(wave.current_wave)
                + "/" + numberValue(wave.total_waves || 30)
        );
        var phase = waveStatusText[wave.status] || "准备阶段";
        setText("WaveState", phase);
        setText("WaveTimer", "倒计时 " + Math.max(0, Math.ceil(Number(wave.timer || 0))) + "秒");
        setText("AliveValue", "存活 " + numberValue(wave.alive));
        setText("PendingValue", "待生成 " + numberValue(wave.pending));
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

    function followHeroUntilArrival(payload) {
        if (!payload || !GameUI.SetCameraTarget) return;
        var entindex = Number(payload.entindex || payload.focus_hero_entindex || -1);
        if (entindex <= 0) return;
        var x = Number(payload.target_x !== undefined
            ? payload.target_x : payload.focus_target_x);
        var y = Number(payload.target_y !== undefined
            ? payload.target_y : payload.focus_target_y);
        var z = Number(payload.target_z !== undefined
            ? payload.target_z : payload.focus_target_z);
        var hasTarget = isFinite(x) && isFinite(y) && isFinite(z);
        var startedAt = Game.GetGameTime();
        var serial = ++cameraFollowSerial;
        GameUI.SetCameraTarget(entindex);

        function checkArrival() {
            if (serial !== cameraFollowSerial) return;
            var elapsed = Game.GetGameTime() - startedAt;
            var arrived = false;
            if (hasTarget && Entities.IsValidEntity(entindex)) {
                var origin = Entities.GetAbsOrigin(entindex);
                if (origin) {
                    var dx = Number(origin[0]) - x;
                    var dy = Number(origin[1]) - y;
                    arrived = dx * dx + dy * dy <= 180 * 180;
                }
            }
            // Keep official hero-follow active until the teleport reaches the
            // client. Timeout prevents a deleted entity from locking camera.
            if ((elapsed >= 0.20 && arrived) || elapsed >= 5.0) {
                GameUI.SetCameraTarget(-1);
                return;
            }
            $.Schedule(0, checkArrival);
        }
        $.Schedule(0, checkArrival);
    }
    CustomNetTables.SubscribeNetTableListener(tableName, function (name, key, value) {
        if (key === tableKey) update(value);
    });
    GameEvents.Subscribe("ui_state_snapshot", update);
    GameEvents.Subscribe("ui_notification", showNotification);
    GameEvents.Subscribe("ui_camera_follow_hero", followHeroUntilArrival);
    GameUI.CustomUIConfig().SurvivalCamera = {
        FollowHeroUntilArrival: followHeroUntilArrival
    };

    $.Msg("[SurvivalUI] realtime HUD listener ready.");
    $.Schedule(0.10, function () {
        readSnapshot();
        requestSnapshot();
        pollSnapshot();
    });
})();
