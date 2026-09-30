(function () {
    "use strict";

    var moving = false;
    var selectedEnt = -1;
    var confirmEnt = -1;
    var MOVE_ABILITY = "ability_building_blink";
    var DESTROY_ABILITY = "ability_destroy_arrow_tower";

    function selectedUnit() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (resolver && resolver.Resolve) return Number(resolver.Resolve());
        return -1;
    }

    function isArrowTower(unit) {
        var name = "";
        try { name = Entities.GetUnitName(unit) || ""; } catch (e) {}
        return name === "building_arrow_tower";
    }

    function abilityOnUnit(unit, abilityName) {
        if (unit < 0) return -1;
        for (var slot = 0; slot < 64; slot += 1) {
            var ability = -1;
            try { ability = Entities.GetAbility(unit, slot); } catch (error) {}
            if (ability < 0) continue;
            try {
                if (Abilities.GetAbilityName(ability) === abilityName
                    && !Abilities.IsHidden(ability)) return ability;
            } catch (error) {}
        }
        return -1;
    }

    function isUtilityTower(unit) {
        return isArrowTower(unit)
            || (abilityOnUnit(unit, MOVE_ABILITY) >= 0
                && abilityOnUnit(unit, DESTROY_ABILITY) >= 0);
    }

    function visibleAbility(unit, abilityName) {
        if (!isUtilityTower(unit)) return -1;
        return abilityOnUnit(unit, abilityName);
    }

    function beginMove(unit) {
        unit = Number(unit === undefined ? selectedUnit() : unit);
        var ability = visibleAbility(unit, MOVE_ABILITY);
        if (ability < 0) return false;
        var grid = GameUI.CustomUIConfig().SurvivalGridPlacement;
        if (!grid || !grid.BeginRelocation || !grid.BeginRelocation(ability, unit)) return false;
        selectedEnt = unit;
        moving = true;
        $.Msg("[BuildingMove] grid select ent=" + String(selectedEnt));
        return true;
    }

    function cancelMove() {
        var grid = GameUI.CustomUIConfig().SurvivalGridPlacement;
        if (moving && grid && grid.CancelRelocation) grid.CancelRelocation();
        moving = false;
        selectedEnt = -1;
    }

    function confirmPanel() { return $("#ArrowTowerDestroyConfirm"); }

    function closeDestroyConfirm() {
        confirmEnt = -1;
        var panel = confirmPanel();
        if (panel) panel.AddClass("Hidden");
    }

    function openDestroyConfirm(unit) {
        unit = Number(unit === undefined ? selectedUnit() : unit);
        if (visibleAbility(unit, DESTROY_ABILITY) < 0) return false;
        cancelMove();
        confirmEnt = unit;
        var panel = confirmPanel();
        if (panel) panel.RemoveClass("Hidden");
        return true;
    }

    function confirmDestroy() {
        if (confirmEnt < 0
            || visibleAbility(confirmEnt, DESTROY_ABILITY) < 0) {
            closeDestroyConfirm();
            return false;
        }
        GameEvents.SendCustomGameEventToServer("ui_arrow_tower_destroy_request", {
            entindex: confirmEnt
        });
        closeDestroyConfirm();
        return true;
    }

    function mouseCallback(eventName, button, gameTime) {
        if (confirmEnt >= 0) return true;
        if (!moving) return false;
        if (eventName === "pressed" && button === 1) {
            cancelMove();
            return true;
        }
        return false;
    }

    function normalizeKey(key) {
        var normalized = String(key || "").toUpperCase();
        if (normalized === "ESC") return "ESCAPE";
        return normalized;
    }

    var customConfig = GameUI.CustomUIConfig();
    var dispatcher = customConfig.SurvivalInputDispatcher;
    if (dispatcher && dispatcher.RegisterMouseHandler) {
        dispatcher.RegisterMouseHandler("building_move", mouseCallback, 80);
    }
    var keyHandler = function (key, down) {
        if (!down) return false;
        var normalized = normalizeKey(key);
        if (confirmEnt >= 0) {
            if (normalized === "ESCAPE") {
                closeDestroyConfirm();
                return true;
            }
            return false;
        }
        if (normalized === "G") return openDestroyConfirm();
        if (normalized !== "D") return false;
        // Every D starts a fresh grid session, including repeated presses.
        return beginMove();
    };
    if (dispatcher && dispatcher.RegisterKeyHandler) {
        dispatcher.RegisterKeyHandler("building_move", keyHandler, 80);
    }
    GameEvents.Subscribe("ui_building_move_result", function (data) {
        if (!data || Number(data.success) === 1) return;
        $.Msg("[BuildingMove] server rejected " + String(data.error || "unknown"));
    });
    GameEvents.Subscribe("ui_arrow_tower_destroy_result", function (data) {
        if (!data || Number(data.success) === 1) return;
        $.Msg("[ArrowTowerDestroy] server rejected " + String(data.error || "unknown"));
    });
    GameUI.CustomUIConfig().SurvivalArrowTowerTools = {
        TriggerAbility: function (abilityName, unit) {
            if (abilityName === MOVE_ABILITY) return beginMove(unit);
            if (abilityName === DESTROY_ABILITY) return openDestroyConfirm(unit);
            return false;
        },
        Confirm: confirmDestroy,
        Cancel: function () {
            cancelMove();
            closeDestroyConfirm();
        }
    };

    function lifecycleTick() {
        var grid = GameUI.CustomUIConfig().SurvivalGridPlacement;
        if (moving && grid && grid.IsRelocating && !grid.IsRelocating(selectedEnt)) {
            moving = false;
            selectedEnt = -1;
        }
        if (confirmEnt >= 0 && (selectedUnit() !== confirmEnt
            || visibleAbility(confirmEnt, DESTROY_ABILITY) < 0)) {
            closeDestroyConfirm();
        }
        if (moving && (selectedUnit() !== selectedEnt
            || visibleAbility(selectedEnt, MOVE_ABILITY) < 0)) {
            cancelMove();
        }
        $.Schedule(0.1, lifecycleTick);
    }
    lifecycleTick();
})();
