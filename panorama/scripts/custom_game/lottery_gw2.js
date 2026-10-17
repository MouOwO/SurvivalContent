(function () {
    "use strict";
    // Presentation only. The existing controller owns requests, balances and layers.
    var cfg = GameUI.CustomUIConfig(), root = $.GetContextPanel(), U = cfg.SurvivalUI, R = cfg.RemainingHandoff;
    if (cfg.SurvivalPurpleLottery && cfg.SurvivalPurpleLottery.Dispose) cfg.SurvivalPurpleLottery.Dispose();
    var disposed = false, life = $.CreatePanel("Panel", root, ""), view = null, nodes = {}, moved = [], owned = [], tipDismiss = null;
    var mode = "", pools = [], selected = "map", snapshot = null, opened = false, scale = 1, tabKey = "", previewKey = "", prizeFolded = {}, prizeGroups = [];
    var tipAnchor = null, tipHideJob = null, tipEpoch = 0;
    life.visible = false;
    function valid(n) { return n && (!n.IsValid || n.IsValid()); }
    function alive() { return !disposed && valid(root) && valid(life); }
    function remember(n) { if (!valid(n)) return; if (n.id) nodes[n.id] = n; n.Children().forEach(remember); }
    // Compiled-layout traversal can stop finding controls after SetParent.
    remember(root);
    function p(id) { if (!alive()) return null; if (valid(nodes[id])) return nodes[id]; var n = root.FindChildTraverse(id); if (!valid(n)) return null; nodes[id] = n; return n; }
    function style(n, values) { if (valid(n)) Object.keys(values).forEach(function (k) { n.style[k] = values[k]; }); }
    function place(n, x, y, w, h) { style(n, {position:x + "px " + y + "px 0px", width:w + "px", height:h + "px", margin:"0px", padding:"0px", horizontalAlign:"left", verticalAlign:"top", ignoreParentFlow:"true"}); }
    function fillItemIcon(icon,item){var presentation=cfg.SurvivalRewardPresentation;if(presentation&&presentation.FillIcon)presentation.FillIcon(icon,item);}
    function walk(n, fn) { if (!valid(n)) return; fn(n); n.Children().forEach(function (c) { walk(c, fn); }); }
    function make(type, parent, id, cls) { var n = $.CreatePanel(type, parent, id || ""); if (id) nodes[id] = n; if (cls) n.AddClass(cls); owned.push(n); return n; }
    function label(parent, id, text, x, y, w, h, size, color) { var n = make("Label", parent, id, "LotteryGW2Label"); n.text = text; n.hittest = false; place(n,x,y,w,h); style(n,{fontSize:size + "px",color:color || "#eaddc4"}); return n; }
    function asset(key) { var data = cfg.LotteryGW2Data, row = data && data.assets && data.assets[key]; return row && row.file || "file://{images}/custom_game/lottery_gw2_v1/" + key + ".png"; }
    function skin(n,key) { style(n,{backgroundImage:'url("' + asset(key) + '")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",backgroundColor:"transparent",border:"0px"}); }
    function art(parent,id,key,x,y,w,h) { var n=make("Panel",parent,id,"LotteryGW2Art"); n.hittest=false; n.hittestchildren=false; place(n,x,y,w,h); skin(n,key); return n; }
    function moveNode(n,parent) {
        if (!valid(n) || !valid(parent) || n.GetParent() === parent) return n;
        if (!moved.some(function (e) { return e.node === n; })) { var old=n.GetParent(),siblings=valid(old)?old.Children():[]; moved.push({node:n,parent:old,next:siblings[siblings.indexOf(n)+1]}); }
        n.SetParent(parent); return n;
    }
    function move(id,parent) { return moveNode(p(id),parent); }
    function hidden(id) { style(p(id),{visibility:"collapse"}); }
    function canAct() { var layers=cfg.SurvivalUILayers,top=layers&&layers.Top?layers.Top():null;return alive()&&opened&&(!layers||!layers.Top||top==="lottery"||top==="lottery_info"); }
    function invoke(method,arg) { if(!canAct())return;var ui=cfg.SurvivalLottery; if(ui && typeof ui[method]==="function") ui[method](arg); }
    function prune() { owned=owned.filter(valid);moved=moved.filter(function(e){return valid(e.node)&&valid(e.parent);}); }
    function button(parent,id,text,fn) { var b=make("Button",parent,id,"LotteryGW2Action"); b.hittestchildren=false;var caption=label(b,"",text,0,0,150,44,19);style(caption,{width:"100%",height:"fit-children",horizontalAlign:"center",verticalAlign:"center",textAlign:"center"}); b.SetPanelEvent("onactivate",function(){if(alive())fn();}); return b; }
    function existingRewardArt(icon,item) {
        // Registered artwork already came from the shared icon factory. Never
        // restore the old per-window catalogue on top of that resource.
        if(cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(item))return icon;
        var catalog=cfg.SurvivalItemArt,row=catalog&&catalog.Lookup&&catalog.Lookup(item);
        if(!valid(icon)||typeof icon.SetImage!=="function"||!row||!/^lottery_/.test(String(row.item_id||""))||String(row.icon_path||"").indexOf("custom_game/reward_art_v5/")!==0)return icon;
        var uri=row.runtime_uri||"file://{images}/"+row.icon_path;
        if(icon.__lotteryGW2Art!==uri){icon.SetImage(uri);icon.__lotteryGW2Art=uri;}return icon;
    }
    function lotteryParent(parent) {
        // The factory remains unchanged for every non-lottery consumer.
        var window=p("LotteryWindow");for(var n=parent;valid(n);n=n.GetParent())if(n===window)return true;
        return false;
    }
    function fit() {
        if (!ensure()) return false;prune();
        var viewport=cfg.LotteryHandoff && cfg.LotteryHandoff.Viewport && cfg.LotteryHandoff.Viewport();
        if (!viewport) { style(p("LotteryMainCanvas"),{opacity:"0"}); return false; }
        scale=Number(U.Fit(p("LotteryMainCanvas"),root,1536,864,{reference:[1536,864]})) || 1;
        style(p("LotteryMainCanvas"),{opacity:"1",transformOrigin:"50% 50%"}); return true;
    }
    function ensure() {
        // A cached view belongs to its original HUD lifetime. Controller reload
        // can call this API before the next presentation script is installed.
        if (!alive()) return null;
        var canvas=p("LotteryMainCanvas"),window=p("LotteryWindow"); if(!valid(canvas)||!valid(window)||!U) return null;
        if (view) return valid(view.root)?view:null;
        canvas.RemoveClass("LotteryPurple"); canvas.RemoveClass("MenuV10Page"); canvas.AddClass("LotteryV10"); canvas.AddClass("LotteryGW2");
        window.RemoveClass("LotteryV10Root"); window.AddClass("LotteryGW2Root");
        style(canvas,{width:"1536px",height:"864px",position:"0px 0px 0px",horizontalAlign:"center",verticalAlign:"center",transformOrigin:"50% 50%",margin:"0px",padding:"0px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",flowChildren:"none",overflow:"noclip"});
        var shell=make("Panel",canvas,"LotteryGW2Root","LotteryGW2Shell"); place(shell,0,0,1536,864);
        art(shell,"LotteryGW2Background","window_background",0,0,1536,864);
        art(shell,"LotteryGW2HeaderSkin","header_strip",44,34,1448,72);
        art(shell,"LotteryGW2SidebarSkin","sidebar_background",47,116,269,670);
        art(shell,"LotteryGW2FooterSkin","footer_strip",44,786,1448,40);
        var header=make("Panel",shell,"LotteryGW2Header"); place(header,46,37,1444,68);
        var sidebarPanel=make("Panel",shell,"LotteryGW2Sidebar"); place(sidebarPanel,58,138,250,610);
        var content=make("Panel",shell,"LotteryGW2Content"); place(content,342,118,1113,669); style(content,{overflow:"clip",flowChildren:"none"});
        var detail=make("Panel",shell,"LotteryGW2DetailLayer"); place(detail,0,0,1536,864); detail.hittest=false;
        // UILayers raises the details ancestry. Keep its tooltip in that same
        // layer so the authoritative details panel cannot cover the tooltip.
        var tooltip=make("Panel",detail,"LotteryGW2Tooltip","LotteryGW2Tooltip"); tooltip.AddClass("MenuTooltipHost"); tooltip.hittest=true; tooltip.hittestchildren=true; tooltip.visible=false;
        style(tooltip,{zIndex:"100",flowChildren:"none"});
        // Feather the art layer only; text and scroll controls remain unmasked.
        var tipShadow=make("Panel",tooltip,"LotteryGW2TooltipSoftShadow","MenuTooltipSoftShadow"); place(tipShadow,0,0,366,340); tipShadow.hittest=false; tipShadow.hittestchildren=false;
        var tipBacking=art(tooltip,"LotteryGW2TooltipBacking","tooltip_background",0,0,366,340); tipBacking.AddClass("MenuTooltipBacking");
        art(tooltip,"LotteryGW2TooltipFrame","tooltip_frame",0,0,366,340);
        var tipIconStage=make("Panel",tooltip,"LotteryGW2TooltipIconStage");place(tipIconStage,20,22,48,48);tipIconStage.hittest=false;
        var tipName=label(tooltip,"LotteryGW2TooltipName","",80,22,264,42,21,"#f0dfb8");
        var tipState=label(tooltip,"LotteryGW2TooltipState","",80,67,264,24,16,"#b5bfbb");
        var tipScroll=make("Panel",tooltip,"LotteryGW2TooltipScroll"); place(tipScroll,22,116,322,178); style(tipScroll,{flowChildren:"down",overflow:"squish scroll"});
        var tipDescription=label(tipScroll,"LotteryGW2TooltipDescription","",0,0,316,178,18,"#e0d6c5"); style(tipDescription,{height:"fit-children",ignoreParentFlow:"false",whiteSpace:"normal"});
        var tipCount=label(tooltip,"LotteryGW2TooltipQuantity","",22,294,322,24,17,"#b5bfbb");
        view={root:shell,header:header,sidebar:sidebarPanel,content:content,detailLayer:detail,tooltip:tooltip,tipShadow:tipShadow,tipBacking:tipBacking,tipName:tipName,tipState:tipState,tipDescription:tipDescription,tipCount:tipCount,tipScroll:tipScroll,tipIconStage:tipIconStage,tabs:[]};
        tipDismiss=cfg.SurvivalTooltipDismiss.Create({panel:tooltip,getRect:tooltipRect,hide:hideTooltip,allowTooltipHover:tooltipOverflows,isAlive:alive,isVisible:function(){return canAct()&&valid(tooltip)&&tooltip.visible;}});
        tooltip.SetPanelEvent("onmouseover",function(){if(tooltipOverflows())cancelTooltipHide();else tipDismiss.Dismiss();});
        tooltip.SetPanelEvent("onmouseout",function(){if(!requestTooltipHide())hideTooltip();});
        view.title=label(header,"LotteryGW2Title","抽奖",112,10,474,45,31,"#efdfbc");
        view.back=button(header,"LotteryGW2Back","‹ 返回",function(){if(mode)invoke("CloseInfo");else invoke("Close");}); place(view.back,0,10,106,45);
        view.ticket=label(header,"LotteryGW2TicketBalance","抽奖券 —",628,16,278,36,20,"#e6d4ad");
        view.points=label(header,"LotteryGW2Points","商城积分 —",907,9,236,25,18,"#b6cac9");
        view.starjoy=label(header,"LotteryGW2StarjoyPoints","星悦积分 —",907,34,236,22,15,"#a9b3b0");
        move("LotteryTicketPurchase",header); place(p("LotteryTicketPurchase"),1158,9,186,47); p("LotteryTicketPurchase").AddClass("LotteryGW2Action");
        p("LotteryTicketPurchase").Children().forEach(function(c){c.visible=false;}); label(p("LotteryTicketPurchase"),"LotteryGW2PurchaseLabel","获取抽奖券",0,0,186,47,19);
        move("LotteryCloseButton",header); place(p("LotteryCloseButton"),1362,8,48,48); skin(p("LotteryCloseButton"),"close"); p("LotteryCloseButton").Children().forEach(function(c){c.visible=false;});
        ["LotterySceneBackground","LotterySceneShade","LotteryHeroCopy","LotteryUnlockNotice","LotteryResultStage","LotteryRevealStage","LotterySkipReveal","LotteryStatus","LotteryCelestialFooter"].forEach(function(id){move(id,content);});
        move("LotteryInfoOverlay",detail); move("LotteryAnnouncement",p("LotteryCelestialFooter"));
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        view.preview=make("Panel",content,"LotteryGW2Preview"); place(view.preview,28,452,538,142); style(view.preview,{zIndex:"3"});
        view.previewCaption=label(view.preview,"LotteryGW2PreviewCaption","奖池珍藏",0,0,518,24,17,"#d7c69f");
        view.previewItems=make("Panel",view.preview,"LotteryGW2PreviewItems"); place(view.previewItems,0,32,538,110);
        var back=button(p("LotteryInfoFooter"),"LotteryGW2InfoBack","返回抽奖",function(){invoke("CloseInfo");}); place(back,916,25,178,46);
        sidebar(); return view;
    }
    function sidebar() {
        if(!alive()||!view||!valid(view.sidebar))return;
        var signature=pools.map(function(pool){return String(pool.id)+":"+String(pool.display_name||pool.id);}).join("|");
        if(signature!==tabKey){view.sidebar.RemoveAndDeleteChildren();prune();view.tabs=[];tabKey=signature;
            pools.forEach(function(pool,index){
                var id=String(pool.id),b=make("Button",view.sidebar,"LotteryGW2Pool_"+id,"LotteryGW2Pool"); place(b,0,index*132,250,116); b.hittestchildren=false;
                var name=label(b,"",String(pool.display_name||id),18,22,214,35,25,"#e4d6bc");
                var state=label(b,"","",18,66,214,25,16,"#aaa99c");
                b.SetPanelEvent("onactivate",function(){if(!canAct())return;hideTooltip();if(mode==="history")invoke("SelectHistoryPool",id);else invoke("SelectPool",id);});
                view.tabs.push({id:id,button:b,name:name,state:state});
            });
        }
        view.tabs.forEach(function(tab,index){var pool=pools[index]||{},on=tab.id===selected;tab.button.SetHasClass("Selected",on);skin(tab.button,on?"tab_selected":"tab_background");
            tab.state.text=pool.unlocked===false?"未解锁  "+number(pool.unlock_progress)+" / "+number(pool.unlock_required):String(pool.ticket_name||((pool.ticket_content_id==="special_lottery_ticket")?"金色抽奖券":""));
            style(tab.name,{color:on?"#f3e7ce":"#c5c8bf"});
        });
    }
    function number(raw) { if(raw===undefined||raw===null||raw==="")return "—";var n=Number(raw);return isFinite(n)&&n>=0?String(n):"—"; }
    function quantity(item) {var current=number(item&&item.owned_count),max=Number(item&&item.max_owned);return current+(current!=="—"&&isFinite(max)&&max>0?"/"+max:"");}
    function previews() {
        if(!alive()||!view||!valid(view.previewItems))return;
        var rows=snapshot&&snapshot.items,items=Array.isArray(rows)?rows:rows&&typeof rows==="object"?Object.keys(rows).map(function(k){return rows[k];}):[];
        var ranks={ur:5,ssr:4,sr:3,r:2,n:1};items=items.slice().sort(function(a,b){return (ranks[String(b.quality).toLowerCase()]||0)-(ranks[String(a.quality).toLowerCase()]||0);}).slice(0,4);
        var signature=String(snapshot&&snapshot.selected_pool_id)+":"+JSON.stringify(items);
        if(signature===previewKey)return;previewKey=signature;view.previewItems.RemoveAndDeleteChildren();prune();view.preview.visible=items.length>0;
        items.forEach(function(item,index){
            var b=make("Button",view.previewItems,"LotteryGW2Preview_"+index,"LotteryGW2PreviewCard");place(b,index*128,0,118,106);b.hittestchildren=false;
            art(b,"","slot_background",21,0,76,76);var icon=cfg.SurvivalRewardPresentation&&cfg.SurvivalRewardPresentation.CreateIcon(b,item,"LotteryGW2PreviewIcon");if(icon){place(icon,22,1,74,74);fillItemIcon(icon,item);}
            art(b,"","slot_frame",21,0,76,76);label(b,"",String(item.name||item.id||""),0,79,118,26,16,"#dbd3c2");
            b.SetPanelEvent("onmouseover",function(){tooltip(item,b);});b.SetPanelEvent("onmouseout",function(){if(!requestTooltipHide())hideTooltip();});b.SetPanelEvent("onactivate",function(){hideTooltip();invoke("Feature","details");});
        });
    }
    function action(id,primary) {
        var b=p(id);if(!valid(b))return;b.AddClass("LotteryGW2Action");b.SetHasClass("LotteryGW2Primary",!!primary);skin(b,"draw_button");style(b,{boxShadow:"none",flowChildren:"none",borderRadius:"0px"});
        walk(b,function(n){if(n.paneltype==="Label")style(n,{color:b.enabled===false?"#9b9383":"#f2e4c8",textShadow:"#000000 0px 1px 2px 1.0"});if(n.BHasClass("ZXActionSkin")||n.BHasClass("LHDrawVisual"))n.visible=false;});
    }
    function compactCards(host,single) {
        if(!valid(host)||!ensure())return;
        (single?[single]:host.Children()).forEach(function(card,index){
            if(!card.BHasClass("LotteryDetailRow")&&!card.BHasClass("LotteryRewardCard"))return;
            if(single)index=host.Children().indexOf(card);
            var result=card.BHasClass("LotteryRewardCard"),item=card.__lotteryItem||{},cell=card.__lotteryGW2Cell,icon=null,name=null,cover=null;
            walk(card,function(c){if(c.BHasClass("LotteryRewardIcon"))icon=c;if(c.BHasClass("RHRewardName")||c.BHasClass("LotteryRewardName"))name=c;if(c.BHasClass("LotteryCardBack"))cover=c;});
            existingRewardArt(icon,item);
            if(!cell||!valid(cell.host)){
                var hostVisual=make("Panel",card,"","LotteryGW2CellVisual");place(hostVisual,0,0,134,168);hostVisual.hittest=false;hostVisual.hittestchildren=false;
                art(hostVisual,"","slot_background",9,3,116,116);var stage=make("Panel",hostVisual,"","LotteryGW2CellStage");place(stage,10,4,114,114);
                art(hostVisual,"","slot_frame",9,3,116,116);var selectedFrame=art(hostVisual,"","slot_selected",9,3,116,116);selectedFrame.AddClass("LotteryGW2SelectedFrame");
                if(icon){moveNode(icon,stage);place(icon,0,0,114,114);icon.visible=true;fillItemIcon(icon,item);}
                if(name)moveNode(name,hostVisual);else name=label(hostVisual,"","",0,123,134,39,17);
                place(name,0,123,134,39);style(name,{fontSize:"17px",fontWeight:"normal",fontFamily:'"Source Han Sans SC"',color:"#e0d6c3",textAlign:"center",whiteSpace:"normal",textOverflow:"ellipsis",textShadow:"none"});name.visible=true;
                var count=label(hostVisual,"","",13,88,106,24,16,"#f1e9d8");style(count,{textAlign:"right",textShadow:"#000000 0px 1px 3px 2.0"});
                cell=card.__lotteryGW2Cell={host:hostVisual,name:name,count:count,stage:stage};
            }
            card.Children().forEach(function(c){if(c!==cell.host&&c!==cover)c.visible=false;});card.AddClass("LotteryGW2Cell");
            place(card,result?(host.Children().length===1?488:52+(index%5)*212):5+(index%8)*137,result?10+Math.floor(index/5)*190:8+Math.floor(index/8)*178,134,168);
            style(card,{flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",overflow:"noclip",transform:"none"});
            cell.name.text=String(item.name||item.id||cell.name.text||"道具");cell.count.text=result?"×"+number(item.count===undefined?(item.quantity===undefined?1:item.quantity):item.count):quantity(item);
            if(cover){place(cover,0,0,134,168);skin(cover,"slot_background");style(cover,{zIndex:"20"});}
        });
    }
    function apply() {
        if(!ensure())return;
        var window=p("LotteryWindow");if(!valid(window))return;
        var results=window.BHasClass("LotteryResultsShown"),drawVisible=!mode&&!results;
        style(window,{width:"100%",height:"100%",position:"0px 0px 0px",horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",backgroundImage:"none",backgroundColor:"#080908b8",border:"0px",borderRadius:"0px",boxShadow:"none",flowChildren:"none",transform:"none"});
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        style(view.content,{visibility:mode?"collapse":"visible"});
        place(p("LotterySceneBackground"),0,0,1113,669);style(p("LotterySceneBackground"),{opacity:"1",zIndex:"0",overflow:"clip"});
        if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Resize(1113,669);
        place(p("LotterySceneShade"),0,0,1113,669);style(p("LotterySceneShade"),{zIndex:"1",backgroundColor:"gradient(linear,0% 0%,100% 0%,from(#14120c0a),color-stop(.45,#121a201a),color-stop(.64,#14150d4d),to(#12100b80))"});
        place(p("LotteryHeroCopy"),611,54,472,346);style(p("LotteryHeroCopy"),{flowChildren:"none",zIndex:"3",visibility:drawVisible?"visible":"collapse"});
        place(p("LotteryTitle"),0,0,466,86);style(p("LotteryTitle"),{visibility:"visible",fontSize:"43px",fontWeight:"normal",color:"#f3e4c0",whiteSpace:"normal",textShadow:"#000000 0px 2px 4px 2.0"});
        place(p("LotteryTaglineBounds"),2,100,461,106);place(p("LotteryTagline"),0,0,461,106);style(p("LotteryTagline"),{fontSize:"22px",minHeight:"0px",color:"#c1cfca",transform:"none",whiteSpace:"normal",textShadow:"#000000 0px 1px 3px 1.0"});
        var pool=snapshot&&(snapshot.selected_pool||snapshot);if(pool&&pool.description)p("LotteryTagline").text=String(pool.description);
        place(p("LotteryGuaranteeRow"),2,230,458,62);style(p("LotteryGuaranteeRow"),{flowChildren:"none",backgroundColor:"transparent",visibility:"collapse"});
        place(p("LotteryUnlockNotice"),613,405,470,70);style(p("LotteryUnlockNotice"),{fontSize:"20px",color:"#cfbfa0",whiteSpace:"normal",textShadow:"#000000 0px 1px 3px 1.0",zIndex:"3",visibility:drawVisible?"visible":"collapse"});
        place(p("LotteryCelestialFooter"),0,0,1113,669);style(p("LotteryCelestialFooter"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none",zIndex:"4",visibility:drawVisible?"visible":"collapse",overflow:"noclip"});p("LotteryCelestialFooter").hittest=false;
        place(p("LotterySingleButton"),593,534,240,70);place(p("LotteryTenButton"),850,534,240,70);
        place(p("LotteryDrawPity"),593,495,497,31);place(p("LotteryDrawPityCaptionBounds"),0,0,497,31);place(p("LotteryDrawPityCaption"),0,0,497,31);style(p("LotteryDrawPityCaption"),{fontSize:"21px",minHeight:"0px",textAlign:"center",transform:"none",color:"#dbc999"});
        place(p("LHDetails"),18,616,142,40);place(p("LHHistory"),171,616,142,40);place(p("LotteryAnnouncement"),323,616,132,40);style(p("LotteryAnnouncement"),{visibility:"visible"});place(p("LotterySkipAnimation"),475,619,165,34);
        place(p("LotteryStatus"),659,618,430,40);style(p("LotteryStatus"),{fontSize:"17px",color:"#cfc8b5",whiteSpace:"normal",textShadow:"none",zIndex:"8"});
        ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm","LotteryGW2InfoBack"].forEach(function(id){action(id,id==="LotteryTenButton"||id==="LotteryAgain");});
        ["LotterySingleCost","LotteryTenCost"].forEach(function(id){style(p(id),{visibility:"visible",fontSize:"22px",color:"#f2e4c8"});});
        ["LHDetails","LHHistory","LotteryAnnouncement","LotteryTicketPurchase","LotteryGW2Back"].forEach(function(id){var b=p(id);if(valid(b))b.AddClass("LotteryGW2Action");});
        place(p("LotteryResultStage"),0,0,1113,669);style(p("LotteryResultStage"),{backgroundImage:"none",backgroundColor:"#161711f8",zIndex:"6",flowChildren:"none",border:"0px"});
        place(p("LotteryResultHeading"),18,13,1076,48);style(p("LotteryResultHeading"),{fontSize:"28px",color:"#efdbb2",textShadow:"none"});
        place(p("LotteryItemList"),8,75,1097,449);style(p("LotteryItemList"),{flowChildren:"none",overflow:"squish scroll"});
        place(p("LotteryResultActions"),0,573,1113,70);style(p("LotteryResultActions"),{flowChildren:"none"});place(p("LotteryConfirm"),292,0,240,55);place(p("LotteryAgain"),568,0,240,55);
        place(p("LotteryRevealStage"),0,0,1113,669);place(p("LotterySkipReveal"),939,15,155,42);compactCards(p("LotteryItemList"));
        var film=p("LotteryCinematicSurface");if(valid(film)){moveNode(film,view.content);place(film,0,0,1113,669);}
        view.preview.style.visibility=drawVisible?"visible":"collapse";
        if(!mode)view.title.text="抽奖";
        view.ticket.text=String(pool&&pool.ticket_name||"抽奖券")+"  "+number(pool&&pool.tickets);
        view.points.text="商城积分  "+number(snapshot&&snapshot.shop_points);
        view.starjoy.text="星悦积分  "+number(snapshot&&snapshot.starjoy_points);
        fit();
    }
    // Preview is presentation only: cards retain the controller's click/hover bindings.
    function prizePreview(host,data) {
        var model=cfg.LotteryGW2Data&&cfg.LotteryGW2Data.preview;if(!valid(host)||!model)return;
        var cards=host.Children().filter(function(card){return card.BHasClass("LotteryDetailRow");});
        if(!cards.length)return;
        var pool=data&&(data.selected_pool||data)||{},poolId=String(data&&data.selected_pool_id||pool.id||selected);
        host.AddClass("LotteryGW2PrizeGroup");
        var groups=model.Groups(cards.map(function(card){return card.__lotteryItem||{};}),pool),lookup=[];
        cards.forEach(function(card){lookup.push({item:card.__lotteryItem,card:card});});
        // info() is called once before business cards exist and once after assembly.
        host.Children().forEach(function(node){if(node.BHasClass("LotteryGW2PrizeBar")||node.BHasClass("LotteryGW2PrizeGrid"))node.DeleteAsync(0);});
        prizeGroups=[];
        groups.forEach(function(group){
            var bar=make("Button",host,"","LotteryGW2PrizeBar"),grid=make("Panel",host,"","LotteryGW2PrizeGrid");bar.hittestchildren=false;grid.hittest=false;grid.hittestchildren=false;
            var name=label(bar,"",({n:"普通 N",r:"稀有 R",sr:"史诗 SR",ssr:"传说 SSR",ur:"至臻 UR"}[group.id]||group.label),14,5,134,26,20),odds=label(bar,"",group.percent===undefined?"单抽概率未公布":String(group.percent)+"%",148,6,300,25,18,"#d6ba79");
            var total=label(bar,"",String(group.count)+" 种奖励",803,6,210,25,16,"#bdb5a2"),arrow=label(bar,"","▾",1033,3,36,28,22,"#e0d5b6");style(total,{textAlign:"right"});style(arrow,{textAlign:"center"});
            var entries=[];group.items.forEach(function(item){var match=lookup.filter(function(row){return row.item===item;})[0];if(!match)return;lookup.splice(lookup.indexOf(match),1);var card=match.card,face=card.__lotteryPrizeFace;
                if(!face||!valid(face.host)){
                    var icon=null;walk(card,function(node){if(node.BHasClass("LotteryRewardIcon"))icon=node;});
                    var visual=make("Panel",card,"","LotteryGW2PrizeFace");place(visual,0,0,72,72);visual.hittest=false;visual.hittestchildren=false;
                    art(visual,"","slot_background",0,0,72,72);
                    if(icon){moveNode(icon,visual);place(icon,1,1,70,70);icon.visible=true;fillItemIcon(icon,item);}
                    var frame=make("Panel",visual,"","LotteryGW2PrizeFrame"),glow=make("Panel",visual,"","LotteryGW2PrizeSelected");place(frame,0,0,72,72);place(glow,0,0,72,72);
                    var count=label(visual,"",model.Quantity(item),19,1,51,24,15,"#f3e9d3");count.AddClass("LotteryGW2PrizeOwned");style(count,{textAlign:"right"});
                    face=card.__lotteryPrizeFace={host:visual,count:count};
                }
                card.Children().forEach(function(child){child.visible=child===face.host;});face.count.text=model.Quantity(item);card.AddClass("LotteryGW2PrizeSlot");card.AddClass("LotteryQuality_"+String(item.quality||"n").toUpperCase());card.SetHasClass("LotteryGW2PrizeUnowned",model.Quantity(item).split("/")[0]==="0");
                style(card,{flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",overflow:"noclip",transform:"none"});entries.push(card);
            });
            var entry={id:group.id,bar:bar,grid:grid,arrow:arrow,cards:entries,percent:group.percent,key:poolId+":"+group.id};prizeGroups.push(entry);
            bar.SetPanelEvent("onactivate",function(){if(!canAct())return;hideTooltip();prizeFolded[entry.key]=!prizeFolded[entry.key];layoutPrizeGroups();});
        });
        var rule=model.RuleText(pool);if(rule)p("LotteryInfoRules").text=rule;
        layoutPrizeGroups();prune();
    }
    function layoutPrizeGroups() {
        var y=8;prizeGroups.forEach(function(group){if(!valid(group.bar))return;var closed=!!prizeFolded[group.key],rows=Math.ceil(group.cards.length/13),height=closed?0:rows*80+10;
            place(group.bar,12,y,1084,34);group.bar.SetHasClass("Collapsed",closed);group.arrow.text=closed?"▸":"▾";
            place(group.grid,12,y+34,1084,height);group.grid.visible=!closed;
            group.cards.forEach(function(card,index){card.visible=!closed;place(card,24+(index%13)*80,y+42+Math.floor(index/13)*80,72,72);});
            y+=34+height+8;
        });
    }
    function info(name,options,data) {
        if(!ensure())return;hideTooltip();mode=name;
        p("LotteryInfoList").SetHasClass("LotteryGW2PrizeGroup",name==="details");var win=options.panel;win.RemoveClass("LotteryInfoPurple");win.AddClass("LotteryInfoGW2");
        place(p("LotteryInfoOverlay"),342,118,1113,669);style(p("LotteryInfoOverlay"),{backgroundImage:"none",backgroundColor:name==="details"?"#211d17d9":"#161711f8",border:"0px",zIndex:"12",flowChildren:"none"});
        style(view.content,{visibility:"collapse"});place(win,0,0,1113,669);style(win,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",transform:"none",flowChildren:"none",overflow:"clip"});
        ["LotteryInfoHeader","LotteryInfoTabs","LotteryPoolSelection","LotteryPoolGuarantee"].forEach(hidden);
        var hasNote=!!String(p("LotteryInfoNote")&&p("LotteryInfoNote").text||""),bodyTop=hasNote?64:18,bodyHeight=570-bodyTop;
        place(p("LotteryInfoNote"),18,12,1074,44);style(p("LotteryInfoNote"),{visibility:hasNote?"visible":"collapse",backgroundImage:"none",backgroundColor:"transparent",border:"0px",fontSize:"18px",color:"#b7c8c1",whiteSpace:"normal",textShadow:"none"});
        place(p("LotteryInfoBody"),0,bodyTop,1113,bodyHeight);style(p("LotteryInfoBody"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        place(p("LotteryInfoList"),0,0,1113,bodyHeight);style(p("LotteryInfoList"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:name==="details"||name==="update"?"none":"down",overflow:"squish scroll"});
        place(p("LotteryInfoFooter"),0,580,1113,88);style(p("LotteryInfoFooter"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        p("LotteryInfoFooter").Children().forEach(function(c){if(c.paneltype==="Image")c.visible=false;});
        place(p("LotteryInfoRules"),18,0,876,84);style(p("LotteryInfoRules"),{fontSize:"17px",whiteSpace:"normal",color:"#b8b29f"});
        hidden("LotteryInfoConfirm");hidden("RHHistoryColumns");hidden("LotteryCelestialFooter");compactCards(p("LotteryInfoList"));
        if(name==="details")prizePreview(p("LotteryInfoList"),data);
        if(name==="history")p("LotteryInfoList").Children().forEach(function(row){if(row.BHasClass("RHHistoryRow"))style(row,{backgroundImage:"none",border:"0px",borderBottom:"1px solid #504d3e"});});
        if(name==="reward")p("LotteryInfoList").Children().forEach(function(child){if(child.BHasClass("LotteryDetailIcon")){place(child,20,0,120,120);walk(child,function(n){if(n.BHasClass("LotteryRewardIcon")){place(n,0,0,120,120);fillItemIcon(n,n.__lotteryItem);}});}else if(child.BHasClass("LotteryDetailDescription"))place(child,20,136,1060,bodyHeight-136);});
        var names={details:"奖池详情",history:"抽奖记录",announcement:"开奖公告",update:"奖励更新公告",reward:p("LotteryInfoTitle")&&p("LotteryInfoTitle").text||"奖励详情",firstgift:"首充礼包",privilege:"礼包特权"};view.title.text=names[name]||"功能提示";sidebar();
    }
    function tooltipRect(node) {var at=node.GetPositionWithinWindow();return {x:at.x,y:at.y,width:node.actuallayoutwidth*scale,height:node.actuallayoutheight*scale};}
    function cancelTooltipHide(){tipEpoch++;if(tipHideJob!==null&&$.CancelScheduled)$.CancelScheduled(tipHideJob);tipHideJob=null;}
    function tooltipOverflows(){return alive()&&view&&valid(view.tipDescription)&&valid(view.tipScroll)&&view.tipDescription.actuallayoutheight>view.tipScroll.actuallayoutheight+1;}
    function cursorInsideTooltipRegion(node){if(!valid(node)||!GameUI.GetCursorPosition)return false;var at=GameUI.GetCursorPosition(),box=tooltipRect(node);return at&&at[0]>=box.x&&at[0]<box.x+box.width&&at[1]>=box.y&&at[1]<box.y+box.height;}
    function hideTooltip() {cancelTooltipHide();tipAnchor=null;if(view&&valid(view.tooltip))view.tooltip.visible=false;if(tipDismiss)tipDismiss.Hidden();}
    function requestTooltipHide(){
        if(!canAct()||!view||!valid(view.tooltip)||!view.tooltip.visible||!tooltipOverflows())return false;
        cancelTooltipHide();var epoch=tipEpoch;
        tipHideJob=$.Schedule(.15,function(){if(!alive()||epoch!==tipEpoch)return;tipHideJob=null;if(cursorInsideTooltipRegion(tipAnchor)||cursorInsideTooltipRegion(view.tooltip))return;hideTooltip();});
        return true;
    }
    function tooltip(item,anchor) {
        if(!ensure()||!valid(anchor))return false;if(!canAct()){hideTooltip();return true;}if(!tipDismiss.CanShow(anchor))return true;item=item||{};
        cancelTooltipHide();tipAnchor=anchor;if(view.tipScroll.ScrollToTop)view.tipScroll.ScrollToTop();
        var lines=[String(item.description||"暂无效果说明")];if(item.duration_text)lines.push("期限："+item.duration_text);if(item.duplicate_points!==undefined&&item.duplicate_points!==null)lines.push("重复转化："+item.duplicate_points+" "+((item.converted_currency||item.duplicate_currency)==="shop_points"?"商城积分":"星悦积分"));
        if(item.count!==undefined||item.quantity!==undefined)lines.push("本次获得："+number(item.count===undefined?item.quantity:item.count));
        if(item.duplicate===true||Number(item.duplicate)===1)lines.push("本次已转化 "+number(item.converted_points)+" "+((item.converted_currency||item.duplicate_currency)==="shop_points"?"商城积分":"星悦积分"));
        view.tipIconStage.RemoveAndDeleteChildren();var tipIcon=cfg.SurvivalRewardPresentation.CreateIcon(view.tipIconStage,item,"LotteryGW2TooltipIcon");if(tipIcon){place(tipIcon,0,0,48,48);fillItemIcon(tipIcon,item);}prune();
        view.tipName.text=String(item.name||item.id||"道具");view.tipState.text=String(item.quality||"").toUpperCase()+(item.duration_text?" · "+item.duration_text:"");
        style(view.tipName,{color:cfg.SurvivalRewardPresentation.NameColor(item.quality)});view.tipDescription.text=lines.join("\n");view.tipCount.text="拥有 "+quantity(item);
        var lineCount=0;lines.join("\n").split("\n").forEach(function(line){lineCount+=Math.max(1,Math.ceil(line.length/17));});
        var h=Math.max(212,Math.min(490,145+lineCount*23));
        var cp=p("LotteryMainCanvas").GetPositionWithinWindow(),at=anchor.GetPositionWithinWindow(),sx=(p("LotteryMainCanvas").actualuiscale_x||1)*scale,sy=(p("LotteryMainCanvas").actualuiscale_y||1)*scale;
        var x=(at.x-cp.x)/sx+(anchor.actuallayoutwidth||72)+12,y=(at.y-cp.y)/sy;if(x+366>1508)x=(at.x-cp.x)/sx-378;x=Math.max(28,Math.min(1142,x));y=Math.max(25,Math.min(839-h,y));
        place(view.tooltip,x,y,366,h);place(view.tipShadow,0,0,366,h);place(view.tipBacking,0,0,366,h);place(p("LotteryGW2TooltipFrame"),0,0,366,h);place(view.tipScroll,22,98,322,h-144);place(view.tipCount,22,h-46,322,24);view.tooltip.visible=true;tipDismiss.Shown(anchor);return true;
    }
    var originalDialog=R&&R.LotteryDialog,originalReward=R&&R.RewardCard,presentation=cfg.SurvivalRewardPresentation,originalIcon=presentation&&presentation.CreateIcon;
    function iconWrapper(parent,item,className){var icon=originalIcon.call(presentation,parent,item,className);return alive()&&lotteryParent(parent)?existingRewardArt(icon,item):icon;}
    function dialogWrapper(name,options){info(name,options);}
    function rewardWrapper(card,item){card.__lotteryItem=item;if(originalReward)originalReward(card,item);compactCards(card.GetParent(),card);}
    if(R){R.LotteryDialog=dialogWrapper;R.RewardCard=rewardWrapper;}
    if(presentation&&originalIcon)presentation.CreateIcon=iconWrapper;
    cfg.SurvivalPurpleLottery={
        Apply:apply,Info:info,Compact:compactCards,StyleTabs:function(){sidebar();},IsAlive:alive,
        Pools:function(rows,id){if(!alive())return;pools=rows||[];selected=String(id||"map");sidebar();},
        Snapshot:function(data){if(!alive())return;snapshot=data;previews();apply();},
        Open:function(){if(!alive())return;opened=true;mode="";apply();if(view&&valid(view.root))view.root.visible=true;},
        Close:function(){if(!alive())return;opened=false;mode="";hideTooltip();if(view&&valid(view.root))view.root.visible=false;},
        CloseInfo:function(){if(!alive())return;mode="";hideTooltip();apply();},
        Content:function(){return ensure()?view.content:null;},Fit:fit,Tooltip:tooltip,HideTooltip:hideTooltip,RequestTooltipHide:requestTooltipHide,
        Dispose:function(){
            if(disposed)return;hideTooltip();if(tipDismiss)tipDismiss.Dispose();
            if(R&&R.LotteryDialog===dialogWrapper)R.LotteryDialog=originalDialog;if(R&&R.RewardCard===rewardWrapper)R.RewardCard=originalReward;
            if(presentation&&presentation.CreateIcon===iconWrapper)presentation.CreateIcon=originalIcon;
            // Restore original business nodes before deleting any presentation hosts.
            moved.forEach(function(e){if(valid(e.node)&&valid(e.parent)){e.node.SetParent(e.parent);if(valid(e.next)&&e.next.GetParent()===e.parent&&e.parent.MoveChildBefore)e.parent.MoveChildBefore(e.node,e.next);}});moved=[];
            owned.slice().reverse().forEach(function(n){if(valid(n))n.DeleteAsync(0);});owned=[];
            if(valid(p("LotteryMainCanvas")))p("LotteryMainCanvas").RemoveClass("LotteryGW2");if(valid(p("LotteryWindow")))p("LotteryWindow").RemoveClass("LotteryGW2Root");view=null;disposed=true;if(valid(life))life.DeleteAsync(0);
        },
        Inspect:function(){return {alive:alive(),view:!!view,open:opened,mode:mode,pools:pools.length,poolIds:pools.map(function(pool){return String(pool.id);}),selected:selected,hasSnapshot:!!snapshot,canvas:[1536,864],content:[342,118,1113,669],movedCount:moved.filter(function(e){return valid(e.node);}).length,trackedOwned:owned.length,trackedMoved:moved.length,prizeGroups:prizeGroups.filter(function(g){return valid(g.bar);}).map(function(g){return {id:g.id,count:g.cards.length,percent:g.percent,collapsed:!!prizeFolded[g.key]};}),scale:scale};}
    };
    apply();
})();
