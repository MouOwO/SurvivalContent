(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),ctx=$.GetContextPanel(),root=ctx,cache={};
    while(root.GetParent&&root.GetParent())root=root.GetParent();
    var tooltipIds=["CustomAbilityTooltip","CustomInventoryItemTooltip","ShopEntryTooltip","SurvivalPortraitCameraEditor","SurvivalProductionPanel","SurvivalMinimapShortcuts"];
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function visible(p){
        for(var parent=p;valid(parent);parent=parent.GetParent?parent.GetParent():null){
            if(parent.visible===false||String(parent.style.visibility)==="collapse"||String(parent.style.opacity)==="0")return false;
            if(parent.BHasClass&&(parent.BHasClass("Hidden")||parent.BHasClass("ArchiveHidden")))return false;
        }
        return true;
    }
    function capture(){
        var layers=cfg.SurvivalUILayers;
        if(layers&&layers.Top&&layers.Top())return {blocked:true,rects:[]};
        var rects=(cfg.HandoffWorldOcclusion||[]).slice();
        tooltipIds.forEach(function(id){
            var panel=cache[id];
            if(!valid(panel))panel=cache[id]=root.FindChildTraverse(id);
            if(!valid(panel)||!visible(panel)||!panel.GetPositionWithinWindow)return;
            var position=panel.GetPositionWithinWindow();
            var width=Number(panel.__survivalWindowWidth)||Number(panel.actuallayoutwidth)||0;
            var height=Number(panel.__survivalWindowHeight)||Number(panel.actuallayoutheight)||0;
            if(width>0&&height>0)rects.push({x:Number(position.x)||0,y:Number(position.y)||0,width:width,height:height});
        });
        return {blocked:false,rects:rects};
    }
    function overlaps(snapshot,x,y,width,height){
        if(!snapshot)return false;
        if(snapshot.blocked)return true;
        return snapshot.rects.some(function(rect){return x<rect.x+rect.width&&x+width>rect.x&&y<rect.y+rect.height&&y+height>rect.y;});
    }
    cfg.SurvivalWorldOverlayVisibility={Capture:capture,Overlaps:overlaps};
})();
