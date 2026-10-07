(function () {
    "use strict";
    var table = "survival_hero_health_bar", states = {}, panels = {}, effects = {};
    var host = $("#SurvivalWorldTitles");
    var assets = {peak_perfection:"file://{images}/custom_game/titles/peak_clean_letters.png"};
    var series=GameUI.CustomUIConfig().SurvivalTitleSeriesArt;
    if(series)Object.keys(series.Config).forEach(function(id){assets[id]=series.Config[id].asset;});
    var WIDTH=224, HEIGHT=96, MAX_EMBERS=18, DRAGON_OVERHANG=44;
    var diagnostics = {};
    function clock() {
        return typeof Game.GetGameTime === "function" ? Number(Game.GetGameTime()) : Date.now()/1000;
    }
    // Stable per-player phase: switching heroes/titles does not restart the light.
    // Keep movement trails on real game time so their lifetime is unaffected.
    function phaseOffset(key,state) {
        var id=Number(state.player_id);
        if(state.player_id===undefined || !isFinite(id) || id<0) id=Number(String(key).replace("title_",""));
        if(!isFinite(id) || id<0) id=0;
        return Math.floor(id)*1.137;
    }
    function make(type,parent,cls) {
        var panel=$.CreatePanel(type,parent,"");panel.AddClass(cls);
        panel.hittest=false;panel.hittestchildren=false;return panel;
    }
    function clearTrail(fx) {
        if (!fx) return;
        fx.lastOrigin=null;fx.lastTime=null;fx.credit=0;
        fx.pool.forEach(function(p){p.active=false;p.panel.visible=false;});
    }
    function resetCrowd(fx) {
        if(fx)fx.crowd={opacity:1,release:0,lastTime:null,accepted:false,blocked:false,reason:""};
    }
    function hide(key, reason) {
        diagnostics[key] = reason || "hidden";
        if (panels[key]) panels[key].visible=false;
        clearTrail(effects[key]);resetCrowd(effects[key]);
    }
    function remove(key) {
        if (effects[key]) effects[key].pool.forEach(function(p){p.panel.DeleteAsync(0);});
        if (panels[key]) panels[key].DeleteAsync(0);
        delete panels[key];delete states[key];delete effects[key];
    }
    function create(key,titleId) {
        var root=make("Panel",host,"SurvivalWorldTitle");root.visible=false;
        var isSeries=!!(series && series.Config[titleId]);
        var layers=isSeries?series.Create(root,titleId,true):GameUI.CustomUIConfig().SurvivalTitleLayeredArt.Create(root,true);
        var art=layers.art,mask=layers.mask,sweep=layers.sweep;
        var stars=[];
        (isSeries?[]:[[0.13,0.48],[0.85,0.49],[0.30,0.32],[0.69,0.64],[0.46,0.58],[0.59,0.28]]).forEach(function(pos,i){
            var star=make("Panel",root,"SurvivalTitleStar");
            make("Panel",star,"SurvivalTitleStarHorizontal");make("Panel",star,"SurvivalTitleStarVertical");
            stars.push({panel:star,x:pos[0],y:pos[1],phase:i*1.137});
        });
        panels[key]=root;
        effects[key]={layers:layers,art:art,mask:mask,sweep:sweep,stars:stars,pool:[],credit:0,lastOrigin:null,lastTime:null,serial:0};
        resetCrowd(effects[key]);
        return root;
    }
    function receive(name,key,value) {
        if (name!==table || key.indexOf("title_")!==0) return;
        if (!value || !assets[value.title_id] || Number(value.entindex)<0) {remove(key);return;}
        if (states[key] && states[key].title_id!==value.title_id) remove(key);
        if (states[key] && (Number(states[key].entindex)!==Number(value.entindex) || states[key].render_mode!==value.render_mode)) {clearTrail(effects[key]);resetCrowd(effects[key]);}
        states[key]=value;
        if (!panels[key] && host) create(key,value.title_id);
        if (effects[key]) {
            if(!effects[key].layers.motion) effects[key].art.SetImage(assets[value.title_id]);
            effects[key].art.visible=true;
            effects[key].mask.visible=true;
        }
    }
    function position(panel,x,y) {panel.style.position=x.toFixed(2)+"px "+y.toFixed(2)+"px 0px";}
    function sparkle(fx,now) {
        // One downward pass every three seconds; rest at normal brightness.
        // The light and glints share a clock so there are no stray random flashes.
        var cycle=((now%3)+3)%3, duration=0.9, active=cycle<duration;
        var travel=HEIGHT+48, progress=cycle/duration;
        fx.art.style.brightness="1";
        fx.sweep.style.transform="translateY("+(-24+travel*progress).toFixed(2)+"px)";
        fx.sweep.style.opacity=active?(0.65*Math.min(1,cycle/0.12,(duration-cycle)/0.12)).toFixed(3):"0";
        fx.stars.forEach(function(star){
            var arrival=(star.y*HEIGHT+24)/travel*duration;
            var pulse=active?0.55*Math.pow(Math.max(0,1-Math.abs(cycle-arrival)/0.12),2):0;
            star.panel.style.opacity=pulse.toFixed(3);
            star.panel.style.transform="scale3d("+(0.45+pulse*1.1).toFixed(3)+", "+(0.45+pulse*1.1).toFixed(3)+", 1) rotateZ(12deg)";
            position(star.panel,star.x*WIDTH-10,star.y*HEIGHT-10);
        });
    }
    function spawn(fx,world,side,now) {
        var slot=null,i;
        for (i=0;i<fx.pool.length;i++) if (!fx.pool[i].active) {slot=fx.pool[i];break;}
        if (!slot) {
            if (fx.pool.length>=MAX_EMBERS) return;
            slot={panel:make("Panel",host,"SurvivalTitleEmber")};fx.pool.push(slot);
        }
        fx.serial++;
        slot.active=true;slot.born=now;slot.life=0.48+Math.random()*0.42;
        slot.world=[world[0],world[1],world[2]];
        slot.x=WIDTH/2+side*(WIDTH*0.39+Math.random()*8);
        slot.y=HEIGHT*0.55+Math.random()*10;
        slot.vx=side*(8+Math.random()*18);slot.vy=3+Math.random()*24;
        slot.angle=Math.random()*160;slot.spin=(Math.random()-0.5)*120;
        slot.size=fx.serial%5===0?4:2+Math.random()*1.5;
        slot.panel.style.width=slot.size.toFixed(2)+"px";
        slot.panel.style.height=(fx.serial%3===0?slot.size*2.2:slot.size).toFixed(2)+"px";
        slot.panel.visible=false;
    }
    function trail(fx,origin,ent,now,anchor,visibility,occlusion) {
        if (fx.lastOrigin && fx.lastTime!==null) {
            var dx=origin[0]-fx.lastOrigin[0],dy=origin[1]-fx.lastOrigin[1],dz=origin[2]-fx.lastOrigin[2];
            var distance=Math.sqrt(dx*dx+dy*dy),dt=now-fx.lastTime;
            // Emit from actual world movement. Camera panning and resolution changes
            // do not create trails. Teleports do not connect distant locations.
            if (dt<0 || dt>0.25 || distance>180 || Math.abs(dz)>160) clearTrail(fx);
            else if (distance>0.1 && dt>0) {
                fx.credit+=Math.min(distance/14,dt*14);
                var batches=Math.min(3,Math.floor(fx.credit));fx.credit-=batches;
                for (var n=0;n<batches;n++) {
                    var t=(n+1)/(batches+1),world=[fx.lastOrigin[0]+dx*t,fx.lastOrigin[1]+dy*t,fx.lastOrigin[2]+dz*t];
                    spawn(fx,world,-1,now);spawn(fx,world,1,now);
                }
            } else fx.credit=0;
        }
        fx.lastOrigin=[origin[0],origin[1],origin[2]];fx.lastTime=now;
        fx.pool.forEach(function(p){
            if (!p.active) return;
            var age=now-p.born,life=age/p.life;
            if (age<0 || life>=1) {p.active=false;p.panel.visible=false;return;}
            // Reproject the old world location each frame, so residue stays on the
            // traveled path even while the player pans or zooms the camera.
            var at=anchor.Project(ent,p.world,host);
            if (!at) {p.panel.visible=false;return;}
            var offsetX=-WIDTH/2+p.x+p.vx*age;
            var offsetY=-HEIGHT-5+p.y+p.vy*age+9*age*age;
            var left=at.left+at.width/2+offsetX,top=at.top+offsetY;
            var screenX=at.screen_left+(at.width/2+offsetX)*at.scale_x;
            var screenY=at.screen_top+offsetY*at.scale_y;
            if (left<0 || top<0
                || (host.actuallayoutwidth && (left+8)*at.scale_x>host.actuallayoutwidth)
                || (host.actuallayoutheight && (top+8)*at.scale_y>host.actuallayoutheight)
                || (visibility && visibility.Overlaps(occlusion,screenX-6*at.scale_x,screenY-6*at.scale_y,16*at.scale_x,16*at.scale_y))) {p.panel.visible=false;return;}
            position(p.panel,left,top);
            p.panel.style.opacity=(Math.pow(1-life,1.6)*(0.55+0.15*Math.sin(age*24+p.angle))).toFixed(3);
            p.panel.style.backgroundColor=life<0.20?"#fff2ba":life<0.55?"#ffc94e":life<0.8?"#c98636":"#807063";
            var scale=1-life*0.7;
            p.panel.style.transform="rotateZ("+(p.angle+p.spin*age).toFixed(1)+"deg) scale3d("+scale.toFixed(3)+", "+scale.toFixed(3)+", 1)";
            p.panel.visible=true;
        });
    }
    function ownerId(key,state) {
        var id=state.player_id===undefined?Number(String(key).replace("title_","")):Number(state.player_id);
        return isFinite(id)?id:-1;
    }
    function intersects(a,b,padding) {
        return a.left<b.left+b.width+padding && a.left+a.width>b.left-padding
            && a.top<b.top+b.height+padding && a.top+a.height>b.top-padding;
    }
    function healthRect(at,ent) {
        var state=CustomNetTables.GetTableValue?CustomNetTables.GetTableValue(table,"unit_"+ent):null;
        var width=Number(state && state.bar_width);
        if(width!==62 && width!==120 && width!==156)width=120;
        return {left:at.left+at.width/2-width/2,top:at.top,width:width,height:11};
    }
    function localHealthRect(ent,anchor) {
        try {
            if(ent<0 || !anchor || !Entities.IsValidEntity(ent) || !Entities.IsAlive(ent)
                || (Entities.IsDormant && Entities.IsDormant(ent)))return null;
            var origin=Entities.GetAbsOrigin(ent);
            if(!origin || origin.length<3 || origin[2]<-5000)return null;
            var at=anchor.Project(ent,origin,host);
            return at?healthRect(at,ent):null;
        }catch(error){return null;}
    }
    function resolveCrowd(candidates,ownBar,now) {
        var accepted=[];
        candidates.sort(function(a,b){
            if(a.own!==b.own)return a.own?-1:1;
            // Keep the current winner within an 18px band to prevent camera jitter.
            var da=a.distance-(a.fx.crowd.accepted?18:0);
            var db=b.distance-(b.fx.crowd.accepted?18:0);
            return da-db || (a.key<b.key?-1:a.key>b.key?1:0);
        });
        candidates.forEach(function(c){
            var fx=c.fx,state=fx.crowd,root=c.root,reason="";
            var first=state.lastTime===null,rewound=!first && now<state.lastTime;
            var dt=first?0:Math.max(0,Math.min(.1,now-state.lastTime));
            var padding=state.blocked || state.opacity<.999?6:1;
            if(!c.own){
                if(ownBar && intersects(c.rect,ownBar,2))reason="local_health";
                if(!reason)accepted.some(function(other){
                    if(!intersects(c.rect,other.rect,padding))return false;
                    reason=other.own?"local_title":"other_title";return true;
                });
            }
            if(rewound)state.release=now;
            if(reason){state.blocked=true;state.release=now+.30;state.accepted=false;}
            else {state.blocked=false;state.accepted=true;accepted.push(c);}
            var target=reason || now<state.release?0:1;
            if(c.own){target=1;state.release=0;}
            if(first || c.own)state.opacity=target;
            else if(target===0)state.opacity=Math.max(0,state.opacity-dt/.16);
            else state.opacity=Math.min(1,state.opacity+dt/.24);
            state.lastTime=now;state.reason=reason || (target===0?"recovery_delay":"");
            root.style.opacity=state.opacity.toFixed(4);
            root.style.zIndex=c.own?"2":"1";
            diagnostics[c.key]=state.reason || (state.opacity<.999?"fading_in":"visible");
            if(target===0 || state.opacity<.999)clearTrail(fx);
        });
    }
    function update() {
        $.Schedule(0.0,update);
        if (!host) return;
        var cfg=GameUI.CustomUIConfig(),anchor=cfg.SurvivalWorldHealthBarAnchor;
        var visibility=cfg.SurvivalWorldOverlayVisibility;
        var occlusion=visibility?visibility.Capture():null,now=clock();
        var candidates=[],localPlayer=-1,localHero=-1;
        try {
            if(Game.GetLocalPlayerID)localPlayer=Number(Game.GetLocalPlayerID());
            if(localPlayer>=0 && typeof Players!=="undefined" && Players.GetPlayerHeroEntityIndex)
                localHero=Number(Players.GetPlayerHeroEntityIndex(localPlayer));
        }catch(localError){}
        Object.keys(states).forEach(function(key){
            try {
                var state=states[key],ent=Number(state.entindex),root=panels[key];
                if (!root || !anchor || !Entities.IsValidEntity(ent) || !Entities.IsAlive(ent)
                    || (Entities.IsDormant && Entities.IsDormant(ent))
                    || (Entities.IsIllusion && Entities.IsIllusion(ent))
                    || (state.unit_name && Entities.GetUnitName(ent)!==state.unit_name)) {hide(key);return;}
                var origin=Entities.GetAbsOrigin(ent);
                if (!origin || origin.length<3 || Number(origin[2]) < -5000) {hide(key);return;}
                var titleAnchor=anchor;
                var at=titleAnchor.Project(ent,origin,host);
                if (!at) {hide(key);return;}
                var left=at.left+at.width/2-WIDTH/2,top=at.top-HEIGHT-5;
                var screenLeft=at.screen_left+(at.width/2-WIDTH/2)*at.scale_x;
                var screenTop=at.screen_top-(HEIGHT+5)*at.scale_y;
                var overhang=effects[key].layers.series?0:DRAGON_OVERHANG;
                if (screenLeft<0 || screenTop-overhang*at.scale_y<0
                    || (host.actuallayoutwidth && (left+WIDTH)*at.scale_x>host.actuallayoutwidth)
                    || (host.actuallayoutheight && (top+HEIGHT)*at.scale_y>host.actuallayoutheight)
                    || (visibility && visibility.Overlaps(occlusion,screenLeft-12,screenTop-overhang*at.scale_y-12,WIDTH*at.scale_x+24,(HEIGHT+overhang)*at.scale_y+24))) {hide(key);return;}
                position(root,left,top);root.visible=true;
                var own=(localPlayer>=0 && ownerId(key,state)===localPlayer) || (localHero>=0 && ent===localHero);
                var w=WIDTH,h=HEIGHT;
                if(effects[key].layers.series){w=effects[key].layers.width;h=effects[key].layers.height;}
                candidates.push({key:key,fx:effects[key],root:root,own:own,ent:ent,origin:origin,at:at,
                    rect:{left:left+(WIDTH-w)/2,top:top+HEIGHT-h-overhang,width:w,height:h+overhang},
                    distance:Math.sqrt(Math.pow(screenLeft+WIDTH*.5*at.scale_x-host.actuallayoutwidth*.5,2)
                        +Math.pow(screenTop+HEIGHT*.5*at.scale_y-host.actuallayoutheight*.5,2))/at.scale_x});
            } catch(error) {hide(key,"layout_error:"+String(error && error.stack || error));}
        });
        var ownBar=localHealthRect(localHero,anchor);
        if(!ownBar)candidates.some(function(c){if(!c.own)return false;ownBar=healthRect(c.at,c.ent);return true;});
        resolveCrowd(candidates,ownBar,Date.now()/1000);
        candidates.forEach(function(c){
            var key=c.key,state=states[key],fx=effects[key];
            try {
                var animationTime=now+phaseOffset(key,state);
                if(fx.layers.series)series.Animate(fx.layers,animationTime);
                else {
                    GameUI.CustomUIConfig().SurvivalTitleLayeredArt.Animate(fx.layers,animationTime);
                    sparkle(fx,animationTime);
                    if(fx.crowd.opacity>=.999 && !fx.crowd.blocked && fx.crowd.reason==="")
                        trail(fx,c.origin,c.ent,now,anchor,visibility,occlusion);
                    else clearTrail(fx);
                }
            }catch(fxError){
                clearTrail(fx);
                var message=String(fxError && fxError.stack || fxError);
                diagnostics[key]="fx_error:"+message;
                if(fx.lastError!==message){fx.lastError=message;if($.Msg)$.Msg("TITLE_FX_ERROR "+message);}
            }
        });
    }
    var probeCommand="survival_title_probe_"+Date.now();
    if ($.Msg) $.Msg("TITLE_PROBE_COMMAND "+probeCommand);
    if (typeof Game.AddCommand==="function") Game.AddCommand(probeCommand,function(){
        var previous=host.FindChildTraverse("TitleOverlapVerification");if(previous)previous.DeleteAsync(0);
        var grid=$.CreatePanel("Panel",host,"TitleOverlapVerification");grid.hittest=false;grid.hittestchildren=false;
        grid.style.width="1080px";grid.style.height="670px";grid.style.position="220px 105px 0px";grid.style.backgroundColor="#10212ff4";
        function reviewTitle(key,id,x,y,own){
            var root=make("Panel",grid,"SurvivalWorldTitle");position(root,x,y);
            var layers=series.Create(root,id,true),fx={layers:layers,pool:[],credit:0};resetCrowd(fx);
            var bar=make("Panel",grid,"OverlapReviewBar");bar.style.width="120px";bar.style.height="11px";bar.style.backgroundColor=own?"#42ed49":"#69bbf0";
            return {key:key,root:root,fx:fx,own:own,bar:bar,rect:{left:x+16,top:y,width:192,height:96},distance:0,x:x,y:y};
        }
        function reviewLabel(text,y){var l=make("Label",grid,"OverlapReviewLabel");l.text=text;l.style.color="#ffffff";l.style.fontSize="19px";l.style.width="360px";position(l,20,y);return l;}
        reviewLabel("1. Local title wins / health bars stay",45);
        reviewLabel("2. Peers: closest to center wins",245);
        reviewLabel("3. Protect local bar without a title",445);
        var status=reviewLabel("",620);status.style.width="1000px";
        var one=[reviewTitle("review_own","youlong",400,45,true),reviewTitle("review_other","jinghong",700,45,false)];
        var two=[reviewTitle("review_center","youlong",400,245,false),reviewTitle("review_far","jinghong",700,245,false)];
        var three=[reviewTitle("review_bar","youlong",700,445,false)];
        var protectedBar={left:505,top:510,width:120,height:11},health=make("Panel",grid,"OverlapReviewHealth");health.style.width="120px";health.style.height="11px";health.style.backgroundColor="#42ed49";position(health,protectedBar.left,protectedBar.top);
        function place(c,x){c.x=x;position(c.root,x,c.y);c.rect.left=x+16;c.distance=Math.abs(x+112-512);position(c.bar,x+52,c.y+101);}
        var started=Date.now()/1000,lastLog=-1;
        function tickOverlapReview(){
            if(!grid.IsValid())return;
            var time=Date.now()/1000,elapsed=time-started,t=elapsed%8;
            var blend=t<1?0:t<2?t-1:t<4?1:t<5?5-t:0;
            place(one[0],400);place(one[1],700-250*blend);place(two[0],400);place(two[1],700-250*blend);place(three[0],700-230*blend);
            resolveCrowd(one,{left:452,top:146,width:120,height:11},time);resolveCrowd(two,null,time);resolveCrowd(three,protectedBar,time);
            one.concat(two,three).forEach(function(c){series.Animate(c.fx.layers,elapsed);});
            status.text="cycle="+t.toFixed(2)+"s  self="+one[0].fx.crowd.opacity.toFixed(2)+"  peer="+one[1].fx.crowd.opacity.toFixed(2)+"  bar conflict="+three[0].fx.crowd.opacity.toFixed(2);
            var second=Math.floor(elapsed);if(second!==lastLog){lastLog=second;$.Msg("TITLE_OVERLAP_REVIEW "+JSON.stringify({time:elapsed,local:one.map(function(c){return c.fx.crowd.opacity;}),peers:two.map(function(c){return c.fx.crowd.opacity;}),health:three[0].fx.crowd.opacity}));}
            $.Schedule(.03,tickOverlapReview);
        }tickOverlapReview();
        var ancestors=[],up=host;
        while(up&&ancestors.length<15){ancestors.push({id:up.id,type:up.paneltype,visible:up.visible,opacity:up.style.opacity,z:up.style.zIndex,w:up.actuallayoutwidth,h:up.actuallayoutheight,children:up.GetChildCount()});up=up.GetParent();}
        $.Msg("TITLE_ANCESTORS "+JSON.stringify(ancestors));
        function inspect(p,depth){
            if(!p||depth>7)return null;
            var row={type:p.paneltype,id:p.id,visible:p.visible,w:p.actuallayoutwidth,h:p.actuallayoutheight,pos:p.GetPositionWithinWindow(),stylepos:p.style.position,width:p.style.width,height:p.style.height,opacity:p.style.opacity,children:[]};
            for(var n=0;n<p.GetChildCount();n++)row.children.push(inspect(p.GetChild(n),depth+1));
            return row;
        }
        var data={host:!!host,host_position:host && host.GetPositionWithinWindow(),host_scale:host && host.actualuiscale_x,host_width:host && host.actuallayoutwidth,host_height:host && host.actuallayoutheight,states:states,diagnostics:diagnostics,panels:{}};
        Object.keys(panels).forEach(function(key){
            var p=panels[key],fx=effects[key];
            data.panels[key]={visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,position:p.style.position,
                art_width:fx.art.actuallayoutwidth,art_height:fx.art.actuallayoutheight,art_visible:fx.art.visible,
                crowd:fx.crowd,animation_offset:phaseOffset(key,states[key]),asset:assets[states[key].title_id],sweep_position:fx.sweep.style.transform,sweep_opacity:fx.sweep.style.opacity,sweep_period:3,dragon_period:5,dragon_pose:fx.layers.pose,render_mode:"layered",tree:inspect(p,0)};
        });
        $.Msg("TITLE_PROBE "+JSON.stringify(data));
    },"",0);
    var initial=CustomNetTables.GetAllTableValues(table)||{};
    Object.keys(initial).forEach(function(key){
        var entry=initial[key];
        if (entry && entry.key!==undefined && entry.value!==undefined) receive(table,String(entry.key),entry.value);
        else receive(table,key,entry);
    });
    CustomNetTables.SubscribeNetTableListener(table,receive);
    update();
})();
