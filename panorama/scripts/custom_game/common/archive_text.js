(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig();
    function lines(value) {
        return String(value===undefined||value===null?"":value).replace(/\\r\\n|\\n|\\r/g,"\n")
            .replace(/\r\n?/g,"\n").replace(/<br\s*\/?>/gi,"\n");
    }
    function plain(value) {
        return lines(value).replace(/<[^>]*>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">")
            .replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,"&");
    }
    function escape(value) {
        return value.replace(/&(?!(?:amp|lt|gt|quot|#39);)/g,"&amp;")
            .replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function rich(value) {
        var depth=0,result="";
        lines(value).split(/(<[^>]*>)/g).forEach(function(part){
            if(part.charAt(0)!=="<"){result+=escape(part).replace(/\n/g,"<br>");return;}
            var open=/^<font\s+color\s*=\s*["'](#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})["']\s*>$/i.exec(part);
            if(open){depth++;result+='<font color="'+open[1]+'">';}
            else if(/^<\/font\s*>$/i.test(part)&&depth>0){depth--;result+="</font>";}
            // Unknown tags are never passed to Panorama or printed literally.
        });
        while(depth-->0)result+="</font>";
        return result;
    }
    function effectLines(value,options) {
        options=options||{};
        var text=plain(value);
        if(options.collection)text=text.replace(/已拥有\s*\d+\s*件[，,]?\s*/g,"");
        text=text.replace(/[^\S\n]*(激活消耗[：:]|月卡加赠[：:]|效果按数量叠加)/g,"\n$1");
        if(options.bonusLines){
            // Presentation only: preserve numbers, conditions and reward values.
            text=text.replace(/[；;]/g,"\n").replace(/([0-9%％wW])[^\S\n]*(?=(?:英雄|箭塔|城墙|墙|伐木工|金矿|地图等级|曙光积分|攻击|生命|护甲|金币|木材)[\u3400-\u9fffA-Za-z]{0,18}[+＋-]\s*\d)/g,"$1\n")
                .replace(/[^\S\n]*(购买后自动激活)/g,"\n$1");
        }
        return text.replace(/\n[\t ]*\n/g,"\n").trim();
    }
    cfg.SurvivalArchiveText={Plain:plain,Rich:rich,EffectLines:effectLines};
})();
