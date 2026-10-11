(function () {
    "use strict";
    var CAPACITY=20,cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),M=cfg.SurvivalMenuV10;
    if(cfg.SurvivalTreasure&&cfg.SurvivalTreasure.Dispose)cfg.SurvivalTreasure.Dispose();
    if(!M)return;
    var opened=false,history=[],detailAnchor=null,disposed=false,netSubscription=null,view;
    function valid(panel){return panel&&(!panel.IsValid||panel.IsValid());}
    function p(id){return valid(root)?root.FindChildTraverse(id):null;}
    function active(){return !disposed&&valid(p("TreasureWindow"));}
    function hideDetail(){
        if(valid(detailAnchor))detailAnchor.RemoveClass("TreasureHovered");
        detailAnchor=null;if(view)view.TooltipHide();
        if(valid(p("TreasureTooltip")))p("TreasureTooltip").AddClass("ArchiveHidden");
    }
    function close(){opened=false;hideDetail();if(view)view.Close();}
    function quantity(reward){
        var value=reward.quantity!==undefined?reward.quantity:reward.qty!==undefined?reward.qty:reward.count;
        return value!==undefined&&value!==null&&String(value).trim()!==""&&isFinite(Number(value))&&Number(value)>=0?String(value):"";
    }
    function showDetail(reward,card){
        if(!active()||!opened||!valid(card))return;
        hideDetail();detailAnchor=card;card.AddClass("TreasureHovered");
        var qty=quantity(reward),name=reward.name||"宝物",effect=reward.description||"暂无效果说明";
        // Compatibility anchors retain their original data, while the common
        // V10 tooltip owns all visible framing and measured layout.
        p("TreasureTooltipName").text=name;p("TreasureTooltipEffect").text=effect;
        view.TooltipShow({name:name,state:"本局获得",description:effect,quantity:qty||undefined,metric:qty?"拥有数量":""},card);
    }
    function icon(parent,item){
        if(item.icon_name){
            var name=String(item.icon_name),texture=name.indexOf("/")>=0,isItem=name.indexOf("item_")===0;
            var art=$.CreatePanel(texture?"Image":isItem?"DOTAItemImage":"DOTAAbilityImage",parent,"");
            if(texture)art.SetImage("file://{images}/spellicons/"+name+".png");
            else if(isItem)art.itemname=name;else art.abilityname=name;
            if(art.SetScaling)art.SetScaling("stretch-to-fit-preserve-aspect");
            M.Place(art,0,0,120,120);art.hittest=false;return art;
        }
        return M.Label(parent,String(item.name||"宝").substring(0,1),0,32,120,54,34,"#c7addf","center");
    }
    function render(){
        if(!active())return;hideDetail();var grid=p("TreasureCards");grid.RemoveAndDeleteChildren();
        p("TreasureCount").text=history.length+" / "+CAPACITY;
        var hint=history.length?"最近获得的宝物在前 · 最多展示 20 件":"尚未获得宝物 · 在命运抉择中选择强化后，将在这里展示";
        p("TreasureHint").text=hint;p("TreasureEmpty").visible=history.length===0;
        view.SetStatus(hint);view.SetTitle("本局宝物");
        history.forEach(function(item,i){
            var card=$.CreatePanel("Panel",grid,"");card.AddClass("TreasureCard");card.hittestchildren=false;
            var qty=quantity(item);
            view.DecorateCell(card,{index:i,name:item.name||"宝物",count:qty||undefined,iconBuilder:function(parent){return icon(parent,item);}});
            if(card.SetHasClass)card.SetHasClass("TreasureLatest",i===0);else if(i===0)card.AddClass("TreasureLatest");
            card.SetPanelEvent("onmouseover",function(){showDetail(item,card);});card.SetPanelEvent("onmouseout",hideDetail);
        });
    }
    function update(value){
        if(!active())return;var data=value&&value.history||{};
        history=Array.isArray(data)?data.slice(0,CAPACITY):Object.keys(data).sort(function(a,b){return Number(a)-Number(b);}).slice(0,CAPACITY).map(function(key){return data[key];});
        if(opened)render();
    }
    view=M.Adopt({id:"treasure",navId:"treasure",panel:p("TreasureWindow"),root:root,scrim:p("TreasureScrim"),title:"本局宝物",onClose:close});
    p("TreasureWindow").AddClass("TreasureV10Page");
    p("TreasureWindow").RemoveClass("TreasurePurple");
    ["TreasureAtmosphere","TreasureFrame","TreasureContent","TreasureTooltip"].forEach(function(id){var node=p(id);if(valid(node))node.style.visibility="collapse";});
    view.Move(p("TreasureCards"),view.content);M.Place(p("TreasureCards"),0,0,1113,610);M.Style(p("TreasureCards"),{flowChildren:"none",overflow:"squish scroll",backgroundImage:"none",backgroundColor:"transparent",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top"});
    view.Move(p("TreasureCount"),view.header);M.Place(p("TreasureCount"),1344,148,168,28);M.Style(p("TreasureCount"),{fontSize:"18px",color:"#bbb2d2",textAlign:"right"});
    var empty=p("TreasureEmpty");if(!valid(empty))empty=$.CreatePanel("Label",p("TreasureContent"),"TreasureEmpty");
    view.Move(empty,view.content);empty.text="尚未获得宝物";empty.hittest=false;empty.AddClass("TreasureV10Empty");M.Place(empty,0,225,1113,44);M.Style(empty,{fontSize:"24px",color:"#ad99c2",textAlign:"center"});
    view.SetSidebar([{id:"history",label:"本局宝物"}],"history",function(){hideDetail();});
    netSubscription=CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(_,key,value){if(active()&&String(key)===String(Game.GetLocalPlayerID()))update(value);});
    function open(){if(!active()||opened)return;opened=true;p("TreasureWindow").RemoveClass("ArchiveHidden");p("TreasureScrim").RemoveClass("ArchiveHidden");view.Open();update(CustomNetTables.GetTableValue("survival_rogue_reward",String(Game.GetLocalPlayerID())));p("TreasureWindow").SetFocus();}
    cfg.SurvivalTreasure={Close:close,IsOpen:function(){return active()&&opened;},Open:open,Toggle:function(){if(!active())return;if(opened)close();else open();},Dispose:function(){if(disposed)return;close();disposed=true;if(netSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(netSubscription);netSubscription=null;if(view)view.Dispose();}};
    $.RegisterEventHandler("Cancelled",p("TreasureWindow"),function(){var layers=cfg.SurvivalUILayers;if(layers&&layers.HandleEscape)return layers.HandleEscape("treasure");close();return true;});
    if(Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){var command="treasure_style_review_"+Date.now();Game.AddCommand(command,function(){if(active())open();},"Inspect real treasure history without changing rewards",0);$.Msg("TREASURE_STYLE_COMMAND "+command);}
})();
