var PaymentToggle, PaymentBuy, PaymentOpen, PaymentRefresh, PaymentShop, PaymentChannel, PaymentCancel, PaymentQuantityChange, PaymentQuantityInputChanged;
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), gate=cfg.SurvivalPaymentCapability, ownerAlive=true, current=null, gateListener=null, reconciling=false;
    var root=$.GetContextPanel?$.GetContextPanel():null;
    if(cfg.SurvivalPayments&&cfg.SurvivalPayments.Dispose){try{cfg.SurvivalPayments.Dispose();}catch(error){if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;}}
    function runtimeAllowed(){return ownerAlive&&(cfg.SurvivalDevelopmentPayments===true||!!gate&&cfg.SurvivalPaymentCapability===gate&&typeof gate.IsAllowed==="function"&&gate.IsAllowed()===true);}
    function retire(){var old=current;current=null;if(old)old.dispose();}
    function dispose(){if(!ownerAlive)return;ownerAlive=false;if(gateListener&&gate&&gate.Unsubscribe)gate.Unsubscribe(gateListener);gateListener=null;retire();}
    function own(api,disposeRuntime,kind){
        var owned={api:api,dispose:disposeRuntime,kind:kind};current=owned;
        api.Dispose=function(){if(current===owned&&cfg.SurvivalPayments===api)dispose();else disposeRuntime();};
    }
    function disabled(){
        var stopped=false,empty={products:[],categories:[],catalog_hash:"noncommercial_test",real_money_enabled:false,wechat:false,alipay:false};
        function unavailable(){return false;}
        function walletShop(){if(!ownerAlive||stopped)return false;if(runtimeAllowed()){reconcile();if(current&&current.kind==="cash")return current.api.Open();}if(gate&&gate.Request)gate.Request(true);var view=cfg.SurvivalCommerceView;if(view&&view.Open)return view.Open();return false;}
        ["PaymentEntry","PaymentDialog","PaymentScrim"].forEach(function(id){var node=$("#"+id);if(node&&(!node.IsValid||node.IsValid())){node.visible=false;node.hittest=false;node.hittestchildren=false;node.style.visibility="collapse";if(node.SetHasClass)node.SetHasClass("Open",false);}});
        PaymentToggle=PaymentBuy=PaymentOpen=PaymentRefresh=PaymentChannel=PaymentCancel=PaymentQuantityChange=PaymentQuantityInputChanged=unavailable;PaymentShop=walletShop;
        var api={Open:walletShop,IsRealMoneyEnabled:unavailable,Checkout:unavailable,GetCatalog:function(){return empty;},
            RefreshCatalog:function(){if(!ownerAlive||stopped)return false;var view=cfg.SurvivalCommerceView;if(view&&view.UpdateCatalog)view.UpdateCatalog(empty);return false;},
            Inspect:function(){return {realMoneyEnabled:false,opened:false,catalogRequests:0,layout:"noncommercial_test"};}};
        cfg.SurvivalPayments=api;own(api,function(){stopped=true;},"disabled");
        if(cfg.SurvivalCommerceView&&cfg.SurvivalCommerceView.UpdateCatalog)cfg.SurvivalCommerceView.UpdateCatalog(empty);
    }
    function reconcile(){
        if(!ownerAlive||reconciling)return;reconciling=true;
        try{
            var enabled=runtimeAllowed();if(current&&current.kind===(enabled?"cash":"disabled"))return;
            retire();if(!enabled){disabled();return;}
            ["PaymentDialog","PaymentScrim"].forEach(function(id){var node=$("#"+id);if(node&&(!node.IsValid||node.IsValid())){node.style.visibility="visible";node.visible=false;node.hittest=false;node.hittestchildren=false;}});
            var previousApi=cfg.SurvivalPayments;
            try{var api=initializeCash();own(api,api.Dispose,"cash");}
            catch(error){var partial=cfg.SurvivalPayments;if(partial!==previousApi&&partial&&partial.Dispose){try{partial.Dispose();}catch(ignore){}}disabled();if($.Msg)$.Msg("[PaymentCapability] checkout_initialization_unavailable");}
        }finally{reconciling=false;}
    }
    function initializeCash(){
    var disposed=false,subscriptions=[],api=null;
    var products = [], selected = "", orders = {}, busy = false, opened = false, generation = 0, lastMatrix = "", qrCache = null, ticks = 0;
    var gameValues={}, gameEntitlements={}, wallet={}, matchFrozen=false, catalog={products:[],categories:[]};
    // Cache only this HUD/session's authoritative snapshot, never another account's data.
    var catalogReady=false, catalogCheckedAt=0, catalogRetryAt=0, catalogDirty=false, listRevision="";
    var activeRequest=null, requestSerial=0, catalogRequests=0, requestEpoch=String(Date.now())+"_"+String(Math.random()).slice(2);
    var CATALOG_TTL_MS=20000;
    var channel="wechat",quantity=1,quantitySku="",quantityInputInvalid=false,quantityWriting=false;
    var statusCursor="",catalogTurn=false;
    var rewardWalletRefreshes={},walletResetSerial=0;
    var entry = $("#PaymentEntry"), dialog = $("#PaymentDialog"), status = $("#PaymentStatus"), buy = $("#PaymentBuy");
    var scrim=$("#PaymentScrim"), inputShield=$("#PaymentInputShield");
    var shell=null, menuView=null, shellShield=null,shellProps=null,root=$.GetContextPanel?$.GetContextPanel():null;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    var lifetime=valid(dialog)?$.CreatePanel("Panel",dialog,""):null;
    if(lifetime){lifetime.visible=false;lifetime.hittest=false;lifetime.hittestchildren=false;}
    function alive(){return runtimeAllowed()&&!disposed&&(!root||valid(root))&&valid(dialog)&&valid(lifetime)&&(!api||cfg.SurvivalPayments===api);}
    function rewardNameText(value){var shared=cfg.SurvivalCommerceComponents;return shared&&shared.RewardNameText?shared.RewardNameText(value):String(value||"").replace(/U币/g,"G币");}
    function escapedLines(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
    function paintActions(){if(!alive())return;["PaymentBack","PaymentBuy","PaymentRefresh","PaymentCancel","PaymentQuantityMinus","PaymentQuantityPlus","PaymentWeChat","PaymentAlipay"].forEach(function(id){var b=$("#"+id);if(!valid(b))return;var primary=id==="PaymentBuy"||b.BHasClass&&b.BHasClass("Selected"),disabled=b.enabled===false;b.style.backgroundImage="none";b.style.backgroundColor=disabled?"#21172f":primary?"gradient(linear,0% 0%,0% 100%,from(#734a9e),to(#382346))":"#281b3e";b.style.border="1px solid "+(disabled?"#594363":"#b18a50");function paint(n){if(n.paneltype==="Label")n.style.color=disabled?"#a795b8":"#ffdc87";if(n.Children)n.Children().forEach(paint);}if(b.Children)b.Children().forEach(paint);});}
    function setText(id,value){var panel=$("#"+id);if(panel)panel.text=value;}
    function firstClass(node,cls){if(!valid(node))return null;if(node.BHasClass&&node.BHasClass(cls))return node;var children=node.Children?node.Children():[];for(var i=0;i<children.length;i++){var hit=firstClass(children[i],cls);if(hit)return hit;}return null;}
    function paint(node,values){if(valid(node))Object.keys(values).forEach(function(key){if(node.style[key]!==values[key])node.style[key]=values[key];});}
    function rect(node,x,y,width,height){paint(node,{position:x+"px "+y+"px 0px",width:width+"px",height:height+"px",margin:"0px",padding:"0px",horizontalAlign:"left",verticalAlign:"top",flowChildren:"none"});}
    function show(node,value){if(valid(node)){node.visible=value;paint(node,{visibility:value?"visible":"collapse"});}}
    function copyHeight(value,width,font){return String(value||"").replace(/<br\s*\/?\s*>/gi,"\n").split(/\r?\n/).reduce(function(total,line){return total+Math.max(1,Math.ceil(line.length/Math.max(1,Math.floor(width/font))))*24;},0);}
    function layoutCheckout(){
        if(!alive())return;
        var body=firstClass(dialog,"PaymentBody");if(!body)return;
        // JS can hot reload before the new XML: keep the notice present in both cases.
        var notice=$("#PaymentConsumptionNotice");
        if(!valid(notice)){notice=$.CreatePanel("Label",body,"PaymentConsumptionNotice");notice.AddClass("PaymentConsumptionNotice");}
        notice.text="请适度娱乐，理性消费";notice.hittest=false;
        var order=orders[selected],hasOrder=!!order&&order.state!=="closed",receipt=!!order&&(order.state==="delivered"||order.state==="paid_review");
        var summary=firstClass(body,"PaymentSummary"),copy=firstClass(body,"PaymentRewardCopy"),quantityPanel=firstClass(body,"PaymentQuantity"),methods=firstClass(body,"PaymentMethods"),qr=firstClass(body,"PaymentQRStage"),footer=firstClass(body,"PaymentFooter");
        var art=$("#PaymentProductArt"),open=$("#PaymentOpen"),hint=$("#PaymentHint"),unit=$("#PaymentUnitPrice");
        [art,status,open].forEach(function(node){if(valid(node)&&node.GetParent&&node.GetParent()!==body)node.SetParent(body);});
        var shown=hasOrder?order:quote(current(),quantity),recharge=isRecharge(shown);
        paint($("#PaymentQuantityInput"),{width:recharge?"108px":"84px"});
        paint($("#PaymentQuantityHint"),{width:recharge?"148px":"180px"});
        show(hint,false);show(unit,recharge);show($("#PaymentDescription"),receipt);show($("#PaymentValues"),receipt);
        var description=$("#PaymentDescription"),values=$("#PaymentValues"),details=(description&&description.text||"")+"\n"+(values&&values.text||"");
        var hasDetails=receipt&&!!details.replace(/\s/g,"");
        show(summary,hasDetails);show(copy,hasDetails);show(quantityPanel,!hasOrder);show(methods,!hasOrder);show(qr,hasOrder&&!receipt);
        rect($("#PaymentHeader"),0,0,580,54);rect($("#PaymentHeading"),24,12,470,34);rect($("#PaymentClose"),528,10,32,32);
        rect(art,0,4,64,64);rect($("#PaymentTitle"),84,0,448,32);rect($("#PaymentPrice"),84,36,448,30);
        var y=84;
        if(recharge){rect(unit,0,y,532,52);paint(unit,{fontSize:"17px",color:"#decda8",whiteSpace:"normal",lineHeight:"24px"});y+=64;}
        if(hasDetails){var detailHeight=Math.min(220,Math.max(72,copyHeight(details,492,16)));rect(summary,0,y,532,detailHeight+20);rect(copy,10,10,512,detailHeight);paint(copy,{flowChildren:"down",overflow:"squish scroll"});y+=detailHeight+36;}
        if(!hasOrder){rect(quantityPanel,0,y,532,40);paint(quantityPanel,{flowChildren:"right"});y+=54;rect(methods,0,y,532,40);paint(methods,{flowChildren:"right"});y+=60;}
        if(hasOrder&&!receipt){rect(qr,0,y,532,268);rect($("#PaymentQRChannel"),0,0,532,22);rect(firstClass(qr,"PaymentQRFrame"),144,24,244,244);y+=284;}
        rect(footer,0,y,532,44);paint(footer,{flowChildren:"right"});y+=44;
        var pending=hasOrder&&!receipt;
        ["PaymentBack","PaymentBuy","PaymentRefresh","PaymentCancel"].forEach(function(id){var button=$("#"+id),visible=id==="PaymentBack"||id==="PaymentBuy"&&!pending||(id==="PaymentRefresh"||id==="PaymentCancel")&&pending;show(button,visible);paint(button,{width:(pending?168:id==="PaymentBuy"?370:148)+"px",height:"44px",position:"0px 0px 0px",margin:id==="PaymentBuy"||id==="PaymentCancel"?"0px":"0px 14px 0px 0px",padding:"0px"});});
        var boilerplate=/^(?:直接购买此道具，)?付款后全部奖励一起到账，自动刷新。$/.test(status.text||"");
        var hasStatus=!!String(status.text||"").replace(/\s/g,"")&&!boilerplate;
        show(status,hasStatus);
        if(hasStatus){var statusHeight=Math.min(132,Math.max(24,copyHeight(status.text,532,16)));y+=14;rect(status,0,y,532,statusHeight);paint(status,{overflow:"squish scroll"});y+=statusHeight;}
        var canOpen=pending&&order.state==="pending"&&!order.expired&&priceValid(order,true)&&validURL(order.checkout_url);
        show(open,canOpen);if(canOpen){y+=10;rect(open,0,y,532,24);y+=24;}
        y+=14;rect(notice,0,y,532,24);paint(notice,{fontSize:"15px",color:"#bcaeca",textAlign:"center"});show(notice,true);y+=24;
        rect(body,24,70,532,y);
        var height=70+y+22;paint(dialog,{width:"580px",height:height+"px"});
        if(shellProps){shellProps.width=580;shellProps.height=height;var U=cfg.SurvivalUI;if(U&&U.Fit){var scale=U.Fit(dialog,root||$.GetContextPanel(),580,height,shellProps.fit);shellProps.onFit(scale);}}
    }
    function setStatus(value){status.text=value;layoutCheckout();}
    function prepareShell(){
        if(!alive()||shell)return;
        var U=cfg.SurvivalUI,header=$("#PaymentHeader");if(!U||!U.ModalShell||!header)return;
        if(dialog.RemoveClass){dialog.RemoveClass("MenuV10Payment");dialog.RemoveClass("MenuV10Page");dialog.RemoveClass("RCWindow");}
        dialog.AddClass("CompactCheckout");dialog.AddClass("LeanCheckout");
        shellProps={id:"payment_shop",root:root,panel:dialog,scrim:scrim,header:header,titlePanel:$("#PaymentHeading"),closeButton:$("#PaymentClose"),
            width:580,height:334,fit:{widthFraction:.94,heightFraction:.9},onClose:closeShop,
            onFit:function(scale){var fitted=Math.min(1,Number(scale)||1);dialog.style.transform="scale3d("+fitted+","+fitted+",1)";}};
        shell=U.ModalShell.Adopt(shellProps);
        paint(dialog,{backgroundImage:"none",backgroundColor:"gradient(linear,0% 0%,100% 100%,from(#2b203bf7),to(#15101ffa))",border:"1px solid #9b8057",boxShadow:"#00000099 0px 8px 24px 0px"});
        paint(header,{backgroundColor:"#1a1428dd"});show(header,true);show(inputShield,true);
        shellShield=dialog.Children().filter(function(p){return valid(p) && p.BHasClass && p.BHasClass("UIModalInputShield");}).pop()||null;
        menuView={Open:function(){shell.Open();},Close:function(){shell.Close();},Dispose:function(){shell.Dispose();},SetTitle:function(value){setText("PaymentHeading",value);}};
        if(opened)menuView.Open();else menuView.Close();
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
    function enabled(value) { return value===true || value===1; }
    function isRecharge(value){return !!value&&(value.sku==="u_coin_recharge"||value.product_type==="recharge");}
    function rechargeValid(value){
        if(!value||value.sku!=="u_coin_recharge"||value.product_type!=="recharge"||value.recharge_u_coin_per_unit!==100)return false;
        var count=value.quantity===undefined?1:value.quantity;
        return typeof count==="number"&&count%1===0&&count>=1&&count<=999999
            &&typeof value.amount_fen==="number"&&value.amount_fen===100*count
            &&(value.unit_amount_fen===undefined||value.unit_amount_fen===100)
            &&rows(value.reward_lines).some(function(r){return r.kind==="wallet"&&r.id==="u_coin"&&r.quantity===100*count;});
    }
    function cashPass(value) {
        return !!value && rows(value.reward_lines).some(function(r){return r.kind==="entitlement" && r.id==="archive_pass" && Number(r.duration_days)>0;});
    }
    function hasUPrice(value) {
        if(!value)return false;
        if(isRecharge(value))return false;
        if(cashPass(value))return false;
        if(value.currency==="u_coin" || value.u_coin_price!==undefined || value.u_coin_per_yuan!==undefined)return true;
        var commerce=cfg.SurvivalCommerceWallet,snapshot=commerce && commerce.GetCatalog && commerce.GetCatalog();
        return !!snapshot && rows(snapshot.products).some(function(p){return p && p.sku===value.sku && p.currency==="u_coin";});
    }
    function uPrice(value,storedQuote) {
        if(!value||isRecharge(value)||cashPass(value))return false;
        var stored=orders[value.sku],rate=value.u_coin_per_yuan;
        // Only an authenticated order already received by this HUD may retain
        // its historical quote. New catalog prices always use 100 U-coins/yuan.
        var frozen=storedQuote&&stored&&typeof value.order_id==="string"&&value.order_id===stored.order_id;
        return typeof value.u_coin_price==="number"&&value.u_coin_price>0&&value.u_coin_price%1===0
            &&(rate===100||(frozen&&rate===1000))&&typeof value.amount_fen==="number"
            &&value.amount_fen>0&&value.amount_fen<=1000000&&value.amount_fen%1===0
            &&value.u_coin_price===value.amount_fen*rate/100;
    }
    function priceValid(value,storedQuote) { return isRecharge(value)?rechargeValid(value):cashPass(value)?typeof value.amount_fen==="number" && value.amount_fen>0 && value.amount_fen<=1000000 && value.amount_fen%1===0:!hasUPrice(value) || uPrice(value,storedQuote); }
    function priceText(value,rate,storedQuote) {
        if(!value)return "";
        if(!priceValid(value,storedQuote))return isRecharge(value)?"充值金额及到账数量待同步":"G币价格及人民币金额待同步";
        if(isRecharge(value))return money(value.amount_fen);
        return uPrice(value,storedQuote)?Number(value.u_coin_price)+" G币 / "+money(value.amount_fen)+(rate?"，1元="+value.u_coin_per_yuan+"G币":""):money(value.amount_fen);
    }
    function quantityMaximum(p){
        // A legacy catalogue without an authoritative bulk limit remains single-item.
        if(!p||typeof p.max_quantity!=="number"||p.max_quantity%1!==0||p.max_quantity<1)return 1;
        if(isRecharge(p))return rechargeValid(p)?Math.min(999999,p.max_quantity):1;
        return Math.max(1,Math.min(100,p.max_quantity,Math.floor(1000000/p.amount_fen)));
    }
    function canEditQuantity(p,order){return !!p&&enabled(p.enabled)&&!busy&&(!order||order.state==="closed");}
    function syncQuantity(p,order){
        if(quantitySku!==selected){quantitySku=selected;quantity=1;quantityInputInvalid=false;}
        if(order&&order.state!=="closed"){quantity=typeof order.quantity==="number"&&order.quantity%1===0&&order.quantity>0?order.quantity:1;quantityInputInvalid=false;}
        else quantity=Math.max(1,Math.min(quantityMaximum(p),quantity));
        var input=$("#PaymentQuantityInput"),editable=canEditQuantity(p,order);
        if(input){input.enabled=editable;if(!quantityInputInvalid&&String(input.text)!==String(quantity)){quantityWriting=true;input.text=String(quantity);quantityWriting=false;}}
        $("#PaymentQuantityMinus").enabled=editable&&!quantityInputInvalid&&quantity>1;
        $("#PaymentQuantityPlus").enabled=editable&&!quantityInputInvalid&&quantity<quantityMaximum(p);
        setText("PaymentQuantityHint",quantityMaximum(p)===1?"限购 1 件":"最多 "+quantityMaximum(p)+(isRecharge(p)?" 份":" 件"));
    }
    function quote(p,count){
        if(!p||!priceValid(p))return p;var value={};Object.keys(p).forEach(function(k){value[k]=p[k];});
        value.quantity=count;value.amount_fen=p.amount_fen*count;
        if(uPrice(p))value.u_coin_price=p.u_coin_price*count;
        value.reward_lines=rows(p.reward_lines).map(function(r){var n={};Object.keys(r).forEach(function(k){n[k]=r[k];});n.quantity=Number(r.quantity)*count;if(typeof r.duration_days==="number")n.duration_days=r.duration_days*count;return n;});
        value.stat_preview=rows(p.stat_preview).map(function(r){var n={};Object.keys(r).forEach(function(k){n[k]=r[k];});var delta=typeof r.delta==="number"?r.delta:Number(r.after)-Number(r.value);n.delta=delta*count;n.after=Number(r.value)+n.delta;return n;});
        return value;
    }
    function unitQuote(shown,count){
        if(!shown)return shown;var value={};Object.keys(shown).forEach(function(k){value[k]=shown[k];});
        value.amount_fen=shown.unit_amount_fen||shown.amount_fen/count;
        if(uPrice(shown))value.u_coin_price=shown.unit_u_coin_price||shown.u_coin_price/count;
        return value;
    }
    PaymentQuantityChange=function(delta){
        if(!alive()||!canEditQuantity(current(),orders[selected]))return;
        quantity=Math.max(1,Math.min(quantityMaximum(current()),quantity+(delta>0?1:-1)));quantityInputInvalid=false;render();
    };
    PaymentQuantityInputChanged=function(){
        if(quantityWriting||!alive()||!canEditQuantity(current(),orders[selected]))return;
        var input=$("#PaymentQuantityInput"),raw=String(input&&input.text||"").replace(/^\s+|\s+$/g,"");
        quantityInputInvalid=!/^\d{1,9}$/.test(raw);
        if(!quantityInputInvalid){quantity=Math.max(1,Math.min(quantityMaximum(current()),Number(raw)));}
        render();
    };
    $("#PaymentQuantityMinus").SetPanelEvent("onactivate",function(){PaymentQuantityChange(-1);return true;});
    $("#PaymentQuantityPlus").SetPanelEvent("onactivate",function(){PaymentQuantityChange(1);return true;});
    if($("#PaymentQuantityInput"))$("#PaymentQuantityInput").SetPanelEvent("ontextentrychange",PaymentQuantityInputChanged);
    function number(value) {
        var amount=Number(value);
        if(!isFinite(amount))return "—";
        var display=amount.toFixed(1);
        return Number(display)===0?"0.0":display;
    }
    function rewardAmount(value) {
        var display=number(value);
        return display==="—"?display:(Number(display)<0?"":"+")+display;
    }
    function valuesText(p,order) {
        if (!p) return "";
        var lines=rows(p.reward_lines), names={initial_wood:"初始木材",initial_gold:"初始金币",wall_armor:"城墙护甲",wall_initial_health:"城墙初始生命",tower_attack_flat:"箭塔固定攻击"};
        Object.keys(p.effect_labels||{}).forEach(function(field){names[field]=p.effect_labels[field];});
        lines.forEach(function(r){if(r.kind==="stat")names[r.id]=r.label;});
        var text=lines.map(function(r){
            var state=gameEntitlements[r.id], active=state && (enabled(state.active) || enabled(state));
            return rewardNameText(r.label)+" "+rewardAmount(r.quantity)+(r.kind==="entitlement" && order && order.state==="delivered" ? active?"（本局已生效）":"（已到账，下局或权限刷新后生效）":"");
        });
        var previews=rows(p.stat_preview);
        var fields=order && order.state!=="closed"?Object.keys(order.effects||{}):previews.map(function(e){return e.field_id;});
        if(order && order.state==="delivered") fields=Object.keys(order.effect_changes||{});
        fields.forEach(function(field){
            var effect=previews.filter(function(e){return e.field_id===field;})[0];
            var receipt=order && order.state==="delivered" && order.effect_changes && order.effect_changes[field];
            var detail=receipt ? "本单存档："+number(receipt.before)+" → "+number(receipt.after)+"（"+rewardAmount(receipt.delta)+"）"
                : order && order.state!=="closed" ? "本单加成："+rewardAmount(order.effects[field])
                : effect ? "存档："+number(effect.value)+(enabled(p.enabled)?" → "+number(effect.after)+"（购买后）":"") : "";
            if(gameValues[field]!==undefined)detail+=" · 本局："+number(gameValues[field]);
            var resource=field==="initial_wood"?"wood":field==="initial_gold"?"gold":null;
            if(resource && wallet[resource]!==undefined)detail+=" · 当前"+(resource==="wood"?"木材":"金币")+"："+number(wallet[resource]);
            text.push(rewardNameText(names[field]||field)+" — "+detail);
        });
        if(matchFrozen)text.push("本局已结算冻结，新奖励下局生效。");
        return text.join("\n");
    }
    function validURL(url) { return typeof url === "string" && /^https:\/\/pay\.xiaofengnet\.com\/(?:ws4-payments\/)?checkout(?:\?order=WX|\/alipay\?order=AL)[0-9a-f]{30}&token=[0-9a-f]{64}$/.test(url) && (cfg.SurvivalDevelopmentPayments===true || url.indexOf("https://pay.xiaofengnet.com/ws4-payments/")===0); }
    function terminal(state) { return ["delivered", "paid_review", "closed"].indexOf(state) >= 0; }
    function drawQR(matrix) {
        var parent = $("#PaymentQR");
        function clear() {
            lastMatrix = ""; qrCache = null;
            if (valid(parent)) {
                parent.style.visibility = "collapse";
                try { parent.RemoveAndDeleteChildren(); } catch (ignore) { return false; }
            }
            return true;
        }
        if (!valid(parent)) { clear(); return false; }
        if (typeof matrix !== "string" || !/^[01|]+$/.test(matrix)) { clear(); return false; }
        var qr = matrix.split("|"), size = qr.length;
        if (size < 29 || size > 65 || qr.some(function(row){return row.length !== size;})) { clear(); return false; }
        var children = parent.Children ? parent.Children() : [];
        if (lastMatrix === matrix && qrCache && qrCache.parent === parent && qrCache.panels.length > 0
            && children.length === qrCache.panels.length && qrCache.panels.every(function(panel) {
                return valid(panel) && panel.GetParent && panel.GetParent() === parent && children.indexOf(panel) >= 0;
            })) { parent.style.visibility = "visible"; return true; }
        if (!clear()) return false;
        var cell = Math.max(3, Math.floor(216 / size)), pixels = size * cell, panels = [];
        try {
            // Flow rounds each run independently at fractional UI scales, distorting finder squares.
            // Anchor every black run to the same canvas; the matrix already includes its quiet zone.
            paint(parent,{width:pixels+"px",height:pixels+"px",flowChildren:"none",backgroundColor:"#ffffff",
                margin:"0px",padding:"0px",border:"0px",overflow:"clip"});
            qr.forEach(function(bits,y) {
                for (var start=0; start<size;) {
                    var end=start+1; while (end<size && bits[end]===bits[start]) end++;
                    if (bits[start] === "1") {
                        var run=$.CreatePanel("Panel",parent,"");
                        if (!valid(run) || !run.GetParent || run.GetParent() !== parent) throw new Error("qr_panel_unavailable");
                        rect(run,start*cell,y*cell,(end-start)*cell,cell);
                        paint(run,{ignoreParentFlow:"true",backgroundColor:"#000000",border:"0px"});
                        run.hittest=false; run.hittestchildren=false; panels.push(run);
                    }
                    start=end;
                }
            });
            lastMatrix=matrix; qrCache={parent:parent,panels:panels};
            parent.style.visibility="visible";
            return true;
        } catch (ignore) { clear(); return false; }
    }
    function render() {
        if (!alive()) return;
        prepareShell();
        var p = current(), order = orders[selected];
        var active=order && !terminal(order.state), shownChannel=active?(order.provider||"wechat"):channel;
        var hasOrder=!!order && order.state!=="closed",receipt=!!order && (order.state==="delivered" || order.state==="paid_review");
        syncQuantity(p,order);
        dialog.SetHasClass("HasOrder",hasOrder);dialog.SetHasClass("Receipt",receipt);
        setText("PaymentHeading",receipt?"支付结果":hasOrder?"扫码支付":"订单确认");
        if(menuView)menuView.SetTitle(receipt?"支付结果":hasOrder?"扫码支付":"订单确认");
        setText("PaymentHint",receipt?"订单结果已保存 · 可返回商城继续查看":hasOrder?"订单有效期 30 分钟 · 付款后自动到账":isRecharge(p)?"数量可输入或用 + / − 调整 · 每份1元=100G币":"数量可输入或用 + / − 调整 · 1元=100G币");
        ["wechat","alipay"].forEach(function(value){
            var button=$(value==="wechat"?"#PaymentWeChat":"#PaymentAlipay");
            button.enabled=!busy && !active && channelAvailable(value);
            button.SetHasClass("Selected",shownChannel===value);
        });
        var shown=order && order.state!=="closed" ? order : quote(p,quantity);
        $("#PaymentTitle").text = shown ? rewardNameText(shown.title) : "正在加载商品";
        $("#PaymentDescription").text = shown ? rewardNameText(shown.description) : "请先完成对局登录";
        var art=$("#PaymentProductArt"),artwork={sku:shown&&shown.sku||p&&p.sku,icon:shown&&(shown.icon||(p&&p.icon))};
        var gradeSource=shown&&(shown.quality!==undefined||shown.rarity!==undefined)?shown:p;
        ["quality","rarity"].forEach(function(field){if(gradeSource&&gradeSource[field]!==undefined)artwork[field]=gradeSource[field];});
        ["reward_lines","product_type"].forEach(function(field){
            if(shown&&shown[field]!==undefined)artwork[field]=shown[field];
            else if(p&&p[field]!==undefined)artwork[field]=p[field];
        });
        var icons=cfg.SurvivalCommerceComponents,icon=icons&&icons.ProductIcon?icons.ProductIcon(artwork):artwork.icon;
        var uri=icons&&icons.NormalizeIconURI?icons.NormalizeIconURI(icon):typeof icon==="string"&&/^custom_game\/[A-Za-z0-9_\/-]+\.png$/.test(icon)&&icon.indexOf("..")<0?"file://{images}/"+icon:"";
        if(art){
            art.style.visibility=uri?"visible":"collapse";
            var resource=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Lookup(artwork);
            var grade=cfg.SurvivalItemResources&&cfg.SurvivalItemResources.Grade?cfg.SurvivalItemResources.Grade(artwork):"";
            var special=resource&&(resource.kind==="vip"||resource.kind==="hero"),key=special?[resource.id,resource.kind,resource.uri,resource.vip_level,grade].join(":"):"";
            if(art.__paymentResourceKey!==key){
                if(art.__paymentResourceIcon&&art.__paymentResourceIcon.IsValid())art.__paymentResourceIcon.DeleteAsync(0);
                art.__paymentResourceIcon=null;art.__paymentResourceKey=key;
                if(special&&icons&&icons.ItemIcon){
                    var productIcon=icons.ItemIcon(art,artwork,"",{width:64,height:64});
                    productIcon.style.width="100%";productIcon.style.height="100%";productIcon.style.position="0px 0px 0px";
                    art.__paymentResourceIcon=productIcon;
                }
            }
            if(art.SetImage)art.SetImage(special?"":uri);
            if(cfg.SurvivalRewardPresentation&&cfg.SurvivalRewardPresentation.FillIcon)cfg.SurvivalRewardPresentation.FillIcon(special?art.__paymentResourceIcon:art,artwork);
        }
        $("#PaymentPrice").text = "合计 "+priceText(shown,false,hasOrder);
        setText("PaymentUnitPrice",isRecharge(shown)?rechargeValid(shown)?"每份 1 元 = 100 G币\n到账 "+shown.recharge_u_coin_per_unit*quantity+" G币（"+quantity+" 份）":"充值金额及到账数量待同步":shown?"单价 "+priceText(unitQuote(shown,quantity),false,hasOrder)+" · "+quantity+" 件":"");
        $("#PaymentValues").html=true;$("#PaymentValues").text = escapedLines(valuesText(shown,order));
        buy.enabled = !busy && !!p && enabled(p.enabled) && priceValid(p) && (!order || order.state === "closed" || order.state==="delivered");
        buy.enabled=buy.enabled && !catalogDirty && channelAvailable(shownChannel) && !quantityInputInvalid && quantity<=quantityMaximum(p);
        var buyPrice=active?order:quote(p,quantity);
        $("#PaymentBuyLabel").text = p ? (shownChannel==="alipay"?"支付宝":"微信")+(isRecharge(buyPrice)?"充值 ":"购买 ")+(uPrice(buyPrice,active)?buyPrice.u_coin_price+" G币":priceText(buyPrice,false,active)) : "加载中";
        var canOpen = order && priceValid(order,true) && order.state === "pending" && !order.expired && validURL(order.checkout_url);
        $("#PaymentOpen").style.visibility = canOpen ? "visible" : "collapse";
        $("#PaymentOpenLabel").text=shownChannel==="alipay" && order && order.checkout_mode!=="qr"?"打开支付宝收银台":"浏览器备用付款页";
        $("#PaymentCancel").style.visibility=active?"visible":"collapse";
        $("#PaymentCancel").enabled=!busy;
        $("#PaymentLink").style.visibility = "collapse";
        if (canOpen) $("#PaymentLink").text = order.checkout_url;
        var hasQR=drawQR(canOpen ? order.qr_matrix : null);
        setText("PaymentQRChannel",(order && order.provider==="alipay"?"支付宝":"微信支付")+" · "+quantity+(isRecharge(shown)?" 份":" 件"));
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
                delivered:isRecharge(order)?"充值成功："+(order.recharge_u_coin_per_unit*quantity)+" G币已到账。":"支付成功：" + rewardNameText(order.title) + " 的全部奖励已写入存档。",
                paid_review:"已收到付款，奖励暂未到账，请保留订单号联系处理，请勿重复付款。",
                closed:"订单已关闭，可以重新购买。"};
            status.text = order.expired && !terminal(order.state) ? "付款码已过期，正在核对最终状态。" : labels[order.state] || "正在查询…";
            if(active && !priceValid(order,true))status.text=isRecharge(order)?"充值金额及到账数量尚未同步，请查询付款结果核对。":"G币订单价格尚未同步，请查询付款结果核对。";
            if (order.state === "created") buy.enabled = !busy && !!p && enabled(p.enabled) && priceValid(p) && priceValid(order,true) && channelAvailable(shownChannel);
        } else status.text = !p?"商品支付目录尚未同步，请刷新目录后重试。":!enabled(p.enabled) ? messages[p.disabled_reason] || "此商品暂不可购买。" : uPrice(p)?"直接购买此道具，付款后全部奖励一起到账，自动刷新。":"付款后全部奖励一起到账，自动刷新。";
        if(quantityInputInvalid&&!hasOrder){buy.enabled=false;status.text="请输入 1–"+quantityMaximum(p)+" 的整数数量。";}
        products.forEach(function(item) {
            if (item.panel) {
                item.panel.SetHasClass("Selected", item.sku === selected);
                item.ownedLabel.text = (item.owned>0?"已购 "+item.owned+" · ":"")+(enabled(item.enabled)?priceText(item,false):"暂不可购买");
            }
        });
        paintActions();
        layoutCheckout();
    }
    function request(action, sku) {
        if (!alive() || busy) return false;
        busy = true; render();
        var ticket = ++generation, body = {action:action,request_id:requestEpoch+"_"+(++requestSerial)};
        activeRequest=body;
        if (sku) body.sku = sku;
        if(action==="create"){body.provider=channel;body.quantity=quantity;}
        if(action==="catalog")catalogRequests++;
        GameEvents.SendCustomGameEventToServer("survival_payment_request", body);
        // An order response can wait for both the 32s transport deadline and
        // the server's 35s authoritative profile refresh. Keep one stable
        // request ID throughout; superseded/timed-out replies remain rejected.
        $.Schedule(action==="catalog"?32:70, function() {
            if (alive() && ticket === generation && busy) {
                busy=false;activeRequest=null;render();setStatus("请求超时，请查询结果后重试。");
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
    function refreshRewardWallet(key) {
        if(!key || rewardWalletRefreshes[key])return;
        var job=rewardWalletRefreshes[key]={attempts:0},delays=[1.1,3,9,18,30,40];
        function invalidateWallet(){var api=cfg.SurvivalCommerceWallet;if(api&&!job.invalidated&&api.Invalidate){api.Invalidate();job.invalidated=true;}}
        invalidateWallet();
        function attempt(){
            if(!alive() || rewardWalletRefreshes[key]!==job)return;
            var api=cfg.SurvivalCommerceWallet;
            // Invalidate once per delivered order before requesting a fresh wallet.
            // A catalogue already in flight must not publish the pre-payment balance.
            invalidateWallet();
            if(api && api.Refresh && api.Refresh()!==false){job.finished=true;return;}
            // The wallet can already have a 105s catalogue/exchange request in flight.
            // Retry only this local busy gate, with one accepted read per reward.
            if(job.attempts<delays.length)$.Schedule(delays[job.attempts++],attempt);
        }
        $.Schedule(0,attempt);
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
            var copy={};Object.keys(p).forEach(function(key){copy[key]=p[key];});
            if(isRecharge(p)?!rechargeValid(p):hasUPrice(p) && !uPrice(p)){copy.enabled=false;copy.disabled_reason="payment_price_unavailable";}
            return copy;
        });
        // Catalog edits cannot strand a checkout that was already created.
        Object.keys(orders).forEach(function(sku){
            var order=orders[sku];
            if((!terminal(order.state) || order.state==="paid_review") && !products.some(function(p){return p.sku===sku;}))
                products.push({sku:sku,title:order.title,description:order.description,amount_fen:order.amount_fen,u_coin_price:order.u_coin_price,u_coin_per_yuan:order.u_coin_per_yuan,enabled:false,owned:0});
        });
        var nextRevision=JSON.stringify(products.map(function(p){return [p.sku,p.title];}));
        if(nextRevision!==listRevision){
          listRevision=nextRevision;
          var list = $("#PaymentProducts"); list.RemoveAndDeleteChildren();
          products.forEach(function(p, index) {
            var card=$.CreatePanel("Button",list,""); card.AddClass("PaymentProduct"); p.panel=card;
            var number=$.CreatePanel("Label",card,""); number.AddClass("PaymentProductNumber"); number.text="0"+(index+1);
            var title=$.CreatePanel("Label",card,""); title.AddClass("PaymentProductTitle"); title.text=rewardNameText(p.title);
            var price=$.CreatePanel("Label",card,""); price.AddClass("PaymentProductOwned"); p.ownedLabel=price;
            card.SetPanelEvent("onactivate",function(){selected=p.sku; render();});
          });
        }else products.forEach(function(p,index){p.panel=oldProducts[index].panel;p.ownedLabel=oldProducts[index].ownedLabel;});
        if (!current() && !(opened && selected)) selected = products.length ? products[0].sku : "";
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
        if(menuView){if(value)menuView.Open();else menuView.Close();}
    }
    function closeShop() { setOpen(false); }
    PaymentToggle=function(){setOpen(!opened);if(opened)refreshCatalog();};
    function openShop() { if(!alive())return;closeShop();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();else {setOpen(true);refreshCatalog();} }
    PaymentShop=function(){
        if(!alive())return;
        closeShop();
        var view=cfg.SurvivalCommerceView;
        if(view){if(!view.IsOpen||!view.IsOpen())view.Open();}
        else {setOpen(true);refreshCatalog();}
    };
    function inspectCache(){return {ready:catalogReady,dirty:catalogDirty,pending:activeRequest?activeRequest.action:"",catalogRequests:catalogRequests,
        ageSeconds:catalogReady?Math.floor((Date.now()-catalogCheckedAt)/1000):null,quantity:quantity,maxQuantity:quantityMaximum(current()),opened:opened,layout:"compact_checkout",width:580,height:parseFloat(dialog.style.height)||334};}
    cfg.SurvivalPayments=api={Open:openShop,IsRealMoneyEnabled:runtimeAllowed,GetCatalog:function(){return catalog;},RefreshCatalog:refreshCatalog,Inspect:inspectCache,
        Checkout:function(sku){if(!alive())return false;if(orders[sku]&&terminal(orders[sku].state)&&orders[sku].state!=="paid_review")delete orders[sku];selected=sku;quantitySku=sku;quantity=1;quantityInputInvalid=false;setOpen(true);render();refreshCatalog();return true;},
        Dispose:function(){
            if(disposed)return;
            // Native panels can already be gone during a HUD rebuild. Retire
            // callbacks first so a failed shell cleanup cannot keep them alive.
            disposed=true;opened=false;busy=false;activeRequest=null;generation++;
            orders={};products=[];gameValues={};gameEntitlements={};wallet={};catalog={products:[],categories:[]};lastMatrix="";rewardWalletRefreshes={};catalogReady=false;catalogDirty=false;
            if(valid($("#PaymentQR")))$("#PaymentQR").RemoveAndDeleteChildren();if(valid($("#PaymentLink")))$("#PaymentLink").text="";
            var previousSubscriptions=subscriptions;subscriptions=[];
            previousSubscriptions.forEach(function(id){GameEvents.Unsubscribe(id);});
            try{if(menuView)menuView.Dispose();else if(shell)shell.Dispose();}
            finally{
                if(valid(dialog)){dialog.hittest=false;dialog.hittestchildren=false;dialog.SetHasClass("Open",false);}
                if(valid(scrim)){scrim.hittest=false;scrim.hittestchildren=false;scrim.SetHasClass("Open",false);}
                if(valid(inputShield)){inputShield.hittest=false;inputShield.hittestchildren=false;}
                if(valid(shellShield))shellShield.DeleteAsync(0);
                if(valid(lifetime))lifetime.DeleteAsync(0);
            }
        }};
    PaymentBuy=function(){
        if(!alive())return;
        var p=current(), order=orders[selected];
        if (!p || !enabled(p.enabled) || !priceValid(p) || quantityInputInvalid || quantity>quantityMaximum(p) || catalogDirty || busy || (order && order.state!=="closed" && order.state!=="created" && order.state!=="delivered") || (order && order.state==="created" && !priceValid(order,true))) return;
        if(!channelAvailable(channel))return;
        if (request("create",selected)) setStatus("正在创建 "+quantity+(isRecharge(p)?" 份充值":" 件")+" · " + priceText(quote(p,quantity),false) + (channel==="alipay"?" 支付宝":" 微信")+"订单…");
    };
    PaymentChannel=function(value){if(!alive())return;var order=orders[selected];if(busy || (order && !terminal(order.state)))return;if((value==="wechat" || value==="alipay") && channelAvailable(value)){channel=value;render();}};
    PaymentCancel=function(){var order=orders[selected];if(order && !terminal(order.state) && request("cancel",selected))setStatus("正在核对并关闭订单，请稍候…");};
    PaymentOpen=function(){if(!alive())return;var order=orders[selected];if(order && priceValid(order,true) && order.state==="pending" && !order.expired && validURL(order.checkout_url))$.DispatchEvent("ExternalBrowserGoToURL",order.checkout_url);};
    PaymentRefresh=function(){if(orders[selected])request("status",selected);else refreshCatalog(true);};
    var messages={quantity_invalid:"请输入有效的整数数量。",quantity_limit_exceeded:"数量超过本商品当前可购买上限。",order_quantity_conflict:"已恢复此前未完成订单的数量，请先完成或取消原订单。",order_provider_conflict:"已恢复原订单的支付方式，请先完成或取消原订单。",vip_level_required:"VIP等级不足，暂不可购买此礼包。",test_account_required:"商城当前仅对指定测试账号开放。",already_owned:"你已经拥有此商品。",
        payment_price_unavailable:"G币商品价格尚未同步，请刷新支付目录后重试。",
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
        if(cfg.SurvivalDevelopmentPayments!==true&&(!data||typeof data.request_id!=="string"||!activeRequest||data.request_id!==activeRequest.request_id))return;
        // A late response cannot unlock or replace a newer request (including after a HUD reload).
        if(data.request_id && (!activeRequest || data.request_id!==activeRequest.request_id))return;
        if(activeRequest && data.action===activeRequest.action){busy=false;activeRequest=null;generation++;}
        if (!data.ok) {
            render(); if(data.error==="test_account_required")entry.style.visibility="collapse";
            setStatus(messages[data.error]||"暂时无法完成请求，请稍后重试。");
            var failure=status.text;
            // Explicit identity/session loss invalidates every account-scoped read,
            // including background status. A temporarily loading status retains its order.
            if(["test_account_required","match_session_missing","unauthorized"].indexOf(data.error)>=0
                || (data.action==="catalog" && data.error==="profile_not_ready")){
                catalogReady=false;catalogDirty=false;catalog={products:[],categories:[],error:failure};products=[];listRevision="";
                orders={};lastMatrix="";rewardWalletRefreshes={};
                $("#PaymentProducts").RemoveAndDeleteChildren();
                if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.UpdateCatalog(catalog);
                render();
            }
            setStatus(failure);
            if(data.action==="catalog")catalogFailed(failure,data.error!=="test_account_required" && data.error!=="unauthorized");
            return;
        }
        entry.style.visibility="collapse";
        gameValues=data.game_values||gameValues; wallet=data.wallet||wallet; matchFrozen=!!data.match_frozen;
        gameEntitlements=data.game_entitlements||gameEntitlements;
        if (data.action==="reset") {
            invalidateCatalog();orders={}; lastMatrix="";rewardWalletRefreshes={};
            refreshRewardWallet("reset:"+(data.request_id||(++walletResetSerial)));render(); setStatus("远端测试数据已清理，正在更新商品列表。");
            $.Schedule(1.1,refreshCatalog); return;
        }
        if (data.action==="catalog") { buildList(data); return; }
        var previous=orders[data.sku];
        if (!previous || previous.order_id!==data.order_id || !terminal(previous.state) || terminal(data.state)) orders[data.sku]=data;
        if (data.state==="delivered") {
            invalidateCatalog();
            if(typeof data.order_id==="string" && data.order_id)refreshRewardWallet("order:"+data.order_id);
            // Ownership and repeatability come from the authoritative refreshed catalogue.
            $.Schedule(1.1,refreshCatalog);
        }
        if (data.action==="create") {selected=data.sku;if(opened)setOpen(true);}
        render();
        if(data.warning)setStatus(messages[data.warning]||"已恢复未完成订单，请核对数量和支付方式。");
    }));
    subscriptions.push(GameEvents.Subscribe("survival_payment_open",function(data){
        if(!alive())return;
        if(data && typeof data.sku==="string" && /^[a-z0-9_]{4,64}$/.test(data.sku)){
            api.Checkout(data.sku);
        }else openShop();
    }));
    if(typeof Game!=="undefined"&&Game.IsInToolsMode&&Game.IsInToolsMode()&&Game.AddCommand){
        var monthlyInspectCommand="survival_monthly_ui_inspect_"+Date.now();
        Game.AddCommand(monthlyInspectCommand,function(){
            var daily=cfg.SurvivalDaily,U=cfg.SurvivalUI,modal=U&&U.ModalManager&&U.ModalManager.Get("daily_rewards"),parents=[],node=modal&&modal.panel;
            while(valid(node)&&parents.length<8){parents.push({id:node.id,visible:node.visible,visibility:node.style.visibility,opacity:node.style.opacity,z:node.style.zIndex,width:node.actuallayoutwidth,height:node.actuallayoutheight});node=node.GetParent();}
            $.Msg("[MONTHLY_UI_STATE] "+JSON.stringify({alive:alive(),disposed:disposed,current:cfg.SurvivalPayments===api,daily:daily&&daily.Inspect?daily.Inspect():null,checkout:opened,top:cfg.SurvivalUILayers&&cfg.SurvivalUILayers.Top(),dailyParents:parents}));
        },"Inspect daily and monthly checkout visibility; no orders",0);
        $.Msg("[MONTHLY_UI_INSPECT_COMMAND] "+monthlyInspectCommand);
    }
    // Read-only UI diagnostics: no prices, account identity, checkout tokens or grants.
    if(typeof Game!=="undefined" && Game.AddCommand)Game.AddCommand("survival_shop_open",function(){
        openShop();$.Msg("PAYMENT_UI_DIAG:"+JSON.stringify({checkout:opened,products:products.length,cache:inspectCache(),
            store:cfg.SurvivalCommerceView?cfg.SurvivalCommerceView.Inspect():null}));
    },"Open the authenticated shop UI without creating an order",0);
    function nextPendingSku() {
        var skus=Object.keys(orders).filter(function(sku){return orders[sku] && !terminal(orders[sku].state);}).sort();
        return skus.length?skus[(skus.indexOf(statusCursor)+1)%skus.length]:"";
    }
    function tick() {
        if (!alive()) return;
        ticks++;
        if (!busy) {
            var sku=nextPendingSku();
            if(sku){
                // Closing checkout must not stop reconciliation. One read per tick,
                // rotating pending SKUs; a due catalogue gets every other turn.
                if(catalogTurn && (catalogDirty || shopVisible()) && refreshCatalog())catalogTurn=false;
                else if(request("status",sku)){statusCursor=sku;catalogTurn=true;}
            }else if (ticks===1 || catalogDirty || shopVisible()) refreshCatalog();
        }
        $.Schedule(5,tick);
    }
    $.Schedule(5,tick);
    return api;
    }
    if(gate&&typeof gate.Subscribe==="function")gateListener=gate.Subscribe(reconcile);
    try{if(root&&$.RegisterEventHandler)$.RegisterEventHandler("PanelDeleted",root,dispose);}catch(ignore){}
    reconcile();
}());
