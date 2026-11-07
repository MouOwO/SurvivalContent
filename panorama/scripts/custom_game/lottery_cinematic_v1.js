(function () {
    'use strict';
    var cfg=GameUI.CustomUIConfig();
    if(cfg.LotteryCinematic && cfg.LotteryCinematic.Dispose)cfg.LotteryCinematic.Dispose();
    var generation=0,timers=[],surface=null,movie=null,complete=null,previewLease=null,disposed=false;
    var fallback=null,fallbackImage=null,fallbackPool='',activePool='map',playing=false,previewMode=false;
    var decoderProbe=null,probeSerial=0;
    var playerProbe=null,directMovieHost=null,nativeRun=null,nativeSerial=0;
    var DECODER_PROBE_MOVIE='file://{resources}/styles/custom_game/lottery_cinematic_v1.vcss_c';
    var PLAYER_PROBE_LAYOUT='file://{resources}/layout/custom_game/lottery_movie_ab_direct.xml';
    var PLAYER_PROBE_BUFFERED_LAYOUT='file://{resources}/layout/custom_game/lottery_movie_ab_buffered.xml';
    var PLAYER_PROBE_MOVIE='file://{resources}/videos/custom_game/lottery_cinematic_v1/map.webm';
    var BUFFERED_LAYOUTS={map:'lottery_movie_map.xml',cultivation:'lottery_movie_cultivation.xml',dragon_knight:'lottery_movie_dragon_knight.xml',summer:'lottery_movie_summer.xml'};
    var BUFFERED_BAD_LAYOUT='lottery_movie_bad_media_probe.xml';
    function nativeLog(stage,run,detail){$.Msg('[LOTTERY_BUFFERED_PLAYBACK] stage='+stage+' attempt='+run.id+' pool='+run.pool+' probe='+run.probe+(detail?' '+detail:''));}
    function probeLog(stage,detail){if(decoderProbe)$.Msg('[LOTTERY_DECODER_PROBE] stage='+stage+' probe='+decoderProbe.id+' pool=map'+(detail?' '+detail:''));}
    function playerProbeLog(stage,detail){if(playerProbe)$.Msg('[LOTTERY_MOVIE_AB] stage='+stage+' probe='+playerProbe.id+' mode='+playerProbe.mode+' pool=map'+(detail?' '+detail:''));}
    // A decoder failure belongs to one presentation, not every later draw.
    var pools={map:'星门寻宝',cultivation:'云海龙吟',dragon_knight:'龙脊觉醒',summer:'潮汐秘藏'};
    var qualities=['n','r','sr','ssr','ur'];
    function valid(p){try{return p&&(!p.IsValid||p.IsValid());}catch(error){return false;}}
    function later(delay,fn){
        var token=generation,pending=timers,entry={id:null};pending.push(entry);
        entry.id=$.Schedule(delay,function(){
            var index=pending.indexOf(entry);if(index>=0)pending.splice(index,1);
            if(token===generation)fn();
        });
        return entry;
    }
    function cancelTimer(entry){
        var index=timers.indexOf(entry);if(index<0)return;
        timers.splice(index,1);if($.CancelScheduled){try{$.CancelScheduled(entry.id);}catch(error){}}
    }
    function clearTimers(){
        generation++;var pending=timers;timers=[];
        if($.CancelScheduled)pending.forEach(function(entry){try{$.CancelScheduled(entry.id);}catch(e){}});
    }
    function highest(results){var best=0;(results||[]).forEach(function(r){best=Math.max(best,qualities.indexOf(String(r.quality||'n').toLowerCase()));});return qualities[best];}
    function cancel(completedProbe){
        if(decoderProbe&&!completedProbe)probeLog('aborted','outcome=inconclusive');
        if(playerProbe&&!completedProbe)playerProbeLog('aborted','outcome=inconclusive');
        if(nativeRun&&!completedProbe)nativeLog('aborted',nativeRun,'outcome=inconclusive');
        nativeRun=null;
        decoderProbe=null;
        playerProbe=null;
        clearTimers();complete=null;playing=false;previewMode=false;
        releaseMovie();
        if(valid(fallback)){fallback.RemoveClass('LCFallbackActive');fallback.visible=false;}
        if(valid(surface))surface.visible=false;
        var root=$('#LotteryWindow');if(valid(root))root.RemoveClass('LotteryCinematicPlaying');
        var lease=previewLease;previewLease=null;
        if(lease)lease.Release();
    }
    function releaseMovie(){
        var previous=movie,owner=directMovieHost;movie=null;directMovieHost=null;
        if(valid(owner)){try{owner.DeleteAsync(0);}catch(error){}return;}
        if(valid(previous)){try{if(typeof previous.Stop==='function')previous.Stop();}catch(error){}try{previous.DeleteAsync(0);}catch(error){}}
    }
    function finish(){
        var callback=complete,preview=previewMode,pool=activePool,probe=decoderProbe,skipReveal=!!(nativeRun&&nativeRun.failure);
        if(probe)probeLog('complete','outcome='+(probe.failure&&probe.fallbackShown?probe.failure:'inconclusive'));
        if(playerProbe)playerProbeLog('complete','outcome='+(playerProbe.failure||'visual_review_required')+' fallback=false');
        if(nativeRun)nativeLog('complete',nativeRun,'outcome='+(nativeRun.failure?'skipped_'+nativeRun.failure:nativeRun.acceptedEnd?'native_ended':'unverified_completion'));
        cancel(true);if(preview)$.Msg('[LOTTERY_CINEMATIC] stage=complete pool='+pool+' preview=true');if(callback)callback(skipReveal);
    }
    function buildFallback(){
        if(!valid(surface))return false;
        if(valid(fallback)){try{fallback.DeleteAsync(0);}catch(error){}}
        fallback=null;fallbackImage=null;fallbackPool='';
        fallback=$.CreatePanel('Panel',surface,'LotteryCinematicFallback');fallback.AddClass('LotteryCinematicFallback');fallback.hittest=false;fallback.hittestchildren=false;
        fallbackImage=$.CreatePanel('Image',fallback,'LotteryFallbackTheme');fallbackImage.hittest=false;
        if(fallbackImage.SetScaling)fallbackImage.SetScaling('stretch-to-cover-preserve-aspect');
        ['Halo','Ring','Flare'].forEach(function(name){var p=$.CreatePanel('Panel',fallback,'LotteryFallback'+name);p.hittest=false;});
        return true;
    }
    function playFallback(pool,reason){
        clearTimers();releaseMovie();
        try{
            if(!buildFallback())return false;
            if(decoderProbe){decoderProbe.fallbackShown=true;probeLog('fallback','reason='+reason);}
            else if(previewMode)$.Msg('[LOTTERY_CINEMATIC] stage=fallback pool='+pool+' reason='+reason+' preview=true');
            if(fallbackPool!==pool){fallbackImage.SetImage('file://{images}/custom_game/lottery_cinematic_v1/'+pool+'.png');fallbackPool=pool;}
            fallback.RemoveClass('LCFallbackActive');fallback.visible=true;
            // A fresh fixed five-node layer cannot retain a previous CSS timeline.
            // Only this delay and completion remain scheduled; no JS frame loop.
            later(.01,function(){if(valid(fallback))fallback.AddClass('LCFallbackActive');});
            later(3.65,finish);
            return true;
        }catch(error){if(decoderProbe){decoderProbe.fallbackShown=false;probeLog('unavailable','outcome=inconclusive');}else $.Msg('[LOTTERY_CINEMATIC] themed presentation unavailable');return false;}
    }
    function checkPlayback(target,remaining){
        if(target!==movie)return;
        var failed=!valid(target),nativeError=false;
        if(!failed&&target.BHasClass){try{nativeError=target.BHasClass('MovieError');failed=nativeError;}catch(error){failed=true;}}
        if(failed){
            // Valve's stock movie.vcss uses .MovieError #ErrorMessage for
            // asynchronous decoder failure. This is a native class, not a
            // guessed JS event; animate the current theme before the already
            // received draw results. No new draw or reward request is sent.
            if(decoderProbe){
                if(!nativeError){probeLog('inconclusive','cause=panel_or_class_read');finish();return;}
                decoderProbe.failure='native_error';probeLog('error','cause=native_error native_class=MovieError');
            }else $.Msg('[LOTTERY_CINEMATIC] native playback failed; using themed presentation');
            if(!playFallback(activePool,'native_error'))finish();return;
        }
        if(remaining>1)later(.10,function(){checkPlayback(target,remaining-1);});
    }
    function build(){
        if(valid(surface))return true;
        // Film owns the whole viewport, outside every scaled menu/content host.
        var canvas=$('#LotteryWindow');
        if(!valid(canvas))return false;
        surface=$.CreatePanel('Panel',canvas,'LotteryCinematicSurface');surface.AddClass('LotteryCinematicSurface');surface.hittest=true;surface.visible=false;
        surface.style.position='0px 0px 0px';surface.style.width='100%';surface.style.height='100%';
        var backdrop=$.CreatePanel('Panel',surface,'LotteryCinematicBackdrop');backdrop.AddClass('LotteryCinematicBackdrop');backdrop.hittest=false;
        var caption=$.CreatePanel('Label',surface,'LotteryCinematicCaption');caption.AddClass('LotteryCinematicCaption');caption.hittest=false;
        var skip=$.CreatePanel('Button',surface,'LotteryCinematicSkip');skip.AddClass('LotteryCinematicSkip');skip.hittestchildren=false;
        var text=$.CreatePanel('Label',skip,'');text.text='跳过演出  ›';
        skip.SetPanelEvent('onactivate',function(){if(!playing)return;if(previewLease||decoderProbe||playerProbe){cancel();return;}var cb=cfg.SurvivalLottery;if(cb&&cb.SkipCinematic){cancel();cb.SkipCinematic();}else finish();});
        return true;
    }
    function resize(w,h){
        if(!valid(movie))return;
        if(!(w>0&&h>0)){
            var viewport=cfg.LotteryHandoff&&cfg.LotteryHandoff.Viewport?cfg.LotteryHandoff.Viewport():null;
            var root=$('#LotteryWindow');
            w=viewport?viewport.width:(valid(root)&&root.actuallayoutwidth||1280)/(valid(root)&&root.actualuiscale_x||1);
            h=viewport?viewport.height:(valid(root)&&root.actuallayoutheight||720)/(valid(root)&&root.actualuiscale_y||1);
        }
        // Keep the entire 16:9 film visible. Cover scaling clips the animation
        // on ultrawide / 4:3 windows; the surface supplies letterbox bars instead.
        var scale=Math.min(w/1280,h/720);
        movie.style.width=(1280*scale)+"px";movie.style.height=(720*scale)+"px";
    }
    function prepare(pool,results,onDone,lease){
        cancel();previewLease=lease||null;
        if(disposed||!build()){cancel();return null;}
        pool=Object.prototype.hasOwnProperty.call(pools,pool)?pool:'map';
        activePool=pool;complete=onDone;playing=true;surface.visible=true;
        var caption=$('#LotteryCinematicCaption');caption.text=pools[pool];
        qualities.forEach(function(q){surface.SetHasClass('LCQuality_'+q,q===highest(results));});
        $('#LotteryWindow').AddClass('LotteryCinematicPlaying');
        return pool;
    }
    function previewNative(pool){
        if(typeof Game==='undefined'||!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var lease=beginPreview();if(!lease)return false;
        pool=prepare(pool,[],function(){},lease);if(pool===null)return false;
        previewMode=true;$.Msg('[LOTTERY_CINEMATIC] stage=preview pool='+pool);
        if(playFallback(pool,'tools_preview'))return true;cancel();return false;
    }
    function playMedia(pool,results,onDone,preview,probe,lease){
        pool=prepare(pool,results,onDone,lease);if(pool===null)return false;
        previewMode=!!preview;
        if(probe){decoderProbe={id:++probeSerial,failure:'',fallbackShown:false};probeLog('begin','resource=panorama/styles/custom_game/lottery_cinematic_v1.vcss_c no_consumption=true');}
        else if(previewMode)$.Msg('[LOTTERY_CINEMATIC] stage=preview pool='+pool);
        var mediaApi=null;
        try{
            // A fresh native Movie owns both the video and its original synchronized soundtrack.
            movie=$.CreatePanel('Movie',surface,'LotteryCinematicMovie');movie.AddClass('LotteryCinematicMovie');movie.hittest=false;movie.hittestchildren=false;
            movie.SetControls('none');movie.SetRepeat(false);movie.SetPlaybackVolume(.85);
            resize();
            if(decoderProbe)probeLog('set_movie','resource=panorama/styles/custom_game/lottery_cinematic_v1.vcss_c');
            mediaApi='SetMovie';movie.SetMovie(decoderProbe?DECODER_PROBE_MOVIE:'file://{resources}/videos/custom_game/lottery_cinematic_v1/'+pool+'.webm');
            mediaApi='Play';movie.Play();mediaApi=null;
        }catch(error){
            if(decoderProbe){
                if(!mediaApi){probeLog('inconclusive','cause=setup_error');finish();return false;}
                decoderProbe.failure='sync_error';probeLog('error','cause=sync_error api='+mediaApi);
            }else $.Msg('[LOTTERY_CINEMATIC] playback unavailable; using themed presentation');
            if(playFallback(pool,'sync_error'))return true;cancel();return false;
        }
        // Asset length is exactly 7 seconds. Watchdog also handles a decoder that never sends its ending event.
        later(7.05,finish);
        // At most70 O(1) native-class reads; only this poll and the watchdog
        // remain scheduled. No HUD/scene collection is traversed per check.
        var currentMovie=movie;later(.10,function(){checkPlayback(currentMovie,70);});
        return true;
    }
    function playBuffered(pool,results,onDone,preview,badProbe,lease){
        pool=prepare(pool,results,onDone,lease);if(pool===null)return false;
        previewMode=!!preview;
        if(previewMode)$.Msg('[LOTTERY_CINEMATIC] stage=preview pool='+pool);
        var run={id:++nativeSerial,pool:pool,probe:!!badProbe,token:generation,initialized:false,startedAt:0,terminal:false,acceptedEnd:false,failure:'',startup:null};
        nativeRun=run;nativeLog('begin',run,'loadbehavior=buffer-async source='+(badProbe?'fixed_invalid_media':'pool_movie'));
        var target=null;
        function owns(){return nativeRun===run&&run.token===generation&&!run.terminal&&movie===target;}
        function fail(reason,evidence){
            if(!owns())return;run.terminal=true;run.failure=reason;nativeLog('failure',run,'reason='+reason+' action='+(preview?'return_to_preview_idle':'return_to_received_results')+(evidence?' '+evidence:''));
            finish();
        }
        try{
            directMovieHost=$.CreatePanel('Panel',surface,'LotteryBufferedMovieHost');
            directMovieHost.style.width='100%';directMovieHost.style.height='100%';directMovieHost.style.zIndex='1';
            directMovieHost.hittest=false;directMovieHost.hittestchildren=false;
            var layout='file://{resources}/layout/custom_game/'+(badProbe?BUFFERED_BAD_LAYOUT:BUFFERED_LAYOUTS[pool]);
            if(!directMovieHost.BLoadLayout(layout,false,false))throw new Error('buffered_layout_failed');
            movie=directMovieHost.FindChildTraverse('LotteryCinematicMovie');
            if(!valid(movie))throw new Error('buffered_moviepanel_missing');
            target=movie;movie.hittest=false;movie.hittestchildren=false;resize();
            // These exact two child-panel events were delivered by the native
            // probe06 valid and invalid media tests. The native spelling is
            // Initalized. No global listener, guessed IsPlaying, class poll or
            // unavailable UnregisterEventHandler is used. Deleting this owned
            // child retires its handlers; generation/object guards reject late
            // callbacks from old or cancelled presentations.
            $.RegisterEventHandler('VideoPlayerInitalized',target,function(){
                if(!owns()||run.initialized)return;
                run.initialized=true;run.startedAt=Date.now();cancelTimer(run.startup);nativeLog('initialized',run);
            });
            $.RegisterEventHandler('VideoPlayerEnded',target,function(){
                if(!owns())return;
                if(!run.initialized){fail('ended_before_initialized','event=VideoPlayerEnded initialized=false');return;}
                var elapsed=Date.now()-run.startedAt;
                if(elapsed<6000){fail('early_end','event=VideoPlayerEnded initialized=true elapsed_ms='+elapsed);return;}
                run.terminal=true;run.acceptedEnd=true;nativeLog('ended',run,'elapsed_ms='+elapsed);finish();
            });
        }catch(error){
            run.terminal=true;run.failure='setup_error';nativeLog('failure',run,'reason=setup_error action='+(preview?'return_to_preview_idle':'return_to_received_results'));
            finish();return true;
        }
        // Two finite O(1) deadlines, not a refresh loop. Healthy native events
        // complete around the seven-second asset duration and cancel both.
        // Bad-media Ended-before-Initalized immediately returns to the already
        // received results. No second animation, retry or server request.
        if(run.terminal||nativeRun!==run||run.token!==generation)return true;
        run.startup=later(5,function(){if(!run.initialized)fail('startup_timeout');});
        later(12,function(){fail('completion_timeout');});
        if(run.initialized)cancelTimer(run.startup);
        return true;
    }
    function play(pool,results,onDone,preview){return playBuffered(pool,results,onDone,preview,false);}

    function beginPreview(){
        var controller=cfg.SurvivalLottery;
        if(disposed||playing||!controller||!controller.CanPreviewCinematic||!controller.OpenForCinematicPreview||!controller.CanPreviewCinematic())return null;
        return controller.OpenForCinematicPreview();
    }
    function preview(pool){
        var lease=beginPreview();if(!lease)return false;
        return playBuffered(pool,[],function(){},true,false,lease);
    }
    function previewBufferedDecoderProbe(){
        var lease=beginPreview();if(!lease)return false;
        return playBuffered('map',[],function(){},true,true,lease);
    }
    function previewDecoderProbe(){
        // No draw/read/grant call, no arbitrary URL, and no interruption of an active presentation.
        var lease=beginPreview();
        if(!lease){$.Msg('[LOTTERY_DECODER_PROBE] stage=rejected cause=controller_not_idle');return false;}
        return playMedia('map',[],function(){},false,true,lease);
    }
    function previewPlayerAB(mode){
        // Explicit visual-only comparison, never a draw or an automatic fallback.
        // Fixed two-node direct layout, one lookup at creation. Six finite O(1)
        // samples plus cleanup; idle work/network calls are zero. Cancel/Dispose
        // invalidates every sample through the existing generation token.
        // Buffered comparison explicitly requests native buffer-async loading;
        // at most one 3,014,654-byte map film is active. It is a diagnostic only:
        // native file/decoder behavior must be observed, never inferred here.
        if(mode!=='wrapper'&&mode!=='direct'&&mode!=='buffered'){
            $.Msg('[LOTTERY_MOVIE_AB] stage=rejected cause=invalid_mode');return false;
        }
        var lease=beginPreview();
        if(!lease){$.Msg('[LOTTERY_MOVIE_AB] stage=rejected cause=controller_not_idle');return false;}
        if(prepare('map',[],function(){},lease)===null)return false;
        playerProbe={id:++probeSerial,mode:mode,failure:''};
        playerProbeLog('begin','resource=panorama/videos/custom_game/lottery_cinematic_v1/map.webm no_consumption=true fallback=false');
        try{
            if(mode==='wrapper'){
                movie=$.CreatePanel('Movie',surface,'LotteryCinematicMovie');movie.AddClass('LotteryCinematicMovie');movie.hittest=false;movie.hittestchildren=false;
                movie.SetControls('none');movie.SetRepeat(false);movie.SetPlaybackVolume(.85);resize();
                movie.SetMovie(PLAYER_PROBE_MOVIE);movie.Play();
            }else{
                // A real Panel root owns the MoviePanel child. Loading a snippet
                // whose root itself is MoviePanel does not construct that child.
                directMovieHost=$.CreatePanel('Panel',surface,'LotteryMovieABHost');
                directMovieHost.style.width='100%';directMovieHost.style.height='100%';directMovieHost.style.zIndex='1';
                directMovieHost.hittest=false;directMovieHost.hittestchildren=false;
                var layout=mode==='buffered'?PLAYER_PROBE_BUFFERED_LAYOUT:PLAYER_PROBE_LAYOUT;
                if(!directMovieHost.BLoadLayout(layout,false,false))throw new Error('direct_layout_failed');
                movie=directMovieHost.FindChildTraverse('LotteryCinematicMovie');
                if(!valid(movie))throw new Error('direct_panel_missing');
                movie.hittest=false;movie.hittestchildren=false;resize();
            }
        }catch(error){
            playerProbe.failure='setup_error';playerProbeLog('error','cause=setup_error');finish();return false;
        }
        var current=movie,ownProbe=playerProbe;
        [.2,.8,2.2,4,6.2,7].forEach(function(seconds){later(seconds,function(){
            if(playerProbe!==ownProbe||movie!==current)return;
            var alive=valid(current),nativeError='not_exposed';
            if(mode==='wrapper'&&alive){
                try{nativeError=!!current.BHasClass('MovieError');}catch(error){nativeError='unavailable';}
                if(nativeError===true&&playerProbe.failure!=='native_error'){playerProbe.failure='native_error';playerProbeLog('error','cause=native_error fallback=false');}
            }
            if(!alive)playerProbe.failure='panel_lost';
            playerProbeLog('sample','t='+seconds+' valid='+alive+' native_movieerror='+nativeError+' visual_verdict=unreviewed');
        });});
        later(7.15,finish);return true;
    }
    cfg.LotteryCinematic={PreviewPlayerAB:previewPlayerAB,PreviewDecoderProbe:previewDecoderProbe,PreviewBufferedDecoderProbe:previewBufferedDecoderProbe,Play:play,Resize:resize,Cancel:cancel,Finish:finish,Highest:highest,Dispose:function(){cancel();disposed=true;if(valid(surface))surface.DeleteAsync(0);surface=null;fallback=null;fallbackImage=null;fallbackPool='';},
        Preview:preview,PreviewNative:previewNative};
    if(typeof Game!=='undefined'&&Game.AddCommand){
        var stamp=Date.now();Object.keys(pools).forEach(function(pool){Game.AddCommand('lottery_film_'+pool+'_'+stamp,function(){cfg.LotteryCinematic.Preview(pool);},'Preview cinematic only; no draw, ticket consumption or reward grant',0);});
        Game.AddCommand('lottery_film_decoder_probe_map_'+stamp,previewDecoderProbe,'Zero-consumption native decoder failure preview; fixed existing non-video resource only',0);
        Game.AddCommand('lottery_film_buffered_decoder_probe_map_'+stamp,previewBufferedDecoderProbe,'Zero-consumption fixed invalid buffered media; native failure and fallback verification',0);
        ['wrapper','direct','buffered'].forEach(function(mode){Game.AddCommand('lottery_film_ab_'+mode+'_map_'+stamp,function(){previewPlayerAB(mode);},'Fixed zero-consumption player comparison; no automatic fallback, draw or grant',0);});
        $.Msg('[LOTTERY_CINEMATIC_READY] version=v1 commands='+stamp);
        $.Msg('[LOTTERY_MOVIE_AB_READY] commands='+stamp+' modes=wrapper,direct,buffered fixed_pool=map');
        if(Game.IsInToolsMode&&Game.IsInToolsMode()){
            Object.keys(pools).forEach(function(pool){Game.AddCommand('lottery_film_native_'+pool+'_'+stamp,function(){previewNative(pool);},'Tools-only native theme preview; no draw, ticket use or reward',0);});
            $.Msg('[LOTTERY_CINEMATIC_NATIVE_READY] commands='+stamp);
        }
    }
})();
