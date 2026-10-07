(function () {
    "use strict";
    var PATH="file://{images}/custom_game/titles/peak_mountain_";
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
        var mask=$.CreatePanel("Panel",parent,"");mask.AddClass("SurvivalTitleShineMask");mask.hittest=false;
        var sweep=$.CreatePanel("Panel",mask,"");sweep.AddClass("SurvivalTitleSweep");sweep.hittest=false;
        return {back:back,mountain:mountain,front:front,art:art,mask:mask,sweep:sweep};
    }
    // x/y are fractions of the 224 x 96 world-title canvas. Front/back weight
    // moves the same dragon around the mountains; lettering always stays ahead.
    var keys=[
        [0.00,0.34,0.48,0.40,-36,1],
        [0.22,0.07,0.25,0.56,-24,0],
        [0.46,0.22,-0.13,0.72,12,0],
        [0.68,0.53,-0.15,0.88,18,0.75],
        [0.86,0.60,-0.07,1.02,6,1],
        [1.00,0.55,-0.05,1.00,0,1]
    ];
    function smooth(x){x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);}
    function pose(now) {
        var cycle=((now%5)+5)%5,t=Math.min(1,cycle/1.8),a=keys[0],b=keys[1];
        for(var i=1;i<keys.length;i++){a=keys[i-1];b=keys[i];if(t<=b[0])break;}
        var f=smooth((t-a[0])/(b[0]-a[0]));
        function mix(n){return a[n]+(b[n]-a[n])*f;}
        // Fade only at the cycle boundary, so resetting to the foot of the peak
        // never teleports a fully visible dragon across the title.
        var alpha=cycle<0.16?smooth(cycle/0.16):cycle>4.78?1-smooth((cycle-4.78)/0.22):1;
        return {x:mix(1),y:mix(2),scale:mix(3),angle:mix(4),front:mix(5),alpha:alpha,phase:cycle<1.8?"ascending":"resting",period:5};
    }
    function animate(fx,now) {
        var p=pose(now);fx.pose=p;
        [fx.back,fx.front].forEach(function(panel,index){
            panel.style.position=(p.x*224).toFixed(2)+"px "+(p.y*96).toFixed(2)+"px 0px";
            panel.style.transform="rotateZ("+p.angle.toFixed(2)+"deg) scale3d("+p.scale.toFixed(4)+", "+p.scale.toFixed(4)+", 1)";
            panel.style.opacity=(p.alpha*(index?p.front:1-p.front)).toFixed(4);
        });
        // Sub-pixel parallax supplies depth without rocking the lettering.
        fx.mountain.style.transform="translateX("+(Math.sin(now*.72)*0.65).toFixed(3)+"px)";
    }
    GameUI.CustomUIConfig().SurvivalTitleLayeredArt={Create:create,Animate:animate,Pose:pose};
})();
