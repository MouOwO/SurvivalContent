(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), ctx = $.GetContextPanel(), root = ctx;
    while (root.GetParent && root.GetParent()) root = root.GetParent();
    var host = ctx.FindChildTraverse("HandoffHUD"), assets = cfg.HandoffAssets;
    if(cfg.HandoffDecoration && cfg.HandoffDecoration.IsValid())cfg.HandoffDecoration.DeleteAsync(0);
    var generation = (cfg.HandoffGeneration || 0) + 1;
    cfg.HandoffGeneration = generation;
    $.Msg("[HANDOFF_BUILD] aligned_release_v18 generation=",generation);
    var nodes = {}, natives = {}, slices = {}, slotFrames = [], topButtons = {};
    var ready = false, sequence = -1, geometry = null, lastSignature = "", missing = [], noticeSerial = 0;
    var presented=false, stableFrames=0, bootSignature="";
    var keyBindings={}, skillPanels=[], currentEntries=[], eventSerial=0;
    var scopes = {center_with_stats:"lower_hud",center_block:"center_with_stats",PortraitGroup:"center_block",
        PortraitContainer:"PortraitGroup",portraitHUD:"PortraitGroup",portraitHUDOverlay:"PortraitGroup",
        AbilitiesAndStatBranch:"center_block",abilities:"AbilitiesAndStatBranch",inventory:"center_block",
        minimap_block:"minimap_container",minimap:"minimap_block"};
    var stats = [["attack","CombatAttackValue"],["armor","CombatArmorValue"],["attack_speed","CombatAttackSpeedValue"],
        ["strength","CombatStrengthValue"],["agility","CombatAgilityValue"],["intelligence","CombatIntellectValue"]];
    function valid(p) {return p && (!p.IsValid || p.IsValid());}
    function native(id) {
        if (!valid(natives[id])) {var parent=scopes[id]?native(scopes[id]):root; natives[id]=valid(parent)?parent.FindChildTraverse(id):null;}
        return natives[id];
    }
    function style(p, values) {if(valid(p)) Object.keys(values).forEach(function(k){if(String(p.style[k])!==String(values[k]))p.style[k]=values[k];});}
    function place(p,x,y,w,h) {style(p,{transitionDuration:"0s",horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",position:x+"px "+y+"px 0px",width:w+"px",height:h+"px",minWidth:w+"px",minHeight:h+"px",maxWidth:"10000px",maxHeight:"10000px"});}
    function create(type,parent,id,hit) {var p=$.CreatePanel(type,parent,id);p.hittest=!!hit;p.hittestchildren=!!hit; if(id)nodes[id]=p;return p;}
    // Shared uniform slot outline: transparent center, no sampled lighting patches.
    function uniformSlotFrame(parent,id) {
        var frame=create("Panel",parent,id,false);
        style(frame,{backgroundColor:"transparent",overflow:"noclip"});
        var outer=create("Panel",frame,"",false),gold=create("Panel",frame,"",false),inner=create("Panel",frame,"",false);
        place(outer,1,1,114,114);style(outer,{border:"1px solid #47676b",borderRadius:"6px"});
        place(gold,3,3,110,110);style(gold,{border:"2px solid #c7b58b",borderRadius:"5px"});
        place(inner,5,5,106,106);style(inner,{border:"1px solid #334e55",borderRadius:"4px"});
        return frame;
    }
    // End shared uniform slot outline.
    function art(parent,id,key) {/* survival unified icon art */var unified={"top_wave":"skill_morale","stat_attack":"broadsword","stat_armor":"platemail","stat_attack_speed":"gloves","stat_strength":"reaver","stat_agility":"swift_blink","stat_intelligence":"arcane_blink"};if(unified[key]){var refined=create("Image",parent,id,false);refined.SetImage("file://{images}/spellicons/survival/native/"+unified[key]+".png");return refined;}if(key==="top_shop_64"){var icon=create("Panel",parent,id,false),handle=create("Panel",icon,"",false),bag=create("Panel",icon,"",false);place(handle,26,18,12,15);style(handle,{border:"2px solid #e3ded0",borderRadius:"6px 6px 0px 0px"});place(bag,21,29,22,20);style(bag,{border:"2px solid #e3ded0",borderRadius:"2px"});return icon;}if(key==="slot_frame")return uniformSlotFrame(parent,id);if(key==="top_population"){var food=create("Image",parent,id,false);food.SetImage("file://{images}/custom_game/survival/food_population.png");return food;}if(key==="top_gold"||key==="top_wood"){
 var resource=create("Panel",parent,id,false);
 function part(x,y,w,h,values){var q=create("Panel",resource,"",false);place(q,x,y,w,h);style(q,values);return q;}
 if(key==="top_gold"){
 // Three warm gold coins, with a bright face and a darker milled edge.
 [[3,8],[17,5],[10,18]].forEach(function(coin){
     part(coin[0],coin[1]+3,14,9,{border:"1px solid #9d570b",borderRadius:"50%",backgroundColor:"gradient(linear, 0% 0%, 0% 100%, from(#ffc72d), to(#b86c0c))"});
     part(coin[0],coin[1],14,8,{border:"1px solid #ffeaa0",borderRadius:"50%",backgroundColor:"gradient(linear, 0% 0%, 0% 100%, from(#fff6ad), color-stop(0.45, #ffdb32), to(#efa70d))"});
     part(coin[0]+4,coin[1]+2,6,2,{borderRadius:"50%",backgroundColor:"#fff5b8"});
 });
 }else{
 // A cut timber log: warm bark, a pale cut end and visible grain.
 var log=part(3,10,28,14,{transform:"rotateZ(32deg)",overflow:"noclip"});
 function grain(x,y,w,h,values){var p=create("Panel",log,"",false);place(p,x,y,w,h);style(p,values);}
 grain(0,0,24,14,{border:"1px solid #603518",borderRadius:"3px",backgroundColor:"gradient(linear, 0% 0%, 0% 100%, from(#e2b676), color-stop(0.3, #ba7c39), color-stop(0.65, #875025), to(#4f2b16))"});
 grain(3,3,17,2,{backgroundColor:"#ebbe79"});
 grain(2,9,18,2,{backgroundColor:"#673616"});
 grain(19,0,10,14,{border:"1px solid #f5d49b",borderRadius:"50%",backgroundColor:"gradient(linear, 0% 0%, 100% 100%, from(#ffe2a3), to(#c48943))"});
 grain(22,3,5,8,{border:"1px solid #9c672f",borderRadius:"50%"});
 grain(24,5,1,4,{backgroundColor:"#9c672f"});
 }
 return resource;}var p=create("Image",parent,id,false);p.SetImage(key==="top_shop_64"?"s2r://panorama/images/custom_game/shop_preview_v1/shop_png.vtex":"file://{images}/"+assets[key].file);return p;}
    function label(parent,id,cls) {var p=create("Label",parent,id,false);p.text="";if(cls)p.AddClass(cls);style(p,{fontFamily:'"Source Han Sans SC"',color:"#f3ebd4",fontSize:"23px",whiteSpace:"nowrap",textOverflow:"shrink",zIndex:"5"});return p;}
    function centered(parent,id,x,y,w,h,fontSize) {
        var bounds=nodes[id+"Bounds"];
        if(!bounds){bounds=create("Panel",parent,id+"Bounds",false);label(bounds,id,"HandoffNumber");}
        place(bounds,x,y,w,h);style(bounds,{zIndex:"5"});
        style(nodes[id],{position:"0px 0px 0px",width:"fit-children",height:"fit-children",maxWidth:"100%",horizontalAlign:"center",verticalAlign:"center",textAlign:"center",fontSize:fontSize+"px"});
        return nodes[id];
    }
    function text(id,value) {var p=nodes[id];if(p&&p.text!==String(value))p.text=String(value);}
    function tooltip(p,value) {p.SetPanelEvent("onmouseover",function(){var content=typeof value==="function"?value():value;cfg.HandoffLastTooltip={id:p.id,text:content};$.DispatchEvent("DOTAShowTextTooltip",p,content);});p.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip");});}
    function notice(value) {var serial=++noticeSerial;text("HandoffNotice",value);nodes.HandoffNotice.visible=true;$.Schedule(4,function(){if(valid(host)&&serial===noticeSerial)nodes.HandoffNotice.visible=false;});}
    function blocked() {return cfg.SurvivalUILayers && cfg.SurvivalUILayers.Top();}
    function forward(id) {var p=native(id);if(!valid(p))return false;$.DispatchEvent("Activated",p,"mouse");return true;}
    var actions={vip:["SurvivalVIP","Toggle"],survival_shop:["SurvivalShop","ToggleShop"],shop:["SurvivalPayments","Open"],treasure:["SurvivalTreasure","Toggle"],archive:["SurvivalArchive","Toggle"],equipment:["SurvivalEquipment","Toggle"],
        lottery:["SurvivalLottery","Open"],benefit:["SurvivalDaily","Open"],appearance:["SurvivalAppearance","Toggle"]};
    function available(id) {if(id==="vip")return !!(cfg.SurvivalVIP&&cfg.SurvivalVIP.IsAvailable());if(id==="survival_shop"&&!(cfg.SurvivalShopUnlocks&&cfg.SurvivalShopUnlocks.shop))return false;if(id==="return")return valid(native("DashboardButton"));if(id==="settings")return valid(native("SettingsRebornButton"))||valid(native("SettingsButton"));if(id==="social")return true;var a=actions[id];return !!(a&&cfg[a[0]]&&typeof cfg[a[0]][a[1]]==="function");}
    function activate(id) {
        if(blocked())return;
        // Native dota_hud_menu_buttons uses this engine event. Its hidden MenuButtons
        // ancestor prevents synthetic Activated from reaching the original button.
        // Open the official dashboard; never disconnect/quit or replace its exit flow.
        if(id==="return"){$.DispatchEvent("DOTAHUDShowDashboard");return;}
        if(id==="settings"){$.DispatchEvent("DOTAShowSettingsPopup");return;}
        if(id==="social"){nodes.HandoffSocial.visible=!nodes.HandoffSocial.visible;return;}
        var a=actions[id];if(available(id)){nodes.HandoffSocial.visible=false;cfg[a[0]][a[1]]();}else notice("该入口尚未接入");
    }
    // Screen-width decoration, separate from the corner-anchored navigation canvas.
    var topBackdrop=create("Panel",host,"HandoffTopBackdrop",false);
    style(topBackdrop,{backgroundImage:'url("file://{images}/'+assets.top_top_soft_black_backdrop.file+'")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",maxWidth:"10000px",maxHeight:"10000px",minWidth:"0px",overflow:"noclip"});
    var top=create("Panel",host,"HandoffTop",true);top.hittest=false;top.AddClass("HandoffCanvas");
    // Status keeps its original centered reference independently of the corner navigation.
    var topStatus=create("Panel",host,"HandoffTopStatus",false);topStatus.AddClass("HandoffCanvas");
    var nav=[["return","返回"],["treasure","宝物"],["archive","存档"],["lottery","抽奖"],["benefit","福利"],["shop","商城"],["survival_shop","生存商店"],["vip",""]];
    // Shared bounds keep initial creation and resolution refresh equally compact.
    function navBounds(key,index) {
        return {x:key==="vip"?460:14+index*58,
            width:key==="survival_shop"?96:key==="vip"?60:56};
    }
    // Navigation icons and captions sit directly over the game, without a solid plate.
    nav.forEach(function(a,i){
        var bounds=navBounds(a[0],i),buttonWidth=bounds.width;
        var b=create("Button",top,"HandoffNav_"+a[0],true);b.AddClass("HandoffNav");b.AddClass("HandoffNavUnified");place(b,bounds.x,6,buttonWidth,86);
        // Halo first so it paints under the icon; z-index:-1 keeps it inside the button.
        var halo=create("Panel",b,"HandoffNavGlow_"+a[0],false);halo.AddClass("HandoffNavGlow");place(halo,(buttonWidth-62)/2,0,62,62);
        var icon=create("Image",b,"HandoffNavIcon_"+a[0],false);icon.SetImage("file://{images}/custom_game/topnav_reference_v2/"+a[0]+((a[0]==="treasure"||a[0]==="benefit")?"_clean":"")+".svg");place(icon,(buttonWidth-44)/2,4,44,44);if(a[0]==="vip")place(icon,(buttonWidth-56)/2,-2,56,56);
        var captionHost=create("Panel",b,"HandoffNavCaptionHost_"+a[0],false);place(captionHost,0,52,buttonWidth,32);
        var caption=create("Label",captionHost,"HandoffNavCaption_"+a[0],false);caption.text=a[1];style(caption,{width:"100%",height:"fit-children",minHeight:"0px",verticalAlign:"center",margin:"0px",padding:"0px"});
        style(caption,{fontFamily:'"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',fontSize:"22px",fontWeight:"bold",textAlign:"center",whiteSpace:"nowrap",textOverflow:"clip"});
        caption.AddClass("HandoffNavCaption");
        // Selected-state underline, hidden unless the entry owns the open window.
        var underline=create("Panel",b,"HandoffNavUnderline_"+a[0],false);underline.AddClass("HandoffNavUnderline");place(underline,(buttonWidth-34)/2,84,34,2);
        b.__glow=halo;b.__underline=underline;
        b.SetPanelEvent("onactivate",function(){activate(a[0]);});
        if(a[0]==="vip"){
            b.enabled=false;b.hittest=false;
            icon.SetImage("file://{images}/custom_game/topnav_reference_v2/vip_locked.svg");
        }
        topButtons[a[0]]=b;
    });
    // One open window at a time, so the highlight is a single owner, not a list.
    var navWindowIds={vip:"vip",treasure:"treasure",archive:"archive",lottery:"lottery",benefit:"benefit",
        shop:"shop",survival_shop:"survival_shop"};
    function markActiveNav(id) {
        Object.keys(topButtons).forEach(function(key){topButtons[key].SetHasClass("HandoffNavActive",key===id);});
    }
    function syncActiveNav() {
        var top=cfg.SurvivalUILayers&&cfg.SurvivalUILayers.Top?cfg.SurvivalUILayers.Top():null;
        var matched=null;
        if(top)Object.keys(navWindowIds).forEach(function(key){if(navWindowIds[key]===top)matched=key;});
        // Windows opened outside SurvivalUILayers fall back to their own visibility.
        if(!matched){
            var probes=[["survival_shop","CustomShopWindow"],["treasure","TreasureWindow"],["archive","ArchiveWindow"],["lottery","LotteryWindow"],["benefit","DailyWindow"]];
            probes.forEach(function(p){if(matched)return;var w=root.FindChildTraverse(p[1]);if(valid(w)&&w.visible)matched=p[0];});
        }
        markActiveNav(matched);
    }
    function topMetric(id,key,x,textX,textWidth){
        var row=create("Panel",topStatus,id+"Row",false);place(row,x,14,textX-x+textWidth,44);
        var icon=art(row,id+"Icon",key);place(icon,0,0,32,32);style(icon,{verticalAlign:"center"});
        var value=label(row,id);place(value,textX-x,0,textWidth,44);
        // Clear place()'s fixed minimum: otherwise the glyph is top-aligned
        // inside a 44px Label while its icon is centered in the row.
        style(value,{height:"fit-children",minHeight:"0px",verticalAlign:"center",transform:"none"});
    }
    topButtons.survival_shop.enabled=available("survival_shop");
    style(topButtons.survival_shop,{saturation:available("survival_shop")?"1":"0",opacity:available("survival_shop")?"1":"0.4"});
    var difficultyRow=create("Panel",topStatus,"HandoffDifficultyRow",false);place(difficultyRow,722,14,50,44);
    var difficultyLabel=label(difficultyRow,"HandoffDifficulty");place(difficultyLabel,0,0,50,44);
    style(difficultyLabel,{height:"fit-children",minHeight:"0px",verticalAlign:"center",textAlign:"center",color:"#f0d48a",textShadow:"none"});
    topMetric("HandoffWave","top_wave",780,822,346);
    [["gold",1194,1234],["wood",1339,1379],["population",1484,1524]].forEach(function(a){topMetric("HandoffResource_"+a[0],"top_"+a[0],a[1],a[2],105);});
    var fxButton=create("Button",top,"HandoffCombatEffects",true);
    place(fxButton,522,6,96,86);
    fxButton.AddClass("HandoffNavUnified");
    var fxHalo=create("Panel",fxButton,"HandoffEffectsGlow",false);fxHalo.AddClass("HandoffNavGlow");place(fxHalo,17,0,62,62);
    var fxIcon=create("Image",fxButton,"HandoffEffectsIcon",false);fxIcon.SetImage("file://{images}/custom_game/topnav_reference_v2/effects.svg");place(fxIcon,26,4,44,44);
    style(fxButton,{borderRadius:"0px"});
    var fxCaptionHost=create("Panel",fxButton,"HandoffEffectsCaptionHost",false);place(fxCaptionHost,0,52,96,32);
    var fxText=create("Label",fxCaptionHost,"HandoffCombatEffectsText",false);fxText.text="";
    style(fxText,{width:"100%",height:"fit-children",minHeight:"0px",verticalAlign:"center",margin:"0px",padding:"0px",fontFamily:'"Source Han Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif',fontSize:"22px",fontWeight:"bold",textAlign:"center"});
    fxText.AddClass("HandoffNavCaption");
    var fxReduced=cfg.SurvivalReducedCombatEffects===true;
    function showEffectsSetting(){fxText.text=fxReduced?"简化特效":"完整特效";fxButton.SetHasClass("HandoffEffectsReduced",fxReduced);}
    function sendEffectsSetting(){GameEvents.SendCustomGameEventToServer("ui_combat_effects_setting",{reduced:fxReduced?1:0});}
    tooltip(fxButton,"简化所有英雄、箭塔的技能光效与命中特效，仅影响自己的画面。<br>保留弹道、攻击范围与升级金光，不改变伤害和技能判定。");
    fxButton.SetPanelEvent("onactivate",function(){if(blocked())return;fxReduced=!fxReduced;cfg.SurvivalReducedCombatEffects=fxReduced;showEffectsSetting();sendEffectsSetting();});
    GameEvents.Subscribe("ui_combat_effects_state",function(payload){if(cfg.HandoffGeneration!==generation)return;fxReduced=Number(payload.reduced)===1;cfg.SurvivalReducedCombatEffects=fxReduced;showEffectsSetting();});
    showEffectsSetting();$.Schedule(1,sendEffectsSetting);
    var social=create("Panel",top,"HandoffSocial",true);social.AddClass("HandoffSocial");place(social,474,94,192,130);social.visible=false;
    [["SharedUnitsButton","共享单位"],["SharedContentButton","共享内容"],["CombatLogButton","战斗日志"]].forEach(function(a){var b=create("Button",social,"",true);label(b,"","").text=a[1];b.SetPanelEvent("onactivate",function(){if(!blocked()){if(!forward(a[0]))notice(a[1]+"当前不可用");social.visible=false;}});});
    place(label(top,"HandoffNotice"),18,112,480,55);nodes.HandoffNotice.visible=false;
    var enemyCounter=create("Panel",host,"HandoffEnemyCounter",false);enemyCounter.AddClass("HandoffEnemyCounter");enemyCounter.visible=false;
    var enemyTitle=label(enemyCounter,"HandoffEnemyTitle");enemyTitle.text="进攻怪物";
    var enemyValue=label(enemyCounter,"HandoffEnemyValue");
    var enemyCountdown=label(enemyCounter,"HandoffEnemyCountdown");enemyCountdown.visible=false;
    [enemyTitle,enemyValue,enemyCountdown].forEach(function(p){style(p,{fontSize:"16px",height:"fit-children",verticalAlign:"center"});});
    style(enemyValue,{width:"fill-parent-flow(1)",textAlign:"center",color:"#f8dc94"});
    style(enemyCountdown,{width:"24px",textAlign:"right",fontSize:"20px",fontWeight:"bold",color:"#ff7769"});
    var bottom=create("Panel",host,"HandoffBottom",false);bottom.AddClass("HandoffCanvas");bottom.visible=false;
    var background=create("Panel",bottom,"HandoffBackground",false);
    cfg.HandoffDecoration=background;
    place(art(background,"HandoffHeroBase","hero_base"),0,0,453,330);
    var center=create("Panel",bottom,"HandoffCenter",false);
    center.hittestchildren=true;
    var towerAuto=create("Button",center,"HandoffTowerAuto",true);
    var towerAutoText=label(towerAuto,"HandoffTowerAutoText");towerAutoText.text="自动";
    style(towerAuto,{visibility:"collapse",backgroundColor:"#243a40",border:"1px solid #77806e",borderRadius:"3px",zIndex:"20"});
    style(towerAutoText,{horizontalAlign:"center",verticalAlign:"center",fontSize:"28px",color:"#c4d0d3",textShadow:"none"});
    towerAuto.SetPanelEvent("onactivate",function(){
        var ability=Number(towerAuto.__ability),input=cfg.SurvivalAbilityInput;
        if(towerAuto.enabled&&input&&input.ToggleTowerAutoUpgrade)input.ToggleTowerAutoUpgrade(ability);
    });
    function updateTowerAuto(shown) {
        var entry=currentEntries.filter(function(e){return /^ability_upgrade_tower(?:_lv01)?$/.test(e.name);})[0];
        var value=entry ? CustomNetTables.GetTableValue("survival_ability_runtime",String(entry.ability))||{} : {};
        var visible=!!(shown.tower && value.auto_upgrade_visible===1 && value.removed!==1);
        style(towerAuto,{visibility:visible?"visible":"collapse"});
        towerAuto.__ability=visible?entry.ability:-1;
        if(!visible)return;
        var enabled=value.auto_upgrade_enabled===1,available=value.auto_upgrade_available===1;
        towerAuto.enabled=available||enabled;
        place(towerAuto,20,162,116,48);
        style(towerAuto,{backgroundColor:enabled?"#285d4b":"#243a40",borderColor:enabled?"#b6a375":"#60716e",opacity:available||enabled?"1":"0.65"});
        style(towerAutoText,{color:enabled?"#eee0b8":"#c4d0d3"});
    }
    var inventory=art(background,"HandoffInventoryBase","inventory_base");
    place(art(bottom,"HandoffPortraitFrame","portrait_frame"),29,49,264,264);
    place(art(bottom,"HandoffNamePlate","name_plate"),27,0,264,51);
    // The approved sprite has a dark outermost right column; keep the gold rim,
    // clipping only that source-pixel fringe. No bitmap is rewritten.
    style(nodes.HandoffNamePlate,{clip:"rect(0%, 99.1%, 100%, 0%)"});
    centered(bottom,"HandoffName",34,5,250,40,27);
    style(nodes.HandoffName,{fontFamily:'"Source Han Serif SC"',fontWeight:"bold",fontSize:"27px",textAlign:"center"});
    centered(host,"HandoffBuildingTitle",0,0,800,36,32);
    style(nodes.HandoffBuildingTitle,{fontFamily:'"Source Han Sans SC"',fontWeight:"bold",fontSize:"34px",color:"#fff0ce",textShadow:"0px 1px 2px 3.0 #000000",backgroundColor:"#081d27dd",padding:"2px 14px",borderRadius:"4px",height:"fit-children",minHeight:"0px",textOverflow:"clip"});
    style(nodes.HandoffBuildingTitleBounds,{visibility:"collapse",zIndex:"16",overflow:"noclip",transformOrigin:"0% 0%"});
    place(art(bottom,"HandoffLevelPlate","level_plate"),16,229,81,81);
    centered(bottom,"HandoffLevel",20,241,73,50,33);
    var statNames = ["攻击", "护甲", "攻速", "力量", "敏捷", "智力"];
    stats.forEach(function(a,i){
        art(bottom,"HandoffStatIcon_"+a[0],"stat_"+a[0]);
        var caption=label(bottom,"HandoffStatName_"+a[0]);caption.text=statNames[i];
        style(caption,{fontSize:"32px",fontWeight:"medium",textOverflow:"clip",color:i<3?"#b8c5c8":["#e99c92","#a6d393","#9cbfde"][i-3]});
        label(bottom,"HandoffStat_"+a[0]);
        label(bottom,"HandoffStatBonus_"+a[0]);
        label(bottom,"HandoffStatPercent_"+a[0]);
        style(nodes["HandoffStatPercent_"+a[0]],{color:"#f08078",fontSize:"24px"});
        ["HandoffStatBonus_","HandoffStatPercent_"].forEach(function(prefix){
            nodes[prefix+a[0]].hittest=true;tooltip(nodes[prefix+a[0]],function(){return statBonusHelp(a[0]);});
        });
        style(nodes["HandoffStatBonus_"+a[0]],{color:"#8fe080",fontSize:"24px"});
    });
    ["HandoffStatName_attack_speed","HandoffStat_attack_speed","HandoffStatIcon_attack_speed"].forEach(function(id){
        nodes[id].hittest=true;tooltip(nodes[id],function(){
            var s=selectedSnapshot(),d=s&&s.stat_tooltips&&s.stat_tooltips.attack_speed;
            if(!d)return "正在读取攻速来源";
            function n(v){return Number(v||0).toFixed(2).replace(/\.?0+$/,"");}
            var lines=["当前攻速："+n(d.percentage)+"%"];
            if(d.base_interval)lines.push("基础攻击间隔："+n(d.base_interval)+" 秒");
            var reductions=d.interval_reductions||{},bonuses=d.speed_bonuses||{};
            Object.keys(reductions).forEach(function(k){var r=reductions[k];if(Number(r.value))lines.push(r.label+"：间隔减少 "+n(r.value)+" 秒");});
            Object.keys(bonuses).forEach(function(k){var r=bonuses[k];if(Number(r.value))lines.push(r.label+"：攻速 "+(r.value>=0?"+":"")+n(r.value)+"%");});
            if(Math.abs(Number(d.runtime_bonus_pct)||0)>0.01)lines.push("临时光环及其他效果："+n(d.runtime_bonus_pct)+"%");
            lines.push("先减少基础间隔，再应用攻速倍率");
            lines.push("当前攻击间隔："+n(d.attack_interval)+" 秒");
            return lines.join("<br>");
        });
    });
    function layoutStats(g) {
        stats.forEach(function(a,i){
            var x=i<3?306:g.attributeX+14,y=32+(i%3)*98;
            place(nodes["HandoffStatIcon_"+a[0]],x,y,72,72);
            var textX=x+6,textWidth=i<3?g.heroWidth-x-12:g.attributeWidth-28;
            // CJK captions need their natural line height. A short fixed Label
            // with text-overflow: shrink can silently undo an increased font size.
            place(nodes["HandoffStatName_"+a[0]],textX,y,textWidth,44);
            style(nodes["HandoffStatName_"+a[0]],{fontSize:"32px",height:"fit-children",minHeight:"0px",textOverflow:"clip"});
            place(nodes["HandoffStat_"+a[0]],textX,y+42,textWidth,32);
            style(nodes["HandoffStat_"+a[0]],{fontSize:"28px",fontWeight:"normal",height:"fit-children",minHeight:"0px"});
            place(nodes["HandoffStatBonus_"+a[0]],textX,y+74,textWidth*.55,24);
            place(nodes["HandoffStatPercent_"+a[0]],textX+textWidth*.55,y+74,textWidth*.45,24);
            if(g.lumberjack && (i===0 || i===2)) {
                var workerX=g.heroWidth+(i===0?24:g.centerWidth/2+12),workerWidth=g.centerWidth/2-36;
                place(nodes["HandoffStatName_"+a[0]],workerX,195,82,44);
                place(nodes["HandoffStat_"+a[0]],workerX+88,198,workerWidth-88,40);
            }
        });
    }
    ["hp","mp"].forEach(function(type){art(center,"Handoff_"+type+"_track",type+"_track");if(type==="hp")create("Panel",center,"Handoff_hp_fill",false);else art(center,"Handoff_"+type+"_fill",type+"_fill");label(center,"Handoff_"+type+"_value","HandoffNumber");style(nodes["Handoff_"+type+"_value"],{fontSize:"30px",textAlign:"center"});});
    ["HandoffBuildingLevel","HandoffBuildingSummary","HandoffBuildingBonus","HandoffBuildingHealthBonus","HandoffBuildingPercent","HandoffBuildingHealthPercent"].forEach(function(id){
        label(center,id,"HandoffNumber");style(nodes[id],{visibility:"collapse",fontSize:"36px",textAlign:"center"});
    });
    ["HandoffBuildingBonus","HandoffBuildingHealthBonus"].forEach(function(id){style(nodes[id],{color:"#8fe080",fontSize:"32px"});});
    ["HandoffBuildingPercent","HandoffBuildingHealthPercent"].forEach(function(id){style(nodes[id],{color:"#f08078",fontSize:"30px"});});
    ["HandoffBuildingBonus","HandoffBuildingPercent","HandoffBuildingHealthBonus","HandoffBuildingHealthPercent"].forEach(function(id){
        nodes[id].hittest=true;tooltip(nodes[id],function(){return buildingBonusHelp(id.indexOf("Health")>=0?"health":null);});
    });
    var buildingStatRow=create("Panel",center,"HandoffBuildingStatRow",false);
    buildingStatRow.hittestchildren=true;
    style(buildingStatRow,{flowChildren:"right",visibility:"collapse",overflow:"clip"});
    var buildingInlineIds=["HandoffBuildingSummary","HandoffBuildingBonus","HandoffBuildingPercent","HandoffBuildingHealthPercent"];
    function selectedSnapshot() {return cfg.HandoffCombat && cfg.HandoffCombat.Snapshot ? cfg.HandoffCombat.Snapshot(selectedUnit()) : null;}
    function buildingBonusHelp(stat) {
        var snapshot=selectedSnapshot(),d=snapshot && snapshot.building_stat_details || {};
        var growth="<br>逐秒、攻击、伤害、杀敌累积成长计入白色数值。";
        if(!snapshot)return "正在读取加成来源";
        if(snapshot.building_id==="arrow_tower")return "攻击加成来源"+
            "<br>科技 / 挑战："+compact(d.attack_technology_flat||0)+"，"+compact(d.attack_technology_pct||0)+"%"+
            "<br>存档 / 宝物等固定奖励："+compact(d.attack_permanent_flat||0)+"，"+compact(d.attack_permanent_pct||0)+"%"+
            "<br>固定天赋倍率："+compact(d.attack_talent_pct||0)+"%"+
            "<br>绿色：固定加成合计；红色：百分比效果，已计入绿色合计。"+growth;
        stat=stat||"armor";
        if(d[stat+"_permanent_pct"]===undefined)return "当前百分比："+compact(d[stat+"_pct"]||0)+"%<br>当前对局尚未同步分类来源明细，重新开局后可查看。";

        return (stat==="health"?"生命":"防御")+"加成来源"+
            "<br>科技："+compact(d[stat+"_technology_flat"]||0)+"，"+compact(d[stat+"_technology_pct"]||0)+"%"+
            "<br>固定奖励："+compact(d[stat+"_permanent_flat"]||0)+"，"+compact(d[stat+"_permanent_pct"]||0)+"%"+
            "<br>天赋固定数值："+compact(d[stat+"_talent_flat"]||0)+
            "<br>红色百分比已计入绿色加成，不需要再加一次。"+growth;
    }
    function statBonusHelp(stat) {
        var snapshot=selectedSnapshot(),key=stat==="intelligence"?"intellect":stat;
        if(!snapshot)return "正在读取加成来源";
        return "英雄固定加成"+
            "<br>来自装备、研究、固定奖励与固定技能效果。"+
            "<br>加成合计："+compact(snapshot["display_"+key+"_bonus"]||0)+
            "<br>百分比效果："+compact(snapshot["display_"+key+"_pct"]||0)+"%"+
            "<br>红色百分比已计入绿色合计，不需要再加一次。"+
            "<br>逐秒、攻击、伤害、杀敌累积成长计入白色数值。";
    }
    for(var i=0;i<6;i++)slotFrames.push(art(bottom,"HandoffItemFrame_"+i,"slot_frame"));
    function nine(parent,id,key,x,y,w,h,cx,cy) {
        var group=slices[id];if(!valid(group)){group=create("Panel",parent,id,false);slices[id]=group;group.parts=[];
            for(var row=0;row<3;row++)for(var col=0;col<3;col++)group.parts.push(art(group,"",key+"_slice_"+row+"_"+col));}
        place(group,x,y,w,h);var widths=[cx,w-2*cx,cx],heights=[cy,h-2*cy,cy],xs=[0,cx,w-cx],ys=[0,cy,h-cy];
        group.parts.forEach(function(p,index){var c=index%3,r=Math.floor(index/3);place(p,xs[c],ys[r],widths[c],heights[r]);});return group;
    }
    function selectedUnit() {var resolver=cfg.SurvivalSelectionResolver;return resolver&&resolver.ResolveDisplayUnit?resolver.ResolveDisplayUnit():resolver&&resolver.Resolve?resolver.Resolve():Players.GetLocalPlayerPortraitUnit();}
    function abilityEntries(){
        var unit=selectedUnit();if(unit<0)return [];
        if(cfg.HandoffCombat&&cfg.HandoffCombat.Entries)return cfg.HandoffCombat.Entries(unit);
        var result=[];for(var i=0;i<32;i++){var a=Entities.GetAbility(unit,i);if(a===undefined||a<0)continue;var name=Abilities.GetAbilityName(a)||"";if(name&&!Abilities.IsHidden(a)&&name.indexOf("special_bonus_")!==0)result.push({ability:a,name:name,slot:i});}return result;
    }
    function abilityCount() {
        currentEntries=abilityEntries();return currentEntries.length;
    }
    function fitNativeSkills(g){
        g=g||geometry;
        if(!g||!isFinite(Number(g.scale))||Number(g.scale)<=0)return;
        var list=native("abilities");if(!valid(list))return;
        var candidates=[];
        for(var i=0;i<list.GetChildCount();i++){var p=list.GetChild(i);if(!/^Ability\d+$/.test(p.id))continue;
            // Include our collapsed overflow slots without showing and hiding them every tick.
            if(p.__handoffOverflow||(p.visible!==false&&String(p.style.visibility)!=="collapse"))candidates.push(p);
        }
        skillPanels=candidates.slice(0,currentEntries.length);
        candidates.forEach(function(p,index){if(index>=currentEntries.length){style(p,{visibility:"collapse",width:"0px",marginRight:"0px"});p.__handoffOverflow=true;}else{if(p.__handoffOverflow){style(p,{visibility:"visible"});p.__handoffOverflow=false;}square(p);style(p,{marginRight:"4px"});}});
        skillPanels.forEach(function(p){
            [p,p.FindChildTraverse("AbilityButton"),p.FindChildTraverse("ButtonWell")].forEach(function(anchor){
                if(!valid(anchor))return;
                anchor.__survivalWindowWidth=116*g.scale*(ctx.actualuiscale_x||1);
                anchor.__survivalWindowHeight=116*g.scale*(ctx.actualuiscale_y||1);
            });
        });
    }
    function canvas(p,g) {style(p,{transitionProperty:"none",transitionDuration:"0s",animationName:"none"});place(p,g.x,g.y,g.width,g.height);style(p,{transformOrigin:"0% 0%",transform:"scale3d("+g.scale+","+g.scale+",1)",overflow:"noclip",maxWidth:"10000px"});p.hittest=false;p.hittestchildren=true;}
    // Called synchronously by the existing hotkey writer, not by the HUD polling loop.
    cfg.HandoffStyleHotkey=function(p,slot,unit,ability){
        // The label stays in its engine-owned hierarchy for binding checks. Only its
        // pixels are suppressed; the uncropped independent label lives in our HUD.
        style(p,{opacity:"0"});
        if(slot)keyBindings[slot.id]={text:String(p.text||""),unit:Number(unit),ability:Number(ability)};
    };
    function mirrorKeys(){
        var unit=Number(selectedUnit());
        for(var i=0;i<32;i++){
            var id="HandoffKey_"+i,bounds=nodes[id+"Bounds"],slot=skillPanels[i],binding=slot&&keyBindings[slot.id];
            var matching=binding&&binding.unit===unit&&currentEntries[i]&&Number(currentEntries[i].ability)===binding.ability;
            if(!bounds&&matching){bounds=create("Panel",bottom,id+"Bounds",false);label(bounds,id,"HandoffNumber");}
            if(!bounds)continue;bounds.visible=!!matching&&!!binding.text;
            if(bounds.visible){centered(bottom,id,geometry.heroWidth+13+i*120,138,43,33,25);style(bounds,{backgroundImage:'url("file://{images}/'+assets.key_plate.file+'")',backgroundSize:"100% 100%",zIndex:"100"});text(id,binding.text);}
        }
    }
    function child(p,id,values) {if(valid(p))style(p.FindChildTraverse(id),values);}
    function square(slot) {
        // Style only: no SetParent, new descendants, event replacement or key rebinding in native slots.
        style(slot,{width:"116px",height:"116px",minWidth:"0px",minHeight:"0px",margin:"0px",padding:"0px",transform:"none"});
        ["ButtonAndLevel","ButtonWithLevelUpTab","ButtonWell","ButtonSize","AbilityButton"].forEach(function(id){var p=slot.FindChildTraverse(id);if(valid(p)){place(p,0,0,116,116);style(p,{transform:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",minWidth:"0px",minHeight:"0px",maxWidth:"116px",maxHeight:"116px",overflow:"noclip"});}});
        ["AbilityImage","ItemImage"].forEach(function(id){var p=slot.FindChildTraverse(id);if(valid(p)){place(p,6,6,104,104);style(p,{transform:"none"});
            if(id==="ItemImage")style(p,{backgroundSize:"100% 100%",backgroundPosition:"center",backgroundRepeat:"no-repeat"});
        }});
        ["Cooldown","CooldownOverlay"].forEach(function(id){var p=slot.FindChildTraverse(id);if(valid(p))place(p,6,6,104,104);});
        var keyContainer=slot.FindChildTraverse("HotkeyContainer"),key=slot.FindChildTraverse("Hotkey");
        if(valid(keyContainer)){place(keyContainer,3,85,43,31);style(keyContainer,{backgroundImage:"none",border:"0px",minWidth:"0px",minHeight:"0px"});}
        if(valid(key)){place(key,valid(keyContainer)?0:3,valid(keyContainer)?0:85,43,31);style(key,{backgroundImage:'url("file://{images}/'+assets.key_plate.file+'")',backgroundSize:"100% 100%",border:"0px",minWidth:"0px",minHeight:"0px"});}
        child(slot,"HotkeyText",{fontFamily:'"Source Han Sans SC"',fontSize:"25px",margin:"0px",textAlign:"center"});
        if(String(slot.id||"").indexOf("inventory_slot_")===0)["ButtonSize","ButtonWell"].forEach(function(id){child(slot,id,{boxShadow:"none"});});
        // These are decorative only. Keep active/cooldown/disabled/drag overlays intact.
        ["AbilityBevel","ShineContainer","PassiveAbilityBorder"].forEach(function(id){child(slot,id,{opacity:"0"});});
    }
    function refreshInventoryPresentation() {
        var inv=native("inventory"),unit=selectedUnit();
        if(!valid(inv)||unit<0||!Entities.GetItemInSlot)return;
        for(var slotIndex=0;slotIndex<9;slotIndex++){
            var slot=inv.FindChildTraverse("inventory_slot_"+slotIndex);
            if(!valid(slot))continue;
            var itemIndex=Entities.GetItemInSlot(unit,slotIndex);
            var name=itemIndex>=0?Abilities.GetAbilityName(itemIndex):"";
            var hideCounter=/^item_survival_(attack_gloves|burning_blade|iron_armor)(?:_shell|_\d+|_max)?$/.test(String(name||""));
            var identity=itemIndex>=0?CustomNetTables.GetTableValue("survival_inventory_item_identity",String(itemIndex)):null;
            var equipmentMax=!!(identity&&identity.removed!==1
                &&/^equipment_(attack_gloves|burning_blade|iron_armor)_max$/.test(String(identity.content_id||"")))
                ||/^item_survival_(attack_gloves|burning_blade|iron_armor)_max$/.test(String(name||""));
            var maxLabel=slot.FindChildTraverse("SurvivalInventoryArmorMax");
            if(equipmentMax&&!valid(maxLabel)){
                maxLabel=$.CreatePanel("Label",slot,"SurvivalInventoryArmorMax");
                maxLabel.text="MAX";
                maxLabel.hittest=false;maxLabel.hittestchildren=false;
                style(maxLabel,{horizontalAlign:"right",verticalAlign:"bottom",margin:"0px 6px 6px 0px",fontSize:"26px",fontWeight:"bold",color:"#ffffff",textShadow:"0px 0px 2px 3 #000000",zIndex:"10"});
            }
            if(valid(maxLabel))maxLabel.visible=equipmentMax;
            var imageHost=slot.FindChildTraverse("ItemImage");
            if(valid(imageHost)){
                // DOTAItemImage renders its texture internally. background-size
                // on its wrapper does not resize that texture. Use a real Image
                // inside the same visual layer, below native cooldown overlays.
                var art=cfg.SurvivalItemArt;
                var resolved=art&&art.ResolveOriginal&&(
                    identity&&identity.removed!==1&&art.ResolveOriginal(identity.content_id)
                    ||art.ResolveOriginal(name));
                var fitted=imageHost.FindChildTraverse("SurvivalInventoryFittedIcon");
                if(resolved&&!valid(fitted)){
                    fitted=$.CreatePanel("Image",imageHost,"SurvivalInventoryFittedIcon");
                    fitted.hittest=false;fitted.hittestchildren=false;
                    style(fitted,{width:"100%",height:"100%",position:"0px 0px 0px",margin:"0px",padding:"0px",horizontalAlign:"center",verticalAlign:"center",zIndex:"1"});
                    fitted.SetScaling("stretch-to-fit-preserve-aspect");
                }
                if(valid(fitted)){
                    fitted.visible=!!resolved;
                    if(resolved){
                        var uri="file://{images}/items/survival_shop_v2/"+resolved[0]+"_"+("0"+resolved[1]).slice(-2)+".png";
                        if(fitted.__survivalImageUri!==uri){fitted.SetImage(uri);fitted.__survivalImageUri=uri;}
                    }
                }
            }
            ["ItemCharges","ItemAltCharges"].forEach(function(id){
                var count=slot.FindChildTraverse(id);
                if(valid(count)){count.style.fontSize="26px";count.style.opacity=hideCounter?"0":"1";}
            });
            child(slot,"ItemChargesContainer",{opacity:hideCounter?"0":"1"});
        }
    }
    function layoutMinimap(g) {
        var map=native("minimap_container"),mini=native("minimap_block"),live=native("minimap"),size=g.minimapSize;
        if(!valid(map)||!valid(mini)||!valid(live))return;
        style(map,{width:(size+6)+"px",height:(size+6)+"px",horizontalAlign:"left",verticalAlign:"bottom",
            margin:"0px 0px 6px 6px",padding:"0px",transform:"none",overflow:"noclip",
            backgroundImage:"none",backgroundColor:"#10252c",border:"1px solid #62736b",boxShadow:"none"});
        place(mini,2,2,size,size);style(mini,{transform:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none"});
        place(live,0,0,size,size);style(live,{transform:"none"});
        // Keep the live map and its native input; hide only stock skin/side controls.
        ["HUDSkinMinimap","GlyphScanContainer","RoshanTimerContainer","TormentorTimerContainer"].forEach(function(id){
            var p=map.FindChildTraverse(id);if(!valid(p))return;
            style(p,{visibility:"collapse",opacity:"0"});p.hittest=false;p.hittestchildren=false;
        });
    }
    function nativeLayout(g) {
        var required=["lower_hud","center_with_stats","center_block","PortraitGroup","AbilitiesAndStatBranch","abilities","inventory","minimap"];
        missing=required.filter(function(id){return !valid(native(id));});if(missing.length)return false;
        canvas(native("lower_hud"),g);
        ["center_with_stats","center_block"].forEach(function(id){var n=native(id);place(n,0,0,g.width,g.height);style(n,{transitionProperty:"none",animationName:"none",transform:"none",flowChildren:"none",overflow:"noclip"});n.hittest=false;n.hittestchildren=true;});
        var block=native("center_block"),portrait=native("PortraitGroup");
        // Native 10px skill inset shadows keep their old offsets and cross inventory.
        for(var decorIndex=0;decorIndex<block.GetChildCount();decorIndex++){
            var decor=block.GetChild(decorIndex);
            if(decor.BHasClass("AbilityInsetShadowLeft")||decor.BHasClass("AbilityInsetShadowRight")){
                style(decor,{visibility:"collapse",opacity:"0"});decor.hittest=false;decor.hittestchildren=false;
            }
        }

        // Only OUR decoration host moves behind native content. Never reparent an engine panel.
        if(background.GetParent()!==block)background.SetParent(block);
        place(background,0,0,g.width,g.height);style(background,{zIndex:"-100"});
        place(portrait,29,49,g.portraitSize,g.portraitSize);style(portrait,{overflow:"clip",transform:"none",transitionProperty:"none",animationName:"none"});
        place(native("PortraitContainer"),0,0,g.portraitSize,g.portraitSize);
        // Establish the visible container baseline on HUD construction/reflow.
        // The multi-selection controller applies its temporary mask afterwards;
        // cosmetic single-unit portraits continue to own only the visual leaf.
        style(native("PortraitContainer"),{opacity:"1"});
        // Remove the previous corner cover, including panels surviving a HUD reload.
        var legacyCorner=portrait.FindChildTraverse("HandoffPortraitCornerCover");
        if(valid(legacyCorner)&&!legacyCorner._removing){
            legacyCorner._removing=true;legacyCorner.visible=false;
            legacyCorner.hittest=false;legacyCorner.hittestchildren=false;
            legacyCorner.DeleteAsync(0);
        }
        // End legacy corner cleanup.
        place(native("portraitHUD"),0,0,g.portraitSize,g.portraitSize);style(native("portraitHUD"),{transform:"none"});
        ["stats_container","unitname","health_mana","center_bg","left_flare","right_flare","PortraitBacker","PortraitBackerColor"].forEach(function(id){var n=block.FindChildTraverse(id);style(n,{opacity:"0"});if(valid(n)){n.hittest=false;n.hittestchildren=false;}});
        var branch=native("AbilitiesAndStatBranch"),list=native("abilities");
        place(branch,g.heroWidth+10,61,g.centerWidth-20,116);style(branch,{flowChildren:"none",minWidth:"0px",overflow:"noclip"});
        // Valve inserts an anonymous talent/ability wrapper; clear its stock left gutter.
        for(var wrapper=list.GetParent();valid(wrapper)&&wrapper!==branch;wrapper=wrapper.GetParent()) {
            place(wrapper,0,0,g.centerWidth-20,116);style(wrapper,{flowChildren:"none",transform:"none",overflow:"noclip"});
        }
        place(native("StatBranch"),g.heroWidth+10,-85,74,74);
        style(native("InnateIcon"),{visibility:"collapse"});
        // Hiding the icon alone leaves its anonymous framing Image visible.
        // Hide only its DOTAInnateDisplay ancestor, never the shared abilities row.
        for(var innate=native("InnateIcon");valid(innate)&&innate!==branch;innate=innate.GetParent()){
            if(innate.paneltype==="DOTAInnateDisplay"){style(innate,{visibility:"collapse"});break;}
        }
        place(list,0,0,g.centerWidth-20,116);style(list,{flowChildren:"right",minWidth:"0px",minHeight:"0px",overflow:"noclip",transform:"none"});
        fitNativeSkills(g);
        var inv=native("inventory");place(inv,g.inventoryX+15,55,358,242);style(inv,{overflow:"noclip",transform:"none",boxShadow:"none",backgroundImage:"none",backgroundColor:"transparent"});
        // Clear native inventory separators; the shared skin owns all framing.
        [inv,inv.FindChildTraverse("inventory_items"),inv.FindChildTraverse("inventory_list_container"),inv.FindChildTraverse("inventory_list"),inv.FindChildTraverse("inventory_list2")].forEach(function(p){
            style(p,{border:"0px",boxShadow:"none",backgroundImage:"none",backgroundColor:"transparent"});
        });
        for(var cleanSlot=0;cleanSlot<6;cleanSlot++){
            var nativeSlot=inv.FindChildTraverse("inventory_slot_"+cleanSlot);
            style(nativeSlot,{border:"0px",boxShadow:"none",backgroundImage:"none",backgroundColor:"transparent"});
        }
        // End native inventory separator cleanup.

        ["inventory_items","inventory_list_container"].forEach(function(id){var p=inv.FindChildTraverse(id);if(valid(p)){place(p,0,0,358,242);style(p,{flowChildren:"none",overflow:"noclip",backgroundImage:"none",backgroundColor:"transparent"});}});
        ["InventoryBG","InventoryBackpackContainer","BackPackShadow","BackpackShadow","inventory_backpack"].forEach(function(id){child(inv,id,{backgroundImage:"none",backgroundColor:"transparent",boxShadow:"none"});});
        ["BackPackShadow","BackpackShadow"].forEach(function(id){child(inv,id,{opacity:"0"});});
        ["InventoryBG","HUDSkinInventoryBG"].forEach(function(id){child(inv,id,{visibility:"collapse",border:"0px",boxShadow:"none"});});
        ["inventory_list","inventory_list2"].forEach(function(id,index){var p=inv.FindChildTraverse(id);if(valid(p)){place(p,0,index*126,358,116);style(p,{flowChildren:"right",overflow:"noclip"});}});
        for(var j=0;j<6;j++){var item=inv.FindChildTraverse("inventory_slot_"+j);if(valid(item)){square(item);style(item,{marginRight:"5px"});}}
        // Preserve backpack, neutral slot, buffs and all original interaction handlers.
        var backpack=inv.FindChildTraverse("inventory_backpack_list");if(valid(backpack))place(backpack,0,-60,358,52);
        place(native("inventory_composition_layer_container"),g.inventoryX+280,-75,110,70);
        place(native("buffs"),g.heroWidth+10,g.heroWidth===0?-82:-42,g.centerWidth-20,40);place(native("debuffs"),g.heroWidth+10,g.heroWidth===0?-126:-86,g.centerWidth-20,40);
        layoutMinimap(g);
        ["ArchiveEntry","TreasureEntry","LotteryButton"].forEach(function(id){style(root.FindChildTraverse(id),{visibility:"collapse"});});
        return true;
    }
    // Resolve navigation at its displayed size: avoid post-scaling rasterized text/SVG.
    // Snap child bounds and the shared text baseline to physical screen pixels.
    function layoutNavigation(scale, screenScale) {
        function px(value) { return Math.round(value * scale * screenScale) / screenScale; }
        function box(panel,x,y,width,height) { place(panel,px(x),px(y),px(width),px(height)); }
        var textSize=px(22)+"px";
        nav.forEach(function(entry,index){
            var key=entry[0],bounds=navBounds(key,index),width=bounds.width;
            box(topButtons[key],bounds.x,6,width,86);
            box(nodes["HandoffNavGlow_"+key],(width-62)/2,0,62,62);
            box(nodes["HandoffNavIcon_"+key],(width-44)/2,4,44,44);
            if(key==="vip")box(nodes["HandoffNavIcon_"+key],(width-56)/2,-2,56,56);
            box(nodes["HandoffNavCaptionHost_"+key],0,52,width,32);
            style(nodes["HandoffNavCaption_"+key],{fontSize:textSize});
            box(nodes["HandoffNavUnderline_"+key],(width-34)/2,84,34,2);
        });
        box(fxButton,522,6,96,86);
        box(fxHalo,17,0,62,62);
        box(fxIcon,26,4,44,44);
        box(fxCaptionHost,0,52,96,32);
        style(fxText,{fontSize:textSize});
    }
    function layout() {
        var w=(ctx.actuallayoutwidth||1672)/(ctx.actualuiscale_x||1),h=(ctx.actuallayoutheight||941)/(ctx.actualuiscale_y||1);
        var topScale=Math.min((w-16)/1672,h/941),topX=8,topY=6;
        var navPixelScale=Number(ctx.actualuiscale_x)||1;
        topX=Math.round(topX*navPixelScale)/navPixelScale;
        topY=Math.round(topY*navPixelScale)/navPixelScale;
        place(top,topX,topY,630*topScale,94*topScale);style(top,{transform:"none"});
        layoutNavigation(topScale,navPixelScale);
        var statusScale=Math.min(w/1672,h/941),statusX=(w-1672*statusScale)/2;
        place(topStatus,statusX,0,1672,941);style(topStatus,{transform:"scale3d("+statusScale+","+statusScale+",1)"});
        // Keep the hero shortcut below the navigation at every viewport scale.
        style(root.FindChildTraverse("SurvivalLocalHeroPortrait"),{position:topX+"px "+(topY+94*topScale+8)+"px 0px"});
        // Both screen edges lie inside the texture; no Image aspect-fit gutters.
        place(topBackdrop,-24,0,w+48,941*topScale);
        var presentation=statVisibility(selectedUnit());presentation.multi=!!(cfg.SurvivalMultiSelectionPortraits&&cfg.SurvivalMultiSelectionPortraits.IsActive());var count=presentation.tree?0:abilityCount(),g=cfg.HandoffGeometry(w,h,count,presentation.building,presentation.tree,presentation);
        var counterY=h-g.minimapSize-56;
        place(enemyCounter,6,counterY,g.minimapSize+6,34);style(enemyCounter,{padding:"0px 8px"});
        // The native bottom bar lives outside this custom HUD hierarchy. Publish
        // its physical bounds once per layout, so world labels cannot paint over it.
        var origin=ctx.GetPositionWithinWindow?ctx.GetPositionWithinWindow():{x:0,y:0};
        var sx=Number(ctx.actualuiscale_x)||1,sy=Number(ctx.actualuiscale_y)||1;
        function rect(x,y,width,height){return {x:(Number(origin.x)||0)+x*sx,y:(Number(origin.y)||0)+y*sy,width:width*sx,height:height*sy};}
        cfg.HandoffWorldOcclusion=ready?[
            rect(g.x,g.y-(g.heroWidth===0?23*g.scale:0),g.width*g.scale,(g.height+(g.heroWidth===0?23:0))*g.scale),
            rect(0,counterY,g.minimapSize+24,h-counterY),
            rect(topX,topY,716*topScale,94*topScale),
            rect(statusX+646*statusScale,14*statusScale,983*statusScale,44*statusScale)
        ]:[];
        if(ready)layoutMinimap(g);
        var signature=[w,h,count,g.heroWidth,g.height,selectedUnit(),currentEntries.map(function(e){return e.ability;}).join(",")].join(":");
        // Reapply when the engine rebuilds its native HUD, even without a selection event.
        if(signature!==lastSignature||!ready||!valid(natives.abilities)||!valid(natives.inventory)) {
            ready=nativeLayout(g);if(!ready){bottom.visible=false;return;}
            lastSignature=signature;geometry=g;canvas(bottom,g);bottom.hittestchildren=true;
            // Extend only the stat gutter; the portrait sprite/camera keep their dimensions.
            nine(background,"HandoffCombatPlate","center_base",293,23,Math.max(36,g.heroWidth-293),307,18,20);
            nine(background,"HandoffAttributesPlate","center_base",g.attributeX,23,g.attributeWidth,307,18,20);
            layoutStats(g);
            place(center,g.heroWidth,23,g.centerWidth,g.height-23);nine(background,"HandoffCenterPlate","center_base",g.heroWidth,23,g.centerWidth,g.height-23,18,20);
            place(inventory,g.inventoryX,23,401,307);
            ["hp","mp"].forEach(function(type,index){var y=175+index*60;
                place(nodes["Handoff_"+type+"_track"],20,y+4,g.barWidth-8,44);
                place(nodes["Handoff_"+type+"_fill"],20,y+4,g.barWidth-8,44);
                // Health and mana use only their track, fill and number; no outer frame.
                var value=nodes["Handoff_"+type+"_value"];
                if(!nodes[value.id+"Bounds"]){var bounds=create("Panel",center,value.id+"Bounds",false);value.SetParent(bounds);}
                centered(center,value.id,24,y+4,g.barWidth-16,44,30);
            });
            for(var i=0;i<32;i++){var key="HandoffSkillFrame_"+i;var frame=nodes[key];if(i<count&&!frame)frame=art(center,key,"slot_frame");if(frame){frame.visible=i<count;place(frame,10+120*i,38,116,116);}}
            slotFrames.forEach(function(p,i){place(p,g.inventoryX+15+(i%3)*121,55+Math.floor(i/3)*126,116,116);});
            bottom.visible=true;ctx.AddClass("HandoffReady");
            ["TopBar","WaveBar"].forEach(function(id){var p=ctx.FindChildTraverse(id);if(p){p.hittest=false;p.hittestchildren=false;}});
            $.Msg("[HANDOFF_HUD] native_ready abilities=",count," slot=116x116 scale=",g.scale," center=",g.centerWidth," bar=",g.barWidth);
        }
    }
    function revealWhenStable(){
        if(presented)return;
        var usable=ready&&sequence>=0&&selectedUnit()>=0&&geometry&&valid(native("PortraitGroup"));
        stableFrames=usable&&bootSignature===lastSignature?stableFrames+1:0;bootSignature=lastSignature;
        if(stableFrames<3){style(host,{opacity:"0"});style(native("lower_hud"),{opacity:"0"});return;}
        presented=true;style(host,{opacity:"1"});style(native("lower_hud"),{opacity:"1"});
        ctx.RemoveClass("HandoffBoot");$.Msg("[HANDOFF_PRESENTED] stable_frames=",stableFrames);
    }
    function statVisibility(unit) {
        if (unit < 0) return {combat:false,attributes:false};
        var name=String(Entities.GetUnitName(unit) || ""),building=false;
        try {building=!!(Entities.IsBuilding && Entities.IsBuilding(unit));} catch(error) {}
        // Some towers/walls are npc_dota_creature proxies with hero models.
        building=building || /^(building_|npc_dota_unit_building_|asset_proxy_(tower_|wall_))/.test(name)
            || name==="npc_dota_unit_ultimate_tower" || /^npc_archive_challenge_[123]$/.test(name);
        var snapshot=cfg.HandoffCombat && cfg.HandoffCombat.Snapshot ? cfg.HandoffCombat.Snapshot(unit) : null;
        var id=snapshot && snapshot.building_id || "";
        var tree=name==="enemy_tree" || name==="npc_dota_unit_enemy_tree" || !!(snapshot && Number(snapshot.is_resource_tree)===1);
        if(tree)return {combat:false,attributes:false,building:false,wall:false,tower:false,tree:true};
        var repairer=/^npc_survival_repairer(?:_|$)/.test(name),lumberjack=/^npc_survival_(?:super_)?lumberjack(?:_|$)/.test(name);
        if(repairer || lumberjack)return {combat:lumberjack,attributes:false,building:false,worker:true,repairer:repairer,lumberjack:lumberjack};
        var wall=id==="wall" || /^(building_wall|npc_dota_unit_building_wall|asset_proxy_wall_)/.test(name);
        var tower=id==="arrow_tower" || /^(building_arrow_tower|npc_dota_unit_building_arrow_tower|asset_proxy_tower_)/.test(name) || name==="npc_dota_unit_ultimate_tower";
        building=building || !!id || wall || tower;
        var hero=/^npc_dota_hero_/.test(name) && name!=="npc_dota_hero_undying";
        try {if(Entities.IsHero) hero=hero && !!Entities.IsHero(unit);} catch(error) {}
        // Creature names cover every wave/practice/challenge family before a snapshot arrives.
        // Team detection also covers bosses created from native hero definitions.
        var monster=/^(npc_survival_(?:wave_|named_|rogue_training_dummy)|asset_proxy_(?:monster_|wave_)|zombie_)/.test(name);
        try {monster=monster || !!(Entities.GetTeamNumber && Number(Entities.GetTeamNumber(unit))===3);} catch(error) {}
        monster=!building && monster;
        return {combat:!!name && !building,attributes:hero && !building && !monster,building:building,wall:wall,tower:tower,monster:monster,production:/^building_(main_city|(?:advanced_)?research_lab)$/.test(name)};
    }
    function buildingPresentation(shown,multi) {
        // Shared compact presentation does not classify resource trees as friendly buildings.
        var building=!!(shown.building || shown.tree || shown.worker),workerMulti=!!(shown.lumberjack && multi),g=geometry;
        style(native("AbilitiesAndStatBranch"),{visibility:shown.tree?"collapse":"visible"});
        // Hide parents: native/cosmetic code may continue updating their children.
        ["PortraitGroup","inventory","inventory_composition_layer_container"].forEach(function(id){
            style(native(id),{visibility:(building && !(id==="PortraitGroup" && workerMulti)) || (shown.monster && id!=="PortraitGroup")?"collapse":"visible"});
        });
        var grid=native("multiunit");
        if(valid(grid)) {
            if(building && !workerMulti) {
                if(!grid.__buildingPortraitMask) grid.__buildingPortraitMask={opacity:String(grid.style.opacity || "1"),hit:grid.hittest,children:grid.hittestchildren};
                style(grid,{opacity:"0"});grid.hittest=false;grid.hittestchildren=false;
            } else if(grid.__buildingPortraitMask) {
                var saved=grid.__buildingPortraitMask;style(grid,{opacity:saved.opacity});
                grid.hittest=saved.hit;grid.hittestchildren=saved.children;delete grid.__buildingPortraitMask;
            }
        }
        ["HandoffHeroBase","HandoffPortraitFrame","HandoffNamePlate","HandoffInventoryBase"].forEach(function(id){
            style(nodes[id],{visibility:(building && !(id==="HandoffPortraitFrame" && workerMulti)) || (shown.monster && id==="HandoffInventoryBase")?"collapse":"visible"});
        });
        ["HandoffCombatPlate","HandoffAttributesPlate"].forEach(function(id){style(slices[id],{visibility:building || (shown.monster && id==="HandoffAttributesPlate")?"collapse":"visible"});});
        slotFrames.forEach(function(p){style(p,{visibility:building || shown.monster?"collapse":"visible"});});
        ["HandoffLevelPlate","HandoffLevelBounds"].forEach(function(id){if(valid(nodes[id]))nodes[id].visible=!multi&&!building&&!shown.monster;});
        ["hp","mp"].forEach(function(type){
            var show=(!building && (!shown.monster || type==="hp")) || (type==="hp" && (shown.wall || shown.tree));
            ["_track","_fill","_valueBounds"].forEach(function(suffix){style(nodes["Handoff_"+type+suffix],{visibility:show?"visible":"collapse"});});
        });
        ["HandoffBuildingLevel","HandoffBuildingSummary","HandoffBuildingBonus","HandoffBuildingHealthBonus","HandoffBuildingPercent","HandoffBuildingHealthPercent"].forEach(function(id){style(nodes[id],{visibility:"collapse"});});
        // Natural text widths keep fixed bonuses immediately after their base value.
        // Restore the original parent when switching to resource trees or other units.
        var inlineStats=shown.wall||shown.tower;
        buildingInlineIds.forEach(function(id){
            var node=nodes[id],parent=inlineStats?buildingStatRow:center;
            if(node.GetParent()!==parent)node.SetParent(parent);
        });
        style(buildingStatRow,{visibility:"collapse"});
        style(nodes.HandoffNameBounds,{visibility:building?"collapse":"visible"});
        style(nodes.HandoffBuildingTitleBounds,{visibility:building&&(!multi||shown.worker)?"visible":"collapse"});
        style(nodes.Handoff_hp_value,{fontSize:building&&(shown.wall||shown.tree)?"36px":"30px"});
        style(nodes.Handoff_hp_fill,{backgroundImage:shown.tree?"none":'url("file://{images}/'+assets.hp_fill.file+'")',
            backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",
            backgroundColor:shown.tree?"gradient(linear,0% 0%,0% 100%,from(#e4473d),to(#a21e1c))":"transparent"});
        style(nodes.HandoffBuildingSummary,{textAlign:shown.tree?"left":"center",color:"#f3ebd4",height:"fit-children",minHeight:"0px"});
        if(!g)return;
        if(!building) {place(nodes.HandoffNameBounds,34,5,250,40);style(nodes.HandoffName,{fontSize:"27px",height:"fit-children"});return;}
        place(nodes.HandoffBuildingTitleBounds,g.x+(g.heroWidth+20)*g.scale,g.y-50*g.scale,g.centerWidth-40,48);
        // Reapply the shared title contrast during selection refresh as well.
        style(nodes.HandoffBuildingTitle,{color:"#fff0ce",backgroundColor:"#081d27dd",textShadow:"0px 1px 2px 3.0 #000000"});
        style(nodes.HandoffBuildingTitleBounds,{transform:"scale3d("+g.scale+","+g.scale+",1)"});
        style(nodes.HandoffNameBounds,{overflow:"noclip",zIndex:"8"});
        style(nodes.HandoffName,{fontSize:"32px",height:"36px",textAlign:"center"});
        if(shown.worker) {
            text("HandoffBuildingTitle",nodes.HandoffName.text);
            return;
        }
        var name=String(nodes.HandoffName && nodes.HandoffName.text || "");
        text("HandoffName",name.replace(/(?:\s*(?:LV|Lv\.?|\u7b49\u7ea7)\s*\d+|\s*[\u00b7\u30fb]\s*[\u2160-\u216b]+)\s*$/i,""));
        var unit=selectedUnit(),snapshot=cfg.HandoffCombat && cfg.HandoffCombat.Snapshot ? cfg.HandoffCombat.Snapshot(unit) : null;
        var level=snapshot && (shown.tower ? (snapshot.route_level || snapshot.level) : (snapshot.absolute_level || snapshot.level));
        if(!level){var source=ctx.FindChildTraverse("SurvivalHeroLevel");level=source && source.text;}
        text("HandoffBuildingLevel","LV"+String(level || "1").replace(/^LV\.?\s*/i,""));
        place(nodes.HandoffBuildingLevel,20,5,g.centerWidth-40,28);
        // One centered title, no standalone LV label at the left edge.
        // Only buildings with a building-level upgrade path need a LV suffix.
        // Research/challenge skill upgrades do not level the building itself.
        var buildingId=String(snapshot && snapshot.building_id || "").replace(/^building_/,"");
        var unitName=typeof Entities!=="undefined" && Entities.GetUnitName ? String(Entities.GetUnitName(unit)||"") : "";
        var hasBuildingLevels=shown.wall || /^(main_city|farm|gold_mine)$/.test(buildingId)
            || /^(?:npc_dota_unit_)?building_(main_city|wall|farm|gold_mine)$/.test(unitName);
        // Routed hero-model towers have named stages instead of numbered base-tower names.
        var hasTowerLevels=shown.tower && snapshot && !!snapshot.tower_class;
        if(hasTowerLevels || (!shown.tower && hasBuildingLevels))text("HandoffName",nodes.HandoffName.text+"  LV"+String(level || "1").replace(/^LV\.?\s*/i,""));
        text("HandoffBuildingTitle",nodes.HandoffName.text);
        style(nodes.HandoffBuildingLevel,{visibility:"collapse"});
        if(shown.tree) {
            // Dedicated resource target: full current defense, never player bonus math.
            if(snapshot && Number(snapshot.level)>0) {
                var treeLevel=Math.max(1,Number(snapshot.level)),treeMax=Math.max(treeLevel,Number(snapshot.max_level)||treeLevel);
                text("HandoffBuildingTitle","大树  LV"+treeLevel+" / "+treeMax);
            }
            ["_track","_fill","_valueBounds"].forEach(function(suffix){
                place(nodes["Handoff_hp"+suffix],suffix==="_valueBounds"?24:20,32,g.barWidth-(suffix==="_valueBounds"?16:8),44);
            });
            var armor=snapshot && snapshot.armor;
            var armorSource=ctx.FindChildTraverse("CombatArmorValue");
            text("HandoffBuildingSummary","护甲："+(armor!==undefined && armor!==null && isFinite(Number(armor))?compact(Number(armor)):(armorSource && armorSource.text || "…")));
            place(nodes.HandoffBuildingSummary,20,91,g.centerWidth-40,44);
            style(nodes.HandoffBuildingSummary,{height:"fit-children",minHeight:"0px"});
            style(nodes.HandoffBuildingSummary,{visibility:multi?"collapse":"visible"});
            return;
        }
        if(shown.wall) {
            ["_track","_fill","_valueBounds"].forEach(function(suffix){
                var p=nodes["Handoff_hp"+suffix];place(p,suffix==="_valueBounds"?24:20,211,g.barWidth-(suffix==="_valueBounds"?16:8),44);
            });
        }
        var details=snapshot && snapshot.building_stat_details || {};
        function signed(value){var n=Number(value);return isFinite(n)?(n>=0?"+":"")+compact(n):"\u2026";}
        function bonusText(stat){
            if(details[stat+"_bonus"]===undefined)return "\u2026";
            return signed(details[stat+"_bonus"]);
        }
        function percentText(stat){var pct=Math.round(Number(details[stat+"_pct"]||0)*10)/10;return (pct>=0?"+":"")+pct+"%";}
        if(shown.wall || shown.tower) {
            var stat=shown.wall?"armor":"attack";
            var total=snapshot && Number(shown.wall?snapshot.armor:snapshot.attack_max);
            var base=snapshot && isFinite(total)?compact(total-Number(details[stat+"_bonus"]||0)):"\u2026";
            text("HandoffBuildingSummary",(shown.wall?"\u9632\u5fa1 ":"\u653b\u51fb ")+base);
            text("HandoffBuildingBonus",bonusText(stat));
            text("HandoffBuildingPercent","（"+percentText(stat)+"）");
            var rowWidth=g.centerWidth-40,y=shown.wall?259:239;
            place(buildingStatRow,20,y,rowWidth,44);
            style(buildingStatRow,{visibility:multi?"collapse":"visible",flowChildren:"right"});
            buildingInlineIds.forEach(function(id,index){
                style(nodes[id],{position:"0px 0px 0px",horizontalAlign:"left",verticalAlign:"center",
                    width:"fit-children",minWidth:"0px",height:"fit-children",minHeight:"0px",
                    margin:index===0?"0px":index===3?"0px 0px 0px 18px":"0px 0px 0px 8px",
                    padding:"0px",textAlign:"left",textOverflow:"clip",
                    visibility:multi||(index===3&&!shown.wall)?"collapse":"visible"});
            });
        }
        if(shown.wall) {
            text("HandoffBuildingHealthBonus","");
            text("HandoffBuildingHealthPercent","生命加成（"+percentText("health")+"）");
        }
    }
    function mirror() {
        [["HandoffName","SurvivalHeroName"],["HandoffLevel","SurvivalHeroLevel"],["Handoff_hp_value","SurvivalHeroHealthText"],["Handoff_mp_value","SurvivalHeroManaText"]].forEach(function(a){var source=ctx.FindChildTraverse(a[1]);if(source)text(a[0],source.text);});
        var selectionPortraits=cfg.SurvivalMultiSelectionPortraits;
        var multi=!!(selectionPortraits&&selectionPortraits.IsActive());
        ["HandoffLevelPlate","HandoffLevelBounds"].forEach(function(id){if(valid(nodes[id]))nodes[id].visible=!multi;});
        [["hp","Health"],["mp","Mana"]].forEach(function(a){var source=ctx.FindChildTraverse("SurvivalHero"+a[1]+"Fill");if(source){var fraction=Math.max(0,Math.min(100,parseFloat(source.style.width)||0));style(nodes["Handoff_"+a[0]+"_fill"],{clip:"rect(0%, "+fraction+"%, 100%, 0%)"});}});
        var shown=statVisibility(selectedUnit());
        buildingPresentation(shown,multi);
        updateTowerAuto(shown);
        stats.forEach(function(a,i){
            var visible=shown.lumberjack ? (i===0 || i===2) : !multi && (i<3?shown.combat:shown.attributes);
            style(nodes["HandoffStatIcon_"+a[0]],{visibility:"collapse"});
            ["HandoffStatName_","HandoffStat_"].forEach(function(prefix){
                style(nodes[prefix+a[0]],{visibility:visible?"visible":"collapse"});
            });
            var source=ctx.FindChildTraverse(a[1]);if(source)text("HandoffStat_"+a[0],source.text);
            var snapshot=cfg.HandoffCombat && cfg.HandoffCombat.Snapshot ? cfg.HandoffCombat.Snapshot(selectedUnit()) : null;
            var key=a[0]==="intelligence"?"intellect":a[0];
            var amount=snapshot && snapshot["display_"+key+"_bonus"];
            var hasBonus=visible && shown.attributes && key!=="attack_speed" && amount!==undefined && amount!==null;
            ["HandoffStatBonus_","HandoffStatPercent_"].forEach(function(prefix){style(nodes[prefix+a[0]],{visibility:hasBonus?"visible":"collapse"});});
            if(hasBonus) {
                var total=Number(snapshot[key==="attack"?"attack_max":key]);
                var pct=Math.round(Number(snapshot["display_"+key+"_pct"]||0)*10)/10;
                if(isFinite(total))text("HandoffStat_"+a[0],compact(Math.round((total-Number(amount))*100)/100));
                var rounded=Math.round(Number(amount)*100)/100;
                text("HandoffStatBonus_"+a[0],(rounded>=0?"+":"")+compact(rounded));
                text("HandoffStatPercent_"+a[0],(pct>=0?"+":"")+pct+"%");
            }
        });
        Object.keys(topButtons).forEach(function(id){topButtons[id].enabled=!!available(id);if(id==="survival_shop")style(topButtons[id],{saturation:available(id)?"1":"0",opacity:available(id)?"1":"0.4"});});
        var vipReady=available("vip");
        topButtons.vip.hittest=vipReady;
        style(topButtons.vip,{opacity:vipReady?"1":"0.85"});
        if(topButtons.vip.__vipReady!==vipReady){
            nodes.HandoffNavIcon_vip.SetImage("file://{images}/custom_game/topnav_reference_v2/"+(vipReady?"vip":"vip_locked")+".svg");
            topButtons.vip.__vipReady=vipReady;
        }
        syncActiveNav();
        // Both daily and monthly-pass views are reachable inside the existing welfare window.
        if(available("benefit"))["DailyEntry","PassEntry"].forEach(function(id){style(root.FindChildTraverse(id),{visibility:"collapse"});});
        style(root.FindChildTraverse("HeroCombatDebugPanel"),{visibility:cfg.HandoffShowCombatDebug?"visible":"collapse"});
    }
    function compact(v) {var f=cfg.SurvivalNumberFormatter;return f&&f.Compact?f.Compact(v):f&&f.Format?f.Format(v):String(v===undefined?"—":v);}
    var countdownWave=null;
    function remaining(deadline,fallback) {
        var at=Number(deadline);
        if(isFinite(at)&&at>0&&typeof Game!=="undefined"&&Game.GetGameTime)
            return Math.max(0,Math.ceil(at-Number(Game.GetGameTime())));
        return Math.max(0,Math.ceil(Number(fallback)||0));
    }
    function renderCountdowns(){
        if(!countdownWave)return;
        text("HandoffWave",waveCaption(countdownWave));
        var w=countdownWave,defeated=w.player_defeated===true||Number(w.player_defeated)===1;
        var overflow=!defeated&&(w.overflow_active===true||Number(w.overflow_active)===1);
        text("HandoffEnemyCountdown",overflow?String(remaining(w.overflow_deadline,w.overflow_remaining)):"");
    }
    function waveCaption(wave) {
        var current=Math.max(0,Math.floor(Number(wave.current_wave)||0));
        var total=Math.max(0,Math.floor(Number(wave.total_waves)||0));
        var t=remaining(wave.status==="countdown"?wave.countdown_deadline:0,wave.timer);
        var next=total>0&&current>=total?null:current+1;
        if(wave.status==="archive_challenges"||wave.status==="archive_challenges_pending") {
            if(Number(wave.challenge_saving)===1)return "挑战结束 · 正在保存奖励";
            if(Number(wave.challenge_ended)===1)return "挑战阶段已结束";
            if(!wave.challenge_deadline&&wave.challenge_remaining_seconds===undefined)return "挑战阶段 · 准备中";
            var seconds=remaining(wave.challenge_deadline,wave.challenge_remaining_seconds);
            return "挑战剩余 "+(Math.floor(seconds/60)<10?"0":"")+Math.floor(seconds/60)
                +":"+(seconds%60<10?"0":"")+(seconds%60);
        }
        var waiting=wave.status==="selecting_difficulty"||wave.status==="selecting_mode"||wave.status==="idle";
        var time=next===null||waiting?"—":(Math.floor(t/60)<10?"0":"")+Math.floor(t/60)+":"+(t%60<10?"0":"")+(t%60);
        return "下一波次 "+(next===null?"—":String(next))+"  倒计时 "+time;
    }
    function data(next) {
        if(!next)return;var incoming=Number(next.sequence);if(isFinite(incoming)&&incoming<=sequence)return;if(isFinite(incoming))sequence=incoming;
        var r=next.resources||{},wave=next.wave||{},t=Math.max(0,Math.ceil(Number(wave.timer)||0));
        text("HandoffResource_gold",compact(r.gold));text("HandoffResource_wood",compact(r.wood));text("HandoffResource_population",compact(r.population)+" / "+compact(r.max_population));
        var selected=wave.difficulty_selected===true||Number(wave.difficulty_selected)===1;
        var difficulty=String(wave.difficulty_id||"").toUpperCase();
        text("HandoffDifficulty",selected&&/^N[1-9][0-9]*$/.test(difficulty)?difficulty:"");
        countdownWave=wave;renderCountdowns();
        var alive=Math.max(0,Math.floor(Number(wave.alive)||0)),limit=Number(wave.alive_limit);
        enemyCounter.visible=isFinite(limit)&&limit>0;
        var defeated=wave.player_defeated===true||Number(wave.player_defeated)===1;
        text("HandoffEnemyTitle",defeated?"本局失败":"进攻怪物");
        text("HandoffEnemyValue",defeated?"可继续观战":String(alive)+" / "+(limit>0?Math.floor(limit):"—"));
        var overflow=!defeated&&(wave.overflow_active===true||Number(wave.overflow_active)===1);
        enemyCounter.SetHasClass("EnemyOverflow",overflow);
        enemyCounter.SetHasClass("EnemyDefeated",defeated);
        enemyCountdown.visible=overflow;
        // Only a number is rendered. The server owns both time and defeat.
        text("HandoffEnemyCountdown",overflow?String(remaining(wave.overflow_deadline,wave.overflow_remaining)):"");
    }
    function refreshNow() {if(!valid(ctx)||cfg.HandoffGeneration!==generation)return;try{
        if(cfg.SurvivalPortraitPresentation && cfg.SurvivalPortraitPresentation.RefreshLocalHeroPortrait)
            cfg.SurvivalPortraitPresentation.RefreshLocalHeroPortrait(root);
        layout();
        if(ready&&cfg.SurvivalPortraitPresentation)cfg.SurvivalPortraitPresentation.Refresh(native("PortraitGroup"));
        refreshInventoryPresentation();
        if(ready&&cfg.SurvivalMultiSelectionPortraits)cfg.SurvivalMultiSelectionPortraits.Apply(native("PortraitGroup"),geometry.portraitSize);
        // Native images can be created one frame AFTER the slot parent. Reacquire them.
        if(ready){fitNativeSkills(geometry);var inv=native("inventory");if(valid(inv))for(var j=0;j<6;j++){var item=inv.FindChildTraverse("inventory_slot_"+j);if(valid(item)){square(item);style(item,{marginRight:"5px"});}}}
        if(cfg.SurvivalProductionHUD){
            var productionHeight=cfg.SurvivalProductionHUD.Refresh(geometry,selectedUnit(),ready,currentEntries);
            if(ready&&geometry){
                place(native("buffs"),geometry.heroWidth+10,(geometry.heroWidth===0?-82:-42)-productionHeight,geometry.centerWidth-20,40);
                place(native("debuffs"),geometry.heroWidth+10,(geometry.heroWidth===0?-126:-86)-productionHeight,geometry.centerWidth-20,40);
            }
        }
        if(cfg.SurvivalMinimapShortcuts)cfg.SurvivalMinimapShortcuts.Refresh(geometry,ready);
        mirror();mirrorKeys();revealWhenStable();}catch(e){$.Warning("[HANDOFF_HUD] "+e);}}
    function tick(){if(!valid(ctx)||cfg.HandoffGeneration!==generation)return;renderCountdowns();refreshNow();$.Schedule(.1,tick);}
    cfg.HandoffBoundValuesChanged=function(){if(cfg.HandoffGeneration===generation&&valid(ctx))mirror();};
    // HANDOFF_REFRESH_COALESCED: notifications are not geometry invalidations.
    // Native panel validity + unit/ability handles in layout() own invalidation.
    var refreshQueued=false, eventUnit=selectedUnit();
    function refreshFromEvent(){
        if(cfg.HandoffGeneration!==generation||!valid(ctx))return;
        var unit=selectedUnit();
        if(unit!==eventUnit){eventUnit=unit;if(cfg.HandoffCombat)cfg.HandoffCombat.RefreshSelection();}
        refreshNow();
    }
    ["dota_player_update_selected_unit","dota_player_update_query_unit","dota_ability_changed"].forEach(function(event){GameEvents.Subscribe(event,function(payload){
        if(cfg.HandoffGeneration!==generation)return;
        var pid=payload&&(payload.PlayerID!==undefined?payload.PlayerID:payload.player_id!==undefined?payload.player_id:payload.playerid);
        if(pid!==undefined&&Number(pid)!==Number(Game.GetLocalPlayerID()))return;
        // Update real selection immediately; native children may arrive next frame.
        if(selectedUnit()!==eventUnit)refreshFromEvent();
        if(refreshQueued)return;refreshQueued=true;
        $.Schedule(0,function(){refreshQueued=false;refreshFromEvent();});
    });});
    GameEvents.Subscribe("survival_ui_private_snapshot",data);
    cfg.SurvivalMainHUD={Inspect:function(){return {nativeReady:ready,presented:presented,missing:missing,geometry:geometry,unit:selectedUnit(),abilities:currentEntries.map(function(e){return e.name;}),name:nodes.HandoffName.text,hp:nodes.Handoff_hp_value.text,keys:skillPanels.map(function(p,i){var b=nodes["HandoffKey_"+i+"Bounds"];return b&&b.visible?nodes["HandoffKey_"+i].text:"";}),version:"compact_workers_20260928",sequence:sequence};}};
    if(Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand) {
        // Tools-only visual review opens existing windows without activating purchases or rewards.
        var windowReview="survival_window_review_"+Date.now(),reviewClose=null;
        Game.AddCommand(windowReview,function(){
            var args=Array.prototype.slice.call(arguments),id=String(args[args.length-1]||"");
            if(id==="nav"){
                var captions=nav.map(function(a){return ["HandoffNavCaption_"+a[0],"HandoffNavIcon_"+a[0]];});
                captions.push(["HandoffCombatEffectsText","HandoffEffectsIcon"]);
                $.Msg("[NAV_TEXT_ALIGNMENT] "+JSON.stringify(captions.map(function(ids){var t=nodes[ids[0]],icon=nodes[ids[1]];
                    return {id:ids[0],text:t.text,xy:t.GetPositionWithinWindow(),width:t.actuallayoutwidth,height:t.actuallayoutheight,
                        font:t.style.fontSize,iconXY:icon.GetPositionWithinWindow(),iconWidth:icon.actuallayoutwidth};})));
                return;
            }
            if(id==="inspect"){
                function dump(p,depth){if(!valid(p)||depth<0)return;var xy=p.GetPositionWithinWindow();
                    $.Msg("[WINDOW_LIVE_STYLE] "+JSON.stringify({id:p.id,type:p.paneltype,xy:xy,w:p.actuallayoutwidth,h:p.actuallayoutheight,
                        unified:p.BHasClass("UnifiedWindow"),frame:p.BHasClass("RHFrame"),bg:p.style.backgroundColor,image:p.style.backgroundImage,
                        margin:p.style.marginRight,color:p.style.color,visibility:p.style.visibility,visible:p.visible,revision:p._rhSurvivalShop}));
                    if(depth>0)p.Children().forEach(function(c){dump(c,depth-1);});}
                $.Msg("[WINDOW_HELPER_VERSION] "+JSON.stringify({dark:String(cfg.RemainingHandoff.Window).indexOf("UnifiedWindow")>=0,
                    shop:String(cfg.RemainingHandoff.SurvivalShopWindow).indexOf("archive_dark_v6")>=0,pass:String(cfg.RemainingHandoff.DailyPass).indexOf("UnifiedPassActive")>=0}));
                ["CustomShopWindow","TreasureCards","DailyClaim","DailyPassStatus"].forEach(function(key){dump(root.FindChildTraverse(key),key==="CustomShopWindow"?3:1);});return;
            }
            if(id==="close"){if(reviewClose)reviewClose();reviewClose=null;return;}
            if(["treasure","benefit","lottery","shop","survival_shop"].indexOf(id)<0)return;
            var entry=actions[id],api=entry&&cfg[entry[0]];
            if(!api || typeof api[entry[1]]!=="function")return;
            if(reviewClose)reviewClose();
            api[entry[1]]();
            reviewClose=typeof api.Close==="function"?function(){api.Close();}:
                typeof api.CloseShop==="function"?function(){api.CloseShop();}:
                id==="survival_shop"?function(){api.ToggleShop();}:null;
        },"Open existing windows for read-only style review",0);
        $.Msg("[WINDOW_STYLE_REVIEW] "+windowReview);
        var workerInspect="survival_worker_hud_inspect_"+Date.now();
        Game.AddCommand(workerInspect,function(){
            var visibility={};
            ["HandoffPortraitFrame","HandoffInventoryBase","Handoff_hp_track","Handoff_mp_track","HandoffStat_attack","HandoffStat_armor","HandoffStat_attack_speed"].forEach(function(id){visibility[id]=nodes[id] && String(nodes[id].style.visibility);});
            $.Msg("[WORKER_HUD_INSPECT] ",JSON.stringify({hud:cfg.SurvivalMainHUD.Inspect(),kind:statVisibility(selectedUnit()),title:nodes.HandoffBuildingTitle.text,visibility:visibility}));
        },"Inspect compact worker HUD",0);
        var inspectCommand="survival_hud_bonus_inspect_"+Date.now();
        Game.AddCommand(inspectCommand,function(){
            function details(p){if(!valid(p))return null;var chain=[],a=p;while(a){chain.push({id:a.id,hit:a.hittest,children:a.hittestchildren});a=a.GetParent();}
                return {text:p.text,visibility:p.style.visibility,position:p.GetPositionWithinWindow(),width:p.actuallayoutwidth,height:p.actuallayoutheight,chain:chain};}
            $.Msg("[HUD_BONUS_INSPECT] ",JSON.stringify({name:details(statVisibility(selectedUnit()).building?nodes.HandoffBuildingTitle:nodes.HandoffName),amount:details(nodes.HandoffBuildingBonus),percent:details(nodes.HandoffBuildingPercent),hero:details(nodes.HandoffStatPercent_attack),map:details(native("minimap")),side:details(native("GlyphScanContainer")),source:buildingBonusHelp(),cursor:GameUI.GetCursorPosition(),lastTooltip:cfg.HandoffLastTooltip}));
        },"Inspect bonus hit paths and map layout",0);
        $.Msg("[HUD_BONUS_COMMAND] ",inspectCommand);
    }
    data(CustomNetTables.GetTableValue("survival_ui_state","player_"+Game.GetLocalPlayerID()));tick();
    // Initial load/reload needs one authoritative deadline snapshot, not a polling loop.
    $.Schedule(0,function(){
        if(valid(ctx)&&cfg.HandoffGeneration===generation&&Game.GetLocalPlayerID()>=0)
            GameEvents.SendCustomGameEventToServer("ui_request_full_snapshot",{request_id:"hud_clock_init_"+generation});
    });
})();
