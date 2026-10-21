(function () {
    "use strict";
    // Presentation only. The existing controller owns requests, balances and layers.
    var cfg = GameUI.CustomUIConfig(), root = $.GetContextPanel(), U = cfg.SurvivalUI, R = cfg.RemainingHandoff;
    if (cfg.SurvivalPurpleLottery && cfg.SurvivalPurpleLottery.Dispose) cfg.SurvivalPurpleLottery.Dispose();
    var disposed = false, life = $.CreatePanel("Panel", root, ""), view = null, nodes = {}, moved = [], owned = [], tipDismiss = null;
    var mode = "", pools = [], selected = "map", snapshot = null, opened = false, scale = 1, tabKey = "", previewKey = "", prizeFolded = {}, prizeGroups = [];
    var tipAnchor = null, tipHideJob = null, tipEpoch = 0, ticketHelpOpen = false;
    // Coordinates are local to the accepted 1672 x 941 canvas, never screen pixels.
    var layout={canvas:[1672,941],header:[35,45,1608,74],sidebar:[35,123,299,746],footer:[334,804,1309,65],content:[334,123,1309,681],info:[334,123,1309,746]};
    // The selected Emerald controls use installed Valve artwork only. This
    // release keeps the original per-pool scenes and cinematic movies.
    // These are decorative resources; rewards, tickets and requests stay owned
    // by the existing controller and shared item-resource registry.
    var forest={primary:"s2r://panorama/images/dota_plus/relic_agi_button_psd.vtex",secondary:"s2r://panorama/images/hud/reborn/buyback_button_psd.vtex",selected:"s2r://panorama/images/textures/glassbutton_teal_psd.vtex",sidebar:"s2r://panorama/images/dota_plus/dota_plus_background_texture_large_png.vtex",divider:"s2r://panorama/images/events/crownfall/buttons/emblem_1_png.vtex",emblem:"s2r://panorama/images/events/aghanim/reward_type_treasure_icon_png.vtex"};
    var poolArt={map:"s2r://panorama/images/econ/tools/plus_spring_2021_treasure_large_png.vtex",cultivation:"s2r://panorama/images/econ/tools/fall_2020_treasure_large_png.vtex",dragon_knight:"s2r://panorama/images/econ/tools/plus_fall_2022_treasure_large_png.vtex",summer:"s2r://panorama/images/econ/tools/plus_winter_2022_treasure_large_png.vtex"};
    function poolBackground(id){var key=["map","cultivation","dragon_knight","summer"].indexOf(id)>=0?id:"map";return "file://{images}/custom_game/lottery_cinematic_v1/"+key+".png";}
    life.visible = false;
    function valid(n) { return n && (!n.IsValid || n.IsValid()); }
    function alive() { return !disposed && valid(root) && valid(life); }
    function remember(n) { if (!valid(n)) return; if (n.id) nodes[n.id] = n; n.Children().forEach(remember); }
    // Compiled-layout traversal can stop finding controls after SetParent.
    remember(root);
    function p(id) { if (!alive()) return null; if (valid(nodes[id])) return nodes[id]; var n = root.FindChildTraverse(id); if (!valid(n)) return null; nodes[id] = n; return n; }
    function style(n, values) { if (valid(n)) Object.keys(values).forEach(function (k) { n.style[k] = values[k]; }); }
    function place(n, x, y, w, h) { style(n, {position:x + "px " + y + "px 0px", width:w + "px", height:h + "px", margin:"0px", padding:"0px", horizontalAlign:"left", verticalAlign:"top", ignoreParentFlow:"true"}); }
    function fillItemIcon(icon,item){var presentation=cfg.SurvivalRewardPresentation;if(presentation&&presentation.FillIcon)presentation.FillIcon(icon,item);else if(valid(icon)&&icon.SetScaling)icon.SetScaling("stretch-to-cover-preserve-aspect");
        // The shared registry decorates inventory icons with rarity plates.
        // R5 owns its thin outer well; preserve the canonical transparent art.
        style(icon,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none"});return icon;}
    function bindTooltipIcon(card,source,item){
        for(var owner=source.GetParent();valid(owner);owner=owner.GetParent()){owner.hittestchildren=true;if(owner===card)break;}
        card.SetPanelEvent("onmouseover",function(){});card.SetPanelEvent("onmouseout",function(){});
        source.hittest=true;source.hittestchildren=false;
        source.SetPanelEvent("onmouseover",function(){if(!card.BHasClass("LotteryCardCovered"))tooltip(item,source);});
        source.SetPanelEvent("onmouseout",function(){if(!requestTooltipHide(source))hideTooltip();});
    }
    function walk(n, fn) { if (!valid(n)) return; fn(n); n.Children().forEach(function (c) { walk(c, fn); }); }
    function make(type, parent, id, cls) { var n = $.CreatePanel(type, parent, id || ""); if (id) nodes[id] = n; if (cls) n.AddClass(cls); owned.push(n); return n; }
    function label(parent, id, text, x, y, w, h, size, color) { var n = make("Label", parent, id, "LotteryGW2Label"); n.text = text; n.hittest = false; place(n,x,y,w,h); style(n,{fontSize:size + "px",color:color || "#eaddc4",textShadow:"#000000 0px 0px 2px 4.0"}); return n; }
    function asset(key) { var data=cfg.LotteryGW2Data,row=data&&data.assets&&data.assets[key];return row&&row.file||""; }
    function skin(n,key) { style(n,{backgroundImage:'url("' + asset(key) + '")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",backgroundColor:"transparent",border:"0px"}); }
    function art(parent,id,key,x,y,w,h) { var n=make("Panel",parent,id,"LotteryGW2Art"); n.hittest=false; n.hittestchildren=false; place(n,x,y,w,h); skin(n,key); return n; }
    function surface(parent,id,box,color){var n=make("Panel",parent,id,"LotteryGW2Surface");place(n,box[0],box[1],box[2],box[3]);style(n,{backgroundImage:"none",backgroundColor:color});n.hittest=false;n.hittestchildren=false;return n;}
    function nativeArt(parent,id,uri,x,y,w,h){var n=make("Panel",parent,id,"LotteryGW2NativeArt");place(n,x,y,w,h);style(n,{backgroundImage:'url("'+uri+'")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat"});n.hittest=false;n.hittestchildren=false;return n;}
    function wellStyle(n){n.AddClass("LotteryGW2ItemWell");style(n,{backgroundImage:'url("s2r://panorama/images/hud/reborn/inventory_item_well_psd.vtex")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",backgroundColor:"#171b18",border:"1px solid #9b8c62",overflow:"clip"});return n;}
    function itemWell(parent,x,y,w,h,id){var n=make("Panel",parent,id||"","");place(n,x,y,w,h);n.hittest=false;n.hittestchildren=false;return wellStyle(n);}
    function qualityWell(well,item){var resources=cfg.SurvivalItemResources;if(valid(well)&&resources&&resources.ApplyBackground)resources.ApplyBackground(well,item);return well;}
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
        if (!viewport) { style(p("LotteryMainCanvas"),{opacity:"0"});style(view.resultCanvas,{opacity:"0"});return false; }
        scale=Number(U.Fit(p("LotteryMainCanvas"),root,layout.canvas[0],layout.canvas[1],{reference:[1920,1080]})) || 1;
        U.Fit(view.resultCanvas,root,layout.canvas[0],layout.canvas[1],{reference:layout.canvas.slice()});
        style(p("LotteryMainCanvas"),{opacity:"1",transformOrigin:"50% 50%"});
        style(view.resultCanvas,{opacity:"1",transformOrigin:"50% 50%"});
        if(cfg.LotteryCinematic&&cfg.LotteryCinematic.Resize)cfg.LotteryCinematic.Resize(viewport.width,viewport.height);
        return true;
    }
    function ensure() {
        // A cached view belongs to its original HUD lifetime. Controller reload
        // can call this API before the next presentation script is installed.
        if (!alive()) return null;
        var canvas=p("LotteryMainCanvas"),window=p("LotteryWindow"); if(!valid(canvas)||!valid(window)||!U) return null;
        if (view) return valid(view.root)?view:null;
        canvas.RemoveClass("LotteryPurple"); canvas.RemoveClass("MenuV10Page"); canvas.AddClass("LotteryV10"); canvas.AddClass("LotteryGW2");canvas.AddClass("LotteryGW2Reborn");
        window.RemoveClass("LotteryV10Root"); window.AddClass("LotteryGW2Root");window.AddClass("LotteryCurrentVersion");window.AddClass("LotteryGW2ForestTheme");
        style(canvas,{width:"1672px",height:"941px",position:"0px 0px 0px",horizontalAlign:"center",verticalAlign:"center",transformOrigin:"50% 50%",margin:"0px",padding:"0px",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",flowChildren:"none",overflow:"noclip"});
        var shell=make("Panel",canvas,"LotteryGW2Root","LotteryGW2Shell"); place(shell,0,0,1672,941);
        surface(shell,"LotteryGW2Background",[35,45,1608,824],"#10231b");
        // The original carousel paints under both the sidebar and footer. No
        // composite reference screenshot or patched RGB surface is used here.
        move("LotterySceneBackground",shell);move("LotterySceneShade",shell);
        // Keep the original scene's subject anchored to the right content area.
        // Its own left edge blends into an extension of that same original
        // resource under the sidebar. Shared textures are not copied/repainted.
        ["map","cultivation","dragon_knight","summer"].forEach(function(id){
            var page=p("LotteryScenePage_"+id);if(!valid(page))return;
            var uri='url("'+poolBackground(id)+'")';
            // Alpha applies to the scene extension, independently of all controls.
            style(page,{backgroundImage:"none"});
            var extension=make("Panel",page,"","LotteryGW2SceneExtension");place(extension,0,0,1608,746);
            style(extension,{backgroundImage:uri,backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat",opacity:"0.25"});extension.hittest=false;extension.hittestchildren=false;
            var subject=make("Panel",page,"","LotteryGW2SceneSubject");place(subject,299,0,1309,746);style(subject,{backgroundImage:uri,backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat",opacityMask:'url("file://{images}/custom_game/lottery_final_v1/scene_blend.svg")'});subject.hittest=false;subject.hittestchildren=false;
        });
        surface(shell,"LotteryGW2SidebarSkin",layout.sidebar,"#091217f5");
        var sideTexture=nativeArt(shell,"LotteryGW2SidebarTexture",forest.sidebar,35,123,299,746);style(sideTexture,{backgroundSize:"cover",backgroundPosition:"center",opacity:"0.25"});
        surface(shell,"LotteryGW2FooterSkin",layout.footer,"#111f18ff");
        surface(shell,"LotteryGW2HeaderSkin",layout.header,"#101d18ee");
        surface(shell,"LotteryGW2HeaderShade",[35,46,1608,72],"#07101770");
        surface(shell,"LotteryGW2HeaderTopRule",[35,45,1608,1],"#a7c9a390");
        surface(shell,"LotteryGW2HeaderRule",[35,118,1608,1],"#000000bb");
        var mainTopRule=surface(shell,"LotteryGW2MainTopRule",[334,123,1309,2],"#a7c9a388");style(mainTopRule,{opacity:"0.6"});
        surface(shell,"LotteryGW2SidebarRule",[333,123,1,746],"#b0a17c40");
        surface(shell,"LotteryGW2FooterRule",[334,804,1309,1],"#b1a77845");
        ["LotteryGW2SidebarSkin","LotteryGW2SidebarTexture","LotteryGW2FooterSkin","LotteryGW2HeaderSkin","LotteryGW2HeaderShade","LotteryGW2HeaderTopRule","LotteryGW2HeaderRule","LotteryGW2MainTopRule","LotteryGW2SidebarRule","LotteryGW2FooterRule"].forEach(function(id){style(p(id),{zIndex:"3"});});
        // R5 has independent subtle edge rules, not a metal perimeter. Keep
        // this empty layer anchor for the existing details/tooltip lifetime.
        var officialFrame=make("Panel",shell,"LotteryGW2OfficialFrame","LotteryGW2OfficialFrame");place(officialFrame,35,45,1608,824);
        style(officialFrame,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",zIndex:"20"});
        officialFrame.hittest=false;officialFrame.hittestchildren=false;
        var header=make("Panel",shell,"LotteryGW2Header"); place(header,35,45,1608,74);style(header,{zIndex:"4"});
        var sidebarPanel=make("Panel",shell,"LotteryGW2Sidebar"); place(sidebarPanel,35,123,299,746);style(sidebarPanel,{zIndex:"4"});
        var content=make("Panel",shell,"LotteryGW2Content"); place(content,334,123,1309,681); style(content,{overflow:"clip",flowChildren:"none",zIndex:"2"});
        // Result and reveal surfaces belong to the viewport, outside the fitted
        // menu. Their artwork fills every aspect ratio; controls retain one fit.
        var fullscreen=make("Panel",window,"LotteryGW2Fullscreen","LotteryGW2Fullscreen");
        style(fullscreen,{position:"0px 0px 0px",width:"100%",height:"100%",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top",flowChildren:"none",overflow:"clip",zIndex:"20",backgroundSize:"cover",backgroundPosition:"center",backgroundRepeat:"no-repeat"});
        fullscreen.hittest=true;fullscreen.visible=false;
        var resultShade=make("Panel",fullscreen,"LotteryGW2ResultShade");
        // Native Panorama composites these scenes brighter than the HTML
        // preview. Use the native-reviewed opacity, independently of controls.
        style(resultShade,{width:"100%",height:"100%",backgroundColor:"#020806",opacity:"0.995",zIndex:"1"});resultShade.hittest=false;resultShade.hittestchildren=false;
        var resultCanvas=make("Panel",fullscreen,"LotteryGW2ResultCanvas","LotteryGW2ResultCanvas");
        style(resultCanvas,{width:"1672px",height:"941px",position:"0px 0px 0px",horizontalAlign:"center",verticalAlign:"center",transformOrigin:"50% 50%",margin:"0px",padding:"0px",flowChildren:"none",overflow:"noclip",zIndex:"2"});
        var detail=make("Panel",shell,"LotteryGW2DetailLayer"); place(detail,0,0,1672,941); detail.hittest=false;style(detail,{zIndex:"8"});
        // Retain the shared presentation anchor when the modal manager raises
        // this ancestry; edge rules stay with their own menu surfaces.
        officialFrame.SetParent(detail);
        // UILayers raises the details ancestry. Keep its tooltip in that same
        // layer so the authoritative details panel cannot cover the tooltip.
        var tooltip=make("Panel",detail,"LotteryGW2Tooltip","LotteryGW2Tooltip"); tooltip.hittest=false; tooltip.hittestchildren=false; tooltip.visible=false;
        style(tooltip,{zIndex:"100",flowChildren:"none"});
        var tipSkin=cfg.SurvivalBlackLionMarket.SkinTooltip(tooltip);tipSkin.Resize(368,340);
        var tipIconStage=itemWell(tooltip,20,22,48,48,"LotteryGW2TooltipIconStage");
        var tipTitleRow=make("Panel",tooltip,"LotteryGW2TooltipTitleRow");place(tipTitleRow,80,22,264,48);tipTitleRow.hittest=false;tipTitleRow.hittestchildren=false;
        var tipName=label(tipTitleRow,"LotteryGW2TooltipName","",0,0,264,48,21,"#f0dfb8");
        style(tipName,{width:"fit-children",height:"fit-children",maxWidth:"264px",horizontalAlign:"left",verticalAlign:"center",whiteSpace:"nowrap",textOverflow:"shrink"});
        var tipState=label(tooltip,"LotteryGW2TooltipState","",80,67,264,24,16,"#b5bfbb");
        var tipScroll=make("Panel",tooltip,"LotteryGW2TooltipScroll"); place(tipScroll,22,116,322,178); style(tipScroll,{flowChildren:"down",overflow:"squish scroll"});
        var tipDescription=label(tipScroll,"LotteryGW2TooltipDescription","",0,0,316,178,18,"#e0d6c5"); style(tipDescription,{height:"fit-children",ignoreParentFlow:"false",whiteSpace:"normal"});
        var tipCount=label(tooltip,"LotteryGW2TooltipQuantity","",22,294,322,24,17,"#b5bfbb");
        [tipName,tipState,tipDescription,tipCount].forEach(function(node){style(node,{textShadow:"none"});});
        style(tipDescription,{fontSize:"17px",lineHeight:"24px",color:"#d7d9cb",textOverflow:"clip"});
        view={root:shell,header:header,sidebar:sidebarPanel,content:content,fullscreen:fullscreen,resultCanvas:resultCanvas,detailLayer:detail,tooltip:tooltip,tipSkin:tipSkin,tipName:tipName,tipState:tipState,tipDescription:tipDescription,tipCount:tipCount,tipScroll:tipScroll,tipIconStage:tipIconStage,tabs:[]};
        view.sceneWash=surface(content,"LotteryGW2SceneWash",[0,0,1309,681],"gradient(linear, 0% 0%, 100% 0%, from(#101119f7), color-stop(.65,#12131b21), to(#12131b21))");style(view.sceneWash,{zIndex:"1"});
        var floorWash=surface(content,"LotteryGW2FloorWash",[0,0,1309,681],"gradient(linear, 0% 0%, 0% 100%, from(rgba(12,18,24,0)), color-stop(0.4,rgba(12,18,24,0)), color-stop(0.82,rgba(12,18,24,0.94)), to(rgba(12,18,24,0.999)))");style(floorWash,{zIndex:"1"});
        nativeArt(content,"LotteryGW2ForestDivider",forest.divider,58,164,340,24);
        view.eyebrow=label(p("LotteryHeroCopy"),"LotteryGW2Eyebrow","常驻珍藏 · LUCKY COLLECTION",4,0,500,22,13,"#a7c9a3");style(view.eyebrow,{letterSpacing:"3px",textOverflow:"clip"});
        view.sidebarHeading=label(shell,"LotteryGW2SidebarHeading","珍 藏 奖 池",65,152,251,22,12,"#9aa6a9");
        nativeArt(shell,"LotteryGW2SidebarEmblem",forest.emblem,140,743,88,88).style.opacity="0.22";
        view.sidebarNote=label(shell,"LotteryGW2SidebarNote","每一次相遇 · 皆是惊喜",35,837,299,20,10,"#7f908d");style(view.sidebarNote,{textAlign:"center"});
        [view.sidebarHeading,view.sidebarNote,p("LotteryGW2SidebarEmblem")].forEach(function(n){style(n,{zIndex:"4"});});
        tooltipGuard();
        tooltip.SetPanelEvent("onmouseover",function(){if(tooltipOverflows())cancelTooltipHide();else if(tipDismiss)tipDismiss.Dismiss();});
        tooltip.SetPanelEvent("onmouseout",function(){if(!requestTooltipHide(false))hideTooltip();});
        surface(header,"LotteryGW2HeaderDivider",[110,20,1,34],"#a7c9a344");
        // Natural glyph boxes share the header's 37px center line. Fixed label
        // heights and native shrink make the arrow/caption appear misaligned.
        view.title=label(header,"LotteryGW2Title","抽奖",129,0,560,74,34,"#f1eadb");
        style(view.title,{height:"fit-children",verticalAlign:"center",fontWeight:"medium",whiteSpace:"nowrap",textOverflow:"clip",textShadow:"none",transform:"none"});
        view.headerSubtitle=label(header,"LotteryGW2HeaderSubtitle","珍藏 · COLLECTION",140,30,340,22,13,"#b0b9b6");
        view.back=button(header,"LotteryGW2Back","返回",function(){if(mode)invoke("CloseInfo");else invoke("Close");});place(view.back,22,15,82,44);
        var backCaption=view.back.Children()[0];place(backCaption,24,0,54,44);
        style(backCaption,{height:"fit-children",horizontalAlign:"left",verticalAlign:"center",fontSize:"22px",fontWeight:"medium",whiteSpace:"nowrap",textOverflow:"clip",textShadow:"none",transform:"none"});
        var backIcon=nativeArt(view.back,"LotteryGW2BackIcon","s2r://panorama/images/control_icons/arrow_solid_left_png.vtex",4,12,12,20);style(backIcon,{backgroundSize:"contain",backgroundPosition:"center"});
        view.ticket=label(header,"LotteryGW2TicketBalance","抽奖券 —",708,21,340,34,25,"#e6dfd0");
        style(view.ticket,{whiteSpace:"nowrap",textOverflow:"shrink"});
        view.ticketHost=make("Panel",header,"LotteryGW2TicketCurrency");place(view.ticketHost,1135,8,384,58);style(view.ticketHost,{flowChildren:"none",overflow:"clip"});view.ticketHost.hittest=false;view.ticketHost.hittestchildren=true;
        view.ticket.SetParent(view.ticketHost);place(view.ticket,298,12,34,34);style(view.ticket,{lineHeight:"34px",textAlign:"center"});view.ticket.text="—";
        view.ticketIcon=make("Panel",view.ticketHost,"LotteryGW2TicketIcon");place(view.ticketIcon,218,0,72,58);view.ticketIcon.hittest=false;view.ticketIcon.hittestchildren=false;
        if(view.ticketHost.MoveChildBefore)view.ticketHost.MoveChildBefore(view.ticketIcon,view.ticket);
        // Keep the controller's original purchase callback and current-pool
        // routing; only replace its presentation with the shop's recharge affordance.
        var purchase=move("LotteryTicketPurchase",view.ticketHost);place(purchase,340,7,44,44);purchase.AddClass("LotteryGW2Recharge");purchase.AddClass("LotteryGW2ForestUtility");purchase.hittestchildren=false;style(purchase,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none"});
        purchase.Children().forEach(function(c){c.visible=false;});
        var purchaseSurface=surface(purchase,"LotteryGW2PurchaseSurface",[0,0,44,44],"gradient(linear,0% 0%,0% 100%,from(#354f3c),to(#1c3025))");purchaseSurface.AddClass("LotteryGW2UtilitySurface");style(purchaseSurface,{border:"1px solid #789976",borderRadius:"50%",boxShadow:"#00000088 0px 2px 5px 0px"});
        var plus=make("Image",purchase,"LotteryGW2PurchasePlus","LotteryGW2RechargeIcon");plus.SetImage("file://{images}/control_icons/24px/plus.svg");plus.hittest=false;
        place(plus,7,7,30,30);
        move("LotteryCloseButton",header); place(p("LotteryCloseButton"),1547,15,44,44);p("LotteryCloseButton").AddClass("LotteryGW2ForestUtility");style(p("LotteryCloseButton"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px"});p("LotteryCloseButton").Children().forEach(function(c){c.visible=false;});
        var closeSurface=surface(p("LotteryCloseButton"),"LotteryGW2CloseSurface",[0,0,44,44],"transparent");closeSurface.AddClass("LotteryGW2UtilitySurface");style(closeSurface,{border:"1px solid transparent"});
        nativeArt(p("LotteryCloseButton"),"LotteryGW2CloseIcon","s2r://panorama/images/control_icons/x_close_png.vtex",7,7,32,32);
        view.ticketHelp=make("Button",view.ticketHost,"LotteryGW2TicketHelp","LotteryGW2TicketHelp");place(view.ticketHelp,292,13,30,32);view.ticketHelp.hittestchildren=false;
        style(view.ticketHelp,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",padding:"0px"});
        var helpIcon=make("Image",view.ticketHelp,"LotteryGW2TicketHelpIcon");helpIcon.SetImage("file://{images}/status_icons/exclamation.psd");place(helpIcon,3,4,24,24);helpIcon.hittest=false;
        view.ticketHelp.SetPanelEvent("onactivate",function(){
            if(!canAct()||ticketContentId(snapshot&&(snapshot.selected_pool||snapshot))!=="lottery_ticket")return;
            if(ticketHelpOpen){hideTicketHelp();return;}
            hideTooltip();ticketHelpOpen=true;
            $.DispatchEvent("DOTAShowTitleTextTooltip",view.ticketHelp,"普通抽奖券 · 获取渠道","每日福利：累计游玩时长和胜场奖励。<br>每周福利：累计游玩时长奖励。<br>用于地图宝箱，不支持商城购买。");
        });
        view.ticketHelp.SetPanelEvent("onmouseout",hideTicketHelp);
        ["LotteryHeroCopy","LotteryUnlockNotice","LotteryStatus"].forEach(function(id){move(id,content);});
        ["LotteryResultStage","LotteryRevealStage","LotterySkipReveal"].forEach(function(id){move(id,resultCanvas);});
        move("LotteryCelestialFooter",shell);style(p("LotteryCelestialFooter"),{zIndex:"4"});
        move("LotteryInfoOverlay",detail); move("LotteryAnnouncement",p("LotteryCelestialFooter"));
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        view.preview=make("Panel",content,"LotteryGW2Preview"); place(view.preview,58,467,576,177); style(view.preview,{zIndex:"3"});
        surface(view.preview,"LotteryGW2PreviewHeadingRule",[0,11,26,1],"#a7c9a3");
        view.previewCaption=label(view.preview,"LotteryGW2PreviewCaption","奖池珍藏",37,0,530,24,18,"#d9d4bd");
        view.previewItems=make("Panel",view.preview,"LotteryGW2PreviewItems"); place(view.previewItems,0,26,576,150);
        view.resultPool=label(resultCanvas,"LotteryGW2ResultPool","",1290,75,300,28,14,"#c4d0c9");style(view.resultPool,{textAlign:"right"});
        move("LHDetails",p("LotteryCelestialFooter"));
        var skip=p("LotterySkipAnimation");skip.Children().forEach(function(c){if(c.paneltype==="Label"){c.AddClass("LotteryGW2SkipLabel");footerCaption(c,38,74);}else c.visible=false;});
        var checkBox=surface(skip,"LotteryGW2SkipBox",[6,11,22,22],"#0c1d14");style(checkBox,{border:"1px solid #829e7e"});
        nativeArt(skip,"LotteryGW2SkipCheck","s2r://panorama/images/control_icons/checkbox_check_psd.vtex",9,14,16,16).AddClass("LotteryGW2SkipCheck");
        sidebar(); return view;
    }
    function sidebar() {
        if(!alive()||!view||!valid(view.sidebar))return;
        var signature=pools.map(function(pool){return String(pool.id)+":"+String(pool.display_name||pool.id);}).join("|");
        if(signature!==tabKey){view.sidebar.RemoveAndDeleteChildren();prune();view.tabs=[];tabKey=signature;
            pools.forEach(function(pool,index){
                var box=[14,77+index*133,270,116];
                var id=String(pool.id),b=make("Button",view.sidebar,"LotteryGW2Pool_"+id,"LotteryGW2Pool"); place(b,box[0],box[1],box[2],box[3]); b.hittestchildren=false;
                var frame=make("Panel",b,"","LotteryGW2PoolSkin");place(frame,0,0,parseFloat(b.style.width),parseFloat(b.style.height));frame.hittest=false;frame.hittestchildren=false;
                style(frame,{padding:"0px",minWidth:"0px",minHeight:"0px",backgroundImage:"none",backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",backgroundColor:"#142c22a8",border:"1px solid #a7c9a333",overflow:"clip"});
                var width=box[2],height=box[3],name=label(b,"",String(pool.display_name||id),98,33,160,30,22,"#dbe2cf");name.AddClass("LotteryGW2PoolTitle");style(name,{textAlign:"left",lineHeight:"30px",whiteSpace:"nowrap",textOverflow:"clip"});
                var poolIcon=nativeArt(b,"",poolArt[id]||forest.emblem,18,25,66,66);poolIcon.AddClass("LotteryGW2PoolIcon");style(poolIcon,{backgroundSize:"contain",backgroundPosition:"center"});
                var state=label(b,"","",98,68,160,24,11,"#a4ada7");state.AddClass("LotteryGW2PoolLock");style(state,{textAlign:"left",whiteSpace:"nowrap",textOverflow:"clip"});
                var chevron=label(b,"","›",251,48,16,26,20,"#a7c9a3");chevron.AddClass("LotteryGW2PoolChevron");
                var mark=surface(b,"",[0,18,3,height-36],"#b1c891");mark.AddClass("LotteryGW2PoolSelectionMark");var marks=[mark];
                b.SetPanelEvent("onactivate",function(){if(!canAct())return;hideTooltip();if(mode==="history")invoke("SelectHistoryPool",id);else invoke("SelectPool",id);});
                view.tabs.push({id:id,button:b,frame:frame,name:name,state:state,marks:marks});
            });
        }
        view.tabs.forEach(function(tab,index){var pool=pools[index]||{},on=tab.id===selected;tab.button.SetHasClass("Selected",on);style(tab.button,{backgroundImage:"none",backgroundColor:"transparent"});
            var locked=pool.unlocked===false;tab.state.text=locked?"未解锁  "+number(pool.unlock_progress)+" / "+number(pool.unlock_required):(pool.ticket_name||(tab.id==="cultivation"||tab.id==="dragon_knight"||tab.id==="summer"?"金色抽奖券":"普通抽奖券"));style(tab.state,{visibility:"visible"});
            place(tab.name,98,33,160,30);
            style(tab.frame,{backgroundImage:on?'url("'+forest.selected+'")':"none",backgroundColor:on?"#143526":"#050b1060",borderColor:on?"#719978":"#a5a08224"});
            tab.marks.forEach(function(mark){style(mark,{visibility:on?"visible":"collapse"});});
            style(tab.name,{color:on?"#f1eadb":"#c1cfc0",textShadow:"#000000aa 0px 1px 2px 1.0"});style(tab.state,{color:on?"#d1dbc9":"#9fb5a3",textShadow:"#00000088 0px 1px 2px 1.0"});
        });
    }
    function number(raw) { if(raw===undefined||raw===null||raw==="")return "—";var n=Number(raw);return isFinite(n)&&n>=0?String(n):"—"; }
    function ticketContentId(pool) {
        var id=String(pool&&pool.ticket_content_id||""),poolId=String(pool&&pool.id||selected);
        return id||(poolId==="cultivation"||poolId==="dragon_knight"||poolId==="summer"?"special_lottery_ticket":"lottery_ticket");
    }
    function hideTicketHelp() {
        if(ticketHelpOpen&&view&&valid(view.ticketHelp))$.DispatchEvent("DOTAHideTitleTextTooltip",view.ticketHelp);
        ticketHelpOpen=false;
    }
    function ticketIcon(node,pool) {
        var resources=cfg.SurvivalItemResources,uri=resources&&resources.Resolve(ticketContentId(pool));
        style(node,{backgroundImage:uri?'url("'+uri+'")':"none",backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat",backgroundColor:"transparent",opacityMask:"none",washColor:"none",saturation:"1",brightness:"1",opacity:"1"});
    }
    function quantity(item) {var current=number(item&&item.owned_count),max=Number(item&&item.max_owned);return current+(current!=="—"&&isFinite(max)&&max>0?"/"+max:"");}
    function previews() {
        if(!alive()||!view||!valid(view.previewItems))return;
        var rows=snapshot&&snapshot.items,items=Array.isArray(rows)?rows:rows&&typeof rows==="object"?Object.keys(rows).map(function(k){return rows[k];}):[];
        var ranks={ur:5,ssr:4,sr:3,r:2,n:1},available=items.slice().sort(function(a,b){return (ranks[String(b.quality).toLowerCase()]||0)-(ranks[String(a.quality).toLowerCase()]||0);});items=[];
        // This is the approved four-item showcase. The details view still lists
        // the complete authoritative pool; no reward or probability is removed.
        items=available.slice(0,4);
        var signature=String(snapshot&&snapshot.selected_pool_id)+":"+JSON.stringify(items);
        if(signature===previewKey)return;previewKey=signature;view.previewItems.RemoveAndDeleteChildren();prune();view.preview.visible=items.length>0;
        items.forEach(function(item,index){
            var tileWidth=111,b=make("Button",view.previewItems,"LotteryGW2Preview_"+index,"LotteryGW2PreviewCard"),quality=String(item.quality||"").toLowerCase(),presentation=cfg.SurvivalRewardPresentation;place(b,index*148,0,132,150);b.hittestchildren=false;b.__lotteryItem=item;b.AddClass("LotteryQuality_"+quality.toUpperCase());
            var well=itemWell(b,10.5,0,tileWidth,111);well.AddClass("LotteryGW2PreviewWell");
            // Keep the shared official rarity plate underneath the transparent
            // item art. The showcase has no rarity frame, badge or underline.
            var resources=cfg.SurvivalItemResources;if(resources&&resources.ApplyBackground)resources.ApplyBackground(well,item);
            style(well,{border:"0px",boxShadow:"none"});
            var icon=presentation&&presentation.CreateIcon(b,item,"LotteryGW2PreviewIcon");if(icon){place(icon,20.5,10,91,91);fillItemIcon(icon,item);}
            var itemName=label(b,"",String(item.name||item.id||""),0,120,132,30,19.5,"#dddccf");style(itemName,{whiteSpace:"nowrap",textOverflow:"ellipsis",textShadow:"#000000 0px 0px 2px 2.0"});
            var cardWidth=132;
            var nameAt=String(itemName.style.position).split(" "),nameHeight=parseFloat(itemName.style.height),nameHost=make("Panel",b,"","LotteryGW2PreviewNameHost");
            place(nameHost,0,parseFloat(nameAt[1]),cardWidth,nameHeight);nameHost.hittest=false;nameHost.hittestchildren=false;
            itemName.SetParent(nameHost);place(itemName,0,0,cardWidth,nameHeight);
            style(itemName,{width:"fit-children",height:"fit-children",maxWidth:cardWidth+"px",horizontalAlign:"center",verticalAlign:"center",textAlign:"center"});
            if(icon){var hover=make("Panel",b,"","LotteryGW2PreviewHover"),at=String(icon.style.position).split(" ");place(hover,parseFloat(at[0]),parseFloat(at[1]),parseFloat(icon.style.width),parseFloat(icon.style.height));bindTooltipIcon(b,hover,item);}
            b.SetPanelEvent("onactivate",function(){hideTooltip();invoke("Feature","details");});
        });
    }
    function drawStructure(b,text,cost) {
        var content=null,costHost=null,ticket=null;
        walk(b,function(n){if(!content&&n.BHasClass("ZXDrawContent"))content=n;if(!costHost&&n.BHasClass("ZXDrawCost"))costHost=n;if(!ticket&&n.BHasClass("LHDrawTicket"))ticket=n;});
        // A running map can retain the older XML while loading this renderer.
        // Reuse its business nodes and add only the missing presentation hosts.
        if(!valid(content))content=make("Panel",b,"","ZXDrawContent");else moveNode(content,b);
        if(!valid(costHost))costHost=make("Panel",content,"","ZXDrawCost");else moveNode(costHost,content);
        content.hittest=false;content.hittestchildren=false;costHost.hittest=false;costHost.hittestchildren=false;
        moveNode(text,content);moveNode(cost,costHost);moveNode(ticket,costHost);
        return {content:content,cost:costHost,ticket:ticket};
    }
    function action(id,primary) {
        var b=p(id);if(!valid(b))return;b.AddClass("LotteryGW2Action");b.AddClass("LotteryGW2NativeButton");b.SetHasClass("LotteryGW2Primary",!!primary);style(b,{backgroundImage:"none",backgroundColor:"transparent",boxShadow:"none",flowChildren:"none",borderRadius:"0px",border:"0px",overflow:"noclip"});
        b.AddClass("LotteryGW2ForestButton");
        var busy=!!(p("LotteryWindow")&&p("LotteryWindow").BHasClass("LotteryWaiting"));b.SetHasClass("LotteryGW2ForestBusy",busy);
        var draw=id==="LotterySingleButton"||id==="LotteryTenButton";
        var skins=view.actionSkins||(view.actionSkins={}),surface=skins[id];
        if(!valid(surface)){surface=skins[id]=make("Panel",b,"","LotteryGW2ButtonSurface");surface.hittest=false;surface.hittestchildren=false;var first=b.Children()[0];if(first!==surface&&b.MoveChildBefore)b.MoveChildBefore(surface,first);
            var glass=make("Panel",surface,"","LotteryGW2ButtonGlass");style(glass,{width:"100%",height:"100%",overflow:"clip"});glass.hittest=false;glass.hittestchildren=false;
            var shine=make("Panel",glass,"","LotteryGW2ButtonShine");place(shine,-100,-42,50,168);shine.hittest=false;style(shine,{backgroundColor:"#f0ffe51f"});}
        place(surface,0,0,0,0);style(surface,{width:"100%",height:"100%",zIndex:"0",backgroundImage:'url("'+(primary?forest.primary:forest.secondary)+'")',backgroundSize:"100% 100%",backgroundRepeat:"no-repeat",backgroundColor:"transparent"});
        walk(b,function(n){if(n.paneltype==="Label")style(n,{color:busy?"#d6e4d2":b.enabled===false?"#b2beb2":"#f1eadb",fontSize:"28px",lineHeight:"32px",textShadow:"#000000 0px 1px 2px 2.0"});if(n.BHasClass("ZXActionSkin")||n.BHasClass("LHDrawVisual"))n.visible=false;});
        var focusNodes=view.actionFocus||(view.actionFocus={}),focus=focusNodes[id];
        if(!valid(focus)){focus=focusNodes[id]=make("Panel",b,"","LotteryGW2DrawFocus");focus.hittest=false;focus.hittestchildren=false;style(focus,{border:"2px solid #d0ebba",backgroundColor:"transparent",zIndex:"3"});}
        place(focus,-3,-3,(draw?(parseFloat(b.style.width)||220):(primary?244:220))+6,90);
        focus.visible=id!=="LotterySingleButton";
        if(draw){
            b.AddClass("LotteryGW2RebornDraw");
            var width=parseFloat(b.style.width)||220,height=parseFloat(b.style.height)||84,text=p(id==="LotterySingleButton"?"LotterySingleText":"LotteryTenText"),cost=p(id==="LotterySingleButton"?"LotterySingleCost":"LotteryTenCost"),free=b.BHasClass("ZXFreeDraw");
            var parts=drawStructure(b,text,cost);ticketIcon(parts.ticket,snapshot&&(snapshot.selected_pool||snapshot));
            var rawCost=String(cost&&cost.text||"").replace(/^×\s*/,""),costText=free?"":"× "+rawCost;
            if(cost)cost.text=costText;
            var labelText=String(text&&text.text||"");if(labelText==="单抽"||labelText==="单次抽取")text.text="单次抽取";else if(labelText==="10连"||labelText==="十连抽取")text.text="十连抽取";
            var digits=Math.min(92,Math.max(32,costText.length*10)),costWidth=free?0:60+digits,contentWidth=width-24,contentHeight=free?32:70;
            place(parts.content,12,(height-contentHeight)/2,contentWidth,contentHeight);style(parts.content,{flowChildren:"none",transform:"none",visibility:"visible"});
            place(parts.cost,(contentWidth-costWidth)/2,34,costWidth,36);style(parts.cost,{flowChildren:"none",transform:"none",visibility:free?"collapse":"visible"});
            place(parts.ticket,0,0,52,36);style(parts.ticket,{transform:"none"});
            place(cost,60,5,digits,26);style(cost,{fontSize:"18px",lineHeight:"26px",textAlign:"left",whiteSpace:"nowrap",textOverflow:"clip",minWidth:"0px",minHeight:"0px",transform:"none"});
            // Native Labels shrink glyphs against their line box differently
            // from browsers. Center the natural text box inside the fixed row.
            place(text,0,0,contentWidth,32);style(text,{width:"fit-children",height:"32px",horizontalAlign:"center",fontSize:"28px",lineHeight:"32px",letterSpacing:"2px",textAlign:"center",whiteSpace:"nowrap",textOverflow:"clip",minWidth:"0px",minHeight:"0px",transform:"none"});
        }
    }
    function footerCaption(n,x,width) {
        // Center the natural glyph box against the 22px icons in a 44px row.
        place(n,x,0,width,44);style(n,{height:"fit-children",minWidth:"0px",minHeight:"0px",verticalAlign:"center",fontSize:"16px",lineHeight:"20px",textAlign:"left",transform:"none",color:"#c1cfbe",whiteSpace:"nowrap",textOverflow:"clip",textShadow:"none"});
    }
    function footerAction(id,x,y,width,uri) {
        var b=p(id);if(!valid(b))return;b.AddClass("LotteryGW2ForestFooterAction");place(b,x,y,width,44);b.hittestchildren=false;
        var icon=b.__lotteryForestIcon;if(!valid(icon)){
            icon=b.Children().filter(function(n){return n.BHasClass("LHDetailsIcon")||n.BHasClass("LHHistoryIcon");})[0];
            if(!valid(icon))icon=nativeArt(b,"",uri,0,11,22,22);b.__lotteryForestIcon=icon;
        }
        place(icon,0,11,22,22);style(icon,{visibility:"visible",backgroundImage:'url("'+uri+'")',backgroundSize:"contain",backgroundPosition:"center",backgroundRepeat:"no-repeat",washColor:"#b6cbb3"});icon.hittest=false;icon.hittestchildren=false;
        icon.AddClass("LotteryGW2FooterIcon");if(!uri)style(icon,{visibility:"collapse",backgroundImage:"none"});
        var captions=[];walk(b,function(n){if(n.paneltype==="Label")captions.push(n);});
        captions.forEach(function(n){moveNode(n,b);footerCaption(n,uri?30:0,width-(uri?30:0));});
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
                var well=itemWell(hostVisual,9,3,116,116),stage=make("Panel",well,"","LotteryGW2CellStage");place(stage,0,0,114,114);style(stage,{overflow:"clip"});
                var selectedFrame=make("Panel",hostVisual,"","LotteryGW2SelectedFrame");place(selectedFrame,9,3,116,116);style(selectedFrame,{border:"1px solid #e3cf95",backgroundColor:"transparent"});selectedFrame.hittest=false;
                if(icon){moveNode(icon,stage);place(icon,0,0,114,114);icon.visible=true;fillItemIcon(icon,item);}
                var nameRow=make("Panel",hostVisual,"","LotteryGW2CellNameRow");nameRow.hittest=false;nameRow.hittestchildren=false;
                if(name)moveNode(name,nameRow);else name=label(nameRow,"","",0,0,134,39,17);
                style(name,{fontSize:"17px",fontWeight:"normal",fontFamily:'"Source Han Sans SC"',color:"#e0d6c3",textAlign:"center",whiteSpace:"normal",textOverflow:"ellipsis",textShadow:"none"});name.visible=true;
                var count=label(hostVisual,"","",13,88,106,24,16,"#f1e9d8");style(count,{textAlign:"right",textShadow:"#000000 0px 1px 3px 2.0"});
                cell=card.__lotteryGW2Cell={host:hostVisual,nameRow:nameRow,name:name,count:count,stage:stage,well:well,selectedFrame:selectedFrame,icon:icon};
            }
            card.Children().forEach(function(c){if(c!==cell.host&&c!==cover)c.visible=false;});card.AddClass("LotteryGW2Cell");
            var one=result&&host.Children().length===1,cardWidth=result?(one?242:164):134,cardHeight=result?(one?287.2:188):168,iconSize=result?(one?232:154):116;
            var iconLeft=(cardWidth-iconSize)/2;
            place(card,result?(one?0:(index%5)*189):5+(index%8)*137,result?(one?0:Math.floor(index/5)*214):8+Math.floor(index/8)*178,cardWidth,cardHeight);
            place(cell.host,0,0,cardWidth,cardHeight);place(cell.well,iconLeft,3,iconSize,iconSize);place(cell.selectedFrame,iconLeft,3,iconSize,iconSize);
            var innerSize=result?(one?198:129):iconSize-2,innerOffset=(iconSize-innerSize)/2;
            place(cell.stage,innerOffset,innerOffset,innerSize,innerSize);place(cell.icon,0,0,innerSize,innerSize);
            var nameHeight=result?(one?35.2:24):39;
            place(cell.nameRow,0,result?iconSize+(one?20:10):123,cardWidth,nameHeight);style(cell.nameRow,{overflow:"clip"});
            // Native fixed-width Labels align the glyph run differently from
            // browsers. Center its natural box inside a fixed, clipped row.
            place(cell.name,0,0,cardWidth,nameHeight);style(cell.name,{width:"fit-children",maxWidth:cardWidth+"px",horizontalAlign:"center",fontSize:result?(one?22:15)+"px":"17px",lineHeight:result?(one?35.2:24)+"px":"26px",textOverflow:"clip",whiteSpace:"nowrap",textShadow:result?"#000000 0px 0px 2px 2.0":"none"});
            place(cell.count,iconLeft+4,result?iconSize-21:88,iconSize-12,result?22:24);style(cell.count,{fontSize:result?"14px":"16px"});
            if(result){
                var quality=String(item.quality||"n").toLowerCase(),presentation=cfg.SurvivalRewardPresentation,color=presentation&&presentation.NameColor?presentation.NameColor(quality):"#a7c9a3";
                style(cell.well,{backgroundImage:"none",backgroundColor:"#07101bcf",border:"1px solid "+color,boxShadow:"#00000088 0px 0px 15px 0px"});
                if(!valid(cell.rarity))cell.rarity=label(cell.host,"","",0,0,40,16,10,color);
                place(cell.rarity,iconLeft+iconSize-45,6,40,16);cell.rarity.text=quality.toUpperCase();style(cell.rarity,{color:color,textAlign:"right",textOverflow:"clip"});
            }
            qualityWell(cell.well,item);
            style(card,{flowChildren:"none",backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",overflow:"noclip",transform:"none"});
            cell.name.text=String(item.name||item.id||cell.name.text||"道具");cell.count.text=result?"×"+number(item.count===undefined?(item.quantity===undefined?1:item.quantity):item.count):quantity(item);
            if(result)bindTooltipIcon(card,cell.stage,item);
            if(cover){place(cover,0,0,cardWidth,cardHeight);wellStyle(cover);style(cover,{zIndex:"20"});}
        });
    }
    function updateFooterSkin() {
        ["LotteryGW2FooterSkin","LotteryGW2FooterRule"].forEach(function(id){style(p(id),{visibility:mode==="details"?"collapse":"visible"});});
    }
    function apply() {
        if(!ensure())return;
        var window=p("LotteryWindow");if(!valid(window))return;
        var results=window.BHasClass("LotteryResultsShown"),drawVisible=!mode&&!results;
        style(window,{width:"100%",height:"100%",position:"0px 0px 0px",horizontalAlign:"left",verticalAlign:"top",margin:"0px",padding:"0px",backgroundImage:"none",backgroundColor:"#080908b8",border:"0px",borderRadius:"0px",boxShadow:"none",flowChildren:"none",transform:"none"});
        ["LotteryCelestialHeader","LotteryPoolTabs","LotteryReadingMask"].forEach(hidden);
        style(view.content,{visibility:mode?"collapse":"visible"});
        updateFooterSkin();
        place(p("LotterySceneBackground"),35,123,1608,746);style(p("LotterySceneBackground"),{opacity:"1",zIndex:"0",overflow:"clip"});
        if(cfg.LotterySceneTransition)cfg.LotterySceneTransition.Resize(1608,746);
        place(p("LotterySceneShade"),35,123,1608,746);style(p("LotterySceneShade"),{zIndex:"1",backgroundColor:"transparent"});
        place(p("LotteryHeroCopy"),54,51,720,340);style(p("LotteryHeroCopy"),{flowChildren:"none",zIndex:"3",visibility:drawVisible?"visible":"collapse"});
        place(p("LotteryTitle"),0,31,720,67);style(p("LotteryTitle"),{visibility:"visible",fontFamily:'"Source Han Sans SC"',fontSize:"51px",fontWeight:"medium",letterSpacing:"5px",color:"#f3ead4",whiteSpace:"nowrap",textOverflow:"clip",textShadow:"#000000 0px 2px 4px 2.0"});
        place(p("LotteryTaglineBounds"),6,156,500,80);place(p("LotteryTagline"),0,0,500,80);style(p("LotteryTagline"),{fontFamily:'"Source Han Sans SC"',fontSize:"16px",lineHeight:"32px",letterSpacing:"2px",minHeight:"0px",color:"#d9d8ca",transform:"none",whiteSpace:"normal",textOverflow:"clip"});
        var pool=snapshot&&(snapshot.selected_pool||snapshot);if(pool&&pool.display_name&&String(p("LotteryTitle").text).indexOf("正在读取")!==0)p("LotteryTitle").text=String(pool.display_name);if(pool&&pool.description)p("LotteryTagline").text=String(pool.description).replace(/^(普通|金色|红色|特殊)抽奖券\s*·\s*/,"");
        var featured=view.previewItems.Children()[0];if(featured&&featured.__lotteryItem)p("LotteryTagline").text="探索珍藏之境，收获非凡奖励。\n"+String(featured.__lotteryItem.name||"")+" 等待与你相遇";
        place(p("LotteryGuaranteeRow"),6,263,650,24);style(p("LotteryGuaranteeRow"),{flowChildren:"none",backgroundColor:"transparent",visibility:"visible"});
        move("LotteryGuaranteeValue",p("LotteryGuaranteeRow"));p("LotteryGuaranteeRow").Children().forEach(function(n){n.visible=n===p("LotteryGuaranteeValue");});
        place(p("LotteryGuaranteeValue"),0,0,650,24);style(p("LotteryGuaranteeValue"),{fontSize:"11px",lineHeight:"24px",fontFamily:'"Source Han Sans SC"',color:"#adb9b7",textOverflow:"clip",whiteSpace:"nowrap",transform:"none",textShadow:"#000000 0px 1px 2px 1.0"});
        if(pool){var pityCaption=String(p("LotteryDrawPityCaption").text||"");p("LotteryGuaranteeValue").text=(pityCaption||"奖池保底以详情为准")+"  /  奖励永久保留";}
        place(p("LotteryUnlockNotice"),60,354,650,42);style(p("LotteryUnlockNotice"),{fontSize:"16px",color:"#cfbfa0",whiteSpace:"normal",textShadow:"none",zIndex:"3",visibility:drawVisible?"visible":"collapse"});
        place(p("LotteryCelestialFooter"),334,123,1309,746);style(p("LotteryCelestialFooter"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none",zIndex:"4",visibility:drawVisible?"visible":"collapse",overflow:"noclip"});p("LotteryCelestialFooter").hittest=false;
        place(p("LotterySingleButton"),757,560,244,84);place(p("LotteryTenButton"),1021,560,244,84);
        place(p("LotteryDrawPity"),1021,529,244,20);place(p("LotteryDrawPityCaptionBounds"),0,0,244,20);place(p("LotteryDrawPityCaption"),0,0,244,20);style(p("LotteryDrawPityCaption"),{fontSize:"14px",lineHeight:"20px",minHeight:"0px",textAlign:"right",transform:"none",color:"#a7c9a3",textShadow:"none"});
        footerAction("LHDetails",42,692,142,"s2r://panorama/images/control_icons/icon_info_png.vtex");footerAction("LHHistory",201,692,142,"s2r://panorama/images/control_icons/history_png.vtex");footerAction("LotteryAnnouncement",360,692,104,"");style(p("LotteryAnnouncement"),{visibility:"visible"});place(p("LotterySkipAnimation"),476,692,112,44);
        place(p("LotteryStatus"),60,402,650,44);style(p("LotteryStatus"),{fontSize:"16px",color:"#e4d8bb",whiteSpace:"normal",textShadow:"none",zIndex:"8"});
        ["LotteryTitle","LotteryTagline","LotteryUnlockNotice","LotteryDrawPityCaption","LotteryStatus"].forEach(function(id){style(p(id),{textShadow:"#000000 0px 0px 2px 4.0"});});
        ["LotteryTaglineBounds","LotteryDrawPityCaptionBounds"].forEach(function(id){style(p(id),{overflow:"noclip"});});
        ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm"].forEach(function(id){action(id,id==="LotteryTenButton"||id==="LotteryAgain");});
        ["LotterySingleCost","LotteryTenCost"].forEach(function(id){style(p(id),{visibility:"visible"});});
        ["LHDetails","LHHistory","LotteryAnnouncement","LotteryGW2Back"].forEach(function(id){var b=p(id);if(valid(b))b.AddClass("LotteryGW2Action");});
        ["LHDetails","LHHistory","LotteryAnnouncement"].forEach(function(id){walk(p(id),function(node){if(node.paneltype==="Label"&&id==="LotteryAnnouncement")node.text="活动公告";if(id==="LotteryAnnouncement"&&node.BHasClass("LotteryGW2FooterIcon"))style(node,{visibility:"collapse"});});});
        style(view.back,{visibility:mode?"visible":"collapse"});style(p("LotteryGW2HeaderDivider"),{visibility:mode?"visible":"collapse"});style(view.headerSubtitle,{visibility:mode?"collapse":"visible"});
        place(view.title,mode?129:27,0,560,74);style(view.title,{height:"fit-children",verticalAlign:"center",fontSize:"32px"});
        view.fullscreen.visible=results&&!mode;
        style(view.fullscreen,{backgroundImage:'url("'+poolBackground(selected)+'")'});
        place(p("LotteryResultStage"),0,0,1672,941);style(p("LotteryResultStage"),{backgroundImage:"none",backgroundColor:"transparent",zIndex:"6",flowChildren:"none",border:"0px"});
        place(p("LotteryResultHeading"),75,55,1200,58);style(p("LotteryResultHeading"),{fontFamily:'"Source Han Sans SC"',fontSize:"33px",fontWeight:"normal",color:"#efdbb2",textShadow:"#000000 0px 0px 2px 2.0"});
        var singleResult=p("LotteryItemList").Children().length===1;place(p("LotteryItemList"),singleResult?715:376,singleResult?270.44:231.86,singleResult?242:920,singleResult?287.2:402);style(p("LotteryItemList"),{flowChildren:"none",overflow:"noclip"});
        place(p("LotteryResultActions"),0,770,1672,84);style(p("LotteryResultActions"),{flowChildren:"none",overflow:"noclip"});place(p("LotteryConfirm"),594,0,220,84);place(p("LotteryAgain"),834,0,244,84);
        view.resultPool.text=pool&&pool.display_name||"";
        place(p("LotteryRevealStage"),0,0,1672,941);place(p("LotterySkipReveal"),1477,30,155,48);compactCards(p("LotteryItemList"));
        if(results&&!mode){move("LotteryStatus",view.resultCanvas);place(p("LotteryStatus"),40,710,1592,28);style(p("LotteryStatus"),{fontSize:"17px",letterSpacing:"3px",textAlign:"center",textShadow:"#000000 0px 0px 2px 2.0",zIndex:"8"});}
        else move("LotteryStatus",view.content);
        view.preview.style.visibility=drawVisible?"visible":"collapse";
        if(!mode)view.title.text="抽奖";
        var ticketText=number(pool&&pool.tickets),ticketWidth=Math.min(180,Math.max(28,ticketText.length*16)),ticketX=278-ticketWidth;
        view.ticket.text=ticketText;place(view.ticket,ticketX,12,ticketWidth,38);style(view.ticket,{fontSize:"27px",textOverflow:"clip"});place(view.ticketIcon,ticketX-74,6,62,47);ticketIcon(view.ticketIcon,pool);
        var purchase=p("LotteryTicketPurchase"),canPurchase=ticketContentId(pool)==="special_lottery_ticket";
        purchase.visible=canPurchase;purchase.enabled=canPurchase;purchase.hittest=canPurchase;
        view.ticketHelp.visible=ticketContentId(pool)==="lottery_ticket";view.ticketHelp.enabled=view.ticketHelp.visible;view.ticketHelp.hittest=view.ticketHelp.visible;
        if(!view.ticketHelp.visible)hideTicketHelp();
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
            var groupWidth=layout.info[2]-29;
            var total=label(bar,"",String(group.count)+" 种奖励",groupWidth-281,6,210,25,16,"#bdb5a2"),arrow=label(bar,"","▾",groupWidth-51,3,36,28,22,"#e0d5b6");style(total,{textAlign:"right"});style(arrow,{textAlign:"center"});
            var entries=[];group.items.forEach(function(item){var match=lookup.filter(function(row){return row.item===item;})[0];if(!match)return;lookup.splice(lookup.indexOf(match),1);var card=match.card,face=card.__lotteryPrizeFace;
                if(!face||!valid(face.host)){
                    var icon=null;walk(card,function(node){if(node.BHasClass("LotteryRewardIcon"))icon=node;});
                    var visual=make("Panel",card,"","LotteryGW2PrizeFace");place(visual,0,0,72,72);visual.hittest=false;visual.hittestchildren=false;
                    var well=itemWell(visual,0,0,72,72);
                    if(icon){moveNode(icon,visual);place(icon,1,1,70,70);icon.visible=true;fillItemIcon(icon,item);}
                    var glow=make("Panel",visual,"","LotteryGW2PrizeSelected");place(glow,0,0,72,72);
                    var count=label(visual,"",model.Quantity(item),19,1,51,24,15,"#f3e9d3");count.AddClass("LotteryGW2PrizeOwned");style(count,{textAlign:"right"});
                    face=card.__lotteryPrizeFace={host:visual,well:well,count:count};
                }
                if(!valid(face.well))face.well=face.host.Children().filter(function(child){return child.BHasClass("LotteryGW2ItemWell");})[0];
                qualityWell(face.well,item);
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
        var y=8,width=layout.info[2]-29,columns=Math.max(1,Math.floor((layout.info[2]-48+8)/80));
        prizeGroups.forEach(function(group){if(!valid(group.bar))return;var closed=!!prizeFolded[group.key],rows=Math.ceil(group.cards.length/columns),height=closed?0:rows*80+10;
            place(group.bar,12,y,width,34);group.bar.SetHasClass("Collapsed",closed);group.arrow.text=closed?"▸":"▾";
            place(group.grid,12,y+34,width,height);group.grid.visible=!closed;
            group.cards.forEach(function(card,index){card.visible=!closed;place(card,24+(index%columns)*80,y+42+Math.floor(index/columns)*80,72,72);});
            y+=34+height+8;
        });
    }
    function info(name,options,data) {
        if(!ensure())return;hideTooltip();mode=name;updateFooterSkin();
        view.fullscreen.visible=false;
        p("LotteryInfoList").SetHasClass("LotteryGW2PrizeGroup",name==="details");var win=options.panel;win.RemoveClass("LotteryInfoPurple");win.AddClass("LotteryInfoGW2");
        var bounds=layout.info,width=bounds[2],height=bounds[3],footerHeight=name==="details"?0:88,footerTop=height-footerHeight;
        place(p("LotteryInfoOverlay"),bounds[0],bounds[1],width,height);style(p("LotteryInfoOverlay"),{backgroundImage:"none",backgroundColor:name==="details"?"#10231bf0":"#101f19f8",border:"0px",zIndex:"12",flowChildren:"none"});
        style(view.content,{visibility:"collapse"});place(win,0,0,width,height);style(win,{backgroundImage:"none",backgroundColor:"transparent",border:"0px",boxShadow:"none",transform:"none",flowChildren:"none",overflow:"clip"});
        ["LotteryInfoHeader","LotteryInfoTabs","LotteryPoolSelection","LotteryPoolGuarantee"].forEach(hidden);
        var hasNote=!!String(p("LotteryInfoNote")&&p("LotteryInfoNote").text||""),bodyTop=hasNote?64:18,bodyHeight=footerTop-bodyTop;
        place(p("LotteryInfoNote"),18,12,width-36,44);style(p("LotteryInfoNote"),{visibility:hasNote?"visible":"collapse",backgroundImage:"none",backgroundColor:"transparent",border:"0px",fontSize:"18px",color:"#b7c8c1",whiteSpace:"normal",textShadow:"none"});
        place(p("LotteryInfoBody"),0,bodyTop,width,bodyHeight);style(p("LotteryInfoBody"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        place(p("LotteryInfoList"),0,0,width,bodyHeight);style(p("LotteryInfoList"),{backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:name==="details"||name==="update"?"none":"down",overflow:"squish scroll"});
        place(p("LotteryInfoFooter"),0,footerTop,width,footerHeight);style(p("LotteryInfoFooter"),{visibility:name==="details"?"collapse":"visible",backgroundImage:"none",backgroundColor:"transparent",border:"0px",flowChildren:"none"});
        p("LotteryInfoFooter").Children().forEach(function(c){if(c.paneltype==="Image")c.visible=false;});
        place(p("LotteryInfoRules"),18,0,width-237,84);style(p("LotteryInfoRules"),{fontSize:"17px",whiteSpace:"normal",color:"#b8b29f"});
        hidden("LotteryInfoConfirm");hidden("RHHistoryColumns");hidden("LotteryCelestialFooter");compactCards(p("LotteryInfoList"));
        if(name==="details")prizePreview(p("LotteryInfoList"),data);
        if(name==="history")p("LotteryInfoList").Children().forEach(function(row){if(row.BHasClass("RHHistoryRow")){
            style(row,{width:(width-23)+"px",backgroundImage:"none",border:"0px",borderBottom:"1px solid #504d3e"});
            row.Children().forEach(function(child){if(child.BHasClass("RHHistoryName"))style(child,{width:(width-653)+"px"});else if(child.BHasClass("RHHistoryQuality"))style(child,{position:(width-331)+"px 0px 0px"});else if(child.BHasClass("RHHistoryQuantity"))style(child,{position:(width-175)+"px 0px 0px"});});
        }});
        if(name==="reward")p("LotteryInfoList").Children().forEach(function(child){if(child.BHasClass("LotteryDetailIcon")){place(child,20,0,120,120);wellStyle(child);walk(child,function(n){if(n.BHasClass("LotteryRewardIcon")){place(n,0,0,118,118);fillItemIcon(n,n.__lotteryItem);qualityWell(child,n.__lotteryItem);}});}else if(child.BHasClass("LotteryDetailDescription"))place(child,20,136,width-40,bodyHeight-136);});
        var names={details:"奖池详情",history:"抽奖记录",announcement:"开奖公告",update:"奖励更新公告",reward:p("LotteryInfoTitle")&&p("LotteryInfoTitle").text||"奖励详情",firstgift:"首充礼包",privilege:"礼包特权"};view.title.text=names[name]||"功能提示";sidebar();
    }
    function canvasScale(node){
        var main=p("LotteryMainCanvas");for(var branch=node;valid(branch);branch=branch.GetParent()){
            if(branch===main)return scale;
            if(branch.BHasClass("LotteryGW2ResultCanvas")){var match=/scale3d\(\s*([0-9.eE+-]+)/.exec(String(branch.style.transform||""));return match&&Number(match[1])>0?Number(match[1]):scale;}
        }return scale;
    }
    function tooltipRect(node) {var at=node.GetPositionWithinWindow(),fitted=canvasScale(node);return {x:at.x,y:at.y,width:node.actuallayoutwidth*fitted,height:node.actuallayoutheight*fitted};}
    function raiseTooltip(){
        var canvas=view.tooltip.GetParent()===view.resultCanvas?view.resultCanvas:p("LotteryMainCanvas");if(!valid(canvas))return;
        for(var branch=view.tooltip;valid(branch)&&branch!==canvas;branch=branch.GetParent()){
            var parent=branch.GetParent();if(!valid(parent))break;
            var above=0;parent.Children().forEach(function(sibling){if(sibling!==branch)above=Math.max(above,Number(sibling.style.zIndex)||0);});
            // Modal layers can re-raise a sibling after this view was built.
            style(branch,{zIndex:String(Math.max(Number(branch.style.zIndex)||0,above+1))});
        }
    }
    function cancelTooltipHide(){tipEpoch++;if(tipHideJob!==null&&$.CancelScheduled)$.CancelScheduled(tipHideJob);tipHideJob=null;}
    function tooltipOverflows(){return alive()&&view&&valid(view.tipDescription)&&valid(view.tipScroll)&&view.tipDescription.actuallayoutheight>view.tipScroll.actuallayoutheight+1;}
    function cursorInsideTooltipRegion(node){if(!valid(node)||!GameUI.GetCursorPosition)return false;var at=GameUI.GetCursorPosition(),box=tooltipRect(node);return at&&at[0]>=box.x&&at[0]<box.x+box.width&&at[1]>=box.y&&at[1]<box.y+box.height;}
    function hideTooltip() {cancelTooltipHide();if(view&&valid(view.tooltip))view.tooltip.visible=false;if(tipDismiss)tipDismiss.Hidden();}
    function tooltipGuard(){
        if(!tipDismiss)tipDismiss=cfg.SurvivalTooltipDismiss.Create({panel:view.tooltip,surface:view.tipSkin.surface,getRect:tooltipRect,hide:hideTooltip,allowTooltipHover:tooltipOverflows,isAlive:alive,isVisible:function(){return canAct()&&valid(view.tooltip)&&view.tooltip.visible;}});
        return tipDismiss;
    }
    function requestTooltipHide(sourceExit){
        if(!canAct()||!view||!valid(view.tooltip))return false;
        if(sourceExit&&sourceExit!==true&&tipAnchor&&sourceExit!==tipAnchor)return true;
        if(!view.tooltip.visible||!tooltipOverflows()){
            // Match the market: a genuine source exit rearms immediately,
            // including an exit/return before the geometry watcher's next tick.
            if(sourceExit!==false&&tipDismiss){tipDismiss.Dispose();tipDismiss=null;}
            return false;
        }
        cancelTooltipHide();var epoch=tipEpoch;
        tipHideJob=$.Schedule(.15,function(){if(!alive()||epoch!==tipEpoch)return;tipHideJob=null;if(cursorInsideTooltipRegion(tipAnchor)||cursorInsideTooltipRegion(view.tooltip))return;hideTooltip();});
        return true;
    }
    function effectLines(value) {
        var source=String(value||"").replace(/\r\n?/g,"\n"),out="",depth=0;
        var attribute=/^(?:英雄|箭塔|城墙|墙|伐木工?|金矿|地图等级|星悦积分|攻击|生命|护甲|金币|木材)[\u3400-\u9fffA-Za-z]{0,18}[+＋-]\s*\d/;
        for(var i=0;i<source.length;i++){
            var c=source.charAt(i),tail=source.slice(i),line=out.split("\n").pop();
            if(!depth){
                if(c===";"||c==="；"||c==="|"||c==="\n"){out+="\n";continue;}
                if((c===","||c==="，")&&!(c===","&&/\d/.test(source.charAt(i-1))&&/\d/.test(source.charAt(i+1)))
                    &&/[+＋-]|提高|增加|减少|获得/.test(line)){out+="\n";continue;}
                if(/[ \t]/.test(c)){
                    var next=i;while(next<source.length&&/[ \t]/.test(source.charAt(next)))next++;
                    var rest=source.slice(next);
                    if(/[0-9%％wW）)]$/.test(out)||attribute.test(rest)||/^(?:开局自带|获得英雄|购买后自动|获得后自动)/.test(rest)){
                        out+="\n";i=next-1;continue;
                    }
                }
                // Some recorded descriptions concatenate complete attributes.
                // Require the next attribute's own signed value, keeping prose
                // such as "额外增加4%英雄最终伤害" together.
                if(/[0-9%％wW]$/.test(out)&&(attribute.test(tail)||/^(?:获得英雄|在城墙处)/.test(tail)))out+="\n";
            }
            if(c==="("||c==="（"||c==="["||c==="【")depth++;
            if(c===")"||c==="）"||c==="]"||c==="】")depth=Math.max(0,depth-1);
            out+=c;
        }
        return out.split("\n").map(function(line){return line.trim();}).filter(function(line){return !!line;}).join("\n");
    }
    function tooltip(item,anchor) {
        if(!ensure()||!valid(anchor))return false;if(!canAct()){hideTooltip();return true;}
        var resultTip=false;for(var ancestor=anchor;valid(ancestor);ancestor=ancestor.GetParent())if(ancestor===view.resultCanvas){resultTip=true;break;}
        var tooltipCanvas=resultTip?view.resultCanvas:p("LotteryMainCanvas"),tooltipParent=resultTip?view.resultCanvas:view.detailLayer;
        if(view.tooltip.GetParent()!==tooltipParent){hideTooltip();view.tooltip.SetParent(tooltipParent);}
        if(tipAnchor&&tipAnchor!==anchor&&tipDismiss){tipDismiss.Dispose();tipDismiss=null;}
        if(!tooltipGuard().CanShow(anchor))return true;item=item||{};
        anchor.SetPanelEvent("onmouseout",function(){if(!requestTooltipHide(anchor))hideTooltip();});
        cancelTooltipHide();tipAnchor=anchor;if(view.tipScroll.ScrollToTop)view.tipScroll.ScrollToTop();
        var description=item.description||"暂无效果说明";if(cfg.SurvivalItemResources&&cfg.SurvivalItemResources.DisplayDescription)description=cfg.SurvivalItemResources.DisplayDescription(item,description);
        var lines=[effectLines(description)];if(item.duration_text)lines.push("期限："+item.duration_text);if(item.duplicate_points!==undefined&&item.duplicate_points!==null)lines.push("重复转化："+item.duplicate_points+" "+((item.converted_currency||item.duplicate_currency)==="shop_points"?"商城积分":"星悦积分"));
        if(item.count!==undefined||item.quantity!==undefined)lines.push("本次获得："+number(item.count===undefined?item.quantity:item.count));
        if(item.duplicate===true||Number(item.duplicate)===1)lines.push("本次已转化 "+number(item.converted_points)+" "+((item.converted_currency||item.duplicate_currency)==="shop_points"?"商城积分":"星悦积分"));
        qualityWell(view.tipIconStage,item);
        view.tipIconStage.RemoveAndDeleteChildren();var tipIcon=cfg.SurvivalRewardPresentation.CreateIcon(view.tipIconStage,item,"LotteryGW2TooltipIcon");if(tipIcon){place(tipIcon,0,0,46,46);fillItemIcon(tipIcon,item);}prune();
        view.tipName.text=String(item.name||item.id||"道具");view.tipState.text=String(item.quality||"").toUpperCase()+(item.duration_text?" · "+item.duration_text:"");
        style(view.tipName,{color:cfg.SurvivalRewardPresentation.NameColor(item.quality)});view.tipDescription.text=lines.join("\n");view.tipCount.text="拥有 "+quantity(item);
        var lineCount=0;lines.join("\n").split("\n").forEach(function(line){lineCount+=Math.max(1,Math.ceil(line.length/17));});
        var h=Math.max(176,Math.min(704,145+lineCount*24));
        var cp=tooltipCanvas.GetPositionWithinWindow(),at=anchor.GetPositionWithinWindow(),fitted=canvasScale(tooltipCanvas),sx=(tooltipCanvas.actualuiscale_x||1)*fitted,sy=(tooltipCanvas.actualuiscale_y||1)*fitted;
        var headerAt=String(view.header.style.position).split(" "),sidebarAt=String(view.sidebar.style.position).split(" "),left=resultTip?20:parseFloat(headerAt[0]),right=resultTip?1652:left+parseFloat(view.header.style.width),top=resultTip?20:parseFloat(headerAt[1]),bottom=resultTip?921:parseFloat(sidebarAt[1])+parseFloat(view.sidebar.style.height);
        var x=(at.x-cp.x)/sx+(anchor.actuallayoutwidth||72)+12,y=(at.y-cp.y)/sy;if(x+368>right)x=(at.x-cp.x)/sx-380;x=Math.max(left,Math.min(right-368,x));y=Math.max(top,Math.min(bottom-h,y));
        var cursor=GameUI.GetCursorPosition&&GameUI.GetCursorPosition();
        if(cursor&&cursorInsideTooltipRegion(anchor)){
            var px=(cursor[0]-cp.x)/sx,py=(cursor[1]-cp.y)/sy;
            if(px>=x&&px<x+368&&py>=y&&py<y+h){
                if(px+12+368<=right)x=px+12;
                else if(px-368-12>=left)x=px-368-12;
                else y=py+12+h<=bottom?py+12:Math.max(top,py-h-12);
            }
        }
        place(view.tooltip,x,y,368,h);view.tipSkin.Resize(368,h);place(view.tipScroll,20,98,328,h-144);place(view.tipDescription,0,0,320,0);style(view.tipDescription,{height:"fit-children",ignoreParentFlow:"false"});place(view.tipCount,20,h-38,328,24);view.tooltip.visible=true;
        function syncTooltipInput(){if(!alive()||!view.tooltip.visible||tipAnchor!==anchor)return;raiseTooltip();var interactive=tooltipOverflows();[view.tooltip,view.tipSkin.surface,view.tipScroll].forEach(function(node){node.hittest=interactive;node.hittestchildren=interactive;});}
        syncTooltipInput();[0,.05,.2].forEach(function(delay){$.Schedule(delay,syncTooltipInput);});
        tipDismiss.Shown(anchor);return true;
    }
    var originalDialog=R&&R.LotteryDialog,originalReward=R&&R.RewardCard,presentation=cfg.SurvivalRewardPresentation,originalIcon=presentation&&presentation.CreateIcon;
    function iconWrapper(parent,item,className){var icon=originalIcon.call(presentation,parent,item,className);if(alive()&&lotteryParent(parent)){if(valid(icon))icon.__lotteryItem=item;return existingRewardArt(icon,item);}return icon;}
    function dialogWrapper(name,options){info(name,options);}
    function rewardWrapper(card,item){card.__lotteryItem=item;if(originalReward)originalReward(card,item);compactCards(card.GetParent(),card);}
    if(R){R.LotteryDialog=dialogWrapper;R.RewardCard=rewardWrapper;}
    if(presentation&&originalIcon)presentation.CreateIcon=iconWrapper;
    cfg.SurvivalPurpleLottery={
        Version:"lottery_current_20261018",
        Owns:function(owner){return alive()&&owner===root;},
        IsReady:function(){return alive()&&!!view&&valid(view.root)&&valid(view.content)&&valid(view.header)&&cfg.LotteryGW2Data&&cfg.LotteryGW2Data.version===2;},
        Apply:apply,Info:info,Compact:compactCards,StyleTabs:function(){sidebar();},IsAlive:alive,
        Pools:function(rows,id){if(!alive())return;pools=rows||[];selected=String(id||"map");hideTicketHelp();sidebar();},
        Snapshot:function(data){if(!alive())return;snapshot=data;previews();apply();},
        Open:function(){if(!alive())return;opened=true;mode="";apply();if(view&&valid(view.root))view.root.visible=true;},
        Close:function(){if(!alive())return;hideTicketHelp();opened=false;mode="";hideTooltip();if(view&&valid(view.root))view.root.visible=false;},
        CloseInfo:function(){if(!alive())return;mode="";hideTooltip();apply();},
        Content:function(){return ensure()?(view.fullscreen.visible?view.resultCanvas:view.content):null;},Fit:fit,Tooltip:tooltip,HideTooltip:hideTooltip,RequestTooltipHide:requestTooltipHide,
        Dispose:function(){
            if(disposed)return;hideTicketHelp();hideTooltip();if(tipDismiss)tipDismiss.Dispose();
            // A replacement skin must finish assembling before this window can
            // open again. Never expose the original XML skin between lifetimes.
            var window=p("LotteryWindow");if(valid(window)){window.RemoveClass("LotteryOpen");window.RemoveClass("LotteryCurrentVersion");window.AddClass("LotteryClosed");}
            var legacyTooltip=p("LotteryItemTooltip");if(valid(legacyTooltip))legacyTooltip.AddClass("Hidden");
            if(R&&R.LotteryDialog===dialogWrapper)R.LotteryDialog=originalDialog;if(R&&R.RewardCard===rewardWrapper)R.RewardCard=originalReward;
            if(presentation&&presentation.CreateIcon===iconWrapper)presentation.CreateIcon=originalIcon;
            // Restore original business nodes before deleting any presentation hosts.
            moved.forEach(function(e){if(valid(e.node)&&valid(e.parent)){e.node.SetParent(e.parent);if(valid(e.next)&&e.next.GetParent()===e.parent&&e.parent.MoveChildBefore)e.parent.MoveChildBefore(e.node,e.next);}});moved=[];
            owned.slice().reverse().forEach(function(n){if(valid(n))n.DeleteAsync(0);});owned=[];
            if(valid(p("LotteryMainCanvas"))){p("LotteryMainCanvas").RemoveClass("LotteryGW2");p("LotteryMainCanvas").RemoveClass("LotteryGW2Reborn");}if(valid(p("LotteryWindow"))){p("LotteryWindow").RemoveClass("LotteryGW2Root");p("LotteryWindow").RemoveClass("LotteryGW2ForestTheme");}view=null;disposed=true;if(valid(life))life.DeleteAsync(0);
        },
        Inspect:function(){return {alive:alive(),view:!!view,open:opened,mode:mode,pools:pools.length,poolIds:pools.map(function(pool){return String(pool.id);}),selected:selected,hasSnapshot:!!snapshot,canvas:layout.canvas.slice(),content:layout.content.slice(),movedCount:moved.filter(function(e){return valid(e.node);}).length,trackedOwned:owned.length,trackedMoved:moved.length,prizeGroups:prizeGroups.filter(function(g){return valid(g.bar);}).map(function(g){return {id:g.id,count:g.cards.length,percent:g.percent,collapsed:!!prizeFolded[g.key]};}),scale:scale};}
    };
    apply();
    if(cfg.SurvivalLottery&&cfg.SurvivalLottery.PresentationReady)cfg.SurvivalLottery.PresentationReady(cfg.SurvivalPurpleLottery);
})();
