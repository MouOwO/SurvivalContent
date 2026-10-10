(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig();
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function art(parent,type,cls){var n=$.CreatePanel(type,parent,"");n.AddClass(cls);n.hittest=false;n.hittestchildren=false;return n;}
    function apply(win,header,close){
        if(!valid(win)||win.BHasClass("PurpleShell")||win.BHasClass("ShopStandalone"))return;
        win.AddClass("ReferenceWindow");
        win.style.backgroundImage="none";
        win.style.backgroundColor="gradient(linear,0% 0%,0% 100%,from(#1b4354),color-stop(.28,#153441),to(#102b37))";
        win.style.border="0px";win.style.borderRadius="18px";
        win.style.boxShadow="#287fa344 0px 0px 20px 0px";
        if(!valid(win._referenceAtmosphere)){
            var oldChildren=win.Children();
            var atmosphere=art(win,"Panel","ReferenceAtmosphere");win._referenceAtmosphere=atmosphere;
            art(atmosphere,"Panel","ReferenceBloomTL");art(atmosphere,"Panel","ReferenceBloomBR");
            art(atmosphere,"Panel","ReferenceLightLeft");art(atmosphere,"Panel","ReferenceLightRight");
            var filaments=art(atmosphere,"Image","ReferenceFilaments");
            filaments.SetImage("file://{images}/custom_game/treasure_reference/filaments.svg");
            if(oldChildren.length)win.MoveChildBefore(atmosphere,oldChildren[0]);
            var frame=art(win,"Panel","ReferenceFrame");
            ["TL","TR","BL","BR"].forEach(function(c){art(frame,"Panel","ReferenceCorner"+c);});
        }
        if(valid(header)){
            header.AddClass("ReferenceHeader");header.style.backgroundColor="transparent";
            header.style.backgroundImage="none";header.style.borderBottom="1px solid #afbb9977";
            header.Children().forEach(function(child){
                if(child.BHasClass("RCTitle")||child.BHasClass("UIFontTitle")||/^(DailyHeading|ShopTitle|LotteryInfoTitle)$/.test(child.id)){
                    child.style.color="#eed8a7";child.style.fontFamily='"Source Han Sans SC", "Microsoft YaHei", sans-serif';child.style.fontWeight="normal";child.style.textShadow="none";
                    if(child.BHasClass("RCTitle")||child.id==="ShopTitle"){
                        child.style.horizontalAlign="left";child.style.verticalAlign="top";
                        child.style.position="96px 22px 0px";child.style.margin="0px";
                        child.style.width="70%";child.style.height="46px";child.style.textAlign="left";
                        if(!valid(header._referenceEmblem)){
                            var emblem=art(header,"Image","ReferenceHeaderEmblem");header._referenceEmblem=emblem;
                            emblem.SetImage("file://{images}/custom_game/topnav_reference_v2/"+(child.id==="ShopTitle"?"survival_shop":"shop")+".svg");
                        }
                    }
                }
            });
        }
        if(valid(close))close.AddClass("ReferenceClose");
    }
    cfg.ReferenceWindows={Apply:apply,version:"1.0.0"};
})();
