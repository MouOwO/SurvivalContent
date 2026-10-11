(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    var activeEntry = null, activeSource = null, pinned = false;
    var tooltipHovered = false, hideJob = null, generation = 0;
    var purchaseButton = null, purchaseLabel = null, autoButton = null, autoLabel = null;
    var tooltipSkin = null;
    function byId(id) { return $("#" + id); }
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    function setText(id, value) { var p = byId(id); if (p) p.text = String(value === undefined ? "" : value); }
    function formatNumber(value) {
        var formatter = cfg.SurvivalNumberFormatter;
        return formatter && formatter.Format ? formatter.Format(value) : String(value || 0);
    }
    function numberOr(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
    function cancelHide() {
        generation++;
        if (hideJob !== null && $.CancelScheduled) $.CancelScheduled(hideJob);
        hideJob = null;
    }
    function hide() {
        cancelHide();
        if (valid(activeSource) && activeSource.SetHasClass) activeSource.SetHasClass("ShopSelected", false);
        activeEntry = null; activeSource = null; pinned = false; tooltipHovered = false;
        var tooltip = byId("ShopEntryTooltip");
        if (tooltip) { tooltip.AddClass("Hidden"); tooltip.hittest = false; tooltip.hittestchildren = false; }
    }
    function requestHide() {
        cancelHide();
        var serial = generation;
        // The frame-to-tooltip gap is traversable. An old callback cannot dismiss
        // another item selected while moving across the grid.
        hideJob = $.Schedule(0.18, function () {
            hideJob = null;
            if (serial === generation && !tooltipHovered && !pinned) hide();
        });
    }
    function placeBesideSource(tooltip, source) {
        if (!valid(tooltip) || !valid(source) || !source.GetPositionWithinWindow) return;
        var parent = tooltip.GetParent ? tooltip.GetParent() : null;
        if (!parent || !parent.GetPositionWithinWindow) return;
        function place() {
            // Entering the tooltip cancels a hide timer, but must not cancel
            // the layout pass that measures its newly revealed contents.
            if (!valid(tooltip) || !valid(source) || activeSource !== source) return;
            var owner = byId("CustomShopWindow");
            if (!valid(owner)) return;
            var pp = parent.GetPositionWithinWindow(), sp = source.GetPositionWithinWindow(), wp = owner.GetPositionWithinWindow();
            var menu=owner.__shopMenuV10, viewScale=menu?menu.Scale():1;
            var sx = Math.max(0.001, numberOr(parent.actualuiscale_x, 1)*viewScale);
            var sy = Math.max(0.001, numberOr(parent.actualuiscale_y, 1)*viewScale);
            var y = (numberOr(sp.y, 0) - numberOr(pp.y, 0)) / sy;
            var wx = (numberOr(wp.x, 0) - numberOr(pp.x, 0)) / sx;
            var ww = 1672;
            var nativeScale=Math.max(.001,numberOr(parent.actualuiscale_y,1));
            var frame=byId("ShopTooltipFrame"),th=Math.min(704,Math.max(246,(Number(frame&&frame.actuallayoutheight)||250*nativeScale)/nativeScale+48));
            var tw=368;
            if(tooltipSkin)tooltipSkin.Resize(tw,th);
            tooltip.style.width=tw+"px";tooltip.style.height=th+"px";
            var ph=941;
            var sw=144;
            var sourceX=(numberOr(sp.x,0)-numberOr(pp.x,0))/sx;
            var left=sourceX+sw+8;
            if(left+tw>wx+ww-24)left=sourceX-tw-8;
            left=Math.max(wx+24,Math.min(left,wx+ww-tw-24));
            var top = Math.max(128, Math.min(y - 24, ph - th - 40));
            tooltip.style.position = Math.round(left) + "px " + Math.round(top) + "px 0px";
            var arrow = byId("ShopTooltipArrow");
            if (arrow) {
                arrow.style.position = "6px " + Math.round(Math.max(30, Math.min(y - top + 44, th - 30))) + "px 0px";
                arrow.visible = left > wx;
            }
        }
        place();[0,.05,.2,.4].forEach(function(delay){$.Schedule(delay,place);});
    }
    function createIcon(parent, entry) {
        var art = cfg.SurvivalItemArt;
        if (art && art.Create(parent, entry, "ShopTooltipMainIcon")) return;
        var p = $.CreatePanel(entry.icon_type === "ability" ? "DOTAAbilityImage" : "DOTAItemImage", parent, "");
        if (entry.icon_type === "ability") p.abilityname = entry.icon || "ability_upgrade_wall";
        else p.itemname = entry.icon || "item_branches";
        p.AddClass("ShopTooltipMainIcon"); p.hittest = false;
    }
    function ensureActions(tooltip) {
        if (purchaseButton || !$.CreatePanel || !tooltip.SetPanelEvent) return;
        tooltip.AddClass("ShopPurpleTooltip");
        tooltip.AddClass("MenuV10ShopTooltip");
        var frame = byId("ShopTooltipFrame") || tooltip;
        if(cfg.SurvivalMenuV10){tooltipSkin=cfg.SurvivalMenuV10.SkinTooltip(tooltip);frame.SetParent(tooltipSkin.surface);}
        var arrow = $.CreatePanel("Panel", tooltip, "ShopTooltipArrow");
        arrow.hittest = false; arrow.hittestchildren = false;
        arrow.visible=false;
        purchaseButton = $.CreatePanel("Button", frame, "ShopTooltipPurchase");
        purchaseButton.AddClass("ShopTooltipPurchase"); purchaseButton.hittestchildren = false;
        purchaseLabel = $.CreatePanel("Label", purchaseButton, ""); purchaseLabel.hittest = false;
        purchaseButton.SetPanelEvent("onactivate", function () {
            if (!activeEntry || purchaseButton.enabled === false || !cfg.SurvivalShop) return;
            // Resolve the latest authoritative row in the shop controller.
            cfg.SurvivalShop.PurchaseEntry(activeEntry.entry_id);
        });
        autoButton = $.CreatePanel("Button", frame, "ShopTooltipAutoPurchase");
        autoButton.AddClass("ShopTooltipAutoPurchase"); autoButton.hittestchildren = false;
        autoLabel = $.CreatePanel("Label", autoButton, ""); autoLabel.text = "自动购买"; autoLabel.hittest = false;
        autoButton.SetPanelEvent("onactivate", function () {
            if (activeEntry && cfg.SurvivalShop && cfg.SurvivalShop.ToggleAutoPurchaseEntry)
                cfg.SurvivalShop.ToggleAutoPurchaseEntry(activeEntry.entry_id);
        });
        tooltip.SetPanelEvent("onmouseover", function () { tooltipHovered = true; cancelHide(); });
        tooltip.SetPanelEvent("onmouseout", function () { tooltipHovered = false; requestHide(); });
    }
    function updateAutoPurchaseState() {
        if (!autoButton || !activeEntry) return;
        var values = CustomNetTables.GetTableValue("survival_shop_config", "auto_purchase_" + Game.GetLocalPlayerID()) || {};
        var enabled = Number(values[activeEntry.entry_id] || 0) === 1;
        autoButton.SetHasClass("AutoBookEnabled", enabled);
        autoLabel.text = enabled ? "停止自动购买" : "自动购买";
    }
    function show(entry, source, keepOpen) {
        if (!entry) return;
        cancelHide();
        if (activeSource !== source) tooltipHovered = false;
        if (activeSource !== source && valid(activeSource) && activeSource.SetHasClass) activeSource.SetHasClass("ShopSelected", false);
        pinned = keepOpen === true || !!(activeEntry && activeEntry.entry_id === entry.entry_id && pinned);
        activeEntry = entry; activeSource = source || null;
        if (valid(source) && source.SetHasClass) source.SetHasClass("ShopSelected", true);
        var tooltip = byId("ShopEntryTooltip"), iconHost = byId("ShopTooltipIconHost"), fields = byId("ShopTooltipFields");
        if (!tooltip || !iconHost || !fields) return;
        ensureActions(tooltip);
        var owner = byId("CustomShopWindow");
        tooltip.style.zIndex = String(Math.max(100000, Number(owner && owner.style.zIndex) || 0) + 1);
        var definition = CustomNetTables.GetTableValue("survival_tooltips", entry.tooltip_id || ("shop_item:" + entry.entry_id)) || {};
        iconHost.RemoveAndDeleteChildren(); fields.RemoveAndDeleteChildren(); createIcon(iconHost, entry);
        setText("ShopTooltipTitle", entry.name || definition.name || entry.content_id);
        var types = {weapon:"装备",equipment:"装备",item:"道具",challenge:"挑战",rebirth:"转职",technology:"科技",service:"其他"};
        setText("ShopTooltipType", types[entry.content_type] || entry.type_name || "物品");
        byId("ShopTooltipType").visible = true;
        var description = entry.content_type === "technology" ? (entry.description || definition.desc || "") : (definition.desc || entry.description || "");
        setText("ShopTooltipDescription", description);
        byId("ShopTooltipDescription").visible = String(description).trim().length > 0;
        byId("ShopTooltipDescription").hittest = true;
        if (byId("ShopTooltipEffectHeading")) byId("ShopTooltipEffectHeading").visible = String(description).trim().length > 0;
        var visibleCosts = 0;
        ["Wood", "Gold"].forEach(function (currency) {
            var key = currency.toLowerCase(), value = entry[key + "_cost"] !== undefined ? entry[key + "_cost"] : definition["need" + key];
            var label = byId("ShopTooltip" + currency + "Cost");
            if (label) { label.text = formatNumber(value); label.GetParent().visible = Number(value) > 0; if (Number(value) > 0) visibleCosts++; }
        });
        tooltip.SetHasClass("ShopTooltipDualCost", visibleCosts > 1);
        ["Condition", "Owned", "Fields", "Status"].forEach(function (suffix) { var p = byId("ShopTooltip" + suffix); if (p) p.visible = false; });
        var prerequisite = entry.content_type === "technology" && entry.prerequisite_met !== undefined;
        var locked = prerequisite ? Number(entry.prerequisite_met) === 0 : Number(entry.purchasable) !== 1;
        tooltip.SetHasClass("Unavailable", locked); tooltip.SetHasClass("PrerequisiteLocked", prerequisite && locked);
        if (purchaseButton) {
            purchaseButton.enabled = !locked && Number(entry.completed || 0) !== 1 && Number(entry.removed || 0) !== 1;
            purchaseButton.SetHasClass("UIDisabled", !purchaseButton.enabled);
            var challenge = entry.content_type === "challenge" || entry.content_type === "rebirth";
            purchaseLabel.text = locked ? (entry.disabled_reason || "条件未达成") : entry.content_type === "technology" ? "研究" : challenge ? "挑战" : "购买";
            autoButton.visible = entry.entry_id === "shop_item_knowledge_book" || entry.entry_id === "shop_item_super_knowledge_book";
            updateAutoPurchaseState();
        }
        tooltip.hittest = true; tooltip.hittestchildren = true; tooltip.RemoveClass("Hidden");
        placeBesideSource(tooltip, source);
    }
    cfg.SurvivalShopTooltip = { Show:show, Hide:hide, RequestHide:requestHide,
        UpdateAutoPurchaseState:updateAutoPurchaseState,
        UpdateEntry:function (entry) { if (activeEntry && entry && entry.entry_id === activeEntry.entry_id) show(entry, activeSource, pinned); },
        Inspect:function () { return {entry:activeEntry && activeEntry.entry_id,pinned:pinned,hovered:tooltipHovered,purchaseEnabled:purchaseButton && purchaseButton.enabled}; }
    };
})();
