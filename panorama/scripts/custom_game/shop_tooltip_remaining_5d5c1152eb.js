(function () {
    "use strict";

    var activeEntry = null;

    function byId(id) { return $("#" + id); }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }

    function setText(id, value) {
        var panel = byId(id);
        if (panel) panel.text = String(value === undefined ? "" : value);
    }

    function formatNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        if (formatter && formatter.Format) return formatter.Format(value);
        return String(value || 0);
    }

    function formatFieldValue(value) {
        if (typeof value === "number") return formatNumber(value);
        if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
            return formatNumber(Number(value));
        }
        return value;
    }

    function numberOr(value, fallback) {
        return typeof value === "number" && isFinite(value) ? value : fallback;
    }

    function placeBesideSource(tooltip, sourcePanel) {
        if (!tooltip || !sourcePanel || !sourcePanel.GetPositionWithinWindow) return;
        var parent = tooltip.GetParent ? tooltip.GetParent() : null;
        if (!parent || !parent.GetPositionWithinWindow) return;
        var edge = 12;
        var gap = 10;

        function applyPosition() {
            if (!tooltip || !tooltip.IsValid || !tooltip.IsValid()
                || !sourcePanel || !sourcePanel.IsValid || !sourcePanel.IsValid()) return;
            var parentPosition = parent.GetPositionWithinWindow();
            var sourcePosition = sourcePanel.GetPositionWithinWindow();
            var scaleX = Math.max(0.001, numberOr(parent.actualuiscale_x, 1));
            var scaleY = Math.max(0.001, numberOr(parent.actualuiscale_y, 1));
            var sourceX = (numberOr(sourcePosition.x, 0)
                - numberOr(parentPosition.x, 0)) / scaleX;
            var sourceY = (numberOr(sourcePosition.y, 0)
                - numberOr(parentPosition.y, 0)) / scaleY;
            var sourceWidth = numberOr(sourcePanel.actuallayoutwidth, 80) / scaleX;
            var sourceHeight = numberOr(sourcePanel.actuallayoutheight, 64) / scaleY;
            var tooltipHeight = numberOr(tooltip.actuallayoutheight, 310) / scaleY;
            var parentHeight = numberOr(parent.actuallayoutheight, 1080) / scaleY;
            var x = sourceX + sourceWidth + gap;
            var tipWidth=numberOr(tooltip.actuallayoutwidth,430)/scaleX,parentWidth=numberOr(parent.actuallayoutwidth,1920)/scaleX;
            if(x+tipWidth+edge>parentWidth)x=sourceX-tipWidth-gap;
            x=Math.max(edge,Math.min(x,parentWidth-tipWidth-edge));
            var y = sourceY + (sourceHeight - tooltipHeight) * 0.5;
            y = Math.max(edge, Math.min(y, parentHeight - tooltipHeight - edge));
            tooltip.style.position = Math.round(x) + "px "
                + Math.round(y) + "px 0px";
        }

        applyPosition();
        $.Schedule(0.0, applyPosition);
        $.Schedule(0.03, applyPosition);
    }

    function createIcon(parent, entry) {
        var art=GameUI.CustomUIConfig().SurvivalItemArt; if(art&&art.Create(parent,entry,"ShopTooltipMainIcon"))return;
        var panel;
        if (entry.icon_type === "ability") {
            panel = $.CreatePanel("DOTAAbilityImage", parent, "");
            panel.abilityname = entry.icon || "ability_upgrade_wall";
        } else {
            panel = $.CreatePanel("DOTAItemImage", parent, "");
            panel.itemname = entry.icon || "item_branches";
        }
        panel.AddClass("ShopTooltipMainIcon");
    }

    function addField(container, label, value) {
        if (!label || value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("ShopTooltipFieldRow");
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("ShopTooltipFieldLabel");
        left.text = String(label);
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("ShopTooltipFieldValue");
        right.text = String(formatFieldValue(value));
    }

    function show(entry, sourcePanel) {
        activeEntry = entry;
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips",
            entry.tooltip_id || ("shop_item:" + entry.entry_id)
        ) || {};
        var tooltip = byId("ShopEntryTooltip");
        var iconHost = byId("ShopTooltipIconHost");
        var fields = byId("ShopTooltipFields");
        if (!tooltip || !iconHost || !fields) return;
        var owner=byId("CustomShopWindow");tooltip.style.zIndex=String(Math.max(100000,Number(owner&&owner.style.zIndex)||0)+1);

        iconHost.RemoveAndDeleteChildren();
        fields.RemoveAndDeleteChildren();
        createIcon(iconHost, entry);
        setText('ShopTooltipTitle',entry.name||tooltipDefinition.name||entry.content_id);
        var description = entry.content_type === 'technology'
            ? (entry.description || tooltipDefinition.desc || '')
            : (tooltipDefinition.desc || entry.description || '');
        setText('ShopTooltipDescription', description);
        byId('ShopTooltipDescription').visible = String(description).trim().length > 0;
        ['Wood','Gold'].forEach(function(currency){
            var key=currency.toLowerCase(),value=entry[key+'_cost']!==undefined?entry[key+'_cost']:tooltipDefinition['need'+key];
            var label=byId('ShopTooltip'+currency+'Cost');
            label.text=formatNumber(value);label.GetParent().visible=Number(value)>0;
        });
        ['Type','Condition','Owned','Fields','Status'].forEach(function(suffix){var p=byId('ShopTooltip'+suffix);if(p)p.visible=false;});
        tooltip.SetHasClass("Unavailable", entry.purchasable !== 1);
        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (activeEntry !== entry) return;
            placeBesideSource(tooltip, sourcePanel);
        });
    }

    function hide() {
        activeEntry = null;
        var tooltip = byId("ShopEntryTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    GameUI.CustomUIConfig().SurvivalShopTooltip = {
        Show: show,
        Hide: hide
    };
})();
