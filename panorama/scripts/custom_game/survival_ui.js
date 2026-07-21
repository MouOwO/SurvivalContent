(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_ui_state";
    var tableKey = "player_" + playerId;
    var lastSequence = -1;
    var lastSnapshotAt = 0;

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
        if (sequence >= 0 && sequence < lastSequence) return;
        if (sequence >= 0) lastSequence = sequence;
        lastSnapshotAt = Game.GetGameTime();

        var resources = snapshot.resources || {};
        var wave = snapshot.wave || {};
        setText("WoodValue", compactNumber(resources.wood));
        setText("GoldValue", compactNumber(resources.gold));
        setText("PopulationValue", compactNumber(resources.population) + "/" + compactNumber(resources.max_population));
        setText("CityLevelValue", "Lv." + numberValue(snapshot.city_level));
        var resourceTooltip = "木材 " + numberValue(resources.wood) + "\n金币 " + numberValue(resources.gold)
            + "\n人口 " + numberValue(resources.population) + "/" + numberValue(resources.max_population);
        ["WoodField", "GoldField", "PopulationField"].forEach(function (fieldId) {
            var field = panel(fieldId);
            if (field) field.SetPanelEvent("onmouseover", function () {
                $.DispatchEvent("DOTAShowTextTooltip", field, resourceTooltip);
            });
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

    CustomNetTables.SubscribeNetTableListener(tableName, function (name, key, value) {
        if (key === tableKey) update(value);
    });
    GameEvents.Subscribe("ui_state_snapshot", update);
    GameEvents.Subscribe("ui_notification", showNotification);

    $.Msg("[SurvivalUI] realtime HUD listener ready.");
    $.Schedule(0.10, function () {
        readSnapshot();
        requestSnapshot();
        pollSnapshot();
    });
})();
