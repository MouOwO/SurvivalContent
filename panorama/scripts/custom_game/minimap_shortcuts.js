(function () {
    "use strict";
    var BASE_WIDTH = 64, BASE_HEIGHT = 158;
    function overlaps(a, b) {
        return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    }
    function layout(width, height, geometry, obstacles) {
        var scale = Math.max(0.9, Math.min(1.12, height / 941));
        var result = { x: geometry.minimapSize + 26, y: height - 18 - BASE_HEIGHT * scale,
            width: BASE_WIDTH * scale, height: BASE_HEIGHT * scale, scale: scale };
        // Preserve the map's right margin. Narrow windows place the shortcuts
        // higher, above whichever part of the lower HUD occupies this column.
        result.x = Math.min(result.x, width - result.width - 6);
        var occupied = [{x: geometry.x, y: geometry.y, width: geometry.width * geometry.scale,
            height: geometry.height * geometry.scale}].concat(obstacles || []);
        for (var pass = 0; pass <= occupied.length; pass++) {
            var nextY = result.y;
            occupied.forEach(function (rect) {
                if (overlaps(result, rect)) nextY = Math.min(nextY, rect.y - result.height - 8);
            });
            if (nextY === result.y) break;
            result.y = nextY;
        }
        result.y = Math.max(8, result.y);
        return result;
    }
    if (typeof module !== "undefined" && module.exports) {
        module.exports = { Layout: layout, Overlaps: overlaps };
        return;
    }
    var cfg = GameUI.CustomUIConfig(), ctx = $.GetContextPanel();
    var panel = ctx.FindChildTraverse("SurvivalMinimapShortcuts"), ready = false;
    if (!panel) return;
    panel.RemoveAndDeleteChildren();
    function valid(node) { return node && (!node.IsValid || node.IsValid()); }
    function style(node, values) {
        Object.keys(values).forEach(function (key) {
            if (String(node.style[key]) !== String(values[key])) node.style[key] = values[key];
        });
    }
    function create(type, parent, id, className) {
        var node = $.CreatePanel(type, parent, id);
        if (className) node.AddClass(className);
        node.hittest = type === "Button";
        node.hittestchildren = false;
        return node;
    }
    var actions = [
        { id: "SurvivalSelectBuilderShortcut", key: "空格", api: "SurvivalBuilderSelection", can: "CanSelect", run: "Select", hero: "npc_dota_hero_ogre_magi" },
        { id: "SurvivalReturnHomeShortcut", key: "F2", api: "SurvivalReturnHomeInput", can: "CanRequest", run: "Request", image: "file://{images}/spellicons/survival/native/skill_return.png" }
    ];
    function canActivate(action) {
        if (!ready || !valid(panel) || panel.visible === false) return false;
        var guard = cfg.SurvivalShortcutGuard, layers = cfg.SurvivalUILayers, api = cfg[action.api];
        if (!guard || !guard.IsBlocked || guard.IsBlocked()) return false;
        if (layers && layers.Top && layers.Top()) return false;
        return !!(api && typeof api[action.can] === "function" && typeof api[action.run] === "function" && api[action.can]());
    }
    function activate(action) {
        if (!canActivate(action)) return false;
        return cfg[action.api][action.run]("minimap_shortcut");
    }
    actions.forEach(function (action, index) {
        var button = create("Button", panel, action.id, "MinimapShortcutButton");
        button.style.position = "0px " + (index * 82) + "px 0px";
        var icon = create(action.hero ? "DOTAHeroImage" : "Image", button, action.id + "Icon", "MinimapShortcutIcon");
        if (action.hero) { icon.heroname = action.hero; icon.heroimagestyle = "icon"; }
        else icon.SetImage(action.image);
        var key = create("Label", button, action.id + "Key", "MinimapShortcutKey"); key.text = action.key;
        button.SetPanelEvent("onactivate", function () { activate(action); });
        action.button = button;
    });
    function productionBounds() {
        var production = ctx.FindChildTraverse("SurvivalProductionPanel");
        if (!valid(production) || production.visible === false) return [];
        var xy = String(production.style.position || "").split(/\s+/);
        var x = parseFloat(xy[0]), y = parseFloat(xy[1]);
        var width = Number(production.__survivalWindowWidth) / (Number(ctx.actualuiscale_x) || 1);
        var height = Number(production.__survivalWindowHeight) / (Number(ctx.actualuiscale_y) || 1);
        return isFinite(x) && isFinite(y) && width > 0 && height > 0 ? [{x: x, y: y, width: width, height: height}] : [];
    }
    function refresh(geometry, isReady) {
        if (!valid(panel)) return;
        ready = !!(isReady && geometry);
        panel.visible = ready;
        if (!ready) return;
        var viewportScaleX = Number(ctx.actualuiscale_x) || 1, viewportScaleY = Number(ctx.actualuiscale_y) || 1;
        var width = (Number(ctx.actuallayoutwidth) || 1672) / viewportScaleX;
        var height = (Number(ctx.actuallayoutheight) || 941) / viewportScaleY;
        var bounds = layout(width, height, geometry, productionBounds());
        style(panel, { position: bounds.x + "px " + bounds.y + "px 0px", width: BASE_WIDTH + "px", height: BASE_HEIGHT + "px",
            transform: "scale3d(" + bounds.scale + "," + bounds.scale + ",1)", transformOrigin: "0% 0%" });
        // World overlays use physical window pixels, including this transform.
        panel.__survivalWindowWidth = bounds.width * viewportScaleX;
        panel.__survivalWindowHeight = bounds.height * viewportScaleY;
        actions.forEach(function (action) {
            var available = canActivate(action);
            action.button.enabled = available;
            action.button.SetHasClass("Unavailable", !available);
        });
    }
    cfg.SurvivalMinimapShortcuts = { Refresh: refresh };
})();