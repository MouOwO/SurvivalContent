(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),A=cfg.ArchiveHandoff,root=$.GetContextPanel();
    if(!A)return;
    var originalIcon=A.Icon,originalCard=A.Card,originalPalette=A.ApplyPalette,originalInit=A.Init,originalHide=A.Hide;
    function p(id){return root.FindChildTraverse(id);}
    function valid(el){return el&&(!el.IsValid||el.IsValid());}
    function style(el,values){if(valid(el))Object.keys(values).forEach(function(key){el.style[key]=values[key];});}
    function children(el){return valid(el)&&el.Children?el.Children():[];}
    function badge(item,category){
        var known=item.count_known===undefined||Number(item.count_known)===1;
        if(category==="titles")return "";
        if(["clear","endless","boss","map_level","gift"].indexOf(category)>=0)return A.Progress(item).replace(/\s/g,"");
        if(category==="building"||category==="work")return (Number(item.level)||0)+"/"+(Number(item.target)||1);
        if(category==="starjoy_points")return String(item.target===undefined?"—":item.target);
        if(item.count===undefined)return "";
        return "×"+(known&&isFinite(Number(item.count))?String(item.count):"—");
    }
    function decorate(card){
        card.AddClass("ArchiveCompactCell");
        var title=card.BHasClass("ArchiveTitleCard");
        style(card,{width:title?"268px":"128px",height:"128px",margin:"0px 12px 2px 0px",padding:"0px",flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",borderRadius:"0px",boxShadow:"none"});
        children(card).forEach(function(el){
            if(el.BHasClass("ArchiveArt")){
                if(el.BHasClass("ArchivePortraitViewport")&&!el.__purplePortraitSized){
                    var factor=92/(parseFloat(el.style.width)||96);
                    children(el).forEach(function(icon){
                        ["width","height"].forEach(function(key){if(parseFloat(icon.style[key]))icon.style[key]=(parseFloat(icon.style[key])*factor)+"px";});
                        var at=String(icon.style.position||"").split(/\s+/);
                        if(at.length>=2)icon.style.position=(parseFloat(at[0])*factor)+"px "+(parseFloat(at[1])*factor)+"px 0px";
                    });el.__purplePortraitSized=true;
                }
                var hovered=card.BHasClass("ArchiveHovered");
                style(el,{position:"18px 6px 0px",width:"92px",height:"92px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",backgroundImage:"none",backgroundColor:"#110b25",border:hovered?"1px solid #efd079":"1px solid #63518b",borderRadius:"3px",boxShadow:hovered?"#d9ac4c66 0px 0px 7px 0px":"none"});
                children(el).forEach(function(icon){
                    if(icon.BHasClass("ArchiveRewardIcon")&&!el.BHasClass("ArchivePortraitViewport"))style(icon,{width:"100%",height:"100%",position:"0px 0px 0px",margin:"0px"});
                });
            }
            if(el.BHasClass("ArchiveNameHost"))style(el,{position:"0px 101px 0px",width:"128px",height:"26px",margin:"0px",horizontalAlign:"left",verticalAlign:"top"});
            if(el.BHasClass("ArchiveCountHost"))style(el,{position:"0px 0px 0px",width:"128px",height:"25px",margin:"0px",horizontalAlign:"left",verticalAlign:"top",zIndex:"6"});
            children(el).forEach(function(text){
                if(text.BHasClass("ArchiveItemName"))style(text,{color:card.__archiveUnlocked===true?"#e4d7f1":"#ad9bbf",fontSize:"18px"});
                if(text.BHasClass("ArchiveCompactBadge"))style(text,{color:"#ecdbfa",fontSize:"16px"});
            });
            if(el.BHasClass("ArchiveCostHost")||el.BHasClass("ArchiveLevelHost")||el.BHasClass("ArchiveStateIcon"))style(el,{visibility:"collapse"});
            if(el.BHasClass("ArchiveNormalFrame")||el.BHasClass("ArchiveSelectedFrame"))style(el,{visibility:"collapse"});
            if(el.BHasClass("ArchivePromote")){
                var canPromote=el.enabled!==false;
                style(el,{position:"66px 73px 0px",width:"44px",height:"25px",margin:"0px",zIndex:"7",backgroundImage:"none",backgroundColor:canPromote?"#3f285d":"#251a35",border:canPromote?"1px solid #bfa169":"1px solid #51425f"});
                children(el).forEach(function(text){style(text,{color:canPromote?"#ecdbfa":"#9688a7"});});
            }
        });
    }
    function apply(){
        var win=p("ArchiveWindow");if(!valid(win))return;
        win.AddClass("ArchivePurple");
        style(p("ArchiveBody"),{position:"0px 132px 0px",width:"1280px",height:"668px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",padding:"0px"});
        style(p("ArchiveContent"),{position:"216px 0px 0px",width:"1064px",height:"668px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",padding:"0px"});
        style(p("ArchiveTabs"),{position:"0px 10px 0px",width:"216px",height:"612px",backgroundImage:"none",backgroundColor:"transparent",padding:"0px",margin:"0px"});
        var content=p("ArchiveContent"),hasDraw=content.BHasClass("ArchiveHasDraw");
        style(p("ArchivePageHeader"),{position:"24px 606px 0px",width:"1000px",height:"26px",flowChildren:"none",visibility:hasDraw?"collapse":"visible"});
        style(p("ArchivePageTitle"),{visibility:"collapse"});
        style(p("ArchiveSummary"),{position:"0px 0px 0px",width:"1000px",height:"26px",fontSize:"18px",color:"#bdb0d3",textAlign:"center"});
        style(p("ArchiveFilters"),{position:"24px 12px 0px",width:"600px",height:"35px",margin:"0px",padding:"0px",flowChildren:"right"});
        children(p("ArchiveFilters")).forEach(function(button){
            style(button,{width:button.id==="ArchiveFilter_all"?"178px":"124px",height:"35px",minHeight:"35px",margin:"0px 10px 0px 0px",padding:"0px"});
            children(button).forEach(function(child){
                if(child.BHasClass("RadioBox"))style(child,{visibility:"collapse"});
                if(String(child.paneltype||"").toLowerCase()==="label")style(child,{position:"0px 0px 0px",width:"100%",height:"35px",margin:"0px",padding:"0px",horizontalAlign:"center",verticalAlign:"center",fontSize:"19px",textAlign:"center",whiteSpace:"nowrap",textOverflow:"clip"});
            });
        });
        style(p("ArchiveContext"),{position:"648px 17px 0px",width:"376px",height:"27px",fontSize:"18px",color:"#e4c174",textAlign:"right"});
        style(p("ArchiveGrid"),{position:"24px 60px 0px",width:"1000px",height:"522px",margin:"0px",padding:"0px 8px 0px 0px",flowChildren:"right-wrap",overflow:"squish scroll"});
        style(p("ArchiveFooter"),{position:hasDraw?"24px 642px 0px":"24px 635px 0px",width:"1000px",height:"24px",padding:"0px",margin:"0px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        style(p("ArchiveStatus"),{position:"0px 0px 0px",width:"1000px",height:"24px",margin:"0px",fontSize:"16px",color:"#a997c0",textAlign:"center"});
        ["ArchiveSidebarBacking","ArchiveContentBacking","ArchiveHeader","ArchiveCurrencySource","ArchiveHint"].forEach(function(id){style(p(id),{visibility:"collapse"});});
        style(p("ArchiveDrawBar"),{position:"24px 588px 0px",width:"1000px",height:"50px",backgroundImage:"none",backgroundColor:"#19102e",border:"1px solid #554174",flowChildren:"none"});
        style(p("ArchiveTickets"),{position:"14px 5px 0px",width:"800px",height:"22px"});
        style(p("ArchiveDrawResult"),{position:"14px 26px 0px",width:"800px",height:"20px"});
        var draw=p("ArchiveDraw"),drawReady=valid(draw)&&draw.enabled!==false;
        style(draw,{position:"842px 8px 0px",width:"144px",height:"34px",backgroundImage:"none",backgroundColor:drawReady?"#573181":"#251a35",border:drawReady?"1px solid #be9f64":"1px solid #51425f"});
        children(p("ArchiveGrid")).forEach(function(card){if(card.BHasClass("ArchiveCard"))decorate(card);});
        children(p("ArchiveTabs")).forEach(function(tab){children(tab).forEach(function(text){if(text.BHasClass("ArchiveNavLabel"))style(text,{color:tab.checked?"#ffe190":"#d7c8eb",fontSize:"22px"});});});
        var tip=p("ArchiveTooltip");
        if(valid(tip)){
            tip.AddClass("ArchivePurpleTooltip");
            style(tip,{width:"380px",height:"fit-children",flowChildren:"down",backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#211631),to(#0e0b1d))",border:"1px solid #b58d47",borderRadius:"5px",boxShadow:"#000000cc 0px 5px 18px 0px"});
            style(p("ArchiveTooltipBody"),{backgroundImage:"none",backgroundColor:"transparent",padding:"16px 18px"});
            style(p("ArchiveTooltipName"),{color:"#f2ce6c",fontSize:"24px"});
            style(p("ArchiveTooltipStateText"),{color:"#d2c4e5"});
            style(p("ArchiveTooltipProgress"),{color:"#eadcf5"});
            var body=p("ArchiveTooltipBody"),condition=p("ArchiveTooltipCondition"),effectHeading=children(body).filter(function(el){return el.BHasClass("ArchiveDetailHeading");})[0];
            if(body.MoveChildBefore&&valid(condition)&&valid(effectHeading)){
                var conditionHeading=p("ArchiveTooltipConditionHeading");
                if(!conditionHeading){conditionHeading=$.CreatePanel("Label",body,"ArchiveTooltipConditionHeading");conditionHeading.hittest=false;conditionHeading.text="解锁条件";conditionHeading.AddClass("ArchiveCompactDetailHeading");}
                conditionHeading.visible=condition.visible!==false&&!!condition.text;
                body.MoveChildBefore(condition,effectHeading);
                body.MoveChildBefore(conditionHeading,condition);
                body.MoveChildBefore(p("ArchiveTooltipProgressRow"),effectHeading);
                if(valid(p("ArchiveTooltipProgressTrack")))body.MoveChildBefore(p("ArchiveTooltipProgressTrack"),effectHeading);
                effectHeading.text=tip.__archiveEffectOnly?"说明":"存档效果";
                style(effectHeading,{width:"100%",marginTop:"14px",paddingTop:"10px",borderTop:"1px solid #625071",color:"#e7d2a4"});
            }
        }
    }
    A.Icon=function(parent,item,category,buildings){
        originalIcon.call(A,parent,item,category,buildings);
        parent.__archiveItem=item;parent.__archiveCategory=category;
        children(parent).forEach(function(el){if(el.BHasClass("ArchiveCount")){
            el.text=badge(item,category);el.visible=!!el.text;
            el.AddClass("ArchiveCompactBadge");
        }});
    };
    A.Card=function(card){originalCard.call(A,card);decorate(card);};
    A.ApplyPalette=function(){originalPalette.call(A);apply();};
    A.Init=function(){originalInit.call(A);apply();};
    A.Hide=function(){originalHide.call(A);children(p("ArchiveGrid")).forEach(function(card){if(card.BHasClass("ArchiveCard"))decorate(card);});};
    cfg.SurvivalArchivePurple={Apply:apply,Badge:badge,Decorate:decorate,version:"1.0.0"};
})();
