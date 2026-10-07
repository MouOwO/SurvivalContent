// Cloud sea / jade / ivory presentation. Data and checkout remain in the catalog controller.
(function(){
    "use strict";
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,J={},assetRoot="custom_game/commerce_jade_v1/";
    function panel(type,parent,cls){var p=$.CreatePanel(type,parent,"");if(cls)cls.split(/\s+/).forEach(function(c){p.AddClass(c);});return p;}
    function box(p,x,y,w,h){p.style.position=x+"px "+y+"px 0px";p.style.width=w+"px";p.style.height=h+"px";return p;}
    function label(parent,text,cls){var p=panel("Label",parent,cls);p.text=String(text===undefined?"":text);p.hittest=false;return p;}
    function art(parent,file,cls){var p=panel("Image",parent,cls);p.SetImage("file://{images}/"+assetRoot+file+".png");p.hittest=false;p.hittestchildren=false;return p;}
    function original(parent,uri,cls){
        var p=panel("Image",parent,cls);
        if(typeof uri==="string"&&/^custom_game\/[A-Za-z0-9_\/-]+\.png$/.test(uri)&&uri.indexOf("..")<0)p.SetImage("file://{images}/"+uri);
        p.SetScaling("stretch-to-fit-preserve-aspect");p.hittest=false;p.hittestchildren=false;return p;
    }
    J.Box=box;J.Label=label;J.Art=art;
    function centeredName(parent,text,x,y,w){
        var region=box(panel("Panel",parent,"CJNameRegion"),x,y,w,34);region.hittest=false;region.hittestchildren=false;
        var name=label(region,text,"RCProductName");box(name,0,0,w,34);
        // A fit-width child centers the actual glyph run in Panorama, including single-line names.
        name.style.width="fit-children";name.style.maxWidth=w+"px";name.style.horizontalAlign="center";name.style.textAlign="center";name.style.fontSize="24px";return name;
    }
    J.Window=function(root,onClose){
        var scrim=panel("Button",root,"RCBackdrop"),p=panel("Panel",root,"RCWindow"),header=panel("Panel",p,"RCHeader"),title=label(header,"商城","RCTitle"),x=panel("Button",header,"RCClose");
        p.AddClass("CommerceJade");scrim.AddClass("CJBackdrop");
        var shell=U.ModalShell.Adopt({id:"commerce",root:root,panel:p,header:header,titlePanel:title,scrim:scrim,closeButton:x,width:1600,height:920,fit:{reference:[1920,1080]},onClose:onClose});
        p.style.backgroundColor="#f4f5ed";p.style.backgroundImage="none";p.style.border="0px";p.style.boxShadow="none";p.style.borderRadius="7px";
        header.style.backgroundColor="transparent";title.style.color="#244554";
        box(header,0,0,1600,112);box(title,650,20,300,72);box(x,1528,28,48,48);
        x.RemoveAndDeleteChildren();x.AddClass("CJClose");["normal","hover","pressed"].forEach(function(state){box(art(x,"close_"+state,"CJCloseArt CJClose_"+state),4,4,40,40);});
        box(art(p,"window","CJWindowBase"),0,0,1600,920);
        box(art(header,"header","CJHeaderArt"),0,0,1600,112);
        box(art(header,"title_flourish","CJTitleLeft"),540,49,166,20);
        box(art(header,"title_flourish","CJTitleRight"),894,49,166,20);
        box(art(p,"sidebar","CJSidebarArt"),0,112,320,808);
        box(art(p,"content_transition","CJHeaderMist"),320,88,1280,96);
        box(art(p,"sidebar_seam","CJSidebarSeam"),312,112,24,808);
        box(art(p,"frame","CJFrame"),0,0,1600,920);
        shell.Close();return {panel:p,scrim:scrim,shell:shell};
    };
    J.Nav=function(parent,c,index,selected,fn){
        var b=box(panel("Button",parent,"RCTab"),0,index*96,320,96);b.AddClass("CJNav");b.hittestchildren=false;b.SetHasClass("UISelected",selected);
        var icon={weapon:"sword",item:"ticket",technology:"hero",challenge:"sword",rebirth:"hero",bundles:"gift"}[c.id]||"gift";
        box(art(b,"nav_selected_glow","CJNavGlow"),-10,-10,340,116);
        box(art(b,"nav_selected_line","CJNavLine"),0,94,320,2);
        box(art(b,icon+"_light","CJNavIcon CJNavIconNormal"),38,25,44,44);
        box(art(b,icon+"_hover","CJNavIcon CJNavIconSelected"),38,25,44,44);
        box(label(b,c.label,"RCTabText"),108,27,198,42);b.SetPanelEvent("onactivate",fn);return b;
    };
    J.Action=function(parent,text,fn,cls){var b=U.ActionButton(parent,{label:text,action:fn});b.AddClass("CJBuy");if(cls)b.AddClass(cls);return b;};
    J.Price=function(parent,item,x,y,w){
        var p=box(panel("Panel",parent,"CJPrice"),x,y,w||264,42),row=panel("Panel",p,"CJPriceRow");
        var wallet=item.purchase_method==="wallet",currency=wallet?item.currency_name:"元",amount=wallet?item.price:(item.amount_fen/100).toFixed(2);
        if(wallet)art(row,item.currency==="shop_points"?"crystal":"coin","CJPriceIcon");else label(row,"¥","CJYuanIcon");
        label(row,amount+" "+currency,"CJPriceValue");p.hittest=false;p.hittestchildren=false;return p;
    };
    J.Product=function(parent,item,props){
        props=props||{};var card=U.CardShell(parent,{bodyVariant:"product"});card.AddClass("RCProduct");card.AddClass("CJProduct");
        box(art(card,"card_shadow","CJCardShadow"),-12,-8,320,376);
        box(art(card,"card_halo","CJCardHalo"),-12,-8,320,376);
        box(art(card,"product_normal","CJCardBase"),0,0,296,348);
        box(art(card,"product_hover","CJCardHover"),0,0,296,348);
        var well=box(panel("Panel",card,"CJArtWell"),16,12,264,224);
        box(art(well,"art_well","CJWellTexture"),0,0,264,224);
        var entry=(cfg.SurvivalCommerceArt||{})[item.icon];
        if(entry)box(original(well,entry.shadow,"CJItemShadow"),-12,-12,288,224);
        var image=box(original(well,item.icon,"RCProductArt"),4,4,256,192);
        // Keep the confirmed art area. Legacy thumbnails use an inset instead of excessive enlargement.
        if(entry && Math.max(entry.sourceSize[0],entry.sourceSize[1])<128)box(image,84,52,96,96);
        var hover=box(panel("Panel",well,"RCProductHover"),0,0,264,224);hover.hittest=true;hover.hittestchildren=true;
        var shade=box(art(hover,"hover_shade","CJHoverShade"),0,0,264,224);
        var effect=box(label(hover,props.effect,"RCProductEffect"),12,123,240,40);
        // Long configured effects stay readable on hover, without adding a detail page.
        if(String(props.effect||"").length>26||String(props.effect||"").indexOf("\n")>=0){box(effect,12,16,240,148);effect.AddClass("CJLongEffect");effect.hittest=true;shade.SetImage("file://{images}/"+assetRoot+"hover_shade_long.png");}
        box(J.Action(hover,props.purchaseLabel,props.action,"RCProductBuy"),38,170,188,46);
        centeredName(card,item.title,12,244,272);J.Price(card,item,16,286,264);
        if(!item.enabled)box(label(card,item.owned>0?"已拥有":"暂不可购","RCStockState"),172,12,108,28);
        return card;
    };
    J.Bundle=function(parent,item,props){
        var card=U.CardShell(parent,{bodyVariant:"product"});card.AddClass("RCProduct");card.AddClass("CJBundle");
        centeredName(card,item.title,16,12,576);
        var contents=box(panel("Panel",card,"RCBundleContents"),20,58,568,202);
        (props.rewards||[]).forEach(function(r){
            var slot=panel("Panel",contents,"RCBundleItem");
            // Reward labels and quantities are authoritative. Use the bundle's existing icon as a fallback.
            original(slot,r.icon||item.icon,"RCBundleArt");label(slot,r.label,"RCBundleName");label(slot,"×"+r.quantity,"RCBundleQuantity");
        });
        J.Price(card,item,16,286,342);box(J.Action(card,props.purchaseLabel,props.action,"RCBundleBuy"),390,283,188,46);return card;
    };
    cfg.SurvivalCommerceComponents=J;
})();
