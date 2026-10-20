// Compact purple commerce presentation. Catalog and checkout stay in their controllers.
(function () {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),U=cfg.SurvivalUI,J={},activeDetail=null;
    function valid(p){return p&&(!p.IsValid||p.IsValid());}
    function panel(type,parent,cls){var p=$.CreatePanel(type,parent,"");if(cls)cls.split(/\s+/).forEach(function(c){p.AddClass(c);});return p;}
    function box(p,x,y,w,h){p.style.position=x+"px "+y+"px 0px";p.style.width=w+"px";p.style.height=h+"px";return p;}
    function label(parent,value,cls){var p=panel("Label",parent,cls);p.text=J.RewardNameText(value);p.hittest=false;return p;}
    function original(parent,uri,cls){
        var p=panel("Image",parent,cls);
        var resolved=J.NormalizeIconURI(uri);if(resolved)p.SetImage(resolved);
        p.SetScaling("stretch-to-fit-preserve-aspect");p.hittest=false;p.hittestchildren=false;return p;
    }
    J.Box=box;J.Label=label;
    // Older catalog snapshots and saved receipts retain the original medal names.
    // Normalize display text only; stable reward IDs and settlement data stay intact.
    J.RewardNameText=function(value){
        return String(value===undefined||value===null?"":value).replace(/(?:僵尸岛V|VIP)(10|[1-9])勋章/g,"孤城V$1勋章").replace(/U币/g,"G币");
    };
    J.RewardAmount=function(value){
        var amount=Number(value);
        if(!isFinite(amount))return "—";
        var display=amount.toFixed(1);
        if(Number(display)===0)display="0.0";
        return (Number(display)<0?"":"+")+display;
    };
    // All consumers share the same constrained image namespace. No URLs,
    // traversal, encoded paths or arbitrary resource types cross this boundary.
    J.NormalizeIconURI=function(value){
        if(typeof value!=="string"||value.length>512||/\s/.test(value))return "";
        var relative=value.indexOf("file://{images}/")===0?value.substring(16):value;
        if(/^(custom_game|items|spellicons|econ|heroes)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:png|svg)$/.test(relative))return "file://{images}/"+relative;
        if(/^s2r:\/\/panorama\/images\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.vtex$/.test(value))return value;
        return "";
    };
    // Artwork is selected by stable identity in the shared resource table.
    J.ProductIcon=function(item){
        if(!item)return undefined;
        var resources=cfg.SurvivalItemResources;
        return resources?resources.Resolve(item,item.icon):item.icon;
    };
    function iconItem(item,rewards){
        if(!item||typeof item!=="object"||item.reward_lines!==undefined||!Array.isArray(rewards)||!rewards.length)return item;
        var display={};Object.keys(item).forEach(function(key){display[key]=item[key];});display.reward_lines=rewards;return display;
    }
    J.ItemIcon=function(parent,item,className,options){
        item=iconItem(item,options&&options.rewards);
        var presentation=cfg.SurvivalRewardPresentation;
        var registered=presentation&&presentation.CreateRegisteredIcon&&presentation.CreateRegisteredIcon(parent,item,className,options);
        var icon=registered||original(parent,J.ProductIcon(item)||"items/recipe.png",className);
        if(presentation&&presentation.FillIcon)presentation.FillIcon(icon,item);
        return icon;
    };
    J.Art=function(parent,file,cls){return original(parent,"custom_game/commerce_jade_v1/"+file+".png",cls);};
    J.Window=function(root,onClose){
        if(cfg.SurvivalBlackLionMarket)return cfg.SurvivalBlackLionMarket.Window(root,onClose);
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
        var validU=isU && item.disabled_reason!=="payment_price_unavailable" && typeof uCoin==="number" && uCoin>0 && uCoin%1===0 && item.u_coin_per_yuan===100 && typeof fen==="number" && fen>0 && fen<=1000000 && fen%1===0 && uCoin===fen;
        var paidMeta=item.u_coin_price!==undefined || item.u_coin_per_yuan!==undefined || fen!==undefined || item.disabled_reason==="payment_price_unavailable";
        var previewCoin=!paidMeta && typeof item.price==="number" && item.price>0 && item.price%1===0?item.price:null;
        if(wallet || isU){
            var uri=item.currency==="shop_points"?"custom_game/commerce_jade_v1/crystal.png":"custom_game/commerce_jade_v1/coin.png";
            original(row,uri,"CJPriceIcon");
        }else label(row,"¥","CJYuanIcon");
        var uText=validU?uCoin+" G币":previewCoin!==null?previewCoin+" G币":"G币价格待同步";
        label(row,isU?uText:amount+" "+currency,"CJPriceValue");p.hittest=false;p.hittestchildren=false;return p;
    };
    function detailQuality(item, rewards) {
        var resources=cfg.SurvivalItemResources;
        return resources&&resources.Grade?resources.Grade(iconItem(item,rewards)):"";
    }
    function detail(card,item,props,bundle){
        // Keep ownership on the complete card so close/reopen and incremental
        // refresh retain their existing lifecycle. A market row exposes only
        // its icon as the mouse entry surface.
        var hoverPanel=valid(props.hoverPanel)?props.hoverPanel:card;
        var layer=valid(props.detailLayer)?props.detailLayer:card;
        var inspectBundle=!!(props.market&&bundle&&item.sku==="video_bundle_b003"
            &&(props.rewards||[]).length===4&&props.rewards.every(function(reward){return !!reward.description;}));
        var tip=panel("Panel",layer,"RCPurpleDetail MenuV10CommerceDetail");tip.hittest=false;tip.hittestchildren=false;
        if(inspectBundle)tip.AddClass("BLMarketBundleDetail");
        var skin=props.market?cfg.SurvivalBlackLionMarket.SkinTooltip(tip):cfg.SurvivalMenuV10.SkinTooltip(tip),body=panel("Panel",skin.surface,"MenuV10CommerceDetailBody");
        // Measure the complete text independently of the bounded scroll viewport.
        // Measuring body itself feeds its clipped height back into the next layout.
        var content=panel("Panel",body,"MenuV10CommerceDetailContent"),scrollable=false;
        tip.__purpleSource=hoverPanel;
        tip.style.position="202px 0px 0px";tip.style.width="312px";
        label(content,item.title,"RCPurpleDetailTitle");
        var grade=detailQuality(item,props.rewards),gradeLabel=label(content,grade?"品级："+grade:"","RCPurpleDetailQuality");
        gradeLabel.visible=!!grade;
        var summary=props.effect||item.description||"";
        if(inspectBundle)summary=String(item.description||"").split(/\r?\n/).slice(0,2).join("\n");
        else if(bundle&&(props.rewards||[]).length)summary=props.rewards.map(function(reward){
            return reward.description?(reward.label?reward.label+"\n":"")+reward.description
                :String(reward.label||reward.id||"")+" ×"+String(reward.quantity===undefined?1:reward.quantity);
        }).join(props.rewards.some(function(reward){return !!reward.description;})?"\n\n":"\n");
        // VIP descriptions use semicolons in the formal catalog. Display each
        // effect on its own line, as the shared VIP tooltip already does.
        summary=String(summary).replace(/\r\n?/g,"\n").replace(/[；;][ \t]*/g,"\n");
        var effect=label(content,summary,"RCProductEffect");effect.visible=!!effect.text;
        var memberButtons=[],memberEffect=null,selectedMember=-1;
        function selectMember(index){
            if(index===selectedMember)return;
            selectedMember=index;
            memberButtons.forEach(function(button,i){button.SetHasClass("UISelected",i===index);});
            memberEffect.text=J.RewardNameText(props.rewards[index].description).replace(/\r\n?/g,"\n").replace(/[；;][ \t]*/g,"\n");
            if(tip.BHasClass("Visible")){cancel();place();followPlace();}
        }
        if(inspectBundle){
            var members=panel("Panel",content,"RCBundleContents BLMarketBundleMembers");
            members.hittest=false;members.hittestchildren=true;
            props.rewards.forEach(function(reward,index){
                var button=panel("Button",members,"RCBundleItem BLMarketBundleMember");button.hittestchildren=false;
                label(button,reward.label,"BLMarketBundleMemberName");memberButtons.push(button);
                button.SetPanelEvent("onmouseover",function(){cancelBundleLeave();selectMember(index);});
                button.SetPanelEvent("onactivate",function(){cancelBundleLeave();selectMember(index);return true;});
                button.SetPanelEvent("onmouseout",bundleLeave);
            });
            memberEffect=label(content,"","RCBundleMemberEffect");
            var initial=0;props.rewards.forEach(function(reward,index){if(reward.id==="video_p032")initial=index;});selectMember(initial);
        }
        var positionJob=null,serial=0,disposed=false,dismiss=null,bundleLeaveJob=null,hoverPoint=null;
        function cancel(){serial++;if(positionJob!==null&&$.CancelScheduled)$.CancelScheduled(positionJob);positionJob=null;}
        function cancelBundleLeave(){if(bundleLeaveJob!==null&&$.CancelScheduled)$.CancelScheduled(bundleLeaveJob);bundleLeaveJob=null;}
        function inBundleRegion(node,at){if(!valid(node))return false;var bounds=tooltipRect(node);return at&&at[0]>=bounds.x&&at[0]<bounds.x+bounds.width&&at[1]>=bounds.y&&at[1]<bounds.y+bounds.height;}
        function bundleLeave(){
            cancelBundleLeave();
            bundleLeaveJob=$.Schedule(.12,function(){
                bundleLeaveJob=null;if(disposed||!valid(tip)||!tip.BHasClass("Visible"))return;
                var at=GameUI.GetCursorPosition&&GameUI.GetCursorPosition();
                if(inBundleRegion(hoverPanel,at)||inBundleRegion(skin.surface,at))return;
                hide();
            });
        }
        function hide(){cancel();cancelBundleLeave();if(dismiss)dismiss.Hidden();if(valid(tip)){tip.RemoveClass("Visible");tip.hittest=false;tip.hittestchildren=false;}if(valid(card)){card.RemoveClass("ShopSelected");card.style.zIndex="0";}if(activeDetail&&activeDetail.tip===tip)activeDetail=null;}
        function dispose(){if(disposed)return;hide();disposed=true;if(dismiss)dismiss.Dispose();if(valid(tip))tip.DeleteAsync(0);}
        function tooltipRect(node){var at=node.GetPositionWithinWindow(),scale=props.menu?props.menu.Scale():1;return {x:at.x,y:at.y,width:node.actuallayoutwidth*scale,height:node.actuallayoutheight*scale};}
        function guard(){
            if(inspectBundle)return null;
            if(!dismiss&&cfg.SurvivalTooltipDismiss)dismiss=cfg.SurvivalTooltipDismiss.Create({
                panel:tip,surface:skin.surface,getRect:tooltipRect,hide:hide,
                allowTooltipHover:function(){return scrollable;},
                isAlive:function(){return !disposed&&valid(card)&&valid(hoverPanel)&&valid(tip)&&valid(layer);},
                isVisible:function(){return tip.BHasClass("Visible");}
            });
            return dismiss;
        }
        function place(){
            if(disposed)return;
            if(!valid(card)||!valid(hoverPanel)||!valid(tip)||!valid(layer)){dispose();return;}
            if(!card.GetPositionWithinWindow)return;
            var sourcePanel=valid(props.sourcePanel)?props.sourcePanel:hoverPanel;
            var source=sourcePanel.GetPositionWithinWindow(),root=card;
            while(valid(root)&&root.GetParent&&valid(root.GetParent()))root=root.GetParent();
            var width=Number(root.actuallayoutwidth)||1920,height=Number(root.actuallayoutheight)||1080;
            var origin=layer.GetPositionWithinWindow(),menu=props.menu;
            var scale=Math.max(.001,(Number(layer.actualuiscale_x)||1)*(menu?menu.Scale():1));
            var nativeScale=Math.max(.001,Number(layer.actualuiscale_y)||1);
            // Native paints the owned layer inside its window despite overflow:noclip.
            // Keep the complete detail in both that clip and the viewport safety area.
            var pad=12*scale,leftEdge=pad,rightEdge=width-pad,topEdge=pad,bottomEdge=height-pad;
            var clip=valid(props.detailLayer)&&layer.GetParent?layer.GetParent():null;
            if(valid(clip)){
                var clipOrigin=clip.GetPositionWithinWindow(),cw=(props.windowWidth||1672)*scale,ch=(props.windowHeight||941)*scale;
                leftEdge=Math.max(leftEdge,clipOrigin.x+pad);rightEdge=Math.min(rightEdge,clipOrigin.x+cw-pad);
                topEdge=Math.max(topEdge,clipOrigin.y+pad);bottomEdge=Math.min(bottomEdge,clipOrigin.y+ch-pad);
            }
            var chrome=props.market?36:88,naturalHeight=(Number(content.actuallayoutheight)||80*nativeScale)/nativeScale;
            // Keep bundle selectors stationary, while every text line remains
            // reachable through this one viewport even on a smaller screen.
            var maximum=Math.max(chrome+1,Math.min(704,(bottomEdge-topEdge)/scale));
            var logicalHeight=Math.min(maximum,inspectBundle?600:Math.max(120,naturalHeight+chrome));
            var viewportHeight=Math.max(1,logicalHeight-chrome);
            scrollable=naturalHeight>viewportHeight+.5;
            skin.Resize(368,logicalHeight);tip.style.width="368px";tip.style.height=logicalHeight+"px";
            body.style.height=viewportHeight+"px";body.style.maxHeight=viewportHeight+"px";
            tip.SetHasClass("Scrollable",scrollable);
            var interactive=inspectBundle||scrollable;
            tip.hittest=interactive;tip.hittestchildren=interactive;skin.surface.hittest=interactive;skin.surface.hittestchildren=interactive;
            body.hittest=interactive;body.hittestchildren=interactive;content.hittest=false;content.hittestchildren=inspectBundle;
            var sw=(props.sourceWidth||144)*scale,tw=368*scale,th=logicalHeight*scale;
            var x=source.x+sw+pad;
            if(x+tw>rightEdge)x=source.x-tw-pad;
            x=Math.max(leftEdge,Math.min(x,rightEdge-tw));
            var y=Math.max(topEdge,Math.min(source.y,bottomEdge-th));
            // Clamping a popup to a small window can put it under the entry
            // cursor. Avoid that entry point once; keep its placement stable
            // when the pointer later moves into a scrollable detail.
            if(hoverPoint&&hoverPoint[0]>=x&&hoverPoint[0]<x+tw&&hoverPoint[1]>=y&&hoverPoint[1]<y+th){
                var after=hoverPoint[0]+pad,before=hoverPoint[0]-tw-pad;
                if(after+tw<=rightEdge)x=after;
                else if(before>=leftEdge)x=before;
                else y=hoverPoint[1]+pad+th<=bottomEdge?hoverPoint[1]+pad:Math.max(topEdge,hoverPoint[1]-th-pad);
            }
            if(!isFinite(x)||!isFinite(y)||!isFinite(origin.x)||!isFinite(origin.y))return;
            tip.style.position=Math.round((x-origin.x)/scale)+"px "+Math.round((y-origin.y)/scale)+"px 0px";
        }
        function followPlace(){
            var epoch=serial,passes=0,delays=[0,.05,.1,.2];
            function next(){positionJob=$.Schedule(delays[passes++],function(){
                positionJob=null;
                if(epoch!==serial||disposed||!valid(tip)||!activeDetail||activeDetail.tip!==tip||!tip.BHasClass("Visible"))return;
                place();if(passes<delays.length)next();
            });}
            next();
        }
        function show(){
            if(disposed)return;
            if(!valid(card)||!valid(hoverPanel)||!valid(tip)||!valid(layer)){dispose();return;}
            var policy=guard();if(policy&&!policy.CanShow(hoverPanel))return;
            if(activeDetail&&activeDetail.tip!==tip)activeDetail.hide();
            cancel();cancelBundleLeave();activeDetail={tip:tip,hide:hide};
            var at=GameUI.GetCursorPosition&&GameUI.GetCursorPosition();
            hoverPoint=inBundleRegion(hoverPanel,at)?[at[0],at[1]]:null;
            tip.AddClass("Visible");card.AddClass("ShopSelected");card.style.zIndex="30";
            place();if(policy)policy.Shown(hoverPanel);
            followPlace();
        }
        function leave(){
            if(inspectBundle||scrollable){bundleLeave();return;}
            // A genuine source exit must rearm the next product even when it
            // lies beneath this old popup. Surface entry still uses Dismiss.
            if(dismiss){dismiss.Dispose();dismiss=null;}
            hide();
        }
        hoverPanel.SetPanelEvent("onmouseover",show);hoverPanel.SetPanelEvent("onmouseout",leave);
        hoverPanel.SetPanelEvent("onactivate",function(){show();if(!props.market&&props.action)props.action();return true;});
        [tip,skin.surface,body].forEach(function(node){
            node.SetPanelEvent("onmouseover",function(){if(inspectBundle||scrollable)cancelBundleLeave();else if(dismiss)dismiss.Dismiss();else hide();});
            node.SetPanelEvent("onmouseout",function(){if(inspectBundle||scrollable)bundleLeave();});
        });
        card.__purpleDetail=tip;card.__purpleHide=hide;card.__purpleShow=show;
        card.__purpleDispose=dispose;tip.__purpleDispose=dispose;
        card.__purpleRebuildDetail=function(){if(disposed&&valid(card)&&valid(hoverPanel)&&valid(layer))return detail(card,item,props,bundle);return valid(tip)?tip:null;};
        return tip;
    }
    function compactCard(parent,item,props,bundle){
        props=props||{};var card=U.CardShell(parent,{bodyVariant:"product"});
        card.AddClass("RCProduct");card.AddClass(bundle?"CJBundle":"CJProduct");card.AddClass("CommercePurpleProduct");
        var well=box(panel("Panel",card,"CommercePurpleArtWell"),12,9,120,120);
        box(J.ItemIcon(well,item,"RCProductArt",{width:120,height:120,rewards:props.rewards}),0,0,120,120);
        var caption=box(label(card,String(item.title||item.sku||"").replace(/\s*[·•]\s*永久\s*$/,""),"RCProductName"),7,134,130,35);
        var owned=Number(item.owned)>0?label(card,String(item.owned),"RCStockState"):null;
        card.__menuCell={iconPanel:well,namePanel:caption,countPanel:owned};
        detail(card,item,props,bundle);return card;
    }
    J.BindDetail=detail;
    J.Product=function(parent,item,props){return compactCard(parent,item,props,false);};
    J.Bundle=function(parent,item,props){return compactCard(parent,item,props,true);};
    cfg.SurvivalCommerceComponents=J;
})();

// BEGIN GENERATED SHOP HOME CATALOG 20261016
// Source: data/ui/shop_home_catalog_20261016.json; SHA256 c5386377021231c0579ddfcf6f969fa8094e6126cb0c8ddd695a5ba781469cda
(function(){
    "use strict";
    var cfg=GameUI.CustomUIConfig(),entries=[
        {"kind":"product","source_id":"P033","name":"伐木斧","sku":"video_p033"},
        {"kind":"unavailable","source_id":"P008","name":"焚天曜轮"},
        {"kind":"product","source_id":"P029","name":"工作效率","sku":"video_p029"},
        {"kind":"product","source_id":"P012","name":"剑圣","sku":"video_p012"},
        {"kind":"product","source_id":"P032","name":"快速建造","sku":"video_p032"},
        {"kind":"product","source_id":"P005","name":"双倍通关卡","sku":"video_p005"},
        {"kind":"product","source_id":"P018","name":"时间科技","sku":"video_p018"},
        {"kind":"unavailable","source_id":"P006","name":"兔女郎城墙"},
        {"kind":"unavailable","source_id":"P007","name":"昭穹羽君"},
        {"kind":"product","source_id":"P004","name":"清暑符","sku":"video_p004"},
        {"kind":"product","source_id":"P066","name":"陨落天矿","sku":"video_p066"},
        {"kind":"product","source_id":"P067","name":"山海鲲鹏","sku":"video_p067"},
        {"kind":"product","source_id":"P068","name":"轮回仙碑","sku":"video_p068"},
        {"kind":"product","source_id":"P072","name":"苍松固城","sku":"video_p072"},
        {"kind":"product","source_id":"P071","name":"斫木宗师","sku":"video_p071"},
        {"kind":"product","source_id":"P070","name":"林铸千矢","sku":"video_p070"},
        {"kind":"product","source_id":"P069","name":"翠木归元","sku":"video_p069"},
        {"kind":"unavailable","source_id":"P073","name":"天道傀儡"},
        {"kind":"unavailable","source_id":"P074","name":"封神榜"},
        {"kind":"product","source_id":"P075","name":"诛仙剑阵","sku":"video_p075"}
    ];
    function identity(entry){return entry.kind==="product"?entry.sku:"home_unavailable_"+entry.source_id;}
    function compose(products,isListed){
        var bySku=Object.create(null),result=[];
        (Array.isArray(products)?products:[]).forEach(function(item){if(item&&typeof item.sku==="string"&&!bySku[item.sku])bySku[item.sku]=item;});
        entries.forEach(function(entry){
            if(entry.kind==="unavailable"){
                var placeholder={home_unavailable:true,home_display_id:identity(entry),source_id:entry.source_id,title:entry.name,
                    description:entry.name+"：暂未开放。",enabled:false};
                if(Object.freeze)Object.freeze(placeholder);result.push(placeholder);
            }else{
                var item=bySku[entry.sku];if(item&&typeof isListed==="function"&&isListed(item))result.push(item);
            }
        });
        return result;
    }
    cfg.SurvivalShopHomeCatalog={
        sourceHash:"c5386377021231c0579ddfcf6f969fa8094e6126cb0c8ddd695a5ba781469cda",
        List:function(){return entries.map(identity);},
        Compose:compose
    };
})();
// END GENERATED SHOP HOME CATALOG 20261016
