// Local archive presentation. One catalogue index; full visits R rows once,
// deltas visit K changed records (social odds visit the affected pool only).
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactArchiveModel=api;}(function(){
"use strict";
function need(v,e){if(!v)throw new Error(e);}
function copy(v){if(!v||typeof v!=="object")return v;var r=Array.isArray(v)?[]:{};Object.keys(v).forEach(function(k){r[k]=copy(v[k]);});return r;}
function setPath(v,path,value){var p=path.split("."),n;for(n=0;n<p.length-1;n++)v=v[p[n]]||(v[p[n]]={});if(value===undefined)delete v[p[n]];else v[p[n]]=value;}
var Q=["N","R","SR","SSR","UR"],MAX_SAFE=9007199254740991;
var indexedCatalogue=null,sharedIndex=null;
function indexes(C){
 if(indexedCatalogue===C)return sharedIndex;
 var value={fields:Object.create(null),byKey:Object.create(null),records:Object.create(null)};
 C.fields.forEach(function(f){value.fields[f.name]=f.id;});C.records.forEach(function(r){if(!r.tombstone){value.byKey[r.key]=r.id;value.records[r.id]=r;}});
 indexedCatalogue=C;sharedIndex=value;return value;
}
function create(catalogue,category){
 var C=catalogue.Data||catalogue,A=C.auxiliary.archive_projection,I=indexes(C),F=I.fields,byKey=I.byKey,records=I.records,zero=Object.create(null),pages=A.pages;
 need(A&&pages[category],"archive_category_unknown");
 A.zero_fields.forEach(function(n){zero[n]=true;});var page=pages[category],root=byKey["archive:category:"+category],templates=Object.create(null),ordered=[],rows=Object.create(null),positions=Object.create(null),visibility=Object.create(null),snapshot=null,known=0,mask=0,disposed=false,weights=null,qualityRows=Object.create(null),qualityRemaining=Object.create(null),remainingById=Object.create(null),weightTotal=0;
 page.rows.forEach(function(t){var id=byKey[t.key];need(id!==undefined,"archive_record_missing:"+t.key);templates[id]=t;ordered.push(id);});
 A.social_rules.forEach(function(rule){if(rule.pool_id===category){weights={};Q.forEach(function(q){weights[q]=rule["quality_weight_"+q.toLowerCase()]||0;});}});
 Q.forEach(function(q){qualityRows[q]=[];});if(weights)ordered.forEach(function(id){if(templates[id].static.draw_enabled===1)qualityRows[templates[id].static.quality].push(id);});
 var metrics={registry_scans:1,row_visits:0,probability_visits:0,header_visits:0},initialOdds=null;
 function odds(initial){
  var groups=Object.create(null),total=0,probs=Object.create(null),quality={};Q.forEach(function(q){groups[q]={remaining:0,entries:[]};quality[q]=0;});
  ordered.forEach(function(id){metrics.probability_visits++;var t=templates[id],r=rows[id],s=t.static;if(s.draw_enabled===1){var n=Math.max(0,s.target-(initial?0:r.count));if(n>0){var g=groups[s.quality];need(g,"archive_quality_unknown");g.remaining+=n;g.entries.push({id:id,remaining:n});}}});
  Q.forEach(function(q){if(groups[q].remaining>0&&weights[q]>0)total+=weights[q];});Q.forEach(function(q){var g=groups[q];if(g.remaining>0&&weights[q]>0){var p=weights[q]/total;quality[q]=p;g.entries.forEach(function(e){probs[e.id]=p*e.remaining/g.remaining;});}});return {items:probs,quality:quality};
 }
 function value(read,id,name){var n=read(id,F[name]);if(n!==undefined)return n;if(id!==root&&known===1&&mask===A.zero_mask){if(name==="known")return 1;if(zero[name]||name==="count_hi")return 0;}return undefined;}
 function materialize(read,id){
  metrics.row_visits++;var t=templates[id],r=copy(t.static),f=t.formatter;
  Object.keys(t.dynamic).forEach(function(name){var n=value(read,id,t.dynamic[name]);if(name==="count"&&n!==undefined){var hi=value(read,id,"count_hi");need(hi!==undefined&&hi<=2097151,"archive_count_high_missing");n=hi*4294967296+n;need(n<=MAX_SAFE,"archive_count_unsafe");}if(name!=="fragment_total"){if(n===undefined)delete r[name];else r[name]=n;}});
  if(f.name==="boss"){need(r.target!==undefined,"archive_boss_target_missing");r.name=f.name_base+"（"+r.target+"次）";}
  if(f.preview_condition&&r.preview_only===1)r.unlock_condition=f.preview_condition;
  if(f.description==="social")r.description=f.description_base+"（每件）\n已拥有"+r.count+"件，效果按数量叠加";
  else if(f.description==="building")r.description=f.description_base+"\n当前等级："+r.level+"/"+r.target+"\n每级消耗："+r.cost+"信仰值\n"+(r.level>=r.target?"已满级":r.level===0?"点击激活":"点击升级");
  else if(f.description==="work")r.description=f.description_base+"\n激活消耗："+r.cost+"软妹币\n"+(r.level>=r.target?"已激活，永久生效":"点击此格激活；每项可激活一次");
  else if(f.description==="fragment"){var total=value(read,id,"fragment_total");need(total!==undefined,"archive_fragment_total_missing");r.description="当前Lv"+r.level+"，累计获得"+total+"片。每20片晋升1级。\n"+f.description_tail;}
  if(category==="commerce_goods"&&r.count_known===0){delete r.count;delete r.owned;delete r.unlocked;delete r.completed;}
  return r;
 }
 function apply(tx,changed,read){
  need(!disposed,"archive_model_disposed");need(tx&&Array.isArray(changed)&&typeof read==="function","archive_transaction_required");
  metrics={registry_scans:0,row_visits:0,probability_visits:0,header_visits:0};var full=tx.full===true,header=full,ids=[],seen=Object.create(null),socialChanged=full;
  if(!full)changed.forEach(function(id){if(id===root)header=true;else if(templates[id]&&!seen[id]){seen[id]=true;ids.push(id);}});
  need(full||snapshot,"archive_full_required");var nextKnown=read(root,F.known),nextMask=read(root,F.zero_mask);
  need(nextKnown===0||nextKnown===1,"archive_scope_known_required");need(nextMask===(nextKnown===1?A.zero_mask:0),"archive_zero_mask_unknown");
  need(full||nextKnown===known&&nextMask===mask,"archive_baseline_change_requires_full");known=nextKnown;mask=nextMask;
  if(full){snapshot=copy(page.header);snapshot.categories=copy(A.categories);rows=Object.create(null);positions=Object.create(null);visibility=Object.create(null);ids=ordered.slice();initialOdds=null;}
  if(header){metrics.header_visits++;Object.keys(page.header_paths).forEach(function(path){setPath(snapshot,path,read(root,F[page.header_paths[path]]));});
   var last=read(root,F.target_record);need(last!==undefined,"archive_last_draw_target_missing");delete snapshot.last_draw;if(last!==0){var record=records[last],t=record&&pages[record.category]&&pages[record.category].rows;need(t,"archive_last_draw_target_unknown");var definition=C.definitions[record.key].definition;need(definition&&definition.name,"archive_last_draw_name_unknown");snapshot.last_draw={pool_id:record.category,name:definition.name};}
  }
  var groupsChanged=Object.create(null),filtering=full;
  if(weights&&full){Q.forEach(function(q){qualityRemaining[q]=0;groupsChanged[q]=true;});remainingById=Object.create(null);weightTotal=0;}
  ids.forEach(function(id){var before=rows[id],after=materialize(read,id),t=templates[id];rows[id]=after;if(page.filtered){var visible=value(read,id,"visible")===1;if(visibility[id]!==visible)filtering=true;visibility[id]=visible;}
   if(weights&&t.static.draw_enabled===1&&(!before||before.count!==after.count)){socialChanged=true;var left=Math.max(0,t.static.target-after.count);qualityRemaining[after.quality]+=left-(remainingById[id]||0);remainingById[id]=left;groupsChanged[after.quality]=true;}
  });
  if(weights&&socialChanged){
   if(!initialOdds)initialOdds=odds(true);var total=0;Q.forEach(function(q){if(qualityRemaining[q]>0&&weights[q]>0)total+=weights[q];});
   var all=full||total!==weightTotal;weightTotal=total;var probabilities=snapshot.social.rarity_probabilities||{};
   Q.forEach(function(q){if(!all&&!groupsChanged[q])return;var p=qualityRemaining[q]>0&&weights[q]>0?weights[q]/total:0;probabilities[q]=p;
    qualityRows[q].forEach(function(id){metrics.probability_visits++;var row=rows[id];row.draw_probability=p>0&&remainingById[id]>0?p*remainingById[id]/qualityRemaining[q]:0;row.initial_draw_probability=initialOdds.items[id]||0;row.quality_draw_probability=p;if(!full&&!seen[id]){seen[id]=true;ids.push(id);}});
   });
   // Non-drawable configured rows are retained with exact zero item odds.
   if(full)ordered.forEach(function(id){var row=rows[id];if(templates[id].static.draw_enabled!==1){row.draw_probability=0;row.initial_draw_probability=0;row.quality_draw_probability=probabilities[row.quality]||0;}});
   snapshot.social.rarity_probabilities=probabilities;snapshot.social.rarity_base_probabilities=initialOdds.quality;
  }
  // Keep an indexed row model. The legacy controller currently needs an array;
  // rebuild it only when filtering changes, never for an unchanged transaction.
  if(filtering){snapshot.rows=[];positions=Object.create(null);ordered.forEach(function(id){if(!page.filtered||visibility[id]){positions[id]=snapshot.rows.length;snapshot.rows.push(rows[id]);}});}
  else if(ids.length)ids.forEach(function(id){if(positions[id]!==undefined)snapshot.rows[positions[id]]=rows[id];});
  return {known:known===1,snapshot:snapshot,changes:{full:full,header:header,rows:ids},metrics:metrics};
 }
 return {Apply:apply,apply:apply,Row:function(id){return rows[id];},Inspect:function(){return {category:category,metrics:metrics};},Dispose:function(){disposed=true;snapshot=null;rows=Object.create(null);}};
}
return {Create:create,create:create};
}));
