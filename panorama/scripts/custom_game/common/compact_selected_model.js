(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactSelectedModel=api;}(function(){
"use strict";
function need(v,e){if(!v)throw new Error(e);}
function create(catalogue){
 var C=catalogue.Data||catalogue,F=catalogue.FieldIds||{},R=catalogue.ByKey||{},records=catalogue.ById||{},rows={},layout=C.auxiliary.selected;
 need(layout,"selected_layout_required");if(!catalogue.FieldIds)C.fields.forEach(function(f){F[f.name]=f.id;});if(!catalogue.ByKey)C.records.forEach(function(r){if(!r.tombstone){R[r.key]=r.id;records[r.id]=r;}});
 var root=R["selected:state"],currentEntity=-1,currentToken=0,snapshot=null,visits=0,zeroGroups={},maskCache={};
 function index(paths,kind){paths.forEach(function(path,index){var r=R["selected:metric:"+path];need(r,"selected_metric_missing");var group=R['selected:zero:'+(Math.floor(index/32)+1)],power=Math.pow(2,index%32);rows[r]={path:path.split("."),kind:kind,group:group,power:power};if(kind==='number'){need(group,'selected_zero_schema_required');(zeroGroups[group]||(zeroGroups[group]=[])).push(r);}});}
 index(layout.numeric_paths,"number");index(layout.text_paths,"text");
 function set(target,path,value){for(var i=0;i<path.length-1;i++){var k=/^\d+$/.test(path[i])?Number(path[i])-1:path[i];if(!target[k]){if(value===undefined)return;target[k]=/^\d+$/.test(path[i+1])?[]:{};}target=target[k];}var last=path[path.length-1];last=/^\d+$/.test(last)?Number(last)-1:last;if(value===undefined)delete target[last];else target[last]=value;}
 function double(hi,lo){if(hi===undefined||lo===undefined)return undefined;var sign=hi>=2147483648?-1:1,exp=Math.floor(hi/1048576)%2048,mantissa=(hi%1048576)*4294967296+lo;need(exp!==2047,"selected_nonfinite");if(exp===0)return sign*mantissa*Math.pow(2,-1074);return sign*(1+mantissa/4503599627370496)*Math.pow(2,exp-1023);}
 function apply(tx,changed,read){
  var entity=read(root,F.selected_entity),token=read(root,F.selected_token);
  if(entity!==currentEntity||token!==currentToken)return{stale:true,known:false,entity:entity,token:token};
  if(read(root,F.known)!==1)return{known:false,entity:entity,token:token,error_code:read(root,F.error_code)};
  var next=snapshot;if(tx.full||!next){next={entindex:entity,success:1,source:"compact_selected",stat_tooltips:{attack:{unit:"logical_damage"},armor:{unit:"war3_display"},attributes:{unit:"logical_attribute"},attack_speed:{unit:"percent",interval_reductions:[],speed_bonuses:[]}},armor_unit:"war3_display"};}
  var ids=tx.full?Object.keys(rows):changed.slice(),seen={},staged=[],nextMasks={};ids.forEach(function(id){seen[id]=true;});
  Object.keys(zeroGroups).forEach(function(group){if(!tx.full&&changed.indexOf(Number(group))<0)return;var mask=read(Number(group),F.zero_mask);need(typeof mask==='number','selected_zero_mask_unknown');nextMasks[group]=mask;
   if(!tx.full)zeroGroups[group].forEach(function(id){var row=rows[id];if(Math.floor(mask/row.power)%2!==Math.floor((maskCache[group]||0)/row.power)%2&&!seen[id]){seen[id]=true;ids.push(id);}});
  });
  for(var n=0;n<ids.length;n++){var id=Number(ids[n]),row=rows[id];if(!row)continue;visits++;var value=undefined;
   if(row.kind==="number"){
    var hi=read(id,F.selected_value_hi),lo=read(id,F.selected_value_lo),integer=read(id,F.selected_value_int),mask=read(row.group,F.zero_mask),zero=mask!==undefined&&Math.floor(mask/row.power)%2===1;
    need((hi===undefined)===(lo===undefined),'selected_numeric_word_pair_required');
    need(!(zero&&(integer!==undefined||hi!==undefined||lo!==undefined))&&!(integer!==undefined&&(hi!==undefined||lo!==undefined)),'selected_numeric_representation_conflict');
    value=zero?0:integer!==undefined?integer:double(hi,lo);
   }
   else{var ref=read(id,F.target_record);if(read(id,F.known)===0)value="";else if(ref===0)value="";else if(ref!==undefined){var r=records[ref],d=r&&C.definitions[r.key];need(r&&r.domain==="selected"&&r.kind==="text"&&d&&d.definition,"selected_text_unknown");value=d.definition.value;}}
   staged.push({row:row,value:value,unknown:row.kind==='text'&&read(id,F.known)===0});
  }
  if(!next._selected_unknown_fields)next._selected_unknown_fields={};staged.forEach(function(w){set(next,w.row.path,w.value);if(w.unknown)next._selected_unknown_fields[w.row.path.join('.')]=true;else delete next._selected_unknown_fields[w.row.path.join('.')];});Object.keys(nextMasks).forEach(function(g){maskCache[g]=nextMasks[g];});next._selected_aux_pending=read(root,F.pending)===1;snapshot=next;return{known:true,entity:entity,token:token,snapshot:snapshot};
 }
 return{Select:function(entity,token){currentEntity=entity;currentToken=token;snapshot=null;maskCache={};},Apply:apply,Inspect:function(){return{entity:currentEntity,token:currentToken,metric_visits:visits};}};
}
return{Create:create};
}));
