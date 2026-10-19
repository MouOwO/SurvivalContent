(function () {
    "use strict";
    // UI_REUSE_V1
    var prior=GameUI.CustomUIConfig().SurvivalRogueReward;if(prior&&prior.Dispose)prior.Dispose();var disposed=false;var U=GameUI.CustomUIConfig().SurvivalUI,life=U.Lifecycle();
    var playerId=Game.GetLocalPlayerID(),current={},signature="",cards=[],timers=[],generation=0,ready=false,pending=false,opened=false,dismissed=false;
    var config=GameUI.CustomUIConfig(),reduced=false;config.RogueReducedMotion=false;
    var cardWidth=240,cardHeight=480,cardTop=256,cardGap=24,cardPadding=32,hovered=null;
    function panel(id){return $("#"+id);}
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function rows(v){return !v?[]:Array.isArray(v)?v:Object.keys(v).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
    function label(parent,cls,text){var p=$.CreatePanel("Label",parent,"");p.AddClass(cls);p.text=String(text||"");p.hittest=false;return p;}
    var augment=GameUI.CustomUIConfig().RemainingHandoff.RogueSequence();
    var resume=$.CreatePanel("Button",panel("RogueRewardBackdrop").GetParent(),"RogueRewardResume");
    resume.hittest=true;resume.hittestchildren=false;
    resume.style.width="200px";resume.style.height="44px";resume.style.horizontalAlign="right";resume.style.verticalAlign="center";
    resume.style.marginRight="28px";resume.style.marginBottom="80px";resume.style.backgroundColor="#23414d";resume.style.border="1px solid #b59d69";
    var resumeText=label(resume,"","继续选牌");resumeText.style.horizontalAlign="center";resumeText.style.verticalAlign="center";resumeText.style.fontSize="20px";resumeText.style.color="#eee0b7";
    resume.SetPanelEvent("onactivate",open);
    function later(time,fn){augment.Later(time,fn);}
    function resetMotion(){hovered=null;cards.forEach(function(c){if(valid(c.tilt)){c.tilt.RemoveClass("RogueWobble");c.tilt.RemoveClass("RogueHovered");}if(valid(c.slot))c.slot.style.zIndex="0";});}
    function updateMotion(){var moving=!disposed&&opened&&ready&&!pending&&!reduced;if(!moving)hovered=null;cards.forEach(function(c){c.tilt.SetHasClass("RogueWobble",moving);c.tilt.SetHasClass("RogueHovered",moving&&hovered===c);c.slot.style.zIndex=moving&&hovered===c?"5":"0";});}
    function cancel(){generation++;augment.Cancel();resetMotion();}
    function active(){return Number(current.active)===1&&!!current.token;}
    function updateButtons(){cards.forEach(function(c){c.button.enabled=opened&&ready&&!pending&&(!current.pending_card_id||c.id===current.pending_card_id);});panel("RogueRewardReroll").enabled=opened&&active()&&ready&&!pending&&!current.pending_card_id&&Number(current.rerolls_remaining)>0;panel("RogueRewardRerollText").text=Number(current.rerolls_remaining)>0?"免费重抽  "+current.rerolls_remaining:"本次已重抽";if(ready&&!pending&&current.pending_card_id)panel("RogueRewardStatus").text="神许愿已有部分效果生效，请重试完成剩余效果";updateMotion();}
    function show(){var backdrop=panel("RogueRewardBackdrop");if(valid(backdrop)){backdrop.SetHasClass("RogueRewardHidden",!opened);backdrop.visible=opened;backdrop.hittest=opened;backdrop.hittestchildren=opened;}if(valid(resume))resume.visible=!disposed&&active()&&dismissed;}
    function close(){if(disposed)return;dismissed=active();opened=false;cancel();show();updateButtons();if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");}
    function open(){if(disposed||!active()||opened)return;dismissed=false;opened=true;show();if(config.SurvivalUILayers)config.SurvivalUILayers.Open("rogue_choice",panel("RogueRewardBackdrop"),close);if(!ready)finish();else updateButtons();watchFit();}
    function fit(){U.Fit(panel("RogueRewardSurface"),$.GetContextPanel(),1672,941,{reference:[1672,941]});}
    function watchFit(){if(disposed||!active()||!opened)return;fit();later(.25,watchFit);}
    // The reference rocks every card on a fixed cycle. Hover settles one face;
    // cursor coordinates never drive the other cards or a per-frame script loop.
    function hover(c){if(disposed||!opened||pending||!c.button.enabled||hovered===c)return;hovered=c;updateMotion();Game.EmitSound("ui_rollover_micro");}
    function leave(c){if(hovered!==c)return;hovered=null;updateMotion();}
    function finish(){cards.forEach(function(c){c.slot.AddClass("RogueInstant");c.slot.style.opacity="1";c.slot.style.transform="translate3d(0px,0px,0px) scale3d(1,1,1)";});ready=true;panel("RogueRewardStatus").text="";updateButtons();}
    function choose(id){if(!opened||!active()||!ready||pending||(current.pending_card_id&&id!==current.pending_card_id)||!cards.some(function(c){return c.id===id;}))return;pending=true;resetMotion();cards.forEach(function(c){c.slot.SetHasClass("RogueChosen",c.id===id);c.slot.SetHasClass("RogueNotChosen",c.id!==id);});updateButtons();panel("RogueRewardStatus").text="正在确认强化…";Game.EmitSound("ui_generic_button_click");GameEvents.SendCustomGameEventToServer("ui_rogue_reward_select",{token:current.token,card_id:id});}
    function createCard(data,index,total){var x=836-(total*cardWidth+(total-1)*cardGap)/2+index*(cardWidth+cardGap);
        // Native paint bounds still clip transformed children despite noclip.
        // Transparent margins contain the complete hovered face.
        var slot=$.CreatePanel("Panel",panel("RogueRewardCards"),"");slot.AddClass("RogueSlot");slot.hittest=false;slot.hittestchildren=true;slot.style.position=(x-cardPadding)+"px "+(cardTop-cardPadding)+"px 0px";
        var button=$.CreatePanel("Button",slot,"");button.AddClass("RoguePick");button.hittestchildren=true;button.enabled=false;
        // Keep the hit area on the face; transparent paint margins never steal
        // a neighbouring card's input when the choices sit close together.
        var tilt=$.CreatePanel("Panel",slot,"");tilt.AddClass("RogueTilt");tilt.hittest=false;tilt.hittestchildren=true;
        var front=$.CreatePanel("Panel",tilt,"");front.AddClass("RogueFront");front.visible=true;front.hittest=false;front.hittestchildren=true;GameUI.CustomUIConfig().SurvivalRogueArt.Apply(front,data);
        label(front.__rogueHeader||front,"RogueCardName",data.display_name||data.card_id);
        var copy=$.CreatePanel("Panel",front,"");copy.AddClass("RogueCopy");copy.hittest=false;copy.hittestchildren=true;var description=label(copy,"RogueCardDescription",String(data.description||"").replace(/[；;][ \t]*/g,"\n"));description.hittest=true;
        var c={id:data.card_id,slot:slot,button:button,tilt:tilt,front:front};
        button.SetPanelEvent("onactivate",function(){choose(data.card_id);});button.SetPanelEvent("onmouseover",function(){hover(c);});button.SetPanelEvent("onmouseout",function(){leave(c);});
        front.SetPanelEvent("onactivate",function(){choose(data.card_id);});front.SetPanelEvent("onmouseover",function(){hover(c);});front.SetPanelEvent("onmouseout",function(){leave(c);});
        // Every face leaves the same deck point, without a back or a flip phase.
        slot.style.transform="translate3d("+(836-x-cardWidth/2)+"px,"+(870-cardTop-cardHeight/2)+"px,0px) scale3d(0.12,0.12,1)";slot.style.opacity="0";
        if(!reduced&&opened)augment.Animate(c,index);
        return c;
    }
    function render(value){if(disposed)return;value=value||{};var previousToken=String(current.token||""),next=Number(value.active)===1?String(value.token)+":"+JSON.stringify(rows(value.cards)):"";current=value;
        if(active()&&String(current.token)!==previousToken)dismissed=false;
        if(next&&next===signature){updateButtons();return;}
        signature=next;cancel();ready=false;pending=false;cards=[];panel("RogueRewardCards").RemoveAndDeleteChildren();opened=active()&&!dismissed;show();
        if(!active()){if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");return;}
        // Dismiss only the presentation; the server offer stays pending until a choice is made.
        if(opened&&config.SurvivalUILayers)config.SurvivalUILayers.Open("rogue_choice",panel("RogueRewardBackdrop"),close);
        panel("RogueRewardStatus").text="正在发牌…";cards=rows(value.cards).map(function(c,i,all){return createCard(c,i,all.length);});updateButtons();
        if(opened){watchFit();if(reduced)finish();else later(1,finish);}
    }
    panel("RogueRewardReroll").SetPanelEvent("onactivate",function(){if(!opened||!active()||!ready||pending||current.pending_card_id||Number(current.rerolls_remaining)<=0)return;pending=true;updateButtons();panel("RogueRewardStatus").text="正在重抽…";GameEvents.SendCustomGameEventToServer("ui_rogue_reward_reroll",{token:current.token});});
    life.Subscribe("ui_rogue_reward_result",function(result){if(!active()||String(result.token)!==String(current.token)||!pending)return;if(result.ok===true||Number(result.ok)===1)return;pending=false;cards.forEach(function(c){c.slot.RemoveClass("RogueChosen");c.slot.RemoveClass("RogueNotChosen");});panel("RogueRewardStatus").text=current.pending_card_id?"神许愿已有部分效果生效，请重试完成剩余效果":"操作未完成，请重试（"+String(result.error||"unknown")+"）";updateButtons();});
    var tableSubscription=CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(_,key,value){if(String(key)===String(playerId))render(value);});
    config.SurvivalRogueReward={Open:open,Close:close,IsOpen:function(){return !disposed&&opened;},Dispose:function(){if(disposed)return;disposed=true;opened=false;cancel();life.Dispose();if(augment.Dispose)augment.Dispose();show();if(valid(resume))resume.DeleteAsync(0);if(CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(tableSubscription);if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");},SetReducedMotion:function(enabled){reduced=!!enabled;config.RogueReducedMotion=reduced;if(reduced)resetMotion();if(opened&&active()&&!ready&&reduced){cancel();finish();watchFit();}else updateMotion();}};
    U.FullscreenShell.Adopt({panel:panel("RogueRewardBackdrop")});panel("RogueRewardBackdrop").style.backgroundColor="#00000080";panel("RogueRewardBackdrop").style.backgroundImage="none";
    panel("RogueRewardReroll").visible=false;panel("RogueRewardReroll").hittest=false;
    render(CustomNetTables.GetTableValue("survival_rogue_reward",String(playerId))||{});
})();
