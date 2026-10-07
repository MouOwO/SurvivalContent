// The original shop presentation, backed exclusively by the authenticated catalog.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), U=cfg.SurvivalUI, R=cfg.RemainingHandoff, J=cfg.SurvivalCommerceComponents, root=$.GetContextPanel();
    if (cfg.SurvivalCommerceView) cfg.SurvivalCommerceView.Dispose();
    delete cfg.SurvivalCommercePreviewData;
    if (!U || !R || !J) { delete cfg.SurvivalCommerceView; return; }
    var disposed=false, category="", page=0, catalog={products:[],categories:[]}, revision="", opened=false, ticketRequest=false;
    var paidCatalog={products:[],categories:[]}, walletCatalog={products:[],categories:[],balances:{}};
    function rows(value) { return Array.isArray(value)?value:Object.keys(value||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];}); }
    function panel(type,parent,cls) { var n=$.CreatePanel(type,parent,""); if(cls)n.AddClass(cls); return n; }
    function text(parent,value,cls) { var n=panel("Label",parent,cls);n.text=String(value);n.hittest=false;return n; }
    function close() { opened=false;ticketRequest=false;store.shell.Close(); }
    function modal() {
        return J.Window(root,close);
    }
    var store=modal(), tabs=panel("Panel",store.panel,"RCTabs"), grid=panel("Panel",store.panel,"RCGrid");
    var notice=text(store.panel,"正在加载商品…","RCNotice"),pager=panel("Panel",store.panel,"CJPager");
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
    function isGoldenProduct(item){var r=rows(item.reward_lines);return item.product_type==="single"&&r.length===1&&r[0].id==="special_lottery_ticket";}
    function rewardLabel(reward){return reward.id==="special_lottery_ticket"?"金色抽奖券":reward.label;}
    function productIcon(item){return isGoldenProduct(item)?"custom_game/lottery_tickets_v2/gold_ticket.png":item.icon;}
    function rewardText(item) { return rows(item.reward_lines).map(function(r){return rewardLabel(r)+" ×"+r.quantity;}).join("\n"); }
    function render() {
        if(disposed)return;
        tabs.RemoveAndDeleteChildren();grid.RemoveAndDeleteChildren();pager.RemoveAndDeleteChildren();
        var categories=rows(catalog.categories), products=rows(catalog.products);
        if(!categories.some(function(c){return c.id===category;})) category=(categories.filter(function(c){return products.some(function(p){return p.category_id===c.id;});})[0]||categories[0]||{}).id||"";
        categories.forEach(function(c,i){J.Nav(tabs,c,i,c.id===category,function(){category=c.id;page=0;render();});});
        var items=products.filter(function(p){return p.category_id===category;});
        var bundles=items.length>0 && items.every(function(p){return p.product_type==="bundle";});grid.SetHasClass("RCBundles",bundles);
        notice.text=noticeText();
        if(categories.length && !items.length) { text(grid,"本分类暂无上架商品","CJEmpty");return; }
        var perPage=bundles?4:8,totalPages=Math.max(1,Math.ceil(items.length/perPage));page=Math.max(0,Math.min(page,totalPages-1));
        items.slice(page*perPage,(page+1)*perPage).forEach(function(item,i){
            var props={rewards:rows(item.reward_lines),effect:rewardText(item)||item.description,purchaseLabel:purchaseLabel(item),action:function(){checkout(item);}};
            var card=bundles?J.Bundle(grid,item,props):J.Product(grid,item,props);
            J.Box(card,(i%(bundles?2:4))*(bundles?624:312),Math.floor(i/(bundles?2:4))*366,bundles?608:296,348);
        });
        if(totalPages>1){
            function turn(label,delta,enabled){var b=panel("Button",pager,"CJPageAction");text(b,label,"");b.enabled=enabled;b.SetPanelEvent("onactivate",function(){if(b.enabled){page+=delta;render();}});}
            turn("上一页",-1,page>0);text(pager,(page+1)+" / "+totalPages+" · "+items.length+"件","CJPageLabel");turn("下一页",1,page<totalPages-1);
        }
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
            if(!item || !checkout(item))notice.text=catalog.error || "金色抽奖券暂未上架，请稍后重试。";
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
            if(pool && typeof pool==="object"){if(pool.ticket_content_id&&pool.ticket_content_id!=="special_lottery_ticket")return false;pool=pool.id;}
            var payments=cfg.SurvivalPayments;
            if(disposed || !pool || pool==="map" || !payments || !payments.Checkout)return false;
            if(payments.GetCatalog)updatePaid(payments.GetCatalog());
            var item=singleTicket();
            if(item)return checkout(item);
            if(!payments.RefreshCatalog)return false;
            // Opening directly from lottery can precede the first shop snapshot.
            // Show progress and continue to checkout when that catalog arrives.
            category="item";opened=true;render();store.shell.Open();ticketRequest=true;
            notice.text="正在加载金色抽奖券商品…";payments.RefreshCatalog();return true;
        },
        Inspect:function(){var path=[],p=store.panel;while(p && p.IsValid() && path.length<10){path.push({id:p.id,classes:p.GetClasses?p.GetClasses():[],visible:p.visible,width:p.actuallayoutwidth,height:p.actuallayoutheight,visibility:p.style.visibility,opacity:p.style.opacity,z:p.style.zIndex,clip:p.style.clip});p=p.GetParent();}
            return {category:category,page:page,opened:opened,valid:store.panel.IsValid(),visible:store.panel.visible,
            width:store.panel.actuallayoutwidth,height:store.panel.actuallayoutheight,productCount:rows(catalog.products).length,path:path};},
        Dispose:function(){if(disposed)return;disposed=true;store.shell.Dispose();[store.panel,store.scrim].forEach(function(p){if(p.IsValid())p.DeleteAsync(0);});}
    };
    if(cfg.SurvivalPayments && cfg.SurvivalPayments.GetCatalog)updatePaid(cfg.SurvivalPayments.GetCatalog());
    if(cfg.SurvivalCommerceWallet){walletCatalog=cfg.SurvivalCommerceWallet.GetCatalog();mergeCatalogs();}
    // Tools-only visual inspection uses the existing authenticated catalog and never checks out.
    if(Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand){
        function inspectVisual(){ $.Msg("[COMMERCE_JADE] "+JSON.stringify(cfg.SurvivalCommerceView.Inspect())); }
        cfg.SurvivalCommerceVisual={Category:function(id){category=id;page=0;render();},Technology:function(){category="technology";page=0;render();},Hover:function(on){grid.Children().forEach(function(p,i){p.SetHasClass("CJVisualHover",on!==false && i===1);});},Geometry:function(){var p=store.panel;return {valid:p.IsValid(),window:p.GetPositionWithinWindow(),scale:root.actualuiscale_x,classes:p.BHasClass("UIClosed"),visible:p.visible,children:p.Children().map(function(c){return {type:c.paneltype,visible:c.visible,pos:c.GetPositionWithinWindow(),width:c.actuallayoutwidth,height:c.actuallayoutheight};})};}};
        // Commands retain their creating JS context; use a generation suffix after hot reload.
        var suffix=String(Date.now()),commands={open:"survival_commerce_open_"+suffix,close:"survival_commerce_close_"+suffix,technology:"survival_commerce_technology_"+suffix,hover:"survival_commerce_hover_"+suffix,inspect:"survival_commerce_inspect_"+suffix};
        Game.AddCommand(commands.open,function(){cfg.SurvivalCommerceView.Open();inspectVisual();},"Open live mall; no checkout",0);
        Game.AddCommand(commands.close,function(){cfg.SurvivalCommerceView.Close();},"Close visual mall",0);
        Game.AddCommand(commands.technology,function(){cfg.SurvivalCommerceVisual.Technology();inspectVisual();},"Inspect technology category",0);
        Game.AddCommand(commands.hover,function(){cfg.SurvivalCommerceVisual.Hover();inspectVisual();},"Show card hover for inspection",0);
        commands.normal="survival_commerce_normal_"+suffix;
        Game.AddCommand(commands.normal,function(){cfg.SurvivalCommerceVisual.Hover(false);},"Clear visual hover",0);
        ["weapon","item","challenge","rebirth","bundles"].forEach(function(id){commands[id]="survival_commerce_"+id+"_"+suffix;Game.AddCommand(commands[id],function(){cfg.SurvivalCommerceVisual.Category(id);},"Inspect actual category; no checkout",0);});
        Game.AddCommand(commands.inspect,function(){$.Msg("[COMMERCE_JADE_GEOMETRY] "+JSON.stringify(cfg.SurvivalCommerceVisual.Geometry()));},"Inspect current mall geometry",0);
        $.Msg("[COMMERCE_JADE_COMMANDS] "+JSON.stringify(commands));
    }
}());
