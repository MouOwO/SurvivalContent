// The custom gold HUD owns portrait framing. Native status/blur layers are
// siblings of DOTAPortrait, so hiding the portrait itself does not hide them.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    var portraitIdentity = null, backdropCache = {};
    function setSnapshot(snapshot) {
        portraitIdentity = snapshot ? {entindex:Number(snapshot.entindex),
            portrait_unit_name:String(snapshot.portrait_unit_name || ""),
            model_asset_id:String(snapshot.model_asset_id || ""),
            portrait_model_name:String(snapshot.portrait_model_name || "")} : null;
    }
    function currentBackdrop() {
        var palette = cfg.SurvivalPortraitPalette || {}, entity = selectedEntity(), unitName = "";
        if (typeof Entities !== "undefined" && Entities.GetUnitName && entity >= 0) {
            try { unitName = Entities.GetUnitName(entity) || ""; } catch (error) {}
        }
        var identity = portraitIdentity && portraitIdentity.entindex === entity ? portraitIdentity : {};
        var heroes = palette.heroes || {}, assets = palette.assets || {}, units = palette.units || {}, models = palette.models || {};
        var color = heroes[identity.portrait_unit_name] || models[identity.portrait_model_name] || assets[identity.model_asset_id]
            || heroes[unitName] || units[unitName] || palette.defaultColor || "#29424b";
        if (!backdropCache[color]) {
            var rgb = [1,3,5].map(function(i){return parseInt(color.substr(i,2),16);});
            function shade(factor) {return "#" + rgb.map(function(value){
                var hex=Math.round(value*factor).toString(16);return hex.length<2?"0"+hex:hex;
            }).join("");}
            // Hue behind the head, shaded towards the lower corner like Valve's
            // portrait lighting. No opaque slate image may cover this fill.
            backdropCache[color] = "gradient(linear, 0% 0%, 100% 100%, from(" + color
                + "), color-stop(0.55, " + shade(.55) + "), to(" + shade(.20) + "))";
        }
        return {color:color, fill:backdropCache[color], entity:entity, unit:unitName,
            portrait:identity.portrait_unit_name || "", asset:identity.model_asset_id || "", model:identity.portrait_model_name || ""};
    }
    function updateBackdropMotes(parent, foreground, backdrop, enabled) {
        if (!valid(parent) || typeof $ === "undefined" || !$.CreatePanel) return;
        var layer=parent.FindChildTraverse("SurvivalPortraitMotes");
        if (valid(layer) && layer.GetParent() !== parent) layer=null;
        if (!enabled) {if(valid(layer)) style(layer,{visibility:"collapse"});return;}
        if (!valid(layer)) {
            layer=$.CreatePanel("Panel",parent,"SurvivalPortraitMotes");
            layer.hittest=false;layer.hittestchildren=false;layer.__motes=[];
            style(layer,{width:"100%",height:"100%",overflow:"clip",zIndex:"-1"});
            if (valid(foreground) && parent.MoveChildBefore) parent.MoveChildBefore(layer,foreground);
            for(var i=0;i<4;i++) {
                var mote=$.CreatePanel("Panel",layer,"");mote.hittest=false;mote.hittestchildren=false;
                layer.__motes.push(mote);
            }
        }
        if (!layer.__motes || layer.__motes.some(function(m){return !valid(m);})) {
            layer.DeleteAsync(0);return;
        }
        style(layer,{visibility:"visible"});
        var rgb=[1,3,5].map(function(i){return parseInt(backdrop.color.substr(i,2),16);});
        var fire=rgb[0]>rgb[1]*1.25 && rgb[0]>rgb[2]*1.5;
        var tint=fire?"#ffc66d":rgb[1]>rgb[0]*1.15?"#a5d878":"#9cc9dd";
        var positions=[7,21,79,92],now=Date.now()/1000;
        layer.__motes.forEach(function(mote,i){
            var phase=(now/(fire?4.8:6.5)+i*.247)%1,progress=Math.min(1,phase/.48);
            var opacity=phase<.48?Math.sin(progress*Math.PI)*(fire?.48:.25):0;
            var x=positions[i]+Math.sin(progress*4+i)*2,y=92-progress*(34+i*3);
            style(mote,{position:x+"% "+y+"% 0px",width:(fire?4:3)+"px",height:(fire?9:4)+"px",
                borderRadius:fire?"70% 30% 65% 35%":"50%",backgroundColor:tint,
                boxShadow:"0px 0px 5px 1px "+tint,opacity:String(opacity),
                transform:"rotateZ("+(fire?(-14+i*9):0)+"deg)"});
        });
    }
    var hiddenIds = ["RightSideHeroBlur", "portraitHUDOverlay",
        "DeathGradient", "PortraitStreakParticle", "PortraitStreakParticleBorder"];
    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function style(panel, values) {
        if (!valid(panel)) return;
        Object.keys(values).forEach(function (key) {
            if (String(panel.style[key]) !== String(values[key])) panel.style[key] = values[key];
        });
    }
    function hide(panel) {
        if (!valid(panel)) return;
        style(panel, {visibility:"collapse", opacity:"0", animationName:"none", transitionDuration:"0s"});
        panel.hittest = false;
        panel.hittestchildren = false;
    }
    var statusHistory = {};
    function selectedEntity() {
        var resolver = cfg.SurvivalSelectionResolver;
        if (resolver && resolver.ResolveDisplayUnit) return Number(resolver.ResolveDisplayUnit());
        return Number(Players.GetLocalPlayerPortraitUnit());
    }
    function updateStatusFaces(group) {
        var entity = selectedEntity(), now = Date.now(), key = String(entity);
        if (!isFinite(entity) || entity < 0) {
            hide(group.FindChildTraverse("SilenceIcon"));
            hide(group.FindChildTraverse("MutedIcon"));
            return;
        }
        var record = statusHistory[key];
        if (!record) record = statusHistory[key] = {seen:now, states:{}};
        record.seen = now;
        // Bound history without resetting the timer when the selected unit or
        // native HUD panel changes. A continuous status is shown only once.
        var keys = Object.keys(statusHistory);
        if (keys.length > 128) {
            keys.sort(function (a,b) {return statusHistory[a].seen-statusHistory[b].seen;});
            delete statusHistory[keys[0]];
        }
        var visibleFace = false;
        [["SilenceIcon","UnitSilenced"],["MutedIcon","UnitMuted"]].forEach(function (entry) {
            var icon = group.FindChildTraverse(entry[0]);
            if (!valid(icon)) return;
            var active = icon.BAscendantHasClass && icon.BAscendantHasClass(entry[1]);
            var previous = record.states[entry[0]];
            if (!active) {
                delete record.states[entry[0]];
                hide(icon);
                return;
            }
            if (!previous) previous = record.states[entry[0]] = {started:now};
            var elapsed = now-previous.started;
            if (elapsed >= 3250 || visibleFace) { hide(icon); return; }
            icon.hittest = false;
            icon.hittestchildren = false;
            style(icon, {visibility:"visible", transitionProperty:"opacity",
                transitionDuration:elapsed < 3000 ? "0s" : "0.25s",
                opacity:elapsed < 3000 ? "1" : "0", animationName:"none"});
            visibleFace = true;
        });
    }
    function refresh(group) {
        if (!valid(group) || !group.FindChildTraverse) return;
        var hudRoot=group;
        while(hudRoot.GetParent && hudRoot.GetParent()) hudRoot=hudRoot.GetParent();
        refreshLocalHeroPortrait(hudRoot);
        hiddenIds.forEach(function (id) { hide(group.FindChildTraverse(id)); });
        updateStatusFaces(group);
        // Equipped Dota HUD skins otherwise draw an additional old-size frame.
        var block = group.GetParent && group.GetParent();
        if (valid(block) && block.FindChildTraverse) {
            hide(block.FindChildTraverse("HUDSkinPortrait"));
            hide(block.FindChildTraverse("HUDSkinXPBackground"));
            // Verified in the running game: the stock XP/badge frame crosses
            // the resized portrait. Our gold level plate already owns this UI.
            hide(block.FindChildTraverse("xp"));
            hide(block.FindChildTraverse("unitbadge"));
        }
        var backdrop = currentBackdrop();
        var container = group.FindChildTraverse("PortraitContainer");
        style(container, {backgroundColor:backdrop.fill, backgroundImage:"none", border:"0px", boxShadow:"none"});
        var nativePortrait = group.FindChildTraverse("portraitHUD");
        // The staging modifier must still prevent spells/items; only its giant
        // native blur is suppressed; status faces expire after three seconds.
        style(nativePortrait, {blur:"gaussian(0)", animationName:"none", transitionProperty:"none"});
        if (valid(nativePortrait) && nativePortrait.FindChildTraverse) {
            ["LowerOverlay", "InspectButton", "ReportUserButton", "HeroViewButton"].forEach(function (id) {
                hide(nativePortrait.FindChildTraverse(id));
            });
        }
        var custom = group.FindChildTraverse("SurvivalTowerPortraitOverlay");
        style(custom, {backgroundColor:backdrop.fill, backgroundImage:"none"});
        var multi=cfg.SurvivalMultiSelectionPortraits;
        var effectsEnabled=backdrop.entity>=0 && !(multi && multi.IsActive && multi.IsActive());
        var customActive=valid(custom) && String(custom.style.visibility)==="visible";
        updateBackdropMotes(container,nativePortrait,backdrop,effectsEnabled && !customActive);
        updateBackdropMotes(custom,valid(custom)&&custom.FindChildTraverse("SurvivalTowerPortraitScene"),backdrop,effectsEnabled && customActive);
    }
    // This is the screen-corner portrait, not the native team scoreboard.
    // Bind to the local player's summoned hero, never the selected unit.
    function refreshLocalHeroPortrait(root) {
        if (!valid(root)) return;
        var image=root.FindChildTraverse("SurvivalLocalHeroPortrait");
        if (!valid(image)) return;
        var portrait=image.FindChildTraverse("SurvivalLocalHeroPortraitImage");
        if (!valid(portrait)) return;
        if (image.__survivalHeroButtonBound !== "single_jump_v1") {
            image.__survivalHeroButtonBound="single_jump_v1";
            image.SetPanelEvent("onactivate",function () {
                var selection=cfg.SurvivalHeroSelection;
                if (selection && selection.Select) selection.Select("top_left_portrait");
            });
        }
        var name="";
        if (typeof Game !== "undefined" && Game.GetLocalPlayerID
            && typeof CustomNetTables !== "undefined" && typeof Entities !== "undefined") {
            var player=Number(Game.GetLocalPlayerID());
            var snapshot=player>=0 ? CustomNetTables.GetTableValue("survival_hero_skills","player_"+player) || {} : {};
            var hero=Number(snapshot.unit_entindex);
            if (Number(snapshot.hero_ready)===1 && isFinite(hero) && hero>=0) {
                try {name=Entities.GetUnitName(hero) || "";} catch(error) {}
            }
        }
        // Same textures as the six ability_summon_* buttons in the hero altar.
        var altarHeroes={npc_dota_hero_axe:"axe",npc_dota_hero_doom_bringer:"doom_bringer",
            npc_dota_hero_nevermore:"nevermore",npc_dota_hero_drow_ranger:"drow_ranger",
            npc_dota_hero_monkey_king:"monkey_king",npc_dota_hero_juggernaut:"juggernaut"};
        var icon=altarHeroes[name],ready=!!icon;
        if (ready && portrait.__survivalHeroIcon!==icon) {
            portrait.SetImage("file://{images}/spellicons/survival/native/portrait_"+icon+".png");
            portrait.__survivalHeroIcon=icon;
        }
        var selection=cfg.SurvivalHeroSelection;
        image.enabled=!!(ready && selection && selection.CanSelect && selection.CanSelect());
        style(image,{visibility:ready ? "visible" : "collapse"});
    }
    // Read-only Tools diagnostic: enumerate the actual portrait and nearby HUD
    // layers. Game bindings are absent in the standalone regression harness.
    function diagnosticRoot() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        return root;
    }
    function eachPortraitPanel(callback) {
        var visited = 0;
        function visit(p) {
            if (!valid(p) || ++visited > 40000) return;
            if (["PortraitGroup","portraitHUD","SurvivalTowerPortraitOverlay","SurvivalTowerPortraitScene","xp","unitbadge"].indexOf(String(p.id))>=0) callback(p);
            (p.Children ? p.Children() : []).forEach(visit);
        }
        visit(diagnosticRoot());
    }
    function inspectPortrait() {
        var root = diagnosticRoot(), group = root.FindChildTraverse("PortraitGroup");
        var corner=root.FindChildTraverse("SurvivalLocalHeroPortrait"),cornerImage=corner && corner.FindChildTraverse("SurvivalLocalHeroPortraitImage");
        $.Msg("[HERO_CORNER_INSPECT] ",JSON.stringify({button:valid(corner)?{type:corner.paneltype,enabled:corner.enabled,visible:corner.visible,visibility:corner.style.visibility,opacity:corner.style.opacity,xy:corner.GetPositionWithinWindow(),width:corner.actuallayoutwidth,height:corner.actuallayoutheight,bound:corner.__survivalHeroButtonBound}:null,
            icon:valid(cornerImage)?{asset:cornerImage.__survivalHeroIcon,visible:cornerImage.visible,width:cornerImage.actuallayoutwidth,height:cornerImage.actuallayoutheight}:null,
            identity:CustomNetTables.GetTableValue("survival_hero_skills","player_"+Game.GetLocalPlayerID()),canSelect:!!(cfg.SurvivalHeroSelection&&cfg.SurvivalHeroSelection.CanSelect()),hud:cfg.SurvivalMainHUD&&cfg.SurvivalMainHUD.Inspect()}));
        $.Msg("[PORTRAIT_BACKDROP] ", JSON.stringify(currentBackdrop()));
        function dump(p, depth) {
            if (!valid(p) || depth > 4) return;
            var data = {id:p.id,type:p.paneltype,depth:depth,visible:p.visible,
                xy:p.GetPositionWithinWindow(),width:p.actuallayoutwidth,height:p.actuallayoutheight,
                opacity:p.style.opacity,visibility:p.style.visibility,z:p.style.zIndex,
                background:p.style.backgroundImage,border:p.style.border,shadow:p.style.boxShadow};
            $.Msg("[PORTRAIT_LIVE_NODE] ",JSON.stringify(data));
            (p.Children ? p.Children() : []).forEach(function (child) {dump(child,depth+1);});
        }
        dump(group,0);
        var block = group && group.GetParent();
        if (block && block.Children) block.Children().forEach(function(p) {
            if (p !== group) $.Msg("[PORTRAIT_LIVE_SIBLING] ",JSON.stringify({id:p.id,type:p.paneltype,
                xy:p.GetPositionWithinWindow(),width:p.actuallayoutwidth,height:p.actuallayoutheight,
                visibility:p.style.visibility,opacity:p.style.opacity,z:p.style.zIndex}));
        });
        eachPortraitPanel(function(p){$.Msg("[PORTRAIT_ALL] ",JSON.stringify({id:p.id,parent:p.GetParent().id,xy:p.GetPositionWithinWindow(),w:p.actuallayoutwidth,h:p.actuallayoutheight,opacity:p.style.opacity,visibility:p.style.visibility}));});
        var visited=0;
        function playerNodes(p) {
            if(!valid(p)||++visited>12000)return;
            if(p.paneltype==="DOTATopBarPlayer" || (p.id==="HeroImage" && p.paneltype==="DOTAHeroImage")) {
                $.Msg("[PLAYER_PORTRAIT_NODE] ",JSON.stringify({id:p.id,type:p.paneltype,parent:p.GetParent().id,
                    hero:p.heroname,player:p.GetAttributeInt?p.GetAttributeInt("player_id",-1):-1,
                    playerid:p.GetAttributeInt?p.GetAttributeInt("playerid",-1):-1,xy:p.GetPositionWithinWindow()}));
            }
            (p.Children?p.Children():[]).forEach(playerNodes);
        }
        playerNodes(root);
        $.Msg("PORTRAIT_LIVE_DUMP_DONE");
    }
    if (typeof Game !== "undefined" && Game.IsInToolsMode && Game.IsInToolsMode()) {
        var probeSuffix = "_" + Date.now();
        $.Msg("[PORTRAIT_PROBE_COMMANDS] suffix=",probeSuffix);
        Game.AddCommand("survival_portrait_inspect"+probeSuffix,inspectPortrait,"Inspect actual portrait layers",0);
        Game.AddCommand("survival_hero_corner_select"+probeSuffix,function () {
            var button=diagnosticRoot().FindChildTraverse("SurvivalLocalHeroPortrait");
            if (valid(button) && button.enabled) $.DispatchEvent("Activated",button,"mouse");
            $.Schedule(0.2,function () {
                $.Msg("[HERO_CORNER_CLICK_TEST] ",JSON.stringify({selected:Players.GetSelectedEntities(Game.GetLocalPlayerID()),
                    hero:Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID()),cameraAPI:typeof GameUI.SetCameraTargetPosition,cameraMode:"single_jump"}));
            });
        },"Activate local hero corner button in Tools",0);
    }
    cfg.SurvivalPortraitPresentation = {Refresh:refresh, SetSnapshot:setSnapshot, InspectBackdrop:currentBackdrop, RefreshLocalHeroPortrait:refreshLocalHeroPortrait};
})();
