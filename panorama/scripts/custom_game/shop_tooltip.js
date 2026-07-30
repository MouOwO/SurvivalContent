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
            var sourceWidth = numberOr(sourcePanel.actuallayoutwidth, 80);
            var sourceHeight = numberOr(sourcePanel.actuallayoutheight, 64);
            var tooltipHeight = numberOr(tooltip.actuallayoutheight, 310);
            var parentHeight = numberOr(parent.actuallayoutheight, 1080);
            var x = sourceX + sourceWidth + gap;
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

        iconHost.RemoveAndDeleteChildren();
        fields.RemoveAndDeleteChildren();
        createIcon(iconHost, entry);
        var isTechnology = entry.content_type === "technology";
        setText("ShopTooltipTitle", isTechnology
            ? (entry.name || entry.content_id)
            : (tooltipDefinition.name || entry.name || entry.content_id));
        setText(
            "ShopTooltipType",
            entry.content_type === "technology" ? "科技商品" : "商品"
        );
        setText("ShopTooltipDescription", isTechnology
            ? (entry.description || "")
            : (tooltipDefinition.desc || entry.description || ""));
        setText("ShopTooltipWoodCost", formatNumber(
            entry.wood_cost !== undefined
                ? entry.wood_cost : tooltipDefinition.needwood
        ));
        setText("ShopTooltipGoldCost", formatNumber(
            entry.gold_cost !== undefined
                ? entry.gold_cost : tooltipDefinition.needgold
        ));
        setText(
            "ShopTooltipCondition",
            "购买条件：" + (entry.purchase_condition_text || "无")
        );

        var limitText = entry.purchase_limit > 0
            ? (entry.owned_count + " / " + entry.purchase_limit)
            : (entry.owned_count + " / 不限");
        setText("ShopTooltipOwned", "已购买：" + limitText);
        setText(
            "ShopTooltipStatus",
            entry.purchasable === 1
                ? "可购买 · 右键图标购买"
                : ("不可购买 · " + (entry.disabled_reason || "条件不满足"))
        );

        asArray(entry.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });

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
