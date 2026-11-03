// One cw subscription and one admission-triggered bootstrap per HUD lifetime.
// No polling, catalogue downloads or routine acknowledgements. All outbound
// payloads are typed integer controls, through the shared 24-ASCII codec.
(function(factory){
 "use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig){
  var cfg=GameUI.CustomUIConfig();
  var existing=cfg.SurvivalCompactRuntime,catalogue=cfg.SurvivalUICatalog&&cfg.SurvivalUICatalog.Data;
  if(existing&&existing.BuildVersion===api.BuildVersion&&catalogue&&existing.Inspect){var state=existing.Inspect();if(state.active&&state.schema_sha256===catalogue.sha256)return;}
  if(existing&&existing.Dispose)existing.Dispose();
  if(cfg.SurvivalCompactWire&&cfg.SurvivalUICatalog){
   var memo=cfg.SurvivalCompactRuntimeMemo||(cfg.SurvivalCompactRuntimeMemo={intent_token:0,sessions:{},retired:[]});
   cfg.SurvivalCompactRuntime=api.CreateRuntime({wire:cfg.SurvivalCompactWire,catalogue:cfg.SurvivalUICatalog,memo:memo,
    send:function(event,packet){GameEvents.SendCustomGameEventToServer(event,packet);return true;},
    subscribe:function(event,fn){return GameEvents.Subscribe(event,fn);},unsubscribe:function(id){GameEvents.Unsubscribe(id);},
    getLoading:function(){return CustomNetTables.GetTableValue("survival_loading","state");},
    subscribeLoading:function(fn){return CustomNetTables.SubscribeNetTableListener("survival_loading",function(table,key){if(key==="state")fn();});},
    unsubscribeLoading:function(id){if(CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(id);},
    schedule:function(ms,fn){return $.Schedule(ms/1000,fn);},cancel:function(id){$.CancelScheduled(id);},
    now:function(){return Date.now();}
   });
  }
 }
}(function(){
 "use strict";
 var BUILD="compact_ui_runtime_20261103_v3";
 var ACTIONS={daily_claim:1,benefit_claim:2,pass_purchase:3,lottery_draw:4,archive_title:5,archive_action:6,lottery_read:7};
 var ERRORS={schema_mismatch:"界面版本与服务器不一致，请更新游戏后重新进入。",schema_unknown:"界面协议不一致，请更新游戏后重新进入。",not_ready:"正在核对界面版本，请稍后。",token_exhausted:"本次会话的操作编号已用完，请重新进入游戏。",revision_exhausted:"本次会话的消息编号已用完，请重新进入游戏。",native_send_failed:"同步消息未能发送，请重新打开界面。",application_rejected:"界面数据校验失败，正在重新同步。"};
 function need(ok,code){if(!ok)throw new Error(code);}
 function integer(n,min,max){return typeof n==="number"&&isFinite(n)&&Math.floor(n)===n&&n>=min&&n<=max;}
 function errorText(code){return ERRORS[code]||"界面同步未完成，请重新打开。";}
 function create(options){
  options=options||{};var W=options.wire,C=options.catalogue&&options.catalogue.Data||options.catalogue;
  need(W&&W.Encode&&W.PeekHeader&&C&&C.sha256,"compact_runtime_dependencies_required");
  var schema=W.CompileLookup(C,1),F=Object.create(null),records=Object.create(null),views=Object.create(null),keys=Object.create(null),allViews=[],memo=options.memo||{intent_token:0,sessions:{},retired:[]};
  C.fields.forEach(function(f){F[f.name]=f.id;});C.records.forEach(function(r){if(!r.tombstone)records[r.key]=r.id;});
  var control=records["wire:control"],helloWords=[],helloByRecord=Object.create(null),word;
  need(control&&F.count&&F.visible&&F.known&&F.action_code&&F.arg_a&&F.arg_b&&F.arg_c&&F.request_token,"compact_control_schema_missing");
  for(word=1;word<=8;word++){var rec=records["wire:hello:"+word];need(rec,"compact_hello_schema_missing");helloWords.push(rec);helloByRecord[rec]=word-1;}
  keys.hud=2;keys.daily=3;
  var categories=C.auxiliary&&C.auxiliary.archive_projection&&C.auxiliary.archive_projection.categories||[];
  categories.forEach(function(row,index){keys["archive:"+row.id]=101+index;});
  var pools=C.auxiliary&&C.auxiliary.lottery_public&&C.auxiliary.lottery_public.snapshots||[];
  pools.forEach(function(row,index){need(row.selected_pool&&row.selected_pool.id,"compact_pool_catalogue_missing");keys["lottery:"+row.selected_pool.id]=201+index;});
  var active=true,generation=1,ready=false,admitted=false,loadingIdentity=memo.loading_identity||null,session=null,helloReceiver=null,helloSession=null,helloRequested=false,helloFailed=false,helloTimer=null,helloResyncPending=false,subscription=null,loadingSubscription=null,lastError="";
  var counters={received:0,sent:0,stale:0,rejected:0,hello_requests:0,hello_commits:0,view_commits:0,resyncs:0,controls:0,intents:0};
  function recordSession(value){var key=String(value);if(!memo.sessions[key])memo.sessions[key]={};return memo.sessions[key];}
  function binding(view,epoch,token){return {schema:1,schema_sha256:C.sha256,session:token===undefined?session:token,epoch:epoch,view:view};}
  function bootstrap(){return binding(1,1,1);}
  function retired(value){return memo.retired.indexOf(value)>=0;}
  function retire(value){if(value===null||value===undefined||retired(value))return;memo.retired.push(value);if(memo.retired.length>8){var old=memo.retired.shift();delete memo.sessions[String(old)];}}
  function notify(view,code){lastError=code;if(view){if(view.lastError===code)return;view.lastError=code;var consumer=view.consumer;if(consumer&&consumer.active&&consumer.options.onError){try{consumer.options.onError(code);}catch(ignored){}}}else allViews.forEach(function(v){notify(v,code);});}
  function send(packet){need(packet&&typeof packet.d==="string"&&packet.d.length<=24&&Object.keys(packet).length===1,"compact_packet_budget");var result=options.send("cw",packet);need(result!==false,"native_send_failed");counters.sent++;return true;}
  function cancelHello(){if(helloTimer!==null&&options.cancel)options.cancel(helloTimer);helloTimer=null;}
  function requestHello(reason,failure){
   if(!active||!admitted||helloFailed)return false;if(failure){if(helloResyncPending)return false;helloResyncPending=true;}else if(helloRequested)return false;
   helloRequested=true;try{send(W.EncodeResync(schema,bootstrap(),0,reason||1));counters.hello_requests++;return true;}catch(error){notify(null,error.message);return false;}
  }
  function resetBindings(){
   ready=false;helloReceiver=null;helloSession=null;cancelHello();
   allViews.forEach(function(v){if(v.client)v.client.Dispose();v.client=null;v.epoch=0;v.closedEpoch=0;v.resyncPending=false;v.lastError="";v.sentDesired=null;});
  }
  function loadingChanged(){
   if(!active)return;var state=options.getLoading?options.getLoading():{admission_complete:1};
   // Admission precedes mode selection and account-profile preparation. The
   // server's private gate only opens after profiles_ready; send our one Hello
   // on that real NetTable transition instead of losing it during admission.
   var next=!!state&&(state.admission_complete===true||Number(state.admission_complete)===1)
    &&(state.profiles_ready===true||Number(state.profiles_ready)===1),identity=state&&(state.session_id||state.match_session_id)||null;
   if(typeof identity!=="string"||!/^[A-Za-z0-9_.:-]{8,128}$/.test(identity))identity=null;
   if(loadingIdentity!==null&&identity!==null&&identity!==loadingIdentity){
    // The actual startup_loading_service publishes a new long session_id for
    // every world. Short aliases are meaningful only inside that namespace.
    memo.sessions={};memo.retired=[];memo.current_session=null;session=null;resetBindings();helloRequested=false;helloFailed=false;helloResyncPending=false;generation++;
   }
   if(identity!==null){loadingIdentity=identity;memo.loading_identity=identity;}
   if(!next&&admitted){resetBindings();helloRequested=false;helloResyncPending=false;generation++;}
   admitted=next&&identity!==null;if(admitted)requestHello(1,false);
  }
  function controlOps(values){return Object.keys(values).map(function(name){need(F[name]!==undefined,"control_field_unknown");return {record:control,field:F[name],value:values[name]};});}
  function emitControl(view,values){
   if(!ready||!session)return {sent:false,error:"not_ready"};var sessions=recordSession(session),out=sessions[view.id];
   if(!out)out=sessions[view.id]={revision:0,needsFull:true};
   if(out.revision>=1048575){notify(view,"revision_exhausted");return {sent:false,error:"revision_exhausted"};}
   var encoded;try{encoded=W.Encode(schema,binding(view.id,1),out.revision+1,controlOps(values),{full:out.needsFull===true,value_budget:24});}catch(error){notify(view,error.message);return {sent:false,error:error.message};}
   out.revision++;try{encoded.packets.forEach(send);out.needsFull=false;counters.controls++;return {sent:true};}catch(error){out.needsFull=true;notify(view,error.message);return {sent:false,error:error.message};}
  }
  function desiredControl(view){
   if(!ready||!view.consumer||!view.consumer.active||view.desired===null||view.sentDesired===view.desired)return {sent:false,unchanged:true};
   var values={visible:view.desired==="open"?1:0,known:view.desired==="probe"?1:0},result=emitControl(view,values);if(result.sent)view.sentDesired=view.desired;return result;
  }
  function resync(view,reason,epoch){
   if(!active||!ready||view.resyncPending||!view.consumer||!view.consumer.active||view.desired!=="open")return {sent:false,unchanged:true};
   reason=integer(reason,1,5)?reason:5;epoch=epoch||view.epoch;if(!integer(epoch,1,16383))return {sent:false,error:"not_ready"};
   view.resyncPending=true;var revision=view.client&&epoch===view.epoch?view.client.Inspect().receiver.revision:0;
   try{send(W.EncodeResync(schema,binding(view.id,epoch),revision,reason));counters.resyncs++;return {sent:true};}catch(error){notify(view,error.message);return {sent:false,error:error.message};}
  }
  function hint(view,read){
   if(view.id!==3)return;var state=records["daily:state"],known=read(state,F.known),claimable=read(state,F.can_claim);if(known===undefined||claimable===undefined)return;
   var signature=known+":"+claimable;if(signature===view.hintSignature)return;view.hintSignature=signature;var consumer=view.consumer;if(consumer&&consumer.active&&consumer.options.onHint)consumer.options.onHint({known:known,claimable:claimable});
  }
  function newClient(view,epoch){
   var clientGeneration=generation,client;
   client=W.NewClient(schema,binding(view.id,epoch),{value_budget:24,assembly_bytes:262144,max_fragments:16383,now:options.now,schedule:options.schedule,cancel:options.cancel,
    validate:function(tx){
     if(view.desired==="open")return true;
     if(view.id!==3)return false;var state=records["daily:state"];
     for(var n=0;n<tx.changes.length;n++){var c=tx.changes[n];if(c.record!==state||c.remove||c.field!==F.known&&c.field!==F.can_claim)return false;}return true;
    },
    onResync:function(packet,reason){if(active&&clientGeneration===generation&&view.client===client)resync(view,reason);},
    onCommit:function(tx,changed,read){
     if(!active||clientGeneration!==generation||view.client!==client)return;
     var consumer=view.consumer;if(!consumer||!consumer.active)return;
     if(view.desired!=="open"){hint(view,read);return;}
     try{if(consumer.options.onCommit&&consumer.options.onCommit(tx,changed,read)===false)throw new Error("application_rejected");
      if(tx.full)view.resyncPending=false;view.lastError="";counters.view_commits++;hint(view,read);
     }catch(error){notify(view,error.message||"application_rejected");resync(view,5);}
    }
   });return client;
  }
  function hello(packet,header){
   if(header.kind!=="full"||header.epoch!==1||header.schema!==1||retired(header.session)){counters.stale++;return;}
   if(helloSession!==header.session){cancelHello();helloSession=header.session;helloReceiver=W.NewReceiver(schema,binding(1,1,header.session),{assembly_bytes:256,max_fragments:64});}
   var tx;try{tx=helloReceiver.Accept(packet);}catch(error){if(error.message==="stale_revision"||error.message==="stale_fragment"){counters.stale++;return;}helloReceiver.Abort();notify(null,error.message);requestHello(4,true);return;}
   if(tx.pending){if(helloTimer===null&&options.schedule){var own=generation;helloTimer=options.schedule(5000,function(){helloTimer=null;if(active&&own===generation&&helloReceiver&&helloReceiver.Inspect().assembling){helloReceiver.Abort();requestHello(2,true);}});}return;}
   cancelHello();var words=[],n,c,valid=tx.full&&tx.changes.length===8;
   for(n=0;valid&&n<tx.changes.length;n++){c=tx.changes[n];var index=helloByRecord[c.record];if(index===undefined||c.field!==F.count||c.remove||words[index]!==undefined)valid=false;else words[index]=("00000000"+c.value.toString(16)).slice(-8);}
   if(!valid||words.join("")!==C.sha256){helloReceiver.Abort();helloFailed=true;ready=false;resetBindings();notify(null,"schema_mismatch");return;}
   helloReceiver.Commit(tx);helloResyncPending=false;counters.hello_commits++;
   var changedSession=session!==header.session;if(changedSession){retire(session);session=header.session;memo.current_session=session;generation++;allViews.forEach(function(v){if(v.client)v.client.Dispose();v.client=null;v.epoch=0;v.closedEpoch=0;v.sentDesired=null;v.resyncPending=false;v.hintSignature=null;});}
   ready=true;lastError="";allViews.forEach(desiredControl);
  }
  function receive(packet){
   if(!active||!admitted)return;counters.received++;var header;
   try{header=W.PeekHeader(packet,{value_budget:24});}catch(error){counters.rejected++;return;}
   if(header.view===1){if(!helloFailed)hello(packet,header);return;}
   if(!ready||header.session!==session||retired(header.session)){counters.stale++;return;}
   var view=views[header.view];if(!view||!view.consumer||!view.consumer.active||view.desired===null){counters.stale++;return;}
   if(header.schema!==1){notify(view,"schema_unknown");resync(view,3,header.epoch);return;}
   if(header.epoch<view.epoch||view.desired!=="open"&&header.epoch<=view.closedEpoch){counters.stale++;return;}
   if(header.epoch>view.epoch){if(!header.full||header.revision!==1){resync(view,1,header.epoch);return;}
    if(view.client)view.client.Dispose();view.epoch=header.epoch;view.client=newClient(view,header.epoch);
   }else if(header.full&&header.revision!==1){resync(view,4);return;}
   if(!view.client){resync(view,1,header.epoch);return;}
   var result=view.client.Accept(packet);if(result.error&&!result.stale){counters.rejected++;if(view.desired==="open")notify(view,result.error);}
  }
  function createView(key,callbacks){
   need(active,"compact_runtime_disposed");var id=keys[key];need(id,"compact_view_key_unknown");var view=views[id];
   if(!view){view=views[id]={id:id,key:key,epoch:0,client:null,consumer:null,desired:null,sentDesired:null,resyncPending:false,lastError:"",hintSignature:null,closedEpoch:0};allViews.push(view);}
   if(view.consumer&&view.consumer.active)view.consumer.api.Dispose();
   var consumer={active:true,options:callbacks||{},api:null};view.consumer=consumer;
   function alive(){return active&&consumer.active&&view.consumer===consumer;}
   function setDesired(next){if(!alive())return {sent:false,error:"disposed"};if(view.desired!==next){if(next!=="open"){view.closedEpoch=view.epoch;if(view.client)view.client.Abort();}view.desired=next;view.resyncPending=false;view.lastError="";}if(!ready){requestHello(1,false);return {sent:false,error:helloFailed?"schema_mismatch":"not_ready"};}return desiredControl(view);}
   function open(){return setDesired("open");}function probe(){return setDesired("probe");}function close(){return setDesired("closed");}
   function read(rec,field){return alive()&&view.client?view.client.Read(rec,field):undefined;}
   function intent(action,args){
    if(!alive())return {sent:false,error:"disposed"};if(!ready||view.desired!=="open")return {sent:false,error:"not_ready"};args=args||{};var code=ACTIONS[action];if(!code)return {sent:false,error:"action_unknown"};
    if((code<=3&&id!==3)||((code===4||code===7)&&(id<201||id>204))||((code===5||code===6)&&(id<101||id>120)))return {sent:false,error:"action_view_mismatch"};
    var a=args.arg_a,b=args.arg_b,c=args.arg_c;if(code===1)a=args.target_day;else if(code===2)a=args.tier_record;else if(code===4){a=args.pool_record;b=args.count;c=args.skip_animation===undefined?0:args.skip_animation===true?1:args.skip_animation===false?0:args.skip_animation;}else if(code===7){a=args.pool_record;b=args.read_action;if(!integer(b,1,3))return {sent:false,error:"intent_argument_invalid"};}
    if(code!==3&&!integer(a,0,4294967295)||b!==undefined&&!integer(b,0,4294967295)||c!==undefined&&!integer(c,0,4294967295))return {sent:false,error:"intent_argument_invalid"};
    if(memo.intent_token>=16383){notify(view,"token_exhausted");return {sent:false,error:"token_exhausted"};}
    var token=++memo.intent_token,values={action_code:code,request_token:token};if(a!==undefined)values.arg_a=a;if(b!==undefined)values.arg_b=b;if(c!==undefined)values.arg_c=c;
    var result=emitControl(view,values);result.request_token=token;if(result.sent)counters.intents++;return result;
   }
   function dispose(){if(!alive())return;close();consumer.active=false;if(view.client)view.client.Abort();view.consumer=null;}
   function inspect(){return {key:key,id:id,active:alive(),ready:ready,session:session,epoch:view.epoch,desired:view.desired,resync_pending:view.resyncPending,error:view.lastError,receiver:view.client&&view.client.Inspect()};}
   consumer.api={Open:open,Probe:probe,Close:close,Dispose:dispose,Read:read,SendIntent:intent,Resync:function(reason){return alive()?resync(view,reason):{sent:false,error:"disposed"};},Inspect:inspect};
   if(helloFailed)notify(view,"schema_mismatch");return consumer.api;
  }
  function dispose(){if(!active)return;allViews.slice().forEach(function(v){if(v.consumer&&v.consumer.active)v.consumer.api.Dispose();if(v.client)v.client.Dispose();});active=false;generation++;cancelHello();if(subscription!==null&&options.unsubscribe)options.unsubscribe(subscription);if(loadingSubscription!==null&&options.unsubscribeLoading)options.unsubscribeLoading(loadingSubscription);subscription=null;loadingSubscription=null;}
  function inspect(){return {active:active,generation:generation,ready:ready,admitted:admitted,session:session,schema_sha256:C.sha256,upgrade_required:helloFailed,error:lastError,error_text:errorText(lastError),views:allViews.length,intent_token:memo.intent_token,retired_sessions:memo.retired.slice(),counters:Object.assign({},counters)};}
  subscription=options.subscribe("cw",receive);if(options.subscribeLoading)loadingSubscription=options.subscribeLoading(loadingChanged);loadingChanged();
  return {BuildVersion:BUILD,CreateView:createView,Dispose:dispose,Inspect:inspect,ErrorText:errorText};
 }
 return {BuildVersion:BUILD,CreateRuntime:create,ErrorText:errorText};
}));
