// The original shop presentation, backed exclusively by the authenticated catalog.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), U=cfg.SurvivalUI, R=cfg.RemainingHandoff, root=$.GetContextPanel();
    if (cfg.SurvivalCommerceView) cfg.SurvivalCommerceView.Dispose();
    delete cfg.SurvivalCommercePreviewData;
    if (!U || !R) { delete cfg.SurvivalCommerceView; return; }
    var disposed=false, category="", catalog={products:[],categories:[]}, revision="", opened=false, ticketRequest=false;
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
        if(disposed || !item || !cfg.SurvivalPayments || !cfg.SurvivalPayments.Checkout)return false;
        close();cfg.SurvivalPayments.Checkout(item.sku);return true;
    }
    function purchaseLabel(item) { return item.enabled?"查看 / 购买":item.owned>0?"已拥有 · 查看":"查看奖励"; }
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
    function rewardText(item) { return rows(item.reward_lines).map(function(r){return rewardLabel(r)+" ×"+r.quantity;}).join("\n"); }
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
        notice.text=catalog.error?catalog.error:categories.length?(catalog.alipay?"微信 / 支付宝":"微信支付")+" · 付款前请核对商品和全部奖励":"正在加载商品，请先完成对局登录。";
        if(categories.length && !items.length) { var empty=text(grid,"本分类暂无上架商品","RCProductEffect");empty.style.width="900px";return; }
        items.forEach(function(item,i){
            var card=U.ProductCard(grid,{name:"",prices:[{amount:(item.amount_fen/100).toFixed(2),currencyName:"元"}]});
            card.AddClass("RCProduct");card.SetHasClass("RCFourth",i%4===3);card.SetHasClass("RCSecond",i%2===1);
            R.Image(card,bundles?"shop_bundle_compact":"shop_card_normal_native","RCCardBase");
            var caption=text(card,isGoldenProduct(item)?"金色抽奖券 ×"+rows(item.reward_lines)[0].quantity:item.title,"RCProductName");caption.style.width="fit-children";caption.style.maxWidth=bundles?"496px":"205px";caption.style.horizontalAlign="center";caption.style.position=bundles?"0px 12px 0px":"0px 199px 0px";
            if(bundles) {
                var contents=panel("Panel",card,"RCBundleContents");
                rows(item.reward_lines).forEach(function(r){var slot=panel("Panel",contents,"RCBundleItem");image(slot,r.id==="special_lottery_ticket"?"custom_game/lottery_tickets_v2/gold_ticket.png":item.icon,"RCBundleArt");text(slot,rewardLabel(r),"RCBundleName");text(slot,"×"+r.quantity,"RCBundleQuantity");});
                action(card,purchaseLabel(item),function(){checkout(item);},"RCBundleBuy");
            } else {
                image(card,productIcon(item),"RCProductArt");var hover=panel("Panel",card,"RCProductHover");R.Image(hover,"shop_product_hover_scrim","RCHoverScrim");
                text(hover,rewardText(item)||item.description,"RCProductEffect");action(hover,purchaseLabel(item),function(){checkout(item);},"RCProductBuy");
                if(!item.enabled)text(card,item.owned>0?"已拥有":"暂不可购","RCStockState");
            }
        });
    }
    function update(data) {
        catalog=data||{products:[],categories:[]};
        // Keep hovered cards stable when only numeric previews have changed.
        var next=JSON.stringify({categories:catalog.categories,error:catalog.error,hash:catalog.catalog_hash,products:rows(catalog.products).map(function(p){return [p.sku,p.enabled,p.owned,p.amount_fen,p.disabled_reason];})});
        if(next!==revision){revision=next;render();}
        if(ticketRequest){
            ticketRequest=false;
            var item=singleTicket();
            if(!item || !checkout(item))notice.text=catalog.error || "金色抽奖券暂未上架，请稍后重试。";
        }
    }
    cfg.SurvivalCommerceView={
        Open:function(){if(disposed)return;opened=true;if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)update(cfg.SurvivalPayments.GetCatalog());render();store.shell.Open();if(cfg.SurvivalPayments && cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog();},
        Close:close,UpdateCatalog:update,
        OpenTicketPurchase:function(pool){
            if(pool && typeof pool==="object"){if(pool.ticket_content_id&&pool.ticket_content_id!=="special_lottery_ticket")return false;pool=pool.id;}
            var payments=cfg.SurvivalPayments;
            if(disposed || !pool || ["dragon_knight","summer"].indexOf(pool)<0 || !payments || !payments.Checkout)return false;
            if(payments.GetCatalog)update(payments.GetCatalog());
            var item=singleTicket();
            if(item)return checkout(item);
            if(!payments.RefreshCatalog)return false;
            // Opening directly from lottery can precede the first shop snapshot.
            // Show progress and continue to checkout when that catalog arrives.
            category="item";opened=true;render();store.shell.Open();ticketRequest=true;
            notice.text="正在加载金色抽奖券商品…";payments.RefreshCatalog();return true;
        },
        Inspect:function(){var path=[],p=store.panel;while(p && p.IsValid() && path.length<10){path.push({id:p.id,visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,visibility:p.style.visibility,opacity:p.style.opacity});p=p.GetParent();}
            return {category:category,opened:opened,valid:store.panel.IsValid(),visible:store.panel.visible,
            width:store.panel.actuallayoutwidth,height:store.panel.actuallayoutheight,productCount:rows(catalog.products).length,path:path};},
        Dispose:function(){if(disposed)return;disposed=true;store.shell.Dispose();[store.panel,store.scrim].forEach(function(p){if(p.IsValid())p.DeleteAsync(0);});}
    };
    if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)update(cfg.SurvivalPayments.GetCatalog());
}());
