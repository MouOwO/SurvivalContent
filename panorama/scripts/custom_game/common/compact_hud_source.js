// Shared personal-HUD stream: each real owner subscribes to its dependency
// sections. One runtime view, O(K+listeners(K)) delivery, idle does no work.
(function(factory){
 "use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig){var cfg=GameUI.CustomUIConfig(),old=cfg.SurvivalCompactHUDSource;
  if(!old||!old.IsAlive()||old.Runtime!==cfg.SurvivalCompactRuntime){if(old&&old.Dispose)old.Dispose();if(cfg.SurvivalCompactRuntime&&cfg.SurvivalCompactHUDModel&&cfg.SurvivalUICatalog)cfg.SurvivalCompactHUDSource=api.Create({runtime:cfg.SurvivalCompactRuntime,model:cfg.SurvivalCompactHUDModel.Create(cfg.SurvivalUICatalog,{playerId:Game.GetLocalPlayerID(),now:function(){return Game.GetGameTime();}})});}
 }
}(function(){
 "use strict";
 function create(options){
  var runtime=options.runtime,model=options.model,active=true,subscriptions=Object.create(null),sections=Object.create(null),serial=0,owners=0,view=null,lastError="",stats={transactions:0,deliveries:0,subscribers:0};
  function deliver(result){
   if(!result.changed)return;var targets=Object.create(null),selected=[],keys=Object.keys(result.sections),n,key,bucket,id;
   keys.push("*");for(n=0;n<keys.length;n++){key=keys[n];bucket=sections[key];if(!bucket)continue;for(id in bucket)if(Object.prototype.hasOwnProperty.call(bucket,id)&&!targets[id]){targets[id]=true;selected.push(bucket[id]);}}
   for(n=0;n<selected.length;n++){var sub=selected[n];if(sub.active){sub.callback(result.snapshot,result.sections);stats.deliveries++;}}
  }
  view=runtime.CreateView("hud",{onCommit:function(tx,changed,read){if(!active)return false;var result=model.Apply(tx,changed,read);stats.transactions++;deliver(result);},onError:function(code){lastError=code;}});
  function subscribe(owner,wanted,callback){
   if(!active)throw new Error("hud_source_disposed");if(typeof wanted==="function"){callback=wanted;wanted=["*"];}if(!Array.isArray(wanted)||typeof callback!=="function")throw new Error("hud_subscription_required");
   var id=++serial,sub={id:id,owner:owner,sections:wanted.slice(),callback:callback,active:true};subscriptions[id]=sub;owners++;stats.subscribers=owners;
   wanted.forEach(function(section){var bucket=sections[section]||(sections[section]=Object.create(null));bucket[id]=sub;});
   if(owners===1)view.Open();var current=model.Snapshot();if(current){callback(current,{full:true,resources:true,city:true,unlocks:true,wave:true,wave_setup:true});stats.deliveries++;}
   return id;
  }
  function unsubscribe(id){var sub=subscriptions[id];if(!sub)return;sub.active=false;sub.sections.forEach(function(section){delete sections[section][id];});delete subscriptions[id];owners--;stats.subscribers=owners;if(!owners)view.Close();}
  function dispose(){if(!active)return;active=false;Object.keys(subscriptions).forEach(unsubscribe);view.Dispose();model.Reset();}
  return {Runtime:runtime,Subscribe:subscribe,Unsubscribe:unsubscribe,Snapshot:function(){return model.Snapshot();},Resync:function(reason){return active?view.Resync(reason):{sent:false,error:"disposed"};},Open:function(){return active&&view.Open();},Dispose:dispose,IsAlive:function(){return active;},Inspect:function(){return {active:active,owners:owners,error:lastError,view:view.Inspect(),model:model.Inspect(),transactions:stats.transactions,deliveries:stats.deliveries};}};
 }
 return {Create:create};
}));
