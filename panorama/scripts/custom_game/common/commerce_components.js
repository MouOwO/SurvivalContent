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
        var scrim=panel("Button",root,"RCBackdrop CommercePurpleBackdrop"),p=panel("Panel",root,"RCWindow CommercePurple");
        var header=panel("Panel",p,"RCHeader"),title=label(header,"商城","RCTitle"),x=panel("Button",header,"RCClose");
        var shell=U.ModalShell.Adopt({id:"commerce",root:root,panel:p,header:header,titlePanel:title,scrim:scrim,closeButton:x,width:1280,height:800,fit:{reference:[1920,1080]},onClose:onClose});
        p.style.backgroundImage="none";p.style.backgroundColor="#100b21fa";p.style.border="1px solid #95723f";p.style.borderRadius="4px";
        var purpleShell=cfg.SurvivalPurpleShell?cfg.SurvivalPurpleShell.Adopt({id:"commerce",panel:p,width:1280,height:800,onClose:onClose}):null;
        var detailLayer=panel("Panel",p,"CommercePurpleDetailLayer");
        detailLayer.hittest=false;detailLayer.hittestchildren=true;
        header.visible=false;
        shell.Close();return {panel:p,scrim:scrim,shell:shell,purpleShell:purpleShell,detailLayer:detailLayer};
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
        if(wallet){
            var uri=item.currency==="shop_points"?"custom_game/commerce_jade_v1/crystal.png":"custom_game/commerce_jade_v1/coin.png";
            original(row,uri,"CJPriceIcon");
        }else label(row,"¥","CJYuanIcon");
        label(row,amount+" "+currency,"CJPriceValue");p.hittest=false;p.hittestchildren=false;return p;
    };
    function detail(card,item,props,bundle){
        var layer=valid(props.detailLayer)?props.detailLayer:card;
        var tip=panel("Panel",layer,"RCPurpleDetail");tip.hittest=false;tip.hittestchildren=false;
        tip.__purpleSource=card;
        tip.style.position="202px 0px 0px";tip.style.width="312px";
        original(tip,J.ProductIcon(item),"RCPurpleDetailIcon");
        label(tip,item.title,"RCPurpleDetailTitle");
        var effect=label(tip,bundle?(item.description||""):props.effect,"RCProductEffect");effect.visible=!!effect.text;effect.hittest=true;
        if(bundle){
            var contents=panel("Panel",tip,"RCBundleContents");
            (props.rewards||[]).forEach(function(r){
                var row=panel("Panel",contents,"RCBundleItem");
                original(row,r.icon||J.ProductIcon(item),"RCBundleArt");label(row,r.label,"RCBundleName");label(row,"×"+r.quantity,"RCBundleQuantity");
            });
        }
        var price=J.Price(tip,item,0,0,278);price.style.position="0px 0px 0px";
        price.style.ignoreParentFlow="false";
        if(!item.enabled)label(tip,item.owned>0?"已拥有":"暂不可购","CommercePurpleState");
        var buy=J.Action(tip,props.purchaseLabel,function(){if(!disposed&&valid(card)&&valid(tip)&&valid(layer)&&props.action)props.action();},bundle?"RCBundleBuy":"RCProductBuy");
        buy.style.width="278px";buy.style.height="42px";
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
            var origin=layer.GetPositionWithinWindow(),scale=Math.max(.001,Number(layer.actualuiscale_x)||1);
            var sw=Number(card.actuallayoutwidth)||188*scale,tw=Number(tip.actuallayoutwidth)||312*scale,th=Number(tip.actuallayoutheight)||300*scale;
            // Native paints the owned layer inside its window despite overflow:noclip.
            // Keep the complete detail in both that clip and the viewport safety area.
            var pad=12*scale,leftEdge=pad,rightEdge=width-pad,topEdge=pad,bottomEdge=height-pad;
            var clip=valid(props.detailLayer)&&layer.GetParent?layer.GetParent():null;
            if(valid(clip)){
                var clipOrigin=clip.GetPositionWithinWindow(),cw=Number(clip.actuallayoutwidth)||1280*scale,ch=Number(clip.actuallayoutheight)||800*scale;
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
        function show(pin){if(disposed)return;if(!valid(card)||!valid(tip)||!valid(layer)){dispose();return;}if(activeDetail&&activeDetail.tip!==tip)activeDetail.hide();activeDetail={tip:tip,hide:hide};cancel();pinned=!!pin;tip.AddClass("Visible");card.AddClass("ShopSelected");card.style.zIndex="30";tip.hittest=true;tip.hittestchildren=true;place();$.Schedule(0.03,function(){if(!disposed&&valid(tip)&&activeDetail&&activeDetail.tip===tip&&tip.BHasClass("Visible"))place();});}
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
        var well=box(panel("Panel",card,"CommercePurpleArtWell"),27,0,134,132);
        box(original(well,J.ProductIcon(item),"RCProductArt"),2,2,128,126);
        var caption=box(label(card,String(item.title||item.sku||"").replace(/\s*[·•]\s*永久\s*$/,""),"RCProductName"),0,140,188,30);
        caption.style.width="fit-children";caption.style.maxWidth="188px";
        caption.style.horizontalAlign="center";caption.style.verticalAlign="top";caption.style.margin="0px";caption.style.textAlign="center";
        if(Number(item.owned)>0)box(label(well,String(item.owned),"RCStockState"),90,3,38,24);
        detail(card,item,props,bundle);return card;
    }
    J.Product=function(parent,item,props){return compactCard(parent,item,props,false);};
    J.Bundle=function(parent,item,props){return compactCard(parent,item,props,true);};
    cfg.SurvivalCommerceComponents=J;
})();
