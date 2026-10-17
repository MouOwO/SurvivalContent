(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), owner = $.GetContextPanel(), U = cfg.SurvivalUI;
    if (cfg.SurvivalCollectionNav && cfg.SurvivalCollectionNav.Dispose) cfg.SurvivalCollectionNav.Dispose();
    if (!U || !U.Lifecycle) return;
    var life = U.Lifecycle(), disposed = false, host, top, button, icon, halo, captionHost, caption, underline;
    var anchors = [], reference, parts = {};
    var navKeys = ["return", "treasure", "archive", "lottery", "benefit", "shop", "survival_shop", "vip"];
    var generation = null, layoutSignature = "", stateSignature = "", retryTicks = 0;
    var marker = $.CreatePanel("Panel", owner, "");
    marker.visible = false; marker.hittest = false; marker.hittestchildren = false;
    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function alive() { return !disposed && valid(owner) && valid(marker); }
    function visible(panel) {
        if (!valid(panel) || panel.visible === false || String(panel.style.visibility) === "collapse") return false;
        var opacity = String(panel.style.opacity === undefined ? "" : panel.style.opacity).trim();
        return opacity === "" || Number(opacity) !== 0;
    }
    function bounds(panel) {
        if (!valid(panel)) return null;
        var position = String(panel.style.position || "").trim().split(/\s+/);
        var x = parseFloat(position[0]), y = parseFloat(position[1]), width = parseFloat(panel.style.width), height = parseFloat(panel.style.height);
        // Do not infer a usable layout from Panorama's zero-sized boot frame.
        if (![x, y, width, height].every(isFinite) || width <= 0 || height <= 0) return null;
        return {x:x, y:y, width:width, height:height};
    }
    function style(panel, values) { Object.keys(values).forEach(function (key) { panel.style[key] = values[key]; }); }
    function create(type, parent, id, cls) {
        var panel = $.CreatePanel(type, parent, id);
        panel.hittest = false; panel.hittestchildren = false;
        if (cls) panel.AddClass(cls);
        return panel;
    }
    function activate() {
        if (!alive() || !valid(button) || !visible(button) || button.enabled === false) return;
        var layers = cfg.SurvivalUILayers, view = cfg.SurvivalCollection;
        if (layers && layers.Top() === "collection") {
            if (view && typeof view.Close === "function") view.Close();
        } else if (cfg.SurvivalPurpleShell && cfg.SurvivalPurpleShell.Navigate) {
            // Navigate closes known menus and refuses purchase confirmations or
            // other modal layers. Never bypass that guard with a direct Open.
            cfg.SurvivalPurpleShell.Navigate("collection");
        }
        refresh();
    }
    function build() {
        if (valid(button)) button.DeleteAsync(0);
        button = create("Button", host, "HandoffNav_collection", "HandoffNav");
        button.AddClass("HandoffNavUnified"); button.AddClass("HandoffCanvas");
        button.visible = false;
        button.hittest = true; button.hittestchildren = false;
        style(button, {flowChildren:"none", margin:"0px", padding:"0px", borderRadius:"0px", horizontalAlign:"left", verticalAlign:"top"});
        halo = create("Panel", button, "HandoffCollectionGlow", "HandoffNavGlow");
        icon = create("Image", button, "HandoffCollectionIcon");
        icon.SetImage("file://{images}/custom_game/topnav_reference_v2/collection.svg");
        captionHost = create("Panel", button, "HandoffCollectionCaptionHost");
        caption = create("Label", captionHost, "HandoffCollectionCaption", "HandoffNavCaption");
        caption.text = "收藏";
        style(caption, {position:"0px 0px 0px", width:"fit-children", maxWidth:"100%", height:"fit-children", minHeight:"0px", horizontalAlign:"center", verticalAlign:"center", margin:"0px", padding:"0px", fontFamily:'"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif', fontWeight:"bold", textAlign:"center", whiteSpace:"nowrap", textOverflow:"clip"});
        underline = create("Panel", button, "HandoffCollectionUnderline", "HandoffNavUnderline");
        button.SetPanelEvent("onactivate", activate);
        layoutSignature = ""; stateSignature = "";
    }
    function acquire() {
        var nextGeneration = cfg.HandoffGeneration || 0;
        var attached = valid(host) && valid(top) && top.GetParent() === host && valid(reference);
        if (attached) attached = anchors.every(function (entry) { return !entry.panel || (valid(entry.panel) && entry.panel.GetParent() === top); });
        if (attached) attached = Object.keys(parts).every(function (key) { return !parts[key] || valid(parts[key]); });
        if (generation === nextGeneration && attached) return true;
        if (generation === nextGeneration && retryTicks > 0) { retryTicks--; return false; }
        generation = nextGeneration;
        // These local lookups happen only at boot or after HUD replacement.
        host = owner.FindChildTraverse("HandoffHUD");
        top = valid(host) && host.FindChildTraverse("HandoffTop");
        anchors = []; reference = null; parts = {};
        if (valid(top)) {
            navKeys.forEach(function (key) { anchors.push({key:key, panel:top.FindChildTraverse("HandoffNav_"+key)}); });
            anchors.push({key:"effects", panel:top.FindChildTraverse("HandoffCombatEffects")});
            ["archive", "treasure", "return", "lottery", "benefit", "shop"].some(function (key) {
                var entry = anchors.filter(function (candidate) { return candidate.key === key; })[0];
                if (!entry || !valid(entry.panel)) return false;
                reference = entry.panel;
                ["Glow", "Icon", "CaptionHost", "Caption", "Underline"].forEach(function (part) { parts[part] = reference.FindChildTraverse("HandoffNav"+part+"_"+key); });
                return true;
            });
        }
        if (!valid(host) || !valid(top) || !valid(reference)) {
            retryTicks = 3;
            if (valid(button)) button.visible = false;
            return false;
        }
        retryTicks = 0;
        if (!valid(button) || button.GetParent() !== host) build();
        layoutSignature = ""; stateSignature = "";
        return true;
    }
    function refresh() {
        if (!alive()) { api.Dispose(); return; }
        if (!acquire()) return;
        if (!valid(button)) build();
        var screenScale = Number(top.actualuiscale_x) || Number(owner.actualuiscale_x) || 1;
        var topBounds = bounds(top), referenceBounds = bounds(reference), right = null;
        anchors.forEach(function (entry) {
            if (entry.key === "vip") return; // VIP follows Collection at the end of the first row.
            if (!visible(entry.panel)) return;
            var box = bounds(entry.panel);
            // Only the first row determines the next first-row entry. An
            // unlocked survival shop now sits below Treasure on its own row.
            if (box && referenceBounds && Math.abs(box.y-referenceBounds.y) <= 1/screenScale)
                right = Math.max(right === null ? box.x+box.width : right, box.x+box.width);
        });
        var ready = !!(topBounds && referenceBounds && right !== null);
        function px(value) { return Math.round(value * screenScale) / screenScale; }
        function box(panel, left, up, w, h) { style(panel, {position:px(left)+"px "+px(up)+"px 0px", width:px(w)+"px", height:px(h)+"px"}); }
        if (ready) {
            var scale = topBounds.width / 630, width = referenceBounds.width;
            // Keep the source HUD's pixel-snapped children and text baseline.
            // No minimum size is imposed: narrow viewports retain its spacing.
            function part(key, x, y, w, h) { return bounds(parts[key]) || {x:x*scale, y:y*scale, width:w*scale, height:h*scale}; }
            var geometry = [
                {x:topBounds.x+right+2*scale, y:topBounds.y+referenceBounds.y, width:width, height:referenceBounds.height},
                part("Glow",(56-62)/2,0,62,62), part("Icon",(56-44)/2,4,44,44),
                part("CaptionHost",0,52,56,32), part("Underline",(56-34)/2,84,34,2)
            ];
            var font = valid(parts.Caption) && parseFloat(parts.Caption.style.fontSize) > 0 ? parts.Caption.style.fontSize : px(22*scale)+"px";
            var signature = JSON.stringify([geometry,font,screenScale]);
            if (signature !== layoutSignature) {
                layoutSignature = signature;
                [button,halo,icon,captionHost,underline].forEach(function (panel,index) { var b=geometry[index]; box(panel,b.x,b.y,b.width,b.height); });
                caption.style.fontSize = font;
            }
        }
        var view = cfg.SurvivalCollection, nav = cfg.SurvivalPurpleShell, layers = cfg.SurvivalUILayers;
        var shown = ready && visible(top), enabled = !!(shown && view && typeof view.Open === "function" && nav && typeof nav.Navigate === "function");
        var selected = !!(layers && layers.Top() === "collection");
        var state = [enabled,selected,shown].join("|");
        if (state !== stateSignature) {
            stateSignature = state; button.enabled = enabled; button.visible = shown;
            button.SetHasClass("HandoffNavActive", selected);
        }
    }
    function tick() { refresh(); if (alive()) life.Later(.25, tick); }
    var api = {
        IsAlive:alive, Refresh:refresh,
        Dispose:function () {
            if (disposed) return;
            disposed = true; life.Dispose();
            if (valid(button)) { button.visible = false; button.hittest = false; button.DeleteAsync(0); }
            if (valid(marker)) marker.DeleteAsync(0);
            if (cfg.SurvivalCollectionNav === api) cfg.SurvivalCollectionNav = null;
        }
    };
    cfg.SurvivalCollectionNav = api;
    tick();
})();
