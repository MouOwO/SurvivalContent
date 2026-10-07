(function () {
    "use strict";
    // Names, ranks and health share one screen anchor, including native skin
    // heights and Panorama scaling. This helper owns no entities or timers.
    function capture(container) {
        if (!container) return null;
        var offset = container.GetPositionWithinWindow ? container.GetPositionWithinWindow() : {x:0, y:0};
        var sx = Number(container.actualuiscale_x) || 1;
        var sy = Number(container.actualuiscale_y) || 1;
        var ox = Number(offset.x) || 0, oy = Number(offset.y) || 0;
        return {sx:sx, sy:sy, ox:ox, oy:oy,
            right:ox + (Number(container.actuallayoutwidth) || 0)*sx,
            bottom:oy + (Number(container.actuallayoutheight) || 0)*sy};
    }
    function project(entindex, origin, container, geometry) {
        if (!container || !origin || origin.length < 3) return null;
        var height = 190;
        try {
            if (Entities.GetHealthBarOffset) {
                var configured = Number(Entities.GetHealthBarOffset(entindex));
                if (isFinite(configured) && configured > 0) height = configured;
            }
        } catch (error) {}
        var x = Number(Game.WorldToScreenX(origin[0], origin[1], Number(origin[2]) + height));
        var y = Number(Game.WorldToScreenY(origin[0], origin[1], Number(origin[2]) + height));
        if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0) return null;
        geometry = geometry || capture(container);
        var sx = geometry.sx, sy = geometry.sy;
        // Cull only when the full bar lies outside the drawable container.
        // Keep edge overlap and the camera-following frame rate intact.
        if ((geometry.right > geometry.ox && x - 31*sx > geometry.right)
            || (geometry.bottom > geometry.oy && y - 26*sy > geometry.bottom)
            || x + 31*sx < geometry.ox || y - 15*sy < geometry.oy) return null;
        return {
            left: (x - geometry.ox) / sx - 31,
            top: (y - geometry.oy) / sy - 26,
            width: 62, height: 11, scale_x: sx, scale_y: sy,
            screen_left: x - 31*sx, screen_top: y - 26*sy,
            world_height: height
        };
    }
    GameUI.CustomUIConfig().SurvivalWorldHealthBarAnchor = {Project:project, Capture:capture};
})();
