(function () {
    "use strict";
    var CAPACITY = 20;
    var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),U=cfg.SurvivalUI;
    if(cfg.SurvivalTreasure&&cfg.SurvivalTreasure.Dispose)cfg.SurvivalTreasure.Dispose();
    var opened = false, history = [],detailAnchor=null,detailGeneration=0,disposed=false,netSubscription=null,purpleShell=null;
    function valid(panel){return panel&&(!panel.IsValid||panel.IsValid());}
    function p(id) {
        if(!valid(root))return null;
        var panel=root.FindChildTraverse?root.FindChildTraverse(id):$("#" + id);
        return valid(panel)?panel:null;
    }
    function active(){return !disposed&&!!p("TreasureWindow");}
    function style(panel,values){Object.keys(values).forEach(function(key){panel.style[key]=values[key];});}
    function layers() { return GameUI.CustomUIConfig().SurvivalUILayers; }
    function hideDetail() {
        detailGeneration++;
        if(valid(detailAnchor))detailAnchor.RemoveClass("TreasureHovered");
        detailAnchor=null;
        var tip=p("TreasureTooltip"),hint=p("TreasureDetailHint");
        if(tip)tip.AddClass("ArchiveHidden");
        if(hint)hint.RemoveClass("ArchiveHidden");
    }
    function close() {
        opened = false;
        var win=p("TreasureWindow"),scrim=p("TreasureScrim");
        if(win)win.AddClass("ArchiveHidden");
        if(scrim)scrim.AddClass("ArchiveHidden");
        hideDetail();
        if (modal) modal.Close();
        else if (layers()) layers().Close("treasure");
    }
    function label(parent, text, style) {
        var node = $.CreatePanel("Label", parent, "");
        node.text = text; node.hittest = false;
        if (style) node.AddClass(style);
        return node;
    }
    function quantity(reward){
        var value=reward.quantity!==undefined?reward.quantity:reward.qty!==undefined?reward.qty:reward.count;
        return value!==undefined&&isFinite(Number(value))&&Number(value)>=0?String(value):"";
    }
    function positionDetail(generation){
        if(!active()||generation!==detailGeneration||!valid(detailAnchor))return;
        var tip=p("TreasureTooltip"),sx=root.actualuiscale_x||1,sy=root.actualuiscale_y||1;
        if(!tip)return;
        var screenWidth=root.actuallayoutwidth||1920,screenHeight=root.actuallayoutheight||1080;
        tip.style.maxHeight=Math.floor(screenHeight/sy-24)+"px";
        var at=detailAnchor.GetPositionWithinWindow();
        var width=(detailAnchor.actuallayoutwidth||128*sx)*((detailAnchor.actualuiscale_x||sx)/sx);
        var tw=380*sx,th=tip.actuallayoutheight||160*sy,gap=12*sx,pad=12*sx;
        var x=at.x+width+gap;
        if(x+tw>screenWidth-pad)x=at.x-gap-tw;
        x=Math.max(pad,Math.min(x,screenWidth-tw-pad));
        var y=Math.max(pad,Math.min(at.y+16,screenHeight-th-pad));
        tip.style.position=Math.round(x/sx)+"px "+Math.round(y/sy)+"px 0px";
        tip.style.zIndex=String((Number(p("TreasureWindow").style.zIndex)||100000)+2);
        $.Schedule(.05,function(){positionDetail(generation);});
    }
    function showDetail(reward,card) {
        if (!active()||!opened||!valid(card)) return;
        hideDetail();detailAnchor=card;card.AddClass("TreasureHovered");
        p("TreasureTooltipName").text = reward.name || "宝物";
        var qty=quantity(reward);p("TreasureTooltipCount").text=qty?"拥有数量  "+qty:"";
        p("TreasureTooltipCount").visible=!!qty;
        p("TreasureTooltipEffect").text = reward.description || "暂无效果说明";
        p("TreasureDetailHint").AddClass("ArchiveHidden");
        p("TreasureTooltip").RemoveClass("ArchiveHidden");
        positionDetail(detailGeneration);
    }
    function render() {
        if(!active())return;
        hideDetail();
        p("TreasureCards").RemoveAndDeleteChildren();
        p("TreasureCount").text = history.length + " / " + CAPACITY;
        p("TreasureHint").text = history.length ? "最近获得的宝物在前 · 最多展示 20 件" : "尚未获得宝物 · 在命运抉择中选择强化后，将在这里展示";
        p("TreasureEmpty").visible=history.length===0;
        for (var i = 0; i < history.length; i++) {
            var card = $.CreatePanel("Panel", p("TreasureCards"), "");
            card.AddClass("TreasureCard"); card.hittestchildren = false;
            style(card,{width:"128px",height:"128px",margin:"0px 12px 2px 0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px"});
            var item = history[i];
            var art = $.CreatePanel("Panel", card, "");
            art.AddClass("TreasureArt"); art.hittest = false;
            if (item && item.icon_name) {
                var iconName = String(item.icon_name);
                var isTexture = iconName.indexOf("/") >= 0;
                var isItem = iconName.indexOf("item_") === 0;
                var icon = $.CreatePanel(isTexture ? "Image" : (isItem ? "DOTAItemImage" : "DOTAAbilityImage"), art, "");
                if (isTexture) icon.SetImage("file://{images}/spellicons/" + iconName + ".png");
                else if (isItem) icon.itemname = iconName;
                else icon.abilityname = iconName;
                icon.AddClass("TreasureIcon"); icon.hittest = false;
            } else {
                label(art, String(item.name || "宝").substring(0, 1), "TreasureGlyph");
            }
            label(card, item.name, "TreasureName");
            var qty=quantity(item);if(qty)label(card,"×"+qty,"TreasureQuantity");
            if (i === 0) card.AddClass("TreasureLatest");
            (function (panel, reward) {
                panel.SetPanelEvent("onmouseover", function () { showDetail(reward,panel); });
                panel.SetPanelEvent("onmouseout", hideDetail);
            })(card, item);
        }
    }
    function update(value) {
        if(!active())return;
        var data = value && value.history || {};
        history = Array.isArray(data) ? data.slice(0, CAPACITY)
            : Object.keys(data).sort(function (a, b) { return Number(a) - Number(b); })
                .slice(0, CAPACITY).map(function (key) { return data[key]; });
        if (opened) render();
    }
    function preparePurple(){
        var win=p("TreasureWindow"),content=p("TreasureContent");win.AddClass("TreasurePurple");
        style(content,{position:"0px 132px 0px",width:"1280px",height:"668px",padding:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent"});
        ["TreasureAtmosphere","TreasureFrame","TreasureHeader"].forEach(function(id){p(id).style.visibility="collapse";});
        p("TreasureCount").SetParent(content);
        style(p("TreasureCount"),{position:"1104px 14px 0px",width:"96px",height:"28px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",fontSize:"18px",textAlign:"right",color:"#e5c67d"});
        style(p("TreasureHint"),{position:"80px 14px 0px",width:"1000px",height:"32px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top",fontSize:"18px",color:"#bdb0d3"});
        style(p("TreasureCards"),{position:"80px 72px 0px",width:"1120px",height:"522px",margin:"0px",padding:"0px",flowChildren:"right-wrap",overflow:"squish scroll"});
        style(p("TreasureDetail"),{position:"80px 630px 0px",width:"1120px",height:"24px",padding:"0px",margin:"0px",border:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent"});
        p("TreasureDetailDivider").style.visibility="collapse";
        var empty=p("TreasureEmpty")||$.CreatePanel("Label",content,"TreasureEmpty");empty.text="尚未获得宝物";empty.hittest=false;empty.AddClass("TreasureEmpty");
        var tip=p("TreasureTooltip");tip.SetParent(win.GetParent());tip.AddClass("TreasurePurpleTooltip");tip.hittest=false;tip.hittestchildren=false;
        style(tip,{width:"380px",height:"fit-children",padding:"16px 18px",flowChildren:"down",overflow:"squish scroll",backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#211631),to(#0e0b1d))",border:"1px solid #b58d47",borderRadius:"5px",boxShadow:"#000000cc 0px 5px 18px 0px"});
        var count=p("TreasureTooltipCount")||$.CreatePanel("Label",tip,"TreasureTooltipCount");count.hittest=false;count.visible=false;tip.MoveChildBefore(count,p("TreasureTooltipEffect"));
        var heading=tip.Children().filter(function(panel){return panel.BHasClass("TreasureTooltipHeading");})[0]||label(tip,"宝物效果","TreasureTooltipHeading");tip.MoveChildBefore(heading,p("TreasureTooltipEffect"));
    }
    preparePurple();
    var modal=U&&U.ModalShell.Adopt({id:"treasure",panel:p("TreasureWindow"),root:root,scrim:p("TreasureScrim"),width:1280,height:800,fit:{reference:[1920,1080]},onClose:close});
    if(cfg.SurvivalPurpleShell)purpleShell=cfg.SurvivalPurpleShell.Adopt({id:"treasure",panel:p("TreasureWindow"),width:1280,height:800,onClose:close});
    netSubscription=CustomNetTables.SubscribeNetTableListener("survival_rogue_reward", function (table, key, value) {
        if (active()&&String(key) === String(Game.GetLocalPlayerID())) update(value);
    });
    GameUI.CustomUIConfig().SurvivalTreasure = {
        Close: close,
        IsOpen:function(){return active()&&opened;},
        Open:function(){if(active()&&!opened)this.Toggle();},
        Toggle: function () {
            if(!active())return;
            if (opened) { close(); return; }
            opened = true;
            p("TreasureWindow").RemoveClass("ArchiveHidden");
            p("TreasureScrim").RemoveClass("ArchiveHidden");
            update(CustomNetTables.GetTableValue("survival_rogue_reward", String(Game.GetLocalPlayerID())));
            if (modal) modal.Open();
            else if (layers()) layers().Open("treasure", p("TreasureWindow"), close, { scrim: p("TreasureScrim") });
            p("TreasureWindow").SetFocus();
        },
        Dispose:function(){
            if(disposed)return;
            disposed=true;close();
            if(netSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(netSubscription);
            netSubscription=null;
            if(purpleShell&&purpleShell.Dispose)purpleShell.Dispose();
            if(modal&&modal.Dispose)modal.Dispose();
        }
    };
    // Tools-only inspection: show real reward data without stealing desktop focus.
    if (Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand) {
        var reviewCommand = "treasure_style_review_" + Date.now();
        Game.AddCommand(reviewCommand, function () {
            if(!active())return;
            opened = true;
            p("TreasureWindow").RemoveClass("ArchiveHidden");
            p("TreasureScrim").RemoveClass("ArchiveHidden");
            update(CustomNetTables.GetTableValue("survival_rogue_reward", String(Game.GetLocalPlayerID())));
            if (modal) modal.Open();
            else if (layers()) layers().Open("treasure", p("TreasureWindow"), close, { scrim:p("TreasureScrim") });
            $.Schedule(0.25, function () {
                if(!active())return;
                var win=p("TreasureWindow"), grid=p("TreasureCards");
                $.Msg("TREASURE_STYLE_REVIEW " + JSON.stringify({hidden:win.BHasClass("ArchiveHidden"),size:[win.actuallayoutwidth,win.actuallayoutheight],cards:grid.Children().length,owned:history.length}));
            });
        }, "Inspect treasure presentation without purchases or reward changes", 0);
        $.Msg("TREASURE_STYLE_COMMAND " + reviewCommand);
    }
    $.RegisterEventHandler("Cancelled", p("TreasureWindow"), function () {
        var uiLayers = layers();
        if (uiLayers && typeof uiLayers.HandleEscape === "function") return uiLayers.HandleEscape("treasure");
        close();
        return true;
    });
})();
