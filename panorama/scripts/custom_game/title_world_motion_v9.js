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
    function make(type,parent,cls) {
        var panel=$.CreatePanel(type,parent,"");panel.AddClass(cls);
        panel.hittest=false;panel.hittestchildren=false;return panel;
    }
    function clearTrail(fx) {
        if (!fx) return;
        fx.lastOrigin=null;fx.lastTime=null;fx.credit=0;
        fx.pool.forEach(function(p){p.active=false;p.panel.visible=false;});
    }
    function hide(key, reason) {
        diagnostics[key] = reason || "hidden";
        if (panels[key]) panels[key].visible=false;
        clearTrail(effects[key]);
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
        return root;
    }
    function receive(name,key,value) {
        if (name!==table || key.indexOf("title_")!==0) return;
        if (!value || !assets[value.title_id] || Number(value.entindex)<0) {remove(key);return;}
        if (states[key] && states[key].title_id!==value.title_id) remove(key);
        if (states[key] && (Number(states[key].entindex)!==Number(value.entindex) || states[key].render_mode!==value.render_mode)) clearTrail(effects[key]);
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
    function update() {
        $.Schedule(0.0,update);
        if (!host) return;
        var cfg=GameUI.CustomUIConfig(),anchor=cfg.SurvivalWorldHealthBarAnchor;
        var visibility=cfg.SurvivalWorldOverlayVisibility;
        var occlusion=visibility?visibility.Capture():null,now=clock();
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
                diagnostics[key]="visible";
                try {
                    if(effects[key].layers.series) series.Animate(effects[key].layers,now);
                    else {
                        GameUI.CustomUIConfig().SurvivalTitleLayeredArt.Animate(effects[key].layers,now);
                        sparkle(effects[key],now);
                        trail(effects[key],origin,ent,now,titleAnchor,visibility,occlusion);
                    }
                } catch(fxError) {
                    clearTrail(effects[key]);
                    var message=String(fxError && fxError.stack || fxError);
                    diagnostics[key]="fx_error:"+message;
                    if (effects[key].lastError!==message) {
                        effects[key].lastError=message;
                        if ($.Msg) $.Msg("TITLE_FX_ERROR "+message);
                    }
                }
            } catch(error) {hide(key,"layout_error:"+String(error && error.stack || error));}
        });
    }
    var probeCommand="survival_title_probe_"+Date.now();
    if ($.Msg) $.Msg("TITLE_PROBE_COMMAND "+probeCommand);
    if (typeof Game.AddCommand==="function") Game.AddCommand(probeCommand,function(){
        if(!host.__titleImageDebug){
            host.__titleImageDebug=true;
            ["stretch-to-fit","stretch-to-fit-preserve-aspect",null].forEach(function(scaling,i){
                var pic=make("Image",host,"TitleImageDebug");pic.style.width="150px";pic.style.height="200px";pic.style.position=(300+i*170)+"px 200px 0px";pic.style.backgroundColor="#602020";
                if(scaling)pic.SetScaling(scaling);pic.SetImage("file://{images}/custom_game/titles/motion/chushen_atlas.png");
            });
        }
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
                asset:assets[states[key].title_id],sweep_position:fx.sweep.style.transform,sweep_opacity:fx.sweep.style.opacity,sweep_period:3,dragon_period:5,dragon_pose:fx.layers.pose,render_mode:"layered",tree:inspect(p,0)};
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
