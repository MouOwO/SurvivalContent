// The original shop presentation, backed exclusively by the authenticated catalog.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), U=cfg.SurvivalUI, R=cfg.RemainingHandoff, J=cfg.SurvivalCommerceComponents, M=cfg.SurvivalBlackLionMarket, K=cfg.SurvivalBlackLionMarketModel, root=$.GetContextPanel();
    if (cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.Dispose) {
        try { cfg.SurvivalCommerceView.Dispose(); }
        catch(error) {
            // A pre-guard controller can survive a layout reload with deleted native panels.
            if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;
            $.Msg("[CommercePurple] Reload cleanup: previous native panel subtree was already deleted.");
        }
        delete cfg.SurvivalCommerceView;
    }
    delete cfg.SurvivalCommercePreviewData;
    if (!U || !R || !J) { delete cfg.SurvivalCommerceView; return; }
    var disposed=false, category="home", page=0, catalog={products:[],categories:[]}, revision="", opened=false, ticketRequest=false,detailsDisposed=false,purchaseType="all";
    var batchSize=20, listItems=[], loadedCount=0, loadTimer=null, loadEpoch=0;
    var paidCatalog={products:[],categories:[]}, walletCatalog={products:[],categories:[],balances:{}};
    function rows(value) { return Array.isArray(value)?value:Object.keys(value||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];}); }
    function panel(type,parent,cls) { var n=$.CreatePanel(type,parent,""); if(cls)n.AddClass(cls); return n; }
    function text(parent,value,cls) { var n=panel("Label",parent,cls);n.text=J.RewardNameText(value);n.hittest=false;return n; }
    function valid(p){return !!p&&(!p.IsValid||p.IsValid());}
    function live(){return !disposed&&store&&valid(store.panel)&&valid(tabs)&&valid(grid)&&valid(pager)&&valid(notice);}
    function hideDetails(){
        if(valid(grid)&&grid.Children)grid.Children().forEach(function(p){if(valid(p)&&p.__purpleDispose)p.__purpleDispose();else if(valid(p)&&p.__purpleHide)p.__purpleHide();});
        var layer=store&&store.detailLayer;
        if(valid(layer)){layer.Children().forEach(function(t){if(valid(t)&&t.__purpleDispose)t.__purpleDispose();});layer.RemoveAndDeleteChildren();}
        detailsDisposed=true;
    }
    function rebuildDetails(){if(valid(grid))grid.Children().forEach(function(p){if(valid(p)&&p.__purpleRebuildDetail)p.__purpleRebuildDetail();});detailsDisposed=false;}
    function hideCheckoutDetails(){if(valid(grid))grid.Children().forEach(function(p){if(valid(p)&&p.__purpleHide)p.__purpleHide();});}
    function stopLoading() { loadEpoch++;if(loadTimer!==null&&$.CancelScheduled)$.CancelScheduled(loadTimer);loadTimer=null; }
    function close() { opened=false;ticketRequest=false;stopLoading();hideDetails();if(store&&store.menu)store.menu.Close(); }
    function modal() {
        return J.Window(root,close);
    }
    var store=modal(), tabs=panel("Panel",store.panel,"RCTabs"), grid=panel("Panel",store.content,"RCGrid");
    tabs.visible=false;
    if(M){grid.AddClass("BLMarketRows");grid.style.position="0px 0px 0px";grid.style.width=(store.menu.listWidth||1072)+"px";grid.style.height="fit-children";grid.style.flowChildren="down";grid.style.padding="0px";grid.style.margin="0px";grid.style.overflow="noclip";grid.hittestchildren=true;}
    var notice=text(store.canvas,"正在加载商品…","RCNotice"),pager=panel("Panel",store.actions,"CJPager");
    if(M){notice.AddClass("BLMarketNotice");pager.visible=false;}
    function appendProduct(item,i,bundles) {
        var props={rewards:rows(item.reward_lines),effect:item.description||rewardText(item),purchaseLabel:purchaseLabel(item),action:function(){checkout(item);},detailLayer:store.detailLayer,menu:store.menu};
        props.index=i;props.catalog=catalog;
        var card=M?M.Row(grid,item,props):bundles?J.Bundle(grid,item,props):J.Product(grid,item,props);
        store.menu.DecorateCell(card,{index:i,keep:true,item:item,iconPanel:card.__menuCell.iconPanel,
            namePanel:card.__menuCell.namePanel,countPanel:card.__menuCell.countPanel});
    }
    function appendBatch() {
        if(!live()||!M)return;
        var end=Math.min(loadedCount+batchSize,listItems.length);
        for(;loadedCount<end;loadedCount++)appendProduct(listItems[loadedCount],loadedCount,false);
    }
    function watchLoading() {
        if(!M||!opened||!live()||loadedCount>=listItems.length||loadTimer!==null)return;
        var epoch=loadEpoch;
        // Only an open, unfinished list is checked. Appending keeps existing rows
        // and their tooltips intact; no per-frame work or catalog requests.
        loadTimer=$.Schedule(.2,function(){
            if(epoch!==loadEpoch)return;
            loadTimer=null;
            if(!opened||!live()||loadedCount>=listItems.length)return;
            var viewport=store.content,height=Number(viewport.actuallayoutheight)||0,
                contentHeight=Number(viewport.contentheight)||0,offset=Math.abs(Number(viewport.scrolloffset_y)||0);
            if(height>0&&contentHeight>0&&offset+height>=contentHeight-24)appendBatch();
            watchLoading();
        });
    }
    function checkout(item) {
        if(!live()||!item)return false;
        if(M&&K&&!K.IsActionable(item)){notice.text=K.DisabledMessage(item)||"此商品当前不可购买。";return false;}
        if(item.preview_only || item.disabled_reason==="bundle_pending_assets"){notice.text=item.disabled_message||"此礼包尚未开放购买。";return false;}
        if(item.disabled_reason==="payment_catalog_pending" || item.disabled_reason==="payment_product_unavailable" || item.disabled_reason==="payment_price_unavailable"){
            notice.text=item.disabled_reason==="payment_catalog_pending"?"人民币支付目录正在连接，请稍后重试。":"此商品的人民币购买尚未开放，请稍后重试。";
            if(cfg.SurvivalPayments && cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog(true);
            return false;
        }
        if(item && item.purchase_method==="wallet"){
            if(cfg.SurvivalCommerceWallet && cfg.SurvivalCommerceWallet.Checkout(item.sku)){hideCheckoutDetails();return true;}
            return false;
        }
        if(disposed || !item || !cfg.SurvivalPayments || !cfg.SurvivalPayments.Checkout)return false;
        if(cfg.SurvivalPayments.Checkout(item.sku)){hideCheckoutDetails();return true;}
        return false;
    }
    function enabled(value){return value===true || value===1;}
    function purchaseLabel(item) { if(item.disabled_reason==="bundle_pending_assets")return "待开放 · 查看";return item.purchase_method==="wallet"?"查看 / 兑换":item.disabled_reason==="payment_catalog_pending"?"连接支付目录":item.disabled_reason==="payment_product_unavailable" || item.disabled_reason==="payment_price_unavailable"?"人民币购买尚未开放":enabled(item.enabled)?"查看 / 购买":item.owned>0?"已拥有 · 查看":"查看奖励"; }
    function noticeText(){
        return walletCatalog.error||"";
    }
    function singleTicket() {
        // A bundle containing tickets is not a single-ticket purchase.
        return rows(catalog.products).filter(function(p){
            var rewards=rows(p.reward_lines);
            return p.product_type==="single" && rewards.length===1 && rewards[0].kind==="item"
                && rewards[0].id==="special_lottery_ticket" && Number(rewards[0].quantity)===1;
        })[0];
    }
    function isGoldenProduct(item){var r=rows(item.reward_lines);return item.product_type==="single"&&r.length===1&&r[0].id==="special_lottery_ticket";}
    function rewardLabel(reward){return reward.id==="special_lottery_ticket"?"金色抽奖券":reward.label;}
    function productIcon(item){return isGoldenProduct(item)?"custom_game/lottery_tickets_v2/gold_ticket.png":item.icon;}
    function rewardText(item) { return rows(item.reward_lines).map(function(r){return rewardLabel(r)+" "+(J.RewardAmount?J.RewardAmount(r.quantity):String(r.quantity));}).join("\n"); }
    function refreshResources(){var b=walletCatalog.balances||{};store.menu.SetResources([{icon:"gold",name:"G币",value:b.u_coin},{icon:"purple_gem",name:"积分",value:b.shop_points}]);}
    function matchesPurchaseType(item){var model=cfg.SurvivalBlackLionMarketModel;return purchaseType==="all"||!!model&&model.MatchesPurchaseType(item,purchaseType);}
    function selectPurchaseType(id){
        var model=cfg.SurvivalBlackLionMarketModel;
        if(!live()||!model||!model.PurchaseTypes().some(function(option){return option.id===id;}))return false;
        purchaseType=id;page=0;render();return true;
    }
    function render() {
        if(!live())return;
        stopLoading();listItems=[];loadedCount=0;
        hideDetails();
        tabs.RemoveAndDeleteChildren();grid.RemoveAndDeleteChildren();pager.RemoveAndDeleteChildren();
        detailsDisposed=false;
        var categories=M?K.Groups(catalog):rows(catalog.categories), products=rows(catalog.products).filter(function(item){return !M||K.IsListed(item);});
        if(!categories.some(function(c){return c.id===category;})) category=(categories[0]||{}).id||"home";
        store.menu.SetSidebar(categories.map(function(c){return {id:c.id,label:c.label,count:c.count};}),category,function(id){category=id;page=0;render();});
        refreshResources();
        var items=M&&category==="home"?(K.HomeProducts?K.HomeProducts(products):[]):products.filter(function(p){return M?K.InGroup(p,category):p.category_id===category;});
        if(M&&category!=="home")items=K.SortProducts(items,category);
        items=items.filter(matchesPurchaseType);
        if(store.menu.SetPurchaseType)store.menu.SetPurchaseType(purchaseType,selectPurchaseType);
        var bundles=items.length>0 && items.every(function(p){return p.product_type==="bundle";});grid.SetHasClass("RCBundles",bundles);
        notice.text=noticeText();
        if(M&&store.content.ScrollToTop)store.content.ScrollToTop();
        if(categories.length && !items.length) { text(grid,purchaseType==="all"?"本分类暂无上架商品":"本分类暂无"+({shop_points:"积分",u_coin:"G币"}[purchaseType]||"")+"商品","CJEmpty");return; }
        if(M){page=0;listItems=items;appendBatch();watchLoading();return;}
        var perPage=24,totalPages=Math.max(1,Math.ceil(items.length/perPage));page=Math.max(0,Math.min(page,totalPages-1));
        items.slice(page*perPage,(page+1)*perPage).forEach(function(item,i){
            appendProduct(item,i,bundles);
        });
        if(totalPages>1){
            function turn(label,delta,enabled){var b=panel("Button",pager,"CJPageAction");text(b,label,"");b.enabled=enabled;b.SetPanelEvent("onactivate",function(){if(b.enabled){page+=delta;render();}});}
            turn("上一页",-1,page>0);text(pager,(page+1)+" / "+totalPages+" · "+items.length+"件","CJPageLabel");turn("下一页",1,page<totalPages-1);
        }
    }
    function update(data) {
        if(!live())return;
        catalog=data||{products:[],categories:[]};
        // Keep hovered cards stable when only numeric previews have changed.
        var next=JSON.stringify({categories:catalog.categories,hash:catalog.catalog_hash,products:rows(catalog.products).map(function(p){return [p.sku,p.enabled,p.owned,p.purchase_limit,p.max_quantity,p.required_vip_level,p.disabled_message,p.original_price,p.original_u_coin_price,p.amount_fen,p.price,p.currency,p.u_coin_price,p.u_coin_per_yuan,p.purchase_method,p.disabled_reason,p.title,p.description,p.category_id,p.product_type,p.icon,p.reward_lines];})});
        if(next!==revision){revision=next;render();}
        // Updating a connection notice must not destroy hovered cards or clear products.
        notice.text=noticeText();refreshResources();
        if(ticketRequest){
            ticketRequest=false;
            var item=singleTicket();
            if(!item || !checkout(item))notice.text=catalog.error || "金色抽奖券暂未上架，请稍后重试。";
        }
    }
    // Video records only decorate known bundle display and supply disabled fallbacks.
    // Eligibility, charged amount and grants still come from authenticated services.
    function bundleMetadata(){return rows(cfg.VideoShopBundleCatalog&&cfg.VideoShopBundleCatalog.products);}
    function decorateBundle(item){
        var meta=bundleMetadata().filter(function(row){return row.sku===item.sku;})[0];if(!meta)return item;
        if(item.original_price===undefined&&item.u_coin_price===meta.u_coin_price)item.original_price=meta.original_price;
        if(item.required_vip_level===undefined)item.required_vip_level=meta.required_vip_level;
        item.bundle_reviewed=true;
        item.reward_lines=rows(item.reward_lines).map(function(line){var result={};Object.keys(line).forEach(function(key){result[key]=line[key];});var original=rows(meta.reward_lines).filter(function(row){return row.id===line.id;})[0];if(original){result.icon=original.icon;result.label=original.label;if(!result.description)result.description=original.description;}return result;});
        return item;
    }
    function mergeCatalogs(){
        var categories=rows(paidCatalog.categories).slice();
        rows(walletCatalog.categories).forEach(function(c){if(!categories.some(function(v){return v.id===c.id;}))categories.push(c);});
        var paid=Object.create(null),seen=Object.create(null),products=[];
        function copy(value){var p={};Object.keys(value||{}).forEach(function(k){p[k]=value[k];});return p;}
        function validUPrice(p){return p && typeof p.u_coin_price==="number" && p.u_coin_price>0 && p.u_coin_price%1===0 && p.u_coin_per_yuan===100 && typeof p.amount_fen==="number" && p.amount_fen>0 && p.amount_fen<=1000000 && p.amount_fen%1===0 && p.u_coin_price===p.amount_fen;}
        rows(paidCatalog.products).forEach(function(p){if(p && typeof p.sku==="string")paid[p.sku]=p;});
        rows(walletCatalog.products).forEach(function(p){
            if(!p || typeof p.sku!=="string" || seen[p.sku])return;
            seen[p.sku]=true;
            var item=copy(p),cash=paid[p.sku];
            if(p.currency==="u_coin"){
                // The wallet supplies presentation while the authenticated payment row decides eligibility.
                // Wallet balance and wallet insufficient-funds flags never authorize or block a cash order.
                if(cash)Object.keys(cash).forEach(function(k){item[k]=cash[k];});
                item.amount_fen=cash?cash.amount_fen:undefined;item.u_coin_price=cash?cash.u_coin_price:undefined;item.u_coin_per_yuan=cash?cash.u_coin_per_yuan:undefined;
                item.currency="u_coin";item.currency_name="G币";item.purchase_method="cash";
                item.enabled=!!cash && validUPrice(cash) && enabled(cash.enabled);
                if(validUPrice(cash)){item.price=cash.u_coin_price;item.disabled_reason=cash.disabled_reason||"";}
                else item.disabled_reason=cash?"payment_price_unavailable":paidCatalog.error || !paidCatalog.catalog_hash && !rows(paidCatalog.products).length?"payment_catalog_pending":"payment_product_unavailable";
                // The two authenticated catalogs can arrive in either order.
                // A fresh unique-ownership receipt must not be erased by an
                // older cash snapshot; wallet balances still never gate cash.
                if(cash&&Number(p.purchase_limit)===1&&Number(cash.purchase_limit)===1&&Number(p.owned)>=1&&isFinite(Number(p.owned))){
                    item.owned=Math.max(Number(p.owned),Number(cash.owned)||0);item.enabled=false;item.disabled_reason="already_owned";
                }
            }
            products.push(decorateBundle(item));
        });
        rows(paidCatalog.products).forEach(function(p){
            if(!p || typeof p.sku!=="string" || seen[p.sku])return;
            // Recharge has its own balance-side entry, outside the goods list.
            if(p.sku==="u_coin_recharge"&&p.product_type==="recharge")return;
            seen[p.sku]=true;var item=copy(p);item.purchase_method="cash";
            if(p.u_coin_price!==undefined || p.u_coin_per_yuan!==undefined || p.currency==="u_coin"){
                item.currency="u_coin";item.currency_name="G币";item.purchase_method="cash";
                item.enabled=validUPrice(p) && enabled(p.enabled);item.price=p.u_coin_price;
                if(!validUPrice(p))item.disabled_reason="payment_price_unavailable";
            }
            products.push(decorateBundle(item));
        });
        // Presentation metadata never creates a product absent from both formal catalogs.
        update({products:products,categories:categories,
            catalog_hash:paidCatalog.catalog_hash,alipay:paidCatalog.alipay,error:paidCatalog.error});
    }
    function updatePaid(data){paidCatalog=data||{products:[],categories:[]};mergeCatalogs();}
    cfg.SurvivalCommerceView={
        Open:function(){if(!live())return;opened=true;if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());if(detailsDisposed)rebuildDetails();store.menu.Open();watchLoading();if(cfg.SurvivalPayments && cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog();if(cfg.SurvivalCommerceWallet)cfg.SurvivalCommerceWallet.Refresh();},
        SelectCategory:function(id){if(!live())return false;var choices=M?K.Groups(catalog):rows(catalog.categories);if(!choices.some(function(c){return c.id===id;}))return false;category=id;page=0;render();return true;},
        SelectPurchaseType:selectPurchaseType,
        Close:close,UpdateCatalog:updatePaid,UpdateWalletCatalog:function(data){walletCatalog=data;mergeCatalogs();},IsOpen:function(){return opened;},
        OpenRecharge:function(){
            var payments=cfg.SurvivalPayments;
            if(!live()||!payments||!payments.Checkout)return false;
            if(payments.Checkout("u_coin_recharge")){hideCheckoutDetails();return true;}
            return false;
        },
        SetNotice:function(message){if(live())notice.text=message;},
        OpenTicketPurchase:function(pool){
            if(pool && typeof pool==="object"){if(pool.ticket_content_id&&pool.ticket_content_id!=="special_lottery_ticket")return false;pool=pool.id;}
            var payments=cfg.SurvivalPayments;
            if(!live() || !pool || pool==="map" || !payments || !payments.Checkout)return false;
            if(payments.GetCatalog)updatePaid(payments.GetCatalog());
            var item=singleTicket();
            if(item)return checkout(item);
            if(!payments.RefreshCatalog)return false;
            // Opening directly from lottery can precede the first shop snapshot.
            // Show progress and continue to checkout when that catalog arrives.
            category="all";opened=true;render();store.menu.Open();ticketRequest=true;
            notice.text="正在加载金色抽奖券商品…";payments.RefreshCatalog();return true;
        },
        Inspect:function(){var path=[],p=store&&store.panel,hasPanel=valid(p);while(valid(p) && path.length<10){path.push({id:p.id,classes:p.GetClasses?p.GetClasses():[],visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,visibility:p.style.visibility,opacity:p.style.opacity,z:p.style.zIndex,clip:p.style.clip});p=p.GetParent();}
            return {category:category,purchaseType:purchaseType,page:page,opened:opened,valid:hasPanel,visible:hasPanel?store.panel.visible:false,
            batchSize:M?batchSize:24,loadedProductCount:loadedCount,filteredProductCount:listItems.length,hasMoreProducts:loadedCount<listItems.length,
            scroll:valid(store.content)?{height:store.content.actuallayoutheight,contentHeight:store.content.contentheight,offset:store.content.scrolloffset_y}:null,
            layout:M?"black_lion_list":"archive_v10",skinVersion:store.menu.skinVersion||0,referenceWidth:store.menu.width,referenceHeight:store.menu.height,groups:M?K.Groups(catalog):[],width:hasPanel?store.panel.actuallayoutwidth:0,height:hasPanel?store.panel.actuallayoutheight:0,
            productCount:rows(catalog.products).filter(function(item){return !M||K.IsListed(item);}).length,catalogProductCount:rows(catalog.products).length,
            visibleSkus:M?(category==="home"?(K.HomeProducts?K.HomeProducts(rows(catalog.products)):[]):K.SortProducts(rows(catalog.products).filter(function(item){return K.InGroup(item,category);}),category)).filter(matchesPurchaseType).map(function(item){return item.home_display_id||item.sku;}):[],path:path};},
        Dispose:function(){if(disposed)return;disposed=true;opened=false;ticketRequest=false;stopLoading();hideDetails();if(store&&store.menu)store.menu.Dispose();if(store)[store.panel,store.scrim].forEach(function(p){if(valid(p))p.DeleteAsync(0);});}
    };
    if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());
    if(cfg.SurvivalCommerceWallet){walletCatalog=cfg.SurvivalCommerceWallet.GetCatalog();mergeCatalogs();}
    // Tools-only visual inspection uses the existing authenticated catalog and never checks out.
    if(Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand){
        function inspectVisual(){ $.Msg("[COMMERCE_JADE] "+JSON.stringify(cfg.SurvivalCommerceView.Inspect())); }
        cfg.SurvivalCommerceVisual={Category:function(id){if(!live())return;category=id;page=0;render();},Technology:function(){if(!live())return;category="all";page=0;render();},Hover:function(on){if(!live())return;grid.Children().forEach(function(p,i){if(!valid(p))return;p.SetHasClass("CJVisualHover",false);if(on!==false&&i===1&&p.__purpleShow)p.__purpleShow(false);else if(p.__purpleHide)p.__purpleHide();});},Geometry:function(){var p=store&&store.panel;if(!valid(p))return {valid:false,children:[]};return {valid:true,window:p.GetPositionWithinWindow(),scale:root.actualuiscale_x,classes:p.BHasClass("UIClosed"),visible:p.visible,children:p.Children().filter(valid).map(function(c){return {type:c.paneltype,visible:c.visible,pos:c.GetPositionWithinWindow(),width:c.actuallayoutwidth,height:c.actuallayoutheight};})};}};
        // Commands retain their creating JS context; use a generation suffix after hot reload.
        var suffix=String(Date.now()),commands={open:"survival_commerce_open_"+suffix,close:"survival_commerce_close_"+suffix,technology:"survival_commerce_technology_"+suffix,hover:"survival_commerce_hover_"+suffix,inspect:"survival_commerce_inspect_"+suffix};
        Game.AddCommand(commands.open,function(){cfg.SurvivalCommerceView.Open();inspectVisual();},"Open live mall; no checkout",0);
        Game.AddCommand(commands.close,function(){cfg.SurvivalCommerceView.Close();},"Close visual mall",0);
        Game.AddCommand(commands.technology,function(){cfg.SurvivalCommerceVisual.Technology();inspectVisual();},"Inspect technology category",0);
        Game.AddCommand(commands.hover,function(){cfg.SurvivalCommerceVisual.Hover();inspectVisual();},"Show card hover for inspection",0);
        commands.normal="survival_commerce_normal_"+suffix;
        Game.AddCommand(commands.normal,function(){cfg.SurvivalCommerceVisual.Hover(false);},"Clear visual hover",0);
        ["home","bundles","promotions","vip","all"].forEach(function(id){commands[id]="survival_commerce_"+id+"_"+suffix;Game.AddCommand(commands[id],function(){cfg.SurvivalCommerceVisual.Category(id);},"Inspect actual category; no checkout",0);});
        Game.AddCommand(commands.inspect,function(){$.Msg("[COMMERCE_JADE_GEOMETRY] "+JSON.stringify(cfg.SurvivalCommerceVisual.Geometry()));},"Inspect current mall geometry",0);
        $.Msg("[COMMERCE_JADE_COMMANDS] "+JSON.stringify(commands));
    }
}());
