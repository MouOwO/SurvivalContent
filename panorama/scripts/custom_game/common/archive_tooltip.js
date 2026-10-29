(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    // Each caller owns its panel, hover state and timers. The renderer never
    // calls ArchiveHandoff.Show or assumes that the archive window is open.
    function create(options) {
        options = options || {};
        var U = cfg.SurvivalUI, D = cfg.ArchiveV10Data, P = cfg.ArchiveParchmentData || {};
        var S = cfg.ArchiveV10Semantics, A = cfg.ArchiveHandoff;
        if (!U || !U.Lifecycle || !D || !S || !A) throw new Error("Archive tooltip dependencies must load before Create");
        var parent = options.parent, root = options.root || parent, prefix = options.idPrefix || "ArchiveSharedTooltip";
        var life = U.Lifecycle(), disposed = false, showEpoch = 0, hideEpoch = 0, anchor = null;
        var currentItem = null, currentCategory = "", elements = {}, pieces = {}, panel, dismiss;
        var followJob = null, followedSource = null, hideQueued = false;
        var compact = options.compact === true;
        var rarityColors = {UR:"#ef5350",SSR:"#f5c65e",SR:"#b680ee",R:"#74c8f2",N:"#8fc47b"};
        var inventoryColors={white:"#d7dee4",gray:"#aeb8c2",green:"#8fc47b",blue:"#74c8f2",purple:"#b680ee",gold:"#f5c65e",red:"#ef5350"};
        var surfaceWidth = compact ? 260 : 320, insetX = compact ? 8 : 22;
        var insetTop = compact ? 6 : 19, verticalGutter = compact ? 12 : 41;
        var bodyWidth = surfaceWidth - insetX * 2, padding = 24;
        var minimumHeight = compact ? 180 : 198, measuredHeight = minimumHeight, fitScale = 1;
        var hostWidth = surfaceWidth + padding * 2;
        function valid(node) { return node && (!node.IsValid || node.IsValid()); }
        function alive() { return !disposed && valid(parent) && valid(root) && valid(panel) && (!options.isAlive || options.isAlive()); }
        function active() { return alive() && (!options.isActive || options.isActive()); }
        function style(node, values) {
            var cache = node.__archiveTooltipStyle || (node.__archiveTooltipStyle = {});
            Object.keys(values).forEach(function (key) { if (cache[key] !== values[key]) { node.style[key] = values[key]; cache[key] = values[key]; } });
        }
        function rect(node, x, y, width, height) {
            style(node, {position:Math.round(x)+"px "+Math.round(y)+"px 0px", width:width+"px", height:height+"px", margin:"0px", padding:"0px", horizontalAlign:"left", verticalAlign:"top"});
        }
        function make(type, owner, role, classes) {
            var node = $.CreatePanel(type, owner, role ? prefix+role : "");
            if (classes) node.AddClass(classes);
            node.hittest = false; node.hittestchildren = false;
            if (role) elements[role] = node;
            return node;
        }
        function text(owner, role) {
            var node = make("Label", owner, role, "ArchiveSharedTooltipText");
            style(node, {fontFamily:'"Source Han Sans SC"', fontWeight:"normal", textShadow:"none", letterSpacing:"0px"});
            return node;
        }
        function nineFrame(role, key, assetOverride) {
            var asset = assetOverride || P.assets && P.assets[key] || D.assets[key];
            var spec = D.tooltip.assets[key.replace(/^tooltip_/, "")] || {};
            var insets = asset.nine_slice_ltrb || spec.nine_slice_ltrb || [10,10,10,10];
            var edges = asset.edge_ltrb || insets;
            var host = make("Panel", panel, role, "ArchiveSharedTooltipNineFrame"), cells = [];
            host.__v10Slice = {asset:key, insets:insets.slice()};
            for (var r=0; r<3; r++) for (var c=0; c<3; c++) {
                var clip = make("Panel", host, "", "ArchiveSharedTooltipCrop");
                var art = make("Panel", clip, "", "ArchiveSharedTooltipArt");
                style(clip, {flowChildren:"none", overflow:"clip"});
                style(art, {backgroundImage:'url("'+asset.file+'")', backgroundSize:"100% 100%", backgroundPosition:"0px 0px", backgroundRepeat:"no-repeat", flowChildren:"none"});
                if (asset.fill === false && r === 1 && c === 1) { art.visible=false; style(art,{backgroundImage:"none"}); }
                cells.push({clip:clip, art:art, col:c, row:r});
            }
            pieces[role] = cells;
            host.Resize = function (x, y, width, height) {
                var left=edges[0], top=edges[1], right=edges[2], bottom=edges[3];
                width=Math.max(width,left+right); height=Math.max(height,top+bottom); rect(host,x,y,width,height);
                var xs=[0,insets[0],asset.size[0]-insets[2],asset.size[0]], ys=[0,insets[1],asset.size[1]-insets[3],asset.size[1]];
                var dx=[0,left,width-right,width], dy=[0,top,height-bottom,height];
                cells.forEach(function (cell) {
                    var c=cell.col, r=cell.row, sw=xs[c+1]-xs[c], sh=ys[r+1]-ys[r], dw=dx[c+1]-dx[c], dh=dy[r+1]-dy[r], sx=dw/sw, sy=dh/sh;
                    rect(cell.clip,dx[c],dy[r],dw,dh); rect(cell.art,-xs[c]*sx,-ys[r]*sy,asset.size[0]*sx,asset.size[1]*sy);
                });
            };
            return host;
        }
        panel = $.CreatePanel("Panel", parent, prefix);
        panel.AddClass("ArchiveSharedTooltipHost"); panel.hittest=false; panel.hittestchildren=true; panel.visible=false;
        rect(panel,0,0,hostWidth,measuredHeight+padding*2);
        var shadow=make("Panel",panel,"Shadow","ArchiveSharedTooltipShadow"); rect(shadow,padding,padding,surfaceWidth,measuredHeight);
        var tooltipSkin=options.skin || {};
        var backing=nineFrame("Backing","tooltip_reference_clean",tooltipSkin.backing || {file:"file://{images}/custom_game/gw2_tooltip_v1/background.png",size:[354,103],nine_slice_ltrb:[3,3,3,3]}); backing.AddClass("ArchiveSharedTooltipBacking"); backing.Resize(padding,padding,surfaceWidth,measuredHeight);
        var frame=nineFrame("Frame","tooltip_frame",tooltipSkin.frame); frame.AddClass("ArchiveSharedTooltipFrame"); frame.Resize(padding,padding,surfaceWidth,measuredHeight);
        if (tooltipSkin.frame) style(frame,{visibility:"visible"});
        var surface=make("Panel",panel,"Surface","ArchiveSharedTooltipSurface"); rect(surface,padding,padding,surfaceWidth,measuredHeight);
        surface.hittest=true; surface.hittestchildren=true; style(surface,{flowChildren:"none",overflow:"clip"});
        var viewport=make("Panel",surface,"Viewport","ArchiveSharedTooltipViewport"); rect(viewport,insetX,insetTop,bodyWidth+(compact?8:16),measuredHeight-verticalGutter);
        viewport.hittest=true; viewport.hittestchildren=true; style(viewport,{flowChildren:"none",overflow:"squish scroll"});
        var body=make("Panel",viewport,"Body","ArchiveSharedTooltipBody"); rect(body,0,0,bodyWidth,160);
        body.hittestchildren=true; style(body,{height:"fit-children",flowChildren:"down",overflow:"noclip"});
        ["Title","State","EffectCaption","Effect","Condition"].forEach(function (role) { text(body,role); });
        var metric=make("Panel",body,"Metric","ArchiveSharedTooltipMetric"); rect(metric,0,0,bodyWidth,27); style(metric,{flowChildren:"none",marginBottom:compact?"0px":"4px"});
        var caption=text(metric,"MetricCaption"), quantity=text(metric,"Quantity"), colors=D.tooltip.text_colors;
        rect(caption,0,0,bodyWidth-114,27); style(caption,{fontSize:"17px",color:colors.caption,textAlign:"left"});
        rect(quantity,bodyWidth-114,0,114,27); style(quantity,{position:"0px 0px 0px",width:"fit-children",maxWidth:"114px",horizontalAlign:"right",fontSize:"17px",color:colors.quantity,textAlign:"right"});
        var separator=make("Image",body,"Separator","ArchiveSharedTooltipSeparator");
        separator.SetImage(D.assets.tooltip_separator.file); separator.SetScaling("stretch-to-fit"); rect(separator,0,0,bodyWidth,4); style(separator,{marginBottom:compact?"6px":"8px"});
        body.MoveChildBefore(separator,elements.EffectCaption);
        // Collection authority is opt-in: other archive tooltip layouts and
        // their unlock/progress semantics retain their existing content.
        var rarityLine = options.collectionRarity === true ? text(body,"Rarity") : null;
        if (rarityLine) { rarityLine.visible=false; body.MoveChildBefore(rarityLine,separator); }
        function probabilityText(value) {
            if (value===undefined || value===null || typeof value==="boolean" || String(value).trim()==="") return "";
            var probability=Number(value);
            if (!isFinite(probability) || probability<0 || probability>1) return "";
            var percent=probability*100;
            return percent>0 && percent<0.01 ? "<0.01%" : percent.toFixed(2)+"%";
        }

        function hide() {
            showEpoch++; hideEpoch++; hideQueued=false;life.Cancel();
            if (valid(anchor)) anchor.RemoveClass("ArchiveHovered");
            anchor=null;
            if (valid(panel)) panel.visible=false;
            if (dismiss) dismiss.Hidden();
            if (options.onHide) options.onHide();
        }
        function queueHide(source) {
            if (dismiss && dismiss.SourceLeft) dismiss.SourceLeft(source);
            // Native events from a retired card can arrive after the next Show.
            if (source && source!==anchor) return;
            if (!active() || !panel.visible || hideQueued) return;
            hideQueued=true;
            var epoch=++hideEpoch;
            life.Later(.15,function () {
                if (!active() || epoch!==hideEpoch) return;
                hideQueued=false;
                if (cursorInside(anchor) || (tooltipOverflows() && cursorInside(surface))) return;
                hide();
            });
        }
        function reset() {
            stopFollowing();
            hide();
            // Recreate only this policy owner. This also accepts owners retained
            // from an older script version during a native HUD reload.
            if (dismiss) dismiss.Dispose();
            dismiss=alive() ? createDismiss() : null;
        }
        function tooltipRect(node) { var at=node.GetPositionWithinWindow(); return {x:at.x,y:at.y,width:node.actuallayoutwidth*fitScale,height:node.actuallayoutheight*fitScale}; }
        function tooltipOverflows() { return alive() && body.actuallayoutheight>viewport.actuallayoutheight+1; }
        function cursorInside(node) {
            if (!valid(node) || !GameUI.GetCursorPosition) return false;
            var at=GameUI.GetCursorPosition(), box=tooltipRect(node);
            return at && at[0]>=box.x && at[0]<box.x+box.width && at[1]>=box.y && at[1]<box.y+box.height;
        }
        function stopFollowing() {
            if (followJob!==null && $.CancelScheduled) $.CancelScheduled(followJob);
            followJob=null;followedSource=null;
        }
        function sourceVisible(source) {
            for (var node=source,depth=0;valid(node)&&depth<32;depth++) {
                if (node.visible===false || node.BHasClass && node.BHasClass("ArchiveHidden")) return false;
                if (node===parent) return true;
                node=node.GetParent && node.GetParent();
            }
            return false;
        }
        function followCursor() {
            if (followJob!==null || !options.getHoverSources || !GameUI.GetCursorPosition) return;
            followJob=$.Schedule(.03,function () {
                followJob=null;
                if (!active()) { stopFollowing();return; }
                var at=GameUI.GetCursorPosition();
                if (!at || !isFinite(at[0]) || !isFinite(at[1])) { stopFollowing();return; }
                // Keep scrollable descriptions reachable without allowing a
                // short, transparent description to swallow the next icon.
                if (tooltipOverflows() && panel.visible && cursorInside(surface)) { followCursor();return; }
                var bounds=options.getHoverBounds && options.getHoverBounds();
                if (panel.visible && sourceVisible(anchor) && (!bounds || cursorInside(bounds)) && cursorInside(anchor)) { followCursor();return; }
                var source=null;
                if (!bounds || cursorInside(bounds)) {
                    var sources=options.getHoverSources() || [];
                    for (var index=0;index<sources.length;index++) {
                        var candidate=sources[index];
                        if (sourceVisible(candidate) && cursorInside(candidate)) { source=candidate;break; }
                    }
                }
                if (source) {
                    followedSource=source;
                    if ((source!==anchor || !panel.visible) && dismiss.CanShow(source) && options.onHoverSource) options.onHoverSource(source);
                    followCursor();
                } else {
                    if (followedSource) queueHide(followedSource);
                    followedSource=null;
                    // A source event starts the watcher again. No hidden-window
                    // or idle HUD scan remains after leaving the item region.
                    if (panel.visible && cursorInside(surface)) followCursor();
                }
            });
        }
        function surfaceEnter() {
            if (!active() || !panel.visible || (GameUI.GetCursorPosition && !cursorInside(surface))) return;
            if (GameUI.GetCursorPosition && cursorInside(anchor)) return;
            if (tooltipOverflows()) { hideEpoch++;hideQueued=false; } else dismiss.Dismiss();
        }
        function createDismiss() {
            var owner=cfg.SurvivalTooltipDismiss.Create({panel:panel,surface:surface,getRect:tooltipRect,hide:hide,isAlive:alive,allowSourceSwitch:options.allowSourceSwitch===true,allowTooltipHover:tooltipOverflows,isVisible:function () { return active() && panel.visible; }});
            surface.SetPanelEvent("onmouseover",surfaceEnter);
            return owner;
        }
        dismiss=createDismiss();
        surface.SetPanelEvent("onmouseout",function () { queueHide(); });
        function getBounds() {
            var value=options.getBounds ? options.getBounds() : {width:1200,height:900};
            return Array.isArray(value) ? {width:Number(value[0]),height:Number(value[1])} : {width:Number(value.width),height:Number(value.height)};
        }
        function position(epoch) {
            if (epoch!==showEpoch || !active() || !valid(anchor) || !panel.visible) return;
            var scale=Number(options.getScale ? options.getScale() : 1) || 1; fitScale=scale;
            var cp=parent.GetPositionWithinWindow(), at=anchor.GetPositionWithinWindow();
            var sx=(parent.actualuiscale_x||1)*scale, sy=(parent.actualuiscale_y||1)*scale, bounds=getBounds();
            var contentHeight=0;
            body.Children().forEach(function (child) {
                if (child.visible===false) return;
                var margin=String(child.style.margin||"").split(/\s+/), bottom=child.style.marginBottom||margin[2]||margin[0];
                contentHeight+=(child.actuallayoutheight||0)/(root.actualuiscale_y||1)+(parseFloat(bottom)||0)+(parseFloat(child.style.marginTop)||0);
            });
            var maximum=Number(typeof options.maxHeight==="function" ? options.maxHeight(bounds) : options.maxHeight) || 778;
            var maximumSurface=Math.max(1,maximum-padding*2);
            measuredHeight=Math.max(Math.min(minimumHeight,maximumSurface),Math.min(maximumSurface,Math.ceil(contentHeight)+verticalGutter));
            var info={anchor:{x:(at.x-cp.x)/sx,y:(at.y-cp.y)/sy,width:(anchor.actuallayoutwidth||0)/sx,height:(anchor.actuallayoutheight||0)/sy,panel:anchor},bounds:bounds,width:hostWidth,height:measuredHeight+padding*2,surfaceWidth:surfaceWidth,surfaceHeight:measuredHeight,padding:padding};
            var origin;
            if (options.position) origin=options.position(info);
            else if (currentCategory==="commerce_goods") {
                var goodsX=info.anchor.x+info.anchor.width+10;
                if(goodsX+surfaceWidth>bounds.width-padding)goodsX=info.anchor.x-surfaceWidth-10;
                origin={x:Math.max(0,Math.min(bounds.width-hostWidth,goodsX-padding)),y:Math.max(0,Math.min(bounds.height-measuredHeight-padding*2,info.anchor.y-padding))};
            }
            else {
                // Preserve the archive's existing row-relative placement.
                var tx=info.anchor.x+Math.min(anchor.actuallayoutwidth||745,745)-340;
                tx=Math.max(40,Math.min(bounds.width-360,tx));
                var ty=Math.max(80,Math.min(bounds.height-35-measuredHeight,info.anchor.y+72));
                origin={x:tx-24,y:ty-24};
            }
            rect(panel,origin.x,origin.y,hostWidth,measuredHeight+padding*2);
            backing.Resize(padding,padding,surfaceWidth,measuredHeight); frame.Resize(padding,padding,surfaceWidth,measuredHeight);
            rect(surface,padding,padding,surfaceWidth,measuredHeight); rect(shadow,padding,padding,surfaceWidth,measuredHeight);
            style(viewport,{height:Math.max(1,measuredHeight-verticalGutter)+"px"});
            // Passive descriptions must not consume entry into an icon behind
            // their painted rectangle. Only real overflow needs mouse input.
            var interactive=contentHeight>measuredHeight-verticalGutter+1 || tooltipOverflows();
            panel.hittestchildren=interactive;surface.hittest=interactive;surface.hittestchildren=interactive;
            viewport.hittest=interactive;viewport.hittestchildren=interactive;
        }
        function trackAnchor(epoch, origin) {
            if (!options.watchAnchor) return;
            life.Later(.08,function () {
                if (epoch!==showEpoch || !active() || !valid(anchor) || !panel.visible) return;
                var at=anchor.GetPositionWithinWindow();
                if (Math.abs(at.x-origin.x)>.5 || Math.abs(at.y-origin.y)>.5) { hide(); return; }
                trackAnchor(epoch,origin);
            });
        }
        function show(item, category, card, onlyEffect) {
            if (!active() || !valid(card) || !dismiss.CanShow(card)) return false;
            hide(); anchor=card; currentItem=item; currentCategory=category; card.AddClass("ArchiveHovered");
            if (viewport.ScrollToTop) viewport.ScrollToTop();
            var state=S.State(item,category), name=options.categoryName ? options.categoryName(category) : category;
            var archiveText=cfg.SurvivalArchiveText;
            elements.Title.text=archiveText?archiveText.Plain(item.name):String(item.name||"");
            var unlockItem=S.IsUnlockItem&&S.IsUnlockItem(item,category);
            elements.State.text=onlyEffect ? "" : category==="points"&&unlockItem ? name : name+" · "+(state===null ? "状态待同步" : state ? (!unlockItem&&["shadow","pet","fishing","friend","ex","wife","concubine","beast","points","commerce_goods","shop"].indexOf(category)>=0 ? "已拥有" : "已解锁") : "未解锁");
            var rarityColor=colors.caption, titleColor=rarityColors[String(item.quality||"").toUpperCase()]
                ||inventoryColors[String(item.quality||"").toLowerCase()]||colors.title;
            if (rarityLine) {
                var rarityParts=[],quality=String(item.quality||"").trim().toUpperCase();
                if (!onlyEffect && ["ex","friend","wife","concubine","beast"].indexOf(category)>=0) {
                    if (Object.prototype.hasOwnProperty.call(rarityColors,quality)) { rarityParts.push("品质 "+quality); rarityColor=rarityColors[quality]; titleColor=rarityColor; }
                    if (Number(item.draw_enabled)===0) rarityParts.push("暂不参与抽取");
                    else { var chance=probabilityText(item.draw_probability); if (chance) rarityParts.push("当前抽取概率 "+chance); }
                }
                rarityLine.text=rarityParts.join(" · "); rarityLine.visible=rarityParts.length>0;
            }
            elements.EffectCaption.text="道具效果";
            var description=String(item.description||"服务端未提供效果说明"), effect=elements.Effect;
            if(cfg.SurvivalItemResources&&cfg.SurvivalItemResources.DisplayDescription)description=cfg.SurvivalItemResources.DisplayDescription(item,description);
            if(archiveText)description=archiveText.Plain(description);
            var details=item.unlock_condition||item.condition_text||"";
            if (category==="map_level") {
                var onlineRequirement=description.match(/^累计有效在线时长[：:][^\r\n]+(?:\r?\n|$)/);
                if (onlineRequirement) {
                    description=description.slice(onlineRequirement[0].length);
                    if (!details) details=onlineRequirement[0].trim();
                }
                if (details) details="解锁条件：\n"+details;
            }
            effect.html=!!A.FormatEffects||!!archiveText;
            var formatted=A.FormatEffects ? A.FormatEffects(description,category==="fragment" ? (item.level===undefined ? 0 : item.level) : undefined,item.id ? state : undefined) : description;
            effect.text=archiveText?archiveText.Rich(formatted):formatted;
            if(/^vip_privilege_/.test(String(item.id||"")))details=String(details).replace("手动免费领取一次","达标自动赠送一次");
            if (category==="work" || category==="building") details+=(details?"\n":"")+(Number(item.completed)===1 ? "已达到最高等级" : "点击"+(category==="building"?"升级":"激活")+" · 消耗 "+item.cost+(category==="building"?" 信仰值":" 软妹币"));
            if (category==="titles") details+=(details?"\n":"")+(Number(item.equipped)===1 ? "当前已穿戴 · 点击恢复最高档自动选择" : state ? "点击穿戴称号" : "达成条件后解锁称号");
            if (category==="fragment" && item.level!==undefined) details+=(details?"\n":"")+"神兵等级 LV"+item.level;
            var source=options.currencySourceText && options.currencySourceText(category,item);
            if (["building","work","starjoy_points"].indexOf(category)>=0 && source) details+=(details?"\n":"")+source;
            if (category==="map_level" && item.count!==undefined) details+=(details?"\n":"")+"累计有效在线 "+item.count+" 分钟";
            if(item.availability_note)details+=(details?"\n":"")+String(item.availability_note);
            if(unlockItem){
                var duplicatePoints=Number(item.duplicate_points),duplicateCurrency=({shop_points:"商城积分",starjoy_points:"星悦积分"})[item.duplicate_currency||item.converted_currency];
                details+=(details?"\n":"")+"唯一持有";
                if(item.duplicate_points!==undefined&&item.duplicate_points!==null&&isFinite(duplicatePoints)&&duplicatePoints>=0&&duplicateCurrency)details+=" · 重复获得转化为 "+duplicatePoints+" "+duplicateCurrency;
            }else if(category==="points"){
                var holdingLimit=S.Progress(item,category).target;
                details+=(details?"\n":"")+"可叠加持有 · "+(holdingLimit===null?"无持有上限":"上限 "+holdingLimit);
            }
            elements.Condition.text=archiveText?archiveText.Plain(details):details; elements.Condition.visible=!!details;
            metric.visible=!onlyEffect&&!unlockItem;
            caption.text=unlockItem ? "" : S.Metric(item,category);
            quantity.text=unlockItem ? "" : S.Quantity(item,category);
            var textRoles=["Title","State","EffectCaption","Effect","Condition"]; if(rarityLine)textRoles.push("Rarity");
            textRoles.forEach(function (role) {
                var gap=compact ? (role==="State"||role==="Rarity"?6:role==="EffectCaption"?3:4) : (role==="Title"?6:role==="State"||role==="Rarity"?8:role==="Effect"?8:4);
                style(elements[role],{width:bodyWidth+"px",height:"fit-children",ignoreParentFlow:"false",fontSize:(role==="Title"?22:role==="State"||role==="Rarity"||role==="EffectCaption"?15:17)+"px",color:role==="Title"?titleColor:role==="Effect"?colors.body:role==="State"?colors.state:role==="Rarity"?rarityColor:colors.caption,margin:"0px 0px "+gap+"px",whiteSpace:"normal",textOverflow:"clip"});
            });
            // Also retire glyph snapshots left by the old font renderer on a
            // retained tooltip, before measuring or showing the current item.
            if (cfg.SurvivalArchiveFontV36 && cfg.SurvivalArchiveFontV36.Scope) cfg.SurvivalArchiveFontV36.Scope(body);
            body.style.height="fit-children"; panel.visible=true;
            var epoch=showEpoch; position(epoch); dismiss.Shown(card);
            followedSource=card;followCursor();
            [0,.05,.1,.2,.4,.8].forEach(function (delay) { life.Later(delay,function () { position(epoch); }); });
            if (options.watchAnchor) trackAnchor(epoch,card.GetPositionWithinWindow());
            return true;
        }
        return {
            Show:show, Hide:reset, QueueHide:queueHide, IsVisible:function () { return alive() && panel.visible; }, panel:panel, elements:elements,
            Inspect:function () { return {visible:alive()&&panel.visible,category:currentCategory,itemId:currentItem&&currentItem.id,anchorId:anchor&&anchor.id,prefix:prefix,surfaceHeight:measuredHeight,coordinateSpace:alive()?{fit:fitScale,parentX:parent.actualuiscale_x,parentY:parent.actualuiscale_y,rootX:root.actualuiscale_x,rootY:root.actualuiscale_y,parentPosition:parent.GetPositionWithinWindow(),hostPosition:panel.GetPositionWithinWindow(),hostStyle:panel.style.position,anchorWidth:valid(anchor)?anchor.actuallayoutwidth:0,anchorHeight:valid(anchor)?anchor.actuallayoutheight:0}:null,surfaceRect:alive()?tooltipRect(surface):null,anchorRect:valid(anchor)?tooltipRect(anchor):null,nineSlices:{Backing:{count:pieces.Backing.length,asset:backing.__v10Slice.asset,insets:backing.__v10Slice.insets.slice()},Frame:{count:pieces.Frame.length,asset:frame.__v10Slice.asset,insets:frame.__v10Slice.insets.slice()}}}; },
            Dispose:function () { if (disposed) return; stopFollowing();hide(); if (dismiss) dismiss.Dispose(); disposed=true; life.Dispose(); if (valid(panel)) panel.DeleteAsync(0); }
        };
    }
    cfg.SurvivalArchiveTooltip = {Create:create};
})();
