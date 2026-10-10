(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), owner=$.GetContextPanel(), timer=null;
    var lifetime=$.CreatePanel("Panel",owner,"");lifetime.visible=false;
    function p(id){if(!valid(lifetime))return null;var n=owner.FindChildTraverse(id);return valid(n)?n:null;}
    function valid(node){return node&&(!node.IsValid||node.IsValid());}
    function tenRule(pity){
        var list=Array.isArray(pity)?pity:Object.keys(pity||{}).map(function(k){return pity[k];});
        for(var i=0;i<list.length;i++)if(Number(list[i].batch_size)===10)return list[i];
        return null;
    }
    function quality(node,rule){
        var q=rule?String(rule.quality||"").toUpperCase():"";
        if(["N","R","SR","SSR","UR"].indexOf(q)<0)q="";
        node.text=q;node.SetHasClass("LHQualitySR",q==="SR");node.SetHasClass("LHQualityUR",q==="UR");
        // ActionButton.Adopt sets inline label colors; explicitly replace that inherited token here.
        node.style.color=q==="SR"?"#c9a2ef":q==="UR"?"#e4b2ef":"#f0d48a";
        node.visible=!!q;
    }
    function viewportSize(){
        var root=p("LotteryWindow"),canvas=p("LotteryMainCanvas");
        if(!valid(root)||!valid(canvas))return false;
        // Hidden lottery panels have no layout on their first open. Use the
        // already laid-out HUD ancestor for both initial and subsequent fits.
        var viewport=null,node=$.GetContextPanel();
        while(valid(node)){
            if(node.actuallayoutwidth>0&&node.actuallayoutheight>0)viewport=node;
            node=node.GetParent?node.GetParent():null;
        }
        if(!viewport&&root.actuallayoutwidth>0&&root.actuallayoutheight>0)viewport=root;
        if(!viewport)return false;
        var w=viewport.actuallayoutwidth/(viewport.actualuiscale_x||1);
        var h=viewport.actuallayoutheight/(viewport.actualuiscale_y||1);
        return {width:w,height:h};
    }
    function fit(){
        var viewport=viewportSize(),canvas=p("LotteryMainCanvas");
        if(!viewport||!valid(canvas))return false;
        if(canvas.BHasClass("LotteryPurple")){
            var popupScale=Math.min(viewport.width/1920,viewport.height/1080);
            canvas.style.width="1280px";canvas.style.height="800px";
            canvas.style.transform="scale3d("+popupScale+","+popupScale+",1)";canvas.style.opacity="1";
            if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Resize(1280,482);
            if(cfg.LotteryCinematic&&cfg.LotteryCinematic.Resize)cfg.LotteryCinematic.Resize(1280,672);
            return true;
        }
        // Fill the entire viewport; preserve a 1600 x 900 safe area for controls.
        // Ultra-wide screens gain horizontal scene space, 4:3 gains vertical space.
        var scale=Math.min(viewport.width/1600,viewport.height/900);
        canvas.style.width=(viewport.width/scale)+"px";
        canvas.style.height=(viewport.height/scale)+"px";
        canvas.style.transform="scale3d("+scale+","+scale+",1)";
        canvas.style.opacity="1";
        if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Resize(viewport.width,viewport.height);
        if(cfg.LotteryCinematic&&cfg.LotteryCinematic.Resize)cfg.LotteryCinematic.Resize(viewport.width,viewport.height);
        return true;
    }
    cfg.LotteryHandoff={
        Viewport:viewportSize,
        Prepare:function(){
            if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Close();
            var canvas=p("LotteryMainCanvas");
            canvas.RemoveClass("ReferenceWindow");
            if(canvas.BHasClass("LotteryPurple")){if(cfg.SurvivalPurpleLottery)cfg.SurvivalPurpleLottery.Apply();fit();return;}
            canvas.style.backgroundImage="none";canvas.style.backgroundColor="transparent";
            canvas.style.border="0px";canvas.style.borderRadius="0px";canvas.style.boxShadow="none";
            canvas.style.opacity="0";fit();
        },
        Background:function(poolId){
            var themes=["map","cultivation","dragon_knight","summer"],scene=p("LotterySceneBackground");
            var key=themes.indexOf(poolId)>=0?poolId:"map";
            p("LotteryWindow").SetHasClass("LotteryGoldenTicket",key==="dragon_knight"||key==="summer");
            if(valid(scene))themes.forEach(function(id){scene.SetHasClass("LotteryScene_"+id,id===key);});
            if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Select(key);
        },
        Name:function(id,fallback){return id==="map"?"地图宝箱":id==="dragon_knight"?"龙脊尖兵":fallback;},
        Actions:function(){
            ["LotterySingleButton","LotteryTenButton","LotteryConfirm","LotteryAgain"].forEach(function(id){
                var button=p(id);if(!valid(button))return;
                button.AddClass("ZXDrawAction");button.hittestchildren=false;
                button.style.backgroundImage="none";button.style.backgroundColor="transparent";
                button.style.border="0px";button.style.boxShadow="none";
                if(id==="LotteryConfirm"||id==="LotteryAgain"){
                    if(!button.Children().some(function(c){return c.BHasClass("ZXActionSkin");})){
                        var skin=$.CreatePanel("Panel",button,"");skin.AddClass("ZXActionSkin");skin.hittest=false;
                        button.MoveChildBefore(skin,button.Children()[0]);
                    }
                    button.Children().forEach(function(c){if(c.paneltype==="Label")c.style.color="#372b19";});
                }
            });
        },
        Ticket:function(selected){
            var gold=selected&&selected.ticket_content_id==="special_lottery_ticket";
            p("LotteryWindow").SetHasClass("LotteryGoldenTicket",!!gold);
            var notice=p("LotteryUnlockNotice");
            if(valid(notice)){
                notice.visible=!!selected&&selected.unlocked===false;
                notice.text=selected&&selected.unlocked===false?"地图宝箱累计开启 "+Number(selected.unlock_progress||0)+" / "+Number(selected.unlock_required||100)+" 次后解锁":"";
            }
        },
        Buttons:function(selected,waiting){
            ["LotterySingleText","LotteryTenText","LotterySingleCost","LotteryTenCost"].forEach(function(id){p(id).style.color="#251708";});
            var rule=waiting?null:tenRule(selected&&selected.pity);
            quality(p("LHTenQuality"),rule);
            // One text run gives the Chinese caption and Latin rarity an identical baseline.
            var caption=p("LotteryDrawPityCaption"),rarity=p("LHTenQuality");
            if(valid(caption)){
                caption.html=true;
                caption.text="十连保底"+(rule?' <font color="'+rarity.style.color+'">'+rarity.text+'</font>':"");
                // quality() sets visible=true on every refresh; hide the retired label at runtime.
                rarity.visible=false;
                rarity.style.visibility="collapse";
            }
            var hint=p("LotteryDrawPity");if(valid(hint))hint.visible=!!rule;
            var free=selected&&Number(selected.single_cost)===0;
            p("LotterySingleButton").SetHasClass("ZXFreeDraw",!!free);
            if(cfg.SurvivalPurpleLottery)cfg.SurvivalPurpleLottery.Apply();
        },
        Guarantee:function(rules){
            var rule=tenRule(rules);quality(p("LHGuaranteeQuality"),rule);
            if(rule)p("LotteryGuaranteeValue").text="10连";
        },
        Open:function(){
            if(timer!==null&&$.CancelScheduled)$.CancelScheduled(timer);
            function tick(){timer=null;if(!valid(p("LotteryWindow"))||p("LotteryWindow").BHasClass("LotteryClosed"))return;var ready=fit();timer=$.Schedule(ready?.25:0,tick);}
            tick();
        },
        Close:function(){if(timer!==null&&$.CancelScheduled)$.CancelScheduled(timer);timer=null;if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Close();},
        CloseButton:function(button,action){
            button.RemoveAndDeleteChildren();
            var glyph=$.CreatePanel("Label",button,"");glyph.AddClass("LHCloseGlyph");glyph.text="×";glyph.hittest=false;
            button.enabled=true;button.hittest=true;button.hittestchildren=false;button.SetPanelEvent("onactivate",action);
        },
        Tab:function(button,pool,hostId){
            if(hostId==="LotteryInfoTabs")return;
            button.AddClass("LHMainTab");button.hittestchildren=false;
            var glow=$.CreatePanel("Panel",button,"");glow.AddClass("LHTabGlow");glow.hittest=false;
        },
        Status:function(text){
            // Keep real loading/errors; omit only idle instructional copy.
            p("LotteryStatus").SetHasClass("LHIdle",text==="请选择开启数量"||text==="");
        },
        Ready:function(){fit();var status=p("LotteryStatus"),text=String(status.text||"");if(text.indexOf("正在读")===0||text.indexOf("正在切换")===0){status.text="";status.SetHasClass("LHIdle",true);}}
    };
    // Test-only, read-only UI diagnostics. Unique names survive Panorama reloads.
    if(typeof Game!=="undefined"&&Game.AddCommand){
        var stamp=Date.now();
        Game.AddCommand("lottery_handoff_open_"+stamp,function(){cfg.SurvivalLottery.Open();},"Open existing lottery UI",0);
        Game.AddCommand("lottery_handoff_refresh_"+stamp,function(){cfg.SurvivalLottery.Refresh();},"Refresh lottery snapshot",0);
        Game.AddCommand("lottery_handoff_dump_"+stamp,function(){
            var values={};["LotteryWindow","LotteryMainCanvas","LotteryPoolTabs","LotteryTitle","LotteryTicketValue","LotteryGuaranteeValue","LotterySingleText","LotteryTenText","LotterySingleCost","LotteryTenCost","LotteryTenButton"].forEach(function(id){var n=p(id);values[id]=n?{text:n.text,width:n.actuallayoutwidth,height:n.actuallayoutheight,enabled:n.enabled,scale:n.actualuiscale_x}:null;});
            var tabs=p("LotteryPoolTabs");
            if(valid(tabs))values.poolTabs={parent:tabs.GetParent().id,visible:tabs.visible,position:tabs.GetPositionWithinWindow(),children:tabs.Children().map(function(tab){return {width:tab.actuallayoutwidth,height:tab.actuallayoutheight,visible:tab.visible,position:tab.GetPositionWithinWindow(),labels:tab.Children().filter(function(n){return n.paneltype==="Label";}).map(function(n){return n.text;})};})};
            $.Msg("[LOTTERY_HANDOFF_STATE] "+JSON.stringify(values));
        },"Read lottery presentation state",0);
        $.Msg("[LOTTERY_HANDOFF_READY] version=bb9968eef7 commands="+stamp);
    }
})();
