(function(){
    function rows(value){return Array.isArray(value)?value:Object.keys(value||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];});}
    function apply(base,changes){
        var result=JSON.parse(JSON.stringify(base));
        rows(changes).forEach(function(change){
            var path=rows(change.path),target=result;
            if(!path.length){result=change.value;return;}
            for(var i=0;i<path.length;i++){
                var key=Array.isArray(target)?Number(path[i])-1:path[i];
                if(i===path.length-1){if(change.remove===1){delete target[key];if(Array.isArray(target))while(target.length&&target[target.length-1]===undefined)target.pop();}else target[key]=change.value;}
                else {if(!target[key])target[key]={};target=target[key];}
            }
        });
        return result;
    }
    var warmed={},queue=[],running=false,host;
    function warm(key,create){
        if(warmed[key])return;warmed[key]=true;queue.push(create);
        if(running)return;running=true;
        $.Schedule(0,function tick(){
            if(!host){host=$.CreatePanel("Panel",$.GetContextPanel(),"");host.hittest=false;host.hittestchildren=false;
                host.style.width="1px";host.style.height="1px";host.style.opacity="0";host.style.overflow="clip";}
            for(var i=0;i<6&&queue.length;i++){var create=queue.shift();create(host);}
            if(queue.length)$.Schedule(0.01,tick);else running=false;
        });
    }
    GameUI.CustomUIConfig().SurvivalSnapshotCache={Apply:apply,Warm:warm};
    // Read the private local wallet only when the player starts an action.
    // Unlock shading does not depend on wood/gold updates.
    var wallet=null;
    GameUI.CustomUIConfig().SurvivalActionResources={
        Update:function(resources){wallet=resources||null;},
        Check:function(runtime){
            runtime=runtime||{};
            if(Number(runtime.removed)===1||Number(runtime.completed)===1||Number(runtime.available)===0)
                return runtime.status_text||"前置条件未满足";
            var wood=Math.max(0,Number(runtime.cost_wood)||0),gold=Math.max(0,Number(runtime.cost_gold)||0);
            var population=Math.max(0,Number(runtime.population)||0);
            if(!wood&&!gold&&!population)return "";
            if(!wallet)return runtime.can_afford===0?"资源或人口不足":"资源信息同步中，请稍后重试";
            if(Number(wallet.debug_mode)===1)return "";
            if(Number(wallet.wood||0)<wood)return "木材不足";
            if(Number(wallet.gold||0)<gold)return "金币不足";
            if(Number(wallet.population||0)+population>Number(wallet.max_population||0))return "人口不足";
            return "";
        },
        Reject:function(runtime){
            var message=this.Check(runtime);
            if(message)GameEvents.SendEventClientSide("dota_hud_error_message",{reason:80,message:message});
            return !!message;
        }
    };
})();
