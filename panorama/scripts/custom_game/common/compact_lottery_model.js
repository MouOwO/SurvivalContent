// Static catalogue is local. Only changed integer records cross this model.
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactLotteryModel=api;}(function(){
"use strict";
var ERRORS=["","抽奖未完成，请重试","档案尚未载入","抽奖券不足","奖池尚未解锁","操作处理中，请稍后重试","奖池版本已更新，请重新进入","到账尚未确认，请稍后查询","奖池配置尚未同步，请稍候"],QUALITY=["","n","r","sr","ssr","ur"];
function need(ok,e){if(!ok)throw new Error(e);}
function clone(v){if(v===null||typeof v!=="object")return v;if(Array.isArray(v))return v.map(clone);var o={};Object.keys(v).forEach(function(k){o[k]=clone(v[k]);});return o;}
function create(catalogue,poolId){
 var C=catalogue.Data||catalogue,F=Object.create(null),R=Object.create(null),byId=Object.create(null),kind=Object.create(null),poolRecords=Object.create(null),itemRecords=Object.create(null),slots=[],intents=Object.create(null),snapshot=null,disposed=false,revision=0,metrics={registry_scans:1,initializations:0,record_visits:0,item_updates:0,pool_updates:0},seed;
 need(C&&C.sha256&&C.auxiliary&&C.auxiliary.lottery_public,"lottery_catalogue_required");
 C.fields.forEach(function(f){F[f.name]=f.id;});C.records.forEach(function(row){if(!row.tombstone){R[row.key]=row.id;byId[row.id]=row;}});
 function rec(key){need(R[key]!==undefined,"lottery_record_missing:"+key);return R[key];}
 var state=rec("lottery:state"),receipt=rec("lottery:receipt"),currency=[];
 C.auxiliary.lottery_public.snapshots.forEach(function(row){if(row.selected_pool_id===poolId)seed=row;});need(seed,"lottery_pool_unknown");
 seed.pools.forEach(function(p){var r=rec("lottery:pool:"+p.id);poolRecords[r]=p.id;kind[r]="pool";});
 seed.items.forEach(function(item){var r=rec("lottery:item:"+item.id);itemRecords[r]=item.id;kind[r]="item";});
 C.records.forEach(function(row){if(!row.tombstone&&row.domain==="lottery"&&row.kind==="currency")currency.push(row.id);});
 for(var i=1;i<=10;i++){slots.push(rec("lottery:result:"+i));kind[slots[i-1]]="result";}
 kind[state]="state";kind[receipt]="receipt";
 var poolsById=Object.create(null),itemsById=Object.create(null);
 function initialize(){
  snapshot=clone(seed);snapshot.ok=true;snapshot.reason="compact";snapshot.config_hash=C.auxiliary.lottery_config_hash;
  poolsById=Object.create(null);itemsById=Object.create(null);
  snapshot.pools.forEach(function(p){p.tickets=undefined;p.draws=undefined;p.unlocked=undefined;p.update_unread=undefined;p.notice_unread=undefined;poolsById[p.id]=p;});
  snapshot.selected_pool=poolsById[poolId];snapshot.items.forEach(function(item){item.owned_count=undefined;item.owned=undefined;item.at_max_owned=undefined;itemsById[item.id]=item;});
  snapshot.tickets=undefined;snapshot.draws=undefined;snapshot.shop_points=undefined;snapshot.starjoy_points=undefined;snapshot.map_level=undefined;metrics.initializations++;
 }
 function apply(tx,changed,read){
  need(!disposed&&tx&&Array.isArray(changed)&&typeof read==="function","lottery_transaction_required");
  var full=tx.full===true,summary=false,result=null,changedItems=[],changedPools=[];
  if(full||!snapshot)initialize();
  if(read(state,F.known)!==1){var errorCode=read(state,F.error_code);return {known:false,snapshot:null,result:null,error_code:errorCode,error:ERRORS[errorCode]||"",changes:{items:[],pools:[],summary:false}};}
  function value(r,name){return read(r,F[name]);}
  function big(r,name){var lo=value(r,name),hi=value(r,name+"_hi");if(lo===undefined||hi===undefined)return undefined;var n=lo+hi*4294967296;need(Number.isSafeInteger(n)&&n>=0,"lottery_counter_invalid");return n;}
  var ids=full?[state].concat(Object.keys(poolRecords).map(Number),Object.keys(itemRecords).map(Number),[receipt]):changed;
  for(var n=0;n<ids.length;n++){
   var r=ids[n],k=kind[r];metrics.record_visits++;
   if(k==="state"){snapshot.shop_points=big(r,"balance");snapshot.starjoy_points=big(r,"progress");snapshot.map_level=value(r,"level");snapshot.pending=value(r,"pending");snapshot.enabled=value(r,"enabled");summary=true;}
   else if(k==="pool"){
    var pool=poolsById[poolRecords[r]];pool.tickets=big(r,"tickets");pool.draws=big(r,"draws");pool.unlocked=value(r,"unlocked")===undefined?undefined:value(r,"unlocked")===1;
    pool.unlock_progress=value(r,"unlock_progress");pool.update_unread=value(r,"update_unread")===undefined?undefined:value(r,"update_unread")===1;pool.notice_unread=value(r,"notice_unread")===undefined?undefined:value(r,"notice_unread")===1;
    if(value(r,"free_available")!==undefined)pool.free_available=value(r,"free_available")===1;if(value(r,"pity_remaining")!==undefined)pool.pity_remaining=value(r,"pity_remaining");
    changedPools.push(pool.id);metrics.pool_updates++;if(pool.id===poolId)summary=true;
   }else if(k==="item"){
    var item=itemsById[itemRecords[r]];item.owned_count=big(r,"owned_count");item.owned=value(r,"owned")===undefined?undefined:value(r,"owned")===1;item.at_max_owned=value(r,"at_max_owned")===undefined?undefined:value(r,"at_max_owned")===1;changedItems.push(item.id);metrics.item_updates++;
   }
  }
  if(summary){snapshot.tickets=snapshot.selected_pool.tickets;snapshot.draws=snapshot.selected_pool.draws;snapshot.ticket_content_id=snapshot.selected_pool.ticket_content_id;snapshot.ticket_name=snapshot.selected_pool.ticket_name;}
  var receiptChanged=full||changed.indexOf(receipt)>=0;
  if(receiptChanged&&value(receipt,"known")===1){
   var token=value(receipt,"request_token"),intent=intents[token],target=byId[value(receipt,"target_record")];
   if(intent&&target&&target.key==="lottery:pool:"+poolId){
    var success=value(receipt,"success")===1,pending=value(receipt,"pending")===1,count=value(receipt,"count");
    result={ok:success,pending:pending,terminal:value(receipt,"terminal")===1,request_id:intent,pool_id:poolId,count:count,error:ERRORS[value(receipt,"error_code")]||ERRORS[1],snapshot:snapshot};
    if(success){need(count===1||count===10,"lottery_receipt_count_invalid");result.results=[];result.guarantee_quality=QUALITY[value(receipt,"quality_code")]||"";result.guarantee_satisfied=value(receipt,"guarantee_satisfied")===1;
     for(var j=0;j<count;j++){var slot=slots[j],itemRec=value(slot,"target_record"),record=byId[itemRec];need(value(slot,"known")===1&&record&&record.domain==="lottery"&&record.kind==="item","lottery_receipt_item_unknown");
      var source=C.definitions[record.key];need(source&&source.definition,"lottery_receipt_definition_missing");var reward=clone(source.definition);reward.id=record.business_id;reward.owned_count=big(slot,"owned_count");reward.owned=reward.owned_count===undefined?undefined:reward.owned_count>0;reward.duplicate=value(slot,"duplicate")===1;reward.converted_points=big(slot,"converted_points");reward.converted_currency="shop_points";
      if(value(slot,"granted_count")!==undefined)reward.granted_count=value(slot,"granted_count");if(value(slot,"overflow_count")!==undefined)reward.overflow_count=value(slot,"overflow_count");result.results.push(reward);
     }
    }
    if(result.terminal)delete intents[token];
   }
  }
  revision=tx.revision;snapshot.cache_sequence=revision;snapshot.sequence=revision;
  return {known:read(rec("lottery:pool:"+poolId),F.known)===1&&snapshot.tickets!==undefined,snapshot:snapshot,result:result,changes:{items:changedItems,pools:changedPools,summary:summary}};
 }
 function bind(token,requestId){need(!disposed&&Number.isInteger(token)&&token>=1&&token<=16383&&typeof requestId==="string"&&requestId.length>0&&!intents[token],"lottery_intent_invalid");intents[token]=requestId;}
 return {Apply:apply,BindIntent:bind,Snapshot:function(){return snapshot;},PoolRecord:function(){return rec("lottery:pool:"+poolId);},Inspect:function(){return {revision:revision,metrics:Object.assign({},metrics)};},Dispose:function(){disposed=true;snapshot=null;intents=Object.create(null);},Record:rec,Field:function(name){return F[name];}};
}
return {Create:create,ErrorText:function(code){return ERRORS[code]||ERRORS[1];}};
}));
