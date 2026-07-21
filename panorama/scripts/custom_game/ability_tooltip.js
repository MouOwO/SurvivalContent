(function () {
    "use strict";

    var activeAbilityIndex = -1;
    var activeAbilityName = "";
    var activeSourcePanel = null;
    var activeItemSlot = -1;
    var activeItemPanel = null;

    function byId(id) { return $("#" + id); }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }

    function setText(id, value) {
        var target = byId(id);
        if (target) target.text = String(value === undefined ? "" : value);
    }

    function hideNativeTooltip() {
        try { $.DispatchEvent("DOTAHideAbilityTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTextTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTitleTextTooltip"); } catch (error) {}
    }

    function hideNativeTooltipBurst() {
        hideNativeTooltip();
        $.Schedule(0.0, hideNativeTooltip);
        $.Schedule(0.03, hideNativeTooltip);
        $.Schedule(0.08, hideNativeTooltip);
    }

    function hideCustomTooltip() {
        activeAbilityIndex = -1;
        activeAbilityName = "";
        activeSourcePanel = null;
        activeItemSlot = -1;
        activeItemPanel = null;
        var tooltip = byId("CustomAbilityTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
        hideNativeTooltip();
    }

    function addField(container, label, value) {
        if (value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("AbilityFieldRow");
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("AbilityFieldLabel");
        left.text = label;
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("AbilityFieldValue");
        right.text = String(value);
    }

    function render(abilityIndex, abilityName, sourcePanel) {
        var definition = CustomNetTables.GetTableValue(
            "survival_ability_data",
            abilityName
        );
        if (!definition) return false;
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips",
            definition.tooltip_id || ("ability:" + abilityName)
        ) || {};

        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
        if (runtime.removed === 1) runtime = {};

        var tooltip = byId("CustomAbilityTooltip");
        var fields = byId("CustomAbilityFields");
        var icon = byId("CustomAbilityIcon");
        if (!tooltip || !fields) return false;

        setText("CustomAbilityTitle", tooltipDefinition.name
            || definition.abilityname || abilityName);
        setText("CustomAbilityLevel", runtime.current_level !== undefined
            ? "【等级】 " + runtime.current_level : "");
        var description = runtime.upgrade_description || tooltipDefinition.desc
            || definition.abilitydesc || "";
        if ((abilityName === "ability_upgrade_tower_lv01"
            || abilityName === "ability_upgrade_tower_max")
            && runtime.upgrade_attack_delta !== undefined) {
            description = "升级后提升攻击力 +" + runtime.upgrade_attack_delta;
        }
        setText("CustomAbilityDescription", description);

        var goldCost = runtime.cost_gold !== undefined
            ? runtime.cost_gold : Number(tooltipDefinition.needgold || 0);
        var woodCost = runtime.cost_wood !== undefined
            ? runtime.cost_wood : Number(tooltipDefinition.needwood || 0);
        var hasCost = goldCost > 0 || woodCost > 0;
        var costRow = byId("CustomAbilityCostRow");
        if (costRow) costRow.SetHasClass("Hidden", !hasCost);
        setText("CustomAbilityGoldCost", goldCost);
        setText("CustomAbilityWoodCost", woodCost);

        fields.RemoveAndDeleteChildren();
        addField(fields, "状态", runtime.status_text);

        tooltip.SetHasClass(
            "Unavailable",
            runtime.available === 0 || runtime.can_afford === 0
        );
        tooltip.RemoveClass("Hidden");
        hideNativeTooltip();

        $.Schedule(0.0, function () {
            if (activeAbilityIndex !== abilityIndex) return;
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner) positioner.PlaceAbove(tooltip, sourcePanel, 337, 220);
        });
        return true;
    }

    function selectedUnit() {
        try {
            var unit = Players.GetLocalPlayerPortraitUnit();
            if (unit !== undefined && unit !== -1) return unit;
        } catch (error) {}
        return Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID());
    }

    function abilityFromSlot(slot) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        try { return Entities.GetAbility(unit, slot); } catch (error) { return -1; }
    }

    function executeAbility(abilityIndex) {
        if (abilityIndex === undefined || abilityIndex < 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] reject invalid ability=", String(abilityIndex));
            return false;
        }
        var unit = selectedUnit();
        var name = "";
        var behavior = 0;
        try {
            name = Abilities.GetAbilityName(abilityIndex) || "";
            behavior = Number(Abilities.GetBehavior(abilityIndex) || 0);
        } catch (error) {}
        if ((behavior & 16) !== 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_BEGIN unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
            var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput;
            if (pointInput && pointInput.Begin) return pointInput.Begin(abilityIndex);
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_NO_INPUT_HANDLER");
            return false;
        }
        $.Msg("[SURVIVAL_CAST][TOOLTIP] SEND_NO_TARGET unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_request", {
            entindex: unit,
            ability_entindex: abilityIndex,
        });
        return true;
    }

    GameUI.CustomUIConfig().SurvivalAbilityInput = {
        ExecuteAbility: executeAbility
    };

    function showSlot(slot, sourcePanel) {
        activeItemSlot = -1;
        activeItemPanel = null;
        var abilityIndex = abilityFromSlot(slot);
        if (abilityIndex === undefined || abilityIndex < 0) return;
        var abilityName = Abilities.GetAbilityName(abilityIndex);
        if (!abilityName) return;

        activeAbilityIndex = abilityIndex;
        activeAbilityName = abilityName;
        activeSourcePanel = sourcePanel;
        if (!render(abilityIndex, abilityName, sourcePanel)) {
            activeAbilityIndex = -1;
            activeAbilityName = "";
            activeSourcePanel = null;
            try {
                $.DispatchEvent("DOTAShowAbilityTooltip", sourcePanel, abilityName);
            } catch (error) {}
        }
    }

    function slotFromPanel(panel) {
        var id = panel && panel.id ? panel.id : "";
        var match = id.match(/^Ability([0-9]+)$/);
        return match ? Number(match[1]) : -1;
    }

    function inventorySlot(panel) {
        var id = panel && panel.id ? panel.id : "";
        var match = id.match(/(?:inventory_slot_|inventoryslot)([0-9]+)/i);
        return match ? Number(match[1]) : -1;
    }

    function showItemSlot(slot, panel) {
        if (!panel || (panel.IsValid && !panel.IsValid())) {
            hideCustomTooltip();
            return;
        }
        var unit = selectedUnit();
        var item = unit >= 0 ? Entities.GetItemInSlot(unit, slot) : -1;
        if (item === undefined || item < 0) {
            hideCustomTooltip();
            return;
        }
        var name = Abilities.GetAbilityName(item);
        if (!name) {
            hideCustomTooltip();
            return;
        }
        activeAbilityIndex = -1;
        activeAbilityName = "";
        activeSourcePanel = null;
        activeItemSlot = slot;
        activeItemPanel = panel;
        hideNativeTooltip();
        var definition = CustomNetTables.GetTableValue(
            "survival_item_tooltips",
            name
        );
        var tooltipId = definition && definition.tooltip_id
            ? definition.tooltip_id : ("inventory_item:" + name);
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips",
            tooltipId
        ) || {};
        var title = tooltipDefinition.name
            || (definition ? definition.name : name);
        var description = tooltipDefinition.desc
            || (definition ? definition.description : "");
        var tooltip = byId("CustomAbilityTooltip");
        var fields = byId("CustomAbilityFields");
        if (!tooltip || !fields) return;
        setText("CustomAbilityTitle", title);
        setText("CustomAbilityDescription", description);
        fields.RemoveAndDeleteChildren();
        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (activeItemSlot !== slot || activeItemPanel !== panel) return;
            hideNativeTooltip();
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner) positioner.PlaceAbove(tooltip, panel, 337, 220);
        });
    }

    function bindPanel(panel) {
        if (!panel || panel.BHasClass("SurvivalTooltipBound")) return;
        var slot = slotFromPanel(panel);
        var itemSlot = inventorySlot(panel);
        if (slot < 0 && itemSlot < 0) return;
        panel.AddClass("SurvivalTooltipBound");
        panel.hittest = true;
        panel.SetPanelEvent("onmouseover", function () {
            hideNativeTooltipBurst();
            if (itemSlot >= 0) showItemSlot(itemSlot, panel);
            else showSlot(slot, panel);
        });
        panel.SetPanelEvent("onmouseout", function () {
            hideCustomTooltip();
            var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
            if (tooltip) tooltip.Hide();
        });
        if (slot >= 0) {
            panel.SetPanelEvent("onactivate", function () {
                var abilityIndex = abilityFromSlot(slot);
                if (abilityIndex === undefined || abilityIndex < 0) return;
                var input = GameUI.CustomUIConfig().SurvivalAbilityInput;
                if (input && input.ExecuteAbility) input.ExecuteAbility(abilityIndex);
            });
        }
    }

    function scan(panel) {
        if (!panel) return;
        bindPanel(panel);
        var count = panel.GetChildCount();
        for (var index = 0; index < count; index++) scan(panel.GetChild(index));
    }

    function hudRoot() {
        var panel = $.GetContextPanel();
        while (panel && panel.GetParent()) panel = panel.GetParent();
        return panel;
    }

    function refreshBindings() {
        var root = hudRoot();
        // Inventory is a sibling of the ability bar in Valve's HUD, so scan
        // the entire HUD root instead of only the abilities container.
        scan(root);
        $.Schedule(0.75, refreshBindings);
    }

    function refreshVisible() {
        if (activeAbilityIndex >= 0 && activeAbilityName && activeSourcePanel) {
            render(activeAbilityIndex, activeAbilityName, activeSourcePanel);
        } else if (activeItemSlot >= 0 && activeItemPanel) {
            showItemSlot(activeItemSlot, activeItemPanel);
        }
        $.Schedule(0.15, refreshVisible);
    }

    refreshBindings();
    refreshVisible();
})();
