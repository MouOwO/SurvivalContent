(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), owner = $.GetContextPanel();
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    var previousShell=cfg.SurvivalPurpleShell;
    if (previousShell && previousShell.ReleaseSubscriptions) previousShell.ReleaseSubscriptions();
    var generation=Date.now()+"_"+Math.random();
    var entries=previousShell && previousShell.Entries || [], subscriptions=[];
    var latestResources=previousShell && previousShell.Resources || null, refreshQueued=false, netSubscription=null;
    var tabs = [
        {id:"treasure",label:"宝物",icon:"treasure"},
        {id:"archive",label:"存档",icon:"archive"},
        {id:"lottery",label:"抽奖",icon:"lottery"},
        {id:"commerce",label:"商城",icon:"shop"},
        {id:"daily_rewards",label:"每日奖励",icon:"benefit"},
        {id:"leaderboard",label:"排行榜",icon:"effects",disabled:true}
    ];
    function node(type, parent, id, cls) {
        var p = $.CreatePanel(type, parent, id || "");
        if (cls) cls.split(/\s+/).forEach(function(name) { if (name) p.AddClass(name); });
        return p;
    }
    function label(parent, value, cls) {
        var p = node("Label", parent, "", cls); p.text = String(value);
        var colors = {PurpleBrand:"#ecd080",PurpleTabName:"#dbcee9",PurpleCloseText:"#d6b071",
            PurpleSectionCaption:"#9586a9",PurpleBalanceName:"#ac9abc",PurpleBalanceValue:"#e3c47c"};
        var sizes = {PurpleBrand:28,PurpleTabName:20,PurpleCloseText:38,PurpleSectionCaption:17,
            PurpleBalanceName:15,PurpleBalanceValue:20};
        apply(p,{color:colors[cls] || "#ddd0eb",fontSize:(sizes[cls] || 18)+"px",
            fontFamily:'"Source Han Sans SC", "Microsoft YaHei"',textShadow:"none"});
        p.hittest = false; p.hittestchildren = false; return p;
    }
    function apply(p, values) { Object.keys(values).forEach(function(k) { p.style[k] = values[k]; }); }
    function number(value) {
        if (value === undefined || value === null || !isFinite(Number(value))) return "—";
        var n = Number(value);
        if (n >= 100000000) return (n/100000000).toFixed(1).replace(/\.0$/, "") + "亿";
        if (n >= 100000) return (n/10000).toFixed(1).replace(/\.0$/, "") + "万";
        return String(Math.floor(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    function target(id) {
        if (id === "archive") return cfg.SurvivalArchive && {view:cfg.SurvivalArchive,method:"Open"};
        if (id === "treasure") return cfg.SurvivalTreasure && {view:cfg.SurvivalTreasure,method:"Toggle"};
        if (id === "lottery") return cfg.SurvivalLottery && {view:cfg.SurvivalLottery,method:"Open"};
        if (id === "commerce") return cfg.SurvivalCommerceView && {view:cfg.SurvivalCommerceView,method:"Open"};
        if (id === "daily_rewards") return cfg.SurvivalDaily && {view:cfg.SurvivalDaily,method:"Open",argument:false};
        if (id === "shop") return cfg.SurvivalShop && {view:cfg.SurvivalShop,method:"SelectShop"};
        return null;
    }
    function navigate(id) {
        var to = target(id), layers = cfg.SurvivalUILayers;
        if (!to || typeof to.view[to.method] !== "function") return false;
        var ordinaryMenus = {archive:true,treasure:true,lottery:true,lottery_info:true,
            commerce:true,daily_rewards:true,shop:true,vip:true,commerce_exchange:true,payment_shop:true};
        var previous = layers && layers.Top(), remaining = 16;
        while (previous && previous !== id) {
            // Navigation only dismisses menu-owned layers, preserving game choices.
            if (!ordinaryMenus[previous] || !remaining--) return false;
            layers.CloseTop();
            if (layers.Top() === previous) return false;
            previous = layers.Top();
        }
        if (previous === id) return true;
        to.view[to.method](to.argument);
        refresh(); return true;
    }
    function resources() {
        if (latestResources) return latestResources;
        var snapshot = CustomNetTables.GetTableValue("survival_ui_state", "player_" + Game.GetLocalPlayerID());
        return snapshot && snapshot.resources || {};
    }
    function balanceRows(id) {
        if (id === "shop") {
            var r = resources();
            return [{name:"金币",value:r.gold,icon:"coin"},{name:"木材",value:r.wood,icon:"wood"}];
        }
        var catalog = cfg.SurvivalCommerceWallet && cfg.SurvivalCommerceWallet.GetCatalog();
        var b = catalog && catalog.balances || {};
        return [{name:"U币",value:b.u_coin,icon:"coin"},
            {name:"积分",value:b.shop_points,icon:"crystal"},
            {name:"商城金币",value:b.shop_gold,icon:"coin"}];
    }
    function refreshEntry(entry) {
        if (!valid(entry.panel)) return;
        if (!entry.balances || entry.balances.some(function(cell) {
            return !valid(cell.panel)||!valid(cell.name)||!valid(cell.value)||!valid(cell.icon);
        })) return;
        balanceRows(entry.id).forEach(function(row, index) {
            var cell = entry.balances[index];
            cell.panel.visible = true;
            cell.name.text = row.name;
            cell.value.text = number(row.value);
            cell.icon.visible = row.icon !== "wood";
            if (row.icon !== "wood") cell.icon.SetImage("file://{images}/custom_game/commerce_jade_v1/"+row.icon+".png");
            cell.panel.SetHasClass("PurpleBalanceUnknown", row.value === undefined || row.value === null);
        });
        entry.balances.forEach(function(cell,index) { if (index >= balanceRows(entry.id).length) cell.panel.visible = false; });
    }
    function refresh() {
        entries = entries.filter(function(e) { return valid(e.panel)&&e.balances.every(function(c){return valid(c.panel);}); });
        if (cfg.SurvivalPurpleShell) cfg.SurvivalPurpleShell.Entries=entries;
        entries.forEach(refreshEntry);
    }
    function deferredRefresh() {
        if (refreshQueued || !valid(owner)) return;
        refreshQueued = true;
        $.Schedule(0, function() { refreshQueued = false; if (valid(owner)) refresh(); });
    }
    function adopt(props) {
        var p = props.panel;
        if (!valid(p)) return null;
        var cached = p.__purpleShell;
        if (cached && cached.generation===generation) {
            if (props.title !== undefined && valid(cached.sectionCaption)) cached.sectionCaption.text = props.title;
            cached.Refresh(); return cached;
        }
        if (cached) {
            if (valid(cached.chrome)) cached.chrome.DeleteAsync(0);
            (cached.corners||[]).forEach(function(c) { if(valid(c))c.DeleteAsync(0); });
            p.Children().forEach(function(c) { if(c.BHasClass("PurpleChrome")||c.BHasClass("PurpleCorner"))c.DeleteAsync(0); });
            entries=entries.filter(function(e) { return e.panel!==p; });
        }
        p.AddClass("PurpleShell");
        apply(p, {width:props.width+"px",height:props.height+"px",backgroundImage:"none",
            backgroundColor:"gradient(linear,0% 0%,0% 100%,from(#201632),color-stop(.2,#110d21),to(#0c0917))",
            border:"1px solid #655079",borderTop:"2px solid #987148",borderBottom:"2px solid #987148",borderRadius:"3px",boxShadow:"#000000b8 0px 14px 48px 0px"});
        var chrome = node("Panel",p,"","PurpleChrome"); chrome.hittest = false;
        var bar = node("Panel",chrome,"","PurpleNavigation");
        label(bar,"苟发育","PurpleBrand");
        var tabHost = node("Panel",bar,"","PurpleTabs");
        tabHost.style.width = Math.max(400, props.width - 218) + "px";
        tabs.forEach(function(tab) {
            var button = node("Button",tabHost,"","PurpleTab");
            button.SetHasClass("PurpleTabActive",tab.id === (props.navId || props.id));
            button.SetHasClass("PurpleTabUnavailable",tab.disabled === true);
            button.hittest = true; button.hittestchildren = false;
            var icon = node("Image",button,"","PurpleTabIcon"); icon.hittest = false;
            icon.SetImage("file://{images}/custom_game/topnav_v2/"+tab.icon+".svg");
            var caption = label(button,tab.label,"PurpleTabName");
            if (tab.id === (props.navId || props.id)) caption.style.color="#f0cf72";
            else if (tab.disabled) caption.style.color="#908199";
            button.SetPanelEvent("onactivate",function() { if (!tab.disabled) navigate(tab.id); return true; });
            if (tab.disabled) {
                button.SetPanelEvent("onmouseover",function() { $.DispatchEvent("DOTAShowTextTooltip",button,"排行榜尚未开放"); });
                button.SetPanelEvent("onmouseout",function() { $.DispatchEvent("DOTAHideTextTooltip"); });
            }
        });
        var close = node("Button",chrome,"","PurpleClose"); close.hittest = true; close.hittestchildren = false;
        label(close,"×","PurpleCloseText");
        close.SetPanelEvent("onactivate",function() { if (props.onClose) props.onClose(); return true; });
        var row = node("Panel",chrome,"","PurpleCurrencyBar");
        var activeTab = tabs.filter(function(t) { return t.id === (props.navId || props.id); })[0];
        var sectionCaption=label(row, props.title || (activeTab ? activeTab.label : ""), "PurpleSectionCaption");
        var balanceHost = node("Panel",row,"","PurpleBalances"), cells = [];
        for (var i=0;i<3;i++) {
            var cell = node("Panel",balanceHost,"","PurpleBalance"); cell.hittest = false;
            var image = node("Image",cell,"","PurpleBalanceIcon"); image.hittest = false;
            cells.push({panel:cell,icon:image,name:label(cell,"","PurpleBalanceName"),value:label(cell,"—","PurpleBalanceValue")});
        }
        var cornerNodes=[];
        ["TL","TR","BL","BR"].forEach(function(c) { var mark=node("Panel",p,"","PurpleCorner PurpleCorner"+c);mark.hittest=false;mark.hittestchildren=false;cornerNodes.push(mark); });
        var entry = {panel:p,id:props.id,balances:cells}; entries.push(entry);
        if (cfg.SurvivalPurpleShell) cfg.SurvivalPurpleShell.Entries=entries;
        var api = {panel:p,generation:generation,chrome:chrome,corners:cornerNodes,sectionCaption:sectionCaption,Refresh:function() { refreshEntry(entry); },Dispose:function() {
            entries=entries.filter(function(e) { return e!==entry; });
            if (valid(chrome)) chrome.DeleteAsync(0); delete p.__purpleShell;
            cornerNodes.forEach(function(c){if(valid(c))c.DeleteAsync(0);});
            if(cfg.SurvivalPurpleShell)cfg.SurvivalPurpleShell.Entries=entries;
        }};
        p.__purpleShell=api; api.Refresh(); return api;
    }
    function snapshot(data) {
        if (data && data.resources) { latestResources=data.resources; deferredRefresh(); }
        else if (data && (data.gold !== undefined || data.wood !== undefined)) {
            latestResources={gold:data.gold,wood:data.wood}; deferredRefresh();
        }
        if (cfg.SurvivalPurpleShell) cfg.SurvivalPurpleShell.Resources=latestResources;
    }
    function detach(p) {
        if (!valid(p)) return;
        p.Children().forEach(function(c) {
            if (c.BHasClass("PurpleChrome") || c.BHasClass("PurpleCorner")) c.DeleteAsync(0);
        });
        delete p.__purpleShell;
        p.RemoveClass("PurpleShell");
        entries = entries.filter(function(e) { return e.panel !== p; });
        if (cfg.SurvivalPurpleShell) cfg.SurvivalPurpleShell.Entries = entries;
    }
    if (GameEvents && GameEvents.Subscribe) {
        ["survival_ui_private_snapshot","ui_state_snapshot","ui_shop_snapshot"].forEach(function(name) { subscriptions.push(GameEvents.Subscribe(name,function(data){snapshot(data);})); });
        subscriptions.push(GameEvents.Subscribe("survival_commerce_result",deferredRefresh));
    }
    if (CustomNetTables && CustomNetTables.SubscribeNetTableListener) {
        netSubscription=CustomNetTables.SubscribeNetTableListener("survival_ui_state",function(name,key,data) {
            if (key === "player_"+Game.GetLocalPlayerID()) snapshot(data);
        });
    }
    function registerToolsProbe() {
        if (!valid(owner) || !Game.IsInToolsMode || !Game.IsInToolsMode()) return false;
        var probe=cfg.SurvivalClientCallbackProbe;
        if (!probe || !probe.RegisterModule) return false;
        return probe.RegisterModule("purpleShell",[
            {name:"refresh",get:function(){return refresh;},set:function(fn){refresh=fn;}},
            {name:"refreshEntry",get:function(){return refreshEntry;},set:function(fn){refreshEntry=fn;}},
            {name:"snapshot",get:function(){return snapshot;},set:function(fn){snapshot=fn;}}
        ],generation);
    }
    cfg.SurvivalPurpleShell={Entries:entries,Adopt:adopt,Detach:detach,Navigate:navigate,Refresh:refresh,FormatNumber:number,
        RegisterToolsProbe:registerToolsProbe,
        Resources:latestResources,
        ReleaseSubscriptions:function(){subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];
            if(netSubscription!==null&&CustomNetTables.UnsubscribeNetTableListener)CustomNetTables.UnsubscribeNetTableListener(netSubscription);netSubscription=null;},
        IsAlive:function() { return valid(owner); },version:"1.0.0"};
    registerToolsProbe();
    if (Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand) {
        var review="survival_purple_review_"+Date.now();
        Game.AddCommand(review,function() {
            var args=Array.prototype.slice.call(arguments),id=String(args[args.length-1] || "");
            if(id.indexOf("archive_category_")===0){
                var category=id.slice("archive_category_".length);
                if(["clear","shadow","points","starjoy_points","gift","fragment","pet","endless","friend","ex","beast","map_level","work","building","fishing","boss","titles"].indexOf(category)>=0&&cfg.SurvivalArchive){
                    navigate("archive");cfg.SurvivalArchive.SelectCategory(category);
                }
                return;
            }
            if (id==="close") { if(cfg.SurvivalUILayers)cfg.SurvivalUILayers.CloseTop();return; }
            if (id==="battlefield") {
                var hero=Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID());
                if(hero>=0&&Entities.IsValidEntity(hero)&&GameUI.SetCameraTargetPosition)GameUI.SetCameraTargetPosition(Entities.GetAbsOrigin(hero),0);
                return;
            }
            if (id==="inspect") {
                $.Msg("[PURPLE_WINDOW_STATE] "+JSON.stringify(entries.filter(function(e){return valid(e.panel);}).map(function(e) {
                    return {id:e.id,visible:e.panel.visible,width:e.panel.actuallayoutwidth,height:e.panel.actuallayoutheight,
                        position:e.panel.GetPositionWithinWindow(),scale:e.panel.actualuiscale_x};
                })));
                var scope=owner;
                while(valid(scope.GetParent()))scope=scope.GetParent();
                var diagnostic={};
                diagnostic.archiveAPI={dispose:typeof(cfg.SurvivalArchive&&cfg.SurvivalArchive.Dispose),isAlive:typeof(cfg.SurvivalArchive&&cfg.SurvivalArchive.IsAlive)};
                var archiveSnapshot=cfg.ArchiveHandoff&&cfg.ArchiveHandoff.snapshot;
                diagnostic.archiveSnapshot=archiveSnapshot?{category:archiveSnapshot.category_id,rows:archiveSnapshot.rows&&Object.keys(archiveSnapshot.rows).length,categories:archiveSnapshot.categories&&Object.keys(archiveSnapshot.categories).length}:null;
                var shopNames=[];
                function inspectNames(n){if(!valid(n))return;if(n.BHasClass("ShopCardName"))shopNames.push({text:n.text,width:n.actuallayoutwidth,height:n.actuallayoutheight,inlineWidth:n.style.width,inlineMaxWidth:n.style.maxWidth,align:n.style.textAlign,position:n.GetPositionWithinWindow(),parentWidth:n.GetParent().actuallayoutwidth});n.Children().forEach(inspectNames);}
                inspectNames(scope.FindChildTraverse("CustomShopWindow"));
                diagnostic.shopNames=shopNames;
                ["DifficultySelectionOverlay","DifficultySelectionDialog","DifficultySelectionTitle","DifficultySelectionError","LotteryWindow","LotteryMainCanvas","LotterySceneBackground","LotteryDrawPity","LotteryDrawPityCaptionBounds","LotteryDrawPityCaption","ShopHeader","ShopTitleBlock","ShopTitle","ShopLoading"].forEach(function(key){
                    var n=scope.FindChildTraverse(key);
                    diagnostic[key]=valid(n)?{visible:n.visible,hidden:n.BHasClass("DifficultySelectionHidden")||n.BHasClass("Hidden"),closed:n.BHasClass("UIClosed"),lotteryClosed:n.BHasClass("LotteryClosed"),inlineVisibility:n.style.visibility,text:n.text,width:n.actuallayoutwidth,height:n.actuallayoutheight,fontSize:n.style.fontSize,transform:n.style.transform,borderBottom:n.style.borderBottom,position:n.GetPositionWithinWindow()}:null;
                });
                var shopLabels=[];
                function inspectShopLabels(n){if(!valid(n))return;if(n.paneltype==="Label"&&n.visible&&n.actuallayoutwidth&&n.actuallayoutheight)shopLabels.push({id:n.id,text:n.text,position:n.GetPositionWithinWindow(),width:n.actuallayoutwidth,height:n.actuallayoutheight});n.Children().forEach(inspectShopLabels);}
                inspectShopLabels(scope.FindChildTraverse("CustomShopWindow"));diagnostic.shopLabels=shopLabels;
                var commerceDetails=[];
                function inspectCommerce(n){
                    if(!valid(n))return;
                    if(n.BHasClass("RCPurpleDetail")){
                        var c=n.__purpleSource||n.GetParent(),well=c.Children().filter(function(p){return p.BHasClass("CommercePurpleArtWell");})[0];
                        commerceDetails.push({sourceLinked:!!n.__purpleSource,layerParent:n.GetParent().BHasClass("CommercePurpleDetailLayer"),selected:c.BHasClass("ShopSelected"),shown:n.BHasClass("Visible"),visible:n.visible,width:n.actuallayoutwidth,height:n.actuallayoutheight,position:n.GetPositionWithinWindow(),cardPosition:c.GetPositionWithinWindow(),wellHit:well&&well.hittest,wellChildrenHit:well&&well.hittestchildren});
                    }
                    n.Children().forEach(inspectCommerce);
                }
                entries.filter(function(e){return e.id==="commerce";}).forEach(function(e){inspectCommerce(e.panel);});
                diagnostic.commerceDetails=commerceDetails;
                diagnostic.commerceFactoryHasLayer=!!(cfg.SurvivalCommerceComponents&&String(cfg.SurvivalCommerceComponents.Window).indexOf("CommercePurpleDetailLayer")>=0);
                var loading=CustomNetTables.GetTableValue("survival_loading","state");
                diagnostic.setup=loading?{admission_complete:loading.admission_complete,all_ready:loading.all_ready,mode_id:loading.setup&&loading.setup.mode_id,mode_selected:loading.setup&&loading.setup.mode_selected}:null;
                diagnostic.layer=cfg.SurvivalUILayers&&cfg.SurvivalUILayers.Top();
                $.Msg("[PURPLE_STARTUP_STATE] "+JSON.stringify(diagnostic));return;
            }
            navigate(id);
        },"Open existing menu for UI review; never purchases or grants rewards",0);
        $.Msg("[PURPLE_UI_REVIEW_COMMAND] "+review);
    }
})();
