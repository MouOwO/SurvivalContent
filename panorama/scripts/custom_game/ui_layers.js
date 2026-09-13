(function () {
    "use strict";
    var config = GameUI.CustomUIConfig();
    if (config.SurvivalUILayers && config.SurvivalUILayers.version === "2.0.0") return;
    // Release old leases during a live script upgrade before changing layer spacing.
    if (config.SurvivalUILayers) {
        var old = config.SurvivalUILayers, previous, attempts = 0;
        while ((previous = old.Top()) && attempts++ < 64) {
            old.CloseTop();
            if (old.Top() === previous) old.Close(previous);
        }
    }
    var stack = [], saved = [];
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    function layerValue(value) {
        // An unset inline style reads as empty. Panorama's native style setter
        // requires a numeric z-index; writing that empty value aborts Close.
        var text = String(value === undefined || value === null ? "" : value);
        return /^-?\d+$/.test(text) ? text : "0";
    }
    function restore() {
        saved.forEach(function (entry) { if (valid(entry.panel)) entry.panel.style.zIndex = layerValue(entry.z); });
        saved = [];
    }
    function apply() {
        restore();
        function set(p, z) {
            if (!valid(p)) return;
            if (!saved.some(function (s) { return s.panel === p; })) saved.push({panel:p, z:layerValue(p.style.zIndex)});
            p.style.zIndex = String(z);
        }
        stack.forEach(function (entry, index) {
            var p = entry.panel;
            while (valid(p)) {
                set(p, 100000 + index * 2);
                p = p.GetParent ? p.GetParent() : null;
            }
        });
        // Reserve a level BETWEEN successive windows for each outside-click area.
        // Recompute on every stack change, not just when that modal first opens.
        stack.forEach(function (entry, index) {
            var input = entry.input;
            if (!input) return;
            set(input.scrim, 99999 + index * 2);
            if (input.click !== input.scrim) set(input.click, 0);
        });
    }
    config.SurvivalUILayers = {
        version: "2.0.0",
        Open: function (id, panel, close, input) {
            stack = stack.filter(function (s) { return s.id !== id; });
            stack.push({id:id, panel:panel, close:close, input:input}); apply();
        },
        Close: function (id) {
            if (!stack.some(function (s) { return s.id === id; })) return;
            stack = stack.filter(function (s) { return s.id !== id; }); apply();
        },
        CloseTop: function () { var top = stack[stack.length - 1]; if (top) top.close(); },
        Top: function () { return stack.length ? stack[stack.length - 1].id : null; }
    };
})();
