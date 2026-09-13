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
    function place(p,x,y,w,h) {style(p,{transitionDuration:"0s",horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",position:x+"px "+y+"px 0px",width:w+"px",height:h+"px"});}
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
    function art(parent,id,key) {if(key==="top_gold"||key==="top_wood"||key==="top_population"){
 var resource=create("Panel",parent,id,false);
 function part(x,y,w,h,values){var q=create("Panel",resource,"",false);place(q,x,y,w,h);style(q,values);return q;}
 if(key==="top_gold"){
 part(4,4,24,24,{border:"2px solid #ffdf76",borderRadius:"50%",backgroundColor:"#dba332"});
 part(8,8,16,16,{border:"1px solid #fff0ad",borderRadius:"50%"});
 part(14,11,4,10,{backgroundColor:"#ffe69a",borderRadius:"1px"});
 }else if(key==="top_population"){
 part(18,14,10,13,{backgroundColor:"#638e9c",border:"1px solid #bcd6cc",borderRadius:"5px 5px 2px 2px"});
 part(19,6,8,8,{backgroundColor:"#d9bb7b",border:"1px solid #f0d99e",borderRadius:"50%"});
 part(5,15,16,14,{backgroundColor:"#88b4aa",border:"1px solid #d3e0bd",borderRadius:"7px 7px 3px 3px"});
 part(8,3,10,11,{backgroundColor:"#e6c686",border:"1px solid #fff0bc",borderRadius:"50%"});
 }else{
 part(11,6,13,23,{border:"1px solid #d2c38d",borderRadius:"3px",backgroundColor:"#68894e",transform:"rotateZ(35deg)"});
 part(15,8,2,14,{backgroundColor:"#b3c57c",transform:"rotateZ(35deg)"});
 part(5,19,13,10,{border:"1px solid #f1d59d",borderRadius:"50%",backgroundColor:"#c39b61",transform:"rotateZ(35deg)"});
 part(9,22,5,4,{border:"1px solid #765c37",borderRadius:"50%",transform:"rotateZ(35deg)"});
 part(3,5,8,12,{border:"1px solid #bbdc8c",borderRadius:"80% 5% 80% 5%",backgroundColor:"#78b753",transform:"rotateZ(-25deg)"});
 }
 return resource;}if(key==="slot_frame")return uniformSlotFrame(parent,id);var p=create("Image",parent,id,false);p.SetImage("file://{images}/"+assets[key].file);return p;}
    function label(parent,id,cls) {var p=create("Label",parent,id,false);p.text="";if(cls)p.AddClass(cls);style(p,{fontFamily:'"Source Han Sans SC"',color:"#f3ebd4",fontSize:"23px",whiteSpace:"nowrap",textOverflow:"shrink",zIndex:"5"});return p;}
    function centered(parent,id,x,y,w,h,fontSize) {
        var bounds=nodes[id+"Bounds"];
        if(!bounds){bounds=create("Panel",parent,id+"Bounds",false);label(bounds,id,"HandoffNumber");}
        place(bounds,x,y,w,h);style(bounds,{zIndex:"5"});
        style(nodes[id],{position:"0px 0px 0px",width:"fit-children",height:"fit-children",maxWidth:"100%",horizontalAlign:"center",verticalAlign:"center",textAlign:"center",fontSize:fontSize+"px"});
        return nodes[id];
    }
    function text(id,value) {var p=nodes[id];if(p&&p.text!==String(value))p.text=String(value);}
    function tooltip(p,value) {p.SetPanelEvent("onmouseover",function(){$.DispatchEvent("DOTAShowTextTooltip",p,typeof value==="function"?value():value);});p.SetPanelEvent("onmouseout",function(){$.DispatchEvent("DOTAHideTextTooltip");});}
    function notice(value) {var serial=++noticeSerial;text("HandoffNotice",value);nodes.HandoffNotice.visible=true;$.Schedule(4,function(){if(valid(host)&&serial===noticeSerial)nodes.HandoffNotice.visible=false;});}
    function blocked() {return cfg.SurvivalUILayers && cfg.SurvivalUILayers.Top();}
    function forward(id) {var p=native(id);if(!valid(p))return false;$.DispatchEvent("Activated",p,"mouse");return true;}
    var actions={treasure:["SurvivalTreasure","Toggle"],archive:["SurvivalArchive","Toggle"],equipment:["SurvivalEquipment","Toggle"],
        lottery:["SurvivalLottery","Open"],benefit:["SurvivalDaily","Open"],appearance:["SurvivalAppearance","Toggle"]};
    function available(id) {if(id==="return")return valid(native("DashboardButton"));if(id==="settings")return valid(native("SettingsRebornButton"))||valid(native("SettingsButton"));if(id==="social")return true;var a=actions[id];return !!(a&&cfg[a[0]]&&typeof cfg[a[0]][a[1]]==="function");}
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
    var top=create("Panel",host,"HandoffTop",true);top.hittest=false;top.AddClass("HandoffCanvas");
    place(art(top,"HandoffTopBackdrop","top_top_soft_black_backdrop"),0,0,1672,941);
    var nav=[["return","返回"],["treasure","宝物"],["archive","存档"],["lottery","抽奖"],["benefit","福利"]];
    nav.forEach(function(a,i){var b=create("Button",top,"HandoffNav_"+a[0],true);b.AddClass("HandoffNav");place(b,10+i*58,3,64,64);place(art(b,"","top_"+a[0]+"_64"),0,0,64,64);tooltip(b,a[1]);b.SetPanelEvent("onactivate",function(){activate(a[0]);});topButtons[a[0]]=b;});
    function topMetric(id,key,x,textX,textWidth){
        var row=create("Panel",top,id+"Row",false);place(row,x,14,textX-x+textWidth,44);
        var icon=art(row,id+"Icon",key);place(icon,0,0,32,32);style(icon,{verticalAlign:"center"});
        var value=label(row,id);place(value,textX-x,0,textWidth,44);
        style(value,{height:"fit-children",verticalAlign:"center"});
        if(id.indexOf("HandoffResource_")===0)style(value,{transform:"translateY(4px)"});
    }
    topMetric("HandoffWave","top_wave",734,779,218);
    [["gold",1194,1234],["wood",1339,1379],["population",1484,1524]].forEach(function(a){topMetric("HandoffResource_"+a[0],"top_"+a[0],a[1],a[2],105);});
    var social=create("Panel",top,"HandoffSocial",true);social.AddClass("HandoffSocial");place(social,474,70,192,130);social.visible=false;
    [["SharedUnitsButton","共享单位"],["SharedContentButton","共享内容"],["CombatLogButton","战斗日志"]].forEach(function(a){var b=create("Button",social,"",true);label(b,"","").text=a[1];b.SetPanelEvent("onactivate",function(){if(!blocked()){if(!forward(a[0]))notice(a[1]+"当前不可用");social.visible=false;}});});
    place(label(top,"HandoffNotice"),18,112,480,55);nodes.HandoffNotice.visible=false;
    var bottom=create("Panel",host,"HandoffBottom",false);bottom.AddClass("HandoffCanvas");bottom.visible=false;
    var background=create("Panel",bottom,"HandoffBackground",false);
    cfg.HandoffDecoration=background;
    place(art(background,"HandoffHeroBase","hero_base"),0,0,453,330);
    var center=create("Panel",bottom,"HandoffCenter",false);
    var inventory=art(background,"HandoffInventoryBase","inventory_base");
    place(art(bottom,"HandoffPortraitFrame","portrait_frame"),29,49,264,264);
    place(art(bottom,"HandoffNamePlate","name_plate"),27,0,264,51);
    // The approved sprite has a dark outermost right column; keep the gold rim,
    // clipping only that source-pixel fringe. No bitmap is rewritten.
    style(nodes.HandoffNamePlate,{clip:"rect(0%, 99.1%, 100%, 0%)"});
    centered(bottom,"HandoffName",34,5,250,40,27);
    style(nodes.HandoffName,{fontFamily:'"Source Han Serif SC"',fontWeight:"bold",fontSize:"27px",textAlign:"center"});
    place(art(bottom,"HandoffLevelPlate","level_plate"),16,229,81,81);
    centered(bottom,"HandoffLevel",20,241,73,50,33);
    stats.forEach(function(a,i){place(art(bottom,"","stat_"+a[0]),309,66+i*41,43,39);place(label(bottom,"HandoffStat_"+a[0]),366,70+i*41,76,35);});
    ["hp","mp"].forEach(function(type){art(center,"Handoff_"+type+"_track",type+"_track");art(center,"Handoff_"+type+"_fill",type+"_fill");label(center,"Handoff_"+type+"_value","HandoffNumber");style(nodes["Handoff_"+type+"_value"],{fontSize:"30px",textAlign:"center"});});
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
    function fitNativeSkills(){
        var list=native("abilities");if(!valid(list))return;
        var candidates=[];
        for(var i=0;i<list.GetChildCount();i++){var p=list.GetChild(i);if(!/^Ability\d+$/.test(p.id))continue;
            // Include our collapsed overflow slots without showing and hiding them every tick.
            if(p.__handoffOverflow||(p.visible!==false&&String(p.style.visibility)!=="collapse"))candidates.push(p);
        }
        skillPanels=candidates.slice(0,currentEntries.length);
        candidates.forEach(function(p,index){if(index>=currentEntries.length){style(p,{visibility:"collapse",width:"0px",marginRight:"0px"});p.__handoffOverflow=true;}else{if(p.__handoffOverflow){style(p,{visibility:"visible"});p.__handoffOverflow=false;}square(p);style(p,{marginRight:"4px"});}});
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
        ["AbilityImage","ItemImage"].forEach(function(id){var p=slot.FindChildTraverse(id);if(valid(p)){place(p,6,6,104,104);style(p,{transform:"none"});}});
        ["Cooldown","CooldownOverlay"].forEach(function(id){var p=slot.FindChildTraverse(id);if(valid(p))place(p,6,6,104,104);});
        var keyContainer=slot.FindChildTraverse("HotkeyContainer"),key=slot.FindChildTraverse("Hotkey");
        if(valid(keyContainer)){place(keyContainer,3,85,43,31);style(keyContainer,{backgroundImage:"none",border:"0px",minWidth:"0px",minHeight:"0px"});}
        if(valid(key)){place(key,valid(keyContainer)?0:3,valid(keyContainer)?0:85,43,31);style(key,{backgroundImage:'url("file://{images}/'+assets.key_plate.file+'")',backgroundSize:"100% 100%",border:"0px",minWidth:"0px",minHeight:"0px"});}
        child(slot,"HotkeyText",{fontFamily:'"Source Han Sans SC"',fontSize:"25px",margin:"0px",textAlign:"center"});
        if(String(slot.id||"").indexOf("inventory_slot_")===0)["ButtonSize","ButtonWell"].forEach(function(id){child(slot,id,{boxShadow:"none"});});
        // These are decorative only. Keep active/cooldown/disabled/drag overlays intact.
        ["AbilityBevel","ShineContainer","PassiveAbilityBorder"].forEach(function(id){child(slot,id,{opacity:"0"});});
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
        // Remove the previous corner cover, including panels surviving a HUD reload.
        var legacyCorner=portrait.FindChildTraverse("HandoffPortraitCornerCover");
        if(valid(legacyCorner)&&!legacyCorner._removing){
            legacyCorner._removing=true;legacyCorner.visible=false;
            legacyCorner.hittest=false;legacyCorner.hittestchildren=false;
            legacyCorner.DeleteAsync(0);
        }
        // End legacy corner cleanup.

        ["portraitHUD","portraitHUDOverlay"].forEach(function(id){place(native(id),0,0,g.portraitSize,g.portraitSize);style(native(id),{transform:"none"});});
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
        fitNativeSkills();
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
        place(native("buffs"),g.heroWidth+10,-42,g.centerWidth-20,40);place(native("debuffs"),g.heroWidth+10,-86,g.centerWidth-20,40);
        // Live DOTAMinimap stays native; no reference screenshot or old custom frame is used.
        var map=native("minimap_container"),mini=native("minimap_block"),size=g.minimapSize;
        style(map,{width:(size+12)+"px",height:(size+12)+"px",horizontalAlign:"left",verticalAlign:"bottom",margin:"0px 0px 6px 6px",transform:"none",overflow:"noclip"});
        place(mini,0,0,size,size);style(mini,{transform:"none",backgroundImage:"none"});place(native("minimap"),0,0,size,size);style(native("minimap"),{transform:"none"});
        ["ArchiveEntry","TreasureEntry","LotteryButton"].forEach(function(id){style(root.FindChildTraverse(id),{visibility:"collapse"});});
        return true;
    }
    function layout() {
        var w=(ctx.actuallayoutwidth||1672)/(ctx.actualuiscale_x||1),h=(ctx.actuallayoutheight||941)/(ctx.actualuiscale_y||1);
        var topScale=Math.min(w/1672,h/941);place(top,(w-1672*topScale)/2,0,1672,941);style(top,{transform:"scale3d("+topScale+","+topScale+",1)"});
        var backdropBleed=(w-1672*topScale)/(2*topScale)+24;
        place(nodes.HandoffTopBackdrop,-backdropBleed,0,1672+backdropBleed,941);
        var count=abilityCount(),g=cfg.HandoffGeometry(w,h,count);
        var signature=[w,h,count,selectedUnit(),currentEntries.map(function(e){return e.ability;}).join(",")].join(":");
        // Reapply when the engine rebuilds its native HUD, even without a selection event.
        if(signature!==lastSignature||!ready||!valid(natives.abilities)||!valid(natives.inventory)) {
            ready=nativeLayout(g);if(!ready){bottom.visible=false;return;}
            lastSignature=signature;geometry=g;canvas(bottom,g);bottom.hittestchildren=false;
            place(center,g.heroWidth,23,g.centerWidth,307);nine(background,"HandoffCenterPlate","center_base",g.heroWidth,23,g.centerWidth,307,18,20);
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
    function mirror() {
        [["HandoffName","SurvivalHeroName"],["HandoffLevel","SurvivalHeroLevel"],["Handoff_hp_value","SurvivalHeroHealthText"],["Handoff_mp_value","SurvivalHeroManaText"]].forEach(function(a){var source=ctx.FindChildTraverse(a[1]);if(source)text(a[0],source.text);});
        [["hp","Health"],["mp","Mana"]].forEach(function(a){var source=ctx.FindChildTraverse("SurvivalHero"+a[1]+"Fill");if(source){var fraction=Math.max(0,Math.min(100,parseFloat(source.style.width)||0));style(nodes["Handoff_"+a[0]+"_fill"],{clip:"rect(0%, "+fraction+"%, 100%, 0%)"});}});
        stats.forEach(function(a){var source=ctx.FindChildTraverse(a[1]);if(source)text("HandoffStat_"+a[0],source.text);});
        Object.keys(topButtons).forEach(function(id){topButtons[id].enabled=!!available(id);});
        // Both daily and monthly-pass views are reachable inside the existing welfare window.
        if(available("benefit"))["DailyEntry","PassEntry"].forEach(function(id){style(root.FindChildTraverse(id),{visibility:"collapse"});});
        style(root.FindChildTraverse("HeroCombatDebugPanel"),{visibility:cfg.HandoffShowCombatDebug?"visible":"collapse"});
    }
    function compact(v) {var f=cfg.SurvivalNumberFormatter;return f&&f.Compact?f.Compact(v):String(v===undefined?"—":v);}
    function data(next) {
        if(!next)return;var incoming=Number(next.sequence);if(isFinite(incoming)&&incoming<=sequence)return;if(isFinite(incoming))sequence=incoming;
        var r=next.resources||{},wave=next.wave||{},t=Math.max(0,Math.ceil(Number(wave.timer)||0));
        text("HandoffResource_gold",compact(r.gold));text("HandoffResource_wood",compact(r.wood));text("HandoffResource_population",compact(r.population)+" / "+compact(r.max_population));
        var n=Number(wave.current_wave||0),m=Math.floor(t/60);text("HandoffWave",(n<10?"0":"")+n+" · "+(m<10?"0":"")+m+":"+(t%60<10?"0":"")+t%60);
    }
    function refreshNow() {if(!valid(ctx)||cfg.HandoffGeneration!==generation)return;try{layout();
        // Native images can be created one frame AFTER the slot parent. Reacquire them.
        if(ready){fitNativeSkills();var inv=native("inventory");if(valid(inv))for(var j=0;j<6;j++){var item=inv.FindChildTraverse("inventory_slot_"+j);if(valid(item)){square(item);style(item,{marginRight:"5px"});}}}
        mirror();mirrorKeys();revealWhenStable();}catch(e){$.Warning("[HANDOFF_HUD] "+e);}}
    function tick(){if(!valid(ctx)||cfg.HandoffGeneration!==generation)return;refreshNow();$.Schedule(.1,tick);}
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
    cfg.SurvivalMainHUD={Inspect:function(){return {nativeReady:ready,presented:presented,missing:missing,geometry:geometry,unit:selectedUnit(),abilities:currentEntries.map(function(e){return e.name;}),name:nodes.HandoffName.text,hp:nodes.Handoff_hp_value.text,keys:skillPanels.map(function(p,i){var b=nodes["HandoffKey_"+i+"Bounds"];return b&&b.visible?nodes["HandoffKey_"+i].text:"";}),version:"aligned_release_v18",sequence:sequence};}};
    data(CustomNetTables.GetTableValue("survival_ui_state","player_"+Game.GetLocalPlayerID()));tick();
})();
