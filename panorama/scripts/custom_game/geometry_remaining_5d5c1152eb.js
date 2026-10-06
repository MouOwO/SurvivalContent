(function () {
    'use strict';
    function layout(width,height,abilityCount) {
        var count=Math.max(0,Math.min(32,Math.floor(Number(abilityCount)||0)));
        var delta=(Math.max(4,count)-10)*120,total=2072+delta;
        var reserve=Math.min(280*height/941,width*.22);
        // Retain the accepted four-slot portrait anchor. Additional abilities
        // expand to the right instead of moving the selected unit's portrait.
        var baseScale=Math.min(.5*height/941,(width-2*(reserve+14))/1352);
        var baseX=(width-1352*baseScale)/2,baseY=height-330*baseScale-6;
        var scale=Math.min(baseScale,(width-14-baseX-29*baseScale)/(total-29));
        return {count:count,slot:116,step:120,width:total,height:330,
            heroWidth:453,portraitSize:264,centerWidth:1218+delta,
            barWidth:1188+delta,inventoryX:1671+delta,
            x:baseX+29*(baseScale-scale),y:baseY+49*(baseScale-scale),scale:scale,
            minimapSize:Math.min(reserve-24,220*height/941)};
    }
    if(typeof module!=='undefined')module.exports=layout;
    else GameUI.CustomUIConfig().HandoffGeometry=layout;
})();
