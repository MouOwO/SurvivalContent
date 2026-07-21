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
        try {
            var unit = Players.GetLocalPlayerPortraitUnit();
            return unit === undefined || unit === null ? -1 : Number(unit);
        } catch (e) {
            return -1;
        }
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
    customConfig.SurvivalMouseHandlers = customConfig.SurvivalMouseHandlers || [];
    customConfig.SurvivalMouseHandlers.push(mouseCallback);
    if (!customConfig.SurvivalMouseDispatcherBound) {
        customConfig.SurvivalMouseDispatcherBound = true;
        GameUI.SetMouseCallback(function (eventName, button, gameTime) {
            var handlers = customConfig.SurvivalMouseHandlers || [];
            for (var index = 0; index < handlers.length; index++) {
                if (handlers[index](eventName, button, gameTime)) return true;
            }
            return false;
        });
    }
    customConfig.SurvivalKeyHandlers = customConfig.SurvivalKeyHandlers || [];
    customConfig.SurvivalKeyHandlers.push(function (key, down) {
        if (!down || String(key).toUpperCase() !== KEY_NAME) return false;
        if (moving) cancelMove();
        else beginMove();
        return true;
    });
    if (Game.AddCommand && Game.CreateCustomKeyBind) {
        Game.AddCommand("survival_move_building", function () {
            if (moving) cancelMove();
            else beginMove();
        }, "移动当前建筑", 0);
        Game.CreateCustomKeyBind(KEY_NAME, "survival_move_building");
    }
    if (GameUI.SetKeyPressedCallback && !customConfig.SurvivalKeyDispatcherBound) {
        customConfig.SurvivalKeyDispatcherBound = true;
        GameUI.SetKeyPressedCallback(function (key, down) {
            var handlers = customConfig.SurvivalKeyHandlers || [];
            for (var index = 0; index < handlers.length; index++) {
                if (handlers[index](key, down)) return true;
            }
            return false;
        }, this);
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
