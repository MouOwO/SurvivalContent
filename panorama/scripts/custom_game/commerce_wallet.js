(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(), root=$.GetContextPanel(), disposed=false;
    if(cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.Dispose){try{cfg.SurvivalCommerceWallet.Dispose();}catch(error){if(!/Underlying panel is deleted|deleted Panel/i.test(String(error)))throw error;$.Msg("[CheckoutPurple] Previous wallet panel was already deleted.");}}
    var catalog={products:[],categories:[],balances:{}}, inflight=null, draft=null, serial=0, selected=null, pending=cfg.SurvivalCommercePending||null;
    var epoch=String(Date.now())+"_"+String(Math.random()).slice(2), shell=null, dialog=null, scrim=null, status=null, copy=null, buy=null;
    var labels={u_coin:"U币",shop_points:"积分",shop_gold:"金币"};
    var errors={commerce_balance_insufficient:"商城余额不足，充值暂未开放。",already_owned:"已拥有该商品，不能重复兑换。",
        component_already_owned:"道具已达到持有上限。",attribute_limit_reached:"属性已达到上限。",commerce_busy:"操作处理中，请稍后重试。",
        profile_not_ready:"请先完成对局登录。",archive_config_mismatch:"商城正在更新，请稍后重新进入对局。",
        product_unavailable:"商品暂不可兑换。",archive_id_conflict:"兑换请求不一致，请重新打开商城。"};
    function rows(v){return Array.isArray(v)?v:Object.keys(v||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return v[k];});}
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function escapedLines(v){return String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\r?\n/g,"<br>");}
    function paint(button,primary){if(!valid(button))return;button.style.backgroundImage="none";button.style.backgroundColor=button.enabled===false?"#21172f":primary?"gradient(linear,0% 0%,0% 100%,from(#734a9e),to(#382346))":"#281b3e";button.style.border="1px solid "+(button.enabled===false?"#594363":"#b18a50");if(button.Children)button.Children().forEach(function(c){if(c.paneltype==="Label")c.style.color=button.enabled===false?"#a795b8":"#ffdc87";});}
    function publish(){if(cfg.SurvivalCommerceView && cfg.SurvivalCommerceView.UpdateWalletCatalog)cfg.SurvivalCommerceView.UpdateWalletCatalog(catalog);}
    function text(parent,value,cls){var p=$.CreatePanel("Label",parent,"");p.text=value;p.AddClass(cls);return p;}
    function close(){if(shell)shell.Close();}
    function prepare(){
        if(disposed||!valid(root))return false;
        if(shell)return valid(dialog);
        var U=cfg.SurvivalUI,R=cfg.RemainingHandoff;if(!U || !R)return false;
        scrim=$.CreatePanel("Button",root,"");scrim.AddClass("RCBackdrop");
        dialog=$.CreatePanel("Panel",root,"");dialog.AddClass("RCWindow");dialog.AddClass("CommerceConfirm");
        var header=$.CreatePanel("Panel",dialog,"");header.AddClass("RCHeader");
        var title=text(header,"商品兑换","RCTitle"),x=$.CreatePanel("Button",header,"");x.AddClass("RCClose");
        shell=U.ModalShell.Adopt({id:"commerce_exchange",root:root,panel:dialog,header:header,titlePanel:title,scrim:scrim,closeButton:x,width:760,height:700,fit:{reference:[1920,1080]},onClose:close});
        R.Window(dialog,header,x);R.SizeWindow(dialog,760,700);R.Box(header,0,0,760,84);R.Box(x,694,22,38,38);
        dialog.AddClass("CheckoutPurple");scrim.AddClass("CheckoutPurpleBackdrop");dialog.style.backgroundImage="none";dialog.style.backgroundColor="gradient(linear,0% 0%,0% 100%,from(#211631),to(#0d091b))";dialog.style.border="1px solid #b18a50";dialog.style.borderRadius="4px";header.style.backgroundImage="none";header.style.backgroundColor="#21162e";header.style.borderBottom="1px solid #806340";title.style.color="#f0d18a";R.Box(title,32,22,620,40);title.style.fontSize="30px";if(header.Children)header.Children().forEach(function(c){if(c.BHasClass("ReferenceHeaderEmblem"))c.visible=false;});
        if(dialog.Children)dialog.Children().forEach(function(c){if(c.BHasClass("ReferenceAtmosphere")||c.BHasClass("ReferenceFrame")||c.BHasClass("RHFrame"))c.visible=false;});
        copy=text(dialog,"","CommerceConfirmCopy");status=text(dialog,"","CommerceConfirmStatus");
        copy.html=true;
        buy=U.ActionButton(dialog,{label:"确认兑换",action:purchase});R.Action(buy,true,[260,64]);buy.AddClass("CommerceConfirmBuy");
        var back=U.ActionButton(dialog,{label:"返回商城",action:function(){close();if(cfg.SurvivalCommerceView)cfg.SurvivalCommerceView.Open();}});
        R.Action(back,false,[260,64]);back.AddClass("CommerceConfirmBack");paint(back,false);return true;
    }
    function render(message){
        if(disposed||!selected||!valid(copy)||!valid(status)||!valid(buy))return;
        var p=selected,balance=Number(catalog.balances[p.currency]||0);
        copy.text=escapedLines(p.title+"\n\n售价："+p.price+" "+labels[p.currency]+"\n商城余额："+balance+" "+labels[p.currency]+"\n"+
            (p.purchase_limit>0?"永久商品，限持有 "+p.purchase_limit+" 件":"可重复兑换")+"\n\n"+p.description);
        status.text=message || (pending?"兑换结果待确认，重试会查询同一笔兑换。":p.enabled===true || p.enabled===1?"确认后扣除商城余额，奖励自动存入账号。":errors[p.disabled_reason]||"暂不可兑换。");
        buy.enabled=!inflight && (!!pending || p.enabled===true || p.enabled===1);
        paint(buy,true);
    }
    function request(action,sku,token){
        if(disposed || !valid(root) || inflight)return false;
        var id=token||epoch+"_"+(++serial);inflight={action:action,request_id:id};
        if(action==="catalog")draft=null;
        GameEvents.SendCustomGameEventToServer("survival_commerce_request",{action:action,sku:sku||"",request_id:id});render("正在同步…");
        $.Schedule(95,function(){if(!disposed && valid(root) && inflight && inflight.request_id===id){inflight=null;draft=null;
            if(action==="catalog"){catalog.error="商城兑换目录暂未连接，请稍后重试。";publish();}
            render("请求超时，请重试；同一笔兑换不会重复扣款。");}});return true;
    }
    function refresh(){return request("catalog");}
    function purchase(){
        if(disposed||!valid(root)||!selected || inflight)return;
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
                catalog=draft;draft=null;inflight=null;publish();
                if(selected)selected=catalog.products.filter(function(p){return p.sku===selected.sku;})[0]||selected;render();
            }
            return;
        }
        inflight=null;
        if(result.action==="purchase"){
            if(ok || result.terminal===true || result.terminal===1)pending=cfg.SurvivalCommercePending=null;
            if(ok){catalog.balances[result.currency]=result.balance;render("兑换成功，商品效果已保存。余额："+result.balance+" "+labels[result.currency]);
                $.Schedule(1.1,function(){if(!disposed)refresh();});}
            else render(errors[result.error]||"兑换尚未确认，请重试查询同一笔结果。");
        }else{catalog.error=errors[result.error]||"商城兑换目录暂未连接，请稍后重试。";publish();render(catalog.error);}
    });
    cfg.SurvivalCommerceWallet={Refresh:refresh,GetCatalog:function(){return catalog;},
        Checkout:function(sku){if(disposed||!valid(root))return false;if(pending)sku=pending.sku;selected=catalog.products.filter(function(p){return p.sku===sku;})[0];
            if(!selected || !prepare())return false;render();shell.Open();return true;},
        Dispose:function(){if(disposed)return;disposed=true;GameEvents.Unsubscribe(subscription);if(shell)shell.Dispose();[dialog,scrim].forEach(function(p){if(valid(p))p.DeleteAsync(0);});}};
    publish();
}());
