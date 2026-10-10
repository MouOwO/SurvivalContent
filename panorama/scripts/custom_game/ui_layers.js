(function () {
    "use strict";
    var config = GameUI.CustomUIConfig();
    // A child marker dies on layout reload while the native root may survive.
    // Repeated includes within a live layout preserve input/focus state.
    if (config.SurvivalUILayers && config.SurvivalUILayers.version === "3.0.0" &&
        config.SurvivalUILayers.IsAlive && config.SurvivalUILayers.IsAlive()) {
        config.SurvivalUILayers.BindInput(config.SurvivalInputDispatcher);
        return;
    }
    // Release old leases during a live script upgrade before changing layer spacing.
    if (config.SurvivalUILayers && (!config.SurvivalUILayers.IsAlive || config.SurvivalUILayers.IsAlive())) {
        var old = config.SurvivalUILayers, previous, attempts = 0;
        while ((previous = old.Top()) && attempts++ < 64) {
            old.CloseTop();
            if (old.Top() === previous) old.Close(previous);
        }
    }
    var stack = [], saved = [];
    var lifetimeMarker=$.CreatePanel?$.CreatePanel("Panel",$.GetContextPanel(),""):$.GetContextPanel();
    if($.CreatePanel){lifetimeMarker.hittest=false;lifetimeMarker.hittestchildren=false;lifetimeMarker.visible=false;}
    var callbackGeneration=(config.SurvivalLayerCallbackGeneration||0)+1;
    config.SurvivalLayerCallbackGeneration=callbackGeneration;
    var escapeHeld = false, pressConsumed = false, lastEscapeAt = -1000;
    var pendingCancelledPress = false;
    var boundDispatcher = null;
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    function focus(p) {
        if (!valid(p)) return;
        if (p.SetAcceptsFocus) p.SetAcceptsFocus(true);
        if (p.SetFocus) p.SetFocus();
    }
    function prune() {
        var remaining = stack.filter(function (entry) { return valid(entry.panel); });
        if (remaining.length !== stack.length) { stack = remaining; apply(); }
    }
    function bindCancel(id, panel) {
        if (!valid(panel) || !$.RegisterEventHandler) return;
        panel.__survivalEscapeLayerId = id;
        if (panel.__survivalEscapeGeneration === callbackGeneration) return;
        panel.__survivalEscapeGeneration = callbackGeneration;
        $.RegisterEventHandler("Cancelled", panel, function () {
            var layers = GameUI.CustomUIConfig().SurvivalUILayers;
            return !!(layers && layers.HandleEscape(panel.__survivalEscapeLayerId));
        });
    }
    function handleEscape(expectedId) {
        prune();
        var top = stack[stack.length - 1];
        if (!top || (expectedId && top.id !== expectedId)) return false;
        var time = Date.now();
        // Native key input and a focused panel's Cancelled can report one press
        // twice. A held key must not walk down the modal stack either.
        if ((escapeHeld && pressConsumed) || time - lastEscapeAt < 90) return true;
        lastEscapeAt = time;
        if (escapeHeld) pressConsumed = true;
        else pendingCancelledPress = true;
        top.close("escape");
        return true;
    }
    function handleKey(key, down) {
        var normalized = String(key === undefined ? "" : key).toUpperCase();
        if (normalized !== "ESC" && normalized !== "ESCAPE" && normalized !== "27") return false;
        if (down === false || down === 0) {
            var consumed = pressConsumed;
            escapeHeld = false; pressConsumed = false; pendingCancelledPress = false; lastEscapeAt = -1000;
            return consumed;
        }
        if (escapeHeld) return pressConsumed;
        escapeHeld = true;
        // Cancelled may have arrived first and already removed the original top.
        pressConsumed = pendingCancelledPress || Date.now() - lastEscapeAt < 90 || handleEscape();
        pendingCancelledPress = false;
        return pressConsumed;
    }
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
        version: "3.0.0",
        IsAlive:function(){return valid(lifetimeMarker);},
        Open: function (id, panel, close, input) {
            prune();
            var previous = stack[stack.length - 1];
            bindCancel(id, panel);
            stack = stack.filter(function (s) { return s.id !== id; });
            stack.push({id:id, panel:panel, close:close, input:input}); apply();
            if (!previous || previous.id !== id || previous.panel !== panel) focus(panel);
        },
        Close: function (id) {
            if (!stack.some(function (s) { return s.id === id; })) return;
            stack = stack.filter(function (s) { return s.id !== id; }); apply();
        },
        CloseTop: function () { prune(); var top = stack[stack.length - 1]; if (top) top.close(); },
        HandleEscape: handleEscape,
        BindInput: function (dispatcher) {
            if (!dispatcher || !dispatcher.RegisterKeyHandler || dispatcher === boundDispatcher) return;
            boundDispatcher = dispatcher;
            escapeHeld = false; pressConsumed = false; pendingCancelledPress = false; lastEscapeAt = -1000;
            dispatcher.RegisterKeyHandler("modal_escape", handleKey, 1100);
        },
        Top: function () { prune(); return stack.length ? stack[stack.length - 1].id : null; }
    };
    config.SurvivalUILayers.BindInput(config.SurvivalInputDispatcher);
})();
