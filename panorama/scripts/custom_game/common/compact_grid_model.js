(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;
 if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactGridModel=api;
}(function(){"use strict";
 function need(value,why){if(!value)throw new Error(why);}
 var indexCache=new WeakMap();
 function create(catalogue){
  var C=catalogue.Data||catalogue,G=C.auxiliary.grid,index=indexCache.get(C);
  if(!index){var fields=catalogue.FieldIds||Object.create(null),records=catalogue.ByKey||Object.create(null);if(!catalogue.FieldIds)C.fields.forEach(function(f){fields[f.name]=f.id;});if(!catalogue.ByKey)C.records.forEach(function(r){if(!r.tombstone)records[r.key]=r.id;});var bases=Object.create(null);(G.atlases||[]).forEach(function(base){var p=base.area.split("|"),states=[],words=[];for(var n=0;n<base.width*base.height;n++)states.push((parseInt(p[7].charAt(Math.floor(n/2)),16)>>>((n%2)*2))&3);for(var n=0;n<states.length;n+=16){var word=0;for(var bit=0;bit<16&&n+bit<states.length;bit++)word+=states[n+bit]*Math.pow(4,bit);words.push(word>>>0);}bases[base.id]={metadata:base,states:states,words:words};});index={F:fields,R:records,bases:bases};indexCache.set(C,index);}
  var F=index.F,R=index.R;
  need(G,"grid_static_catalogue_required");
  if(!index.grid){var shared={wordIndex:Object.create(null),profiles:Object.create(null),profileRecords:Object.create(null),layoutIds:Object.create(null),words:{area:[],static:[]}};
   G.profiles.forEach(function(p){shared.profiles[R["grid:profile:"+p.ability_name]]=p;shared.profileRecords[p.ability_name]=R["grid:profile:"+p.ability_name];});
   ["min_display","max_display","min_build","max_build","plane"].forEach(function(n){shared.layoutIds[R["grid:layout:"+n]]=true;});
   ["area","static"].forEach(function(kind){var max=kind==="area"?256:4096;for(var i=1;i<=max;i++){var id=R["grid:"+kind+":word:"+i];need(id,"grid_word_record_missing");shared.words[kind].push(id);shared.wordIndex[id]={kind:kind,index:i-1};}});index.grid=shared;
  }
  var shared=index.grid,wordIndex=shared.wordIndex,profiles=shared.profiles,profileRecords=shared.profileRecords,layoutIds=shared.layoutIds;
  var state=R["grid:state"],validation=R["grid:validation"],commit=R["grid:commit"];
  var areas={area:{meta:R["grid:area:meta"],words:shared.words.area,atlas:null,overrides:Object.create(null)},static:{meta:R["grid:static:meta"],words:shared.words.static,atlas:null,overrides:Object.create(null)}};
  var scope=0,map=2,lastValidation=null,lastCommit=null,revision=0,metrics={field_reads:0,word_visits:0,cell_visits:0,container_rebuilds:0};
  function get(read,id,name){metrics.field_reads++;return read(id,F[name]);}
  function double(read,id,axis,fallback){var hi=get(read,id,"grid_"+axis+"_hi"),lo=get(read,id,"grid_"+axis+"_lo");if(hi===undefined&&lo===undefined)return fallback;need(hi!==undefined&&lo!==undefined,"grid_float_words_missing");var b=new ArrayBuffer(8),d=new DataView(b);d.setUint32(0,hi);d.setUint32(4,lo);var v=d.getFloat64(0);need(isFinite(v),"grid_float_invalid");return v;}
  function common(read,id){var own=get(read,id,"grid_scope");if(own!==undefined)scope=own;return {grid_scope:"cw:"+scope,grid_scope_version:scope,session_id:get(read,id,"grid_session"),request_id:get(read,id,"grid_request")};}
  function areaApply(kind,read,indices,header){
   var a=areas[kind],known=get(read,a.meta,"known");if(known!==1){a.atlas=null;a.overrides=Object.create(null);return null;}
   if(kind==="static"){var own=get(read,a.meta,"grid_scope");if(scope===0)scope=own;if(own!==scope)return null;}
   var size=get(read,a.meta,"grid_size"),x=get(read,a.meta,"grid_origin_x"),y=get(read,a.meta,"grid_origin_y"),w=get(read,a.meta,"grid_width"),h=get(read,a.meta,"grid_height"),z=double(read,a.meta,"z");
   need([size,x,y,w,h,z].every(function(n){return typeof n==="number"&&isFinite(n);})&&w>=1&&h>=1&&w*h<=a.words.length*16,"grid_area_header_invalid");
   var baseId=kind==="static"?(get(read,a.meta,"grid_atlas_base")||0):0,base=baseId&&index.bases[baseId];
   if(baseId){need(base&&base.metadata.size===size&&base.metadata.origin_x===x&&base.metadata.origin_y===y&&base.metadata.width===w&&base.metadata.height===h&&base.metadata.ground_height===z,"grid_atlas_base_mismatch");}
   var next=a.atlas,rebuild=!next||next.size!==size||next.x!==x||next.y!==y||next.w!==w||next.h!==h||next.z!==z||next.base!==baseId;
   if(rebuild){next={size:size,x:x,y:y,w:w,h:h,z:z,base:baseId,states:base?base.states.slice():new Array(w*h).fill(0),revision:0,changes:[],rebuild:true};a.atlas=next;var set=Object.create(null);indices.forEach(function(n){set[n]=true;});Object.keys(a.overrides).forEach(function(n){set[n]=true;});indices=Object.keys(set).map(Number);metrics.container_rebuilds++;}
   var changed=[];indices.forEach(function(word){metrics.word_visits++;var value=get(read,a.words[word],"grid_word");if(value===undefined){delete a.overrides[word];value=base?base.words[word]:0;}else a.overrides[word]=true;for(var bit=0;bit<16&&word*16+bit<w*h;bit++){var n=word*16+bit,v=(value>>>bit*2)&3;need(v!==3,"grid_area_state_invalid");if(next.states[n]!==v){next.states[n]=v;changed.push(n);}}});
   next.changes=changed;next.rebuild=rebuild;next.complete=get(read,a.meta,"grid_complete")===1;
   if(rebuild||changed.length){next.revision++;return next;}return header?next:null;
  }
  function apply(tx,changed,read){
   var dirty=Object.create(null),wordChanges={area:[],static:[]};changed.forEach(function(id){dirty[id]=true;var word=wordIndex[id];if(word)wordChanges[word.kind].push(word.index);});
   var out={};
   if(dirty[state]||Object.keys(layoutIds).some(function(id){return dirty[id];})){
    var known=get(read,state,"known");if(known===1){var nextScope=get(read,state,"grid_scope");if(scope!==0&&nextScope!==scope){Object.keys(areas).forEach(function(kind){areas[kind].atlas=null;areas[kind].overrides=Object.create(null);});lastValidation=null;lastCommit=null;}scope=nextScope;map=get(read,state,"grid_map")||map;
     var names=["default","template_map","survival_c6"],config=G.maps[names[map-1]];need(config,"grid_map_unknown");
     var ready=get(read,state,"grid_layout_ready")===1,layout=null;
     if(ready){layout={bounds:{},build_bounds:{}};[["display","bounds"],["build","build_bounds"]].forEach(function(pair){["x","y"].forEach(function(axis){layout[pair[1]]["min_"+axis]=double(read,R["grid:layout:min_"+pair[0]],axis);layout[pair[1]]["max_"+axis]=double(read,R["grid:layout:max_"+pair[0]],axis);});});layout.height=double(read,R["grid:layout:plane"],"z");}
     out.profiles={grid_scope:"cw:"+scope,grid_scope_version:scope,profiles:G.profiles,cell_size:config.cell_size,preview_visual:config.preview_visual,layout_ready:ready?1:0,static_grid:layout,error:G.errors[get(read,state,"grid_error")||0]};
     if(areas.static.atlas)out.static=areas.static.atlas;
    }
   }
   Object.keys(areas).forEach(function(kind){var a=areas[kind];if(dirty[a.meta]||wordChanges[kind].length){var area=areaApply(kind,read,wordChanges[kind],!!dirty[a.meta]);if(area)out[kind]=area;else if(kind==="static"&&dirty[a.meta]&&get(read,a.meta,"known")!==1)out.static_reset=true;}});
   var cellDirty=false;for(var c=1;c<=16;c++)if(dirty[R["grid:cell:"+c]])cellDirty=true;
   if(dirty[validation]||cellDirty){
    if(get(read,validation,"known")===1){var p=profiles[get(read,validation,"grid_profile")];need(p,"grid_profile_unknown");var d=common(read,validation),size=G.maps[["default","template_map","survival_c6"][map-1]].cell_size;
     ["anchor_x","anchor_y","request_anchor_x","request_anchor_y"].forEach(function(n){d[n]=get(read,validation,"grid_"+n);});
     d.ability_name=p.ability_name;d.building_id=p.building_id;d.success=get(read,validation,"success");d.error=G.errors[get(read,validation,"grid_error")||0];
     d.world_x=double(read,validation,"x",(d.anchor_x+(p.grid_footprint_x%2)*0.5)*size);d.world_y=double(read,validation,"y",(d.anchor_y+(p.grid_footprint_y%2)*0.5)*size);d.world_z=double(read,validation,"z");
     var count=get(read,validation,"grid_cell_count"),mask=get(read,validation,"grid_cell_mask"),list=[];need(count===0||count===p.grid_footprint_x*p.grid_footprint_y&&count<=16,"grid_cell_shape_changed");
     for(var n=0;n<count;n++){metrics.cell_visits++;list.push({x:(d.anchor_x-Math.floor(p.grid_footprint_x/2)+Math.floor(n/p.grid_footprint_y)+0.5)*size,y:(d.anchor_y-Math.floor(p.grid_footprint_y/2)+n%p.grid_footprint_y+0.5)*size,z:double(read,R["grid:cell:"+(n+1)],"z",d.world_z),ok:(mask>>>n)&1});}
     d.cells=list;d.area_state=areas.area.atlas;d.area_complete=d.area_state&&d.area_state.complete?1:0;out.validation=d;lastValidation=d;
    }
   }
   if(out.area){out.area_notification=common(read,areas.area.meta);out.area_notification.area_state=out.area;out.area_notification.complete=out.area.complete?1:0;var pid=get(read,areas.area.meta,"grid_profile");out.area_notification.ability_name=profiles[pid]&&profiles[pid].ability_name;}
   if(dirty[commit]&&get(read,commit,"known")===1){var result=common(read,commit);result.success=get(read,commit,"success");result.error=G.errors[get(read,commit,"grid_error")||0];out.commit=result;lastCommit=result;}
   revision++;return out;
  }
  function input(action,payload){var values={grid_session:Number(payload.session_id),grid_request:Number(payload.request_id)||1};if(action===1||action===2||action===4){values.grid_profile=profileRecords[payload.ability_name];values.grid_actor=Number(payload.entindex);values.grid_ability=Number(payload.ability_entindex);["x","y","z"].forEach(function(axis){var b=new ArrayBuffer(8),d=new DataView(b),value=Number(payload[axis]);need(isFinite(value),"grid_input_float_invalid");d.setFloat64(0,value);values["grid_"+axis+"_hi"]=d.getUint32(0);values["grid_"+axis+"_lo"]=d.getUint32(4);});}return values;}
  return {Apply:apply,Input:input,Inspect:function(){return {revision:revision,metrics:metrics,scope:scope};}};
 }
 return {Create:create};
}));
