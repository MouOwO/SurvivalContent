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
        var rootWidth = numberOr(root && root.actuallayoutwidth, 1920);
        var rootHeight = numberOr(root && root.actuallayoutheight, 1080);
        var sourcePosition = absoluteOffset(source);
        var sourceWidth = numberOr(source.actuallayoutwidth, 64);
        var tooltipWidth = numberOr(width, tooltip.actuallayoutwidth || 430);
        var tooltipHeight = numberOr(
            tooltip.actuallayoutheight,
            numberOr(height, 220)
        );
        var gap = 14;
        var x = sourcePosition.x + (sourceWidth - tooltipWidth) * 0.5 - 78;
        x = Math.max(12, Math.min(x, rootWidth - tooltipWidth - 12));
        function applyPosition() {
            if (!tooltip || !tooltip.IsValid || !tooltip.IsValid()) return;
            var h = numberOr(tooltip.actuallayoutheight, tooltipHeight);
            // 旧位置为 sourceY - height - gap + 10；整体再向上88px。
            var measuredY = sourcePosition.y - h - gap - 78;
            measuredY = Math.max(12, Math.min(
                measuredY, rootHeight - h - 12
            ));
            tooltip.style.position = Math.round(x) + "px "
                + Math.round(measuredY) + "px 0px";
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
