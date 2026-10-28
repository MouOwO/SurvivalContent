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
    // Public build quotes have their own presentation state. They never replace
    // authenticated balances, ownership, eligibility or payment catalogues.
    var readonlyCatalog=null, readonlyOwner=null;
    function realMoneyEnabled(){var payments=cfg.SurvivalPayments;return paidCatalog.real_money_enabled!==false&&!!payments&&typeof payments.IsRealMoneyEnabled==="function"&&payments.IsRealMoneyEnabled()===true;}
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
    function close() {
        opened=false;ticketRequest=false;stopLoading();hideDetails();if(store&&store.menu)store.menu.Close();
        if(readonlyCatalog){readonlyCatalog=null;readonlyOwner=null;revision="";if(store.menu.SetReadonly)store.menu.SetReadonly(false);mergeCatalogs();}
    }
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
        props.index=i;props.catalog=catalog;props.readOnly=!!readonlyCatalog;
        if(props.readOnly)props.effect=readonlyDetail(item);
        var card=M?M.Row(grid,item,props):bundles?J.Bundle(grid,item,props):J.Product(grid,item,props);
        if(props.readOnly)card.__readonlyOffer=item.offer_id;
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
        if(!live()||!item||readonlyCatalog||item.read_only===true)return false;
        if(M&&K&&!K.IsActionable(item)){notice.text=K.DisabledMessage(item)||"此商品当前不可购买。";return false;}
        if(item.preview_only || item.disabled_reason==="bundle_pending_assets"){notice.text=item.disabled_message||"此礼包尚未开放购买。";return false;}
        if(item.disabled_reason==="payment_catalog_pending" || item.disabled_reason==="payment_product_unavailable" || item.disabled_reason==="payment_price_unavailable"){
            notice.text=item.disabled_reason==="payment_catalog_pending"?"商品目录正在连接，请稍后重试。":"此商品暂未开放，请稍后重试。";
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
    function purchaseLabel(item) { if(item.disabled_reason==="bundle_pending_assets")return "待开放 · 查看";return item.purchase_method==="wallet"?"查看 / 兑换":item.disabled_reason==="payment_catalog_pending"?"连接商品目录":item.disabled_reason==="payment_product_unavailable" || item.disabled_reason==="payment_price_unavailable"?"暂未开放":enabled(item.enabled)?"查看 / 购买":item.owned>0?"已拥有 · 查看":"查看奖励"; }
    function noticeText(){
        if(readonlyCatalog)return readonlyCatalog.products.length+" 项配置 · 收款/兑换未开放 · 余额/持有/剩余限购未知";
        return walletCatalog.error||"";
    }
    function singleTicket(ticketId) {
        // A bundle containing tickets is not a single-ticket purchase.
        return rows(catalog.products).filter(function(p){
            var rewards=rows(p.reward_lines);
            return p.product_type==="single" && rewards.length===1 && rewards[0].kind==="item"
                && rewards[0].id===(ticketId||"special_lottery_ticket") && Number(rewards[0].quantity)===1;
        })[0];
    }
    function isGoldenProduct(item){var r=rows(item.reward_lines);return item.product_type==="single"&&r.length===1&&r[0].id==="special_lottery_ticket";}
    function rewardLabel(reward){return reward.id==="special_lottery_ticket"?"金色抽奖券":reward.label;}
    function productIcon(item){return isGoldenProduct(item)?"custom_game/lottery_tickets_v2/gold_ticket.png":item.icon;}
    function rewardText(item) { return rows(item.reward_lines).map(function(r){return rewardLabel(r)+" "+(J.RewardAmount?J.RewardAmount(r.quantity):String(r.quantity));}).join("\n"); }
    function refreshResources(){var b=readonlyCatalog?{}:walletCatalog.balances||{};store.menu.SetResources([{icon:"gold",name:"G币",value:b.u_coin},{icon:"purple_gem",name:"积分",value:b.shop_points}]);}
    function matchesPurchaseType(item){var model=cfg.SurvivalBlackLionMarketModel;return purchaseType==="all"||(readonlyCatalog?item.currency===purchaseType:!!model&&model.MatchesPurchaseType(item,purchaseType));}
    function readonlyGroup(item,id){
        if(id==="all")return true;
        var vip=Number(item.required_vip_level)>0||item.category_id==="vip";
        if(id==="vip")return vip;
        if(id==="bundles")return item.product_type==="bundle"&&!vip;
        if(id==="home")return item.product_type!=="bundle"&&!vip;
        // Public quotes carry no authoritative promotion/reference price.
        return false;
    }
    function groups(){return readonlyCatalog?[{id:"home",label:"首页"},{id:"bundles",label:"礼包"},{id:"promotions",label:"促销"},{id:"vip",label:"VIP"},{id:"all",label:"全部商品"}].map(function(group){return {id:group.id,label:group.label,count:readonlyCatalog.products.filter(function(item){return readonlyGroup(item,group.id);}).length};}):M?K.Groups(catalog):rows(catalog.categories);}
    function readonlyPrice(item){return item.currency==="CNY"?"¥"+(item.price/100).toFixed(2):item.price+" "+({u_coin:"G币",shop_points:"商城积分",shop_gold:"商城金币"}[item.currency]||"");}
    function readonlyDetail(item){
        return (item.description?item.description+"\n\n":"")+"配置售价："+readonlyPrice(item)+"\n配置限购："+(item.purchase_limit?item.purchase_limit+" 次":"不限次数")+"；本账号剩余：未知\nVIP 门槛："+(item.required_vip_level||"无")+"；当前资格：未知\n配置奖励（本局不发放）：\n"+rows(item.reward_lines).map(function(line){return line.label+" ×"+line.quantity+(line.duration_days?"（"+line.duration_days+"天）":"");}).join("\n");
    }
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
        var categories=groups(), products=rows(catalog.products).filter(function(item){return !!readonlyCatalog||!M||K.IsListed(item);});
        if(!categories.some(function(c){return c.id===category;})) category=(categories[0]||{}).id||"home";
        store.menu.SetSidebar(categories.map(function(c){return {id:c.id,label:c.label,count:c.count};}),category,function(id){category=id;page=0;render();});
        refreshResources();
        var items=readonlyCatalog?products.filter(function(item){return readonlyGroup(item,category);}):M&&category==="home"?(K.HomeProducts?K.HomeProducts(products):[]):products.filter(function(p){return M?K.InGroup(p,category):p.category_id===category;});
        if(K&&K.SortProducts)items=K.SortProducts(items,category);
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
        var next=JSON.stringify({categories:catalog.categories,hash:catalog.catalog_hash,products:rows(catalog.products).map(function(p){return [p.sku,p.enabled,p.owned,p.purchase_limit,p.max_quantity,p.required_vip_level,p.disabled_message,p.original_price,p.original_u_coin_price,p.price_policy,p.amount_fen,p.price,p.currency,p.u_coin_price,p.u_coin_per_yuan,p.purchase_method,p.disabled_reason,p.title,p.description,p.category_id,p.product_type,p.icon,p.reward_lines];})});
        if(next!==revision){revision=next;render();}
        // Updating a connection notice must not destroy hovered cards or clear products.
        notice.text=noticeText();refreshResources();
        if(ticketRequest){
            var requestedTicket=ticketRequest;
            ticketRequest=false;
            var item=singleTicket(requestedTicket);
            if(!item || !checkout(item))notice.text=catalog.error || "抽奖券暂未上架，请稍后重试。";
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
        if(readonlyCatalog)return;
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
            if(p.currency==="u_coin" && realMoneyEnabled()){
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
            if(p.currency==="u_coin" && !realMoneyEnabled()){
                // This route spends the authenticated in-game wallet. It must
                // never inherit prices or cash eligibility from a paid row.
                item.purchase_method="wallet";item.currency_name="G币";
                delete item.amount_fen;delete item.u_coin_price;delete item.u_coin_per_yuan;
            }
            products.push(decorateBundle(item));
        });
        rows(paidCatalog.products).forEach(function(p){
            if(!realMoneyEnabled())return;
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
    function arcadeReadonly(){var view=cfg.SurvivalArcadeReadOnlyShop;return view&&typeof view.IsAvailable==="function"&&view.IsAvailable()?view:null;}
    function publicSnapshot(data){
        function integer(value,low,high){return typeof value==="number"&&isFinite(value)&&value%1===0&&value>=low&&value<=high;}
        function identifier(value){return typeof value==="string"&&/^[a-z][a-z0-9_]{0,95}$/.test(value);}
        function copyText(value,maximum){return typeof value==="string"&&value.length<=maximum&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value);}
        if(!data||data.schema_version!==1||data.checkout_enabled!==false||typeof data.catalog_sha256!=="string"||!/^[a-f0-9]{64}$/.test(data.catalog_sha256)||!Array.isArray(data.products)||!data.products.length||data.products.length>1024||!Array.isArray(data.categories)||!data.categories.length||data.categories.length>128)return null;
        var offers=Object.create(null),categoryIds=Object.create(null),categories=[],items=[];
        for(var c=0;c<data.categories.length;c++){
            var categoryRow=data.categories[c];
            if(!categoryRow||!identifier(categoryRow.id)||categoryIds[categoryRow.id]||!copyText(categoryRow.label,100)||!categoryRow.label)return null;
            categoryIds[categoryRow.id]=true;categories.push({id:categoryRow.id,label:categoryRow.label});
        }
        for(var i=0;i<data.products.length;i++){
            var p=data.products[i],cash=p&&p.currency==="CNY";
            if(!p||!identifier(p.sku)||!identifier(p.product_type)||!categoryIds[p.category_id]||p.offer_id!==(cash?"cash:":"wallet:")+p.sku||offers[p.offer_id]||["CNY","u_coin","shop_points","shop_gold"].indexOf(p.currency)<0||!integer(p.price,0,9007199254740991)||!copyText(p.title,256)||!p.title||!copyText(p.description,4000)||!integer(p.purchase_limit,0,9007199254740991)||!integer(p.required_vip_level,0,1000000)||!Array.isArray(p.reward_lines)||p.reward_lines.length>256)return null;
            var rewards=[];
            for(var r=0;r<p.reward_lines.length;r++){
                var line=p.reward_lines[r];
                if(!line||!identifier(line.kind)||!copyText(line.id,160)||!line.id||!copyText(line.label,256)||typeof line.quantity!=="number"||!isFinite(line.quantity)||line.quantity<=0||line.quantity>9007199254740991||(line.duration_days!==undefined&&!integer(line.duration_days,1,3650000)))return null;
                var reward={id:line.id,kind:line.kind,label:line.label,quantity:line.quantity};if(line.duration_days!==undefined)reward.duration_days=line.duration_days;rewards.push(reward);
            }
            offers[p.offer_id]=true;
            var item={offer_id:p.offer_id,sku:p.sku,title:p.title,description:p.description,category_id:p.category_id,product_type:p.product_type,currency:p.currency,price:p.price,purchase_limit:p.purchase_limit,required_vip_level:p.required_vip_level,
                purchase_method:cash?"cash":"wallet",currency_name:{CNY:"人民币",u_coin:"G币",shop_points:"商城积分",shop_gold:"商城金币"}[p.currency],read_only:true,
                reward_lines:rewards};
            if(cash)item.amount_fen=p.price;
            items.push(item);
        }
        return {products:items,categories:categories,catalog_hash:data.catalog_sha256};
    }
    cfg.SurvivalCommerceView={
        Open:function(){if(!live())return;var arcade=arcadeReadonly();if(arcade)return arcade.Open();if(readonlyCatalog)close();opened=true;if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());if(detailsDisposed)rebuildDetails();store.menu.Open();watchLoading();if(cfg.SurvivalPayments && cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog();if(cfg.SurvivalCommerceWallet)cfg.SurvivalCommerceWallet.Refresh();},
        OpenReadonly:function(data,owner){
            if(!live()||!M||!owner)return false;
            var snapshot=publicSnapshot(data);if(!snapshot)return false;
            stopLoading();hideDetails();readonlyCatalog=snapshot;readonlyOwner=owner;ticketRequest=false;category="all";purchaseType="all";page=0;revision="";
            if(store.menu.SetReadonly)store.menu.SetReadonly(true);
            update(snapshot);opened=true;store.menu.Open();watchLoading();return true;
        },
        CloseReadonly:function(owner){if(!disposed&&readonlyCatalog&&readonlyOwner===owner){close();return true;}return false;},
        IsReadonlyOpen:function(owner){return live()&&opened&&!!readonlyCatalog&&readonlyOwner===owner;},
        SelectCategory:function(id){if(!live())return false;var choices=groups();if(!choices.some(function(c){return c.id===id;}))return false;category=id;page=0;render();return true;},
        RefreshPaymentCapability:function(){if(!live())return;if(store.menu.SetReadonly)store.menu.SetReadonly(!!readonlyCatalog);mergeCatalogs();},
        SelectPurchaseType:selectPurchaseType,
        Close:close,UpdateCatalog:updatePaid,UpdateWalletCatalog:function(data){walletCatalog=data;mergeCatalogs();},IsOpen:function(){return opened;},
        OpenRecharge:function(){
            var payments=cfg.SurvivalPayments;
            if(!live()||readonlyCatalog||arcadeReadonly()||!realMoneyEnabled()||!payments||!payments.Checkout)return false;
            if(payments.Checkout("u_coin_recharge")){hideCheckoutDetails();return true;}
            return false;
        },
        SetNotice:function(message){if(live())notice.text=message;},
        OpenTicketPurchase:function(pool){
            var ticketId=pool==="map"?"lottery_ticket":"special_lottery_ticket";
            if(pool && typeof pool==="object"){ticketId=pool.ticket_content_id||(pool.id==="map"?"lottery_ticket":"special_lottery_ticket");pool=pool.id;}
            if(ticketId!=="lottery_ticket"&&ticketId!=="special_lottery_ticket")return false;
            var payments=cfg.SurvivalPayments;
            if(!live() || readonlyCatalog || arcadeReadonly() || !pool || !payments || !payments.Checkout)return false;
            if(payments.GetCatalog)updatePaid(payments.GetCatalog());
            var item=singleTicket(ticketId);
            if(item)return checkout(item);
            if(!payments.RefreshCatalog)return false;
            // Opening directly from lottery can precede the first shop snapshot.
            // Show progress and continue to checkout when that catalog arrives.
            category="all";opened=true;render();store.menu.Open();ticketRequest=ticketId;
            notice.text="正在加载抽奖券商品…";payments.RefreshCatalog();return true;
        },
        Inspect:function(){var path=[],p=store&&store.panel,hasPanel=valid(p);while(valid(p) && path.length<10){path.push({id:p.id,classes:p.GetClasses?p.GetClasses():[],visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,visibility:p.style.visibility,opacity:p.style.opacity,z:p.style.zIndex,clip:p.style.clip});p=p.GetParent();}
            return {category:category,purchaseType:purchaseType,page:page,opened:opened,readOnly:!!readonlyCatalog,valid:hasPanel,visible:hasPanel?store.panel.visible:false,
            batchSize:M?batchSize:24,loadedProductCount:loadedCount,filteredProductCount:listItems.length,hasMoreProducts:loadedCount<listItems.length,
            scroll:valid(store.content)?{height:store.content.actuallayoutheight,contentHeight:store.content.contentheight,offset:store.content.scrolloffset_y}:null,
            layout:M?"black_lion_list":"archive_v10",skinVersion:store.menu.skinVersion||0,referenceWidth:store.menu.width,referenceHeight:store.menu.height,groups:groups(),width:hasPanel?store.panel.actuallayoutwidth:0,height:hasPanel?store.panel.actuallayoutheight:0,
            productCount:rows(catalog.products).filter(function(item){return !!readonlyCatalog||!M||K.IsListed(item);}).length,catalogProductCount:rows(catalog.products).length,
            visibleSkus:readonlyCatalog?listItems.map(function(item){return item.offer_id;}):M?(category==="home"?(K.HomeProducts?K.HomeProducts(rows(catalog.products)):[]):K.SortProducts(rows(catalog.products).filter(function(item){return K.InGroup(item,category);}),category)).filter(matchesPurchaseType).map(function(item){return item.home_display_id||item.sku;}):[],path:path};},
        Dispose:function(){if(disposed)return;disposed=true;opened=false;readonlyCatalog=null;readonlyOwner=null;ticketRequest=false;stopLoading();hideDetails();if(store&&store.menu)store.menu.Dispose();if(store)[store.panel,store.scrim].forEach(function(p){if(valid(p))p.DeleteAsync(0);});}
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
