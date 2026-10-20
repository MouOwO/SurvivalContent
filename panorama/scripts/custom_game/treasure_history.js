(function () {
    "use strict";
    var CAPACITY=20,COLUMNS=4,ROWS=5,CELL=60,GAP=8,WIDTH=292,HEIGHT=404;
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),U=cfg.SurvivalUI;
    if(cfg.SurvivalTreasure&&cfg.SurvivalTreasure.Dispose)cfg.SurvivalTreasure.Dispose();
    if(!U||!U.ModalShell)return;
    var opened=false,history=[],detailAnchor=null,disposed=false,netSubscription=null,view;
    var scale=1,navAnchor=null,navGeneration=-1,origin={x:16,y:102};
    function valid(panel){return panel&&(!panel.IsValid||panel.IsValid());}
    function p(id){return valid(root)?root.FindChildTraverse(id):null;}
    function active(){return !disposed&&valid(panel);}
    function style(panel,values){Object.keys(values).forEach(function(key){panel.style[key]=values[key];});}
    function place(panel,x,y,width,height){style(panel,{position:x+"px "+y+"px 0px",width:width+"px",height:height+"px",horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px"});}
    function hideDetail(){
        if(!detailAnchor)return;
        var anchor=detailAnchor,positioner=cfg.SurvivalTooltipPosition;
        if(valid(anchor))anchor.RemoveClass("TreasureHovered");
        detailAnchor=null;
        if(positioner&&positioner.HideText)positioner.HideText(anchor);
        else $.DispatchEvent("DOTAHideTextTooltip");
    }
    function close(){
        if(disposed)return;
        opened=false;hideDetail();
        if(view)view.Close();
        if(valid(p("TreasureWindow")))p("TreasureWindow").AddClass("ArchiveHidden");
        if(valid(p("TreasureScrim")))p("TreasureScrim").AddClass("ArchiveHidden");
    }
    function quantity(reward){
        var value=reward.quantity!==undefined?reward.quantity:reward.qty!==undefined?reward.qty:reward.count;
        return value!==undefined&&value!==null&&String(value).trim()!==""&&isFinite(Number(value))&&Number(value)>=0?String(value):"";
    }
    function showDetail(reward,card){
        if(!active()||!opened||!valid(card))return;
        hideDetail();detailAnchor=card;card.AddClass("TreasureHovered");
        var qty=quantity(reward),name=reward.name||"宝物",effect=reward.description||"暂无效果说明";
        p("TreasureTooltipName").text=name;p("TreasureTooltipEffect").text=effect;
        // The shared lease raises the native tooltip above the modal's ancestors.
        var positioner=cfg.SurvivalTooltipPosition,content=name+"\n"+effect+(qty!==""?"\n拥有数量："+qty:"");
        if(positioner&&positioner.ShowText)positioner.ShowText(card,content);
        else $.DispatchEvent("DOTAShowTextTooltip",card,content);
    }
    function fillCardIcon(art){
        place(art,0,0,CELL,CELL);
        style(art,{width:"100%",height:"100%",border:"0px",overflow:"clip"});
        if(art.SetScaling)art.SetScaling("stretch-to-cover-preserve-aspect");
        art.hittest=false;art.hittestchildren=false;
    }
    function icon(parent,item){
        var resources=cfg.SurvivalItemResources,presentation=cfg.SurvivalRewardPresentation;
        if(resources&&resources.Lookup(item)&&presentation&&presentation.CreateRegisteredIcon){
            var registered=presentation.CreateRegisteredIcon(parent,item,"TreasureCompactIcon");
            if(registered){fillCardIcon(registered);return;}
        }
        if(item.icon_name){
            var name=String(item.icon_name),texture=name.indexOf("/")>=0,isItem=name.indexOf("item_")===0;
            var art=$.CreatePanel(texture?"Image":isItem?"DOTAItemImage":"DOTAAbilityImage",parent,"");
            if(texture)art.SetImage("file://{images}/spellicons/"+name+".png");
            else if(isItem)art.itemname=name;else art.abilityname=name;
            if(presentation&&presentation.FillIcon)presentation.FillIcon(art,item);
            art.AddClass("TreasureCompactIcon");fillCardIcon(art);return;
        }
        var glyph=$.CreatePanel("Label",parent,"");glyph.AddClass("TreasureCompactGlyph");
        glyph.text=String(item.name||"宝").substring(0,1);glyph.hittest=false;
    }
    function render(){
        if(!active())return;hideDetail();var grid=p("TreasureCards");grid.RemoveAndDeleteChildren();
        p("TreasureCount").text=history.length+" / "+CAPACITY;
        for(var i=0;i<CAPACITY;i++){
            var card=$.CreatePanel("Panel",grid,"TreasureCard_"+i),item=history[i];
            card.AddClass("TreasureCard");place(card,(i%COLUMNS)*(CELL+GAP),Math.floor(i/COLUMNS)*(CELL+GAP),CELL,CELL);
            card.hittest=!!item;card.hittestchildren=false;
            if(!item){card.AddClass("TreasureVacant");continue;}
            icon(card,item);if(i===0)card.AddClass("TreasureLatest");
            var qty=quantity(item);
            if(qty!==""){
                var badge=$.CreatePanel("Label",card,"");badge.AddClass("TreasureQuantity");badge.text=qty;badge.hittest=false;
            }
            (function(reward,anchor){
                anchor.SetPanelEvent("onmouseover",function(){showDetail(reward,anchor);});
                anchor.SetPanelEvent("onmouseout",function(){if(detailAnchor===anchor)hideDetail();});
            })(item,card);
        }
    }
    function update(value){
        if(!active())return;var data=value&&value.history||{};
        history=Array.isArray(data)?data.slice(0,CAPACITY):Object.keys(data).sort(function(a,b){return Number(a)-Number(b);}).slice(0,CAPACITY).map(function(key){return data[key];});
        if(opened)render();
    }
    function findNav(){
        var generation=cfg.HandoffGeneration||0;
        if(valid(navAnchor)&&navGeneration===generation)return navAnchor;
        var ancestor=root;
        while(valid(ancestor)&&ancestor.GetParent&&valid(ancestor.GetParent()))ancestor=ancestor.GetParent();
        navAnchor=valid(ancestor)?ancestor.FindChildTraverse("HandoffNav_treasure"):null;navGeneration=generation;
        return navAnchor;
    }
    function position(fitScale){
        if(!active()||!opened)return;
        scale=Math.max(.01,Math.min(1,Number(fitScale)||1));
        var panel=p("TreasureWindow"),parent=panel.GetParent(),sx=parent.actualuiscale_x||1,sy=parent.actualuiscale_y||1;
        var width=(parent.actuallayoutwidth||1920)/sx,height=(parent.actuallayoutheight||1080)/sy;
        var at=parent.GetPositionWithinWindow?parent.GetPositionWithinWindow():{x:0,y:0},anchor=findNav(),x=16,y=102;
        if(valid(anchor)&&anchor.GetPositionWithinWindow){
            var navAt=anchor.GetPositionWithinWindow();
            x=(navAt.x-at.x)/sx;y=(navAt.y+(anchor.actuallayoutheight||0)-at.y)/sy+4;
        }
        x=Math.max(8,Math.min(x,width-WIDTH*scale-8));
        y=Math.max(8,Math.min(y,height-HEIGHT*scale-8));
        origin={x:x,y:y};
        style(panel,{horizontalAlign:"left",verticalAlign:"top",position:x+"px "+y+"px 0px",transformOrigin:"0% 0%",transform:"scale3d("+scale+","+scale+",1)"});
    }
    function fit(){if(active()&&opened)position(U.Fit(p("TreasureWindow"),root,WIDTH,HEIGHT,{widthFraction:.95,heightFraction:.9}));}
    var panel=p("TreasureWindow"),scrim=p("TreasureScrim");
    panel.AddClass("TreasureCompact");panel.RemoveClass("MenuV10Page");panel.RemoveClass("TreasureV10Page");panel.RemoveClass("TreasurePurple");
    ["TreasureContent","TreasureHeader","TreasureHeading","TreasureTitle","TreasureCount","TreasureCards"].forEach(function(id){var node=p(id);if(valid(node)){node.visible=true;node.style.visibility="visible";}});
    ["TreasureAtmosphere","TreasureFrame","TreasureEmblem","TreasureSubtitle","TreasureHint","TreasureDetail","TreasureEmpty"].forEach(function(id){var node=p(id);if(valid(node)){node.visible=false;node.style.visibility="collapse";}});
    place(p("TreasureContent"),0,0,WIDTH,HEIGHT);p("TreasureContent").style.flowChildren="none";
    place(p("TreasureHeader"),0,0,WIDTH,44);p("TreasureHeader").style.flowChildren="none";
    place(p("TreasureHeading"),14,8,142,30);p("TreasureHeading").style.flowChildren="none";
    place(p("TreasureTitle"),0,0,142,30);p("TreasureTitle").text="本局宝物";
    place(p("TreasureCount"),166,12,78,24);
    place(p("TreasureClose"),254,6,28,30);
    p("TreasureClose").Children().forEach(function(node){node.visible=false;});
    var closeGlyph=p("TreasureCloseGlyph");if(!valid(closeGlyph))closeGlyph=$.CreatePanel("Label",p("TreasureClose"),"TreasureCloseGlyph");
    closeGlyph.visible=true;closeGlyph.text="×";closeGlyph.hittest=false;
    p("TreasureClose").hittestchildren=false;p("TreasureClose").SetPanelEvent("onactivate",close);
    place(p("TreasureCards"),14,58,264,332);p("TreasureCards").style.flowChildren="none";
    // The former V10 shell left its input shield on this retained native panel.
    panel.Children().forEach(function(node){if(node.BHasClass&&node.BHasClass("UIModalInputShield"))node.DeleteAsync(0);});
    var existingChildren=panel.Children();
    view=U.ModalShell.Adopt({id:"treasure",panel:panel,root:root,scrim:scrim,width:WIDTH,height:HEIGHT,fit:{widthFraction:.95,heightFraction:.9},onFit:position,onClose:close});
    var shellChildren=panel.Children().filter(function(node){return existingChildren.indexOf(node)<0;});
    style(panel,{backgroundColor:"gradient(linear, 0% 0%, 0% 100%, from(#2e243dfc), to(#21182ffc))",border:"2px solid #b6996e",borderRadius:"2px",boxShadow:"#000000b0 0px 4px 18px 0px",padding:"0px",flowChildren:"none",overflow:"clip",horizontalAlign:"left",verticalAlign:"top",transformOrigin:"0% 0%"});
    scrim.style.backgroundColor="#00000000";
    close();
    netSubscription=CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(_,key,value){if(active()&&String(key)===String(Game.GetLocalPlayerID()))update(value);});
    function open(){if(!active()||opened)return;opened=true;panel.RemoveClass("ArchiveHidden");scrim.RemoveClass("ArchiveHidden");view.Open();fit();update(CustomNetTables.GetTableValue("survival_rogue_reward",String(Game.GetLocalPlayerID())));panel.SetFocus();}
    cfg.SurvivalTreasure={Close:close,IsOpen:function(){return active()&&opened;},Open:open,Toggle:function(){if(!active())return;if(opened)close();else open();},Fit:fit,Inspect:function(){return {width:WIDTH,height:HEIGHT,cellSize:CELL,columns:COLUMNS,rows:ROWS,count:history.length,scale:scale,anchorId:valid(navAnchor)?navAnchor.id:null,x:origin.x,y:origin.y};},Dispose:function(){if(disposed)return;close();disposed=true;if(netSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(netSubscription);netSubscription=null;if(view)view.Dispose();shellChildren.forEach(function(node){if(valid(node))node.DeleteAsync(0);});}};
    $.RegisterEventHandler("Cancelled",p("TreasureWindow"),function(){var layers=cfg.SurvivalUILayers;if(layers&&layers.HandleEscape)return layers.HandleEscape("treasure");close();return true;});
    if(Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){var command="treasure_style_review_"+Date.now();Game.AddCommand(command,function(){if(active())open();},"Inspect real treasure history without changing rewards",0);$.Msg("TREASURE_STYLE_COMMAND "+command);}
})();
