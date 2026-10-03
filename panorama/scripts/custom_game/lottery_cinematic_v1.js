(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig();
    if(cfg.LotteryCinematic && cfg.LotteryCinematic.Dispose)cfg.LotteryCinematic.Dispose();
    var generation=0,timers=[],surface=null,movie=null,complete=null;
    var pools={map:'星门寻宝',cultivation:'云海龙吟',dragon_knight:'龙脊觉醒',summer:'潮汐秘藏'};
    var qualities=['n','r','sr','ssr','ur'];
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function later(delay,fn){var token=generation;timers.push($.Schedule(delay,function(){if(token===generation)fn();}));}
    function clearTimers(){generation++;if($.CancelScheduled)timers.forEach(function(t){try{$.CancelScheduled(t);}catch(e){}});timers=[];}
    function highest(results){var best=0;(results||[]).forEach(function(r){best=Math.max(best,qualities.indexOf(String(r.quality||'n').toLowerCase()));});return qualities[best];}
    function cancel(){
        clearTimers();complete=null;
        if(valid(movie)){try{movie.Stop();}catch(e){} movie.DeleteAsync(0);}movie=null;
        if(valid(surface))surface.visible=false;
        var root=$('#LotteryWindow');if(valid(root))root.RemoveClass('LotteryCinematicPlaying');
    }
    function finish(){var callback=complete;cancel();if(callback)callback();}
    function build(){
        if(valid(surface))return true;
        var canvas=$('#LotteryWindow');if(!valid(canvas))return false;
        surface=$.CreatePanel('Panel',canvas,'LotteryCinematicSurface');surface.AddClass('LotteryCinematicSurface');surface.hittest=true;surface.visible=false;
        var backdrop=$.CreatePanel('Panel',surface,'LotteryCinematicBackdrop');backdrop.AddClass('LotteryCinematicBackdrop');backdrop.hittest=false;
        var caption=$.CreatePanel('Label',surface,'LotteryCinematicCaption');caption.AddClass('LotteryCinematicCaption');caption.hittest=false;
        var skip=$.CreatePanel('Button',surface,'LotteryCinematicSkip');skip.AddClass('LotteryCinematicSkip');skip.hittestchildren=false;
        var text=$.CreatePanel('Label',skip,'');text.text='跳过演出  ›';
        skip.SetPanelEvent('onactivate',function(){var cb=cfg.SurvivalLottery;if(cb&&cb.SkipCinematic)cb.SkipCinematic();else finish();});
        return true;
    }
    function resize(w,h){
        if(!valid(movie))return;
        if(!(w>0&&h>0)){
            var viewport=cfg.LotteryHandoff&&cfg.LotteryHandoff.Viewport?cfg.LotteryHandoff.Viewport():null;
            var root=$('#LotteryWindow');
            w=viewport?viewport.width:(root.actuallayoutwidth||1280)/(root.actualuiscale_x||1);
            h=viewport?viewport.height:(root.actuallayoutheight||720)/(root.actualuiscale_y||1);
        }
        // Keep the entire 16:9 film visible. Cover scaling clips the animation
        // on ultrawide / 4:3 windows; the surface supplies letterbox bars instead.
        var scale=Math.min(w/1280,h/720);
        movie.style.width=(1280*scale)+"px";movie.style.height=(720*scale)+"px";
    }
    function play(pool,results,onDone){
        cancel();if(!build())return false;
        pool=Object.prototype.hasOwnProperty.call(pools,pool)?pool:'map';
        complete=onDone;surface.visible=true;
        var caption=$('#LotteryCinematicCaption');caption.text=pools[pool];
        qualities.forEach(function(q){surface.SetHasClass('LCQuality_'+q,q===highest(results));});
        $('#LotteryWindow').AddClass('LotteryCinematicPlaying');
        try{
            // A fresh native Movie owns both the video and its original synchronized soundtrack.
            movie=$.CreatePanel('Movie',surface,'LotteryCinematicMovie');movie.AddClass('LotteryCinematicMovie');movie.hittest=false;movie.hittestchildren=false;
            movie.SetControls('none');movie.SetRepeat(false);movie.SetPlaybackVolume(.85);
            resize();
            movie.SetMovie('file://{resources}/videos/custom_game/lottery_cinematic_v1/'+pool+'.webm');movie.Play();
        }catch(error){$.Msg('[LOTTERY_CINEMATIC] playback unavailable: '+String(error));cancel();return false;}
        // Asset length is exactly 7 seconds. Watchdog also handles a decoder that never sends its ending event.
        later(7.05,finish);
        return true;
    }
    cfg.LotteryCinematic={Play:play,Resize:resize,Cancel:cancel,Finish:finish,Highest:highest,Dispose:function(){cancel();if(valid(surface))surface.DeleteAsync(0);surface=null;},
        Preview:function(pool){if(cfg.SurvivalLottery)cfg.SurvivalLottery.Open();play(pool,[],function(){});}};
    if(typeof Game!=='undefined'&&Game.AddCommand){
        var stamp=Date.now();Object.keys(pools).forEach(function(pool){Game.AddCommand('lottery_film_'+pool+'_'+stamp,function(){cfg.LotteryCinematic.Preview(pool);},'Preview cinematic only; no draw, ticket consumption or reward grant',0);});
        $.Msg('[LOTTERY_CINEMATIC_READY] version=v1 commands='+stamp);
    }
})();
