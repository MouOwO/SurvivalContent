(function(){
    'use strict';
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,ctx=$.GetContextPanel();
    if(cfg.SurvivalBossWarning)cfg.SurvivalBossWarning.Dispose();
    var life=U.Lifecycle(),seen={},disposed=false,subscription;
    var root=$.CreatePanel('Panel',ctx,'HandoffBossWarning');
    root.AddClass('HandoffBossWarning');root.hittest=false;root.hittestchildren=false;root.visible=false;
    function make(type,cls,parent){var p=$.CreatePanel(type,parent||root,'');p.AddClass(cls);p.hittest=false;p.hittestchildren=false;return p;}
    make('Panel','BossWarningEdge');make('Panel','BossWarningBand');
    var design=make('Panel','BossWarningDesign');
    var icon=make('Image','BossWarningIcon',design);icon.SetImage("file://{images}/custom_game/remaining_handoff_ready/boss_warning_icon.png");icon.SetScaling('stretch-to-fit-preserve-aspect');
    make('Panel','BossWarningLineLeft',design);make('Panel','BossWarningLineRight',design);
    var title=make('Label','BossWarningTitle',design);title.text='BOSS 来袭';
    var subtitle=make('Label','BossWarningSubtitle',design);
    function hide(){life.Cancel();root.RemoveClass('BossWarningVisible');root.visible=false;}
    function show(data){
        if(disposed||!data||!data.notice_id||seen[data.notice_id])return;
        var wave=Number(data.wave_number);if(!isFinite(wave)||wave<1||Math.floor(wave)!==wave)return;
        seen[data.notice_id]=true;life.Cancel();
        var sx=Number(ctx.actualuiscale_x)||1,sy=Number(ctx.actualuiscale_y)||sx;
        var w=(Number(ctx.actuallayoutwidth)||1672)/sx,h=(Number(ctx.actuallayoutheight)||941)/sy;
        var scale=Math.min(w/1672,h/941);design.style.transform='scale3d('+scale+','+scale+',1)';
        subtitle.text='第 '+wave+' 波';root.visible=true;root.RemoveClass('BossWarningVisible');
        life.Later(.01,function(){root.AddClass('BossWarningVisible');});
        life.Later(1.8,function(){root.RemoveClass('BossWarningVisible');});
        life.Later(2.1,function(){root.visible=false;});
        $.Msg('[BOSS_WARNING_UI] notice='+data.notice_id+' wave='+wave);
    }
    subscription=GameEvents.Subscribe('survival_boss_warning',show);
    cfg.SurvivalBossWarning={Dispose:function(){if(disposed)return;disposed=true;life.Dispose();if(subscription!==undefined&&GameEvents.Unsubscribe)GameEvents.Unsubscribe(subscription);root.DeleteAsync(0);},Hide:hide};
})();
