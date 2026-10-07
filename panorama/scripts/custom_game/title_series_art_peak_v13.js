(function () {
    "use strict";
    var config=GameUI.CustomUIConfig().SurvivalTitleMotionData || {};
    function make(type,parent,cls){var p=$.CreatePanel(type,parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;}
    function box(p,x,y,w,h){p.style.position=x+"% "+y+"% 0px";p.style.width=w+"%";p.style.height=h+"%";}
    function origin(p,x,y){p.style.transformOrigin=x+"% "+y+"%";}
    function mask(p,name){if(name)p.AddClass("MotionMask_"+name);}
    function sprite(parent,c,index,maskName){
        var frame=c.frames[index],clip=make("Panel",parent,"MotionSlot");mask(clip,maskName);
        var image=make("Image",clip,"MotionAtlas");if(image.SetScaling)image.SetScaling("stretch-to-fit-preserve-aspect");image.SetImage(c.atlas);
        // Panorama has no nonuniform "stretch-to-fit" Image mode. Give the
        // native Image its source aspect first, then stretch the sampled layer.
        // Otherwise the engine draws unscaled atlas pixels (or letterboxes them).
        var rect=c.rects[index],slotAspect=(c.width*.94*rect[2])/(c.height*.90*rect[3]);
        var naturalHeight=slotAspect*c.size[1]/frame[2]*100;
        box(image,-frame[0]/frame[2]*100,-frame[1]/frame[3]*100,c.size[0]/frame[2]*100,naturalHeight);
        origin(image,0,0);
        image.style.transform="scale3d(1, "+(frame[2]/(frame[3]*slotAspect)).toFixed(8)+", 1)";
        return {root:clip,image:image};
    }
    function part(parent,c,index,maskName){var r=c.rects[index],p=make("Panel",parent,"MotionPart");box(p,r[0],r[1],r[2],r[3]);var s=sprite(p,c,index,maskName);p.image=s.image;return p;}
    function nested(parent,c,index,maskName){var p=make("Panel",parent,"MotionPart");box(p,0,0,100,100);var s=sprite(p,c,index,maskName);p.image=s.image;return p;}
    function light(parent,c,index,horizontal){
        var wrap=make("Panel",parent,"MotionLight"),band=make("Panel",wrap,"MotionBand");mask(band,"softband");
        var content=make("Panel",band,"MotionLightContent");content.style.width=(c.width*.94)+"px";content.style.height=(c.height*.90)+"px";
        var copy=part(content,c,index);copy.style.brightness="2.1";
        band.style.width=horizontal?"14px":"100%";band.style.height=horizontal?"100%":"16px";
        return {root:wrap,band:band,content:content,horizontal:horizontal};
    }
    function dragon(parent,c,index,left){
        var r=c.rects[index],p=make("Panel",parent,"MotionPart");box(p,r[0],r[1],r[2],r[3]);origin(p,left?78:22,86);
        if(!left)mask(p,"head_right_crop");
        var suffix=left?"left":"right";
        var mouth=make("Panel",p,"MotionMouth");mask(mouth,"mouth_"+suffix);
        sprite(p,c,index,"jaw_"+suffix+"_rest");
        var jaw=nested(p,c,index,"jaw_"+suffix);origin(jaw,left?28:72,65);
        return {root:p,jaw:jaw,mouth:mouth};
    }
    function spiritPart(parent,c,index,left){
        var r=c.rects[index],p=make("Panel",parent,"MotionPart");box(p,r[0],r[1],r[2],r[3]);origin(p,left?75:25,68);
        p.tail=nested(p,c,index);
        sprite(p,c,index,"spirit_head_"+(left?"left":"right"));return p;
    }
    function ship(parent,c,index){var r=c.rects[index],p=make("Panel",parent,"MotionPart");box(p,r[0],r[1],r[2],r[3]);origin(p,50,86);sprite(p,c,index,"sail_rest");var sail=nested(p,c,index,"sail");origin(sail,52,76);return {root:p,sail:sail};}
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    function pulse(t,a,b,c,d){return smooth((t-a)/(b-a))*(1-smooth((t-c)/(d-c)));}
    function pose(now,id){
        now=Number(now)||0;
        var slow=id==="jinghong"||id==="cangqiong",royal=id==="tianxia_diyi",spirit=id==="chushen";
        var period=slow||royal||spirit?8:6,t=((now%period)+period)%period,phase=((now%3)+3)%3;
        var a=pulse(t,1.13,1.72,2.16,2.83),tail=pulse(t,1.35,1.98,2.23,2.88);
        var anticipation=pulse(t,1.13,1.36,1.44,1.74),roar=pulse(t,1.73,2.02,2.19,2.72),tip=pulse(t,2.05,2.25,2.40,2.75);
        var travel=smooth((t-1.18)/1.57);
        if(slow){
            a=pulse(t,.8,2.5,3.15,4.85);tail=pulse(t,1.15,2.95,3.60,5.30);
            tip=pulse(t,3.2,3.45,3.75,4.10);travel=smooth((t-.8)/4.05);
        }else if(id==="youlong"){
            // Slow lift, a readable held pose, then a longer shoulder-led return.
            anticipation=pulse(t,.95,1.22,1.32,1.70);
            a=pulse(t,1.23,2.02,2.62,3.65);
            tail=pulse(t,1.50,2.20,2.70,3.90);
        }else if(royal){
            anticipation=pulse(t,.75,1.25,1.45,2.25);
            a=pulse(t,1.3,2.75,3.75,5.15);roar=pulse(t,2.45,2.68,3.75,4.55);
        }else if(spirit){
            a=pulse(t,1.1,2.3,3.15,4.9);tail=pulse(t,1.9,2.65,3.6,4.8);travel=smooth((t-1.1)/3.8);
        }
        var opacity=phase<1.05?.30*Math.min(1,phase/.18,(1.05-phase)/.18):0;
        return {cycle:t,period:period,progress:phase/1.05,opacity:opacity,fxGain:1-.85*opacity/.30,
            action:a,tail:tail,anticipation:anticipation,reach:id==="youlong"?pulse(t,1.72,2.20,2.65,3.48):pulse(t,1.55,1.92,2.17,2.78),
            roar:roar,tip:tip,travel:travel,wave:Math.sin((t-1.13)/1.70*Math.PI*2)*a,
            rotation:((now%60)+60)%60*6,id:id};
    }
    function move(p,x,y,angle,sx,sy,opacity){if(!p)return;p.style.transform="translateX("+(x||0).toFixed(3)+"px) translateY("+(y||0).toFixed(3)+"px) rotateZ("+(angle||0).toFixed(3)+"deg) scale3d("+(sx===undefined?1:sx).toFixed(4)+", "+(sy===undefined?1:sy).toFixed(4)+", 1)";if(opacity!==undefined)p.style.opacity=opacity.toFixed(4);}
    function runLight(l,at,opacity,w,h){
        var px=-18+(l.horizontal?w+36:h+36)*at;
        l.band.style.position=l.horizontal?px.toFixed(3)+"px 0px 0px":"0px "+px.toFixed(3)+"px 0px";
        l.content.style.position=l.horizontal?(-px).toFixed(3)+"px 0px 0px":"0px "+(-px).toFixed(3)+"px 0px";
        l.band.style.opacity=opacity.toFixed(4);
    }
    function create(parent,id,animated){
        var c=config[id];if(!c)return null;
        var stage=make("Panel",parent,"SurvivalSeriesStage");stage.style.width=(c.width/224*100).toFixed(4)+"%";stage.style.height=(c.height/96*100).toFixed(4)+"%";
        var canvas=make("Panel",stage,"MotionCanvas"),fx={stage:stage,canvas:canvas,series:true,motion:true,id:id,animated:!!animated,height:c.height,width:c.width};
        if(id==="jinghong"){
            fx.tail=part(canvas,c,3);origin(fx.tail,44,25);
            fx.body=part(canvas,c,1);fx.wing=part(canvas,c,2);origin(fx.wing,90,87);
            fx.tip=part(canvas,c,2,"wing_tip");origin(fx.tip,90,87);fx.tip.style.brightness="1.8";
        }else if(id==="youlong"){
            fx.body=part(canvas,c,1,"neck_body");
            fx.headRig=make("Panel",canvas,"MotionPart");box(fx.headRig,0,0,100,100);origin(fx.headRig,52,29);
            fx.neck=make("Panel",fx.headRig,"MotionPart");var nr=c.neck.rect;box(fx.neck,nr[0],nr[1],nr[2],nr[3]);origin(fx.neck,10,38);
            var neckArt=make("Image",fx.neck,"MotionNeck");if(neckArt.SetScaling)neckArt.SetScaling("stretch-to-fit-preserve-aspect");neckArt.SetImage(c.neck.asset);
            var r=c.rects[2];fx.head=make("Panel",fx.headRig,"MotionPart");box(fx.head,r[0],r[1],r[2],r[3]);origin(fx.head,13,52);mask(fx.head,"neck_join");
            sprite(fx.head,c,2,"whisker_rest");fx.whisker=nested(fx.head,c,2,"whisker");origin(fx.whisker,95,57);
            fx.claw=part(canvas,c,3);origin(fx.claw,10,12);
        }else if(id==="jian_tianya"){
            fx.qi=part(canvas,c,3);fx.sword=part(canvas,c,1);fx.tassel=part(canvas,c,2);origin(fx.tassel,4,8);fx.bladeLight=light(canvas,c,1,true);
        }else if(id==="tianxia_diyi"){
            fx.body=part(canvas,c,1);fx.sun=part(canvas,c,1,"sun");fx.sun.style.brightness="1.65";
            fx.left=dragon(canvas,c,2,true);fx.right=dragon(canvas,c,3,false);
        }else if(id==="cangqiong"){
            fx.mountain=part(canvas,c,1,"mountain");fx.mountain.style.brightness="1.30";fx.mountain.image.AddClass("MotionMountainImage");fx.cloud=part(canvas,c,1,"cloud");
            fx.left=part(canvas,c,2);origin(fx.left,96,85);fx.right=part(canvas,c,3);origin(fx.right,4,85);
            fx.peak=part(canvas,c,1,"peak");fx.peak.style.brightness="1.6";
            // Extra stage headroom exposes the original peaks above the text;
            // clouds and lettering retain their existing screen positions.
            move(fx.mountain,0,-9,0,1,1);move(fx.peak,0,-9,0,1,1);
        }else if(id==="sihai"){
            fx.left=ship(canvas,c,2);fx.right=ship(canvas,c,3);fx.water=part(canvas,c,1);
        }else if(id==="daoyuan"){
            fx.disc=part(canvas,c,1);origin(fx.disc,50,50);fx.left=part(canvas,c,2);fx.right=part(canvas,c,3);
        }else if(id==="chushen"){
            fx.arc=part(canvas,c,1);fx.arc.style.opacity=".55";
            fx.mistLeft=part(canvas,c,2,"spirit_tail_left");origin(fx.mistLeft,75,68);
            fx.mistRight=part(canvas,c,3,"spirit_tail_right");origin(fx.mistRight,25,68);
            fx.left=spiritPart(canvas,c,2,true);fx.right=spiritPart(canvas,c,3,false);
        }
        // Text is always the foreground, on a stationary independent layer.
        fx.letters=part(canvas,c,0);fx.art=fx.letters.image;fx.art.AddClass("MotionLetterImage");
        fx.light=light(canvas,c,0,false);fx.mask=fx.light.root;fx.mask.visible=!!animated;fx.sweep=fx.light.band;
        apply(fx,0);return fx;
    }
    function apply(fx,now){
        var p=pose(now,fx.id),a=p.action,t=p.tail,c=config[fx.id];fx.pose=p;
        if(fx.id==="jinghong"){
            move(fx.wing,0,0,10*a,1,1);move(fx.tail,0,0,-3.5*t,1,1);
            move(fx.tip,0,0,10*a,1,1,.18*p.tip*p.fxGain);
        }else if(fx.id==="youlong"){
            // A single shoulder joint keeps the connector attached to the skull.
            move(fx.headRig,.15*a,-.2*a,-8*a+1.6*p.anticipation,1,1);
            move(fx.claw,-2.4*p.reach,1.6*p.reach,-12*p.reach,1-.035*p.reach,1+.025*p.reach);
            move(fx.whisker,0,0,5*t,1,1);
        }else if(fx.id==="jian_tianya"){
            move(fx.qi,3.8*p.travel*a,-.7*a,-.5*a,1,1,.8+.2*a);
            move(fx.tassel,0,0,7*t-2*p.anticipation,1,1);
            runLight(fx.bladeLight,p.travel,.35*a*p.fxGain,c.width*.94,c.height*.90);
        }else if(fx.id==="tianxia_diyi"){
            move(fx.left.root,0,-1.4*a,6*a-3*p.anticipation,1,1);
            move(fx.right.root,0,-1.4*a,-6*a+3*p.anticipation,1,1);
            move(fx.left.jaw,0,0,-10*p.roar,1,1);move(fx.right.jaw,0,0,10*p.roar,1,1);
            fx.left.mouth.style.opacity=(.75*p.roar).toFixed(4);fx.right.mouth.style.opacity=(.75*p.roar).toFixed(4);
            fx.sun.style.opacity=(.24*p.roar*p.fxGain).toFixed(4);
        }else if(fx.id==="cangqiong"){
            move(fx.left,0,0,7*a,1,1);move(fx.right,0,0,-7*a,1,1);
            move(fx.cloud,3.5*a*p.travel,0,0,1,1);
            fx.peak.style.opacity=(.15*p.tip*p.fxGain).toFixed(4);
        }else if(fx.id==="sihai"){
            move(fx.water,(p.travel*7-3.5)*a,.7*p.wave,0,1,1);
            move(fx.left.root,0,-1.5*p.wave,1.5*p.wave,1,1);
            move(fx.right.root,0,1.1*p.wave,-1.2*p.wave,1,1);
            move(fx.left.sail,0,0,0,1+.035*a,1);move(fx.right.sail,0,0,0,1+.035*t,1);
        }else if(fx.id==="daoyuan"){
            move(fx.disc,0,0,p.rotation,1,1);
            move(fx.left,5*a,-1.2*a,-1.5*a,1,1);move(fx.right,-5*a,-1.2*a,1.5*a,1,1);
        }else if(fx.id==="chushen"){
            var x=4*Math.sin(p.travel*Math.PI)*a,y=-2*Math.sin(p.travel*Math.PI*2)*a;
            move(fx.left,x,y,4*a,1,1,1);move(fx.right,-x,-y,-4*a,1,1,1);
            fx.left.tail.style.opacity=(1-.65*t).toFixed(4);fx.right.tail.style.opacity=(1-.65*t).toFixed(4);
            move(fx.mistLeft,x-2*a,y+1.5*a,4*a,1+.025*a,1+.025*a,.16*t*p.fxGain);
            move(fx.mistRight,-x+2*a,-y+1.5*a,-4*a,1+.025*a,1+.025*a,.16*t*p.fxGain);
        }
        runLight(fx.light,p.progress,p.opacity,c.width*.94,c.height*.90);
    }
    function animate(fx,now){if(fx&&fx.animated)apply(fx,now);}
    GameUI.CustomUIConfig().SurvivalTitleSeriesArt={Create:create,Animate:animate,Config:config,Pose:pose};
})();
