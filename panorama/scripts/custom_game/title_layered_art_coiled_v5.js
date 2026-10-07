(function () {
    "use strict";
    var PATH="file://{images}/custom_game/titles/peak_clean_";
    var CLIMB_SECONDS=3, PERIOD=5;
    function panel(parent,cls) {
        var p=$.CreatePanel("Panel",parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;
    }
    function image(parent,cls,file) {
        var p=$.CreatePanel("Image",parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;
        if(p.SetScaling)p.SetScaling("stretch-to-fit-preserve-aspect");p.SetImage(PATH+file+".png");return p;
    }
    function create(parent,animated) {
        parent.hittest=false;parent.hittestchildren=false;
        // Three registered copies of ONE complete painted dragon. The peak cuts
        // the far arch; the lower coil and the neck return in front of the rock.
        // No reconstructed scale strips or independently floating head.
        var back=image(parent,"SurvivalTitleDragon","dragon_coiled");back.AddClass("SurvivalTitleDragonBack");
        var mountain=image(parent,"SurvivalTitleMountains","mountains");
        var front=image(parent,"SurvivalTitleDragon","dragon_coiled");front.AddClass("SurvivalTitleDragonFront");
        var over=image(parent,"SurvivalTitleDragon","dragon_coiled");over.AddClass("SurvivalTitleDragonOver");
        var art=image(parent,"SurvivalTitleBase","letters");
        var mask=panel(parent,"SurvivalTitleShineMask"),sweep=panel(mask,"SurvivalTitleSweep");
        return {back:back,mountain:mountain,front:front,over:over,art:art,mask:mask,sweep:sweep,animated:!!animated};
    }
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    function pose(now){
        var cycle=((now%PERIOD)+PERIOD)%PERIOD;
        var q=smooth(Math.min(1,cycle/CLIMB_SECONDS)),angle=q*Math.PI*2;
        var radius=26;
        // A full curved pass around the peak, with a real lateral reversal and
        // depth change. Arrives at the coiled illustration, never a corner badge.
        var x=Math.sin(angle)*radius,y=32*(1-q)+Math.sin(angle)*6;
        var depth=Math.cos(angle),near=smooth((depth+.6)/1.2);
        return {cycle:cycle,q:q,duration:CLIMB_SECONDS,period:PERIOD,
            phase:cycle<CLIMB_SECONDS?"ascending":"resting",
            alpha:cycle<.22?smooth(cycle/.22):cycle>4.75?1-smooth((cycle-4.75)/.25):1,
            near:near,climb:{tx:x,ty:y,scale:.88+.12*q,tilt:-9*Math.sin(angle)*(1-q)}};
    }
    function transformOf(c){
        return "translate3d("+c.tx.toFixed(2)+"px, "+c.ty.toFixed(2)+"px, 0px) "
            +"rotateZ("+c.tilt.toFixed(2)+"deg) scale3d("+c.scale.toFixed(4)+", "+c.scale.toFixed(4)+", 1)";
    }
    function animate(fx,now){
        if(!fx.animated)return;
        var state=pose(now);fx.pose=state;
        var transform=transformOf(state.climb);
        fx.back.style.transform=transform;fx.front.style.transform=transform;fx.over.style.transform=transform;
        fx.back.style.opacity=state.alpha.toFixed(4);
        // When the dragon circles to the far side its front planes retreat
        // behind the mountain. Its actual painted silhouette stays intact.
        fx.front.style.opacity=(state.alpha*state.near).toFixed(4);
        fx.over.style.opacity=(state.alpha*state.near).toFixed(4);
    }
    GameUI.CustomUIConfig().SurvivalTitleLayeredArt={Create:create,Animate:animate,Pose:pose};
})();
