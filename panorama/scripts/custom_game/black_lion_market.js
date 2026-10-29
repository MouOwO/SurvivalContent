(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,M={},lastWindow=null;
    function cashReady(){var payments=cfg.SurvivalPayments;return cfg.SurvivalDevelopmentPayments===true||!!payments&&typeof payments.IsRealMoneyEnabled==="function"&&payments.IsRealMoneyEnabled()===true;}
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function make(type,parent,id,cls){var p=$.CreatePanel(type,parent,id||"");(cls||"").split(/\s+/).filter(Boolean).forEach(function(c){p.AddClass(c);});return p;}
    function box(p,x,y,w,h){p.style.position=x+"px "+y+"px 0px";p.style.width=w+"px";p.style.height=h+"px";return p;}
    function displayText(value){var text=String(value===undefined?"":value),J=cfg.SurvivalCommerceComponents;return J&&J.RewardNameText?J.RewardNameText(text):text.replace(/U币/g,"G币");}
    function displayName(item,fallback){var resources=cfg.SurvivalItemResources;return resources&&resources.DisplayName?resources.DisplayName(item,fallback):displayText(fallback);}
    function label(parent,value,cls){var p=make("Label",parent,"",cls);p.text=displayText(value);p.hittest=false;return p;}
    function design(){var d=cfg.SurvivalShopV10;if(!d)throw new Error("Shop V10 asset manifest must load before the market");return d;}
    function layer(id){var row=design().layers[id];if(!row)throw new Error("Missing Shop V10 component: "+id);return row;}
    function image(parent,path,cls){var p=make("Image",parent,"",cls),uri=cfg.SurvivalCommerceComponents.NormalizeIconURI(path);if(uri)p.SetImage(uri);if(p.SetScaling)p.SetScaling("stretch-to-fit-preserve-aspect");p.hittest=false;p.hittestchildren=false;return p;}
    function art(parent,id,cls,x,y,w,h,clipBottom){
        var r=layer(id);if(!r.path||r.kind==="raster_text"||r.kind==="game_context")throw new Error("Non-runtime Shop V10 layer: "+id);
        x=x===undefined?r.x:x;y=y===undefined?r.y:y;w=w===undefined?r.width:w;h=h===undefined?r.height:h;
        var host=parent;
        // The last five source pixels contain captured scenery, outside the clean UI.
        if(clipBottom){host=box(make("Panel",parent,"","BLMarketAssetClip"),x,y,w,h-clipBottom);host.style.overflow="clip";host.hittest=false;host.hittestchildren=false;x=0;y=0;}
        var p=box(image(host,r.path,cls),x,y,w,h);if(p.SetScaling)p.SetScaling("stretch-to-fit");return p;
    }
    function currencyAsset(currency,row){return currency==="shop_points"?"balance_point_icon":currency==="shop_gold"?"balance_shop_icon":row?row+"_coin":"balance_u_icon";}
    function currencyImage(parent,currency,cls,row){return image(parent,currency==="u_coin"?"s2r://panorama/images/hud/reborn/gold_large_png.vtex":layer(currencyAsset(currency,row)).path,cls);}
    function template(index){var level=4+(index%7),prefix="vip"+level,wash=layer(prefix+"_row_wash");return {prefix:prefix,wash:wash,bright:level%2===0};}
    function priceColumn(){
        // Anchor every complete price line to the original price heading center.
        var heading=layer("column_price"),width=235;
        return {x:heading.x-layer("vip4_row_wash").x+(heading.width-width)/2,width:width};
    }
    function centeredStack(parent,x,width,height,cls){
        var column=box(make("Panel",parent,"",cls),x,0,width,height);column.style.flowChildren="none";
        var stack=make("Panel",column,"",cls+"Stack");stack.style.width="100%";stack.style.height="fit-children";stack.style.flowChildren="down";stack.style.verticalAlign="center";
        return stack;
    }
    function flowText(parent,value,cls){var p=label(parent,value,cls);p.style.width="100%";p.style.height="fit-children";return p;}
    function relativeArt(parent,id,wash,cls){var r=layer(id);return art(parent,id,cls,r.x-wash.x,r.y-wash.y);}
    function windowHeight(){return layer("footer_base").y+52;}
    M.Window=function(root,onClose){
        var d=design(),w=d.width,h=windowHeight(),footerY=layer("footer_base").y,fittedScale=null,readonlyView=false,recharge=null;
        var scrim=make("Button",root,"","BLMarketBackdrop"),p=make("Panel",root,"BlackLionMarketWindow","BLMarketWindow BLMarketV10");
        var canvas=box(make("Panel",p,"","BLMarketCanvas"),0,0,w,h);canvas.hittestchildren=true;
        art(canvas,"window_substrate","BLMarketTexture",0,0,w,h);art(canvas,"header_base","BLMarketHeaderTexture");art(canvas,"footer_base","BLMarketFooterTexture",1,footerY,w-2,h-footerY,5);
        var title=layer("title");box(label(canvas,"商城","BLMarketTitle"),title.x,title.y,430,title.height);
        var redeemEntry=box(make("Button",canvas,"BlackLionMarketRedeem","BLMarketBuy ButtonPrimary Large BLMarketRedeemEntry"),260,18,156,44);
        redeemEntry.hittestchildren=false;
        var redeemEntryText=label(redeemEntry,"兑换码","BLMarketBuyText");
        redeemEntryText.style.horizontalAlign="center";redeemEntryText.style.verticalAlign="center";
        redeemEntryText.style.fontSize="24px";redeemEntryText.style.color="white";
        var balance=box(make("Panel",canvas,"","BLMarketBalance"),w-760,18,665,48),balanceLabels=[];
        ["G币","积分"].forEach(function(name,i){
            // Native flow keeps recharge attached to the measured text without a layout poller.
            var group=make("Panel",balance,"","BLMarketBalanceItem"+(i===1?" BLMarketPointsBalanceItem":"")),icon=layer(currencyAsset(["u_coin","shop_points"][i]));
            var currencyIcon=currencyImage(group,["u_coin","shop_points"][i],"BLMarketCurrencyIcon");
            currencyIcon.style.width=icon.width+"px";currencyIcon.style.height=icon.height+"px";
            var line=make("Panel",group,"","BLMarketBalanceLine"+(i===0?" BLMarketRechargeLine":""));
            balanceLabels.push(label(line,name+" —","BLMarketBalanceText"+(i===0?" BLMarketRechargeBalance":"")));
            if(i===0){
                recharge=make("Button",line,"BlackLionMarketRecharge","BLMarketRecharge");recharge.hittestchildren=false;
                recharge.visible=cashReady();recharge.enabled=recharge.visible;recharge.hittest=recharge.visible;
                var rechargeIcon=make("Image",recharge,"","BLMarketRechargeIcon");
                rechargeIcon.SetImage("file://{images}/control_icons/24px/plus.svg");rechargeIcon.hittest=false;rechargeIcon.hittestchildren=false;
                recharge.SetPanelEvent("onactivate",function(){var view=cfg.SurvivalCommerceView;if(!readonlyView&&cashReady()&&view&&view.OpenRecharge)view.OpenRecharge();return true;});
            }
        });
        var c=layer("close_button"),close=box(make("Button",canvas,"","BLMarketClose"),c.x,c.y,c.width,c.height);close.hittestchildren=false;
        var shell=U.ModalShell.Adopt({id:"commerce",panel:p,root:root,scrim:scrim,closeButton:close,width:w,height:h,fit:{widthFraction:.94,heightFraction:.90*h/d.height},onFit:function(scale){fittedScale=scale;var rw=(root.actuallayoutwidth||1672)/(root.actualuiscale_x||1),rh=(root.actuallayoutheight||941)/(root.actualuiscale_y||1);p.style.horizontalAlign="left";p.style.verticalAlign="top";p.style.transformOrigin="0% 0%";p.style.position=((rw-w*scale)/2).toFixed(3)+"px "+((rh-h*scale)/2).toFixed(3)+"px 0px";},onClose:onClose});
        p.style.width=w+"px";p.style.height=h+"px";p.style.backgroundColor="#22201dff";p.style.border="0px";p.style.backgroundImage="none";scrim.style.backgroundColor="#00000035";
        close.Children().forEach(function(child){child.visible=false;});art(close,"close_button","",0,0,c.width,c.height);
        var tabs=box(make("Panel",canvas,"BlackLionMarketTabs","BLMarketTabs"),14,83,1357,60);
        var headings=box(make("Panel",canvas,"","BLMarketColumnHead"),14,145,1357,47);
        ["column_item","column_price"].forEach(function(id){
            var r=layer(id);if(id!=="column_price"){box(label(headings,r.text,"BLMarketColumnLabel"),r.x-14,r.y-160,r.width+50,r.height);return;}
            var price=priceColumn(),column=box(make("Panel",headings,"","BLMarketPriceColumnHead"),price.x,r.y-160,price.width,r.height),caption=label(column,r.text,"BLMarketColumnLabel BLMarketPriceHeading");
            column.style.flowChildren="none";caption.style.width="fit-children";caption.style.maxWidth="100%";caption.style.height="fit-children";caption.style.horizontalAlign="center";caption.style.verticalAlign="center";caption.style.textAlign="center";
        });
        box(label(headings,"显示类型","BLMarketFilterCaption"),316,6,110,32);
        var typeControl=box(make("Panel",headings,"BLMarketPurchaseType","BLMarketPurchaseType"),428,4,266,34),typeButtons={},typeCallback=null;
        var typeOptions=cfg.SurvivalBlackLionMarketModel.PurchaseTypes();
        typeOptions.forEach(function(option){
            var button=make("Button",typeControl,"BLMarketPurchaseType_"+option.id,"BLMarketPurchaseTypeOption");button.hittestchildren=false;
            var mark=make("Panel",button,"","BLMarketPurchaseTypeMark");mark.hittest=false;
            make("Panel",mark,"","BLMarketPurchaseTypeDot").hittest=false;label(button,option.label,"BLMarketPurchaseTypeText");
            typeButtons[option.id]=button;button.SetPanelEvent("onactivate",function(){if(valid(p)&&typeCallback)typeCallback(option.id);});
        });
        var content=box(make("Panel",canvas,"BlackLionMarketList","BLMarketList"),14,207,1357,687);content.hittestchildren=true;
        var actions=box(make("Panel",canvas,"","BLMarketFooter"),14,898,1357,44);
        var details=box(make("Panel",canvas,"","BLMarketDetailLayer"),0,0,w,h);details.style.overflow="noclip";details.style.zIndex="50";details.hittest=false;details.hittestchildren=true;
        art(canvas,"window_brush_edge","BLMarketFrameTexture",0,0,w,h,5);
        var redeemHost=box(make("Panel",canvas,"RedemptionDialogHost",""),0,0,w,h);
        redeemHost.style.zIndex="100";redeemHost.hittest=false;redeemHost.hittestchildren=true;redeemHost.visible=false;
        var redeemLoaded=redeemHost.BLoadLayout("file://{resources}/layout/custom_game/redemption_code.xml",false,false);
        var redeemInput=redeemHost.FindChildTraverse("RedemptionCodeInput"),redeemSubmit=redeemHost.FindChildTraverse("RedemptionSubmit");
        var redeemPending=cfg.SurvivalRedemptionPending||null,redeemBusy=false,redeemTimer=null;
        var redeemErrors={redeem_code_invalid:"兑换码错误，请检查后重试。",redeem_code_expired:"兑换码已过期。",
            redeem_code_disabled:"兑换码已停用。",redeem_code_not_started:"兑换码尚未生效。",
            redeem_code_exhausted:"兑换码已达到领取上限。",redeem_already_used:"您已使用过这个兑换码。",
            redeem_rate_limited:"操作过于频繁，请稍后重试。",profile_not_ready:"请先完成对局登录。",
            match_session_missing:"请先完成对局登录。",commerce_busy:"操作处理中，请稍后重试。"};
        function redeemMessage(message){GameEvents.SendEventClientSide("dota_hud_error_message",{reason:80,message:message});}
        function redeemIdle(){redeemBusy=false;if(redeemTimer!==null&&$.CancelScheduled)$.CancelScheduled(redeemTimer);redeemTimer=null;if(valid(redeemInput))redeemInput.enabled=true;if(valid(redeemSubmit))redeemSubmit.enabled=true;}
        function closeRedeem(){if(valid(redeemHost))redeemHost.visible=false;}
        function openRedeem(){
            if(!redeemLoaded||!valid(redeemInput)){redeemMessage("兑换窗口暂不可用，请重新进入游戏。");return;}
            redeemHost.visible=true;if(redeemPending)redeemInput.text=redeemPending.code;
            if(redeemInput.SetFocus)redeemInput.SetFocus();
        }
        function submitRedeem(){
            if(redeemBusy||!valid(redeemInput))return;
            var code=String(redeemInput.text||"").trim().toUpperCase();
            if(!/^[A-Z0-9-]{6,80}$/.test(code)){redeemMessage(redeemErrors.redeem_code_invalid);return;}
            if(!redeemPending||redeemPending.code!==code)redeemPending={code:code,request_id:"redeem_"+String(Date.now())+"_"+String(Math.random()).slice(2)};
            cfg.SurvivalRedemptionPending=redeemPending;redeemBusy=true;redeemInput.enabled=false;redeemSubmit.enabled=false;
            GameEvents.SendCustomGameEventToServer("survival_commerce_request",{action:"redeem",code:code,request_id:redeemPending.request_id});
            // Keep the same transaction after an uncertain timeout or layout reload.
            redeemTimer=$.Schedule(105,function(){redeemIdle();redeemMessage("兑换结果待确认，请使用原码重试查询。");});
        }
        redeemEntry.SetPanelEvent("onactivate",openRedeem);
        var redeemSubscription=GameEvents.Subscribe("survival_commerce_result",function(result){
            if(result.action!=="redeem"||!redeemPending||result.request_id!==redeemPending.request_id||!valid(p))return;
            redeemIdle();
            if(result.ok){
                redeemPending=null;delete cfg.SurvivalRedemptionPending;redeemInput.text="";closeRedeem();
                redeemMessage("兑换成功，奖品已到账。");
                if(cfg.SurvivalCommerceWallet&&cfg.SurvivalCommerceWallet.Refresh)cfg.SurvivalCommerceWallet.Refresh();
                if(cfg.SurvivalPayments&&cfg.SurvivalPayments.RefreshCatalog)cfg.SurvivalPayments.RefreshCatalog(true);
            }else{
                if(result.terminal){redeemPending=null;delete cfg.SurvivalRedemptionPending;}
                redeemMessage(redeemErrors[result.error]||"兑换暂未完成，请稍后使用原码重试。");
            }
        });
        var menu={panel:p,shell:shell,canvas:canvas,content:content,actions:actions,detailLayer:details,sidebar:tabs,listWidth:1357,width:w,height:h,skinVersion:10,layout:"black_lion_list",
            OpenRedeem:openRedeem,CloseRedeem:closeRedeem,SubmitRedeem:submitRedeem,
            Open:function(){shell.Open();},Close:function(){closeRedeem();shell.Close();},Dispose:function(){redeemIdle();GameEvents.Unsubscribe(redeemSubscription);shell.Dispose();},IsOpen:function(){return shell.IsOpen();},
            SetReadonly:function(value){readonlyView=value===true;if(valid(recharge)){var allowed=!readonlyView&&cashReady();recharge.visible=allowed;recharge.enabled=allowed;recharge.hittest=allowed;}},
            SetPurchaseType:function(value,select){typeCallback=select;typeOptions.forEach(function(option){typeButtons[option.id].SetHasClass("UISelected",option.id===value);});},
            Scale:function(){if(fittedScale!==null)return fittedScale;var rw=(root.actuallayoutwidth||1672)/(root.actualuiscale_x||1),rh=(root.actuallayoutheight||941)/(root.actualuiscale_y||1);return Math.min(rw*.94/w,rh*.90/d.height);},
            SetSidebar:function(groups,selected,select){tabs.RemoveAndDeleteChildren();groups.forEach(function(group,i){
                var r=layer("tab_"+i+"_base"),b=box(make("Button",tabs,"BLMarketSection_"+group.id,"RCTab BLMarketTab"),r.x-14,0,r.width,r.height);b.hittestchildren=false;b.SetHasClass("UISelected",selected===group.id);
                art(b,selected===group.id?"tab_3_base":i===3?"tab_1_base":"tab_"+i+"_base","BLMarketTabTexture",0,0,r.width,r.height);
                var caption=label(b,group.label,"RCTabText");caption.style.width="fit-children";caption.style.maxWidth=(r.width-16)+"px";caption.style.height="fit-children";caption.style.position="0px 0px 0px";caption.style.horizontalAlign="center";caption.style.verticalAlign="center";caption.style.margin="0px";caption.style.padding="0px";caption.style.textAlign="center";
                b.SetPanelEvent("onactivate",function(){select(group.id);});
            });},
            SetResources:function(resources){resources.forEach(function(r,i){if(!balanceLabels[i])return;var next=displayText(r.name+" "+(r.value===undefined||r.value===null?"—":String(r.value)));if(balanceLabels[i].text!==next)balanceLabels[i].text=next;});},DecorateCell:function(){}};
        shell.Close();lastWindow=menu;return {panel:p,scrim:scrim,shell:shell,menu:menu,canvas:canvas,content:content,actions:actions,detailLayer:details};
    };
    M.SkinTooltip=function(tip){tip.AddClass("BLMarketDetail");var surface=make("Panel",tip,"","BLMarketDetailSurface");surface.hittest=false;return {surface:surface,Resize:function(w,h){box(surface,0,0,w,h);}};};
    function unavailableRow(parent,item,index){
        var t=template(index||0),r=t.wash,row=box(make("Panel",parent,"","BLMarketRow BLMarketHomeUnavailable"),0,0,r.width,r.height);art(row,t.prefix+"_row_wash","BLMarketRowWash"+(t.bright?" BLMarketBrightRowWash":""),0,0,r.width,r.height);relativeArt(row,t.prefix+"_gift_frame",r,"BLMarketArtFrame");
        var names=centeredStack(row,103,priceColumn().x-123,r.height,"BLMarketNameColumn"),name=flowText(names,displayName(item,item.title),"BLMarketName");box(label(row,"未开放","BLMarketUnavailableState"),1160,25,176,32);row.__menuCell={iconPanel:row,namePanel:name,countPanel:null};return row;
    }
    M.Row=function(parent,item,props){
        if(item&&item.home_unavailable===true)return unavailableRow(parent,item,props.index);
        var J=cfg.SurvivalCommerceComponents,K=cfg.SurvivalBlackLionMarketModel,t=template(props.index||0),r=t.wash;
        var row=make("Panel",parent,"","RCProduct BLMarketRow");row.AddClass(item.product_type==="bundle"?"CJBundle":"CJProduct");row.SetHasClass("BLMarketOdd",!!(props.index%2));row.hittest=true;row.hittestchildren=true;row.style.width=r.width+"px";row.style.minWidth=r.width+"px";row.style.margin="0px";row.style.padding="0px";row.style.height=r.height+"px";row.style.minHeight=r.height+"px";
        art(row,t.prefix+"_row_wash","BLMarketRowWash"+(t.bright?" BLMarketBrightRowWash":""),0,0,r.width,r.height);
        // All goods, including bundles, use their registered original art.
        // Screenshot gift layers are too small to enlarge without blurring.
        var frameSize=74,well=box(make("Panel",row,"","BLMarketArt"),13,Math.floor((r.height-frameSize)/2),frameSize,frameSize);
        well.style.backgroundColor="#171b18";well.style.border="1px solid #9b8c62";well.style.overflow="clip";
        well.hittest=true;well.hittestchildren=false;
        var icon=J.ItemIcon(well,item,"BLMarketItemIcon",{width:frameSize,height:frameSize});
        icon.style.position="0px 0px 0px";icon.style.width="100%";icon.style.height="100%";icon.style.margin="0px";icon.style.padding="0px";
        var column=priceColumn(),n=layer(t.prefix+"_name"),nameWidth=column.x-(n.x-r.x)-20,names=centeredStack(row,n.x-r.x,nameWidth,r.height,"BLMarketNameColumn"),name=flowText(names,displayName(item,item.title||item.sku||"").replace(/\s*[·•]\s*永久\s*$/,""),"BLMarketName");
        var owned=flowText(names,props.readOnly?"持有 —":Number(item.owned)>0?"已拥有 "+item.owned:"","BLMarketOwned");owned.visible=props.readOnly||Number(item.owned)>0;owned.style.marginTop="2px";
        var primary="价格待同步",cost=item.price;
        var isU=item.currency==="u_coin"||item.u_coin_price!==undefined||item.u_coin_per_yuan!==undefined;
        if(item.purchase_method==="wallet"&&typeof cost==="number"&&isFinite(cost)&&cost>=0)primary=cost+" "+(item.currency_name||"");
        else if(isU){var coin=item.u_coin_price,fen=item.amount_fen,validPrice=typeof coin==="number"&&coin>0&&coin%1===0&&item.u_coin_per_yuan===100&&typeof fen==="number"&&fen>0&&fen<=1000000&&fen%1===0&&coin===fen;
            if(validPrice)primary=coin+" G币";
        }else if(typeof item.amount_fen==="number"&&isFinite(item.amount_fen)&&item.amount_fen>0)primary="¥"+(item.amount_fen/100).toFixed(2);
        // A promotion's crossed-out comparison is display-only, never an order price.
        var reference=primary!=="价格待同步"&&K.ReferencePrice?K.ReferencePrice(item):null,hasReference=reference!==null;
        var price=centeredStack(row,column.x-(hasReference?45:0),column.width+(hasReference?90:0),r.height,"BLMarketRowPrice");
        // Flow measures the current and comparison amounts as one centered line.
        var priceLine=make("Panel",price,"","BLMarketPriceLine"+(hasReference?" BLMarketPromotionPrice":""));priceLine.style.width="fit-children";priceLine.style.height="fit-children";priceLine.style.flowChildren="right";priceLine.style.horizontalAlign="center";
        currencyImage(priceLine,isU?"u_coin":item.currency,"BLMarketPriceCurrency",t.prefix);
        var amount=label(priceLine,primary,"BLMarketPriceMain");amount.style.width="fit-children";amount.style.height="fit-children";amount.style.verticalAlign="center";
        if(hasReference){
            var referenceAmount=reference.toFixed(3).replace(/\.?0+$/,"");
            var referenceText=item.purchase_method==="wallet"?referenceAmount+" "+(item.currency_name||""):isU?referenceAmount+" G币":"¥"+reference.toFixed(3).replace(/0$/,"");
            var original=label(priceLine,referenceText,"BLMarketPriceReference");original.style.width="fit-children";original.style.height="fit-children";original.style.verticalAlign="center";
        }

        var available=!props.readOnly&&(K.IsActionable?K.IsActionable(item):item.enabled===true||item.enabled===1),reason=props.readOnly?"账号权益未知":K.DisabledMessage?K.DisabledMessage(item):String(item.disabled_message||"");
        if(item.purchase_method==="wallet"&&item.currency==="shop_points"&&(item.disabled_reason==="commerce_balance_insufficient"||item.disabled_reason==="insufficient_balance"))reason="";
        if(!available&&!reason)reason="未满足购买条件";row.SetHasClass("BLMarketHasReason",!!reason);
        var b=layer(t.prefix+"_button_base"),buy=box(make("Button",row,"","BLMarketBuy ButtonPrimary Large"),b.x-r.x,0,b.width,b.height);buy.style.verticalAlign="center";buy.hittestchildren=false;
        var buyText=label(buy,props.readOnly?(item.purchase_method==="wallet"?"兑换未开放":"收款未开放"):available?(item.purchase_method==="wallet"?"兑换":"购买"):"暂不可购","BLMarketBuyText");buyText.style.width="fit-children";buyText.style.maxWidth=(b.width-16)+"px";buyText.style.height="fit-children";buyText.style.position="0px 0px 0px";buyText.style.horizontalAlign="center";buyText.style.verticalAlign="center";buyText.style.margin="-1px 0px 1px";buyText.style.padding="0px";buyText.style.textAlign="center";
        var reasonText=box(label(row,reason,"BLMarketDisabledReason"),b.x-r.x,r.height-20,b.width,20);reasonText.style.fontSize="18px";reasonText.style.lineHeight="20px";reasonText.visible=!!reason;
        buy.enabled=available;buy.SetHasClass("UIDisabled",!available);buy.SetPanelEvent("onactivate",function(){if(valid(row)&&buy.enabled&&props.action){props.action();return true;}});
        row.__menuCell={iconPanel:well,namePanel:name,countPanel:owned};props.market=true;props.hoverPanel=well;props.sourcePanel=well;props.sourceWidth=frameSize;props.windowWidth=design().width;props.windowHeight=windowHeight();
        J.BindDetail(row,item,props,item.product_type==="bundle");return row;
    };
    M.GetWindow=function(){return lastWindow;};cfg.SurvivalBlackLionMarket=M;
})();
