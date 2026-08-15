(function () {
    "use strict";

    var moving = false;
    var selectedEnt = -1;
    var confirmEnt = -1;
    var RANGE = 1000;
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

    function visibleAbility(unit, abilityName) {
        if (unit < 0 || !isArrowTower(unit)) return -1;
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

    function beginMove(unit) {
        unit = Number(unit === undefined ? selectedUnit() : unit);
        if (visibleAbility(unit, MOVE_ABILITY) < 0) return false;
        selectedEnt = unit;
        moving = true;
        var hint = $("#SurvivalPointTargetHint");
        if (hint) {
            hint.text = "请选择箭塔移动位置（右键取消）";
            hint.AddClass("PointTargetActive");
        }
        $.Msg("[BuildingMove] select ent=" + String(selectedEnt));
        return true;
    }

    function cancelMove() {
        moving = false;
        selectedEnt = -1;
        var hint = $("#SurvivalPointTargetHint");
        if (hint) hint.RemoveClass("PointTargetActive");
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

    function sendPosition() {
        if (!moving || selectedEnt < 0
            || visibleAbility(selectedEnt, MOVE_ABILITY) < 0) {
            cancelMove();
            return false;
        }
        var screen = GameUI.GetCursorPosition();
        var world = GameUI.GetScreenWorldPosition(screen);
        if (!world) {
            $.Msg("[BuildingMove] no world position");
            return true;
        }
        var origin = Entities.GetAbsOrigin(selectedEnt);
        var dx = world[0] - origin[0];
        var dy = world[1] - origin[1];
        if (Math.sqrt(dx * dx + dy * dy) > RANGE) {
            $.Msg("[BuildingMove] rejected range");
            cancelMove();
            return true;
        }
        GameEvents.SendCustomGameEventToServer("ui_building_move_request", {
            entindex: selectedEnt,
            x: world[0], y: world[1], z: world[2]
        });
        $.Msg("[BuildingMove] request ent=" + String(selectedEnt));
        cancelMove();
        return true;
    }

    function mouseCallback(eventName, button, gameTime) {
        if (confirmEnt >= 0) return true;
        if (!moving) return false;
        if (eventName === "pressed" && button === 0) return sendPosition();
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
        if (moving) {
            cancelMove();
            return true;
        }
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
