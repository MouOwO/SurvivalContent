// Fixed-schema personal HUD projector. O(F) once on full, O(K) changed-field
// dispatch thereafter; no scene, catalogue or player-collection traversal.
(function(factory){"use strict";var api=factory();if(typeof module!=="undefined"&&module.exports)module.exports=api;if(typeof GameUI!=="undefined"&&GameUI.CustomUIConfig)GameUI.CustomUIConfig().SurvivalCompactHUDModel=api;}(function(){
"use strict";
var PHASES=[null,"waiting","selecting_mode","selecting_difficulty","fishing","countdown","spawning","spawn_channel_missing","all_waves_spawned","cleared","archive_challenges","archive_challenges_pending","defeat","dev_mode","dev_spawn","dev_preloading","victory"],MODES=[null,"standard","pure","rich","cold","scourge","ruins","celestial","fishing"],DEFEAT=[null,"monster_limit_exceeded","main_city_destroyed","player_disconnected","disconnect","base_destroyed","native_defeat","wall_destroyed","wall_destroyed_while_disconnected","disconnect_timeout","unknown"];
var WAVES={wave_index:"current_wave",wave_total:"total_waves",wave_planned:"planned",wave_pending:"pending",wave_spawned:"spawned",wave_alive:"alive",wave_killed:"killed",wave_failed_spawn:"failed_spawn",alive_limit:"alive_limit",overflow_grace_seconds:"overflow_grace_seconds",wave_boss_alive:"boss_alive",wave_selected:"difficulty_selected",wave_early_final_used:"early_final_used",wave_victory_settled:"victory_settled",wave_defeat_settled:"defeat_settled",wave_post_clear_frozen:"post_clear_frozen",overflow_active:"overflow_active",player_defeated:"player_defeated",challenge_saving:"challenge_saving",challenge_player_finished:"challenge_player_finished",challenge_ended:"challenge_ended"};
var ROOTS=["city_level","worker_count","shop_unlocked","research_unlocked","advanced_researcher_unlocked"],RESOURCE=["wood","wood_hi","gold","gold_hi","population","max_population"],DEADLINES={countdown_deadline_ms:"countdown_deadline",overflow_deadline_ms:"overflow_deadline",challenge_deadline_ms:"challenge_deadline"};
function need(ok,code){if(!ok)throw new Error(code);}
function copy(obj){var out={};Object.keys(obj).forEach(function(k){if(k!=="timer"&&k!=="overflow_remaining"&&k!=="challenge_remaining_seconds")out[k]=obj[k];});return out;}
function combine(lo,hi){if(lo===undefined||hi===undefined)return undefined;need(lo>=0&&lo<=4294967295&&hi>=0&&hi<=2097151&&Math.floor(lo)===lo&&Math.floor(hi)===hi,"hud_integer_unsafe");return hi*4294967296+lo;}
function create(catalogue,options){
 options=options||{};var C=catalogue.Data||catalogue,F=Object.create(null),byField=Object.create(null),cache=Object.create(null),fieldIds=[],record=null,snapshot=null,sequence=0,metrics={field_reads:0,changed_fields:0,fulls:0,updates:0};
 C.fields.forEach(function(f){F[f.name]=f.id;});C.records.forEach(function(r){if(r.key==="hud:state"&&!r.tombstone)record=r.id;});need(record,"hud_record_missing");
 function map(name,target,section){need(F[name]!==undefined,"hud_field_missing:"+name);byField[F[name]]={name:name,target:target,section:section};fieldIds.push(F[name]);}
 RESOURCE.forEach(function(name){map(name,name,"resources");});ROOTS.forEach(function(name){map(name,name,name.indexOf("unlocked")>=0?"unlocks":"city");});
 Object.keys(WAVES).forEach(function(name){map(name,WAVES[name],"wave");});Object.keys(DEADLINES).forEach(function(name){map(name,DEADLINES[name],"wave");});
 map("wave_phase","status","wave");map("wave_difficulty","difficulty_id","wave");map("wave_game_mode","game_mode","wave");map("defeat_reason","defeat_reason","wave");
 var setupFields={wave_phase:true,wave_difficulty:true,wave_game_mode:true,wave_selected:true};
 function remaining(deadline){if(deadline===undefined)return undefined;var now=options.now?options.now():typeof Game!=="undefined"&&Game.GetGameTime?Game.GetGameTime():0;return Math.max(0,Math.ceil(deadline-now));}
 function clock(wave){Object.defineProperty(wave,"timer",{enumerable:true,get:function(){return remaining(wave.countdown_deadline);}});Object.defineProperty(wave,"overflow_remaining",{enumerable:true,get:function(){return remaining(wave.overflow_deadline);}});Object.defineProperty(wave,"challenge_remaining_seconds",{enumerable:true,get:function(){return remaining(wave.challenge_deadline);}});}
 function apply(tx,changed,read){
  metrics.updates++;need(tx&&Array.isArray(tx.changes)&&typeof read==="function","hud_transaction_required");
  var full=tx.full===true,sections=Object.create(null),fields=[],seen=Object.create(null),n,c,definition,next,value;
  if(full){cache=Object.create(null);fields=fieldIds;metrics.fulls++;sections.full=true;}else for(n=0;n<tx.changes.length;n++){c=tx.changes[n];if(c.record===record&&byField[c.field]&&!seen[c.field]){seen[c.field]=true;fields.push(c.field);}}
  next=full||!snapshot?{player_id:options.playerId,resources:{},wave:{}}:{player_id:snapshot.player_id,sequence:snapshot.sequence,resources:snapshot.resources,wave:snapshot.wave};
  if(!full&&snapshot)ROOTS.forEach(function(name){if(snapshot[name]!==undefined)next[name]=snapshot[name];});
  var resourcesCopied=full,waveCopied=full,effective=0;
  for(n=0;n<fields.length;n++){var field=fields[n];definition=byField[field];metrics.field_reads++;value=read(record,field);if(typeof value==="boolean")value=value?1:0;if(!full&&cache[field]===value)continue;cache[field]=value;effective++;metrics.changed_fields++;sections[definition.section]=true;
   var name=definition.name,target=definition.target;if(definition.section==="resources"){if(!resourcesCopied){next.resources=copy(next.resources);resourcesCopied=true;}if(name!=="wood"&&name!=="wood_hi"&&name!=="gold"&&name!=="gold_hi"){if(value===undefined)delete next.resources[target];else next.resources[target]=value;}}
   else if(definition.section==="wave"){
    if(!waveCopied){next.wave=copy(next.wave);waveCopied=true;}if(setupFields[name])sections.wave_setup=true;
    if(value!==undefined){if(name==="wave_phase"){need(PHASES[value],"hud_phase_unknown");value=PHASES[value];}else if(name==="wave_game_mode"){need(MODES[value],"hud_mode_unknown");value=MODES[value];}else if(name==="defeat_reason"){need(DEFEAT[value],"hud_defeat_reason_unknown");value=DEFEAT[value];}else if(name==="wave_difficulty")value=value===0?"":"N"+value;else if(DEADLINES[name])value=value/1000;}
    if(value===undefined)delete next.wave[target];else next.wave[target]=value;
   }else if(value===undefined)delete next[target];else next[target]=value;
  }
  if(full||sections.resources){["wood","gold"].forEach(function(name){var number=combine(cache[F[name]],cache[F[name+"_hi"]]);if(number===undefined)delete next.resources[name];else next.resources[name]=number;});}
  if(full||waveCopied)clock(next.wave);
  if(full){sections.resources=true;sections.city=true;sections.unlocks=true;sections.wave=true;sections.wave_setup=true;}
  if(!effective&&!full)return {snapshot:snapshot,sections:sections,changed:false};
  next.sequence=++sequence;snapshot=next;return {snapshot:snapshot,sections:sections,changed:true};
 }
 return {Apply:apply,Snapshot:function(){return snapshot;},Reset:function(){snapshot=null;cache=Object.create(null);},Inspect:function(){return {record:record,sequence:sequence,metrics:copy(metrics)};},Record:record,Fields:F};
}
return {Create:create,JoinUnsigned:combine,Phases:PHASES,Modes:MODES,DefeatReasons:DEFEAT};
}));
