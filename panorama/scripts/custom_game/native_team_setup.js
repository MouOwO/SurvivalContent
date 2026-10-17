(function () {
    "use strict";
    // Registered only for GameSetup. Use Valve's shipped layout, scripts and
    // styles at runtime; the Workshop install lacks their full CSS sources.
    var host = $("#NativeTeamSetupHost");
    var fallback = $("#NativeTeamSetupFallback");
    var retry = $("#NativeTeamSetupRetry");
    var mounting = false;

    function mount() {
        if (mounting || !host || !host.IsValid()) return;
        mounting = true;
        retry.enabled = false;
        fallback.visible = false;
        host.visible = true;
        try {
            host.RemoveAndDeleteChildren();
            if (!host.BLoadLayout("file://{resources}/layout/custom_game/team_select.xml", false, false)
                || !host.FindChildTraverse("TeamSelectContainer")
                || !host.FindChildTraverse("LockAndStartButton")) {
                throw new Error("Native team selection layout is unavailable");
            }
            if ($.Msg) $.Msg("[SURVIVAL_NATIVE_SETUP] event=mounted layout=team_select");
        } catch (error) {
            host.visible = false;
            fallback.visible = true;
            retry.enabled = true;
            if ($.Msg) $.Msg("[SURVIVAL_NATIVE_SETUP] event=failed layout=team_select");
        }
        mounting = false;
    }

    retry.SetPanelEvent("onactivate", mount);
    mount();
}());
