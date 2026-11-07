// Candidate only: read-only foreign shared-lab prerequisites and levels; no queue/cost data.
// Initialization O(3 + 10 static research definitions). Stable reads O(1), no
// timers, entity scans or network sends. A real slot transaction is O(changed
// production records); full replacement is bounded by 10 prerequisite/level rows.
(function(factory){
 "use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 else if(typeof GameUI!=="undefined")GameUI.CustomUIConfig().SurvivalPreparedResearchModel=api;
}(function(){
 "use strict";
 function copy(value){if(!value||typeof value!=="object")return value;var result=Array.isArray(value)?[]:{};Object.keys(value).forEach(function(key){if(key!=="job_id"&&key!=="job_handle")result[key]=copy(value[key]);});return result;}
 function create(options){
  var runtime=options.runtime,catalogue=options.catalogue,table=catalogue.Data||catalogue;
  var F=catalogue.FieldIds||{},R=catalogue.ByKey||{},slots=[],definitions=[],definitionByRecord={},byEntity=Object.create(null),active=true,scopeKey=null,scopeReady=false,boundViewer=Number(options.viewerId());
  var stats={commits:0,changes:0,stale:0,invalid:0,scope_resets:0,reads:0};
  if(!catalogue.FieldIds)table.fields.forEach(function(row){F[row.name]=row.id;});if(!catalogue.ByKey)table.records.forEach(function(row){if(!row.tombstone)R[row.key]=row.id;});
  var root=R["production:state"];
  if(!root||!runtime.ScopeIdentity||typeof options.viewerId!=="function")throw new Error("prepared_dependencies_required");
  table.auxiliary.production.research.forEach(function(row){if(row.mapping.building_id!=="building_advanced_research_lab")return;
   var item={id:R["production:research:"+row.group],name:row.ability_name,maximum:row.definition.max_level};
   if(!item.id)throw new Error("prepared_research_definition_missing");definitions.push(item);definitionByRecord[item.id]=item;
  });
  if(definitions.length!==10)throw new Error("prepared_shared_research_shape_changed");
  function makeModel(){
   var entity=0,sequence=0,snapshot=null;
   return {Select:function(e,s){entity=e;sequence=s;snapshot=null;},Apply:function(tx,changed,read){
    if(read(root,F.production_entity)!==entity||read(root,F.production_selection)!==sequence)return{stale:true};
    if(!snapshot&&!tx.full)throw new Error("prepared_full_required");
    (tx.changes||[]).forEach(function(change){
     var allowed=change.record===root?(change.field===F.known||change.field===F.production_entity||change.field===F.production_selection)
      :!!definitionByRecord[change.record]&&(change.field===F.level||change.field===F.production_flags);
     if(!allowed||change.remove)throw new Error("prepared_partial_field_out_of_scope");
    });
    var ids=tx.full?definitions.map(function(item){return item.id;}):changed,staged={};
    for(var n=0;n<ids.length;n++){
     if(ids[n]===root)continue;var item=definitionByRecord[ids[n]];if(!item)throw new Error("prepared_record_out_of_scope");
     var level=read(item.id,F.level),flags=read(item.id,F.production_flags);
     if(typeof level!=="number"||level!==Math.floor(level)||level<0||level>item.maximum||flags!==0&&flags!==2)throw new Error("prepared_partial_row_invalid");
     staged[item.name]={current_level:level,prerequisite_met:flags===2?1:0,research_prerequisite_known:1,_prepared_partial:true};
    }
    if(!snapshot)snapshot={entindex:entity,success:1,partial:true,research:{abilities_by_name:{}}};
    Object.keys(staged).forEach(function(name){snapshot.research.abilities_by_name[name]=staged[name];});
    return{known:true,snapshot:snapshot};
   }};
  }
  function live(){return active&&(!options.current||options.current());}
  function changed(entity){stats.changes++;if(live()&&options.onChanged)options.onChanged(entity);}
  function clear(slot){var old=slot.entity;if(old&&byEntity[old]===slot)delete byEntity[old];slot.snapshot=null;slot.model=makeModel();if(slot.sequence>0)slot.model.Select(slot.entity,slot.sequence);if(old)changed(old);}
  function scope(){
   if(!live())return false;var state=runtime.ScopeIdentity(),viewer=Number(options.viewerId());
   var next=String(viewer)+"|"+String(state.loading_identity)+"|"+String(state.session)+"|"+String(state.active);
   var ready=state.active===true&&state.ready===true&&viewer===boundViewer&&viewer>=0&&viewer<4&&viewer===Math.floor(viewer);
   if(next!==scopeKey||scopeReady&&!ready){scopeKey=next;scopeReady=ready;stats.scope_resets++;byEntity=Object.create(null);
    slots.forEach(function(slot){var old=slot.entity;slot.entity=0;slot.sequence=0;slot.snapshot=null;slot.model=makeModel();if(old)changed(old);});
    slots.forEach(function(slot){if(viewer===boundViewer)slot.view.Probe();else slot.view.Close();});
   }else scopeReady=ready;
   return ready;
  }
  function identity(slot,entity,sequence){
   if(typeof entity!=="number"||entity!==Math.floor(entity)||entity<0||entity>4294967295||typeof sequence!=="number"||sequence!==Math.floor(sequence)||sequence<1||sequence>4294967295){stats.invalid++;return false;}
   if(sequence<slot.sequence||sequence===slot.sequence&&slot.entity!==entity){stats.stale++;return false;}
   if(sequence!==slot.sequence||slot.entity!==entity){clear(slot);slot.sequence=sequence;slot.entity=entity;slot.model.Select(entity,sequence);}
   return true;
  }
  function hint(slot,value){
   if(!scope()||!value||typeof value.known!=="boolean")return;
   if(value.known&&value.entity<=0||!value.known&&value.entity!==0){stats.invalid++;return;}
   if(!identity(slot,value.entity,value.selection))return;
   if(value.known)slot.view.Open();else{clear(slot);slot.view.Probe();}
  }
  function commit(slot,tx,ids,read){
   if(!scope())return true;
   var entity=read(root,F.production_entity),sequence=read(root,F.production_selection),known=read(root,F.known)===1||read(root,F.known)===true;
   if(!identity(slot,entity,sequence))return true;
   if(!known){clear(slot);slot.view.Probe();return true;}
   if(entity<=0){stats.invalid++;clear(slot);return false;}
   // A hint establishes identity only. No display becomes ready until a full
   // private prerequisite/level model has committed for that entity/sequence.
   if(!slot.snapshot&&!tx.full){stats.invalid++;return false;}
   var result=slot.model.Apply(tx,ids,read);
   if(result.stale||!result.known||!result.snapshot||!result.snapshot.research){stats.invalid++;return false;}
   if(byEntity[entity]&&byEntity[entity]!==slot){stats.invalid++;clear(slot);return false;}
   slot.snapshot=result.snapshot;byEntity[entity]=slot;stats.commits++;changed(entity);return true;
  }
  for(var index=1;index<5;index++)if(index-1!==boundViewer)(function(index){
   var slot={index:index,entity:0,sequence:0,snapshot:null,model:makeModel(),view:null};
   slot.view=runtime.CreateView("research_prepared:"+index,{onHint:function(value){if(live())hint(slot,value);},
    onCommit:function(tx,ids,read){return live()?commit(slot,tx,ids,read):true;},
    onError:function(){if(live())clear(slot);}});slots.push(slot);
  })(index);
  scope();
  function row(unit,name){stats.reads++;if(!scope())return null;var slot=byEntity[Number(unit)];
   return slot&&slot.snapshot&&slot.snapshot.research&&slot.snapshot.research.abilities_by_name[name]||null;
  }
  return {GetPrerequisite:function(unit,name){var original=row(unit,name);if(!original)return null;
    var result={};Object.keys(original).forEach(function(key){result[key]=original[key];});return result;},
   DisplaySnapshot:function(unit){if(!scope())return null;var slot=byEntity[Number(unit)];return slot&&slot.snapshot?copy(slot.snapshot):null;},
   Dispose:function(){if(!active)return;active=false;slots.forEach(function(slot){slot.view.Dispose();slot.snapshot=null;});byEntity=Object.create(null);},
   Inspect:function(){scope();return {active:live(),ready:scopeReady,scope:scopeKey,stats:Object.assign({},stats),
    slots:slots.map(function(slot){return {view:11+slot.index,entity:slot.entity,sequence:slot.sequence,ready:!!slot.snapshot};})};}};
 }
 return {Create:create};
}));
