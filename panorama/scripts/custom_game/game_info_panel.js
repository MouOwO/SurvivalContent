(function () {
    "use strict";

    var config = GameUI.CustomUIConfig();
    var previous = config.SurvivalGameInfo;
    if (previous && previous.Dispose) previous.Dispose();
    var context = $.GetContextPanel();
    var life = config.SurvivalUI.Lifecycle();
    var disposed = false;
    var dynamicPending = false;
    var renderPending = false;
    var tableSubscription = null;
    var structureKey = "";
    var renderedColumns = null;
    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_game_info";
    var tableKey = "player_" + playerId;
    var snapshot = null;
    var open = false;
    var lastToggleTime = -100;
    var rowById = {};
    var generation = Number(config.SurvivalGameInfoGeneration || 0) + 1;
    config.SurvivalGameInfoGeneration = generation;

    function panel(id) { return $("#" + id); }

    function valid(candidate) {
        try { return !!candidate && (!candidate.IsValid || candidate.IsValid()); }
        catch (error) { return false; }
    }

    function active() {
        return !disposed && valid(context)
            && config.SurvivalGameInfoGeneration === generation;
    }

    function dispose() {
        if (disposed) return;
        disposed = true;
        open = false;
        life.Dispose();
        dynamicPending = false;
        renderPending = false;
        if (tableSubscription !== null && CustomNetTables.UnsubscribeNetTableListener) {
            CustomNetTables.UnsubscribeNetTableListener(tableSubscription);
        }
        tableSubscription = null;
    }

    function setText(target, value) {
        if (target.text !== value) target.text = value;
    }

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
        var value = $.CreatePanel("Label", row, "");
        value.AddClass("GameInfoValue");
        value.AddClass("MonoNumbersFont");
        rowById[entry.id] = { row: row, label: label, value: value, entry: entry };
        return rowById[entry.id];
    }

    function render(nextSnapshot) {
        if (!active() || !open) return;
        snapshot = nextSnapshot || snapshot;
        var building = panel("GameInfoBuildingColumn");
        var hero = panel("GameInfoHeroColumn");
        if (!valid(building) || !valid(hero) || !snapshot) return;
        var fields = collectionValues(snapshot.fields).filter(function (entry) {
            return Number(entry.visible) !== 0;
        }).sort(function (left, right) {
            var order = Number(left.order || 0) - Number(right.order || 0);
            return order || String(left.id).localeCompare(String(right.id));
        });
        // Preserve native panels on value changes. Rebuild only when the field
        // layout changes, or when the engine has replaced one of our panels.
        var nextKey = JSON.stringify(fields.map(function (entry) {
            return [String(entry.id), String(entry.group || "")];
        }));
        var rebuild = nextKey !== structureKey || !renderedColumns
            || renderedColumns.building !== building || renderedColumns.hero !== hero
            || fields.some(function (entry) {
                var controls = rowById[entry.id];
                return !controls || !valid(controls.row)
                    || !valid(controls.label) || !valid(controls.value);
            });
        if (rebuild) {
            building.RemoveAndDeleteChildren();
            hero.RemoveAndDeleteChildren();
            rowById = {};
            structureKey = nextKey;
            renderedColumns = { building: building, hero: hero };
        }
        var heroIndex = snapshot.hero_entindex === undefined || snapshot.hero_entindex === null
            ? -1 : Number(snapshot.hero_entindex);
        fields.forEach(function (entry) {
            var target = String(entry.group || "") === "hero" ? hero : building;
            var controls = rowById[entry.id] || createRow(entry, target);
            controls.entry = entry;
            setText(controls.label, String(entry.label || entry.id) + "：");
            // Health comes from the native entity while visible. Do not briefly
            // write an older snapshot value before writing current health again.
            if (entry.id !== "hero_current_health" || !(heroIndex >= 0)) {
                setText(controls.value, valueText(entry));
            }
        });
        refreshDynamicValues();
    }

    function refreshDynamicValues() {
        if (!open || !snapshot) return;
        var heroIndex = snapshot.hero_entindex === undefined || snapshot.hero_entindex === null
            ? -1 : Number(snapshot.hero_entindex);
        var health = rowById.hero_current_health;
        if (health && valid(health.value) && heroIndex >= 0) {
            var current = Number(Entities.GetHealth(heroIndex) || 0);
            var maximum = Number(Entities.GetMaxHealth(heroIndex) || 0);
            setText(health.value, formatNumber(current) + " / " + formatNumber(maximum));
        }
    }

    function scheduleDynamicValues() {
        if (dynamicPending || !open || !active()) return;
        dynamicPending = true;
        life.Later(0.25, function () {
            dynamicPending = false;
            if (!active()) { dispose(); return; }
            if (!open) return;
            refreshDynamicValues();
            scheduleDynamicValues();
        });
    }

    function queueRender() {
        if (renderPending || !open) return;
        renderPending = true;
        life.Later(0, function () {
            renderPending = false;
            if (!active()) { dispose(); return; }
            render(snapshot);
        });
    }

    function requestSnapshot() {
        if (!active()) return;
        GameEvents.SendCustomGameEventToServer("ui_game_info_request", {});
    }

    function setOpen(value, source) {
        if (!active()) { dispose(); return false; }
        var root = panel("GameInfoPanel");
        if (!valid(root)) return false;
        var nextOpen = value === true;
        if (open && nextOpen) return true;
        open = nextOpen;
        root.SetHasClass("GameInfoOpen", open);
        root.SetHasClass("GameInfoClosed", !open);
        root.hittest = open;
        root.hittestchildren = open;
        if (open) {
            requestSnapshot();
            render(CustomNetTables.GetTableValue(tableName, tableKey));
            scheduleDynamicValues();
        } else {
            life.Cancel();
            dynamicPending = false;
            renderPending = false;
        }
        $.Msg("[GAME_INFO][CLIENT] state=", open ? "open" : "closed",
            " source=", String(source || "unknown"));
        return true;
    }

    function toggle(source) {
        if (!active()) { dispose(); return false; }
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        if (now - lastToggleTime < 0.08) return true;
        lastToggleTime = now;
        return setOpen(!open, source);
    }

    function close() { return setOpen(false, "close_button"); }

    function bindTab() {
        var handler = function (key, down) {
            if (!down || String(key).toUpperCase() !== "TAB") return false;
            return toggle("key_dispatch");
        };
        var dispatcher = config.SurvivalInputDispatcher;
        if (dispatcher && dispatcher.RegisterKeyHandler) {
            dispatcher.RegisterKeyHandler("game_info", handler, 40);
        }
        $.Msg("[GAME_INFO][CLIENT] TAB_BOUND generation=", String(generation));
    }

    config.SurvivalGameInfo = {
        Open: function () { return setOpen(true, "api"); },
        Close: close,
        Toggle: function () { return toggle("api"); },
        IsOpen: function () { return active() && open; },
        Refresh: requestSnapshot,
        Dispose: dispose
    };

    tableSubscription = CustomNetTables.SubscribeNetTableListener(tableName, function (name, key, value) {
        if (!active()) { dispose(); return; }
        if (key !== tableKey) return;
        snapshot = value;
        if (open) queueRender();
    });
    snapshot = CustomNetTables.GetTableValue(tableName, tableKey);
    setOpen(false, "initialize");
    bindTab();
})();
