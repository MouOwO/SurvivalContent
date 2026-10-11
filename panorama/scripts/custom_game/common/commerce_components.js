// Compact purple commerce presentation. Catalog and checkout stay in their controllers.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,J={},activeDetail=null;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function panel(type,parent,cls){var p=$.CreatePanel(type,parent,"");if(cls)cls.split(/\s+/).forEach(function(c){p.AddClass(c);});return p;}
    function box(p,x,y,w,h){p.style.position=x+"px "+y+"px 0px";p.style.width=w+"px";p.style.height=h+"px";return p;}
    function label(parent,value,cls){var p=panel("Label",parent,cls);p.text=String(value===undefined?"":value);p.hittest=false;return p;}
    function original(parent,uri,cls){
        var p=panel("Image",parent,cls);
        if(typeof uri==="string"&&/^(custom_game|items|spellicons)\/[A-Za-z0-9_\/-]+\.png$/.test(uri)&&uri.indexOf("..")<0)p.SetImage("file://{images}/"+uri);
        p.SetScaling("stretch-to-fit-preserve-aspect");p.hittest=false;p.hittestchildren=false;return p;
    }
    J.Box=box;J.Label=label;
    // These canonical CSV products share the old attribute-crystal placeholder.
    // Reuse existing Valve icons for their actual themes; a dedicated server icon wins.
    var technologyArt={
        video_p004:"items/null_talisman.png",video_p005:"items/tpscroll.png",video_p011:"items/orb_of_venom.png",
        video_p012:"spellicons/juggernaut_blade_fury.png",video_p013:"items/meteor_hammer.png",video_p014:"items/platemail.png",
        video_p015:"items/bfury.png",video_p017:"items/ogre_axe.png",video_p018:"spellicons/faceless_void_time_lock.png",
        video_p019:"items/bloodthorn.png",video_p020:"spellicons/shredder_whirling_death.png",video_p021:"items/armlet.png",
        video_p022:"spellicons/shredder_timber_chain.png",video_p023:"items/relic.png",video_p024:"items/recipe.png",
        video_p025:"items/philosophers_stone.png",video_p026:"items/blink.png",video_p027:"items/assault.png",
        video_p029:"spellicons/alchemist_goblins_greed.png",video_p030:"items/iron_talon.png",video_p031:"spellicons/windrunner_powershot.png",
        video_p032:"items/repair_kit.png",video_p033:"items/quelling_blade.png",video_p037:"items/branches.png",video_p038:"items/hand_of_midas.png"
    };
    J.ProductIcon=function(item){
        var icon=item&&item.icon,mapped=item&&Object.prototype.hasOwnProperty.call(technologyArt,item.sku)?technologyArt[item.sku]:null;
        return mapped&&(!icon||icon==="custom_game/archive_items_v2/lottery_attribute_crystal.png")?mapped:icon;
    };
    J.Art=function(parent,file,cls){return original(parent,"custom_game/commerce_jade_v1/"+file+".png",cls);};
    J.Window=function(root,onClose){
        var scrim=panel("Button",root,"RCBackdrop"),p=panel("Panel",root,"RCWindow MenuV10Commerce");
        var menu=cfg.SurvivalMenuV10.Adopt({id:"commerce",navId:"commerce",root:root,panel:p,scrim:scrim,title:"商城",onClose:onClose});
        menu.Close();return {panel:p,scrim:scrim,shell:menu.shell,menu:menu,canvas:menu.canvas,content:menu.content,actions:menu.actions,detailLayer:menu.detailLayer};
    };
    J.Nav=function(parent,c,index,selected,fn){
        var b=box(panel("Button",parent,"RCTab CommercePurpleNav"),0,index*62,208,58);
        b.hittestchildren=false;b.SetHasClass("UISelected",selected);
        box(label(b,c.label,"RCTabText"),12,0,182,58);b.SetPanelEvent("onactivate",fn);return b;
    };
    J.Action=function(parent,value,fn,cls){
        var b=panel("Button",parent,"CJBuy CommercePurpleBuy"+(cls?" "+cls:""));
        label(b,value,"");
        b.hittestchildren=false;b.SetPanelEvent("onactivate",function(){if(valid(b)&&b.enabled!==false&&fn)fn();return true;});return b;
    };
    J.Price=function(parent,item,x,y,w){
        var p=box(panel("Panel",parent,"CJPrice"),x,y,w||272,36),row=panel("Panel",p,"CJPriceRow");
        var wallet=item.purchase_method==="wallet",currency=wallet?item.currency_name:"元",amount=wallet?item.price:(item.amount_fen/100).toFixed(2);
        var isU=item.currency==="u_coin" || item.u_coin_price!==undefined || item.u_coin_per_yuan!==undefined;
        var fen=item.amount_fen,uCoin=item.u_coin_price;
        var validU=isU && item.disabled_reason!=="payment_price_unavailable" && typeof uCoin==="number" && uCoin>0 && uCoin%1===0 && item.u_coin_per_yuan===1000 && typeof fen==="number" && fen>0 && fen<=1000000 && fen%1===0 && uCoin===fen*10;
        var paidMeta=item.u_coin_price!==undefined || item.u_coin_per_yuan!==undefined || fen!==undefined || item.disabled_reason==="payment_price_unavailable";
        var previewCoin=!paidMeta && typeof item.price==="number" && item.price>0 && item.price%1===0?item.price:null;
        if(wallet || isU){
            var uri=item.currency==="shop_points"?"custom_game/commerce_jade_v1/crystal.png":"custom_game/commerce_jade_v1/coin.png";
            original(row,uri,"CJPriceIcon");
        }else label(row,"¥","CJYuanIcon");
        var uText=validU?uCoin+" U币 / ¥"+(fen/100).toFixed(2):(previewCoin!==null?previewCoin+" U币":"U币价格待同步")+" / 人民币金额待同步";
        label(row,isU?uText:amount+" "+currency,"CJPriceValue");p.hittest=false;p.hittestchildren=false;return p;
    };
    function detail(card,item,props,bundle){
        var layer=valid(props.detailLayer)?props.detailLayer:card;
        var tip=panel("Panel",layer,"RCPurpleDetail MenuV10CommerceDetail");tip.hittest=false;tip.hittestchildren=false;
        var skin=cfg.SurvivalMenuV10.SkinTooltip(tip),body=panel("Panel",skin.surface,"MenuV10CommerceDetailBody");
        tip.__purpleSource=card;
        tip.style.position="202px 0px 0px";tip.style.width="312px";
        original(body,J.ProductIcon(item),"RCPurpleDetailIcon");
        label(body,item.title,"RCPurpleDetailTitle");
        var effect=label(body,bundle?(item.description||""):props.effect,"RCProductEffect");effect.visible=!!effect.text;effect.hittest=true;
        if(bundle){
            var contents=panel("Panel",body,"RCBundleContents");
            (props.rewards||[]).forEach(function(r){
                var row=panel("Panel",contents,"RCBundleItem");
                original(row,r.icon||J.ProductIcon(item),"RCBundleArt");label(row,r.label,"RCBundleName");label(row,"×"+r.quantity,"RCBundleQuantity");
            });
        }
        var price=J.Price(body,item,0,0,276);price.style.position="0px 0px 0px";
        price.style.ignoreParentFlow="false";
        if(item.currency==="u_coin" || item.u_coin_price!==undefined || item.u_coin_per_yuan!==undefined)label(body,"1元=1000U币 · 直接购买道具","CommercePurpleState");
        if(item.enabled!==true && item.enabled!==1)label(body,item.owned>0?"已拥有":item.disabled_reason==="payment_catalog_pending"?"人民币支付目录连接中":item.disabled_reason==="payment_product_unavailable" || item.disabled_reason==="payment_price_unavailable"?"人民币购买尚未开放":"暂不可购","CommercePurpleState");
        var buy=J.Action(body,props.purchaseLabel,function(){if(!disposed&&valid(card)&&valid(tip)&&valid(layer)&&props.action)props.action();},bundle?"RCBundleBuy":"RCProductBuy");
        buy.style.width="276px";buy.style.height="42px";
        var pinned=false,hovered=false,job=null,serial=0,disposed=false;
        function cancel(){serial++;if(job!==null&&$.CancelScheduled)$.CancelScheduled(job);job=null;}
        function hide(){cancel();pinned=false;hovered=false;if(valid(tip)){tip.RemoveClass("Visible");tip.hittest=false;tip.hittestchildren=false;}if(valid(card)){card.RemoveClass("ShopSelected");card.style.zIndex="0";}if(activeDetail&&activeDetail.tip===tip)activeDetail=null;}
        function dispose(){if(disposed)return;disposed=true;hide();if(valid(tip))tip.DeleteAsync(0);}
        function place(){
            if(disposed)return;
            if(!valid(card)||!valid(tip)||!valid(layer)){dispose();return;}
            if(!card.GetPositionWithinWindow)return;
            var source=card.GetPositionWithinWindow(),root=card;
            while(valid(root)&&root.GetParent&&valid(root.GetParent()))root=root.GetParent();
            var width=Number(root.actuallayoutwidth)||1920,height=Number(root.actuallayoutheight)||1080;
            var origin=layer.GetPositionWithinWindow(),menu=props.menu;
            var scale=Math.max(.001,(Number(layer.actualuiscale_x)||1)*(menu?menu.Scale():1));
            var nativeScale=Math.max(.001,Number(layer.actualuiscale_y)||1);
            var logicalHeight=Math.min(704,Math.max(246,(Number(body.actuallayoutheight)||250*nativeScale)/nativeScale+88));
            skin.Resize(368,logicalHeight);tip.style.width="368px";tip.style.height=logicalHeight+"px";
            var sw=144*scale,tw=368*scale,th=logicalHeight*scale;
            // Native paints the owned layer inside its window despite overflow:noclip.
            // Keep the complete detail in both that clip and the viewport safety area.
            var pad=12*scale,leftEdge=pad,rightEdge=width-pad,topEdge=pad,bottomEdge=height-pad;
            var clip=valid(props.detailLayer)&&layer.GetParent?layer.GetParent():null;
            if(valid(clip)){
                var clipOrigin=clip.GetPositionWithinWindow(),cw=1672*scale,ch=941*scale;
                leftEdge=Math.max(leftEdge,clipOrigin.x+pad);rightEdge=Math.min(rightEdge,clipOrigin.x+cw-pad);
                topEdge=Math.max(topEdge,clipOrigin.y+pad);bottomEdge=Math.min(bottomEdge,clipOrigin.y+ch-pad);
            }
            var x=source.x+sw+pad;
            if(x+tw>rightEdge)x=source.x-tw-pad;
            x=Math.max(leftEdge,Math.min(x,rightEdge-tw));
            var y=Math.max(topEdge,Math.min(source.y,bottomEdge-th));
            if(!isFinite(x)||!isFinite(y)||!isFinite(origin.x)||!isFinite(origin.y))return;
            tip.style.position=Math.round((x-origin.x)/scale)+"px "+Math.round((y-origin.y)/scale)+"px 0px";
        }
        function show(pin){if(disposed)return;if(!valid(card)||!valid(tip)||!valid(layer)){dispose();return;}if(activeDetail&&activeDetail.tip!==tip)activeDetail.hide();activeDetail={tip:tip,hide:hide};cancel();pinned=!!pin;tip.AddClass("Visible");card.AddClass("ShopSelected");card.style.zIndex="30";tip.hittest=true;tip.hittestchildren=true;place();[0,.05,.2,.4].forEach(function(delay){$.Schedule(delay,function(){if(!disposed&&valid(tip)&&activeDetail&&activeDetail.tip===tip&&tip.BHasClass("Visible"))place();});});}
        function leave(){cancel();var generation=serial;job=$.Schedule(.18,function(){job=null;if(serial===generation&&!hovered&&!pinned)hide();});}
        card.SetPanelEvent("onmouseover",function(){show(false);});card.SetPanelEvent("onmouseout",leave);
        card.SetPanelEvent("onactivate",function(){show(true);return true;});
        tip.SetPanelEvent("onmouseover",function(){hovered=true;cancel();});
        tip.SetPanelEvent("onmouseout",function(){hovered=false;leave();});
        card.__purpleDetail=tip;card.__purpleHide=hide;card.__purpleShow=show;
        card.__purpleDispose=dispose;tip.__purpleDispose=dispose;
        card.__purpleRebuildDetail=function(){if(disposed&&valid(card)&&valid(layer))return detail(card,item,props,bundle);return valid(tip)?tip:null;};
        return tip;
    }
    function compactCard(parent,item,props,bundle){
        props=props||{};var card=U.CardShell(parent,{bodyVariant:"product"});
        card.AddClass("RCProduct");card.AddClass(bundle?"CJBundle":"CJProduct");card.AddClass("CommercePurpleProduct");
        var well=box(panel("Panel",card,"CommercePurpleArtWell"),12,9,120,120);
        box(original(well,J.ProductIcon(item),"RCProductArt"),0,0,120,120);
        var caption=box(label(card,String(item.title||item.sku||"").replace(/\s*[·•]\s*永久\s*$/,""),"RCProductName"),7,134,130,35);
        var owned=Number(item.owned)>0?label(card,String(item.owned),"RCStockState"):null;
        card.__menuCell={iconPanel:well,namePanel:caption,countPanel:owned};
        detail(card,item,props,bundle);return card;
    }
    J.Product=function(parent,item,props){return compactCard(parent,item,props,false);};
    J.Bundle=function(parent,item,props){return compactCard(parent,item,props,true);};
    cfg.SurvivalCommerceComponents=J;
})();
