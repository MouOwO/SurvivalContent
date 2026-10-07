(function () {
    "use strict";
    var PATH="file://{images}/custom_game/titles/peak_clean_";
    function image(parent,cls,file) {
        var p=$.CreatePanel("Image",parent,"");p.AddClass(cls);
        p.hittest=false;p.hittestchildren=false;
        if (p.SetScaling) p.SetScaling("stretch-to-fit-preserve-aspect");
        p.SetImage(PATH+file+".png");return p;
    }
    function create(parent) {
        parent.hittest=false;parent.hittestchildren=false;
        var back=image(parent,"SurvivalTitleDragon","dragon");back.AddClass("SurvivalTitleDragonBack");
        var mountain=image(parent,"SurvivalTitleMountains","mountains");
        var front=image(parent,"SurvivalTitleDragon","dragon");front.AddClass("SurvivalTitleDragonFront");
        var art=image(parent,"SurvivalTitleBase","letters");
        var over=image(parent,"SurvivalTitleDragon","dragon");over.AddClass("SurvivalTitleDragonOver");
        var mask=$.CreatePanel("Panel",parent,"");mask.AddClass("SurvivalTitleShineMask");mask.hittest=false;
        var sweep=$.CreatePanel("Panel",mask,"");sweep.AddClass("SurvivalTitleSweep");sweep.hittest=false;
        return {back:back,mountain:mountain,front:front,over:over,art:art,mask:mask,sweep:sweep};
    }
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    // A single continuous shrinking helix takes three seconds to rise. The
    // slow start/finish has zero velocity; there are no stopped waypoint jumps.
    function pose(now) {
        var cycle=((now%5)+5)%5,t=Math.min(1,cycle/3),u=smooth(t);
        var theta=2*Math.PI*1.25*u,radius=1-u;
        var x=.26+.29*u-.40*radius*Math.cos(theta);
        var y=.30-.35*u+.13*radius*Math.sin(theta);
        var scale=.62+.38*u;
        var angle=-22*radius+16*Math.sin(theta)*radius;
        // Rotation/scale use a top-left origin so a small emerging dragon
        // starts at the foot of the mountain, not the center of an empty box.
        // Keep its transformed lower edge above the hero health bar.
        var radians=angle*Math.PI/180;
        var bottom=scale*(98.56*Math.max(0,Math.sin(radians))+97.92*Math.max(0,Math.cos(radians)));
        y=Math.min(y,(94-bottom)/96);
        var alpha=cycle<.45?smooth(cycle/.45):cycle>4.55?1-smooth((cycle-4.55)/.45):1;
        // While low on the title, the dragon must be in front of the lettering,
        // otherwise it disappears until its head reaches the summit. Blend it
        // back behind the lettering as it reaches the reference resting pose.
        var over=.88*(1-smooth((u-.55)/.35));
        var rear=.10*Math.pow(Math.sin(theta),2)*(1-u);
        return {x:x,y:y,scale:scale,angle:angle,front:1-rear-over,rear:rear,over:over,
            alpha:alpha,phase:cycle<3?"ascending":"resting",period:5,duration:3};
    }
    function animate(fx,now) {
        var p=pose(now);fx.pose=p;
        [fx.back,fx.front,fx.over].forEach(function(panel,index){
            panel.style.position=(p.x*224).toFixed(2)+"px "+(p.y*96).toFixed(2)+"px 0px";
            panel.style.transform="rotateZ("+p.angle.toFixed(2)+"deg) scale3d("+p.scale.toFixed(4)+", "+p.scale.toFixed(4)+", 1)";
            var weight=index===0?p.rear:index===1?p.front:p.over;
            panel.style.opacity=(p.alpha*weight).toFixed(4);
        });
        fx.mountain.style.transform="translateX(0px)";
    }
    GameUI.CustomUIConfig().SurvivalTitleLayeredArt={Create:create,Animate:animate,Pose:pose};
})();
