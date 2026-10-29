(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    var activeEntry = null, activeSource = null, pinned = false;
    var tooltipHovered = false, hideJob = null, generation = 0;
    var frameReady = false, purchaseEnabled = false;
    var tooltipDismiss = null, tooltipDismissPanel = null;
    var tooltipContext = $.GetContextPanel ? $.GetContextPanel() : null, api = null;
    var previousTooltip = cfg.SurvivalShopTooltip;
    if (previousTooltip && previousTooltip.DisposeTooltip) previousTooltip.DisposeTooltip();
    function dismissFor(tooltip) {
        if (!cfg.SurvivalTooltipDismiss || !tooltip) return null;
        if (tooltipDismissPanel !== tooltip) {
            if (tooltipDismiss) tooltipDismiss.Dispose();
            tooltipDismissPanel = tooltip;
            tooltipDismiss = cfg.SurvivalTooltipDismiss.Create({panel:tooltip,
                getRect:tooltipRect,
                hide:hide,
                isAlive:function () { return (!tooltipContext || valid(tooltipContext))
                    && (!api || cfg.SurvivalShopTooltip === api); },
                isVisible:function () { return activeEntry !== null && !tooltip.BHasClass("Hidden"); }});
        }
        return tooltipDismiss;
    }
    function byId(id) { return $("#" + id); }
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    function setText(id, value) { var p = byId(id),resources=cfg.SurvivalItemResources; if (p) p.text = resources&&resources.DisplayText?resources.DisplayText(value):String(value === undefined ? "" : value); }
    function formatNumber(value) {
        var formatter = cfg.SurvivalNumberFormatter;
        return formatter && formatter.Format ? formatter.Format(value) : String(value || 0);
    }
    function numberOr(value, fallback) { return typeof value === "number" && isFinite(value) ? value : fallback; }
    function shopFitScale(node) {
        for (var owner = node; owner && owner !== tooltipContext; owner = owner.GetParent ? owner.GetParent() : null) {
            if (owner.id !== "CustomShopWindow") continue;
            var match = String(owner.style.transform || "").match(/scale3d\(\s*([\d.eE+-]+)/);
            return match && Number(match[1]) > 0 && isFinite(Number(match[1])) ? Number(match[1]) : 1;
        }
        return 1;
    }
    function tooltipRect(node) {
        var at = node.GetPositionWithinWindow(), scale = shopFitScale(node);
        // Native layout sizes omit CSS Fit; the root-level tooltip stays unscaled.
        return {x:at.x,y:at.y,width:node.actuallayoutwidth * scale,height:node.actuallayoutheight * scale};
    }
    function cancelHide() {
        generation++;
        if (hideJob !== null && $.CancelScheduled) $.CancelScheduled(hideJob);
        hideJob = null;
    }
    function hide() {
        if (tooltipDismiss) tooltipDismiss.Hidden();
        cancelHide();
        if (valid(activeSource) && activeSource.SetHasClass) activeSource.SetHasClass("ShopSelected", false);
        activeEntry = null; activeSource = null; pinned = false; tooltipHovered = false;
        var tooltip = byId("ShopEntryTooltip");
        if (tooltip) { tooltip.AddClass("Hidden"); tooltip.hittest = false; tooltip.hittestchildren = false; }
    }
    function requestHide() {
        cancelHide();
        var serial = generation;
        // Preserve the source leave grace without allowing tooltip hover to keep it open.
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
            // A dismissed or replaced entry cannot run stale placement callbacks.
            if (!valid(tooltip) || !valid(source) || activeSource !== source) return;
            var owner = byId("CustomShopWindow");
            if (!valid(owner)) return;
            var pp = parent.GetPositionWithinWindow(), sp = source.GetPositionWithinWindow(), wp = owner.GetPositionWithinWindow();
            var sx = Math.max(0.001, numberOr(parent.actualuiscale_x, 1));
            var sy = Math.max(0.001, numberOr(parent.actualuiscale_y, 1));
            var y = (numberOr(sp.y, 0) - numberOr(pp.y, 0)) / sy;
            var wx = (numberOr(wp.x, 0) - numberOr(pp.x, 0)) / sx;
            var ww = numberOr(owner.actuallayoutwidth, 464) * shopFitScale(owner) / sx;
            var tw = (numberOr(tooltip.actuallayoutwidth, 370) || 370) / sx;
            var th = (numberOr(tooltip.actuallayoutheight, 300) || 300) / sy;
            var pw = numberOr(parent.actuallayoutwidth, 1920) / sx;
            var ph = numberOr(parent.actuallayoutheight, 1080) / sy;
            // The transparent 22px gutter contains the pointer; native parents clip negative children.
            var left = wx + ww;
            if (left + tw > pw - 12) left = wx - tw - 22;
            left = Math.max(12, Math.min(left, pw - tw - 12));
            var top = Math.max(12, Math.min(y - 32, ph - th - 12));
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
        var art = cfg.SurvivalItemArt,presentation=cfg.SurvivalRewardPresentation;
        var rendered = art && art.Create(parent, entry, "ShopTooltipMainIcon");
        if (rendered) { if(presentation&&presentation.FillIcon)presentation.FillIcon(rendered,entry); return; }
        var p = $.CreatePanel(entry.icon_type === "ability" ? "DOTAAbilityImage" : "DOTAItemImage", parent, "");
        if (entry.icon_type === "ability") p.abilityname = entry.icon || "ability_upgrade_wall";
        else p.itemname = entry.icon || "item_branches";
        p.AddClass("ShopTooltipMainIcon"); p.hittest = false;
        if(presentation&&presentation.FillIcon)presentation.FillIcon(p,entry);
    }
    function ensureFrame(tooltip) {
        if (frameReady || !$.CreatePanel || !tooltip.SetPanelEvent) return;
        frameReady = true;
        tooltip.AddClass("ShopPurpleTooltip");
        var arrow = $.CreatePanel("Panel", tooltip, "ShopTooltipArrow");
        arrow.hittest = false; arrow.hittestchildren = false;
        ["TL","TR","BL","BR"].forEach(function(c) {
            var corner = $.CreatePanel("Panel", tooltip, "");
            corner.AddClass("ShopFrameCorner"); corner.AddClass("ShopFrameCorner" + c);
            corner.hittest = false; corner.hittestchildren = false;
        });
        ["ShopTooltipPurchase", "ShopTooltipAutoPurchase"].forEach(function (id) {
            var old = byId(id);
            if (old) { old.visible = false; old.enabled = false; old.hittest = false; old.hittestchildren = false; }
        });
        tooltip.SetPanelEvent("onmouseover", function () {
            if (tooltipDismiss) tooltipDismiss.Dismiss(); else hide();
        });
    }
    function show(entry, source, keepOpen) {
        if (!entry) return;
        var tooltip = byId("ShopEntryTooltip"), iconHost = byId("ShopTooltipIconHost"), fields = byId("ShopTooltipFields");
        if (!tooltip || !iconHost || !fields) return;
        ensureFrame(tooltip);
        var dismiss = dismissFor(tooltip);
        if (dismiss && !dismiss.CanShow(source)) { hide(); return; }
        cancelHide();
        if (activeSource !== source) tooltipHovered = false;
        if (activeSource !== source && valid(activeSource) && activeSource.SetHasClass) activeSource.SetHasClass("ShopSelected", false);
        pinned = keepOpen === true || !!(activeEntry && activeEntry.entry_id === entry.entry_id && pinned);
        activeEntry = entry; activeSource = source || null;
        if (valid(source) && source.SetHasClass) source.SetHasClass("ShopSelected", true);
        var owner = byId("CustomShopWindow");
        tooltip.style.zIndex = String(Math.max(100000, Number(owner && owner.style.zIndex) || 0) + 1);
        var definition = CustomNetTables.GetTableValue("survival_tooltips", entry.tooltip_id || ("shop_item:" + entry.entry_id)) || {};
        iconHost.RemoveAndDeleteChildren(); fields.RemoveAndDeleteChildren(); createIcon(iconHost, entry);
        var resources=cfg.SurvivalItemResources,fallbackName=entry.name || definition.name || entry.content_id;
        setText("ShopTooltipTitle", resources&&resources.DisplayName?resources.DisplayName(entry,fallbackName):fallbackName);
        setText("ShopTooltipType", "");
        byId("ShopTooltipType").visible = false;
        var description = entry.content_type === "technology" ? (entry.description || definition.desc || "") : (definition.desc || entry.description || "");
        if(cfg.SurvivalItemResources&&cfg.SurvivalItemResources.DisplayDescription)description=cfg.SurvivalItemResources.DisplayDescription(entry,description);
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
        purchaseEnabled = !locked && Number(entry.completed || 0) !== 1 && Number(entry.removed || 0) !== 1;
        tooltip.hittest = true; tooltip.hittestchildren = true; tooltip.RemoveClass("Hidden");
        placeBesideSource(tooltip, source);
        if (dismiss) dismiss.Shown(source);
    }
    cfg.SurvivalShopTooltip = api = { Show:show, Hide:hide, RequestHide:requestHide,
        DisposeTooltip:function () { hide(); if (tooltipDismiss) tooltipDismiss.Dispose(); },
        UpdateAutoPurchaseState:function () {},
        UpdateEntry:function (entry) { if (activeEntry && entry && entry.entry_id === activeEntry.entry_id) show(entry, activeSource, pinned); },
        Inspect:function () { return {entry:activeEntry && activeEntry.entry_id,pinned:pinned,hovered:tooltipHovered,purchaseEnabled:!!activeEntry && purchaseEnabled,actions:false}; }
    };
})();
