(function () {
    "use strict";
    var PATH="file://{images}/custom_game/titles/peak_clean_";
    function panel(parent,cls) {
        var p=$.CreatePanel("Panel",parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;
    }
    function image(parent,cls,file) {
        var p=$.CreatePanel("Image",parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;
        if(p.SetScaling)p.SetScaling("stretch-to-fit-preserve-aspect");p.SetImage(PATH+file+".png");return p;
    }
    // The climb uses the finished dragon artwork rather than a body rebuilt from
    // strips: a thin rotated strip has no mane, claw or scale, so a long chain of
    // them reads as a snake. The same sprite is drawn once under the mountains and
    // once over them behind a baked ridge silhouette.
    //
    // Two copies alone would tile each other exactly and leave the dragon fully
    // visible at every instant, which never reads as coiling. So the climb starts
    // low and far left, deep inside the mountain mass, where the ridge line cuts
    // across the body and hides its lower half. Scale, tilt and the fading front
    // copy then let the dragon surface and swing out to its resting place, so the
    // rock keeps slicing the silhouette the whole way up.
    var CLIMB_TX=-52,CLIMB_TY=-3,CLIMB_SCALE=.76,CLIMB_TILT=-12;
    function create(parent,animated) {
        parent.hittest=false;parent.hittestchildren=false;
        var back=image(parent,"SurvivalTitleDragon","dragon");back.AddClass("SurvivalTitleDragonBack");
        var climbBack=animated?image(parent,"SurvivalTitleDragonClimb","dragon"):null;
        var mountain=image(parent,"SurvivalTitleMountains","mountains");
        var climbMask=null,climbFront=null;
        if(animated){
            // The wrapper spans the whole panel so the baked silhouette lines up
            // with the letterboxed mountain without ever being resized.
            climbMask=panel(parent,"SurvivalTitleClimbMask");
            climbFront=image(climbMask,"SurvivalTitleDragonClimb","dragon");
        }
        var front=image(parent,"SurvivalTitleDragon","dragon");front.AddClass("SurvivalTitleDragonFront");
        var art=image(parent,"SurvivalTitleBase","letters");
        var over=image(parent,"SurvivalTitleDragon","dragon");over.AddClass("SurvivalTitleDragonOver");
        var mask=panel(parent,"SurvivalTitleShineMask"),sweep=panel(mask,"SurvivalTitleSweep");
        return {back:back,climbBack:climbBack,climbFront:climbFront,climbMask:climbMask,
            mountain:mountain,front:front,over:over,art:art,mask:mask,sweep:sweep};
    }
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    // q=1 lands on the identity transform, so the moving dragon arrives exactly on
    // the resting artwork's place and the hand-over between the two shows no seam.
    function climb(q){
        return {tx:CLIMB_TX*(1-q),ty:CLIMB_TY*(1-q),
            scale:CLIMB_SCALE+(1-CLIMB_SCALE)*q,tilt:CLIMB_TILT*(1-q),
            // Held back until the body has cleared the peak, so the rock still
            // owns the silhouette while the dragon is climbing out of it.
            reveal:smooth((q-.15)/.85)};
    }
    function timing(now){
        var cycle=((now%5)+5)%5;
        var q=smooth(Math.min(1,cycle/2.45)),settle=smooth((cycle-2.45)/.55);
        var staticWeight=smooth((settle-.35)/.65);
        return {cycle:cycle,q:q,settle:settle,staticWeight:staticWeight,procedural:1-staticWeight,
            alpha:cycle<.32?smooth(cycle/.32):cycle>4.55?1-smooth((cycle-4.55)/.45):1,
            phase:cycle<3?"ascending":"resting",duration:3,period:5,climb:climb(q)};
    }
    function transformOf(c){
        return "translate3d("+c.tx.toFixed(2)+"px, "+c.ty.toFixed(2)+"px, 0px) "
            +"rotateZ("+c.tilt.toFixed(2)+"deg) scale3d("+c.scale.toFixed(4)+", "+c.scale.toFixed(4)+", 1)";
    }
    function pose(now){return timing(now);}
    function animate(fx,now){
        var state=pose(now);fx.pose=state;
        fx.back.style.opacity="0";fx.over.style.opacity="0";
        fx.front.style.opacity=(state.alpha*state.staticWeight).toFixed(4);
        if(!fx.climbBack)return;
        var weight=state.alpha*state.procedural,c=state.climb,shown=weight>.002;
        fx.climbBack.visible=shown;fx.climbFront.visible=shown;
        if(!shown)return;
        var transform=transformOf(c);
        fx.climbBack.style.transform=transform;fx.climbFront.style.transform=transform;
        fx.climbBack.style.opacity=weight.toFixed(4);
        // The masked copy only appears as the body clears the ridge, which is what
        // makes the dragon read as winding up and over the rock rather than sliding.
        fx.climbFront.style.opacity=(weight*c.reveal).toFixed(4);
    }
    GameUI.CustomUIConfig().SurvivalTitleLayeredArt={Create:create,Animate:animate,Pose:pose};
})();
