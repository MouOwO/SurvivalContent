(function () {
    "use strict";

    function rootPanel(panel) {
        var current = panel || $.GetContextPanel();
        while (current && current.GetParent()) current = current.GetParent();
        return current;
    }

    var config = GameUI.CustomUIConfig();
    var previous = config.SurvivalTooltipPosition;
    if (previous && previous.DisposeTextLayer) previous.DisposeTextLayer();
    var textOwner = null, textHost = null, textLease = [], textSerial = 0;
    var tooltipLayer = 2100000000;
    var errorOwner = null, errorHost = null, errorLease = [], errorSerial = 0, errorTask = null;
    // Large spacing remains distinct if native z-order passes through float32.
    var errorLayer = 2140000000;
    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function restoreErrorLayer() {
        errorLease.forEach(function (entry) {
            if (valid(entry.panel) && Number(entry.panel.style.zIndex) === errorLayer)
                entry.panel.style.zIndex = entry.previous;
        });
        errorLease = []; errorHost = null;
    }
    function nativeErrorHost(root) {
        if (!valid(root)) return null;
        // The installed native dota_hud_error_msg layout has an anonymous
        // DOTAErrorMsg root and its own ErrorMsg label. Never create a copy.
        var label = root.FindChildTraverse && root.FindChildTraverse("ErrorMsg"), panel = label;
        for (var depth = 0; valid(panel) && panel !== root && depth < 8; depth++) {
            var type = String(panel.paneltype || (panel.GetPanelType && panel.GetPanelType()) || "");
            if (/^DOTA_?ErrorMsg$/i.test(type)) return panel;
            panel = panel.GetParent ? panel.GetParent() : null;
        }
        var pending = [root], cursor = 0;
        while (cursor < pending.length && cursor < 512) {
            panel = pending[cursor++];
            var kind = String(panel.paneltype || (panel.GetPanelType && panel.GetPanelType()) || "");
            if (/^DOTA_?ErrorMsg$/i.test(kind)) return panel;
            var children = panel.Children ? panel.Children() : [];
            for (var child = 0; child < children.length && pending.length < 512; child++)
                if (valid(children[child])) pending.push(children[child]);
        }
        return null;
    }
    function raiseErrorLayer() {
        if (!valid(errorOwner)) return false;
        var root = rootPanel(errorOwner), host = nativeErrorHost(root), path = [], panel = host;
        for (var depth = 0; valid(panel) && panel !== root && depth < 64; depth++) {
            path.push(panel); panel = panel.GetParent ? panel.GetParent() : null;
        }
        if (!host || panel !== root) { restoreErrorLayer(); return false; }
        if (errorHost !== host || errorLease.length !== path.length
            || errorLease.some(function (entry, index) { return entry.panel !== path[index]; })) {
            restoreErrorLayer(); errorHost = host;
            errorLease = path.map(function (entry) {
                var prior = String(entry.style.zIndex || "");
                return {panel:entry, previous:/^-?\d+$/.test(prior) ? prior : "0"};
            });
        }
        errorLease.forEach(function (entry) {
            if (Number(entry.panel.style.zIndex) !== errorLayer) entry.panel.style.zIndex = String(errorLayer);
        });
        return true;
    }
    function cancelErrorTask() {
        if (errorTask !== null && $.CancelScheduled) $.CancelScheduled(errorTask);
        errorTask = null;
    }
    function hideNativeError(source) {
        if (source && errorOwner && source !== errorOwner) return;
        errorSerial++; cancelErrorTask(); errorOwner = null; restoreErrorLayer();
    }
    function showNativeError(source, message) {
        source = source || $.GetContextPanel();
        if (!valid(source)) return false;
        cancelErrorTask(); restoreErrorLayer(); errorOwner = source;
        var serial = ++errorSerial, ticks = 0;
        GameEvents.SendEventClientSide("dota_hud_error_message", {reason:80, message:String(message || "")});
        raiseErrorLayer();
        // Follow only the native message's short visible lifetime. There is no
        // idle HUD poll, reparenting, restyling or replacement error widget.
        function inspect() {
            if (serial !== errorSerial) return;
            errorTask = null;
            if (!valid(errorOwner) || ticks++ >= 60) { hideNativeError(); return; }
            raiseErrorLayer();
            if (errorHost && errorHost.BHasClass && !errorHost.BHasClass("ShowErrorMsg")) {
                errorTask = $.Schedule(0.5, function () {
                    if (serial !== errorSerial) return;
                    if (valid(errorHost) && errorHost.BHasClass && errorHost.BHasClass("ShowErrorMsg")) inspect();
                    else hideNativeError();
                });
                return;
            }
            errorTask = $.Schedule(0.1, inspect);
        }
        // Engine construction and its ShowErrorMsg class may finish next frame.
        errorTask = $.Schedule(0, inspect);
        return true;
    }
    function restoreTextLayer() {
        textLease.forEach(function (entry) {
            // A modal may have taken ownership of an ancestor since hover.
            // Never replace that newer assignment with an obsolete saved one.
            if (valid(entry.panel) && Number(entry.panel.style.zIndex) === tooltipLayer)
                entry.panel.style.zIndex = entry.previous;
        });
        textLease = []; textHost = null;
    }
    function nativeTextHost(root) {
        if (!valid(root)) return null;
        // TextTooltip is defined by the installed engine's core tooltip layout.
        // Some HUD versions expose its manager instead of the text instance.
        var ids = ["Tooltips", "TooltipManager", "TooltipContainer", "TextTooltip", "DOTA_TextTooltip", "DOTATextTooltip"];
        for (var index = 0; index < ids.length; index++) {
            var candidate = root.FindChildTraverse && root.FindChildTraverse(ids[index]);
            if (valid(candidate)) return candidate;
        }
        // Engine-created tooltip instances can have no ID. Inspect only a
        // bounded breadth of native panels on hover, never on a HUD timer.
        var pending = [root], cursor = 0;
        while (cursor < pending.length && cursor < 512) {
            var panel = pending[cursor++];
            var type = String(panel.paneltype || (panel.GetPanelType && panel.GetPanelType()) || "");
            if (/^(?:DOTA_?)?(?:TextTooltip|Tooltip(?:Manager|_Text)?)$/i.test(type)) return panel;
            var children = panel.Children ? panel.Children() : [];
            for (var child = 0; child < children.length && pending.length < 512; child++)
                if (valid(children[child])) pending.push(children[child]);
        }
        return null;
    }
    function raiseTextLayer(source) {
        if (textOwner !== source || !valid(source)) return false;
        var root = rootPanel(source), host = nativeTextHost(root), path = [], panel = host;
        for (var depth = 0; valid(panel) && panel !== root && depth < 64; depth++) {
            path.push(panel); panel = panel.GetParent ? panel.GetParent() : null;
        }
        if (!host || panel !== root) return false;
        if (textHost !== host || textLease.length !== path.length
            || textLease.some(function (entry, index) { return entry.panel !== path[index]; })) {
            restoreTextLayer(); textHost = host;
            textLease = path.map(function (entry) {
                var prior = String(entry.style.zIndex || "");
                return {panel:entry, previous:/^-?\d+$/.test(prior) ? prior : "0"};
            });
        }
        textLease.forEach(function (entry) {
            if (Number(entry.panel.style.zIndex) !== tooltipLayer) entry.panel.style.zIndex = String(tooltipLayer);
        });
        return true;
    }
    function showText(source, content) {
        if (!valid(source)) return;
        restoreErrorLayer();
        if (textOwner !== source) restoreTextLayer();
        textOwner = source;
        var serial = ++textSerial;
        $.DispatchEvent("DOTAShowTextTooltip", source, content);
        raiseTextLayer(source);
        raiseErrorLayer();
        // Native tooltip creation/attachment may finish on the next layout
        // pass. Retry once; an intervening hide or new source cancels it.
        $.Schedule(0, function () {
            if (serial === textSerial && textOwner === source) {
                restoreErrorLayer(); raiseTextLayer(source); raiseErrorLayer();
            }
        });
    }
    function hideText(source) {
        if (textOwner && source && textOwner !== source) return;
        restoreErrorLayer();
        textSerial++; textOwner = null;
        $.DispatchEvent("DOTAHideTextTooltip");
        restoreTextLayer();
        raiseErrorLayer();
    }

    function numberOr(value, fallback) {
        return typeof value === "number" && isFinite(value) ? value : fallback;
    }

    function absoluteOffset(panel) {
        var x = 0;
        var y = 0;
        var current = panel;
        while (current) {
            x += numberOr(current.actualxoffset, 0);
            y += numberOr(current.actualyoffset, 0);
            current = current.GetParent ? current.GetParent() : null;
        }
        return { x: x, y: y };
    }

    function placeRight(tooltip, source, width, height) {
        if (!tooltip || !source) return;
        var root = rootPanel(source);
        var rootWidth = numberOr(root && root.actuallayoutwidth, 1920);
        var rootHeight = numberOr(root && root.actuallayoutheight, 1080);
        var sourcePosition = absoluteOffset(source);
        var sourceWidth = numberOr(source.actuallayoutwidth, 64);
        var tooltipWidth = numberOr(width, tooltip.actuallayoutwidth || 430);
        var tooltipHeight = numberOr(tooltip.actuallayoutheight, numberOr(height, 260));
        var gap = 14;

        var x = sourcePosition.x + sourceWidth + gap - 78;
        if (x + tooltipWidth > rootWidth - 12) {
            x = sourcePosition.x - tooltipWidth - gap - 78;
        }
        x = Math.max(12, Math.min(x, rootWidth - tooltipWidth - 12));

        var y = sourcePosition.y - 88;
        if (y + tooltipHeight > rootHeight - 12) {
            y = rootHeight - tooltipHeight - 12;
        }
        y = Math.max(12, y);
        tooltip.style.position = Math.round(x) + "px " + Math.round(y) + "px 0px";
        $.Schedule(0.0, function () {
            if (!tooltip || !tooltip.IsValid || !tooltip.IsValid()) return;
            var h = numberOr(tooltip.actuallayoutheight, tooltipHeight);
            var boundedY = Math.max(12, Math.min(y, rootHeight - h - 12));
            tooltip.style.position = Math.round(x) + "px " + Math.round(boundedY) + "px 0px";
        });
    }

    function placeAbove(tooltip, source, width, height) {
        if (!tooltip || !source) return;
        var root = rootPanel(source);
        var parent = tooltip.GetParent ? tooltip.GetParent() : null;
        if (!root || !parent
            || !source.GetPositionWithinWindow
            || !parent.GetPositionWithinWindow) return;
        var rootPosition = root.GetPositionWithinWindow
            ? root.GetPositionWithinWindow() : { x: 0, y: 0 };
        var parentPosition = parent.GetPositionWithinWindow();
        var rootLeft = numberOr(rootPosition.x, 0);
        var rootTop = numberOr(rootPosition.y, 0);
        var rootWidth = numberOr(root.actuallayoutwidth, 1920);
        var rootHeight = numberOr(root.actuallayoutheight, 1080);
        var sourcePosition = source.GetPositionWithinWindow();
        var sourceWidth = numberOr(source.actuallayoutwidth, 64);
        var tooltipWidth = numberOr(width, tooltip.actuallayoutwidth || 430);
        var tooltipHeight = numberOr(
            tooltip.actuallayoutheight,
            numberOr(height, 220)
        );
        var parentScaleX = Math.max(0.001, numberOr(parent.actualuiscale_x, 1));
        var parentScaleY = Math.max(0.001, numberOr(parent.actualuiscale_y, 1));
        var gap = 5;
        var edge = 12;
        function applyPosition() {
            if (!tooltip || !tooltip.IsValid || !tooltip.IsValid()) return;
            var w = numberOr(tooltip.actuallayoutwidth, tooltipWidth);
            var h = numberOr(tooltip.actuallayoutheight, tooltipHeight);
            var measuredSource = source.GetPositionWithinWindow();
            var measuredSourceWidth = numberOr(source.actuallayoutwidth, sourceWidth);
            var windowX = numberOr(measuredSource.x, sourcePosition.x)
                + (measuredSourceWidth - w) * 0.5;
            windowX = Math.max(rootLeft + edge, Math.min(
                windowX, rootLeft + rootWidth - w - edge
            ));
            var windowY = numberOr(measuredSource.y, sourcePosition.y) - h - gap;
            windowY = Math.max(rootTop + edge, Math.min(
                windowY, rootTop + rootHeight - h - edge
            ));
            var localX = (windowX - numberOr(parentPosition.x, 0)) / parentScaleX;
            var localY = (windowY - numberOr(parentPosition.y, 0)) / parentScaleY;
            tooltip.style.position = Math.round(localX) + "px "
                + Math.round(localY) + "px 0px";
        }
        applyPosition();
        $.Schedule(0.0, applyPosition);
        $.Schedule(0.03, applyPosition);
    }

    function placeAbilityAbove(tooltip, source, width, verticalSource, heightLimit) {
        if (!tooltip || !source || !source.GetPositionWithinWindow) return;
        var parent=tooltip.GetParent(),root=rootPanel(source);
        if(!parent||!parent.GetPositionWithinWindow)return;
        var pp=parent.GetPositionWithinWindow(),rp=root.GetPositionWithinWindow(),sp=source.GetPositionWithinWindow();
        var sx=Math.max(.001,numberOr(parent.actualuiscale_x,1)),sy=Math.max(.001,numberOr(parent.actualuiscale_y,1));
        var w=numberOr(width,337)*sx;
        var sw=numberOr(source.__survivalWindowWidth,numberOr(source.actuallayoutwidth,64));
        var x=numberOr(sp.x,0)+(sw-w)*.5;
        x=Math.max(numberOr(rp.x,0)+12,Math.min(x,numberOr(rp.x,0)+numberOr(root.actuallayoutwidth,1920)-w-12));
        var anchor=verticalSource&&verticalSource.GetPositionWithinWindow
            ?verticalSource.GetPositionWithinWindow():sp;
        var bottom=numberOr(anchor.y,0)-5;
        var parentBottom=numberOr(pp.y,0)+numberOr(parent.actuallayoutheight,1080);
        tooltip.style.horizontalAlign="left";
        tooltip.style.verticalAlign="bottom";
        tooltip.style.marginTop="0px";
        tooltip.style.marginBottom=((parentBottom-bottom)/sy)+"px";
        tooltip.style.position=((x-numberOr(pp.x,0))/sx)+"px 0px 0px";
        tooltip.style.width=numberOr(width,337)+"px";
        tooltip.style.maxHeight=Math.max(32,Math.min(heightLimit||360,(bottom-numberOr(rp.y,0)-12)/sy))+"px";
        // Bottom alignment follows content height in the same layout pass.
        // No measurements of the previous skill and no delayed repositioning.
    }
    config.SurvivalTooltipPosition = {
        ShowText: showText,
        HideText: hideText,
        ShowNativeError: showNativeError,
        HideNativeError: hideNativeError,
        SuspendTextLayer: function () { restoreErrorLayer(); restoreTextLayer(); },
        ResumeTextLayer: function () { if (textOwner) raiseTextLayer(textOwner); raiseErrorLayer(); },
        DisposeTextLayer: function () { hideNativeError(); textSerial++; textOwner = null; restoreTextLayer(); },
        InspectTextLayer: function () { return {source:textOwner && textOwner.id || "", host:textHost && textHost.id || "", raised:textLease.length, z:tooltipLayer}; },
        InspectNativeErrorLayer: function () { return {source:errorOwner && errorOwner.id || "", host:errorHost && errorHost.id || "", raised:errorLease.length, z:errorLayer, pending:errorTask !== null}; },
        PlaceRight: placeRight,
        PlaceAbove: placeAbove,
        PlaceAbilityAbove: placeAbilityAbove,
        PlaceInventoryAbove: function(tooltip, source, upperRow) {
            placeAbilityAbove(tooltip, source, 350, upperRow, 390);
        }
    };
})();
