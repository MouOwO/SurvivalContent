(function () {
    "use strict";
    var ids=["jinghong","youlong","jian_tianya","tianxia_diyi","cangqiong","sihai","daoyuan","chushen"];
    var config={};
    ids.forEach(function(id,i){
        config[id]={asset:"file://{images}/custom_game/titles/series/"+id+"_v3.png",
            width:i<2?192:224,height:i<2?96:224/3,
            tint:["#ffe4ed","#fff2b3","#d9ffff","#ffe9a3","#eee6ff","#d7f1ff","#fff0bb","#eadcff"][i]};
    });
    function make(type,parent,cls){var p=$.CreatePanel(type,parent,"");p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;}
    function pose(now){
        var phase=((now%3)+3)%3,duration=1.05;
        return {progress:phase/duration,opacity:phase<duration?0.30*Math.min(1,phase/.18,(duration-phase)/.18):0};
    }
    function create(parent,id,animated){
        var c=config[id];if(!c)return null;
        var stage=make("Panel",parent,"SurvivalSeriesStage");
        stage.style.width=(c.width/224*100).toFixed(4)+"%";
        stage.style.height=(c.height/96*100).toFixed(4)+"%";
        var art=make("Image",stage,"SurvivalSeriesArt");art.SetImage(c.asset);
        var mask=make("Panel",stage,"SurvivalSeriesMask");mask.AddClass("SurvivalSeries_"+id);
        var sweep=make("Panel",mask,"SurvivalSeriesSweep");
        sweep.style.backgroundColor="gradient(linear,0% 0%,0% 100%,from(#ffffff00),color-stop(0.48,"+c.tint+"),color-stop(0.54,#ffffff),to(#ffffff00))";
        mask.visible=animated===true;
        return {art:art,mask:mask,sweep:sweep,stage:stage,series:true,id:id,animated:animated===true,height:c.height};
    }
    function animate(fx,now){if(!fx||!fx.animated)return;var p=pose(now);fx.sweep.style.transform="translateY("+(-18+(fx.height+36)*p.progress).toFixed(2)+"px)";fx.sweep.style.opacity=p.opacity.toFixed(3);}
    GameUI.CustomUIConfig().SurvivalTitleSeriesArt={Create:create,Animate:animate,Config:config,Pose:pose};
})();
