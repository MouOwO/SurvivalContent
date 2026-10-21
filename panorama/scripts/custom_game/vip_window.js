// VIP is a passive HUD status. The server still owns level and rewards.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),context=$.GetContextPanel();
    var previous=cfg.SurvivalVIPStatus,retained=previous&&previous.Inspect?previous.Inspect():null;
    if(previous&&previous.Dispose)previous.Dispose();
    if(cfg.SurvivalVIP&&cfg.SurvivalVIP.Dispose)cfg.SurvivalVIP.Dispose();
    else if(cfg.SurvivalVIP&&cfg.SurvivalVIP.Close)cfg.SurvivalVIP.Close();
    var disposed=false,subscription=null,hosts=[],known=!!(retained&&retained.known),current=known?retained.level:0;
    var positions=[[5,8],[49,40],[12,39],[53,14],[25,3],[35,43],[1,27],[59,29],[17,13],[43,4],[23,45],[48,25],[8,23],[35,10]];
    function valid(panel){return panel&&(!panel.IsValid||panel.IsValid());}
    function level(value){
        if(typeof value!=="number"&&!(typeof value==="string"&&String(Number(value))===value))return null;
        var n=Number(value);return isFinite(n)&&n===Math.floor(n)&&n>=0&&n<=12?n:null;
    }
    function hex(value){var text=Math.round(value).toString(16);return text.length===1?"0"+text:text;}
    function appearance(value){
        var n=level(value)||0;
        if(!n)return {level:0,color:"#999999",particleCount:0,intensity:0,duration:5};
        // Equal steps in hue keep intermediate ranks bright yellow and orange.
        var hue=120*(12-n)/11,x=150*(1-Math.abs(hue/60%2-1)),t=(n-1)/11;
        return {level:n,color:"#"+hex(90+(hue>=60?x:150))+hex(90+(hue>=60?150:x))+hex(90),
            particleCount:n+2,intensity:0.35+0.65*t,duration:5-2.4*t};
    }
    function unlockRules(){
        if(cfg.SurvivalDevelopmentPayments!==true)return "VIP 状态以存档为准。<br>测试版未开放付费开通。";
        var catalog=cfg.VIPRewardCatalog,rows=catalog&&catalog.recharge_levels||[];
        var desired=known&&current>0?current+1:1,threshold=null;
        rows.some(function(row){
            var fen=Number(row&&row.required_recharge_fen);
            if(Number(row&&row.level)!==desired||!isFinite(fen)||fen<=0)return false;
            threshold=fen/100;return true;
        });
        var lines=["VIP 解锁规则"];
        if(known&&current>0)lines.push("当前 VIP"+current+(current===12?"，已达最高等级。":"。"));
        if(threshold!==null)lines.push("累计实付充值满 "+threshold+" 元"+(desired===1?"即可解锁 ":"可提升至 ")+"VIP"+desired+"。");
        lines.push("VIP 等级随累计实付充值提升，消费不降级。");
        return lines.join("<br>");
    }
    function hideWindow(){
        if(!valid(context))return;
        ["VIPWindow","VIPScrim","VIPTooltip"].forEach(function(id){
            var panel=context.FindChildTraverse(id);if(!valid(panel))return;
            panel.visible=false;panel.hittest=false;panel.hittestchildren=false;panel.style.visibility="collapse";
        });
    }
    function make(type,parent,id,cls){
        var panel=$.CreatePanel(type,parent,id);panel.hittest=false;panel.hittestchildren=false;
        if(cls)panel.AddClass(cls);return panel;
    }
    function render(button,parts){
        if(disposed||!valid(button))return null;
        parts=parts||{};
        if(hosts.indexOf(button)<0){
            hosts.forEach(function(old){
                var previousBadge=old&&old.__survivalVIPStatus;
                if(previousBadge&&valid(previousBadge.host))previousBadge.host.DeleteAsync(0);
                if(valid(old))old.__survivalVIPStatus=null;
            });
            hosts=[button];
        }
        var badge=button.__survivalVIPStatus;
        if(!badge||!valid(badge.host)){
            button.enabled=true;button.hittest=true;button.hittestchildren=false;
            button.SetPanelEvent("onactivate",function(){});button.RemoveClass("HandoffNavActive");
            var host=make("Panel",button,"HandoffVIPStatus","VIPStatusBadge");
            var aura=make("Panel",host,"HandoffVIPAura","VIPStatusAura");
            var word=make("Image",host,"HandoffVIPWord","VIPStatusWord");
            word.SetImage("file://{images}/custom_game/topnav_reference_v2/vip_status.svg");
            if(word.SetScaling)word.SetScaling("stretch-to-fit-preserve-aspect");
            var numeral=make("Label",host,"HandoffVIPLevel","VIPStatusLevel");
            var motes=[];
            positions.forEach(function(at,index){
                var mote=make("Panel",host,"HandoffVIPMote"+index,"VIPStatusMote");
                mote.AddClass("VIPStatusMote"+["A","B","C"][index%3]);
                mote.style.position=at[0]+"px "+at[1]+"px 0px";
                mote.style.animationDelay=(-index*0.37).toFixed(2)+"s";motes.push(mote);
            });
            badge=button.__survivalVIPStatus={host:host,aura:aura,word:word,number:numeral,motes:motes,key:null};
        }
        var width=parseFloat(button.style.width),scale=isFinite(width)&&width>0?width/60:1;
        var scaleText=scale.toFixed(4),key=(known?"known:":"unknown:")+current+":"+scaleText;
        if(badge.key===key)return badge;
        var view=appearance(known?current:0);
        if(badge.scale!==scaleText){
            var uiScale=Number(button.actualuiscale_x)||1;
            function pixels(value){return (Math.round(value*scale*uiScale)/uiScale).toFixed(3)+"px";}
            function box(panel,x,y,w,h){panel.style.position=pixels(x)+" "+pixels(y)+" 0px";panel.style.width=pixels(w);panel.style.height=pixels(h);}
            // Match the navigation's native pixel layout, keeping text crisp at
            // small resolutions instead of shrinking an already-rasterized label.
            box(badge.host,0,0,60,60);box(badge.aura,-3,5,66,42);
            box(badge.word,2,-2,56,56);box(badge.number,35,37,25,23);
            badge.number.style.fontSize=pixels(20);
            badge.motes.forEach(function(mote,index){mote.style.position=pixels(positions[index][0])+" "+pixels(positions[index][1])+" 0px";});
            badge.scale=scaleText;
        }
        [parts.icon,parts.caption,parts.glow].forEach(function(panel){if(valid(panel))panel.visible=false;});
        badge.word.style.washColor=badge.number.style.color=view.color;
        badge.number.text=known&&current>0?String(current):"";
        badge.number.visible=known&&current>0;
        badge.host.SetHasClass("VIPStatusKnown",known);
        badge.host.SetHasClass("VIPStatusLocked",!known||current===0);
        badge.aura.visible=view.level>0;
        badge.aura.style.backgroundColor="gradient(radial, 50% 50%, 0% 0%, 50% 50%, from("+view.color+"55), to("+view.color+"00))";
        badge.aura.style.opacity=(view.intensity*0.75).toFixed(3);
        badge.motes.forEach(function(mote,index){
            mote.visible=index<view.particleCount;
            if(!mote.visible)return;
            mote.style.washColor=view.color;
            mote.style.opacity=view.intensity.toFixed(3);
            mote.style.width=mote.style.height=((2+view.intensity)*scale).toFixed(2)+"px";
            mote.style.animationDuration=(view.duration+(index%3)*0.27).toFixed(2)+"s";
        });
        badge.key=key;return badge;
    }
    function refreshHosts(){
        hosts=hosts.filter(valid);
        hosts.forEach(function(button){render(button);});
    }
    function receive(data){
        if(disposed||!valid(context)||!data||data.ok!==true)return;
        var n=level(data.level);if(n===null||known&&current===n)return;
        known=true;current=n;refreshHosts();
    }
    function dispose(){
        if(disposed)return;disposed=true;
        if(subscription!==null&&GameEvents.Unsubscribe)GameEvents.Unsubscribe(subscription);
        hosts.forEach(function(button){
            var badge=button&&button.__survivalVIPStatus;
            if(badge&&valid(badge.host))badge.host.DeleteAsync(0);
            if(valid(button))button.__survivalVIPStatus=null;
        });
        subscription=null;hosts=[];
    }
    cfg.SurvivalVIPStatus={Render:render,Appearance:appearance,UnlockRules:unlockRules,
        Inspect:function(){var view=appearance(known?current:0);return {known:known,level:known?current:null,
            color:view.color,particleCount:view.particleCount,intensity:view.intensity};},Dispose:dispose};
    // Retired window callers and old Tools shortcuts cannot reopen the page.
    cfg.SurvivalVIP={IsAvailable:function(){return false;},IsOpen:function(){return false;},IsPreview:function(){return false;},
        Open:function(){return false;},Toggle:function(){return false;},Close:hideWindow,Refresh:function(){},Dispose:dispose};
    hideWindow();
    subscription=GameEvents.Subscribe("survival_vip_snapshot",receive);
    // This one read also registers the existing server-side push subscription.
    // Account load and later recharge updates then arrive without HUD polling.
    GameEvents.SendCustomGameEventToServer("survival_vip_request",{action:"view"});
})();
