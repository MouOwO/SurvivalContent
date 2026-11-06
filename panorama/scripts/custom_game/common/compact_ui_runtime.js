// One cw subscription and one admission-triggered bootstrap per HUD lifetime.
// No polling, catalogue downloads or routine acknowledgements. All outbound
// payloads are typed integer controls, through the shared 24-ASCII codec.
(function(factory){
 "use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig){
  var cfg=GameUI.CustomUIConfig();
  var existing=cfg.SurvivalCompactRuntime,catalogue=cfg.SurvivalUICatalog&&cfg.SurvivalUICatalog.Data;
  if(existing&&existing.BuildVersion===api.BuildVersion&&catalogue&&existing.Inspect){var state=existing.Inspect(),lotteryCapability=!!cfg.SurvivalCompactGridBulkWire&&!!cfg.SurvivalCompactLotteryReceiptWire&&!!catalogue.auxiliary&&catalogue.auxiliary.lottery_receipt_wire_version===1;if(state.active&&state.schema_sha256===catalogue.sha256&&state.bulk_enabled===!!cfg.SurvivalCompactGridBulkWire&&state.bulk_lottery_enabled===lotteryCapability)return;}
  if(existing&&existing.Dispose)existing.Dispose();
  if(cfg.SurvivalCompactWire&&cfg.SurvivalUICatalog){
   var owner=$.GetContextPanel(),marker=$.CreatePanel("Panel",owner,"");
   marker.visible=false;marker.hittest=false;marker.hittestchildren=false;
   // Native roots can survive a layout reload; the child marker cannot.
   // One captured token is published before the synchronous Hello bootstrap.
   // Entry checks are O(1); only real teardown traverses the created views.
   var released=false,token={owner:owner,marker:marker,runtime:null};cfg.SurvivalCompactRuntimeOwner=token;
   function ownerAlive(){return cfg.SurvivalCompactRuntimeOwner===token&&(!token.runtime||cfg.SurvivalCompactRuntime===token.runtime)&&owner.IsValid()&&marker.IsValid();}
   function releaseOwner(){
    if(released)return;released=true;
    if(cfg.SurvivalCompactRuntimeOwner===token)cfg.SurvivalCompactRuntimeOwner=null;
    if(token.runtime&&cfg.SurvivalCompactRuntime===token.runtime)cfg.SurvivalCompactRuntime=null;
    try{if(marker.IsValid())marker.DeleteAsync(0);}catch(ignored){}
   }
   var memo=cfg.SurvivalCompactRuntimeMemo||(cfg.SurvivalCompactRuntimeMemo={intent_token:0,sessions:{},retired:[]});
   try{
    var created=api.CreateRuntime({wire:cfg.SurvivalCompactWire,bulk:cfg.SurvivalCompactGridBulkWire,lotteryReceiptWire:cfg.SurvivalCompactLotteryReceiptWire,catalogue:cfg.SurvivalUICatalog,memo:memo,
     ownerAlive:ownerAlive,onDispose:releaseOwner,
     send:function(event,packet){GameEvents.SendCustomGameEventToServer(event,packet);return true;},
     subscribe:function(event,fn){return GameEvents.Subscribe(event,fn);},unsubscribe:function(id){GameEvents.Unsubscribe(id);},
     getLoading:function(){return CustomNetTables.GetTableValue("survival_loading","state");},
     subscribeLoading:function(fn){return CustomNetTables.SubscribeNetTableListener("survival_loading",function(table,key){if(key==="state")fn();});},
     unsubscribeLoading:function(id){if(CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(id);},
     schedule:function(ms,fn){return $.Schedule(ms/1000,fn);},cancel:function(id){$.CancelScheduled(id);},
     now:function(){return Date.now();}
    });
    token.runtime=created;
    if(cfg.SurvivalCompactRuntimeOwner===token)cfg.SurvivalCompactRuntime=created;else created.Dispose();
   }catch(error){releaseOwner();throw error;}
  }
 }
}(function(){
 "use strict";
 var BUILD="compact_ui_runtime_20261106_v9";
 var ACTIONS={daily_claim:1,benefit_claim:2,pass_purchase:3,lottery_draw:4,archive_title:5,archive_action:6,lottery_read:7,production_train:8,production_research:9,production_auto:10,production_cancel:11,payment_capability:12,public_beta_claim:13};
 var ERRORS={schema_mismatch:"界面版本与服务器不一致，请更新游戏后重新进入。",schema_unknown:"界面协议不一致，请更新游戏后重新进入。",not_ready:"正在核对界面版本，请稍后。",token_exhausted:"本次会话的操作编号已用完，请重新进入游戏。",revision_exhausted:"本次会话的消息编号已用完，请重新进入游戏。",native_send_failed:"同步消息未能发送，请重新打开界面。",application_rejected:"界面数据校验失败，正在重新同步。"};
 function need(ok,code){if(!ok)throw new Error(code);}
 function integer(n,min,max){return typeof n==="number"&&isFinite(n)&&Math.floor(n)===n&&n>=min&&n<=max;}
 function errorText(code){return ERRORS[code]||"界面同步未完成，请重新打开。";}
 function create(options){
  options=options||{};var W=options.wire,B=options.bulk,C=options.catalogue&&options.catalogue.Data||options.catalogue;
  need(W&&W.Encode&&W.PeekHeader&&C&&C.sha256,"compact_runtime_dependencies_required");
  var lotteryBulk=!!B&&!!options.lotteryReceiptWire&&!!C.auxiliary&&C.auxiliary.lottery_receipt_wire_version===1;
  var schema=W.CompileLookup(C,1),F=Object.create(null),records=Object.create(null),views=Object.create(null),keys=Object.create(null),allViews=[],memo=options.memo||{intent_token:0,sessions:{},retired:[]};
  C.fields.forEach(function(f){F[f.name]=f.id;});C.records.forEach(function(r){if(!r.tombstone)records[r.key]=r.id;});
  var control=records["wire:control"],helloWords=[],helloByRecord=Object.create(null),word;
  need(control&&F.count&&F.visible&&F.known&&F.action_code&&F.arg_a&&F.arg_b&&F.arg_c&&F.request_token,"compact_control_schema_missing");
  for(word=1;word<=8;word++){var rec=records["wire:hello:"+word];need(rec,"compact_hello_schema_missing");helloWords.push(rec);helloByRecord[rec]=word-1;}
  keys.hud=2;keys.daily=3;keys.grid=4;keys.selected=5;keys.grid_static=6;keys.production=7;keys.vip=8;keys.payment=9;keys.public_beta=10;
  var categories=C.auxiliary&&C.auxiliary.archive_projection&&C.auxiliary.archive_projection.categories||[];
  categories.forEach(function(row,index){keys["archive:"+row.id]=101+index;});
  var pools=C.auxiliary&&C.auxiliary.lottery_public&&C.auxiliary.lottery_public.snapshots||[];
  pools.forEach(function(row,index){need(row.selected_pool&&row.selected_pool.id,"compact_pool_catalogue_missing");keys["lottery:"+row.selected_pool.id]=201+index;});
  var active=true,generation=1,ready=false,admitted=false,loadingIdentity=memo.loading_identity||null,session=null,helloReceiver=null,helloSession=null,helloRequested=false,helloFailed=false,helloTimer=null,helloResyncPending=false,subscription=null,bulkSubscription=null,loadingSubscription=null,lastError="";
  var counters={received:0,sent:0,stale:0,rejected:0,hello_requests:0,hello_commits:0,view_commits:0,resyncs:0,controls:0,intents:0,bulk_received:0,bulk_commits:0,bulk_rejected:0,cleanup_failures:0};
  // No lifecycle poll: the next real event/API/queued timeout retires a dead owner.
  function live(){
   if(!active)return false;var valid=true;
   try{if(options.ownerAlive)valid=options.ownerAlive()===true;}catch(ignored){valid=false;}
   if(!valid){dispose();return false;}return true;
  }
  function ownedSchedule(ms,fn){
   var ticket={active:true,generation:generation,native:null};
   ticket.native=options.schedule(ms,function(){if(!ticket.active)return;ticket.active=false;if(!live()||ticket.generation!==generation)return;fn();});return ticket;
  }
  function cancelScheduled(ticket){if(!ticket||!ticket.active)return;ticket.active=false;if(options.cancel)options.cancel(ticket.native);}
  var schedule=options.schedule?ownedSchedule:undefined;
  function current(view,consumer,client,own){return live()&&generation===own&&view.consumer===consumer&&consumer&&consumer.active&&view.client===client;}
  function cleanup(fn){try{fn();}catch(ignored){counters.cleanup_failures++;}}
  function subscribeOwned(register,unregister){var id=register();if(!live()){if(unregister)cleanup(function(){unregister(id);});return null;}return id;}
  function abortBulk(view){if(view.bulkReceiver)view.bulkReceiver.Dispose();view.bulkReceiver=null;view.bulkBase=null;view.bulkScope=null;}
  function recordSession(value){var key=String(value);if(!memo.sessions[key])memo.sessions[key]={};return memo.sessions[key];}
  function binding(view,epoch,token){return {schema:1,schema_sha256:C.sha256,session:token===undefined?session:token,epoch:epoch,view:view};}
  function bootstrap(){return binding(1,1,1);}
  function retired(value){return memo.retired.indexOf(value)>=0;}
  function retire(value){if(value===null||value===undefined||retired(value))return;memo.retired.push(value);if(memo.retired.length>8){var old=memo.retired.shift();delete memo.sessions[String(old)];}}
  function notify(view,code){
   if(!live())return false;lastError=code;
   if(view){var consumer=view.consumer,client=view.client,own=generation;
    if(view.lastError!==code){view.lastError=code;if(consumer&&consumer.active&&consumer.options.onError){try{consumer.options.onError(code);}catch(ignored){}}}
    return current(view,consumer,client,own);
   }
   var own=generation;allViews.forEach(function(v){if(live()&&generation===own)notify(v,code);});return live()&&generation===own;
  }
  function send(packet){need(live(),"compact_runtime_disposed");need(packet&&typeof packet.d==="string"&&packet.d.length<=24&&Object.keys(packet).length===1,"compact_packet_budget");var result=options.send("cw",packet);need(result!==false,"native_send_failed");counters.sent++;return true;}
  function cancelHello(){var timer=helloTimer;helloTimer=null;cancelScheduled(timer);}
  function requestHello(reason,failure){
   if(!live()||!admitted||helloFailed)return false;if(failure){if(helloResyncPending)return false;helloResyncPending=true;}else if(helloRequested)return false;
   helloRequested=true;var own=generation;try{send(W.EncodeResync(schema,bootstrap(),0,reason||1));if(!live()||generation!==own)return false;counters.hello_requests++;return true;}catch(error){if(live()&&generation===own)notify(null,error.message);return false;}
  }
  function resetBindings(){
   ready=false;helloReceiver=null;helloSession=null;cancelHello();
   allViews.forEach(function(v){abortBulk(v);if(v.client)v.client.Dispose();v.client=null;v.epoch=0;v.closedEpoch=0;v.resyncPending=false;v.lastError="";v.sentDesired=null;});
  }
  function loadingChanged(){
   if(!live())return;var state=options.getLoading?options.getLoading():{admission_complete:1};
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
  function controlOps(values,record){return Object.keys(values).map(function(name){need(F[name]!==undefined,"control_field_unknown");return {record:record||control,field:F[name],value:values[name]};});}
  function emitControl(view,values,record){
   if(!live())return {sent:false,error:"disposed"};if(!ready||!session)return {sent:false,error:"not_ready"};var own=generation,consumer=view.consumer,client=view.client;var sessions=recordSession(session),out=sessions[view.id];
   if(!out)out=sessions[view.id]={revision:0,needsFull:true};
   if(out.revision>=1048575){notify(view,"revision_exhausted");return {sent:false,error:"revision_exhausted"};}
   // Each input/control contains its own complete arguments. Independent full
   // transactions recover after a lost or rejected C2S command without retrying
   // a consumptive intent; revisions and original business nonces still guard
   // replay. Only the tag changes, so this adds no bytes or acknowledgements.
   var encoded;try{encoded=W.Encode(schema,binding(view.id,1),out.revision+1,controlOps(values,record),{full:true,value_budget:24});}catch(error){notify(view,error.message);return {sent:false,error:error.message};}
   out.revision++;try{encoded.packets.forEach(function(packet){need(current(view,consumer,client,own),"compact_runtime_disposed");send(packet);});need(current(view,consumer,client,own),"compact_runtime_disposed");out.needsFull=false;counters.controls++;return {sent:true,revision:out.revision};}catch(error){out.needsFull=true;if(current(view,consumer,client,own))notify(view,error.message);return {sent:false,error:error.message};}
  }
  function desiredControl(view){
   if(!live()||!ready||!view.consumer||!view.consumer.active||view.desired===null||view.sentDesired===view.desired)return {sent:false,unchanged:true};
   var values={visible:view.desired==="open"?1:0,known:view.desired==="probe"?1:0};
   if(view.id===6&&view.desired==="open"&&B)values.types=1;
   if(lotteryBulk&&view.id>=201&&view.id<=204&&view.desired==="open"&&view.consumer.options.bulkLottery===true)values.types=2;
   var result=emitControl(view,values);if(result.sent)view.sentDesired=view.desired;return result;
  }
  function resync(view,reason,epoch){
   if(!live()||!ready||view.resyncPending||!view.consumer||!view.consumer.active||view.desired!=="open")return {sent:false,unchanged:true};
   reason=integer(reason,1,5)?reason:5;epoch=epoch||view.epoch;if(!integer(epoch,1,16383))return {sent:false,error:"not_ready"};
   view.resyncPending=true;var client=view.client,consumer=view.consumer,own=generation,revision=client&&epoch===view.epoch?client.Inspect().receiver.revision:0;
   try{send(W.EncodeResync(schema,binding(view.id,epoch),revision,reason));if(!current(view,consumer,client,own))return {sent:false,error:"disposed"};counters.resyncs++;return {sent:true};}catch(error){if(current(view,consumer,client,own))notify(view,error.message);return {sent:false,error:error.message};}
  }
  function hint(view,read){
   if(!live()||view.id!==3)return;var state=records["daily:state"],known=read(state,F.known),claimable=read(state,F.can_claim);if(known===undefined||claimable===undefined)return;
   var signature=known+":"+claimable;if(signature===view.hintSignature)return;view.hintSignature=signature;var consumer=view.consumer;if(consumer&&consumer.active&&consumer.options.onHint)consumer.options.onHint({known:known,claimable:claimable});
  }
  function newClient(view,epoch){
   var clientGeneration=generation,client;
   client=W.NewClient(schema,binding(view.id,epoch),{value_budget:24,assembly_bytes:262144,max_fragments:16383,now:options.now,schedule:schedule,cancel:cancelScheduled,
    validate:function(tx){
     if(!live()||clientGeneration!==generation||view.client!==client)return false;
     if(view.desired==="open")return true;
     if(view.id!==3)return false;var state=records["daily:state"];
     for(var n=0;n<tx.changes.length;n++){var c=tx.changes[n];if(c.record!==state||c.remove||c.field!==F.known&&c.field!==F.can_claim)return false;}return true;
    },
    onResync:function(packet,reason){if(live()&&clientGeneration===generation&&view.client===client)resync(view,reason);},
    onCommit:function(tx,changed,read){
     if(!live()||clientGeneration!==generation||view.client!==client)return;
     var consumer=view.consumer;if(!consumer||!consumer.active)return;
     if(view.desired!=="open"){hint(view,read);return;}
     try{if(consumer.options.onCommit&&consumer.options.onCommit(tx,changed,read)===false)throw new Error("application_rejected");
      if(!current(view,consumer,client,clientGeneration))return;
      if(tx.full)view.resyncPending=false;view.lastError="";counters.view_commits++;hint(view,read);
     }catch(error){if(current(view,consumer,client,clientGeneration)&&notify(view,error.message||"application_rejected")&&current(view,consumer,client,clientGeneration))resync(view,5);}
    }
   });return client;
  }
  function hello(packet,header){
   if(header.kind!=="full"||header.epoch!==1||header.schema!==1||retired(header.session)){counters.stale++;return;}
   if(helloSession!==header.session){cancelHello();helloSession=header.session;helloReceiver=W.NewReceiver(schema,binding(1,1,header.session),{assembly_bytes:256,max_fragments:64});}
   var tx;try{tx=helloReceiver.Accept(packet);}catch(error){if(error.message==="stale_revision"||error.message==="stale_fragment"){counters.stale++;return;}helloReceiver.Abort();if(notify(null,error.message))requestHello(4,true);return;}
   if(tx.pending){if(helloTimer===null&&options.schedule){helloTimer=schedule(5000,function(){helloTimer=null;if(helloReceiver&&helloReceiver.Inspect().assembling){helloReceiver.Abort();requestHello(2,true);}});}return;}
   cancelHello();var words=[],n,c,valid=tx.full&&tx.changes.length===8;
   for(n=0;valid&&n<tx.changes.length;n++){c=tx.changes[n];var index=helloByRecord[c.record];if(index===undefined||c.field!==F.count||c.remove||words[index]!==undefined)valid=false;else words[index]=("00000000"+c.value.toString(16)).slice(-8);}
   if(!valid||words.join("")!==C.sha256){helloReceiver.Abort();helloFailed=true;ready=false;resetBindings();notify(null,"schema_mismatch");return;}
   helloReceiver.Commit(tx);helloResyncPending=false;counters.hello_commits++;
   var changedSession=session!==header.session;if(changedSession){retire(session);session=header.session;memo.current_session=session;generation++;allViews.forEach(function(v){abortBulk(v);if(v.client)v.client.Dispose();v.client=null;v.epoch=0;v.closedEpoch=0;v.sentDesired=null;v.resyncPending=false;v.hintSignature=null;});}
   ready=true;lastError="";allViews.forEach(desiredControl);
  }
  function receive(packet){
   if(!live()||!admitted)return;counters.received++;var header;
   try{header=W.PeekHeader(packet,{value_budget:24});}catch(error){counters.rejected++;return;}
   if(header.view===1){if(!helloFailed)hello(packet,header);return;}
   if(!ready||header.session!==session||retired(header.session)){counters.stale++;return;}
   var view=views[header.view];if(!view||!view.consumer||!view.consumer.active||view.desired===null){counters.stale++;return;}
   if(header.schema!==1){if(notify(view,"schema_unknown"))resync(view,3,header.epoch);return;}
   if(header.epoch<view.epoch||view.desired!=="open"&&header.epoch<=view.closedEpoch){counters.stale++;return;}
   if(header.epoch>view.epoch){if(!header.full||header.revision!==1){resync(view,1,header.epoch);return;}
    abortBulk(view);if(view.client)view.client.Dispose();view.epoch=header.epoch;view.client=newClient(view,header.epoch);
   }else if(header.full&&header.revision!==1){resync(view,4);return;}
   if(!view.client){resync(view,1,header.epoch);return;}
   var client=view.client,consumer=view.consumer,own=generation,result=client.Accept(packet);if(!current(view,consumer,client,own))return;if(result.error&&!result.stale){counters.rejected++;if(view.desired==="open")notify(view,result.error);}
  }
  function createView(key,callbacks){
   need(live(),"compact_runtime_disposed");var id=keys[key];need(id,"compact_view_key_unknown");var view=views[id];
   if(!view){view=views[id]={id:id,key:key,epoch:0,client:null,consumer:null,desired:null,sentDesired:null,resyncPending:false,lastError:"",hintSignature:null,closedEpoch:0};allViews.push(view);}
   if(view.consumer&&view.consumer.active)view.consumer.api.Dispose();
   need(live(),"compact_runtime_disposed");
   var consumer={active:true,options:callbacks||{},api:null};view.consumer=consumer;
   function alive(){return live()&&consumer.active&&view.consumer===consumer;}
   function setDesired(next){if(!alive())return {sent:false,error:"disposed"};if(view.desired!==next){if(next!=="open"){view.closedEpoch=view.epoch;abortBulk(view);if(view.client)view.client.Abort();}view.desired=next;view.resyncPending=false;view.lastError="";}if(!ready){requestHello(1,false);return {sent:false,error:helloFailed?"schema_mismatch":"not_ready"};}return desiredControl(view);}
   function open(){return setDesired("open");}function probe(){return setDesired("probe");}function close(){return setDesired("closed");}
   function read(rec,field){return alive()&&view.client?view.client.Read(rec,field):undefined;}
   function intent(action,args){
    if(!alive())return {sent:false,error:"disposed"};if(!ready||view.desired!=="open")return {sent:false,error:"not_ready"};args=args||{};var code=ACTIONS[action];if(!code)return {sent:false,error:"action_unknown"};
    if((code<=3&&id!==3)||((code===4||code===7)&&(id<201||id>204))||((code===5||code===6)&&(id<101||id>120))||(code>=8&&code<=11&&id!==7)||(code===12&&id!==9)||(code===13&&id!==10))return {sent:false,error:"action_view_mismatch"};
    var a=args.arg_a,b=args.arg_b,c=args.arg_c;if(code===1)a=args.target_day;else if(code===2)a=args.tier_record;else if(code===4){a=args.pool_record;b=args.count;c=args.skip_animation===undefined?0:args.skip_animation===true?1:args.skip_animation===false?0:args.skip_animation;}else if(code===7){a=args.pool_record;b=args.read_action;if(!integer(b,1,3))return {sent:false,error:"intent_argument_invalid"};}
    else if(code>=8&&code<=11){a=args.entity;b=code===11?args.job_handle:args.definition_record;c=args.selection;
     if(!integer(a,1,4294967295)||!integer(b,1,code===11?4294967295:65535)||!integer(c,1,4294967295))return {sent:false,error:"intent_argument_invalid"};}
    else if(code>=12&&Object.keys(args).length)return {sent:false,error:"intent_arguments_forbidden"};
    if(code!==3&&code<12&&!integer(a,0,4294967295)||b!==undefined&&!integer(b,0,4294967295)||c!==undefined&&!integer(c,0,4294967295))return {sent:false,error:"intent_argument_invalid"};
    if(memo.intent_token>=16383){notify(view,"token_exhausted");return {sent:false,error:"token_exhausted"};}
    var token=++memo.intent_token,values={action_code:code,request_token:token};if(a!==undefined)values.arg_a=a;if(b!==undefined)values.arg_b=b;if(c!==undefined)values.arg_c=c;
    var result=emitControl(view,values);result.request_token=token;if(result.sent)counters.intents++;return result;
   }
   function dispose(){if(!alive())return;close();consumer.active=false;consumer.options={};if(view.consumer!==consumer)return;if(view.client)view.client.Abort();view.consumer=null;}
   function input(code,args){
    if(!alive())return {sent:false,error:"disposed"};
    if(!ready||view.desired!=="open")return {sent:false,error:"not_ready"};
    if(id!==4&&id!==5&&id!==7)return {sent:false,error:"input_view_mismatch"};
    if(!integer(code,1,id===4?5:2))return {sent:false,error:"input_action_invalid"};
    var prefix=id===4?"grid":id===5?"selected":"production";
    var rec=records[prefix+":input"],values={},allowed=id===4?{grid_session:1,grid_request:1,grid_profile:1,grid_actor:1,grid_ability:1,grid_x_hi:1,grid_x_lo:1,grid_y_hi:1,grid_y_lo:1,grid_z_hi:1,grid_z_lo:1}:id===5?{selected_entity:1,selected_token:1}:{production_entity:1,production_selection:1};
    values[prefix+"_action"]=code;
    if(!rec)return {sent:false,error:"input_schema_missing"};args=args||{};
    var names=Object.keys(args);for(var n=0;n<names.length;n++){var name=names[n];if(!allowed[name]||!integer(args[name],0,4294967295))return {sent:false,error:"input_argument_invalid"};values[name]=args[name];}
    return emitControl(view,values,rec);
   }
   function inspect(){var valid=alive();return {key:key,id:id,active:valid,ready:valid&&ready,session:session,epoch:view.epoch,desired:view.desired,resync_pending:view.resyncPending,error:view.lastError,receiver:view.client&&view.client.Inspect()};}
   consumer.api={Open:open,Probe:probe,Close:close,Dispose:dispose,Read:read,SendIntent:intent,SendInput:input,
    AbortBulk:function(){if(!alive())return false;abortBulk(view);return true;},
    Resync:function(reason){return alive()?resync(view,reason):{sent:false,error:"disposed"};},Inspect:inspect};
   if(helloFailed)notify(view,"schema_mismatch");return consumer.api;
  }
  function receiveBulk(packet){
   if(!live()||!admitted||!ready||!B)return;counters.bulk_received++;
   var h;try{h=B.PeekHeader(packet);}catch(error){counters.bulk_rejected++;return;}
   var isLottery=h.view>=201&&h.view<=204,v=views[h.view],consumer=v&&v.consumer,client=v&&v.client,entryGeneration=generation;
   if(h.schema!==1||h.session!==session||retired(h.session)||!v||!consumer||!consumer.active||v.desired!=="open"||h.epoch!==v.epoch||!v.client||isLottery&&(!lotteryBulk||consumer.options.bulkLottery!==true)){counters.stale++;return;}
   var rx=v.client.Inspect().receiver;
   if(isLottery&&rx&&h.base_revision<rx.revision){counters.stale++;return;}
   if(!isLottery&&(!rx||h.base_revision>rx.revision)){counters.bulk_rejected++;resync(v,1);return;}
   try{var accepted=!!(isLottery?consumer.options.onBulkDecode:consumer.options.onBulk)&&!!consumer.options.acceptBulk&&consumer.options.acceptBulk(h)===true;}
   catch(error){if(current(v,consumer,client,entryGeneration)){counters.bulk_rejected++;if(isLottery)resync(v,4);}return;}
   if(!current(v,consumer,client,entryGeneration)||v.desired!=="open")return;
   if(!accepted){counters.stale++;return;}
   if(isLottery&&(!rx||h.base_revision>rx.revision)){counters.bulk_rejected++;resync(v,1);return;}
   if(v.bulkBase!==null&&v.bulkBase!==undefined&&h.base_revision<v.bulkBase){counters.stale++;return;}
   if(!v.bulkReceiver||v.bulkBase!==h.base_revision||isLottery&&v.bulkScope!==h.scope){
    abortBulk(v);v.bulkBase=h.base_revision;v.bulkScope=h.scope;var own=generation,receiver;
    receiver=B.NewReceiver({schema:1,schema_sha256:C.sha256,session:session,epoch:v.epoch,view:h.view,base_revision:h.base_revision},{
     now:options.now,schedule:schedule,cancel:cancelScheduled,
     scope:isLottery?h.scope:undefined,ignoreRejectedHeader:isLottery,
     acceptHeader:function(header){if(!current(v,consumer,client,own)||v.bulkReceiver!==receiver||v.desired!=="open")return false;var accepted=consumer.options.acceptBulk(header)===true;return accepted&&current(v,consumer,client,own)&&v.bulkReceiver===receiver&&v.desired==="open";},
     onComplete:function(header,raw){if(current(v,consumer,client,own)&&v.bulkReceiver===receiver&&v.desired==="open"){
      if(isLottery){
       var decoded=consumer.options.onBulkDecode(header,raw);need(decoded&&decoded.revision===header.base_revision+1&&Array.isArray(decoded.changes),"bulk_lottery_decode_invalid");
       if(!current(v,consumer,client,own)||v.bulkReceiver!==receiver||v.desired!=="open")return;
       var result=client.ApplyExternal(header.base_revision,decoded.revision,decoded.changes);
       if(result.stale)return;need(result.committed,result.error||"bulk_lottery_commit_failed");
      }else consumer.options.onBulk(header,raw);
      if(current(v,consumer,client,own)&&v.bulkReceiver===receiver)counters.bulk_commits++;
     }},
     onError:function(code){if(current(v,consumer,client,own)&&v.bulkReceiver===receiver&&v.desired==="open"){counters.bulk_rejected++;if(notify(v,code)&&current(v,consumer,client,own)&&v.bulkReceiver===receiver)resync(v,2);}}
    });v.bulkReceiver=receiver;
   }
   v.bulkReceiver.Accept(packet);
  }
  function dispose(){
   if(!active)return;active=false;ready=false;admitted=false;generation++;
   // Runtime retirement is local. A live individual view still closes normally.
   var timer=helloTimer,hello=helloReceiver,sub=subscription,bulkSub=bulkSubscription,loadingSub=loadingSubscription;
   helloTimer=null;helloReceiver=null;helloSession=null;subscription=null;bulkSubscription=null;loadingSubscription=null;
   if(timer!==null)cleanup(function(){cancelScheduled(timer);});
   if(hello)cleanup(function(){hello.Dispose();});
   allViews.forEach(function(v){
    var consumer=v.consumer,client=v.client,bulk=v.bulkReceiver;
    v.consumer=null;v.client=null;v.bulkReceiver=null;v.bulkBase=null;v.bulkScope=null;v.desired=null;v.sentDesired=null;v.resyncPending=false;
    if(consumer){consumer.active=false;consumer.options={};}
    if(bulk)cleanup(function(){bulk.Dispose();});if(client)cleanup(function(){client.Dispose();});
   });
   if(sub!==null&&options.unsubscribe)cleanup(function(){options.unsubscribe(sub);});
   if(bulkSub!==null&&options.unsubscribe)cleanup(function(){options.unsubscribe(bulkSub);});
   if(loadingSub!==null&&options.unsubscribeLoading)cleanup(function(){options.unsubscribeLoading(loadingSub);});
   if(options.onDispose)cleanup(options.onDispose);
  }
  function inspect(){live();return {active:active,generation:generation,ready:ready,admitted:admitted,session:session,schema_sha256:C.sha256,bulk_enabled:!!B,bulk_lottery_enabled:lotteryBulk,upgrade_required:helloFailed,error:lastError,error_text:errorText(lastError),views:allViews.length,intent_token:memo.intent_token,retired_sessions:memo.retired.slice(),counters:Object.assign({},counters)};}
  try{
   subscription=subscribeOwned(function(){return options.subscribe("cw",receive);},options.unsubscribe);
   if(active&&B)bulkSubscription=subscribeOwned(function(){return options.subscribe("gb",receiveBulk);},options.unsubscribe);
   if(active&&options.subscribeLoading)loadingSubscription=subscribeOwned(function(){return options.subscribeLoading(loadingChanged);},options.unsubscribeLoading);
   if(active)loadingChanged();
  }catch(error){dispose();throw error;}
  return {BuildVersion:BUILD,CreateView:createView,Dispose:dispose,Inspect:inspect,ErrorText:errorText,
   ScopeIdentity:function(){live();return {active:active,ready:active&&ready,loading_identity:loadingIdentity,session:session};}};
 }
 return {BuildVersion:BUILD,CreateRuntime:create,ErrorText:errorText};
}));
