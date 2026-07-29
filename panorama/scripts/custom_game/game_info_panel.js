(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_game_info";
    var tableKey = "player_" + playerId;
    var snapshot = null;
    var open = false;
    var lastToggleTime = -100;
    var rowById = {};
    var generation = Number(
        GameUI.CustomUIConfig().SurvivalGameInfoGeneration || 0
    ) + 1;
    GameUI.CustomUIConfig().SurvivalGameInfoGeneration = generation;

    function panel(id) { return $("#" + id); }

    function collectionValues(collection) {
        var result = [];
        if (!collection) return result;
        Object.keys(collection).forEach(function (key) {
            if (collection[key] !== undefined && collection[key] !== null) {
                result.push(collection[key]);
            }
        });
        return result;
    }

    function formatNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        if (formatter && formatter.Format) return formatter.Format(Number(value || 0));
        var number = Number(value || 0);
        return Math.abs(number - Math.round(number)) < 0.001
            ? String(Math.round(number)) : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    }

    function valueText(entry) {
        var value = entry && entry.value;
        var text = typeof value === "number" ? formatNumber(value) : String(value || "");
        return text + String(entry && entry.suffix || "");
    }

    function createRow(entry, parent) {
        var row = $.CreatePanel("Panel", parent, "");
        row.AddClass("GameInfoRow");
        var label = $.CreatePanel("Label", row, "");
        label.AddClass("GameInfoLabel");
        label.text = String(entry.label || entry.id) + "：";
        var value = $.CreatePanel("Label", row, "");
        value.AddClass("GameInfoValue");
        value.AddClass("MonoNumbersFont");
        rowById[entry.id] = { row: row, label: label, value: value, entry: entry };
        return rowById[entry.id];
    }

    function render(nextSnapshot) {
        snapshot = nextSnapshot || snapshot;
        var building = panel("GameInfoBuildingColumn");
        var hero = panel("GameInfoHeroColumn");
        if (!building || !hero || !snapshot) return;
        building.RemoveAndDeleteChildren();
        hero.RemoveAndDeleteChildren();
        rowById = {};
        var fields = collectionValues(snapshot.fields).sort(function (left, right) {
            var order = Number(left.order || 0) - Number(right.order || 0);
            return order || String(left.id).localeCompare(String(right.id));
        });
        fields.forEach(function (entry) {
            if (Number(entry.visible) === 0) return;
            var target = String(entry.group || "") === "hero" ? hero : building;
            var controls = createRow(entry, target);
            controls.value.text = valueText(entry);
        });
        refreshDynamicValues();
    }

    function refreshDynamicValues() {
        if (!open || !snapshot) return;
        var heroIndex = Number(snapshot.hero_entindex || -1);
        var health = rowById.hero_current_health;
        if (health && heroIndex >= 0) {
            var current = Number(Entities.GetHealth(heroIndex) || 0);
            var maximum = Number(Entities.GetMaxHealth(heroIndex) || 0);
            health.value.text = formatNumber(current) + " / " + formatNumber(maximum);
        }
    }

    function dynamicTick() {
        refreshDynamicValues();
        $.Schedule(open ? 0.25 : 1.0, dynamicTick);
    }

    function requestSnapshot() {
        GameEvents.SendCustomGameEventToServer("ui_game_info_request", {});
    }

    function setOpen(value, source) {
        open = value === true;
        var root = panel("GameInfoPanel");
        if (!root) return false;
        root.SetHasClass("GameInfoOpen", open);
        root.SetHasClass("GameInfoClosed", !open);
        root.hittest = open;
        root.hittestchildren = open;
        if (open) {
            requestSnapshot();
            render(CustomNetTables.GetTableValue(tableName, tableKey));
        }
        $.Msg("[GAME_INFO][CLIENT] state=", open ? "open" : "closed",
            " source=", String(source || "unknown"));
        return true;
    }

    function toggle(source) {
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        if (now - lastToggleTime < 0.08) return true;
        lastToggleTime = now;
        return setOpen(!open, source);
    }

    function close() { return setOpen(false, "close_button"); }

    function bindTab() {
        var config = GameUI.CustomUIConfig();
        var command = "survival_toggle_game_info_" + String(generation);
        if (Game.AddCommand && Game.CreateCustomKeyBind) {
            Game.AddCommand(command, function () { toggle("command"); }, "打开游戏信息", 0);
            Game.AddCommand("+" + command, function () { toggle("+command"); }, "按下游戏信息", 0);
            Game.AddCommand("-" + command, function () {}, "松开游戏信息", 0);
            Game.CreateCustomKeyBind("TAB", command);
            $.Schedule(0.5, function () { Game.CreateCustomKeyBind("TAB", command); });
            $.Schedule(2.5, function () { Game.CreateCustomKeyBind("TAB", command); });
        }
        var handler = function (key, down) {
            if (!down || String(key).toUpperCase() !== "TAB") return false;
            return toggle("key_dispatch");
        };
        config.SurvivalKeyHandlers = config.SurvivalKeyHandlers || [];
        config.SurvivalKeyHandlers.push(handler);
        $.Msg("[GAME_INFO][CLIENT] TAB_BOUND generation=", String(generation));
    }

    GameUI.CustomUIConfig().SurvivalGameInfo = {
        Open: function () { return setOpen(true, "api"); },
        Close: close,
        Toggle: function () { return toggle("api"); },
        IsOpen: function () { return open; },
        Refresh: requestSnapshot
    };

    CustomNetTables.SubscribeNetTableListener(tableName, function (name, key, value) {
        if (key !== tableKey) return;
        snapshot = value;
        if (open) render(value);
    });
    snapshot = CustomNetTables.GetTableValue(tableName, tableKey);
    setOpen(false, "initialize");
    bindTab();
    dynamicTick();
})();