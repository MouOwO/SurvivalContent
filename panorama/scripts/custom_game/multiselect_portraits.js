(function () {
    "use strict";

    var cfg = GameUI.CustomUIConfig();
    var previous = cfg.SurvivalMultiSelectionPortraits;
    if (previous && previous.Restore) previous.Restore();
    var generation = (Number(cfg.SurvivalMultiSelectionPortraitGeneration) || 0) + 1;
    cfg.SurvivalMultiSelectionPortraitGeneration = generation;
    var controller = null;
    var saved = [], lastGroup = null, lastMulti = null, lastLayout = null;
    var hiddenIds = [], mounted = false;
    var lastRestore = null;

    function valid(panel) {
        try { return !!panel && (!panel.IsValid || panel.IsValid()); }
        catch (error) { return false; }
    }

    function selectedEntities() {
        try {
            var raw = Players.GetSelectedEntities(Game.GetLocalPlayerID());
            if (!raw || typeof raw !== "object") return [];
            var ids = [], seen = {};
            Object.keys(raw).forEach(function (key) {
                var rawId = raw[key];
                if (typeof rawId !== "number" && typeof rawId !== "string") return;
                if (String(rawId).trim() === "") return;
                var id = Number(rawId);
                if (!isFinite(id) || id < 0 || Math.floor(id) !== id || seen[id]) return;
                if (typeof Entities !== "undefined" && Entities.IsValidEntity
                    && !Entities.IsValidEntity(id)) return;
                seen[id] = true;
                ids.push(id);
            });
            return ids;
        } catch (error) { return []; }
    }

    function isActive() { return selectedEntities().length > 1; }

    function find(panel, id) {
        if (!valid(panel) || !panel.FindChildTraverse) return null;
        try { return panel.FindChildTraverse(id); } catch (error) { return null; }
    }

    function contains(parent, child) {
        for (var depth = 0; valid(child) && depth < 40; depth++) {
            if (child === parent) return true;
            child = child.GetParent ? child.GetParent() : null;
        }
        return false;
    }

    function findMulti(group) {
        // Valve's #multiunit is a sibling of #PortraitGroup under center_block,
        // not a child of PortraitContainer. Resolve fresh after each HUD rebuild.
        for (var parent = group, depth = 0; valid(parent) && depth < 8; depth++) {
            var result = find(parent, "multiunit");
            if (valid(result)) return result;
            parent = parent.GetParent ? parent.GetParent() : null;
        }
        return null;
    }

    function record(panel) {
        for (var index = 0; index < saved.length; index++) {
            if (saved[index].panel === panel) return saved[index];
        }
        var state = {panel: panel, styles: {}, values: {}};
        saved.push(state);
        return state;
    }

    function styles(panel, values) {
        if (!valid(panel)) return;
        var state = record(panel);
        Object.keys(values).forEach(function (key) {
            try {
                if (!Object.prototype.hasOwnProperty.call(state.styles, key)) {
                    var original = panel.style[key];
                    state.styles[key] = original === undefined || original === null ? "" : String(original);
                }
                panel.style[key] = values[key];
            } catch (error) {}
        });
    }

    function interaction(panel, enabled) {
        if (!valid(panel)) return;
        var state = record(panel);
        ["hittest", "hittestchildren"].forEach(function (key) {
            try {
                if (!Object.prototype.hasOwnProperty.call(state.values, key)) state.values[key] = panel[key];
                panel[key] = enabled;
            } catch (error) {}
        });
    }

    function restoredStyleValue(panel, key, original) {
        if (original !== "") return original;
        // Panorama rejects empty numeric/enum values instead of removing
        // the inline declaration. Restore the native HUD's defaults explicitly;
        // disable transient animation on the positioned multiunit container.
        if (key === "opacity") return "1";
        var id = String(panel.id || "");
        if (id === "multiunit") {
            var defaults = {horizontalAlign: "left", verticalAlign: "bottom",
                transitionProperty: "none", animationName: "none"};
            if (Object.prototype.hasOwnProperty.call(defaults, key)) return defaults[key];
        }
        if (id === "PageButtons" && key === "marginBottom") return "-8px";
        return original;
    }

    function restore() {
        if (saved.length > 0) lastRestore = {panelCount: saved.length, opacity: [], failed: []};
        saved.forEach(function (state) {
            if (!valid(state.panel)) return;
            Object.keys(state.styles).forEach(function (key) {
                var value = restoredStyleValue(state.panel, key, state.styles[key]);
                try {
                    state.panel.style[key] = value;
                    if (key === "opacity") lastRestore.opacity.push({
                        id: String(state.panel.id || ""), original: state.styles[key],
                        applied: value, current: String(state.panel.style[key])});
                } catch (error) {
                    lastRestore.failed.push({id: String(state.panel.id || ""), property: key});
                }
            });
            Object.keys(state.values).forEach(function (key) {
                try { state.panel[key] = state.values[key]; } catch (error) {}
            });
        });
        saved = [];
        hiddenIds = [];
        mounted = false;
        lastLayout = null;
    }

    function point(panel) {
        if (!valid(panel) || !panel.GetPositionWithinWindow) return null;
        try {
            var value = panel.GetPositionWithinWindow();
            if (!value) return null;
            var x = Number(value.x !== undefined ? value.x : value[0]);
            var y = Number(value.y !== undefined ? value.y : value[1]);
            return isFinite(x) && isFinite(y) ? {x: x, y: y} : null;
        } catch (error) { return null; }
    }

    function scale(panel, axis) {
        var value = Number(panel && panel["actualuiscale_" + axis]);
        return isFinite(value) && value > 0 ? value : null;
    }

    function hasClass(panel, name) {
        try { return valid(panel) && panel.BHasClass && panel.BHasClass(name); }
        catch (error) { return false; }
    }

    function children(panel) {
        var result = [];
        if (!valid(panel) || !panel.GetChildCount || !panel.GetChild) return result;
        for (var index = 0; index < panel.GetChildCount(); index++) {
            var child = panel.GetChild(index);
            if (valid(child)) result.push(child);
        }
        return result;
    }

    function nativeColumns(multi) {
        // These engine classes also select the shared C++ canvas's grid. Do not
        // invent an independent DOM grid or change the native selection classes.
        if (hasClass(multi, "TwoColumns")) return 2;
        if (hasClass(multi, "ThreeColumns")) return 3;
        return 4;
    }

    function hideSinglePortrait(group, multi) {
        hiddenIds = [];
        var container = find(group, "PortraitContainer");
        if (valid(container) && !contains(container, multi)) {
            styles(container, {opacity: "0"});
            interaction(container, false);
            hiddenIds.push("PortraitContainer");
            return;
        }
        ["portraitHUD", "portraitHUDOverlay"].forEach(function (id) {
            var panel = find(group, id);
            if (!valid(panel) || contains(panel, multi)) return;
            styles(panel, {opacity: "0"});
            interaction(panel, false);
            hiddenIds.push(id);
        });
    }

    function apply(group, size) {
        var selected = selectedEntities();
        if (selected.length < 2 || !valid(group)) {
            restore();
            lastGroup = valid(group) ? group : null;
            lastMulti = null;
            return false;
        }
        var multi = findMulti(group);
        if (lastGroup !== group || lastMulti !== multi) restore();
        lastGroup = group;
        lastMulti = multi;
        var frames = find(multi, "UnitFrames"), canvas = find(multi, "canvas");
        if (!valid(multi) || !valid(frames) || !valid(canvas)) {
            restore();
            return false;
        }
        var parent = multi.GetParent ? multi.GetParent() : null;
        var groupPoint = point(group), parentPoint = point(parent);
        var parentX = scale(parent, "x"), parentY = scale(parent, "y");
        var groupX = scale(group, "x"), groupY = scale(group, "y");
        size = Number(size);
        if (!groupPoint || !parentPoint || !parentX || !parentY || !groupX || !groupY
            || !isFinite(size) || size <= 0) {
            restore();
            return false;
        }

        var columns = nativeColumns(multi);
        var cellHeight = columns === 2 ? 93 : columns === 3 ? 59 : 41;
        var rows = Math.ceil(Math.min(12, selected.length) / columns);
        var pageButtons = find(multi, "PageButtons");
        var paged = selected.length > 12 || children(pageButtons).some(function (button) {
            return hasClass(button, "ShowButton");
        });
        var contentHeight = rows * cellHeight + (columns < 4 ? 3 : 0);
        var nativeWidth = 159, nativeHeight = contentHeight + (paged ? 25 : 0);
        var width = size * groupX / parentX, height = size * groupY / parentY;
        var padding = Math.min(width, height) * 0.025;
        var fit = Math.min((width - padding * 2) / nativeWidth,
            (height - padding * 2) / nativeHeight);
        if (!isFinite(fit) || fit <= 0) {
            restore();
            return false;
        }
        var x = (groupPoint.x - parentPoint.x) / parentX + (width - nativeWidth * fit) / 2;
        var y = (groupPoint.y - parentPoint.y) / parentY + (height - nativeHeight * fit) / 2;

        // Keep #canvas and all twelve DOTAMultiUnitFrames at Valve's original
        // relative pixel sizes. Scaling their common parent preserves the C++
        // portrait canvas, health bars, selection hit regions and paging together.
        styles(multi, {position: x + "px " + y + "px 0px", width: nativeWidth + "px",
            height: nativeHeight + "px", minWidth: "0px", minHeight: "0px",
            margin: "0px", horizontalAlign: "left", verticalAlign: "top",
            transformOrigin: "0% 0%", transform: "scale3d(" + fit + ", " + fit + ", 1)",
            overflow: "clip", zIndex: "1106", transitionProperty: "none", animationName: "none"});
        if (valid(pageButtons)) styles(pageButtons, {marginBottom: "0px"});
        // Keep Valve's active-unit border and health/mana styling unchanged.
        hideSinglePortrait(group, multi);
        mounted = true;
        lastLayout = {columns: columns, rows: rows, paged: paged,
            nativeWidth: nativeWidth, nativeHeight: nativeHeight, fit: fit,
            x: x, y: y, width: width, height: height};
        return true;
    }

    function describe(panel) {
        if (!valid(panel)) return null;
        return {id: String(panel.id || ""), type: String(panel.paneltype || ""),
            width: Number(panel.actuallayoutwidth || 0), height: Number(panel.actuallayoutheight || 0),
            position: point(panel), visible: panel.visible !== false,
            opacity: String(panel.style.opacity || ""),
            visibility: String(panel.style.visibility || ""),
            hittest: panel.hittest, hittestchildren: panel.hittestchildren,
            combatDimmed: panel.__survivalPortraitDimmed === true,
            hidden: !!hasClass(panel, "Hidden"), activeGroup: !!hasClass(panel, "ActiveGroup")};
    }

    function nativeScene(panel, depth) {
        if (!valid(panel) || depth > 12) return null;
        if (String(panel.id || "") === "SurvivalTowerPortraitOverlay") return null;
        if (String(panel.paneltype || "").toLowerCase() === "dotascenepanel") return panel;
        var descendants = children(panel);
        for (var index = 0; index < descendants.length; index++) {
            var result = nativeScene(descendants[index], depth + 1);
            if (result) return result;
        }
        return null;
    }

    function inspect() {
        var frames = find(lastMulti, "UnitFrames");
        var container = find(lastGroup, "PortraitContainer");
        var portrait = find(lastGroup, "portraitHUD");
        return {build: "native_grid_fit_v5", generation: generation,
            selectedCount: selectedEntities().length, active: isActive(), mounted: mounted,
            nativeFound: valid(lastMulti), group: describe(lastGroup), multi: describe(lastMulti),
            canvas: describe(find(lastMulti, "canvas")), layout: lastLayout,
            frames: children(frames).map(describe), hiddenNativeIds: hiddenIds.slice(),
            singlePortrait: {container: describe(container), portrait: describe(portrait),
                overlay: describe(find(lastGroup, "portraitHUDOverlay")),
                scene: describe(nativeScene(portrait, 0))}, lastRestore: lastRestore};
    }

    controller = {Apply: apply, IsActive: isActive,
        Inspect: inspect, Restore: restore};
    cfg.SurvivalMultiSelectionPortraits = controller;
    function debugRequest() {
        if (cfg.SurvivalMultiSelectionPortraits !== controller) return;
        $.Msg("[MULTI_PORTRAIT] " + JSON.stringify(inspect()));
    }
    if (typeof GameEvents !== "undefined" && GameEvents.Subscribe) {
        GameEvents.Subscribe("survival_multiselect_debug_request", debugRequest);
    }
    // AddCommand can retain the first context during a Tools hot reload. This
    // closure deliberately resolves the current controller at invocation time.
    if (Game.AddCommand) {
        try {
            Game.AddCommand("survival_multiselect_inspect", function () {
                var current = cfg.SurvivalMultiSelectionPortraits;
                if (current && current.Inspect) $.Msg("[MULTI_PORTRAIT] " + JSON.stringify(current.Inspect()));
            }, "", 0);
        } catch (error) {}
    }
    $.Msg("[MULTI_PORTRAIT_LOADED] build=native_grid_fit_v5 generation=" + generation);
})();
