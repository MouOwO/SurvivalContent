(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), root=$.GetContextPanel(), disposed=false;
    if(cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.Dispose){try{cfg.SurvivalCommerceWallet.Dispose();}catch(error){if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;$.Msg("[CheckoutPurple] Previous wallet panel was already deleted.");}}
    var catalog={products:[],categories:[],balances:{}}, inflight=null, draft=null, serial=0, selected=null, pending=cfg.SurvivalCommercePending||null;
    var epoch=String(Date.now())+"_"+String(Math.random()).slice(2), shell=null, menuView=null, dialog=null, scrim=null, status=null, copy=null, buy=null;
    var labels={u_coin:"U币",shop_points:"商城积分",shop_gold:"商城金币"};
    var invalidationVersion=0,syncedVersion=0,invalidationAttempts=0,invalidationTask=null;
    var errors={commerce_balance_insufficient:"商城余额不足。",shop_gold_not_open:"商城金币暂未开放。",already_owned:"已拥有该商品，不能重复兑换。",
        component_already_owned:"道具已达到持有上限。",attribute_limit_reached:"属性已达到上限。",commerce_busy:"操作处理中，请稍后重试。",
        profile_not_ready:"请先完成对局登录。",archive_config_mismatch:"商城正在更新，请稍后重新进入对局。",
        product_unavailable:"商品暂不可兑换。",archive_id_conflict:"兑换请求不一致，请重新打开商城。"};
    function pointsInsufficient(item){
        if(!item || item.currency!=="shop_points")return false;
        var reason=item.disabled_reason;
        if(reason==="commerce_balance_insufficient" || reason==="insufficient_balance")return true;
        // Other eligibility errors keep their existing confirmation behavior.
        if(reason)return false;
        var balance=catalog.balances && catalog.balances.shop_points,price=item.price;
        // Missing or malformed balances are unknown, never evidence of zero.
        return typeof balance==="number" && isFinite(balance) && balance>=0
            && typeof price==="number" && isFinite(price) && price>=0 && balance<price;
    }
    function rejectPoints(item){
        if(!pointsInsufficient(item))return false;
        nativePointsError();
        return true;
    }
    function nativePointsError(){
        var native=cfg.SurvivalTooltipPosition;
        if(native && native.ShowNativeError)native.ShowNativeError(root,"您的积分不足");
        else GameEvents.SendEventClientSide("dota_hud_error_message",{reason:80,message:"您的积分不足"});
    }
    function rows(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function escapedLines(v){var shared=cfg.SurvivalCommerceComponents;return (shared&&shared.RewardNameText?shared.RewardNameText(v):String(v||"")).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
    function paint(button,primary){if(!valid(button))return;button.style.backgroundImage="none";button.style.backgroundColor=button.enabled===false?"#21172f":primary?"gradient(linear,0% 0%,0% 100%,from(#734a9e),to(#382346))":"#281b3e";button.style.border="1px solid "+(button.enabled===false?"#594363":"#b18a50");if(button.Children)button.Children().forEach(function(c){if(c.paneltype==="Label")c.style.color=button.enabled===false?"#a795b8":"#ffdc87";});}
    function publish(){if(cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.UpdateWalletCatalog)cfg.SurvivalCommerceView.UpdateWalletCatalog(catalog);if(cfg.SurvivalMenuV10&&cfg.SurvivalMenuV10.Refresh)cfg.SurvivalMenuV10.Refresh();}
    function text(parent,value,cls){var p=$.CreatePanel("Label",parent,"");p.text=value;p.AddClass(cls);return p;}
    function close(){if(menuView)menuView.Close();}
    function prepare(){
        if(disposed||!valid(root))return false;
        if(shell)return valid(dialog);
        var U=cfg.SurvivalUI,R=cfg.RemainingHandoff;if(!U || !R || !cfg.SurvivalMenuV10)return false;
        scrim=$.CreatePanel("Button",root,"");scrim.AddClass("RCBackdrop");
        dialog=$.CreatePanel("Panel",root,"");dialog.AddClass("RCWindow");dialog.AddClass("MenuV10Exchange");
        menuView=cfg.SurvivalMenuV10.Adopt({id:"commerce_exchange",navId:"commerce",root:root,panel:dialog,scrim:scrim,title:"商品兑换",onClose:close});
        shell=menuView.shell;
        menuView.SetSidebar([{id:"confirm",label:"商品兑换"},{id:"back",label:"返回商城"}],"confirm",function(id){if(id==="back"){close();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();}});
        copy=text(menuView.content,"","CommerceConfirmCopy");status=text(menuView.content,"","CommerceConfirmStatus");
        copy.html=true;
        buy=U.ActionButton(menuView.actions,{label:"确认兑换",action:purchase});buy.AddClass("CommerceConfirmBuy");
        var back=U.ActionButton(menuView.actions,{label:"返回商城",action:function(){close();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();}});
        back.AddClass("CommerceConfirmBack");paint(back,false);return true;
    }
    function render(message){
        if(disposed||!selected||!valid(copy)||!valid(status)||!valid(buy))return;
        var p=selected,balance=Number(catalog.balances[p.currency]||0);
        copy.text=escapedLines(p.title+"\n\n售价："+p.price+" "+labels[p.currency]+"\n商城余额："+balance+" "+labels[p.currency]+"\n"+
            (p.purchase_limit>0?"永久商品，限持有 "+p.purchase_limit+" 件":"可重复兑换")+"\n\n"+p.description);
        var insufficient=pointsInsufficient(p);
        status.text=message || (pending?"兑换结果待确认，重试会查询同一笔兑换。":p.enabled===true || p.enabled===1 || insufficient?"确认后扣除商城余额，奖励自动存入账号。":errors[p.disabled_reason]||"暂不可兑换。");
        buy.enabled=!inflight && (!!pending || p.enabled===true || p.enabled===1 || insufficient);
        if(menuView)menuView.SetResources([{icon:"gold",name:"U币",value:catalog.balances.u_coin||0},
            {icon:"purple_gem",name:"商城积分",value:catalog.balances.shop_points||0},{icon:"ticket",name:"商城金币",value:catalog.balances.shop_gold||0}]);
        paint(buy,true);
    }
    function request(action,sku,token){
        if(disposed || !valid(root) || inflight)return false;
        var id=token||epoch+"_"+(++serial);inflight={action:action,request_id:id,walletVersion:invalidationVersion};
        if(action==="catalog")draft=null;
        GameEvents.SendCustomGameEventToServer("survival_commerce_request",{action:action,sku:sku||"",request_id:id});render("正在同步…");
        $.Schedule(95,function(){if(!disposed && valid(root) && inflight && inflight.request_id===id){inflight=null;draft=null;
            if(action==="catalog"){catalog.error="商城兑换目录暂未连接，请稍后重试。";publish();}
            render("请求超时，请重试；同一笔兑换不会重复扣款。");queueInvalidation();}});return true;
    }
    function refresh(){return request("catalog");}
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
        if(disposed||!valid(root)||!selected || inflight)return;
        // An uncertain prior purchase must always query its original token.
        if(!pending && rejectPoints(selected))return;
        if(!pending)pending=cfg.SurvivalCommercePending={sku:selected.sku,id:epoch+"_buy_"+(++serial)};
        if(pending.sku!==selected.sku){render("请先确认上一笔兑换结果。");return;}
        request("purchase",pending.sku,pending.id);
    }
    var subscription=GameEvents.Subscribe("survival_commerce_result",function(result){
        if(disposed || !valid(root) || !inflight || result.request_id!==inflight.request_id)return;
        var ok=result.ok===true || result.ok===1;
        if(result.action==="catalog" && ok){
            if(result.part==="begin")draft={products:[],categories:rows(result.categories),balances:result.balances||{},count:Number(result.count)};
            else if(result.part==="product" && draft)draft.products[Number(result.index)-1]=result.product;
            else if(result.part==="end" && draft){
                if(draft.products.filter(function(p){return !!p;}).length!==draft.count)return;
                var version=inflight.walletVersion;
                if(version<invalidationVersion){draft=null;inflight=null;queueInvalidation();return;}
                catalog=draft;draft=null;inflight=null;syncedVersion=version;invalidationAttempts=0;publish();
                if(selected)selected=catalog.products.filter(function(p){return p.sku===selected.sku;})[0]||selected;render();
            }
            return;
        }
        var completedVersion=inflight.walletVersion;inflight=null;
        if(result.action==="purchase"){
            if(ok || result.terminal===true || result.terminal===1)pending=cfg.SurvivalCommercePending=null;
            if(ok){if(completedVersion===invalidationVersion)catalog.balances[result.currency]=result.balance;render("兑换成功，商品效果已保存。余额："+result.balance+" "+labels[result.currency]);
                $.Schedule(1.1,function(){if(!disposed)refresh();});}
            else if((result.terminal===true || result.terminal===1) && selected && selected.currency==="shop_points"
                && (result.error==="commerce_balance_insufficient" || result.error==="insufficient_balance")){
                nativePointsError();
                render();
            }else render(errors[result.error]||"兑换尚未确认，请重试查询同一笔结果。");
        }else{catalog.error=errors[result.error]||"商城兑换目录暂未连接，请稍后重试。";publish();render(catalog.error);}
        queueInvalidation();
    });
    cfg.SurvivalCommerceWallet={Refresh:refresh,Invalidate:invalidate,GetCatalog:function(){return catalog;},
        Checkout:function(sku){if(disposed||!valid(root))return false;if(pending)sku=pending.sku;selected=catalog.products.filter(function(p){return p.sku===sku;})[0];
            if(!selected || !pending && rejectPoints(selected) || !prepare())return false;render();menuView.Open();return true;},
        Dispose:function(){if(disposed)return;disposed=true;invalidationTask=null;GameEvents.Unsubscribe(subscription);var native=cfg.SurvivalTooltipPosition;if(native&&native.HideNativeError)native.HideNativeError(root);if(menuView)menuView.Dispose();[dialog,scrim].forEach(function(p){if(valid(p))p.DeleteAsync(0);});}};
    publish();
}());
