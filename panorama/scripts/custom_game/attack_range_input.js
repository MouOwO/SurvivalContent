(function () {
    "use strict";

    var config = GameUI.CustomUIConfig();
    var dispatcher = config.SurvivalInputDispatcher;
    if (!dispatcher || !dispatcher.RegisterKeyHandler) return;

    var visible = false;
    var currentUnit = -1;

    function selectedUnit() {
        var resolver = config.SurvivalSelectionResolver;
        if (!resolver || !resolver.Resolve) return -1;
        var resolved = resolver.ResolveDisplayUnit
            ? resolver.ResolveDisplayUnit()
            : resolver.Resolve();
        var unit = Number(resolved);
        return isFinite(unit) && unit >= 0 ? unit : -1;
    }

    function send(pressed) {
        var unit = pressed ? selectedUnit() : currentUnit;
        if (pressed && unit < 0) return;
        if (pressed) currentUnit = unit;
        visible = pressed;
        GameEvents.SendCustomGameEventToServer("survival_attack_range_visibility", {
            visible: pressed ? 1 : 0,
            entindex: unit
        });
    }

    dispatcher.RegisterKeyHandler("attack_range_visibility", function (key, down) {
        if (String(key).toUpperCase() !== "A") return false;
        var pressed = down !== false;
        if (pressed === visible) return false;
        send(pressed);
        // Do not consume A: Valve must receive it for native A-click.
        return false;
    }, 20);
})();