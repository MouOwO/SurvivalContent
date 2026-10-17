(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),ctx=$.GetContextPanel();
    if(cfg.SurvivalEnemyPopulationWarning)cfg.SurvivalEnemyPopulationWarning.Dispose();
    var panel=$.CreatePanel("Panel",ctx,"HandoffEnemyPopulationWarning"),active=false,disposed=false,alive=0,limit=0;
    panel.AddClass("EnemyPopulationWarning");panel.hittest=false;panel.hittestchildren=false;panel.visible=false;
    ["Top","Bottom","Left","Right"].forEach(function(edge){
        var child=$.CreatePanel("Panel",panel,"");child.AddClass("EnemyWarningEdge");child.AddClass("EnemyWarning"+edge);
        child.hittest=false;child.hittestchildren=false;
    });
    var caption=$.CreatePanel("Label",panel,"HandoffEnemyWarningText");caption.AddClass("EnemyWarningText");
    caption.text="即将超过怪物存在的上限";caption.hittest=false;caption.hittestchildren=false;
    function enabled(value){return value===true||Number(value)===1;}
    function render(wave){
        if(disposed||!ctx.IsValid()||!panel.IsValid())return;
        wave=wave||{};alive=Math.max(0,Math.floor(Number(wave.alive)||0));limit=Number(wave.alive_limit);
        var next=isFinite(alive)&&alive>85&&isFinite(limit)&&limit>0
            &&wave.game_mode!=="fishing"&&wave.status!=="fishing"
            &&!enabled(wave.player_defeated)&&!enabled(wave.defeat_settled)
            &&!enabled(wave.victory_settled)&&!enabled(wave.post_clear_frozen);
        // Only crossing the threshold starts/stops the shared CSS animation.
        // Normal count snapshots do not restart the pulse or rebuild its text.
        if(next===active)return;
        active=next;panel.SetHasClass("Active",active);panel.visible=active;
    }
    cfg.SurvivalEnemyPopulationWarning={Render:render,
        Inspect:function(){return {active:active,alive:alive,limit:isFinite(limit)?limit:0,threshold:85};},
        Dispose:function(){if(disposed)return;disposed=true;active=false;if(panel.IsValid())panel.DeleteAsync(0);}
    };
})();
