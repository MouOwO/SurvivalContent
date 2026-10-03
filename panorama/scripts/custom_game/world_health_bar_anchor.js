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
        if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0) return null;
        var sx = Number(container.actualuiscale_x) || 1;
        var sy = Number(container.actualuiscale_y) || 1;
        var offset = container.GetPositionWithinWindow ? container.GetPositionWithinWindow() : {x:0, y:0};
        return {
            left: (x - (Number(offset.x) || 0)) / sx - 31,
            top: (y - (Number(offset.y) || 0)) / sy - 26,
            width: 62, height: 11, scale_x: sx, scale_y: sy,
            screen_left: x - 31*sx, screen_top: y - 26*sy,
            world_height: height
        };
    }
    GameUI.CustomUIConfig().SurvivalWorldHealthBarAnchor = {Project:project};
})();
