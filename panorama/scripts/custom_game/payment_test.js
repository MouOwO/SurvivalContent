var PaymentToggle, PaymentBuy, PaymentOpen, PaymentRefresh, PaymentShop, PaymentChannel, PaymentCancel;
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), disposed = false, subscriptions = [];
    if (cfg.SurvivalPayments && cfg.SurvivalPayments.Dispose){try{cfg.SurvivalPayments.Dispose();}catch(error){if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;$.Msg("[CheckoutPurple] Previous payment panel was already deleted.");}}
    var products = [], selected = "", orders = {}, busy = false, opened = false, generation = 0, lastMatrix = "", ticks = 0;
    var gameValues={}, gameEntitlements={}, wallet={}, matchFrozen=false, catalog={products:[],categories:[]};
    // Cache only this HUD/session's authoritative snapshot, never another account's data.
    var catalogReady=false, catalogCheckedAt=0, catalogRetryAt=0, catalogDirty=false, listRevision="";
    var activeRequest=null, requestSerial=0, catalogRequests=0, requestEpoch=String(Date.now())+"_"+String(Math.random()).slice(2);
    var CATALOG_TTL_MS=20000;
    var channel="wechat";
    var entry = $("#PaymentEntry"), dialog = $("#PaymentDialog"), status = $("#PaymentStatus"), buy = $("#PaymentBuy");
    var scrim=$("#PaymentScrim"), inputShield=$("#PaymentInputShield");
    var shell=null, shellShield=null,root=$.GetContextPanel?$.GetContextPanel():null;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function alive(){return !disposed&&(!root||valid(root))&&valid(dialog);}
    function escapedLines(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
    function paintActions(){if(!alive())return;["PaymentBack","PaymentBuy","PaymentRefresh","PaymentCancel","PaymentQuantityMinus","PaymentQuantityPlus","PaymentWeChat","PaymentAlipay"].forEach(function(id){var b=$("#"+id);if(!valid(b))return;var primary=id==="PaymentBuy"||b.BHasClass&&b.BHasClass("Selected"),disabled=b.enabled===false;b.style.backgroundImage="none";b.style.backgroundColor=disabled?"#21172f":primary?"gradient(linear,0% 0%,0% 100%,from(#734a9e),to(#382346))":"#281b3e";b.style.border="1px solid "+(disabled?"#594363":"#b18a50");function paint(n){if(n.paneltype==="Label")n.style.color=disabled?"#a795b8":"#ffdc87";if(n.Children)n.Children().forEach(paint);}if(b.Children)b.Children().forEach(paint);});}
    function setText(id,value){var panel=$("#"+id);if(panel)panel.text=value;}
    function prepareShell(){
        if(!alive())return;
        var U=cfg.SurvivalUI,R=cfg.RemainingHandoff,header=$("#PaymentHeader");
        // Shared HUD helpers may load after the payment controller during live editing.
        if(shell || !U || !U.ModalShell || !R || !header)return;
        shell=U.ModalShell.Adopt({id:"payment_shop",root:$.GetContextPanel(),panel:dialog,header:header,
            titlePanel:$("#PaymentHeading"),closeButton:$("#PaymentClose"),scrim:scrim,
            width:960,height:740,fit:{reference:[1920,1080]},onClose:closeShop});
        shellShield=dialog.Children().filter(function(p){return p.BHasClass("UIModalInputShield");}).slice(-1)[0];
        if(dialog._rhFrame && dialog._rhFrame.IsValid())dialog._rhFrame.DeleteAsync(0);
        header.Children().forEach(function(p){if(p.BHasClass("RHTitleOrnamentLeft") || p.BHasClass("RHTitleOrnamentRight"))p.DeleteAsync(0);});
        R.Window(dialog,header,$("#PaymentClose"));
        R.SizeWindow(dialog,960,740);R.Box(header,0,0,960,84);R.Box($("#PaymentClose"),894,22,38,38);
        dialog.AddClass("CheckoutPurple");scrim.AddClass("CheckoutPurpleBackdrop");dialog.style.backgroundImage="none";dialog.style.backgroundColor="gradient(linear,0% 0%,0% 100%,from(#211631),to(#0d091b))";dialog.style.border="1px solid #b18a50";dialog.style.borderRadius="4px";header.style.backgroundImage="none";header.style.backgroundColor="#21162e";header.style.borderBottom="1px solid #806340";$("#PaymentHeading").style.color="#f0d18a";R.Box($("#PaymentHeading"),32,22,820,40);$("#PaymentHeading").style.fontSize="30px";$("#PaymentHeading").style.textAlign="left";header.Children().forEach(function(c){if(c.BHasClass("ReferenceHeaderEmblem"))c.visible=false;});
        dialog.Children().forEach(function(p){if(p.BHasClass("ReferenceAtmosphere")||p.BHasClass("ReferenceFrame")||p.BHasClass("RHFrame"))p.visible=false;});
        ["PaymentBack","PaymentBuy","PaymentRefresh","PaymentCancel"].forEach(function(id){R.Action($("#"+id),id==="PaymentBuy",[260,64]);});
        ["PaymentQuantityMinus","PaymentQuantityPlus"].forEach(function(id){R.Action($("#"+id),false,[70,48]);});
        ["PaymentWeChat","PaymentAlipay"].forEach(function(id){
            var button=$("#"+id);if(!button._paymentSkin){R.Image(button,"shop_payment_normal","PaymentMethodBase");R.Image(button,"shop_payment_selected","PaymentMethodSelected");button._paymentSkin=true;}
            button.Children().forEach(function(c){if(c.BHasClass("PaymentMethodBase")||c.BHasClass("PaymentMethodSelected"))c.visible=false;});
        });
        if(opened)shell.Open();else shell.Close();
    }
    // A live JS reload can precede the updated XML resource in Workshop Tools.
    if(!inputShield){inputShield=$.CreatePanel("Button",dialog,"PaymentInputShield");inputShield.AddClass("PaymentInputShield");}
    // Match ModalShell's input boundary: blank window space consumes clicks,
    // while controls above the shield keep their own activation handlers.
    function consumeWindowClick(){return true;}
    dialog.SetPanelEvent("onactivate",consumeWindowClick);
    inputShield.SetPanelEvent("onactivate",consumeWindowClick);
    if(inputShield.SetAcceptsFocus)inputShield.SetAcceptsFocus(false);
    scrim.SetPanelEvent("onactivate",function(){
        if(opened && (!cfg.SurvivalUILayers || !cfg.SurvivalUILayers.Top || cfg.SurvivalUILayers.Top()==="payment_shop"))closeShop();
        return true;
    });
    function rows(value) {
        if (Array.isArray(value)) return value;
        return Object.keys(value || {}).sort(function(a,b){return Number(a)-Number(b);}).map(function(key){return value[key];});
    }
    function current() { return products.filter(function(p){return p.sku === selected;})[0]; }
    function channelAvailable(value) {
        // CustomGameEventManager transports Lua booleans as numeric 0/1.
        var flag=value==="wechat"?catalog.wechat:catalog.alipay;
        return flag===true || flag===1 || (value==="wechat" && flag===undefined);
    }
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
    function validURL(url) { return typeof url === "string" && /^https:\/\/pay\.xiaofengnet\.com\/checkout(?:\?order=WX|\/alipay\?order=AL)[0-9a-f]{30}&token=[0-9a-f]{64}$/.test(url); }
    function terminal(state) { return ["delivered", "paid_review", "closed"].indexOf(state) >= 0; }
    function drawQR(matrix) {
        var parent = $("#PaymentQR");
        if (typeof matrix !== "string" || !/^[01|]+$/.test(matrix)) { parent.style.visibility = "collapse"; return false; }
        var qr = matrix.split("|"), size = qr.length;
        if (size < 29 || size > 65 || qr.some(function(row){return row.length !== size;})) { parent.style.visibility = "collapse"; return false; }
        parent.style.visibility = "visible";
        if (lastMatrix === matrix) return true;
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
        return true;
    }
    function render() {
        if (!alive()) return;
        prepareShell();
        var p = current(), order = orders[selected];
        var active=order && !terminal(order.state), shownChannel=active?(order.provider||"wechat"):channel;
        var hasOrder=!!order && order.state!=="closed",receipt=!!order && (order.state==="delivered" || order.state==="paid_review");
        dialog.SetHasClass("HasOrder",hasOrder);dialog.SetHasClass("Receipt",receipt);
        setText("PaymentHeading",receipt?"支付结果":hasOrder?"扫码支付":"订单确认");
        setText("PaymentHint",hasOrder?"订单有效期 30 分钟 · 付款后自动核对到账":"每单 1 件 · 请核对商品、金额和全部奖励");
        ["wechat","alipay"].forEach(function(value){
            var button=$(value==="wechat"?"#PaymentWeChat":"#PaymentAlipay");
            button.enabled=!busy && !active && channelAvailable(value);
            button.SetHasClass("Selected",shownChannel===value);
        });
        var shown=order && order.state!=="closed" ? order : p;
        $("#PaymentTitle").text = shown ? shown.title : "正在加载商品";
        $("#PaymentDescription").text = shown ? shown.description||"" : "请先完成对局登录";
        var art=$("#PaymentProductArt"),icon=shown && (shown.icon || (p && p.icon));
        if(art){var validIcon=typeof icon==="string" && /^custom_game\/[A-Za-z0-9_\/-]+\.png$/.test(icon) && icon.indexOf("..")<0;
            art.style.visibility=validIcon?"visible":"collapse";if(validIcon && art.SetImage)art.SetImage("file://{images}/"+icon);}
        $("#PaymentPrice").text = shown ? money(shown.amount_fen) : "";
        $("#PaymentValues").html=true;$("#PaymentValues").text = escapedLines(valuesText(shown,order));
        buy.enabled = !busy && !!p && !!p.enabled && (!order || order.state === "closed" || order.state==="delivered");
        buy.enabled=buy.enabled && channelAvailable(shownChannel);
        $("#PaymentBuyLabel").text = p ? (shownChannel==="alipay"?"支付宝购买 ":"微信购买 ")+money(active?order.amount_fen:p.amount_fen) : "加载中";
        var canOpen = order && order.state === "pending" && !order.expired && validURL(order.checkout_url);
        $("#PaymentOpen").style.visibility = canOpen ? "visible" : "collapse";
        $("#PaymentOpenLabel").text=shownChannel==="alipay" && order && order.checkout_mode!=="qr"?"打开支付宝收银台":"浏览器备用付款页";
        $("#PaymentCancel").style.visibility=active?"visible":"collapse";
        $("#PaymentCancel").enabled=!busy;
        $("#PaymentLink").style.visibility = "collapse";
        if (canOpen) $("#PaymentLink").text = order.checkout_url;
        var hasQR=drawQR(canOpen ? order.qr_matrix : null);
        setText("PaymentQRChannel",(order && order.provider==="alipay"?"支付宝":"微信支付")+" · 每单 1 件");
        var qrState=$("#PaymentQRState");if(qrState){
            qrState.style.visibility=hasQR?"collapse":"visible";
            qrState.text=order && order.expired?"付款码已过期\n请查询付款结果":order && order.provider==="alipay" && order.checkout_mode!=="qr"
                ?"请点击下方\n打开支付宝收银台":"付款码暂未显示\n请查询付款结果";
        }
        if (order) {
            var pendingText=hasQR?"用手机"+(shownChannel==="alipay"?"支付宝":"微信")+"扫描上方二维码。付款后自动发放并刷新存档。"
                : shownChannel==="alipay" && order.checkout_mode!=="qr"?"此订单使用网页收银台，点击“打开支付宝收银台”付款。内置二维码需商户开通扫码支付。"
                : "二维码暂未显示，请查询付款结果或打开备用付款页。";
            var labels = {created:"订单正在确认，请查询结果后重试。", pending:pendingText,
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
        paintActions();
    }
    function request(action, sku) {
        if (!alive() || busy) return false;
        busy = true; render();
        var ticket = ++generation, body = {action:action,request_id:requestEpoch+"_"+(++requestSerial)};
        activeRequest=body;
        if (sku) body.sku = sku;
        if(action==="create")body.provider=channel;
        if(action==="catalog")catalogRequests++;
        GameEvents.SendCustomGameEventToServer("survival_payment_request", body);
        $.Schedule(32, function() {
            if (alive() && ticket === generation && busy) {
                busy=false;activeRequest=null;render();status.text="请求超时，请查询结果后重试。";
                if(action==="catalog")catalogFailed("商品同步超时，稍后自动重试。");
            }
        });
        return true;
    }
    function refreshCatalog(force) {
        if(!alive())return false;
        if(force===true){catalogDirty=true;catalogRetryAt=0;}
        if(busy || Date.now()<catalogRetryAt)return false;
        if(!catalogDirty && catalogReady && Date.now()-catalogCheckedAt<CATALOG_TTL_MS)return false;
        return request("catalog");
    }
    function catalogFailed(message, retry) {
        catalogRetryAt=Date.now()+(retry===false?CATALOG_TTL_MS:3000);
        if(cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.SetNotice)
            cfg.SurvivalCommerceView.SetNotice((catalogReady?"已保留商品列表。":"")+message);
        if(retry!==false)$.Schedule(3.1,function(){if(!disposed && (shopVisible() || !catalogReady))refreshCatalog();});
    }
    function invalidateCatalog() { catalogDirty=true;catalogRetryAt=0; }
    function shopVisible() {
        return opened || !!(cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.IsOpen && cfg.SurvivalCommerceView.IsOpen());
    }
    function buildList(data) {
        catalog=data;
        catalogReady=true;catalogCheckedAt=Date.now();catalogRetryAt=0;catalogDirty=false;
        if(channel==="alipay" && !channelAvailable("alipay"))channel="wechat";
        var oldProducts=products;
        products = rows(data.products).filter(function(p) {
            return p && typeof p.sku === "string" && Number(p.amount_fen)>0 && Number(p.amount_fen)<=1000000 && Number(p.amount_fen)%1===0;
        }).map(function(p){
            // Panel handles must never be attached to the shared data snapshot.
            var copy={};Object.keys(p).forEach(function(key){copy[key]=p[key];});return copy;
        });
        // Catalog edits cannot strand a checkout that was already created.
        Object.keys(orders).forEach(function(sku){
            var order=orders[sku];
            if((!terminal(order.state) || order.state==="paid_review") && !products.some(function(p){return p.sku===sku;}))
                products.push({sku:sku,title:order.title,description:order.description,amount_fen:order.amount_fen,enabled:false,owned:0});
        });
        var nextRevision=JSON.stringify(products.map(function(p){return [p.sku,p.title];}));
        if(nextRevision!==listRevision){
          listRevision=nextRevision;
          var list = $("#PaymentProducts"); list.RemoveAndDeleteChildren();
          products.forEach(function(p, index) {
            var card=$.CreatePanel("Button",list,""); card.AddClass("PaymentProduct"); p.panel=card;
            var number=$.CreatePanel("Label",card,""); number.AddClass("PaymentProductNumber"); number.text="0"+(index+1);
            var title=$.CreatePanel("Label",card,""); title.AddClass("PaymentProductTitle"); title.text=p.title;
            var price=$.CreatePanel("Label",card,""); price.AddClass("PaymentProductOwned"); p.ownedLabel=price;
            card.SetPanelEvent("onactivate",function(){selected=p.sku; render();});
          });
        }else products.forEach(function(p,index){p.panel=oldProducts[index].panel;p.ownedLabel=oldProducts[index].ownedLabel;});
        if (!current()) selected = products.length ? products[0].sku : "";
        if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.UpdateCatalog(catalog);
        render();
    }
    function setOpen(value) {
        if(!alive()){opened=false;if(shell)shell.Close();return;}
        prepareShell();
        opened=value;
        if (dialog && (!dialog.IsValid || dialog.IsValid())) {
            dialog.hittest=value;dialog.hittestchildren=value;dialog.SetHasClass("Open",value);
        }
        if(scrim && (!scrim.IsValid || scrim.IsValid())){scrim.hittest=value;scrim.hittestchildren=false;scrim.SetHasClass("Open",value);}
        if(inputShield && (!inputShield.IsValid || inputShield.IsValid())){inputShield.hittest=value;inputShield.hittestchildren=false;}
        if(shell){if(value)shell.Open();else shell.Close();}
        else if (cfg.SurvivalUILayers) {
            if (value) cfg.SurvivalUILayers.Open("payment_shop",dialog,closeShop,{scrim:scrim,click:scrim});
            else cfg.SurvivalUILayers.Close("payment_shop");
        }
    }
    function closeShop() { setOpen(false); }
    PaymentToggle=function(){setOpen(!opened);if(opened)refreshCatalog();};
    function openShop() { if(!alive())return;closeShop();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();else {setOpen(true);refreshCatalog();} }
    PaymentShop=openShop;
    function inspectCache(){return {ready:catalogReady,dirty:catalogDirty,pending:activeRequest?activeRequest.action:"",catalogRequests:catalogRequests,
        ageSeconds:catalogReady?Math.floor((Date.now()-catalogCheckedAt)/1000):null};}
    cfg.SurvivalPayments={Open:openShop,GetCatalog:function(){return catalog;},RefreshCatalog:refreshCatalog,Inspect:inspectCache,
        Checkout:function(sku){if(!alive())return false;selected=sku;setOpen(true);render();refreshCatalog();},
        Dispose:function(){if(disposed)return;closeShop();disposed=true;if(shell)shell.Dispose();if(valid(shellShield))shellShield.DeleteAsync(0);subscriptions.forEach(function(id){GameEvents.Unsubscribe(id);});}};
    PaymentBuy=function(){
        if(!alive())return;
        var p=current(), order=orders[selected];
        if (!p || !p.enabled || busy || (order && order.state!=="closed" && order.state!=="created" && order.state!=="delivered")) return;
        if(!channelAvailable(channel))return;
        if (request("create",selected)) status.text="正在创建 " + money(p.amount_fen) + (channel==="alipay"?" 支付宝":" 微信")+"订单…";
    };
    PaymentChannel=function(value){if(!alive())return;var order=orders[selected];if(busy || (order && !terminal(order.state)))return;if((value==="wechat" || value==="alipay") && channelAvailable(value)){channel=value;render();}};
    PaymentCancel=function(){var order=orders[selected];if(order && !terminal(order.state) && request("cancel",selected))status.text="正在核对并关闭订单，请稍候…";};
    PaymentOpen=function(){if(!alive())return;var order=orders[selected];if(order && order.state==="pending" && !order.expired && validURL(order.checkout_url))$.DispatchEvent("ExternalBrowserGoToURL",order.checkout_url);};
    PaymentRefresh=function(){if(orders[selected])request("status",selected);else refreshCatalog(true);};
    var messages={test_account_required:"商城当前仅对指定测试账号开放。",already_owned:"你已经拥有此商品。",
        payment_channel_unavailable:"此支付方式尚未开放，请选择已开放的方式。",
        "ACQ.ACCESS_FORBIDDEN":"支付宝扫码支付权限尚未开通，请联系商户开通后再试。",
        "isv.insufficient-isv-permissions":"支付宝应用尚无扫码支付接口权限，请联系商户完成配置。",
        payment_close_pending:"支付宝尚未生成可关闭的交易。为防止重复付款，请等待此订单到期后再切换支付方式。",
        component_already_owned:"礼包内有道具已达持有上限，不能重复购买。",entitlement_already_owned:"礼包内有权限已生效，不能重复购买。",
        attribute_limit_reached:"购买后有属性会超过上限，暂不可购买。",
        purchase_limit_reached:"此商品已达到账号购买次数限制。",profile_not_ready:"请先进入对局，等待存档加载。",
        match_session_missing:"请先完成本局登录。",reward_refresh_pending:"远端已更新，存档刷新中；请稍后查询。",
        payment_busy:"上个请求正在处理，请稍后重试。",reset_in_progress:"正在清理测试数据，请先完成清理。",
        product_unavailable:"此商品暂不可购买，请刷新列表。",order_not_in_session:"请重新点击购买，服务器会恢复已有订单。",
        test_reset_disabled:"测试清理功能未开启。",pending_payment_unresolved:"尚有订单需要核对，请再次输入清理命令重试。"};
    subscriptions.push(GameEvents.Subscribe("survival_payment_result",function(data) {
        if(!alive())return;
        // A late response cannot unlock or replace a newer request (including after a HUD reload).
        if(data.request_id && (!activeRequest || data.request_id!==activeRequest.request_id))return;
        if(activeRequest && data.action===activeRequest.action){busy=false;activeRequest=null;generation++;}
        if (!data.ok) {
            render(); if(data.error==="test_account_required")entry.style.visibility="collapse";
            status.text=messages[data.error]||"暂时无法完成请求，请稍后重试。";
            if(data.action==="catalog"){
                var failure=status.text;
                // Access/session loss invalidates the snapshot. Transient busy/network errors do not.
                if(["test_account_required","match_session_missing","profile_not_ready","unauthorized"].indexOf(data.error)>=0){
                    catalogReady=false;catalogDirty=false;catalog={products:[],categories:[],error:failure};products=[];listRevision="";
                    orders={};lastMatrix="";
                    $("#PaymentProducts").RemoveAndDeleteChildren();
                    if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.UpdateCatalog(catalog);
                    render();
                }
                status.text=failure;
                catalogFailed(failure,data.error!=="test_account_required" && data.error!=="unauthorized");
            }
            return;
        }
        entry.style.visibility="visible";
        gameValues=data.game_values||gameValues; wallet=data.wallet||wallet; matchFrozen=!!data.match_frozen;
        gameEntitlements=data.game_entitlements||gameEntitlements;
        if (data.action==="reset") {
            invalidateCatalog();orders={}; lastMatrix=""; render(); status.text="远端测试数据已清理，正在更新商品列表。";
            $.Schedule(1.1,refreshCatalog); return;
        }
        if (data.action==="catalog") { buildList(data); return; }
        var previous=orders[data.sku];
        if (!previous || previous.order_id!==data.order_id || !terminal(previous.state) || terminal(data.state)) orders[data.sku]=data;
        if (data.state==="delivered") {
            invalidateCatalog();
            products.forEach(function(p){if(p.sku===data.sku){p.owned=1;p.enabled=false;}});
            $.Schedule(1.1,refreshCatalog);
        }
        if (data.action==="create") {selected=data.sku;setOpen(true);}
        render();
    }));
    subscriptions.push(GameEvents.Subscribe("survival_payment_open",openShop));
    // Read-only UI diagnostics: no prices, account identity, checkout tokens or grants.
    if(typeof Game!=="undefined" && Game.AddCommand)Game.AddCommand("survival_shop_open",function(){
        openShop();$.Msg("PAYMENT_UI_DIAG:"+JSON.stringify({checkout:opened,products:products.length,cache:inspectCache(),
            store:cfg.SurvivalCommerceView?cfg.SurvivalCommerceView.Inspect():null}));
    },"Open the authenticated shop UI without creating an order",0);
    function tick() {
        if (!alive()) return;
        ticks++;
        if (!busy) {
            var order=orders[selected];
            if (opened && order && !terminal(order.state)) request("status",selected);
            else if (ticks===1 || catalogDirty || shopVisible()) refreshCatalog();
        }
        $.Schedule(5,tick);
    }
    $.Schedule(5,tick);
}());
