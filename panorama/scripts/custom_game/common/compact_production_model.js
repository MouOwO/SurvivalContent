// Reconstruct the original private production presentation from local config
// and changed typed rows. No timers, engine calls, catalogue clones or rules.
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactProductionModel=api;}(function(){
"use strict";
var cache=typeof WeakMap!=="undefined"?new WeakMap():null,MAX=9007199254740991;
function need(v,e){if(!v)throw new Error(e);}
function copy(v){var out={};Object.keys(v||{}).forEach(function(k){out[k]=v[k];});return out;}
function flag(n,bit){return Math.floor(n/Math.pow(2,bit))%2;}
function double(hi,lo){need(typeof hi==="number"&&typeof lo==="number","production_clock_unknown");var sign=hi>=2147483648?-1:1,e=Math.floor(hi/1048576)%2048,m=(hi%1048576)*4294967296+lo;need(e!==2047,"production_clock_nonfinite");return e===0?sign*m*Math.pow(2,-1074):sign*(1+m/4503599627370496)*Math.pow(2,e-1023);}
function indexes(catalogue){
 if(cache&&cache.has(catalogue))return cache.get(catalogue);
 var C=catalogue.Data||catalogue,P=C.auxiliary.production,F=catalogue.FieldIds||{},R=catalogue.ByKey||{},by={},training=[],research=[],jobs=[],receipts=[];
 need(P,"production_seed_required");if(!catalogue.FieldIds)C.fields.forEach(function(row){F[row.name]=row.id;});if(!catalogue.ByKey)C.records.forEach(function(row){if(!row.tombstone)R[row.key]=row.id;});
 function rec(key){need(R[key],"production_record_missing:"+key);return R[key];}
 P.training.forEach(function(row){var item={id:rec("production:training:"+row.training_id),kind:"training",row:row};training.push(item);by[item.id]=item;});
 P.research.forEach(function(row){var levels={};row.levels.forEach(function(level){levels[level.level]=level;});var item={id:rec("production:research:"+row.group),kind:"research",row:row,levels:levels};research.push(item);by[item.id]=item;});
 for(var n=1;n<=7;n++){var job={id:rec("production:job:"+n),kind:"job",slot:n-1};jobs.push(job);by[job.id]=job;}
 for(n=1;n<=8;n++){var receipt={id:rec("production:receipt:"+n),kind:"receipt"};receipts.push(receipt);by[receipt.id]=receipt;}
 var out={P:P,F:F,R:R,root:rec("production:state"),training:training,research:research,jobs:jobs,receipts:receipts,by:by};if(cache)cache.set(catalogue,out);return out;
}
function create(catalogue){
 var I=indexes(catalogue),F=I.F,P=I.P,entity=0,selection=0,snapshot=null,pending={},seen={},visits=0;
 var operations={8:"worker_train",9:"research_queue",10:"shop_auto_research_toggle",11:"research_cancel"};
 var statusText=P.status_labels;
 function uint(read,id,name,hi){var lo=read(id,F[name]),high=read(id,F[hi||name+"_hi"]);need(typeof lo==="number"&&typeof high==="number"&&lo>=0&&lo<=4294967295&&high>=0&&high<=2097151,"production_integer_unknown");var n=lo+high*4294967296;need(n<=MAX,"production_integer_unsafe");return n;}
 function clock(read,id,name){return double(read(id,F["production_"+name+"_hi"]),read(id,F["production_"+name+"_lo"]));}
 function err(code){return code===0?"":P.errors[code]||P.errors[1]||"操作未完成";}
 function apply(tx,changed,read){
  var actualEntity=read(I.root,F.production_entity),actualSelection=read(I.root,F.production_selection);
  if(actualEntity!==entity||actualSelection!==selection)return{known:false,stale:true,entity:actualEntity,selection:actualSelection};
  var known=read(I.root,F.known)===1,kind=read(I.root,F.production_kind),full=tx.full||!snapshot;
  var ids=full?I.training.concat(I.research,I.jobs,I.receipts).map(function(row){return row.id;}):changed,rootChanged=full||changed.indexOf(I.root)>=0,queueChanged=rootChanged,researchChanged=rootChanged,receiptRows=[];
  if(!snapshot)snapshot={entindex:entity,success:1,source:"compact_production"};
  if(!known){snapshot={entindex:entity,success:1,source:"compact_production"};return{known:false,snapshot:snapshot,receipts:[]};}
  need(kind===1||kind===2,"production_kind_invalid");
  var state=kind===1?(snapshot.training||(snapshot.training={options:[]})):(snapshot.research||(snapshot.research={abilities_by_name:{}}));
  if(kind===1)delete snapshot.research;else delete snapshot.training;
  for(var n=0;n<ids.length;n++){
   var item=I.by[ids[n]];if(!item)continue;visits++;
   if(item.kind==="receipt"){receiptRows.push(item);continue;}
   if(item.kind==="job"){queueChanged=true;continue;}
   if(kind===1&&item.kind==="training"){
    var option=copy(item.row),flags=read(item.id,F.production_flags);need(typeof flags==="number","production_training_unknown");
    option.count=uint(read,item.id,"count");option.max_count=read(item.id,F.production_max_count);option.queued_count=read(item.id,F.production_queued_count);
    option.available=flag(flags,0);option.prerequisite_met=flag(flags,1);option.completed=flag(flags,2);option.unlimited=option.max_count<0?1:0;
    option.can_afford=1;option.resource_check_on_cast=1;option.reason=err(read(item.id,F.error_code));
    state.options[I.training.indexOf(item)]=option;
   }else if(kind===2&&item.kind==="research"){
    researchChanged=true;
    if(read(item.id,F.known)!==1){delete state.abilities_by_name[item.row.ability_name];continue;}
    var level=read(item.id,F.level),reserved=read(item.id,F.production_reserved_level),flags2=read(item.id,F.production_flags),def=item.row.definition,mapping=item.row.mapping;
    var target=Math.max(level,reserved)+1,maximum=def.max_level;if(target>maximum)target=level;
    var a=item.levels[level],b=item.levels[target];need(a&&b&&typeof flags2==="number","production_research_level_unknown");
    var status=P.status_codes[read(item.id,F.production_status)];need(status!==undefined&&statusText[status]!==undefined,"production_status_unknown");
    var sections=a.sections||{},baseDescription=sections.research_effect_description||a.research_effect_description;
    var currentText=a.current_effect_text,nextText=target>level?b.upgrade_effect_text:"";
    var runtime={ability_name:item.row.ability_name,research_upgrade:1,prerequisite_met:flag(flags2,1),resource_check_on_cast:1,auto_research_available:flag(flags2,4),auto_research_enabled:flag(flags2,3),
     completed:flag(flags2,2),available:flag(flags2,0),can_afford:(status==="max_level"||status==="queued_max_level")?0:1,display_name:mapping.display_name,current_level:level,next_level:target,max_level:maximum,
     research_status_code:status,status_text:statusText[status],upgrade_description:baseDescription+"\n"+currentText+(nextText?"\n"+nextText:""),research_effect_description:baseDescription,current_effect_text:currentText,next_effect_text:nextText,
     cost_wood:uint(read,item.id,"wood"),cost_gold:uint(read,item.id,"gold"),research_slot_order:mapping.slot_order,research_building_id:mapping.building_id,technology_group:item.row.group,
     research_effect_current:a.research_effect_value,research_effect_next:b.research_effect_value,fields:a.fields,reserved_level:reserved};
    state.abilities_by_name[item.row.ability_name]=runtime;
   }
  }
  if(rootChanged){
   state.queue_capacity=read(I.root,F.production_capacity);state.queue_count=read(I.root,F.production_queue_count);state.blocked_reason=err(read(I.root,F.error_code));
   if(kind===1)state.queue_revision=read(I.root,F.production_revision);else{state.sequence=read(I.root,F.production_revision);state.capacity=state.queue_capacity;state.auto_enabled=read(I.root,F.automatic);state.next_start_at=clock(read,I.root,"next");state.started_at=clock(read,I.root,"started");state.finish_at=clock(read,I.root,"finish");state.duration=clock(read,I.root,"duration");}
  }
  if(queueChanged){
   state.queued=[];state.active_job={};state.blocked_head={};
   I.jobs.forEach(function(item){var code=read(item.id,F.production_job_state);if(code===undefined)return;var defItem=I.by[read(item.id,F.target_record)];need(defItem&&defItem.kind===(kind===1?"training":"research"),"production_job_definition_unknown");
    var row=defItem.row,job={job_id:read(item.id,F.production_job_handle),level:read(item.id,F.level),started_at:clock(read,item.id,"started"),finish_at:clock(read,item.id,"finish"),duration:clock(read,item.id,"duration")};
    if(kind===1){job.training_id=row.training_id;job.name=row.name;}else{job.technology_group=row.group;job.group=row.group;job.display_name=row.mapping.display_name;job.target_level=job.level;job.ability_name=row.ability_name;job.icon_name=row.mapping.icon_name||"";}
    if(code===1)state.active_job=job;else if(code===2)state.blocked_head=job;else if(code===3)state.queued.push(job);else need(false,"production_job_state_invalid");
   });
  }
  if(kind===2&&(queueChanged||researchChanged)){
   var active=state.active_job||{},head=active.job_id?active:state.blocked_head||{};state.researching=active.job_id?1:0;state.research_group=head.technology_group||"";state.display_name=head.display_name||"";state.target_level=head.target_level||0;state.research_target_level=state.target_level;
   state.ability_name=head.ability_name||"";state.icon_name=head.icon_name||"";state.queued_count=state.queued.length;state.auto_research={};state.reserved_levels={};
   Object.keys(state.abilities_by_name).forEach(function(name){var row=state.abilities_by_name[name];if(row.auto_research_enabled)state.auto_research[row.technology_group]=1;if(row.reserved_level)state.reserved_levels[row.technology_group]=row.reserved_level;
    row.researching=state.researching;row.research_group=state.research_group;row.research_name=state.display_name;row.research_target_level=state.target_level;row.research_started_at=state.started_at;row.research_until=state.finish_at;row.research_total=state.duration;row.auto_research_next_at=state.next_start_at;row.research_queue_count=state.queue_count;row.research_queue_capacity=state.queue_capacity;});
  }
  var results=[];receiptRows.forEach(function(item){var token=read(item.id,F.request_token);if(!token||seen[token])return;var intent=pending[token];if(!intent)return;var action=read(item.id,F.action_code);need(operations[action],"production_receipt_action_unknown");
   var code=err(read(item.id,F.error_code));
   var result={request_id:intent.id,source_entindex:read(item.id,F.production_entity),operation:operations[action],success:read(item.id,F.success),queued:flag(read(item.id,F.production_flags)||0,0),refunded:read(item.id,F.production_refunded),error:P.error_messages[code]||code,error_code:code};
   if(result.operation==="worker_train"&&result.source_entindex===entity)result.training=snapshot.training;
   seen[token]=true;delete pending[token];results.push(result);
  });
  return{known:true,snapshot:snapshot,receipts:results,kind:kind};
 }
 return{Select:function(e,s){entity=e;selection=s;snapshot=null;},Apply:apply,BindIntent:function(token,id,unit){need(token>0&&!pending[token]&&!seen[token],"production_token_reused");pending[token]={id:id,unit:unit};},
  DefinitionRecord:function(key){var prefix=key.indexOf("train_")===0?"training:":"research:";return I.R["production:"+prefix+key];},Snapshot:function(){return snapshot;},Inspect:function(){return{entity:entity,selection:selection,record_visits:visits,pending:Object.keys(pending).length};}};
}
return{Create:create};
}));
