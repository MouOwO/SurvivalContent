(function () {
    "use strict";

    var config = GameUI.CustomUIConfig();
    var state = {
        visible: false,
        x: -450.0,
        y: 442.978,
        z: 158.841,
        pitch: 0.0,
        yaw: 355.0,
        roll: 0.0,
    };
    var DEFAULTS = {
        x: -450.0, y: 442.978, z: 158.841,
        pitch: 0.0, yaw: 355.0, roll: 0.0,
    };
    var BODY_DEFAULTS = {
        x: -195.0, y: 457.0, z: 71.0,
        pitch: 0.0, yaw: 203.0, roll: 0.0,
    };

    function panel(id) {
        return $.GetContextPanel().FindChildTraverse(id);
    }

    function fixed(value) {
        return (Math.round(Number(value || 0) * 1000) / 1000).toFixed(3);
    }

    function scene() {
        var current = $.GetContextPanel();
        for (var depth = 0; current && depth < 16; depth++) {
            if (current.FindChildTraverse) {
                var found = current.FindChildTraverse("SurvivalJuggernautPortraitScene");
                if (found) return found;
            }
            current = current.GetParent ? current.GetParent() : null;
        }
        return null;
    }

    function applyInput(input, value) {
        var target = scene();
        if (!target) {
            $.Warning("[SURVIVAL_PORTRAIT_CAMERA] scene_unavailable id=SurvivalJuggernautPortraitScene");
            return false;
        }
        try {
            $.DispatchEvent(
                "DOTAGlobalSceneFireEntityInput",
                target,
                "jugg_arcana_body",
                input,
                String(value)
            );
            return true;
        } catch (error) {
            $.Warning("[SURVIVAL_PORTRAIT_CAMERA] input_failed=", input,
                " error=", error);
            return false;
        }
    }

    function applyCamera(reason) {
        var origin = fixed(state.x) + " " + fixed(state.y) + " " + fixed(state.z);
        var angles = fixed(state.pitch) + " " + fixed(state.yaw) + " " + fixed(state.roll);
        // Background-map cameras are cached when DOTAScenePanel is created;
        // runtime entity I/O cannot refresh their projection. Keep this
        // legacy in-game panel safe (it no longer moves the hero out of view)
        // and use tools/portrait_camera_editor.ps1 to bake the values.
        updatePanel((reason || "已应用") + "；请使用外部编辑器编译生效");
        $.Msg("[SURVIVAL_PORTRAIT_CAMERA] APPLY reason=", String(reason || "nudge"),
            " origin=", origin, " angles=", angles,
            " runtime_refresh=false");
    }

    function updatePanel(status) {
        var values = panel("PortraitCameraEditorValues");
        var label = panel("PortraitCameraEditorStatus");
        if (values) {
            values.text = "位置  X=" + fixed(state.x) + "  Y=" + fixed(state.y)
                + "  Z=" + fixed(state.z)
                + "\n角度  Pitch=" + fixed(state.pitch)
                + "  Yaw=" + fixed(state.yaw) + "  Roll=" + fixed(state.roll);
        }
        if (label && status) label.text = String(status);
    }

    function nudge(axis, amount) {
        axis = String(axis || "");
        if (!Object.prototype.hasOwnProperty.call(state, axis)) return;
        state[axis] = Number(state[axis]) + Number(amount || 0);
        applyCamera("nudge_" + axis);
    }

    function reset() {
        Object.keys(DEFAULTS).forEach(function (key) { state[key] = DEFAULTS[key]; });
        applyCamera("reset");
    }

    function confirm() {
        var origin = fixed(state.x) + " " + fixed(state.y) + " " + fixed(state.z);
        var angles = fixed(state.pitch) + " " + fixed(state.yaw) + " " + fixed(state.roll);
        applyCamera("confirm");
        $.Msg("[SURVIVAL_PORTRAIT_CAMERA] CONFIRMED map=portraits/juggernaut_arcana_origins_v5",
            " camera=jugg_portrait_camera origin=", origin,
            " angles=", angles);
        var label = panel("PortraitCameraEditorStatus");
        if (label) label.text = "已确定，控制台已输出 VMAP 参数";
    }

    function setVisible(visible) {
        state.visible = !!visible;
        var editor = panel("SurvivalPortraitCameraEditor");
        if (editor) editor.SetHasClass("Hidden", !state.visible);
        updatePanel(state.visible ? "校准器已打开" : "已关闭");
        if (state.visible) applyCamera("open");
    }

    function registerCommands() {
        if (!Game.AddCommand) return;
        try {
            Game.AddCommand("survival_portrait_camera", function () {
                setVisible(!state.visible);
            }, "打开或关闭主宰 ScanPanel 镜头校准器", 0);
            Game.AddCommand("survival_portrait_camera_confirm", confirm,
                "输出主宰 ScanPanel 镜头参数", 0);
        } catch (error) {
            $.Warning("[SURVIVAL_PORTRAIT_CAMERA] command_registration_failed=", error);
        }
    }

    config.SurvivalPortraitCameraEditor = {
        SetVisible: setVisible,
        Toggle: function () { setVisible(!state.visible); },
        Nudge: nudge,
        Reset: reset,
        Confirm: confirm,
        GetState: function () {
            return {
                x: state.x, y: state.y, z: state.z,
                pitch: state.pitch, yaw: state.yaw, roll: state.roll,
                visible: state.visible,
            };
        },
    };

    registerCommands();
    updatePanel("准备就绪；输入 survival_portrait_camera 打开");
})();
