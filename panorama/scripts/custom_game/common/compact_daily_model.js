// Local presentation projector for the authoritative compact daily records.
// Once-only O(N) registry indexes. Deltas visit changed records and their
// dependent calendar slots/benefit rows, never the complete static catalogue.
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactDailyModel=api;}(function(){
"use strict";
var MAX_SAFE=9007199254740991,TRACKS=["daily_time","daily_wins","weekly_time"];
var ERRORS=["","操作未完成，请重试","档案尚未载入","签到日期无效","请先开通月卡","该奖励已领取","尚未达到领取条件","操作处理中，请稍后重试","保存未完成，请重试","对局身份已变更，请重新打开","到账尚未确认，请稍后查询"];
function need(ok,code){if(!ok)throw new Error(code);}
function copy(v){var out={};Object.keys(v||{}).forEach(function(k){out[k]=v[k];});return out;}
function bit(mask,index){return Math.floor(mask/Math.pow(2,index))%2===1;}
function uint64(lo,hi){need(typeof lo==="number" && typeof hi==="number" && lo>=0 && lo<=4294967295 && hi>=0 && hi<=2097151 && Math.floor(lo)===lo && Math.floor(hi)===hi,"daily_uint64_invalid");var n=hi*4294967296+lo;need(n<=MAX_SAFE,"daily_uint64_unsafe");return n;}
function create(catalogue){
 var C=catalogue.Data||catalogue,D=C.definitions,F=Object.create(null),byId=Object.create(null),byKey=Object.create(null),kind=Object.create(null),n,r;
 need(C&&D&&C.records&&C.fields,"daily_catalogue_required");
 C.fields.forEach(function(f){F[f.name]=f.id;});
 C.records.forEach(function(row){if(!row.tombstone){byId[row.id]=row;byKey[row.key]=row.id;}});
 function record(key){need(byKey[key]!==undefined,"daily_record_missing:"+key);return byKey[key];}
 function definition(key){var v=D[key];need(v&&v.definition,"daily_definition_missing:"+key);return v.definition;}
 var stateId=record("daily:state"),rules=definition("daily:state"),text=C.auxiliary.daily_text,premium=definition("daily:premium"),unique=[],itemById=Object.create(null),benefitByRecord=Object.create(null),benefitById=Object.create(null),trackByRecord=Object.create(null),stackByRecord=Object.create(null),ackByRecord=Object.create(null),dependency=Object.create(null),trackRows={daily_time:[],daily_wins:[],weekly_time:[]};
 var fields=["known","day","count","count_hi","completed","has_pass","expires_at","pending","enabled","missed_mask","unique_owned_mask","progress","progress_hi","period","status","can_claim","owned_count","owned_count_hi","request_token","success","terminal","target_record","error_code"];
 fields.forEach(function(name){need(F[name]!==undefined,"daily_field_missing:"+name);});
 C.records.forEach(function(row){if(row.tombstone||row.domain!=="daily")return;
  if(row.kind==="item")unique.push({id:row.business_id,record:row.id,definition:definition(row.key)});
  if(row.kind==="benefit"){var d=definition(row.key);if(TRACKS.indexOf(d.track)>=0){var tier={id:row.business_id,record:row.id,definition:d,track:d.track};benefitByRecord[row.id]=tier;benefitById[tier.id]=tier;trackRows[d.track].push(tier);}}
 });
 unique.sort(function(a,b){return a.record-b.record;});need(unique.length===12,"daily_static_layout_changed");
 unique.forEach(function(item,index){item.bit=index;itemById[item.id]=item;dependency[item.id]={calendar:[],cycle:[],special:[],benefits:[]};});
 TRACKS.forEach(function(name){var id=record("daily:track:"+name);trackByRecord[id]=name;kind[id]="track";trackRows[name].sort(function(a,b){return a.definition.required-b.definition.required||a.record-b.record;});});
 ["welfare_zongzi","lottery_ember_of_legacy"].forEach(function(id){var rec=record("archive:points:"+id);stackByRecord[rec]=id;dependency[id]={benefits:[]};kind[rec]="owned";});
 ["claim","benefit"].forEach(function(name){var id=record("daily:ack:"+name);ackByRecord[id]=name;kind[id]="ack";});kind[stateId]="state";
 var allBenefits=[];TRACKS.forEach(function(track){trackRows[track].forEach(function(tier){kind[tier.record]="benefit";allBenefits.push(tier);});});
 var snapshot=null,stateCache=Object.create(null),intents=Object.create(null),intentRing=[],claimableCount=0,initialized=false,disposed=false,generation=1,metrics={registry_scans:1,updates:0,record_visits:0,calendar_updates:0,benefit_updates:0};
 function itemDefinition(id){
  var source=D["daily:item:"+id]||D["archive:points:"+id]||D["lottery:item:"+id]||D["lottery:currency:"+id];need(source,"daily_reward_definition_missing:"+id);
  var d=source.stackable_definition||source.definition;need(d,"daily_reward_definition_missing:"+id);return d;
 }
 function reward(id,count){var d=itemDefinition(id),v=copy(d);v.id=id;v.count=Number(count);need(isFinite(v.count)&&v.count>=0,"daily_reward_count_invalid");if(itemById[id]){v.max_owned=1;v.owned_count=undefined;}return v;}
 function rewardList(ids,counts){return (ids||[]).map(function(id,index){return reward(id,(counts||[])[index]);});}
 function initialize(){
  // A true full replaces dynamic objects. Retire every old row dependency;
  // repeated open/full recovery must not retain prior-generation snapshots.
  Object.keys(dependency).forEach(function(id){var dep=dependency[id];dep.calendar=[];dep.cycle=[];dep.special=[];dep.benefits=[];});
  snapshot={ok:true,today:undefined,claimed:undefined,count:undefined,cycle_mode:"claim_count",current_day:undefined,period_id:"",calendar28:[],calendar_current_day:undefined,calendar_start_count:undefined,ordinary_status:"unknown",premium:{status:"unconfigured",name:premium.name,description:text.premium_description},subtitle:text.subtitle,rule_text:text.rule_text,makeup_days:rules.makeup_days,next_day:undefined,has_pass:undefined,expires_at:"",missed:[],cycle:[],specials:[],price:rules.price_text,duration_days:rules.duration_days,purchase_enabled:undefined,pending:undefined,benefits:{has_pass:undefined,timezone:"Asia/Shanghai",reset_hour:5},sequence:0};
  for(n=1;n<=7;n++){var schedule=definition("daily:cycle:"+n),cy={day:n,rewards:rewardList(schedule.item_ids,schedule.item_counts),status:"unknown",is_today:0};snapshot.cycle.push(cy);cy.rewards.forEach(function(item){dependency[item.id].cycle.push(cy);});}
  for(n=1;n<=28;n++){var cd=definition("daily:calendar:"+n),sched=definition("daily:cycle:"+cd.schedule_day),ca={day:n,rewards:rewardList(sched.item_ids,sched.item_counts),status:"unknown",is_today:0};snapshot.calendar28.push(ca);ca.rewards.forEach(function(item){dependency[item.id].calendar.push(ca);});}
  (rules.pass_item_ids||[]).forEach(function(id,index){var v=reward(id,1);v.day=Number(rules.pass_milestones[index]);v.owned=undefined;snapshot.specials.push(v);dependency[id].special.push(index);});
  TRACKS.forEach(function(track){var group={period_id:"",progress:undefined,rows:[]};snapshot.benefits[track]=group;trackRows[track].forEach(function(tier){var d=tier.definition,v={id:tier.id,required:d.required,base_rewards:rewardList(d.base_item_ids,d.base_counts),monthly_rewards:rewardList(d.pass_item_ids,d.pass_counts),monthly_only:d.monthly_only?1:0,auto_claim:d.auto_claim?1:0,status:"unknown",can_claim:0,claimed:undefined};tier.row=v;tier.ready=false;group.rows.push(v);v.base_rewards.concat(v.monthly_rewards).forEach(function(item){if(dependency[item.id]&&dependency[item.id].benefits.indexOf(tier)<0)dependency[item.id].benefits.push(tier);});});});
  claimableCount=0;initialized=true;
 }
 function apply(tx,changed,read){
  need(!disposed,"daily_model_disposed");need(tx&&Array.isArray(changed)&&typeof read==="function","daily_transaction_required");metrics.updates++;
  var full=tx.full===true;if(full){stateCache=Object.create(null);initialized=false;}
  var impact={full:full,summary:false,calendar:[],specials:[],tracks:[],benefitRows:[],acks:[]},calendarSet=Object.create(null),specialSet=Object.create(null),trackSet=Object.create(null),tierSet=Object.create(null),stateChanged=full,ownedChanged=[],acks=[];
  function markCalendar(slot){if(!calendarSet[slot]){calendarSet[slot]=true;impact.calendar.push(slot);}}
  function markSpecial(index){if(!specialSet[index]){specialSet[index]=true;impact.specials.push(index);}}
  function markTrack(name){if(!trackSet[name]){trackSet[name]=true;impact.tracks.push(name);}}
  function markTier(tier){if(!tierSet[tier.record]){tierSet[tier.record]=true;impact.benefitRows.push(tier);}}
  var ids=full?[stateId].concat(Object.keys(trackByRecord).map(Number),allBenefits.map(function(t){return t.record;}),Object.keys(stackByRecord).map(Number),Object.keys(ackByRecord).map(Number)):changed;
  for(n=0;n<ids.length;n++){var id=ids[n];metrics.record_visits++;if(kind[id]==="state")stateChanged=true;else if(kind[id]==="track")markTrack(trackByRecord[id]);else if(kind[id]==="benefit")markTier(benefitByRecord[id]);else if(kind[id]==="owned")ownedChanged.push(id);else if(kind[id]==="ack")acks.push(id);}
  if(read(stateId,F.known)!==1){return {known:false,snapshot:null,changes:impact,claimable:undefined};}
  if(!initialized)initialize();snapshot.sequence=tx.revision;
  // Receipts belong to this transaction, not to every later minute update.
  delete snapshot.claim_result;delete snapshot.benefit_claim_result;
  function value(rec,name){return read(rec,F[name]);}
  function big(rec,name){var lo=value(rec,name),hi=value(rec,name+"_hi");if(lo===undefined||hi===undefined)return undefined;return uint64(lo,hi);}
  if(stateChanged){
   var count=big(stateId,"count"),today=value(stateId,"day"),completed=value(stateId,"completed"),pass=value(stateId,"has_pass"),mask=value(stateId,"unique_owned_mask"),missed=value(stateId,"missed_mask");
   need(count!==undefined&&today!==undefined&&completed!==undefined&&pass!==undefined&&mask!==undefined&&missed!==undefined,"daily_state_incomplete");
   var calendarDirty=full||count!==stateCache.count||completed!==stateCache.completed;
   var passDirty=full||pass!==stateCache.pass;
   snapshot.today=today;snapshot.claimed=completed;snapshot.count=count;snapshot.has_pass=pass;snapshot.benefits.has_pass=pass;snapshot.pending=value(stateId,"pending");snapshot.purchase_enabled=value(stateId,"enabled");var expires=value(stateId,"expires_at");snapshot.expires_at=expires===undefined?"":String(expires);
   if(calendarDirty){var anchor=Math.max(0,count-(completed?1:0)),current=anchor%7+1,start=Math.floor(anchor/28)*28,slot=anchor-start+1;
    snapshot.current_day=current;snapshot.period_id=String(Math.floor(anchor/7));snapshot.calendar_start_count=start;snapshot.calendar_current_day=slot;snapshot.next_day=count%7+1;snapshot.ordinary_status=completed?"claimed":"claimable";
    snapshot.cycle.forEach(function(row){row.status=row.day<current?"claimed":row.day===current?(completed?"claimed":"claimable"):"not_open";row.is_today=row.day===current?1:0;});
    snapshot.calendar28.forEach(function(row,index){var status=row.day<slot?"claimed":row.day===slot?(completed?"claimed":"claimable"):"not_open",isToday=row.day===slot?1:0,absolute=start+row.day;if(full||row.status!==status||row.is_today!==isToday||row.absolute_count!==absolute){row.status=status;row.is_today=isToday;row.absolute_count=absolute;markCalendar(index);}});
    snapshot.specials.forEach(function(_,index){markSpecial(index);});
   }
   if(full||today!==stateCache.today||missed!==stateCache.missed){snapshot.missed=[];for(var offset=rules.makeup_days-1;offset>=1;offset--)if(bit(missed,offset-1))snapshot.missed.push(today-offset);}
   if(full||mask!==stateCache.mask){unique.forEach(function(item){if(!full&&bit(mask,item.bit)===bit(stateCache.mask,item.bit))return;var owned=bit(mask,item.bit)?1:0,dep=dependency[item.id];dep.calendar.forEach(function(row){row.rewards.forEach(function(reward){if(reward.id===item.id)reward.owned_count=owned;});markCalendar(row.day-1);});dep.cycle.forEach(function(row){row.rewards.forEach(function(reward){if(reward.id===item.id)reward.owned_count=owned;});});dep.special.forEach(function(index){snapshot.specials[index].owned=owned;snapshot.specials[index].owned_count=owned;markSpecial(index);});});}
   if(passDirty){snapshot.specials.forEach(function(_,index){markSpecial(index);});allBenefits.forEach(markTier);TRACKS.forEach(markTrack);}
   var week=Math.floor((today+3)/7);snapshot.benefits.refresh_at=(today+1)*86400-10800;snapshot.benefits.weekly_refresh_at=((week+1)*7-3)*86400-10800;
   stateCache={count:count,completed:completed,pass:pass,mask:mask,missed:missed,today:today};impact.summary=true;
  }
  impact.tracks.forEach(function(name){var rec=record("daily:track:"+name),group=snapshot.benefits[name];if(value(rec,"known")!==1){group.progress=undefined;group.period_id="";return;}group.progress=big(rec,"progress");group.period_id=String(value(rec,"period"));if(name==="daily_wins")trackRows[name].forEach(markTier);});
  ownedChanged.forEach(function(rec){dependency[stackByRecord[rec]].benefits.forEach(markTier);});
  impact.benefitRows.forEach(function(tier){metrics.benefit_updates++;var row=tier.row,known=value(tier.record,"known")===1,status=value(tier.record,"status"),claimed=value(tier.record,"completed"),can=value(tier.record,"can_claim");row.status=!known?"unknown":status===3?"claimed":status===2?"claimable":"locked";row.claimed=claimed;row.can_claim=known&&can===1?1:0;
   var ready=row.can_claim===1&&!row.auto_claim;if(ready!==tier.ready){claimableCount+=ready?1:-1;tier.ready=ready;}
   var reserved=Object.create(null);row.base_rewards.concat(row.monthly_rewards).forEach(function(item){var rec=byKey["archive:points:"+item.id];if(!rec||!stackByRecord[rec]){item.actual_count=item.count;item.overflow_count=0;item.at_max_owned=0;return;}var knownOwned=value(rec,"known")===1,owned=big(rec,"owned_count");item.owned_count=knownOwned?owned:undefined;if(!knownOwned||owned===undefined){item.actual_count=undefined;item.overflow_count=undefined;item.at_max_owned=undefined;return;}var max=Number(item.max_owned)||0,accepted=max>0?Math.min(item.count,Math.max(0,max-owned-(reserved[item.id]||0))):item.count;if(max>0)reserved[item.id]=(reserved[item.id]||0)+accepted;item.actual_count=accepted;item.overflow_count=item.count-accepted;item.at_max_owned=max>0&&owned>=max?1:0;});
  });
  acks.forEach(function(rec){var name=ackByRecord[rec],token=value(rec,"request_token"),intent=intents[token];if(value(rec,"known")!==1||!intent||intent.kind!==name)return;var target=value(rec,"target_record"),day=value(rec,"day"),period=value(rec,"period");if(name==="claim"&&(day!==intent.target_day||period!==intent.period)||name==="benefit"&&(target!==intent.tier_record||period!==intent.period))return;
   var pending=value(rec,"pending")===1,success=value(rec,"success")===1,terminal=value(rec,"terminal")===1,code=value(rec,"error_code"),ack={ok:success,pending:pending,request_token:token,error:ERRORS[code]||ERRORS[1],terminal:terminal};
   if(name==="claim"){ack.target_day=day;snapshot.claim_result=ack;}else{var tier=benefitByRecord[target];if(!tier)return;ack.track=tier.track;ack.tier_id=tier.id;snapshot.benefit_claim_result=ack;}
   impact.acks.push(ack);if(terminal)delete intents[token];
  });
  metrics.calendar_updates+=impact.calendar.length;
  return {known:true,snapshot:snapshot,changes:impact,claimable:snapshot.ordinary_status==="claimable"||claimableCount>0};
 }
 function bindIntent(kind,token,detail){need(!disposed&&Number.isInteger(token)&&token>=1&&token<=16383,"daily_intent_invalid");need(kind==="claim"||kind==="benefit","daily_intent_kind_invalid");need(!intents[token],"daily_intent_token_reused");var intent=copy(detail);intent.kind=kind;intents[token]=intent;intentRing.push(token);if(intentRing.length>32)delete intents[intentRing.shift()];return true;}
 function reset(){snapshot=null;stateCache=Object.create(null);intents=Object.create(null);intentRing=[];initialized=false;claimableCount=0;generation++;}
 function dispose(){reset();disposed=true;}
 function inspect(){return {known:!!snapshot,generation:generation,disposed:disposed,metrics:copy(metrics)};}
 return {Apply:apply,BindIntent:bindIntent,Reset:reset,Dispose:dispose,Inspect:inspect,Record:record,Field:function(name){return F[name];},BenefitRecord:function(id){return benefitById[id]&&benefitById[id].record;},Snapshot:function(){return snapshot;}};
}
return {Create:create,JoinUnsigned:uint64,ErrorText:function(code){return ERRORS[code]||ERRORS[1];}};
}));
