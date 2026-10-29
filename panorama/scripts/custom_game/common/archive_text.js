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
            if(part.charAt(0)!=="<"){result+=escape(part);return;}
            var open=/^<font\s+color\s*=\s*["'](#[0-9a-f]{3}|#[0-9a-f]{6}|#[0-9a-f]{8})["']\s*>$/i.exec(part);
            if(open){depth++;result+='<font color="'+open[1]+'">';}
            else if(/^<\/font\s*>$/i.test(part)&&depth>0){depth--;result+="</font>";}
            // Unknown tags are never passed to Panorama or printed literally.
        });
        while(depth-->0)result+="</font>";
        return result;
    }
    cfg.SurvivalArchiveText={Plain:plain,Rich:rich};
})();
