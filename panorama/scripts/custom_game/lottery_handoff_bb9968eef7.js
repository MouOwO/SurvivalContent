(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), timer=null;
    function p(id){return $("#"+id);}
    function valid(node){return node&&(!node.IsValid||node.IsValid());}
    function tenRule(pity){
        var list=Array.isArray(pity)?pity:Object.keys(pity||{}).map(function(k){return pity[k];});
        for(var i=0;i<list.length;i++)if(Number(list[i].batch_size)===10)return list[i];
        return null;
    }
    function quality(node,rule){
        var q=rule?String(rule.quality||"").toUpperCase():"";
        if(["N","R","SR","SSR","UR"].indexOf(q)<0)q="";
        node.text=q;node.SetHasClass("LHQualitySR",q==="SR");node.SetHasClass("LHQualityUR",q==="UR");
        // ActionButton.Adopt sets inline label colors; explicitly replace that inherited token here.
        node.style.color=q==="SR"?"#a16be0":q==="UR"?"#9b435d":"#855521";
        node.visible=!!q;
    }
    function fit(){
        var root=p("LotteryWindow"),canvas=p("LotteryMainCanvas");
        if(!valid(root)||!valid(canvas))return;
        var w=(root.actuallayoutwidth||1920)/(root.actualuiscale_x||1);
        var h=(root.actuallayoutheight||1080)/(root.actualuiscale_y||1);
        var scale=Math.min(w/1672,h/941);
        canvas.style.transform="scale3d("+scale+","+scale+",1)";
    }
    cfg.LotteryHandoff={
        Name:function(id,fallback){return id==="map"?"地图宝箱":id==="dragon_knight"?"龙脊尖兵":fallback;},
        Buttons:function(selected,waiting){
            p("LotterySingleText").style.color="#365665";
            p("LotteryTenText").style.color="#fff9e5";
            quality(p("LHTenQuality"),waiting?null:tenRule(selected&&selected.pity));
        },
        Guarantee:function(rules){
            var rule=tenRule(rules);quality(p("LHGuaranteeQuality"),rule);
            if(rule)p("LotteryGuaranteeValue").text="10连";
        },
        Open:function(){
            if(timer!==null&&$.CancelScheduled)$.CancelScheduled(timer);
            function tick(){timer=null;if(!valid(p("LotteryWindow"))||p("LotteryWindow").BHasClass("LotteryClosed"))return;fit();timer=$.Schedule(.25,tick);}
            tick();
        },
        Close:function(){if(timer!==null&&$.CancelScheduled)$.CancelScheduled(timer);timer=null;},
        CloseButton:function(button,action){
            button.hittestchildren=false;button.SetPanelEvent("onactivate",action);
        },
        Tab:function(button,pool,hostId){
            if(hostId==="LotteryInfoTabs")return;
            button.AddClass("LHMainTab");button.hittestchildren=false;
            var glow=$.CreatePanel("Panel",button,"");glow.AddClass("LHTabGlow");glow.hittest=false;
        },
        Status:function(text){
            // Keep real loading/errors; omit only idle instructional copy.
            p("LotteryStatus").SetHasClass("LHIdle",text==="请选择开启数量"||text==="");
        },
        Ready:function(){fit();var status=p("LotteryStatus"),text=String(status.text||"");if(text.indexOf("正在读")===0||text.indexOf("正在切换")===0){status.text="";status.SetHasClass("LHIdle",true);}}
    };
    // Test-only, read-only UI diagnostics. Unique names survive Panorama reloads.
    if(typeof Game!=="undefined"&&Game.AddCommand){
        var stamp=Date.now();
        Game.AddCommand("lottery_handoff_open_"+stamp,function(){cfg.SurvivalLottery.Open();},"Open existing lottery UI",0);
        Game.AddCommand("lottery_handoff_dump_"+stamp,function(){
            var values={};["LotteryWindow","LotteryMainCanvas","LotteryPoolTabs","LotteryTitle","LotteryTicketValue","LotteryGuaranteeValue","LotterySingleText","LotteryTenText","LotterySingleCost","LotteryTenCost","LotteryTenButton"].forEach(function(id){var n=p(id);values[id]=n?{text:n.text,width:n.actuallayoutwidth,height:n.actuallayoutheight,enabled:n.enabled,scale:n.actualuiscale_x}:null;});
            $.Msg("[LOTTERY_HANDOFF_STATE] "+JSON.stringify(values));
        },"Read lottery presentation state",0);
        $.Msg("[LOTTERY_HANDOFF_READY] version=bb9968eef7 commands="+stamp);
    }
})();
