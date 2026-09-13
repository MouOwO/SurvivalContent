(function () {
    "use strict";
    // UI_REUSE_V1
    var U=GameUI.CustomUIConfig().SurvivalUI;
    var playerId=Game.GetLocalPlayerID(),current={},signature="",cards=[],timers=[],generation=0,ready=false,pending=false;
    var config=GameUI.CustomUIConfig(),reduced=!!config.RogueReducedMotion;
    // Presentation mapping only. Candidate generation and effects remain server-owned.
    var artGroups={defense:["frozen_wall","ion_shield","feast","corrosive_shield","wall_recovery","fortified_defense","emergency_reinforcement","endless_rebirth"],growth:["divine_wish","tower_growth","boss_promise","far_sighted","command_change","infrastructure_maniac","radiant_sapling","fiscal_subsidy","goblin_duplicator","lucky_watch","bounty_order","construction_order","internship_certificate","infrastructure_outsourcing","wealthy_start","infrastructure_maniac_start","precision_lumber","peaceful_labor","woodcutting_bounty","instant_wood","gold_mining_secret","population_expansion","natures_gift"]};
    function panel(id){return $("#"+id);}
    function rows(v){return !v?[]:Array.isArray(v)?v:Object.keys(v).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
    function label(parent,cls,text){var p=$.CreatePanel("Label",parent,"");p.AddClass(cls);p.text=String(text||"");p.hittest=false;return p;}
    var augment=U.AugmentChoiceGroup();
    function later(time,fn){augment.Later(time,fn);}
    function cancel(){generation++;augment.Cancel();}
    function active(){return Number(current.active)===1&&!!current.token;}
    function updateButtons(){cards.forEach(function(c){c.button.enabled=ready&&!pending;});panel("RogueRewardReroll").enabled=active()&&ready&&!pending&&Number(current.rerolls_remaining)>0;panel("RogueRewardRerollText").text=Number(current.rerolls_remaining)>0?"免费重抽  "+current.rerolls_remaining:"本次已重抽";}
    function fit(){U.Fit(panel("RogueRewardSurface"),$.GetContextPanel(),1672,941,{reference:[1672,941]});}
    function watchFit(){if(!active())return;fit();later(.25,watchFit);}
    function showFront(c){c.front.visible=true;c.back.visible=false;}
    function finish(){cards.forEach(function(c){c.slot.AddClass("RogueInstant");c.slot.style.opacity="1";c.slot.style.transform="translate3d(0px,0px,0px) scale3d(1,1,1)";c.flip.AddClass("RogueInstant");showFront(c);c.flip.style.transform="rotateY(0deg)";});ready=true;updateButtons();panel("RogueRewardStatus").text="请选择一项强化";}
    function choose(id){if(!active()||!ready||pending||!cards.some(function(c){return c.id===id;}))return;pending=true;cards.forEach(function(c){c.slot.SetHasClass("RogueChosen",c.id===id);c.slot.SetHasClass("RogueNotChosen",c.id!==id);});updateButtons();panel("RogueRewardStatus").text="正在确认强化…";Game.EmitSound("ui_generic_button_click");GameEvents.SendCustomGameEventToServer("ui_rogue_reward_select",{token:current.token,card_id:id});}
    function createCard(data,index,total){var x=836-total*272/2-(total-1)*62/2+index*334;
        var slot=$.CreatePanel("Panel",panel("RogueRewardCards"),"");slot.AddClass("RogueSlot");slot.style.position=x+"px 170px 0px";
        var button=$.CreatePanel("Button",slot,"");button.AddClass("RoguePick");button.hittestchildren=true;button.enabled=false;
        var flip=$.CreatePanel("Panel",button,"");flip.AddClass("RogueFlip");
        var front=$.CreatePanel("Panel",flip,"");front.AddClass("RogueFront");var group="combat";Object.keys(artGroups).forEach(function(k){if(artGroups[k].indexOf(data.card_id)>=0)group=k;});front.AddClass("RogueArt_"+group);
        var copy=$.CreatePanel("Panel",front,"");copy.AddClass("RogueCopy");label(copy,"RogueCardName",data.display_name||data.card_id);var description=label(copy,"RogueCardDescription",data.description||"");description.hittest=true;
        var back=$.CreatePanel("Panel",flip,"");back.AddClass("RogueBack");front.visible=false;
        button.SetPanelEvent("onactivate",function(){choose(data.card_id);});button.SetPanelEvent("onmouseover",function(){if(ready&&!pending)Game.EmitSound("ui_rollover_micro");});
        var c={id:data.card_id,slot:slot,button:button,flip:flip,front:front,back:back};
        // All slot centers start at the same design-space point (836, 850).
        slot.style.transform="translate3d("+(836-x-136)+"px,364.727px,0px) scale3d(0.08,0.08,1)";slot.style.opacity="0";
        if(!reduced)augment.Animate(c,index);
        return c;
    }
    function render(value){value=value||{};var next=Number(value.active)===1?String(value.token)+":"+JSON.stringify(rows(value.cards)):"";current=value;
        if(next&&next===signature){updateButtons();return;}
        signature=next;cancel();ready=false;pending=false;cards=[];panel("RogueRewardCards").RemoveAndDeleteChildren();panel("RogueRewardBackdrop").SetHasClass("RogueRewardHidden",!active());
        if(!active()){if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");return;}
        // Choice is mandatory in the existing flow: Escape must not discard the offer.
        if(config.SurvivalUILayers)config.SurvivalUILayers.Open("rogue_choice",panel("RogueRewardBackdrop"),function(){});
        panel("RogueRewardStatus").text="命运正在展开…";cards=rows(value.cards).map(function(c,i,all){return createCard(c,i,all.length);});watchFit();updateButtons();
        if(reduced)finish();else later(1.30+Math.max(0,cards.length-1)*.11,finish);
    }
    panel("RogueRewardReroll").SetPanelEvent("onactivate",function(){if(!active()||!ready||pending||Number(current.rerolls_remaining)<=0)return;pending=true;updateButtons();panel("RogueRewardStatus").text="正在重抽…";GameEvents.SendCustomGameEventToServer("ui_rogue_reward_reroll",{token:current.token});});
    panel("RogueReducedMotion").checked=reduced;panel("RogueReducedMotion").SetPanelEvent("onactivate",function(){reduced=!!panel("RogueReducedMotion").checked;config.RogueReducedMotion=reduced;if(reduced&&active()&&!ready){cancel();finish();watchFit();}});
    GameEvents.Subscribe("ui_rogue_reward_result",function(result){if(!active()||String(result.token)!==String(current.token)||!pending)return;if(result.ok===true||Number(result.ok)===1)return;pending=false;cards.forEach(function(c){c.slot.RemoveClass("RogueChosen");c.slot.RemoveClass("RogueNotChosen");});panel("RogueRewardStatus").text="操作未完成，请重试（"+String(result.error||"unknown")+"）";updateButtons();});
    CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(_,key,value){if(String(key)===String(playerId))render(value);});
    config.SurvivalRogueReward={SetReducedMotion:function(enabled){panel("RogueReducedMotion").checked=!!enabled;reduced=!!enabled;config.RogueReducedMotion=reduced;if(active()&&!ready&&reduced){cancel();finish();watchFit();}}};
    U.FullscreenShell.Adopt({panel:panel("RogueRewardBackdrop"),liveGame:true});
    U.ActionButton.Adopt(panel("RogueRewardReroll")); U.Checkbox.Adopt(panel("RogueReducedMotion"));
    render(CustomNetTables.GetTableValue("survival_rogue_reward",String(playerId))||{});
})();
