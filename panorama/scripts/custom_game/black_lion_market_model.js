// Presentation only. Server catalogs authorize all prices and purchases.
(function () {
    "use strict";
    var config=typeof GameUI!=="undefined"?GameUI.CustomUIConfig():null, localPresentation=null;
    var defaultPresentation={"groups":{"home":["video_p001","video_p033","video_p029","video_p005","video_p015","video_p030","video_p012","video_p032","video_p018","video_p013","video_p017","video_p020","video_p014","video_p026","video_p004","video_p028","video_p011","video_p031","video_p019","video_p023","video_p022","video_p025","video_p016","video_p024","video_p027","video_p021","video_p037","video_p038","video_p147","video_p151","video_p042","video_p043","video_p048","video_p046","video_p045","video_p049","video_p050","video_p051","video_p052","video_p056","video_p055","video_p054","video_p053","video_p057","video_p058","video_p063","video_p061","video_p065","video_p066","video_p067","video_p068","video_p072","video_p071","video_p070","video_p069","video_p075","video_p079","video_p078","video_p077","video_p082","video_p083","video_p084","video_p088","video_p087","video_p086","video_p089","video_p090","video_p092","video_p094","video_p095","video_p096","video_p100","video_p099","video_p098","video_p097","video_p101","video_p102","video_p103","video_p104","video_p108","video_p107","video_p106","video_p105","video_p109","video_p110","video_p111","video_p112","video_p114","video_p140","video_p113","video_p116","video_p117","video_p118","video_p119","video_p123","video_p122","video_p121","video_p120","video_p124","video_p125","video_p126","video_p127","video_p131","video_p130","video_p129","video_p128","video_p132","video_p133","video_p134","video_p135","video_p139","video_p138","video_p137","video_p136","video_bundle_b001","video_bundle_b002","video_bundle_b003","video_bundle_b004","video_bundle_b005","video_bundle_vip_01","video_bundle_vip_02","video_bundle_vip_03","video_bundle_vip_04","video_bundle_vip_05","video_bundle_vip_06","video_bundle_vip_07","video_bundle_vip_08","video_bundle_vip_09","video_bundle_vip_10"],"bundles":["video_bundle_b001","video_bundle_b002","video_bundle_b003","video_bundle_b004","video_bundle_b005"],"promotions":["video_p004","video_p011","video_p005","video_p012","video_p022","video_p026","video_p025","video_p023","video_p016","video_p027","video_p028","video_p024","video_p020","video_p021","video_p019","video_p018","video_p032","video_p031","video_p017","video_p013","video_p014","video_p030","video_p015","video_p029","video_p033"],"vip":["video_bundle_vip_01","video_bundle_vip_02","video_bundle_vip_03","video_bundle_vip_04","video_bundle_vip_05","video_bundle_vip_06","video_bundle_vip_07","video_bundle_vip_08","video_bundle_vip_09","video_bundle_vip_10"],"all":["video_p001","video_p033","video_p029","video_p005","video_p015","video_p030","video_p012","video_p032","video_p018","video_p013","video_p017","video_p020","video_p014","video_p026","video_p004","video_p028","video_p011","video_p031","video_p019","video_p023","video_p022","video_p025","video_p016","video_p024","video_p027","video_p021","video_p037","video_p038","video_p147","video_p151","video_p042","video_p043","video_p048","video_p046","video_p045","video_p049","video_p050","video_p051","video_p052","video_p056","video_p055","video_p054","video_p053","video_p057","video_p058","video_p063","video_p061","video_p065","video_p066","video_p067","video_p068","video_p072","video_p071","video_p070","video_p069","video_p075","video_p079","video_p078","video_p077","video_p082","video_p083","video_p084","video_p088","video_p087","video_p086","video_p089","video_p090","video_p092","video_p094","video_p095","video_p096","video_p100","video_p099","video_p098","video_p097","video_p101","video_p102","video_p103","video_p104","video_p108","video_p107","video_p106","video_p105","video_p109","video_p110","video_p111","video_p112","video_p114","video_p140","video_p113","video_p116","video_p117","video_p118","video_p119","video_p123","video_p122","video_p121","video_p120","video_p124","video_p125","video_p126","video_p127","video_p131","video_p130","video_p129","video_p128","video_p132","video_p133","video_p134","video_p135","video_p139","video_p138","video_p137","video_p136","video_bundle_b001","video_bundle_b002","video_bundle_b003","video_bundle_b004","video_bundle_b005","video_bundle_vip_01","video_bundle_vip_02","video_bundle_vip_03","video_bundle_vip_04","video_bundle_vip_05","video_bundle_vip_06","video_bundle_vip_07","video_bundle_vip_08","video_bundle_vip_09","video_bundle_vip_10"]}};
    var definitions=[{id:"home",label:"首页"},{id:"bundles",label:"礼包"},
        {id:"promotions",label:"促销"},{id:"vip",label:"VIP"},{id:"all",label:"全部商品"}];
    var purchaseTypes=[{id:"u_coin",label:"G币"},{id:"shop_points",label:"积分"},{id:"all",label:"全部"}];
    function purchaseType(item){
        if(!item)return "";
        if(item.purchase_method==="wallet")return item.currency==="shop_points"||item.currency==="shop_gold"?item.currency:"";
        return item.purchase_method==="cash"?"u_coin":"";
    }
    function matchesPurchaseType(item,id){return id==="all"||purchaseType(item)===id;}
    var vipReasons={vip_level_required:true,vip_level_insufficient:true};
    var balanceReasons={commerce_balance_insufficient:true,insufficient_balance:true};
    var unavailableReasons={already_owned:true,purchase_limit_reached:true,entitlement_already_owned:true,
        component_already_owned:true,ownership_limit_reached:true,attribute_limit_reached:true,
        product_unavailable:true,shop_gold_not_open:true,bundle_pending_assets:true,
        payment_catalog_pending:true,payment_product_unavailable:true,payment_price_unavailable:true};
    function rows(value){return Array.isArray(value)?value:Object.keys(value||{}).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return value[k];});}
    function enabled(value){return value===true||value===1;}
    function number(value){
        if(typeof value!=="number"&&!(typeof value==="string"&&/^\d+(?:\.\d+)?$/.test(value)))return null;
        var result=Number(value);return isFinite(result)&&result>=0&&result<=9007199254740991?result:null;
    }
    function reason(item){return item&&typeof item.disabled_reason==="string"?item.disabled_reason:"";}
    function priceReady(item){
        if(item.purchase_method==="wallet")return item.currency==="shop_points"&&number(item.price)!==null;
        if(item.purchase_method!=="cash")return false;
        var fen=number(item.amount_fen);
        if(fen===null||fen<=0||fen%1!==0||fen>1000000)return false;
        if(item.currency==="u_coin"||item.u_coin_price!==undefined||item.u_coin_per_yuan!==undefined){
            var coins=number(item.u_coin_price);
            return coins!==null&&coins>0&&coins%1===0&&item.u_coin_per_yuan===100&&coins===fen;
        }
        return true;
    }
    function isListed(item){
        if(!item||typeof item.sku!=="string"||!item.sku||enabled(item.preview_only)||!priceReady(item))return false;
        var owned=number(item.owned),limit=number(item.purchase_limit),blocked=reason(item);
        // Missing quantities are unknown, never proof of ownership or zero.
        if(limit!==null&&limit>0&&owned!==null&&owned>=limit)return false;
        if(unavailableReasons[blocked])return false;
        return enabled(item.enabled)||!!vipReasons[blocked]||!!balanceReasons[blocked];
    }
    function isActionable(item){return isListed(item)&&!vipReasons[reason(item)]&&(enabled(item.enabled)||!!balanceReasons[reason(item)]);}
    function disabledMessage(item){
        if(!item)return "商品资料尚未同步";
        if(typeof item.disabled_message==="string"&&item.disabled_message)return item.disabled_message;
        var blocked=reason(item),level=number(item.required_vip_level);
        if(vipReasons[blocked])return level!==null&&level>0?"需要 VIP "+level+" 才可购买":"VIP 等级不足";
        if(balanceReasons[blocked])return (item.currency==="shop_points"?"商城积分":item.currency_name||"余额")+"不足";
        var messages={already_owned:"已拥有，每人限购一次",purchase_limit_reached:"已达到购买上限",
            entitlement_already_owned:"已拥有对应权益",component_already_owned:"礼包内道具已达持有上限",
            attribute_limit_reached:"属性已达上限",ownership_limit_reached:"道具已达持有上限",
            shop_gold_not_open:"商城金币暂未开放",bundle_pending_assets:"礼包尚未开放",
            product_unavailable:"商品尚未上架",payment_catalog_pending:"支付目录正在同步",
            payment_product_unavailable:"直购渠道尚未开放",payment_price_unavailable:"购买价格尚未同步"};
        return messages[blocked]||(!enabled(item.enabled)?"未满足购买条件":"");
    }
    function presentation(){return localPresentation||(config&&config.SurvivalShopPresentation)||defaultPresentation;}
    function groupOrder(id){
        if(id==="home"){
            var home=config&&config.SurvivalShopHomeCatalog;
            var order=home&&typeof home.List==="function"?home.List():null;
            return Array.isArray(order)?order:[];
        }
        var value=(presentation().groups||{})[id];return Array.isArray(value)?value:null;
    }
    function listedInVideo(item,id){var order=groupOrder(id);return !!order&&order.indexOf(item.sku)>=0;}
    function isVip(item){return number(item.required_vip_level)>0||item.category_id==="vip";}
    function discount(item){
        var original=number(item.original_u_coin_price===undefined?item.original_price:item.original_u_coin_price);
        var current=number(item.currency==="u_coin"?item.u_coin_price:item.price);
        return original!==null&&current!==null&&original>current;
    }
    function inGroup(item,id){
        if(!isListed(item))return false;
        // Product type and VIP requirements come from the server catalog.
        // Discounts and legacy display lists cannot move bundles to other tabs.
        if(item.product_type==="bundle")return id===(isVip(item)?"vip":"bundles");
        if(id==="vip"||id==="bundles")return false;
        if(id==="all")return true;
        if(listedInVideo(item,id))return true;
        if(id==="home")return groupOrder("home")===null;
        if(id==="promotions")return discount(item);
        return false;
    }
    function referencePrice(item){
        // Existing promotion membership owns eligibility. This comparison never
        // changes catalog prices, original-price metadata, grouping or checkout.
        if(!item||item.product_type==="recharge"||item.sku==="u_coin_recharge"||item.sku==="archive_pass_monthly"||!inGroup(item,"promotions"))return null;
        var current=item.purchase_method==="wallet"?number(item.price):item.currency==="u_coin"||item.u_coin_price!==undefined||item.u_coin_per_yuan!==undefined?number(item.u_coin_price):number(item.amount_fen)/100;
        return current!==null&&current>0&&current<=9007199254740991/3?current*3/2:null;
    }
    function groupFor(item){
        if(!item)return "all";
        if(item.product_type==="bundle")return isVip(item)?"vip":"bundles";
        if(discount(item))return "promotions";
        return listedInVideo(item,"home")?"home":"all";
    }
    function sortProducts(items,id){
        var order=groupOrder(id)||[],all=groupOrder("all")||[];
        return rows(items).map(function(item,index){
            var rank=order.indexOf(item.sku),globalRank=all.indexOf(item.sku),fallback=number(item.sort_order);
            if(fallback===null&&/^P\d+$/.test(item.source_id||""))fallback=Number(item.source_id.slice(1));
            return {item:item,index:index,section:rank>=0?0:globalRank>=0?1:2,
                rank:rank>=0?rank:globalRank>=0?globalRank:fallback===null?index:fallback};
        }).sort(function(a,b){return a.section-b.section||a.rank-b.rank||a.index-b.index;}).map(function(entry){return entry.item;});
    }
    function homeProducts(items){
        var home=config&&config.SurvivalShopHomeCatalog;
        var composed=home&&typeof home.Compose==="function"?home.Compose(rows(items),function(item){return item.product_type!=="bundle"&&isListed(item);}):[];
        // Reviewed video placeholders have no formal SKU or buying eligibility.
        // Keep them in the source evidence, never in the live storefront.
        return rows(composed).filter(function(item){return item.product_type!=="bundle"&&isListed(item);});
    }
    function groups(catalog){
        var products=rows(catalog&&catalog.products);
        return definitions.map(function(definition){return {id:definition.id,label:definition.label,
            count:definition.id==="home"?homeProducts(products).length:products.filter(function(item){return inGroup(item,definition.id);}).length};});
    }
    function typeLabel(item,catalog){
        var id=item&&item.category_id,name="";
        rows(catalog&&catalog.categories).some(function(category){
            if(!category||category.id!==id||typeof category.label!=="string"||!category.label)return false;
            name=category.label;return true;
        });
        if(!name)name={item:"道具与材料",technology:"科技与服务",weapon:"装备",rebirth:"转职",challenge:"挑战",bundles:"礼包",vip:"VIP"}[id]||"道具";
        return name+" · "+(item&&item.product_type==="bundle"?"礼包":"单品");
    }
    function channelLabel(item){
        if(!item||typeof item!=="object")return "购买渠道待同步";
        if(item.purchase_method==="wallet")return item.currency==="shop_points"?"商城积分兑换":"购买渠道待同步";
        if(item.purchase_method==="cash")return item.currency==="u_coin"||item.u_coin_price!==undefined||item.u_coin_per_yuan!==undefined?"人民币直购（G币计价）":"人民币直购";
        return "购买渠道待同步";
    }
    var model={Groups:groups,HomeProducts:homeProducts,GroupFor:groupFor,InGroup:inGroup,SortProducts:sortProducts,
        IsListed:isListed,IsActionable:isActionable,DisabledMessage:disabledMessage,ReferencePrice:referencePrice,
        PurchaseTypes:function(){return purchaseTypes.map(function(option){return {id:option.id,label:option.label};});},
        PurchaseType:purchaseType,MatchesPurchaseType:matchesPurchaseType,
        TypeLabel:typeLabel,ChannelLabel:channelLabel,SetPresentation:function(value){localPresentation=value||null;}};
    if(typeof module!=="undefined"&&module.exports)module.exports=model;
    else config.SurvivalBlackLionMarketModel=model;
}());
