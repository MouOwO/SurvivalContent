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
    // The dragon is drawn BEHIND the mountain and nothing paints back over it.
    // The rock's own alpha therefore eats every part of the body that has not yet
    // risen above the ridge, which is what makes the climb read as winding up the
    // far side of the peak: the silhouette is genuinely cut in half by the skyline
    // instead of a finished sprite sliding around on top of it.
    var CLIMB_SECONDS=4.2,SETTLE_SECONDS=.7,PERIOD=6;
    // Start low on the right flank at a little over half size, well inside the
    // mountain mass, then rise left onto the summit.
    var CLIMB_TX=48,CLIMB_TY=30,CLIMB_SCALE=.58,CLIMB_TILT=12;
    function create(parent,animated) {
        parent.hittest=false;parent.hittestchildren=false;
        var back=image(parent,"SurvivalTitleDragon","dragon");back.AddClass("SurvivalTitleDragonBack");
        var climbLayer=animated?image(parent,"SurvivalTitleDragonClimb","dragon"):null;
        var mountain=image(parent,"SurvivalTitleMountains","mountains");
        var front=image(parent,"SurvivalTitleDragon","dragon");front.AddClass("SurvivalTitleDragonFront");
        var art=image(parent,"SurvivalTitleBase","letters");
        var over=image(parent,"SurvivalTitleDragon","dragon");over.AddClass("SurvivalTitleDragonOver");
        var mask=panel(parent,"SurvivalTitleShineMask"),sweep=panel(mask,"SurvivalTitleSweep");
        return {back:back,climb:climbLayer,mountain:mountain,front:front,over:over,art:art,mask:mask,sweep:sweep};
    }
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    // q=1 lands on the identity transform, so the moving dragon arrives exactly on
    // the resting artwork's place and the hand-over between the two shows no seam.
    function climbAt(q){
        return {tx:CLIMB_TX*(1-q),ty:CLIMB_TY*(1-q),
            scale:CLIMB_SCALE+(1-CLIMB_SCALE)*q,tilt:CLIMB_TILT*(1-q)};
    }
    function timing(now){
        var cycle=((now%PERIOD)+PERIOD)%PERIOD;
        var q=smooth(Math.min(1,cycle/CLIMB_SECONDS));
        var settle=smooth(Math.min(1,Math.max(0,(cycle-CLIMB_SECONDS)/SETTLE_SECONDS)));
        var staticWeight=smooth((settle-.35)/.65);
        return {cycle:cycle,q:q,settle:settle,staticWeight:staticWeight,procedural:1-staticWeight,
            alpha:cycle<.45?smooth(cycle/.45):cycle>PERIOD-.55?1-smooth((cycle-(PERIOD-.55))/.55):1,
            phase:cycle<CLIMB_SECONDS+SETTLE_SECONDS?"ascending":"resting",
            duration:CLIMB_SECONDS,period:PERIOD,climb:climbAt(q)};
    }
    function transformOf(c){
        return "translate3d("+c.tx.toFixed(2)+"px, "+c.ty.toFixed(2)+"px, 0px) "
            +"rotateZ("+c.tilt.toFixed(2)+"deg) scale3d("+c.scale.toFixed(4)+", "+c.scale.toFixed(4)+", 1)";
    }
    function pose(now){return timing(now);}
    function animate(fx,now){
        var state=pose(now);fx.pose=state;
        // The resting dragon also lives on the far layer, so the peak keeps cutting it.
        fx.front.style.opacity="0";fx.over.style.opacity="0";
        fx.back.style.opacity=(state.alpha*state.staticWeight).toFixed(4);
        if(!fx.climb)return;
        var weight=state.alpha*state.procedural,shown=weight>.002;
        fx.climb.visible=shown;
        if(!shown)return;
        fx.climb.style.transform=transformOf(state.climb);
        fx.climb.style.opacity=weight.toFixed(4);
    }
    GameUI.CustomUIConfig().SurvivalTitleLayeredArt={Create:create,Animate:animate,Pose:pose};
})();
