(function () {
    "use strict";
    var config = GameUI.CustomUIConfig();
    if (config.SurvivalUILayers) return;
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
        stack.forEach(function (entry, index) {
            var p = entry.panel;
            while (valid(p)) {
                if (!saved.some(function (s) { return s.panel === p; })) saved.push({panel:p, z:layerValue(p.style.zIndex)});
                p.style.zIndex = String(100000 + index);
                p = p.GetParent ? p.GetParent() : null;
            }
        });
    }
    config.SurvivalUILayers = {
        Open: function (id, panel, close) {
            stack = stack.filter(function (s) { return s.id !== id; });
            stack.push({id:id, panel:panel, close:close}); apply();
        },
        Close: function (id) {
            if (!stack.some(function (s) { return s.id === id; })) return;
            stack = stack.filter(function (s) { return s.id !== id; }); apply();
        },
        CloseTop: function () { var top = stack[stack.length - 1]; if (top) top.close(); },
        Top: function () { return stack.length ? stack[stack.length - 1].id : null; }
    };
})();
