(function () {
    'use strict';
    function layout(width,height,abilityCount,building,resourceTree,presentation) {
        var count=Math.max(0,Math.min(32,Math.floor(Number(abilityCount)||0)));
        var delta=(Math.max(4,count)-10)*120;
        var reserve=Math.min(280*height/941,width*.22);
        // Keep the accepted action origin for compact workers and buildings.
        var baseScale=Math.min(.5*height/941,(width-2*(reserve+14))/1352);
        var baseX=(width-1352*baseScale)/2,baseY=height-330*baseScale-6;
        var actionX=baseX+503*baseScale;
        function anchored(g,inventoryColumns,keepPortrait) {
            var rightWidth=g.centerWidth-10+(inventoryColumns?g.attributeWidth+401:0);
            g.scale=Math.min(baseScale,(width-14-actionX)/Math.max(1,rightWidth));
            if(keepPortrait) {
                // Keep the selected portrait's accepted screen point even when
                // a large ability list needs a smaller canvas scale.
                g.x=baseX+29*(baseScale-g.scale);
                g.y=baseY+49*(baseScale-g.scale);
            } else {
                g.x=actionX-(g.heroWidth+10)*g.scale;
                g.y=height-g.height*g.scale-(g.lumberjack?0:6);
            }
            g.actionX=actionX;
            g.actionOffset=(actionX-g.x)/g.scale;
            g.centerX=g.actionOffset-10;
            g.attributeX=g.centerX+g.centerWidth;
            g.inventoryX=g.attributeX+(inventoryColumns?g.attributeWidth:0);
            g.width=g.inventoryX+(inventoryColumns?401:0);
            g.viewportWidth=width;g.viewportHeight=height;
            if(presentation && presentation.production) {
                var shortcutScale=Math.max(.9,Math.min(1.12,height/941));
                g.productionLeft=g.minimapSize+26+64*shortcutScale+14;
                // Six waiting cells already fit the existing minimum panel.
                // Hold that width/scale independent of an arriving skill list.
                g.productionQueueWidth=600;
                g.productionQueueScale=Math.max(baseScale,.5)*1.15;
                g.productionAnchorX=actionX-10*baseScale;
            }
            return g;
        }
        var minimapSize=Math.min(reserve-24,220*height/941);
        if(presentation && presentation.worker) {
            var workerWidth=Math.max(680,count*120+40),workerMulti=!!(presentation.lumberjack&&presentation.multi);
            // Selection size must not move the worker's abilities or stat row.
            var portraitWidth=workerMulti?320:0,workerHeight=presentation.lumberjack?260:205;
            return anchored({count:count,slot:116,step:120,height:workerHeight,
                heroWidth:portraitWidth,portraitSize:264,centerWidth:workerWidth,
                portraitY:workerMulti?23:49,portraitHeight:workerMulti?237:264,
                attributeWidth:240,barWidth:workerWidth-30,minimapSize:minimapSize,
                worker:true,lumberjack:!!presentation.lumberjack},false,false);
        }
        if(resourceTree) {
            // Resource trees have no skill row; retain their accepted centered
            // compact health presentation rather than creating an action gutter.
            var treeWidth=680,treeHeight=185;
            return {count:0,slot:116,step:120,width:treeWidth,height:treeHeight,
                heroWidth:0,portraitSize:264,centerWidth:treeWidth,centerX:0,
                attributeX:treeWidth,attributeWidth:240,barWidth:treeWidth-30,
                inventoryX:treeWidth,x:(width-treeWidth*baseScale)/2,y:height-treeHeight*baseScale-6,scale:baseScale,
                minimapSize:minimapSize,viewportWidth:width,viewportHeight:height};
        }
        if(building) {
            var buildingWidth=Math.max(800,1218+delta);
            var buildingHeight=presentation && !presentation.wall && !presentation.tower ? 205 : 330;
            return anchored({count:count,slot:116,step:120,height:buildingHeight,
                heroWidth:0,portraitSize:264,centerWidth:buildingWidth,
                attributeWidth:240,barWidth:buildingWidth-30,minimapSize:minimapSize},false,false);
        }
        // Center the complete selected-unit HUD, including its visible columns.
        // Monsters share the hero scale without reserving hidden item columns.
        var monster=!!(presentation && presentation.monster);
        var attributes=!monster && (!presentation || presentation.attributes!==false);
        var heroWidth=473,centerWidth=1218+delta,attributeWidth=attributes?180:0;
        var totalWidth=heroWidth+centerWidth+(monster?0:attributeWidth+401);
        var scale=Math.min(baseScale,(width-2*(reserve+14))/(2272+delta));
        var x=(width-totalWidth*scale)/2,actionOffset=heroWidth+10;
        return {count:count,slot:116,step:120,height:330,width:totalWidth,
            heroWidth:heroWidth,portraitSize:264,centerWidth:centerWidth,centerX:heroWidth,
            attributeX:heroWidth+centerWidth,attributeWidth:attributeWidth,
            inventoryX:heroWidth+centerWidth+attributeWidth,barWidth:centerWidth-30,
            x:x,y:height-330*scale-6,scale:scale,minimapSize:minimapSize,
            actionX:x+actionOffset*scale,actionOffset:actionOffset,
            viewportWidth:width,viewportHeight:height};
    }
    if(typeof module!=='undefined')module.exports=layout;
    else GameUI.CustomUIConfig().HandoffGeometry=layout;
})();
