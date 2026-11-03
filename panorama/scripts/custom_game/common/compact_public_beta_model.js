// Transport adapter only. The existing public_beta_gift Accept/Begin model
// keeps all presentation/receipt rules; this module never edits inventories.
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactPublicBetaModel=api;}(function(){
"use strict";
function need(v,e){if(!v)throw new Error(e);}
function create(catalogue,options){
 var C=catalogue.Data||catalogue,P=C.auxiliary.public_beta,F=catalogue.FieldIds||{},R=catalogue.ByKey||{},memo=options.memo||{},alias="",lastToken=0;
 need(P&&P.ticket_id==="special_lottery_ticket"&&P.ticket_count===2,"public_beta_fixed_reward_invalid");
 if(!catalogue.FieldIds)C.fields.forEach(function(row){F[row.name]=row.id;});if(!catalogue.ByKey)C.records.forEach(function(row){if(!row.tombstone)R[row.key]=row.id;});
 var root=R['public_beta:state'],receipt=R['public_beta:receipt'];need(root&&receipt,"public_beta_records_required");
 function scope(login){var value=options.scope();need(value&&value.active&&value.ready&&typeof value.loading_identity==='string'&&value.loading_identity&&typeof value.session==='number'&&Math.floor(value.session)===value.session&&value.session>0&&value.session<=16383,'public_beta_scope_unknown');return'cw_'+value.loading_identity+'_'+value.session+'_'+login;}
 function uint(read,id,name,high){var lo=read(id,F[name]),hi=read(id,F[high]);need(typeof lo==='number'&&typeof hi==='number'&&Math.floor(lo)===lo&&Math.floor(hi)===hi&&lo>=0&&lo<=4294967295&&hi>=0&&hi<=2097151,'public_beta_integer_unknown');var value=hi*4294967296+lo;need(value<=9007199254740991,'public_beta_integer_unsafe');return value;}
 function reset(next){memo.alias=next;memo.tokens={};memo.requests={};}
 function bind(token,requestId){need(typeof token==='number'&&token>=1&&token<=16383&&/^[A-Za-z0-9_-]{8,64}$/.test(requestId),'public_beta_intent_invalid');need(alias,'public_beta_scope_unknown');if(memo.alias!==alias)reset(alias);need(!memo.tokens[token],'public_beta_nonce_reused');memo.tokens[token]=requestId;(memo.requests||(memo.requests={}))[requestId]=true;}
 function apply(tx,changed,read){
  if(read(root,F.known)!==1)return{known:false};
  var login=read(root,F.period);need(typeof login==='number'&&Math.floor(login)===login&&login>0&&login<=4294967295,'public_beta_login_unknown');alias=scope(login);
  if(memo.alias!==alias)reset(alias);
  var day=read(root,F.day);need(typeof day==='number'&&day>=0&&Math.floor(day)===day,'public_beta_day_unknown');
  var flags=read(root,F.public_beta_flags);need(typeof flags==='number'&&flags>=0&&flags<=31&&Math.floor(flags)===flags,'public_beta_flags_unknown');
  function flag(bit){return Math.floor(flags/Math.pow(2,bit))%2;}
  var snapshot={ok:1,login_key:alias,day_key:String(day),revision:uint(read,root,'source_revision','source_revision_hi'),sequence:uint(read,root,'count','count_hi'),
   active:flag(0),eligible:flag(1),claimed:flag(2),claim_pending:flag(3),read_only:flag(4),refresh_at:read(root,F.refresh_at),
   ticket_id:P.ticket_id,ticket_name:P.ticket_name,ticket_count:P.ticket_count};
  var token=read(receipt,F.request_token),requestId=token&&memo.tokens[token];
  if(read(receipt,F.known)===1&&requestId){var receiptDay=read(receipt,F.day);snapshot.claim_result={request_id:requestId,day_key:receiptDay===undefined?undefined:String(receiptDay),ok:read(receipt,F.success),pending:read(receipt,F.pending),terminal:read(receipt,F.terminal),error:read(receipt,F.error_code)?P.errors[1]:''};lastToken=token;}
  return{known:true,snapshot:snapshot,request_token:requestId?token:null};
 }
 return{Apply:apply,BindIntent:bind,HasRequest:function(id){return!!(memo.alias===alias&&memo.requests&&memo.requests[id]);},Inspect:function(){return{alias:alias,last_token:lastToken};}};
}
return{Create:create};
}));
