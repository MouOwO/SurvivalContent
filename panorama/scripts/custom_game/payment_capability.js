// Presentation capability only. The server independently authorizes every payment.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), previous=cfg.SurvivalPaymentCapability;
    if(previous&&typeof previous.Dispose==="function")previous.Dispose();
    var root=$.GetContextPanel(), disposed=false, listeners=[], subscriptions=[], tableSubscription=null, timer=null;
    var context=null, lease=null, latest=null, issued=null, serial=0, lastRequest=-Infinity, notifying=false;
    var epoch=String(Date.now())+"_"+String(Math.random()).slice(2), TTL=30000, REQUEST_TTL=12000, INTERVAL=15000;
    var development=cfg.SurvivalDevelopmentPayments===true, api;
    function valid(){return !disposed&&cfg.SurvivalPaymentCapability===api&&root&&(!root.IsValid||root.IsValid());}
    function flag(value){return value===true||value===1;}
    function numericAccount(value){return typeof value==="number"&&isFinite(value)&&value%1===0&&value>0&&value<=4294967295?String(value):"";}
    function steamAccount(value){
        if(typeof value!=="string")return "";
        var steam3=/^\[U:1:([1-9][0-9]{0,9})\]$/.exec(value);
        if(steam3)return numericAccount(Number(steam3[1]));
        if(!/^[0-9]{17}$/.test(value)||value<="76561197960265728"||value>"76561202255233023")return "";
        // Steam64 cannot pass through Number without losing identity bits.
        var base="76561197960265728", borrow=0, result="";
        for(var i=16;i>=0;i--){var digit=Number(value[i])-Number(base[i])-borrow;borrow=digit<0?1:0;if(borrow)digit+=10;result=String(digit)+result;}
        return borrow?"":numericAccount(Number(result.replace(/^0+/,"")||"0"));
    }
    function binding(){
        try{
            var id=Game.GetLocalPlayerID();if(typeof id!=="number"||id%1!==0||id<0||id>23)return null;
            var map=Game.GetMapInfo(),name=map&&map.map_name;if(name!=="template_map"&&name!=="maps/template_map.vpk")return null;
            var account="", fallback="";
            if(typeof Players!=="undefined"&&typeof Players.GetSteamAccountID==="function")account=numericAccount(Players.GetSteamAccountID(id));
            if(typeof Game.GetPlayerInfo==="function"){var info=Game.GetPlayerInfo(id);fallback=steamAccount(info&&info.player_steamid);}
            if(account&&fallback&&account!==fallback)return null;
            account=account||fallback;if(!account)return null;
            var loading=CustomNetTables.GetTableValue("survival_loading","state"),session=loading&&loading.session_id;
            if(typeof session!=="string"||!/^[A-Za-z0-9_.:-]{8,128}$/.test(session))return null;
            var own=null,rows=loading.players||{};
            Object.keys(rows).some(function(key){var row=rows[key];if(row&&row.player_id===id){own=row;return true;}return false;});
            return {player_id:id,account_id:account,match_session_id:session,authenticated:!!own&&flag(own.authenticated),key:id+":"+account+":"+session};
        }catch(ignore){return null;}
    }
    function notify(){
        if(notifying)return;notifying=true;
        try{listeners.slice().forEach(function(listener){try{listener();}catch(ignore){}});
            var market=cfg.SurvivalCommerceView,daily=cfg.SurvivalDaily;
            if(market&&typeof market.RefreshPaymentCapability==="function")market.RefreshPaymentCapability();
            if(daily&&typeof daily.RefreshPaymentCapability==="function")daily.RefreshPaymentCapability();
        }finally{notifying=false;}
    }
    function revoke(){var changed=lease!==null;lease=null;if(changed)notify();}
    function observe(){
        var next=binding(),old=context;
        if(!next||!old||next.key!==old.key){context=next;latest=null;issued=null;lastRequest=-Infinity;revoke();}
        else {context=next;if(!next.authenticated)revoke();}
        return context;
    }
    function allowed(){
        if(!valid())return false;if(development)return cfg.SurvivalDevelopmentPayments===true;
        var current=observe(),now=Date.now();
        if(!current||!current.authenticated||!lease||lease.key!==current.key||now<lease.at||now-lease.at>=TTL){revoke();return false;}
        return true;
    }
    function request(force){
        if(!valid()||development)return false;
        var current=observe(),now=Date.now();if(!current)return false;
        if(latest&&now>=latest.at&&now-latest.at<REQUEST_TTL)return false;
        if(now-lastRequest<(force===true?2000:INTERVAL))return false;
        latest={key:current.key,request_id:epoch+"_"+(++serial),at:now};issued=latest;lastRequest=now;
        GameEvents.SendCustomGameEventToServer("survival_payment_capability_request",{request_id:latest.request_id});return true;
    }
    function receive(value){
        if(!valid()||development)return;
        var current=observe(),pending=latest,now=Date.now();
        if(!current||!value||value.player_id!==current.player_id||value.account_id!==current.account_id
            ||value.match_session_id!==current.match_session_id||[true,false,0,1].indexOf(value.enabled)<0)return;
        // A server-side 403/profile invalidation may revoke the last accepted
        // challenge. Replayed approval can never renew or recreate its lease.
        if(!flag(value.enabled)){
            if(issued&&issued.key===current.key&&value.request_id===issued.request_id){latest=null;revoke();}return;
        }
        if(!pending||pending.key!==current.key||value.request_id!==pending.request_id||now<pending.at||now-pending.at>=REQUEST_TTL)return;
        latest=null;
        if(!flag(value.enabled)||!current.authenticated){revoke();return;}
        var changed=!lease||lease.key!==current.key;lease={key:current.key,at:now};if(changed)notify();
    }
    function dispose(){
        if(disposed)return;disposed=true;latest=null;issued=null;context=null;revoke();
        if(timer!==null&&$.CancelScheduled)$.CancelScheduled(timer);timer=null;
        subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];
        if(tableSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(tableSubscription);
        listeners=[];if(cfg.SurvivalPaymentCapability===api)cfg.SurvivalPaymentCapability=null;
    }
    function monitor(){timer=null;if(!valid()){dispose();return;}allowed();request(false);if(valid())timer=$.Schedule(1,monitor);}
    api={IsAllowed:allowed,Request:request,Subscribe:function(fn){if(typeof fn!=="function"||!valid())return null;listeners.push(fn);return fn;},Unsubscribe:function(fn){listeners=listeners.filter(function(row){return row!==fn;});},
        Inspect:function(){return {allowed:allowed(),bound:!!context,pending:!!latest,development:development};},Dispose:dispose};
    cfg.SurvivalPaymentCapability=api;
    if(!development){
        subscriptions.push(GameEvents.Subscribe("survival_payment_capability",receive));
        tableSubscription=CustomNetTables.SubscribeNetTableListener("survival_loading",function(name,key){if(key!=="state"||!valid())return;var old=context&&context.authenticated;observe();request(old!==!!(context&&context.authenticated));});
        try{$.RegisterEventHandler("PanelDeleted",root,dispose);}catch(ignore){}
        request(false);timer=$.Schedule(1,monitor);
    }
}());
