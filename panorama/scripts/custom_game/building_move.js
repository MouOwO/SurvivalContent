(function () {
    "use strict";

    var panel = null;
    var moving = false;
    var selectedEnt = -1;
    var lastUnit = -1;
    var RANGE = 1000;
    var KEY_NAME = "D";

    function getPanel() {
        if (!panel) panel = $("#BuildingMoveButton");
        return panel;
    }

    function selectedUnit() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (resolver && resolver.Resolve) return Number(resolver.Resolve());
        return -1;
    }

    function isMovable(unit) {
        var name = "";
        try { name = Entities.GetUnitName(unit) || ""; } catch (e) {}
        return name === "building_wall" || name === "building_arrow_tower";
    }

    function updateButton() {
        var p = getPanel();
        if (!p) return;
        var unit = selectedUnit();
        lastUnit = unit;
        if (unit >= 0 && isMovable(unit)) {
            p.RemoveClass("Hidden");
            p.text = moving ? "取消移动" : "D 移动建筑";
        } else {
            p.AddClass("Hidden");
            moving = false;
        }
        $.Schedule(0.15, updateButton);
    }

    function beginMove() {
        var unit = selectedUnit();
        if (unit < 0 || !isMovable(unit)) return;
        selectedEnt = unit;
        moving = true;
        var p = getPanel();
        if (p) p.text = "请点击目标位置（右键取消）";
        $.Msg("[BuildingMove] select ent=" + String(selectedEnt));
    }

    function cancelMove() {
        moving = false;
        selectedEnt = -1;
        var p = getPanel();
        if (p) p.text = "D 移动建筑";
    }

    function sendPosition() {
        if (!moving || selectedEnt < 0) return false;
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
        if (!moving) return false;
        if (eventName === "pressed" && button === 0) return sendPosition();
        if (eventName === "pressed" && button === 1) {
            cancelMove();
            return true;
        }
        return false;
    }

    var customConfig = GameUI.CustomUIConfig();
    var dispatcher = customConfig.SurvivalInputDispatcher;
    if (dispatcher && dispatcher.RegisterMouseHandler) {
        dispatcher.RegisterMouseHandler("building_move", mouseCallback, 80);
    }
    var keyHandler = function (key, down) {
        if (!down || String(key).toUpperCase() !== KEY_NAME) return false;
        if (!moving && !isMovable(selectedUnit())) return false;
        if (moving) cancelMove();
        else beginMove();
        return true;
    };
    if (dispatcher && dispatcher.RegisterKeyHandler) {
        dispatcher.RegisterKeyHandler("building_move", keyHandler, 80);
    }
    GameEvents.Subscribe("ui_building_move_result", function (data) {
        if (!data || Number(data.success) === 1) return;
        $.Msg("[BuildingMove] server rejected " + String(data.error || "unknown"));
    });
    var button = $("#BuildingMoveButton");
    if (button) button.SetPanelEvent("onactivate", beginMove);
    // 按钮作为备用入口；D 键通过共享按键分发器触发同一移动流程。
    $.Schedule(0.1, updateButton);
})();
