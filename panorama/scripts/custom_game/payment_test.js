var PaymentToggle, PaymentBuy, PaymentOpen, PaymentRefresh, PaymentShop;
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), disposed = false, subscriptions = [];
    if (cfg.SurvivalPayments && cfg.SurvivalPayments.Dispose) cfg.SurvivalPayments.Dispose();
    var products = [], selected = "", orders = {}, busy = false, opened = false, generation = 0, lastMatrix = "", ticks = 0;
    var gameValues={}, gameEntitlements={}, wallet={}, matchFrozen=false, catalog={products:[],categories:[]};
    var entry = $("#PaymentEntry"), dialog = $("#PaymentDialog"), status = $("#PaymentStatus"), buy = $("#PaymentBuy");
    function rows(value) {
        if (Array.isArray(value)) return value;
        return Object.keys(value || {}).sort(function(a,b){return Number(a)-Number(b);}).map(function(key){return value[key];});
    }
    function current() { return products.filter(function(p){return p.sku === selected;})[0]; }
    function money(fen) { return "¥" + (Number(fen) / 100).toFixed(2); }
    function number(value) { return String(Math.round(Number(value)*10000)/10000); }
    function valuesText(p,order) {
        if (!p) return "";
        var lines=rows(p.reward_lines), names={initial_wood:"初始木材",initial_gold:"初始金币",wall_armor:"城墙护甲",wall_initial_health:"城墙初始生命",tower_attack_flat:"箭塔固定攻击"};
        Object.keys(p.effect_labels||{}).forEach(function(field){names[field]=p.effect_labels[field];});
        lines.forEach(function(r){if(r.kind==="stat")names[r.id]=r.label;});
        var text=lines.map(function(r){
            var state=gameEntitlements[r.id], active=state && (state.active===true || state===true);
            return r.label+" ×"+r.quantity+(r.kind==="entitlement" && order && order.state==="delivered" ? active?"（本局已生效）":"（已到账，下局或权限刷新后生效）":"");
        });
        var previews=rows(p.stat_preview);
        var fields=order && order.state!=="closed"?Object.keys(order.effects||{}):previews.map(function(e){return e.field_id;});
        if(order && order.state==="delivered") fields=Object.keys(order.effect_changes||{});
        fields.forEach(function(field){
            var effect=previews.filter(function(e){return e.field_id===field;})[0];
            var receipt=order && order.state==="delivered" && order.effect_changes && order.effect_changes[field];
            var detail=receipt ? "本单存档："+number(receipt.before)+" → "+number(receipt.after)+"（+"+number(receipt.delta)+"）"
                : order && order.state!=="closed" ? "本单加成：+"+number(order.effects[field])
                : effect ? "存档："+number(effect.value)+(p.enabled?" → "+number(effect.after)+"（购买后）":"") : "";
            if(gameValues[field]!==undefined)detail+=" · 本局："+number(gameValues[field]);
            var resource=field==="initial_wood"?"wood":field==="initial_gold"?"gold":null;
            if(resource && wallet[resource]!==undefined)detail+=" · 当前"+(resource==="wood"?"木材":"金币")+"："+number(wallet[resource]);
            text.push((names[field]||field)+" — "+detail);
        });
        if(matchFrozen)text.push("本局已结算冻结，新奖励下局生效。");
        return text.join("\n");
    }
    function validURL(url) { return typeof url === "string" && /^https:\/\/pay\.xiaofengnet\.com\/checkout\?order=WX[0-9a-f]{30}&token=[0-9a-f]{64}$/.test(url); }
    function terminal(state) { return ["delivered", "paid_review", "closed"].indexOf(state) >= 0; }
    function drawQR(matrix) {
        var parent = $("#PaymentQR");
        if (typeof matrix !== "string" || !/^[01|]+$/.test(matrix)) { parent.style.visibility = "collapse"; return; }
        var qr = matrix.split("|"), size = qr.length;
        if (size < 29 || size > 65 || qr.some(function(row){return row.length !== size;})) { parent.style.visibility = "collapse"; return; }
        parent.style.visibility = "visible";
        if (lastMatrix === matrix) return;
        lastMatrix = matrix; parent.RemoveAndDeleteChildren();
        var cell = Math.max(4, Math.floor(260 / size));
        parent.style.width = (size * cell) + "px"; parent.style.height = (size * cell) + "px";
        qr.forEach(function(bits) {
            var row = $.CreatePanel("Panel", parent, ""); row.AddClass("PaymentQRRow"); row.style.height = cell + "px";
            for (var start=0; start<size;) {
                var end=start+1; while (end<size && bits[end]===bits[start]) end++;
                var run=$.CreatePanel("Panel",row,""); run.style.width=((end-start)*cell)+"px"; run.style.height=cell+"px";
                run.style.backgroundColor=bits[start]==="1"?"#000000":"#ffffff"; start=end;
            }
        });
    }
    function render() {
        if (disposed) return;
        var p = current(), order = orders[selected];
        var shown=order && order.state!=="closed" ? order : p;
        $("#PaymentTitle").text = shown ? shown.title : "正在加载商品";
        $("#PaymentDescription").text = shown ? shown.description||"" : "请先完成对局登录";
        $("#PaymentPrice").text = shown ? money(shown.amount_fen) : "";
        $("#PaymentValues").text = valuesText(shown,order);
        buy.enabled = !busy && !!p && !!p.enabled && (!order || order.state === "closed" || order.state==="delivered");
        $("#PaymentBuyLabel").text = p ? (order && order.state==="delivered"?"再次购买 ":"微信购买 ")+money(order && !terminal(order.state)?order.amount_fen:p.amount_fen) : "加载中";
        var canOpen = order && order.state === "pending" && !order.expired && validURL(order.checkout_url);
        $("#PaymentOpen").style.visibility = canOpen ? "visible" : "collapse";
        $("#PaymentLink").style.visibility = canOpen ? "visible" : "collapse";
        if (canOpen) $("#PaymentLink").text = order.checkout_url;
        drawQR(canOpen ? order.qr_matrix : null);
        if (order) {
            var labels = {created:"订单正在确认，请查询结果后重试。", pending:"用手机微信扫描上方二维码。付款后自动发放并刷新存档。",
                delivered:"支付成功：" + order.title + " 的全部奖励已写入存档。",
                paid_review:"已收到付款，该订单需要人工核对。请保留订单号联系开发者。",
                closed:"订单已关闭，可以重新购买。"};
            status.text = order.expired && !terminal(order.state) ? "付款码已过期，正在核对最终状态。" : labels[order.state] || "正在查询…";
            if (order.state === "created") buy.enabled = !busy && !!p && !!p.enabled;
        } else status.text = p && !p.enabled ? messages[p.disabled_reason] || "此商品暂不可购买。" : "付款后全部奖励一起到账，自动刷新。";
        products.forEach(function(item) {
            if (item.panel) {
                item.panel.SetHasClass("Selected", item.sku === selected);
                item.ownedLabel.text = (item.owned>0?"已购 "+item.owned+" · ":"")+(item.enabled?money(item.amount_fen):"暂不可购买");
            }
        });
    }
    function request(action, sku) {
        if (disposed || busy) return false;
        busy = true; render();
        var ticket = ++generation, body = {action:action};
        if (sku) body.sku = sku;
        GameEvents.SendCustomGameEventToServer("survival_payment_request", body);
        $.Schedule(32, function() {
            if (!disposed && ticket === generation && busy) { busy=false; render(); status.text="请求超时，请查询结果后重试。"; }
        });
        return true;
    }
    function refreshCatalog() { if (!disposed && !busy) request("catalog"); }
    function buildList(data) {
        catalog=data;
        products = rows(data.products).filter(function(p) {
            return p && typeof p.sku === "string" && Number(p.amount_fen)>0 && Number(p.amount_fen)<=1000000 && Number(p.amount_fen)%1===0;
        });
        // Catalog edits cannot strand a checkout that was already created.
        Object.keys(orders).forEach(function(sku){
            var order=orders[sku];
            if((!terminal(order.state) || order.state==="paid_review") && !products.some(function(p){return p.sku===sku;}))
                products.push({sku:sku,title:order.title,description:order.description,amount_fen:order.amount_fen,enabled:false,owned:0});
        });
        var list = $("#PaymentProducts"); list.RemoveAndDeleteChildren();
        products.forEach(function(p, index) {
            var card=$.CreatePanel("Button",list,""); card.AddClass("PaymentProduct"); p.panel=card;
            var number=$.CreatePanel("Label",card,""); number.AddClass("PaymentProductNumber"); number.text="0"+(index+1);
            var title=$.CreatePanel("Label",card,""); title.AddClass("PaymentProductTitle"); title.text=p.title;
            var price=$.CreatePanel("Label",card,""); price.AddClass("PaymentProductOwned"); p.ownedLabel=price;
            card.SetPanelEvent("onactivate",function(){selected=p.sku; render();});
        });
        if (!current()) selected = products.length ? products[0].sku : "";
        if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.UpdateCatalog(catalog);
        render();
    }
    function setOpen(value) {
        opened=value;
        if (dialog && (!dialog.IsValid || dialog.IsValid())) dialog.SetHasClass("Open",value);
        var scrim=$("#PaymentScrim"); if (scrim) scrim.SetHasClass("Open",value);
        if (cfg.SurvivalUILayers) {
            if (value) cfg.SurvivalUILayers.Open("payment_shop",dialog,closeShop,{scrim:$("#PaymentScrim"),click:$("#PaymentScrim")});
            else cfg.SurvivalUILayers.Close("payment_shop");
        }
    }
    function closeShop() { setOpen(false); }
    PaymentToggle=function(){setOpen(!opened);if(opened)refreshCatalog();};
    function openShop() { closeShop();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();else {setOpen(true);refreshCatalog();} }
    PaymentShop=openShop;
    cfg.SurvivalPayments={Open:openShop,GetCatalog:function(){return catalog;},RefreshCatalog:refreshCatalog,
        Checkout:function(sku){selected=sku;setOpen(true);render();refreshCatalog();},
        Dispose:function(){closeShop();disposed=true;subscriptions.forEach(function(id){GameEvents.Unsubscribe(id);});}};
    PaymentBuy=function(){
        var p=current(), order=orders[selected];
        if (!p || !p.enabled || busy || (order && order.state!=="closed" && order.state!=="created" && order.state!=="delivered")) return;
        if (request("create",selected)) status.text="正在创建 " + money(p.amount_fen) + " 微信订单…";
    };
    PaymentOpen=function(){var order=orders[selected];if(order && order.state==="pending" && validURL(order.checkout_url))$.DispatchEvent("ExternalBrowserGoToURL",order.checkout_url);};
    PaymentRefresh=function(){request(orders[selected]?"status":"catalog",orders[selected]?selected:null);};
    var messages={test_account_required:"商城当前仅对指定测试账号开放。",already_owned:"你已经拥有此商品。",
        component_already_owned:"礼包内有道具已达持有上限，不能重复购买。",entitlement_already_owned:"礼包内有权限已生效，不能重复购买。",
        attribute_limit_reached:"购买后有属性会超过上限，暂不可购买。",
        purchase_limit_reached:"此商品已达到账号购买次数限制。",profile_not_ready:"请先进入对局，等待存档加载。",
        match_session_missing:"请先完成本局登录。",reward_refresh_pending:"远端已更新，存档刷新中；请稍后查询。",
        payment_busy:"上个请求正在处理，请稍后重试。",reset_in_progress:"正在清理测试数据，请先完成清理。",
        product_unavailable:"此商品暂不可购买，请刷新列表。",order_not_in_session:"请重新点击购买，服务器会恢复已有订单。",
        test_reset_disabled:"测试清理功能未开启。",pending_payment_unresolved:"尚有订单需要核对，请再次输入清理命令重试。"};
    subscriptions.push(GameEvents.Subscribe("survival_payment_result",function(data) {
        busy=false; generation++;
        if (!data.ok) {
            render(); if(data.error==="test_account_required")entry.style.visibility="collapse";
            status.text=messages[data.error]||"暂时无法完成请求，请稍后重试。";
            if(data.action==="catalog" && cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.UpdateCatalog({products:[],categories:[],error:status.text});
            return;
        }
        entry.style.visibility="visible";
        gameValues=data.game_values||gameValues; wallet=data.wallet||wallet; matchFrozen=!!data.match_frozen;
        gameEntitlements=data.game_entitlements||gameEntitlements;
        if (data.action==="reset") {
            orders={}; lastMatrix=""; render(); status.text="远端测试数据已清理，正在更新商品列表。";
            $.Schedule(1.1,refreshCatalog); return;
        }
        if (data.action==="catalog") { buildList(data); return; }
        var previous=orders[data.sku];
        if (!previous || previous.order_id!==data.order_id || !terminal(previous.state) || terminal(data.state)) orders[data.sku]=data;
        if (data.state==="delivered") {
            products.forEach(function(p){if(p.sku===data.sku){p.owned=1;p.enabled=false;}});
            $.Schedule(1.1,refreshCatalog);
        }
        if (data.action==="create") {selected=data.sku;setOpen(true);}
        render();
    }));
    subscriptions.push(GameEvents.Subscribe("survival_payment_open",openShop));
    // Read-only UI diagnostics: no prices, account identity, checkout tokens or grants.
    if(typeof Game!=="undefined" && Game.AddCommand)Game.AddCommand("survival_shop_open",function(){
        openShop();$.Msg("PAYMENT_UI_DIAG:"+JSON.stringify({checkout:opened,products:products.length,
            store:cfg.SurvivalCommerceView?cfg.SurvivalCommerceView.Inspect():null}));
    },"Open the authenticated shop UI without creating an order",0);
    function tick() {
        if (disposed) return;
        ticks++;
        if (!busy) {
            var order=orders[selected];
            if (opened && order && !terminal(order.state)) request("status",selected);
            else if (ticks===1 || ticks%4===0) refreshCatalog();
        }
        $.Schedule(5,tick);
    }
    $.Schedule(5,tick);
}());
