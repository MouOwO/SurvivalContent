(function () {
    "use strict";
    var data = null, opened = false, buying = false, waiting = false;
    function p(id) { return $("#" + id); }
    function array(value) { return Array.isArray(value) ? value : Object.keys(value || {}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];}); }
    function label(parent,text,style) { var l=$.CreatePanel("Label",parent,"");l.text=String(text);l.hittest=false;if(style)l.AddClass(style);return l; }
    function hideTip() { p("DailyTooltip").AddClass("ArchiveHidden"); }
    function tooltip(panel,name,effect) {
        panel.SetPanelEvent("onmouseover",function(){p("DailyTooltipName").text=name;p("DailyTooltipEffect").text=effect;p("DailyTooltip").RemoveClass("ArchiveHidden");});
        panel.SetPanelEvent("onmouseout",hideTip);
    }
    function request() { GameEvents.SendCustomGameEventToServer("survival_daily_request",{}); }
    function render() {
        if (!data) return;
        var claimed=Number(data.claimed)===1, pass=Number(data.has_pass)===1, pending=waiting || Number(data.pending)===1;
        p("DailyEntry").SetHasClass("DailyCanClaim",!claimed);
        p("DailyEntry").SetHasClass("DailyClaimed",claimed);
        if (!opened) return;
        p("DailyHeading").text=buying ? "星月通行证" : "每日奖励";
        p("DailyClaimPage").SetHasClass("ArchiveHidden",buying);
        p("DailyPassPage").SetHasClass("ArchiveHidden",!buying);
        p("DailyCards").RemoveAndDeleteChildren();
        array(data.cycle).forEach(function(day){
            var card=$.CreatePanel("Panel",p("DailyCards"),"");card.AddClass("DailyCard");
            card.SetHasClass("DailyCardNext",Number(day.day)===Number(data.next_day));
            label(card,"第"+day.day+"天","DailyDay");
            var names=[],effects=[];
            array(day.rewards).forEach(function(item){label(card,item.name+" ×"+item.count);names.push(item.name);effects.push(item.name+"："+item.description+"（每件）");});
            tooltip(card,names.join(" / "),effects.join("\n"));
        });
        p("DailySpecials").RemoveAndDeleteChildren();
        array(data.specials).forEach(function(item){
            var card=$.CreatePanel("Panel",p("DailySpecials"),"");card.AddClass("DailySpecial");
            label(card,"累计"+item.day+"次 · "+(Number(item.owned)>0?"已领取":"月卡专享"));label(card,item.name);
            tooltip(card,item.name,item.description+"\n签到专属，不进入抽奖池，不重复叠加。");
        });
        var missed=array(data.missed);
        p("DailyCount").text="累计签到 "+data.count+" 次 · 漏签 "+missed.length+" 天";
        p("DailyClaim").enabled=!claimed&&!pending;
        p("DailyMakeup").enabled=pass&&missed.length>0&&!pending;
        p("PassValidity").text=pass ? "已开通 · "+(Number(data.expires_at)>0?"剩余 "+Math.max(0,Math.ceil((Number(data.expires_at)*1000-Date.now())/86400000))+" 天":"有效") : "尚未开通或已到期";
        p("PassPrice").text=data.duration_days+"天 / "+data.price;
        p("PassPurchase").enabled=Number(data.purchase_enabled)===1;
        p("PassPurchaseText").text=Number(data.purchase_enabled)===1 ? (pass?"续费月卡":"购买月卡") : "购买暂未开放";
        p("DailyNotice").text=pending?"奖励正在保存…":claimed?"今日已领取，明日0点刷新。月卡补签仅限最近30天。":"今日奖励可领取 · 七日循环，累计进度不会因断签清零。";
    }
    function claim(day) {
        if(!data||waiting)return;
        waiting=true;render();
        GameEvents.SendCustomGameEventToServer("survival_daily_claim",{target_day:day});
        $.Schedule(2,function(){waiting=false;request();});
    }
    p("DailyClaim").SetPanelEvent("onactivate",function(){if(p("DailyClaim").enabled)claim(Number(data.today));});
    p("DailyMakeup").SetPanelEvent("onactivate",function(){if(p("DailyMakeup").enabled)claim(Number(array(data.missed)[0]));});
    p("PassPurchase").SetPanelEvent("onactivate",function(){if(p("PassPurchase").enabled){p("PassPurchase").enabled=false;GameEvents.SendCustomGameEventToServer("survival_pass_purchase",{});}});
    GameEvents.Subscribe("survival_daily_snapshot",function(next){
        if(!(next.ok===true||Number(next.ok)===1)){p("DailyNotice").text=next.error||"正在读取档案";$.Schedule(3,request);return;}
        data=next;waiting=false;render();
    });
    GameUI.CustomUIConfig().SurvivalDaily={
        Open:function(pass){opened=true;buying=pass===true;hideTip();p("DailyWindow").RemoveClass("ArchiveHidden");render();request();},
        Close:function(){opened=false;p("DailyWindow").AddClass("ArchiveHidden");hideTip();}
    };
    $.Schedule(1,request);
})();
