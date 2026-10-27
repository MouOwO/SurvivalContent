(function () {
    "use strict";
    // Server-side native_setup_auto_start owns assignment and Valve's countdown.
    // Retire only this obsolete layout's authored subtree, including hot-reload
    // remnants. Do not hide engine siblings or issue client start/team commands.
    var host = $("#NativeTeamSetupHost"), fallback = $("#NativeTeamSetupFallback");
    var scope = host && host.GetParent ? host.GetParent() : host;
    [scope, host, fallback].forEach(function (panel) {
        if (!panel || !panel.IsValid()) return;
        panel.visible = false; panel.hittest = false; panel.hittestchildren = false;
        panel.style.visibility = "collapse";
    });
}());
