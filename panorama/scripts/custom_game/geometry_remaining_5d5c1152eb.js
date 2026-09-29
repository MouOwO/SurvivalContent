(function () {
    'use strict';
    function layout(width,height,abilityCount,building,resourceTree,presentation) {
        var count=Math.max(0,Math.min(32,Math.floor(Number(abilityCount)||0)));
        var delta=(Math.max(4,count)-10)*120,total=2352+delta;
        var reserve=Math.min(280*height/941,width*.22);
        // Retain the accepted four-slot portrait anchor. Additional abilities
        // expand to the right instead of moving the selected unit's portrait.
        var baseScale=Math.min(.5*height/941,(width-2*(reserve+14))/1352);
        var baseX=(width-1352*baseScale)/2,baseY=height-330*baseScale-6;
        var scale=Math.min(baseScale,(width-14-baseX-29*baseScale)/(total-29));
        if(presentation && presentation.worker) {
            var workerWidth=Math.max(680,count*120+40),workerMulti=!!(presentation.lumberjack&&presentation.multi);
            var portraitWidth=workerMulti?320:0,workerHeight=workerMulti?330:presentation.lumberjack?260:205;
            var totalWidth=workerWidth+portraitWidth;
            return {count:count,slot:116,step:120,width:totalWidth,height:workerHeight,
                heroWidth:portraitWidth,portraitSize:264,centerWidth:workerWidth,
                attributeX:totalWidth,attributeWidth:240,barWidth:workerWidth-30,
                inventoryX:totalWidth,x:(width-totalWidth*scale)/2,y:height-workerHeight*scale-6,scale:scale,
                minimapSize:Math.min(reserve-24,220*height/941),worker:true,lumberjack:!!presentation.lumberjack};
        }
        if(resourceTree) {
            var treeWidth=680,treeHeight=185;
            return {count:0,slot:116,step:120,width:treeWidth,height:treeHeight,
                heroWidth:0,portraitSize:264,centerWidth:treeWidth,
                attributeX:treeWidth,attributeWidth:240,barWidth:treeWidth-30,
                inventoryX:treeWidth,x:(width-treeWidth*scale)/2,y:height-treeHeight*scale-6,scale:scale,
                minimapSize:Math.min(reserve-24,220*height/941)};
        }
        if(building) {
            var buildingWidth=Math.max(800,1218+delta);
            // One full-sized ability row plus breathing room for utility buildings.
            // Wall health and tower combat summaries still need the taller body.
            var buildingHeight=presentation && !presentation.wall && !presentation.tower ? 205 : 330;
            return {count:count,slot:116,step:120,width:buildingWidth,height:buildingHeight,
                heroWidth:0,portraitSize:264,centerWidth:buildingWidth,
                attributeX:buildingWidth,attributeWidth:240,barWidth:buildingWidth-30,
                inventoryX:buildingWidth,x:(width-buildingWidth*scale)/2,y:height-buildingHeight*scale-6,scale:scale,
                minimapSize:Math.min(reserve-24,220*height/941)};
        }
        return {count:count,slot:116,step:120,width:total,height:330,
            heroWidth:493,portraitSize:264,centerWidth:1218+delta,
            attributeX:1711+delta,attributeWidth:240,
            barWidth:1188+delta,inventoryX:1951+delta,
            x:baseX+29*(baseScale-scale),y:baseY+49*(baseScale-scale),scale:scale,
            minimapSize:Math.min(reserve-24,220*height/941)};
    }
    if(typeof module!=='undefined')module.exports=layout;
    else GameUI.CustomUIConfig().HandoffGeometry=layout;
})();
