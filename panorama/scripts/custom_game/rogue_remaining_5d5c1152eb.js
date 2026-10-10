(function () {
    "use strict";
    // UI_REUSE_V1
    var prior=GameUI.CustomUIConfig().SurvivalRogueReward;if(prior&&prior.Dispose)prior.Dispose();var disposed=false;var U=GameUI.CustomUIConfig().SurvivalUI,life=U.Lifecycle();
    var playerId=Game.GetLocalPlayerID(),current={},signature="",cards=[],timers=[],generation=0,ready=false,pending=false,opened=false,dismissed=false;
    var config=GameUI.CustomUIConfig(),reduced=false;config.RogueReducedMotion=false;
    // Presentation mapping only. Candidate generation and effects remain server-owned.
    var artGroups={defense:["frozen_wall","ion_shield","feast","corrosive_shield","wall_recovery","fortified_defense","emergency_reinforcement","endless_rebirth"],growth:["divine_wish","tower_growth","boss_promise","far_sighted","command_change","infrastructure_maniac","radiant_sapling","fiscal_subsidy","goblin_duplicator","lucky_watch","bounty_order","construction_order","internship_certificate","infrastructure_outsourcing","wealthy_start","infrastructure_maniac_start","precision_lumber","peaceful_labor","woodcutting_bounty","instant_wood","gold_mining_secret","population_expansion","natures_gift"]};
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
    function cancel(){generation++;augment.Cancel();}
    function active(){return Number(current.active)===1&&!!current.token;}
    function updateButtons(){cards.forEach(function(c){c.button.enabled=opened&&ready&&!pending;});panel("RogueRewardReroll").enabled=opened&&active()&&ready&&!pending&&Number(current.rerolls_remaining)>0;panel("RogueRewardRerollText").text=Number(current.rerolls_remaining)>0?"免费重抽  "+current.rerolls_remaining:"本次已重抽";}
    function show(){var backdrop=panel("RogueRewardBackdrop");if(valid(backdrop)){backdrop.SetHasClass("RogueRewardHidden",!opened);backdrop.visible=opened;backdrop.hittest=opened;backdrop.hittestchildren=opened;}if(valid(resume))resume.visible=!disposed&&active()&&dismissed;}
    function close(){if(disposed)return;dismissed=active();opened=false;cancel();show();updateButtons();if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");}
    function open(){if(disposed||!active()||opened)return;dismissed=false;opened=true;show();if(config.SurvivalUILayers)config.SurvivalUILayers.Open("rogue_choice",panel("RogueRewardBackdrop"),close);if(!ready)finish();else updateButtons();watchFit();}
    function fit(){U.Fit(panel("RogueRewardSurface"),$.GetContextPanel(),1672,941,{reference:[1672,941]});}
    function watchFit(){if(disposed||!active()||!opened)return;fit();later(.25,watchFit);}
    function showFront(c){c.front.visible=true;c.back.visible=false;}
    function finish(){cards.forEach(function(c){c.slot.AddClass("RogueInstant");c.slot.style.opacity="1";c.slot.style.transform="translate3d(0px,0px,0px) scale3d(1,1,1)";c.flip.AddClass("RogueInstant");showFront(c);c.flip.style.transform="rotateY(0deg)";});ready=true;updateButtons();panel("RogueRewardStatus").text="请选择一项强化";}
    function choose(id){if(!opened||!active()||!ready||pending||!cards.some(function(c){return c.id===id;}))return;pending=true;cards.forEach(function(c){c.slot.SetHasClass("RogueChosen",c.id===id);c.slot.SetHasClass("RogueNotChosen",c.id!==id);});updateButtons();panel("RogueRewardStatus").text="正在确认强化…";Game.EmitSound("ui_generic_button_click");GameEvents.SendCustomGameEventToServer("ui_rogue_reward_select",{token:current.token,card_id:id});}
    function createCard(data,index,total){var x=836-total*290/2-(total-1)*68/2+index*358;
        var slot=$.CreatePanel("Panel",panel("RogueRewardCards"),"");slot.AddClass("RogueSlot");slot.style.position=x+"px 181px 0px";
        var button=$.CreatePanel("Button",slot,"");button.AddClass("RoguePick");button.hittestchildren=true;button.enabled=false;
        var flip=$.CreatePanel("Panel",button,"");flip.AddClass("RogueFlip");
        var front=$.CreatePanel("Panel",flip,"");front.AddClass("RogueFront");var group="combat";Object.keys(artGroups).forEach(function(k){if(artGroups[k].indexOf(data.card_id)>=0)group=k;});front.AddClass("RogueArt_"+group);GameUI.CustomUIConfig().SurvivalRogueArt.Apply(front,data);
        var copy=$.CreatePanel("Panel",front,"");copy.AddClass("RogueCopy");label(copy,"RogueCardName",data.display_name||data.card_id);var description=label(copy,"RogueCardDescription",data.description||"");description.hittest=true;
        var back=$.CreatePanel("Panel",flip,"");back.AddClass("RogueBack");front.visible=false;
        button.SetPanelEvent("onactivate",function(){choose(data.card_id);});button.SetPanelEvent("onmouseover",function(){if(ready&&!pending)Game.EmitSound("ui_rollover_micro");});
        var c={id:data.card_id,slot:slot,button:button,flip:flip,front:front,back:back};
        // All slot centers start at the same design-space point (836, 850).
        slot.style.transform="translate3d("+(836-x-145)+"px,333px,0px) scale3d(0.08,0.08,1)";slot.style.opacity="0";
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
        panel("RogueRewardStatus").text="命运正在展开…";cards=rows(value.cards).map(function(c,i,all){return createCard(c,i,all.length);});updateButtons();
        if(opened){watchFit();if(reduced)finish();else later(1.60+Math.max(0,cards.length-1)*.11,finish);}
    }
    panel("RogueRewardReroll").SetPanelEvent("onactivate",function(){if(!opened||!active()||!ready||pending||Number(current.rerolls_remaining)<=0)return;pending=true;updateButtons();panel("RogueRewardStatus").text="正在重抽…";GameEvents.SendCustomGameEventToServer("ui_rogue_reward_reroll",{token:current.token});});
    life.Subscribe("ui_rogue_reward_result",function(result){if(!active()||String(result.token)!==String(current.token)||!pending)return;if(result.ok===true||Number(result.ok)===1)return;pending=false;cards.forEach(function(c){c.slot.RemoveClass("RogueChosen");c.slot.RemoveClass("RogueNotChosen");});panel("RogueRewardStatus").text="操作未完成，请重试（"+String(result.error||"unknown")+"）";updateButtons();});
    var tableSubscription=CustomNetTables.SubscribeNetTableListener("survival_rogue_reward",function(_,key,value){if(String(key)===String(playerId))render(value);});
    config.SurvivalRogueReward={Open:open,Close:close,IsOpen:function(){return !disposed&&opened;},Dispose:function(){disposed=true;opened=false;cancel();life.Dispose();if(augment.Dispose)augment.Dispose();show();if(valid(resume))resume.DeleteAsync(0);if(CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(tableSubscription);if(config.SurvivalUILayers)config.SurvivalUILayers.Close("rogue_choice");},SetReducedMotion:function(enabled){reduced=!!enabled;config.RogueReducedMotion=reduced;if(opened&&active()&&!ready&&reduced){cancel();finish();watchFit();}}};
    U.FullscreenShell.Adopt({panel:panel("RogueRewardBackdrop")});panel("RogueRewardBackdrop").style.backgroundColor="transparent";panel("RogueRewardBackdrop").style.backgroundImage="none";
    panel("RogueRewardReroll").visible=false;panel("RogueRewardReroll").hittest=false;
    render(CustomNetTables.GetTableValue("survival_rogue_reward",String(playerId))||{});
})();
