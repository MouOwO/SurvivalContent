(function () {
    "use strict";
    function layout(width, height, abilityCount) {
        var count = Math.max(0, Math.min(32, Math.floor(Number(abilityCount) || 0)));
        // Reserve four slots of width, but keep count as the real ability count.
        var delta = (Math.max(4,count) - 10) * 120;
        var total = 2072 + delta, center = 1218 + delta;
        var mapReserve = Math.min(280 * height / 941, width * 0.22);
        var scale = Math.min(0.5 * height / 941, (width - 2 * (mapReserve + 14)) / total);
        return {count:count, slot:116, step:120, width:total, height:330,
            heroWidth:453, portraitSize:264,
            centerWidth:center, barWidth:1188+delta, inventoryX:1671+delta,
            x:(width-total*scale)/2, y:height-330*scale-6, scale:scale,
            minimapSize:Math.min(mapReserve-24, 220*height/941)};
    }
    if (typeof module !== "undefined") module.exports = layout;
    else GameUI.CustomUIConfig().HandoffGeometry = layout;
})();
