// The original shop presentation, backed exclusively by the authenticated catalog.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), U=cfg.SurvivalUI, R=cfg.RemainingHandoff, root=$.GetContextPanel();
    if (cfg.SurvivalCommerceView) cfg.SurvivalCommerceView.Dispose();
    delete cfg.SurvivalCommercePreviewData;
    if (!U || !R) { delete cfg.SurvivalCommerceView; return; }
    var disposed=false, category="", catalog={products:[],categories:[]}, revision="", opened=false, ticketRequest=false;
    var paidCatalog={products:[],categories:[]}, walletCatalog={products:[],categories:[],balances:{}};
    function rows(value) { return Array.isArray(value)?value:Object.keys(value||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];}); }
    function panel(type,parent,cls) { var n=$.CreatePanel(type,parent,""); if(cls)n.AddClass(cls); return n; }
    function text(parent,value,cls) { var n=panel("Label",parent,cls);n.text=String(value);n.hittest=false;return n; }
    function action(parent,label,fn,cls) { var n=U.ActionButton(parent,{label:label,action:fn});R.Action(n,true);n.AddClass(cls);return n; }
    function close() { opened=false;ticketRequest=false;store.shell.Close(); }
    function modal() {
        var scrim=panel("Button",root,"RCBackdrop"),p=panel("Panel",root,"RCWindow"),header=panel("Panel",p,"RCHeader"),title=text(header,"商城","RCTitle"),x=panel("Button",header,"RCClose");
        var shell=U.ModalShell.Adopt({id:"commerce",root:root,panel:p,header:header,titlePanel:title,scrim:scrim,closeButton:x,width:1210,height:810,fit:{reference:[1672,941]},onClose:close});
        R.Window(p,header,x);R.SizeWindow(p,1210,810);R.Box(header,0,0,1210,84);R.Box(x,1144,22,38,38);shell.Close();return {panel:p,scrim:scrim,shell:shell};
    }
    var store=modal(), tabs=panel("Panel",store.panel,"RCTabs"), grid=panel("Panel",store.panel,"RCGrid");
    var notice=text(store.panel,"正在加载商品…","RCNotice");
    function image(parent,path,cls) {
        var n=panel("Image",parent,cls);
        if(typeof path==="string" && /^custom_game\/[A-Za-z0-9_\/-]+\.png$/.test(path) && path.indexOf("..")<0) n.SetImage("file://{images}/"+path);
        n.SetScaling("stretch-to-fit-preserve-aspect");n.hittest=false;return n;
    }
    function checkout(item) {
        if(item && item.purchase_method==="wallet"){
            if(cfg.SurvivalCommerceWallet && cfg.SurvivalCommerceWallet.Checkout(item.sku)){close();return true;}
            return false;
        }
        if(disposed || !item || !cfg.SurvivalPayments || !cfg.SurvivalPayments.Checkout)return false;
        close();cfg.SurvivalPayments.Checkout(item.sku);return true;
    }
    function purchaseLabel(item) { return item.purchase_method==="wallet"?"查看 / 兑换":item.enabled?"查看 / 购买":item.owned>0?"已拥有 · 查看":"查看奖励"; }
    function noticeText(){
        var b=walletCatalog.balances||{};
        return (walletCatalog.error?walletCatalog.error+" · ":"")+"商城余额："+(b.u_coin||0)+" U币 · "+(b.shop_points||0)+" 积分 · "+(b.shop_gold||0)+" 金币 · 充值暂未开放";
    }
    function singleTicket() {
        // A bundle containing tickets is not a single-ticket purchase.
        return rows(catalog.products).filter(function(p){
            var rewards=rows(p.reward_lines);
            return p.product_type==="single" && rewards.length===1 && rewards[0].kind==="item"
                && rewards[0].id==="special_lottery_ticket" && Number(rewards[0].quantity)===1;
        })[0];
    }
    function rewardText(item) { return rows(item.reward_lines).map(function(r){return r.label+" ×"+r.quantity;}).join("\n"); }
    function render() {
        if(disposed)return;
        tabs.RemoveAndDeleteChildren();grid.RemoveAndDeleteChildren();
        var categories=rows(catalog.categories), products=rows(catalog.products);
        if(!categories.some(function(c){return c.id===category;})) category=(categories.filter(function(c){return products.some(function(p){return p.category_id===c.id;});})[0]||categories[0]||{}).id||"";
        categories.forEach(function(c,i){
            var b=panel("Button",tabs,"RCTab");b.style.width=(1110/categories.length)+"px";R.Tab(b,i===0?0:i===categories.length-1?3:1);R.Image(b,"tab_glow","RCNavGlow");
            text(b,c.label,"RCTabText");b.SetHasClass("UISelected",c.id===category);b.SetPanelEvent("onactivate",function(){category=c.id;render();});
        });
        var items=products.filter(function(p){return p.category_id===category;});
        var bundles=items.length>0 && items.every(function(p){return p.product_type==="bundle";});grid.SetHasClass("RCBundles",bundles);
        notice.text=noticeText();
        if(categories.length && !items.length) { var empty=text(grid,"本分类暂无上架商品","RCProductEffect");empty.style.width="900px";return; }
        items.forEach(function(item,i){
            var card=U.ProductCard(grid,{name:"",prices:[{amount:item.purchase_method==="wallet"?item.price:(item.amount_fen/100).toFixed(2),currencyName:item.purchase_method==="wallet"?item.currency_name:"元"}]});
            card.AddClass("RCProduct");card.SetHasClass("RCFourth",i%4===3);card.SetHasClass("RCSecond",i%2===1);
            R.Image(card,bundles?"shop_bundle_compact":"shop_card_normal_native","RCCardBase");
            var caption=text(card,item.title,"RCProductName");caption.style.width="fit-children";caption.style.maxWidth=bundles?"496px":"205px";caption.style.horizontalAlign="center";caption.style.position=bundles?"0px 12px 0px":"0px 199px 0px";
            if(bundles) {
                var contents=panel("Panel",card,"RCBundleContents");
                rows(item.reward_lines).forEach(function(r){var slot=panel("Panel",contents,"RCBundleItem");image(slot,item.icon,"RCBundleArt");text(slot,r.label,"RCBundleName");text(slot,"×"+r.quantity,"RCBundleQuantity");});
                action(card,purchaseLabel(item),function(){checkout(item);},"RCBundleBuy");
            } else {
                image(card,item.icon,"RCProductArt");var hover=panel("Panel",card,"RCProductHover");R.Image(hover,"shop_product_hover_scrim","RCHoverScrim");
                text(hover,rewardText(item)||item.description,"RCProductEffect");action(hover,purchaseLabel(item),function(){checkout(item);},"RCProductBuy");
                if(!item.enabled)text(card,item.owned>0?"已拥有":"暂不可购","RCStockState");
            }
        });
    }
    function update(data) {
        catalog=data||{products:[],categories:[]};
        // Keep hovered cards stable when only numeric previews have changed.
        var next=JSON.stringify({categories:catalog.categories,hash:catalog.catalog_hash,products:rows(catalog.products).map(function(p){return [p.sku,p.enabled,p.owned,p.amount_fen,p.price,p.currency,p.disabled_reason,p.title,p.description,p.category_id,p.product_type,p.icon,p.reward_lines];})});
        if(next!==revision){revision=next;render();}
        // Updating a connection notice must not destroy hovered cards or clear products.
        notice.text=noticeText();
        if(ticketRequest){
            ticketRequest=false;
            var item=singleTicket();
            if(!item || !checkout(item))notice.text=catalog.error || "特殊抽奖券暂未上架，请稍后重试。";
        }
    }
    function mergeCatalogs(){
        var categories=rows(paidCatalog.categories).slice();
        rows(walletCatalog.categories).forEach(function(c){if(!categories.some(function(v){return v.id===c.id;}))categories.push(c);});
        update({products:rows(walletCatalog.products).concat(rows(paidCatalog.products)),categories:categories,
            catalog_hash:paidCatalog.catalog_hash,alipay:paidCatalog.alipay,error:paidCatalog.error});
    }
    function updatePaid(data){paidCatalog=data||{products:[],categories:[]};mergeCatalogs();}
    cfg.SurvivalCommerceView={
        Open:function(){if(disposed)return;opened=true;if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());store.shell.Open();if(cfg.SurvivalPayments && cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog();if(cfg.SurvivalCommerceWallet)cfg.SurvivalCommerceWallet.Refresh();},
        Close:close,UpdateCatalog:updatePaid,UpdateWalletCatalog:function(data){walletCatalog=data;mergeCatalogs();},IsOpen:function(){return opened;},
        SetNotice:function(message){if(!disposed)notice.text=message;},
        OpenTicketPurchase:function(pool){
            if(pool && typeof pool==="object")pool=pool.id;
            var payments=cfg.SurvivalPayments;
            if(disposed || !pool || pool==="map" || !payments || !payments.Checkout)return false;
            if(payments.GetCatalog)updatePaid(payments.GetCatalog());
            var item=singleTicket();
            if(item)return checkout(item);
            if(!payments.RefreshCatalog)return false;
            // Opening directly from lottery can precede the first shop snapshot.
            // Show progress and continue to checkout when that catalog arrives.
            category="item";opened=true;render();store.shell.Open();ticketRequest=true;
            notice.text="正在加载特殊抽奖券商品…";payments.RefreshCatalog();return true;
        },
        Inspect:function(){var path=[],p=store.panel;while(p && p.IsValid() && path.length<10){path.push({id:p.id,visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,visibility:p.style.visibility,opacity:p.style.opacity});p=p.GetParent();}
            return {category:category,opened:opened,valid:store.panel.IsValid(),visible:store.panel.visible,
            width:store.panel.actuallayoutwidth,height:store.panel.actuallayoutheight,productCount:rows(catalog.products).length,path:path};},
        Dispose:function(){if(disposed)return;disposed=true;store.shell.Dispose();[store.panel,store.scrim].forEach(function(p){if(p.IsValid())p.DeleteAsync(0);});}
    };
    if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());
    if(cfg.SurvivalCommerceWallet){walletCatalog=cfg.SurvivalCommerceWallet.GetCatalog();mergeCatalogs();}
}());
