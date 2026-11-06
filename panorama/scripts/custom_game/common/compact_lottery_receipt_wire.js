// Successful lottery receipt encoding only. No roll, reward, storage or timer.
// O(N) catalogue index once; encode O(K + G log G + R), decode O(K + R).
// G <= 128 changed record groups, R <= 10 rewards; idle performs no work.
(function(factory){'use strict';var api=factory();if(typeof module!=='undefined'&&module.exports)module.exports=api;if(typeof GameUI!=='undefined'&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactLotteryReceiptWire=api;}(function(){
'use strict';
var UINT=4294967295,SAFE=9007199254740991;
var GROUPS={state:['known','pending','enabled','balance','balance_hi','progress','progress_hi','level'],pool:['known','tickets','tickets_hi','draws','draws_hi','unlocked','unlock_progress','update_unread','notice_unread'],currency:['known','owned_count','owned_count_hi'],item:['known','owned_count','owned_count_hi','owned','at_max_owned']};
function need(ok,why){if(!ok)throw Error(why);}
function integer(n,min,max){return typeof n==='number'&&n%1===0&&n>=min&&n<=max;}
function uint(n,max){need(integer(n,0,max===undefined?UINT:max),'receipt_integer_invalid');var out='';do{var b=n%128;n=Math.floor(n/128);out+=String.fromCharCode(b+(n?128:0));}while(n);return out;}
function read(raw,c,max){var n=0,m=1;for(var i=0;i<8;i++){need(c.at<raw.length,'receipt_truncated');var b=raw.charCodeAt(c.at++);need(b<=255,'receipt_byte_invalid');n+=(b%128)*m;need(integer(n,0,max),'receipt_integer_overflow');if(b<128){need(i===0||b!==0,'receipt_noncanonical_integer');return n;}m*=128;}throw Error('receipt_integer_overflow');}
function create(catalogue){
 var C=catalogue.Data||catalogue,R=Object.create(null),ByKey=Object.create(null),F=Object.create(null),N=Object.create(null),P=Object.create(null),indexVisits=0;
 need(C&&/^[a-f0-9]{64}$/.test(C.sha256),'receipt_schema_required');
 C.fields.forEach(function(f){F[f.name]=f.id;N[f.id]=f.name;indexVisits++;});
 C.records.forEach(function(r){if(!r.tombstone){R[r.id]=r;ByKey[r.key]=r.id;}indexVisits++;});
 C.auxiliary.lottery_public.snapshots.forEach(function(s,i){var allowed=Object.create(null);s.items.forEach(function(row){allowed[ByKey['lottery:item:'+row.id]]=true;});P[201+i]={id:s.selected_pool_id,record:ByKey['lottery:pool:'+s.selected_pool_id],allowed:allowed};});
 function record(r){var v=R[r];need(v&&v.domain==='lottery','receipt_record_invalid');return v;}
 function group(r,view){var value=record(r),kind=value.key==='lottery:state'?'state':value.kind;need(GROUPS[kind]&&value.key!=='lottery:receipt','receipt_state_record_forbidden');if(view!==undefined&&kind==='item')need(pool(view).allowed[r],'receipt_item_not_in_pool');return GROUPS[kind];}
 function pool(view){need(P[view],'receipt_view_invalid');return P[view];}
 function item(view,r){var p=pool(view),row=record(r);need(p.allowed[r]&&row.kind==='item','receipt_item_not_in_pool');var definition=C.definitions[row.key];need(definition&&definition.definition,'receipt_item_definition_missing');return definition.definition;}
 function defaultPoints(view,row){var d=item(view,row.record),n=row.duplicate?(d.duplicate_points||0):0;need(integer(n,0,SAFE),'receipt_static_points_invalid');return n;}
 function groups(changes,view){
  need(Array.isArray(changes)&&changes.length<=384,'receipt_changes_limit');var indexed=Object.create(null),order=[];
  changes.forEach(function(op){var fields=group(op.record,view),name=N[op.field],at=fields.indexOf(name);need(at>=0,'receipt_state_field_forbidden');var g=indexed[op.record];if(!g){g={record:op.record,set:0,remove:0,values:Object.create(null)};indexed[op.record]=g;order.push(g);}
   need(g.values[at]===undefined,'receipt_duplicate_state_field');g.values[at]=op;var bit=Math.pow(2,at);if(op.remove)g.remove+=bit;else {need(integer(op.value,0,UINT),'receipt_state_value_invalid');g.set+=bit;}
  });need(order.length<=128,'receipt_groups_limit');order.sort(function(a,b){return a.record-b.record;});return order;
 }
 function encode(view,revision,receipt,changes){
  pool(view);need(integer(revision,2,2097151),'receipt_revision_invalid');need(receipt&&(receipt.count===1||receipt.count===10)&&Array.isArray(receipt.results)&&receipt.results.length===receipt.count,'receipt_count_invalid');
  need(integer(receipt.guarantee_quality,0,5)&&typeof receipt.guarantee_satisfied==='boolean','receipt_guarantee_invalid');
  var gs=groups(changes,view),out=String.fromCharCode(1)+uint(revision)+uint(receipt.count)+uint(receipt.guarantee_quality+(receipt.guarantee_satisfied?8:0))+uint(gs.length);
  gs.forEach(function(g){out+=uint(g.record)+uint(g.set)+uint(g.remove);var fields=group(g.record);for(var i=0;i<fields.length;i++){var op=g.values[i];if(op&&!op.remove)out+=uint(op.value);}});
  for(var index=0;index<receipt.count;index++){var row=receipt.results[index];need(row&&typeof row==='object','receipt_row_invalid');item(view,row.record);need(integer(row.owned_count,0,SAFE)&&integer(row.converted_points,0,SAFE)&&typeof row.duplicate==='boolean','receipt_row_invalid');
   var flags=(row.duplicate?1:0)+(row.owned_count!==1?2:0)+(row.converted_points!==defaultPoints(view,row)?4:0)+(row.granted_count!==undefined?8:0)+(row.overflow_count!==undefined?16:0);
   out+=uint(row.record)+uint(flags);if(flags&2)out+=uint(row.owned_count,SAFE);if(flags&4)out+=uint(row.converted_points,SAFE);if(flags&8)out+=uint(row.granted_count);if(flags&16)out+=uint(row.overflow_count);
  }need(out.length<=2048,'receipt_body_limit');return out;
 }
 function decode(view,raw){
  pool(view);need(typeof raw==='string'&&raw.length>0&&raw.length<=2048&&raw.charCodeAt(0)===1,'receipt_version_or_size_invalid');var c={at:1};
  var revision=read(raw,c,2097151),count=read(raw,c,10),quality=read(raw,c,15),length=read(raw,c,128),changes=[],last=0;
  need(revision>=2&&(count===1||count===10)&&(quality&7)<=5,'receipt_header_invalid');
  for(var g=0;g<length;g++){
   var r=read(raw,c,UINT),fields=group(r,view),set=read(raw,c,Math.pow(2,fields.length)-1),remove=read(raw,c,Math.pow(2,fields.length)-1);need(r>last&&(set&remove)===0&&(set||remove),'receipt_group_invalid');last=r;
   for(var i=0;i<fields.length;i++){var bit=Math.pow(2,i);if(set&bit)changes.push({record:r,field:F[fields[i]],value:read(raw,c,UINT)});else if(remove&bit)changes.push({record:r,field:F[fields[i]],remove:true});}
  }
  need(changes.length<=384,'receipt_changes_limit');
  var results=[];for(var n=0;n<count;n++){
   var id=read(raw,c,UINT),flags=read(raw,c,31);item(view,id);var row={record:id,duplicate:!!(flags&1),owned_count:(flags&2)?read(raw,c,SAFE):1};
   row.converted_points=(flags&4)?read(raw,c,SAFE):defaultPoints(view,row);if(flags&8)row.granted_count=read(raw,c,UINT);if(flags&16)row.overflow_count=read(raw,c,UINT);results.push(row);
  }
  need(c.at===raw.length,'receipt_trailing_data');return {revision:revision,changes:changes,receipt:{count:count,guarantee_quality:quality&7,guarantee_satisfied:!!(quality&8),results:results}};
 }
 function operations(view,token,decoded){
  need(integer(token,1,16383),'receipt_token_invalid');var p=pool(view),receipt=decoded.receipt,ops=decoded.changes.slice();
  function put(r,name,value){ops.push(value===undefined?{record:r,field:F[name],remove:true}:{record:r,field:F[name],value:value});}
  function big(r,name,n){put(r,name,n%4294967296);put(r,name+'_hi',Math.floor(n/4294967296));}
  for(var i=0;i<10;i++){var r=ByKey['lottery:result:'+(i+1)],row=receipt.results[i];put(r,'known',row?1:0);if(!row)continue;
   put(r,'target_record',row.record);put(r,'reward_count',1);big(r,'owned_count',row.owned_count);put(r,'duplicate',row.duplicate?1:0);big(r,'converted_points',row.converted_points);put(r,'granted_count',row.granted_count);put(r,'overflow_count',row.overflow_count);
  }
  var r=ByKey['lottery:receipt'];var value={known:1,request_token:token,target_record:p.record,count:receipt.count,success:1,pending:0,terminal:1,error_code:0,quality_code:receipt.guarantee_quality,guarantee_satisfied:receipt.guarantee_satisfied?1:0};Object.keys(value).forEach(function(name){put(r,name,value[name]);});return ops;
 }
 return {Encode:encode,Decode:decode,Operations:operations,Inspect:function(){return {initial_registry_visits:indexVisits,steady_registry_visits:0};},Schema:C.sha256};
}
return {Create:create};
}));
