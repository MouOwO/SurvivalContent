// Explicit Tools-only readback; no timer, game mutation, player data or RPC.
(function(){
"use strict";
if(typeof Game.IsInToolsMode!=="function"||!Game.IsInToolsMode()||typeof Game.AddCommand!=="function")return;
var cfg=GameUI.CustomUIConfig(),root=$.GetContextPanel(),runtime=cfg.SurvivalCompactRuntime;
if(cfg.SurvivalNetwork50Diagnostics&&cfg.SurvivalNetwork50Diagnostics.Runtime===runtime&&cfg.SurvivalNetwork50Diagnostics.Alive())return;
var command="network50_inspect_"+Date.now()+"_"+String((cfg.Network50InspectSerial||0)+1);
cfg.Network50InspectSerial=(cfg.Network50InspectSerial||0)+1;
var api={Runtime:runtime,Command:command,Alive:function(){return (!root.IsValid||root.IsValid())&&cfg.SurvivalCompactRuntime===runtime&&cfg.SurvivalNetwork50Diagnostics===api;}};
cfg.SurvivalNetwork50Diagnostics=api;
Game.AddCommand(command,function(){
 var args=Array.prototype.slice.call(arguments);
 if(args.length===2&&args[0]===command)args.shift();
 if(args.length!==1||typeof args[0]!=="string"||!/^[0-9a-f]{32}$/.test(args[0]))return;
 var out={active:api.Alive(),tools:true};
 if(out.active){
  out.game_time=Number(Game.GetGameTime());
  out.paused=typeof Game.IsGamePaused==="function"?Game.IsGamePaused():null;
  var source=cfg.SurvivalCompactHUDSource,snapshot=source&&source.Snapshot&&source.Snapshot(),wave=snapshot&&snapshot.wave;
  out.wave=wave?{status:wave.status,current:wave.current_wave,alive:wave.alive,defeated:wave.player_defeated}:null;
  var state=runtime&&runtime.Inspect&&runtime.Inspect();
  out.wire=state?{ready:state.ready,views:state.views,counters:state.counters}:null;
 }
 $.Msg("[NETWORK50_UI_INSPECT] "+args[0]+" "+JSON.stringify(out));
},"Tools-only read-only network and game clock sample; requires one32hex nonce",0);
$.Msg("[NETWORK50_UI_DIAGNOSTIC] ready command="+command);
}());
