(function () {
    "use strict";

    function rootPanel(panel) {
        var current = panel || $.GetContextPanel();
        while (current && current.GetParent()) current = current.GetParent();
        return current;
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

    GameUI.CustomUIConfig().SurvivalTooltipPosition = {
        PlaceRight: placeRight,
        PlaceAbove: placeAbove
    };
})();
