(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), root=$.GetContextPanel(), disposed=false;
    if(cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.Dispose){try{cfg.SurvivalCommerceWallet.Dispose();}catch(error){if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;$.Msg("[CommerceResult] Previous result panel was already deleted.");}}
    var catalog={products:[],categories:[],balances:{}}, inflight=null, draft=null, serial=0, selected=null, pending=cfg.SurvivalCommercePending||null;
    var epoch=String(Date.now())+"_"+String(Math.random()).slice(2), shell=null, dialog=null, scrim=null, status=null, copy=null, retry=null, resultTitle=null, resultKind="idle", resultMessage="", resultItem=null, opened=false;
    var labels={u_coin:"G币",shop_points:"商城积分",shop_gold:"商城金币"};
    var invalidationVersion=0,syncedVersion=0,invalidationAttempts=0,invalidationTask=null,stalePrice=false;
    var errors={commerce_balance_insufficient:"商城余额不足。",shop_gold_not_open:"商城金币暂未开放。",already_owned:"已拥有该商品，不能重复兑换。",
        component_already_owned:"道具已达到持有上限。",attribute_limit_reached:"属性已达到上限。",commerce_busy:"操作处理中，请稍后重试。",
        profile_not_ready:"请先完成对局登录。",archive_config_mismatch:"商城正在更新，请稍后重新进入对局。",
        product_unavailable:"商品暂不可兑换。",archive_id_conflict:"兑换请求不一致，请重新打开商城。",
        commerce_price_changed:"商品价格已更新，请重新确认。",starjoy_exchange_disabled:"曙光积分仅累计，不能兑换。"};
    function pointsInsufficient(item){
        if(!item || item.currency!=="shop_points")return false;
        var reason=item.disabled_reason;
        if(reason==="commerce_balance_insufficient" || reason==="insufficient_balance")return true;
        // Other eligibility errors keep their own authoritative refusal reason.
        if(reason)return false;
        var balance=catalog.balances && catalog.balances.shop_points,price=item.price;
        // Missing or malformed balances are unknown, never evidence of zero.
        return typeof balance==="number" && isFinite(balance) && balance>=0
            && typeof price==="number" && isFinite(price) && price>=0 && balance<price;
    }
    function rejectPoints(item){
        if(!pointsInsufficient(item))return false;
        showResult("failure","您的积分不足",true);
        return true;
    }
    function rows(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function display(value){var shared=cfg.SurvivalCommerceComponents;return shared&&shared.RewardNameText?shared.RewardNameText(value):String(value===undefined||value===null?"":value).replace(/U币/g,"G币");}
    function publish(){if(cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.UpdateWalletCatalog)cfg.SurvivalCommerceView.UpdateWalletCatalog(catalog);if(cfg.SurvivalMenuV10&&cfg.SurvivalMenuV10.Refresh)cfg.SurvivalMenuV10.Refresh();}
    function text(parent,id,value,cls){var p=$.CreatePanel("Label",parent,id);p.text=value;if(cls)p.AddClass(cls);p.hittest=false;return p;}
    function close(){opened=false;if(shell)shell.Close();}
    function backToStore(){
        close();
        // The controller's cached IsOpen flag can outlive its actual modal.
        // Restore the owned shell itself without refreshing its live catalog,
        // scroll position or pending transaction. A standalone result has no
        // initialized storefront underneath and still uses the full view Open.
        var view=cfg.SurvivalCommerceView,U=cfg.SurvivalUI;
        var store=U&&U.ModalManager&&U.ModalManager.Get&&U.ModalManager.Get("commerce");
        if(view&&view.IsOpen&&view.IsOpen()&&store&&valid(store.panel)&&typeof store.Open==="function")store.Open();
        else if(view&&typeof view.Open==="function")view.Open();
    }
    function button(parent,id,label,action){var p=$.CreatePanel("Button",parent,id);p.AddClass("CommerceResultButton");p.hittestchildren=false;text(p,"",label,"");p.SetPanelEvent("onactivate",function(){if(!disposed&&p.enabled!==false)action();return true;});return p;}
    function prepare(){
        if(disposed||!valid(root))return false;
        if(shell)return valid(dialog);
        var U=cfg.SurvivalUI;if(!U||!U.ModalShell)return false;
        scrim=$.CreatePanel("Button",root,"CommerceResultScrim");scrim.AddClass("CommerceResultScrim");
        dialog=$.CreatePanel("Panel",root,"CommerceResultDialog");dialog.AddClass("CommerceResult");
        var header=$.CreatePanel("Panel",dialog,"");header.AddClass("CommerceResultHeader");
        resultTitle=text(header,"CommerceResultTitle","兑换结果","CommerceResultTitle");
        var exit=button(header,"CommerceResultClose","×",close);exit.AddClass("CommerceResultClose");
        var body=$.CreatePanel("Panel",dialog,"");body.AddClass("CommerceResultBody");
        status=text(body,"CommerceResultStatus","","CommerceResultStatus");
        copy=text(body,"CommerceResultCopy","","CommerceResultCopy");
        var actions=$.CreatePanel("Panel",dialog,"");actions.AddClass("CommerceResultActions");
        retry=button(actions,"CommerceResultRetry","查询兑换结果",purchase);retry.AddClass("CommerceResultPrimary");
        button(actions,"CommerceResultBack","返回商城",backToStore);
        shell=U.ModalShell.Adopt({id:"commerce_result",root:root,panel:dialog,scrim:scrim,closeButton:exit,width:560,height:346,fit:{widthFraction:.94,heightFraction:.88,maxScale:1},onClose:close});
        // The same dark stone and gold palette as our marketplace; no old page chrome.
        dialog.style.backgroundImage="none";dialog.style.backgroundColor="#22201dfc";dialog.style.border="1px solid #9b8c62";dialog.style.boxShadow="#00000099 0px 8px 24px 0px";
        shell.Close();return true;
    }
    function balance(value){return typeof value==="number"&&isFinite(value)&&value>=0?String(value):"—";}
    function render(){
        if(disposed||!valid(dialog))return;
        var p=resultItem||(pending&&pending.item)||selected,currency=p&&labels[p.currency]||"商城余额",value=p&&catalog.balances[p.currency];
        resultTitle.text={pending:"正在兑换",success:"兑换成功",failure:"兑换失败",unknown:"兑换结果待确认"}[resultKind]||"兑换结果";
        status.text=display(resultMessage);
        copy.text=p?display(p.title)+"\n售价："+balance(p.price)+" "+currency+"\n商城余额："+balance(value)+" "+currency:"";
        dialog.SetHasClass("CommerceResultSuccess",resultKind==="success");dialog.SetHasClass("CommerceResultFailure",resultKind==="failure");
        retry.visible=resultKind==="unknown"&&!!pending;retry.enabled=retry.visible&&!inflight&&!stalePrice;
    }
    function showResult(kind,message,open){
        resultKind=kind;resultMessage=message;
        if(!prepare())return false;
        render();if(open){opened=true;shell.Open();}return true;
    }
    function request(action,sku,token){
        if(disposed || !valid(root) || inflight)return false;
        var id=token||epoch+"_"+(++serial);inflight={action:action,request_id:id,walletVersion:invalidationVersion};
        if(action==="catalog")draft=null;
        GameEvents.SendCustomGameEventToServer("survival_commerce_request",{action:action,sku:sku||"",request_id:id});render();
        // Three 32s provider attempts and two 1s gaps retain one purchase ID.
        $.Schedule(105,function(){if(!disposed && valid(root) && inflight && inflight.request_id===id){inflight=null;draft=null;
            if(action==="catalog"){catalog.error="商城兑换目录暂未连接，请稍后重试。";publish();}
            if(action==="purchase")showResult("unknown","请求超时，兑换结果尚未确认。请查询同一笔结果，不会重复扣款。",false);queueInvalidation();}});return true;
    }
    function refresh(){
        // A storefront reopen during an older request still needs a fresh
        // catalog afterwards. Keep the public busy return value while the
        // existing invalidation generation coalesces and rejects old replies.
        if(inflight){invalidate();return false;}
        return request("catalog");
    }
    function queueInvalidation(){
        if(disposed||!valid(root)||invalidationTask||syncedVersion>=invalidationVersion||invalidationAttempts>=3)return;
        var task=invalidationTask={},delay=invalidationAttempts<2?1.1:3;
        $.Schedule(delay,function(){
            if(invalidationTask!==task||disposed||!valid(root))return;
            invalidationTask=null;
            if(inflight||syncedVersion>=invalidationVersion)return;
            invalidationAttempts++;
            refresh();
        });
    }
    function invalidate(){
        if(disposed||!valid(root))return false;
        invalidationVersion++;invalidationAttempts=0;queueInvalidation();return true;
    }
    function purchase(){
        if(disposed||!valid(root)||!pending||inflight||stalePrice)return false;
        showResult("pending","正在兑换，请稍候。",false);
        return request("purchase",pending.sku,pending.id);
    }
    var subscription=GameEvents.Subscribe("survival_commerce_result",function(result){
        if(disposed || !valid(root) || !inflight || !result || result.action!==inflight.action || result.request_id!==inflight.request_id)return;
        var ok=result.ok===true || result.ok===1;
        if(result.action==="catalog" && ok){
            if(result.part==="begin")draft={products:[],categories:rows(result.categories),balances:result.balances||{},count:Number(result.count)};
            else if(result.part==="product" && draft)draft.products[Number(result.index)-1]=result.product;
            else if(result.part==="end" && draft){
                if(draft.products.filter(function(p){return !!p;}).length!==draft.count)return;
                var version=inflight.walletVersion;
                if(version<invalidationVersion){draft=null;inflight=null;queueInvalidation();return;}
                catalog=draft;draft=null;inflight=null;syncedVersion=version;invalidationAttempts=0;publish();
                if(selected){var fresh=catalog.products.filter(function(p){return p.sku===selected.sku;})[0];if(fresh){selected=fresh;stalePrice=false;}}render();
            }
            return;
        }
        var completedVersion=inflight.walletVersion;inflight=null;
        if(result.action==="purchase"){
            resultItem=(pending&&pending.item)||selected;
            if(resultItem&&typeof result.price==="number"&&isFinite(result.price)&&result.price>=0&&Object.prototype.hasOwnProperty.call(labels,result.currency)){var receipt={};Object.keys(resultItem).forEach(function(key){receipt[key]=resultItem[key];});receipt.price=result.price;receipt.currency=result.currency;resultItem=receipt;}
            if(ok || result.terminal===true || result.terminal===1)pending=cfg.SurvivalCommercePending=null;
            if(ok){if(completedVersion===invalidationVersion&&Object.prototype.hasOwnProperty.call(labels,result.currency)&&typeof result.balance==="number"&&isFinite(result.balance)&&result.balance>=0)catalog.balances[result.currency]=result.balance;showResult("success","兑换成功，商品效果已保存。",false);
                $.Schedule(1.1,function(){if(!disposed)refresh();});}
            else if(result.error==="commerce_price_changed"&&(result.terminal===true||result.terminal===1)){
                // A changed quote is terminal. Refresh its authoritative replacement;
                // only another explicit storefront click may create a new purchase.
                stalePrice=true;showResult("failure",errors.commerce_price_changed+" 请返回商城核对新价格后再次点击兑换。",false);refresh();
            }
            else if(result.terminal===true || result.terminal===1){
                showResult("failure",errors[result.error]||"兑换未完成，请返回商城检查商品状态后重试。",false);
            }else showResult("unknown",errors[result.error]||"兑换尚未确认，请查询同一笔结果。",false);
        }else{catalog.error=errors[result.error]||"商城兑换目录暂未连接，请稍后重试。";publish();render();}
        queueInvalidation();
    });
    function dispose(){
        if(disposed)return;disposed=true;opened=false;invalidationTask=null;GameEvents.Unsubscribe(subscription);
        try{if(shell)shell.Dispose();}finally{[dialog,scrim].forEach(function(p){if(valid(p))p.DeleteAsync(0);});}
    }
    cfg.SurvivalCommerceWallet={Refresh:refresh,Invalidate:invalidate,GetCatalog:function(){return catalog;},
        Checkout:function(sku){
            if(disposed||!valid(root))return false;
            if(pending)sku=pending.sku;
            resultItem=null;
            selected=catalog.products.filter(function(p){return p.sku===sku;})[0]||(pending&&pending.item)||null;
            if(inflight){if(inflight.action==="purchase"&&pending)return showResult("pending","正在兑换，请稍候。",true);showResult("failure","商城目录正在同步，请稍后再试。",true);return false;}
            if(!selected){showResult("failure","商品暂不可兑换，请刷新商城后重试。",true);return false;}
            if(stalePrice){showResult("failure","商品价格正在刷新，请稍后返回商城核对。",true);refresh();return false;}
            if(!pending){
                if(rejectPoints(selected))return false;
                if(selected.enabled!==true&&selected.enabled!==1){showResult("failure",errors[selected.disabled_reason]||"此商品暂不可兑换。",true);return false;}
                if(!prepare())return false;

                pending=cfg.SurvivalCommercePending={sku:selected.sku,id:epoch+"_buy_"+(++serial),item:selected};
            }
            if(!showResult("pending","正在兑换，请稍候。",true))return false;
            return purchase();
        },
        Inspect:function(){return {opened:opened,result:resultKind,pending:pending?{sku:pending.sku,request_id:pending.id}:null,inflight:inflight?inflight.action:"",selected:selected&&selected.sku||"",stalePrice:stalePrice};},
        CloseResult:close,Dispose:dispose};
    try{$.RegisterEventHandler("PanelDeleted",root,dispose);}catch(ignore){}
    publish();
}());
