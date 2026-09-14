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
})();
