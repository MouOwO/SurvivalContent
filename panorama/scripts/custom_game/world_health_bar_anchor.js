(function () {
    "use strict";
    // Names, ranks and health share one screen anchor, including native skin
    // heights and Panorama scaling. This helper owns no entities or timers.
    function project(entindex, origin, container) {
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
        if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0 || x > 1000000 || y > 1000000) return null;
        var sx = Number(container.actualuiscale_x) || 1;
        var sy = Number(container.actualuiscale_y) || 1;
        var offset = container.GetPositionWithinWindow ? container.GetPositionWithinWindow() : {x:0, y:0};
        // Panorama returns FLT_MAX while a newly created/hidden overlay has no
        // layout position. These full-screen hosts are anchored at (0,0); using
        // that sentinel as an offset hides every child and prevents recovery.
        var ox=Number(offset && offset.x), oy=Number(offset && offset.y);
        if (!isFinite(ox) || Math.abs(ox)>1000000) ox=0;
        if (!isFinite(oy) || Math.abs(oy)>1000000) oy=0;
        return {
            left: (x - ox) / sx - 31,
            top: (y - oy) / sy - 26,
            width: 62, height: 11, scale_x: sx, scale_y: sy,
            screen_left: x - 31*sx, screen_top: y - 26*sy,
            world_height: height
        };
    }
    GameUI.CustomUIConfig().SurvivalWorldHealthBarAnchor = {Project:project};
})();
