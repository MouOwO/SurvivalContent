(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var activeSlot = -1;
    var activePanel = null;
    var activeItem = -1;
    var boundPanels = {};

    function byId(id) { return $("#" + id); }

    function rootPanel() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        return root;
    }

    function selectedUnit() {
        try {
            var portrait = Players.GetLocalPlayerPortraitUnit();
            if (portrait !== undefined && portrait >= 0) return portrait;
        } catch (error) {}
        return Players.GetPlayerHeroEntityIndex(playerId);
    }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return value[key]; });
    }

    function setText(id, value) {
        var target = byId(id);
        if (target) target.text = String(value === undefined ? "" : value);
    }

    function localize(key, fallback) {
        var value = "";
        try { value = $.Localize("#" + key); } catch (error) {}
        return !value || value === "#" + key ? (fallback || "") : value;
    }

    function hideNativeTooltip(panel) {
        var owners = [panel, $.GetContextPanel()];
        var current = panel;
        for (var depth = 0; current && depth < 6; depth++) {
            owners.push(current);
            current = current.GetParent ? current.GetParent() : null;
        }
        owners.forEach(function (owner) {
            if (!owner) return;
            try { $.DispatchEvent("DOTAHideAbilityTooltip", owner); } catch (error) {}
            try { $.DispatchEvent("DOTAHideItemTooltip", owner); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTextTooltip", owner); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTitleTextTooltip", owner); } catch (error) {}
        });
        try { $.DispatchEvent("DOTAHideAbilityTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideItemTooltip"); } catch (error) {}
    }

    function hide() {
        activeSlot = -1;
        activePanel = null;
        activeItem = -1;
        var tooltip = byId("CustomInventoryItemTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function addField(container, label, value) {
        if (!container || value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("InventoryItemFieldRow");
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("InventoryItemFieldLabel");
        left.text = String(label || "");
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("InventoryItemFieldValue");
        right.text = String(value);
    }

    function itemView(contentId) {
        var snapshot = CustomNetTables.GetTableValue(
            "survival_weapon_snapshot", String(playerId)
        ) || {};
        var viewModel = snapshot.tooltip_view_model || {};
        var items = viewModel.items || {};
        return items[contentId] || {};
    }

    function render(slot, panel) {
        if (!panel || (panel.IsValid && !panel.IsValid())) {
            hide();
            return;
        }
        var unit = selectedUnit();
        var item = unit >= 0 ? Entities.GetItemInSlot(unit, slot) : -1;
        if (item === undefined || item < 0) {
            hide();
            return;
        }
        var itemName = "";
        try { itemName = Abilities.GetAbilityName(item) || ""; } catch (error) {}
        if (!itemName) {
            hide();
            return;
        }

        var identity = CustomNetTables.GetTableValue(
            "survival_inventory_item_identity", String(item)
        ) || {};
        var contentId = identity.removed !== 1 && identity.content_id
            ? String(identity.content_id) : itemName;
        var definition = CustomNetTables.GetTableValue(
            "survival_item_tooltips", contentId
        ) || CustomNetTables.GetTableValue(
            "survival_item_tooltips", itemName
        ) || {};
        var dynamic = itemView(contentId);
        var tooltip = byId("CustomInventoryItemTooltip");
        var fields = byId("CustomInventoryItemFields");
        var icon = byId("CustomInventoryItemIcon");
        if (!tooltip || !fields) return;

        activeSlot = slot;
        activePanel = panel;
        activeItem = item;
        hideNativeTooltip(panel);
        [0.0, 0.05].forEach(function (delay) {
            $.Schedule(delay, function () {
                if (activeSlot === slot && activePanel === panel && activeItem === item) {
                    hideNativeTooltip(panel);
                }
            });
        });
        if (icon) icon.itemname = itemName;
        setText("CustomInventoryItemTitle", definition.displayname
            || definition.name
            || localize("DOTA_Tooltip_ability_" + itemName, itemName));
        setText("CustomInventoryItemType", definition.item_type || "物品");
        setText("CustomInventoryItemLevel", definition.level_text || "");
        setText("CustomInventoryItemDescription", definition.description
            || localize("DOTA_Tooltip_ability_" + itemName + "_Description", ""));

        fields.RemoveAndDeleteChildren();
        asArray(definition.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        asArray(dynamic.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        var quantity = Number(dynamic.quantity || 0);
        setText("CustomInventoryItemStatus", quantity > 1
            ? ("持有数量：" + String(quantity))
            : (contentId !== itemName ? "项目物品 · 实例数据已同步" : "背包物品"));

        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (activeSlot !== slot || activePanel !== panel || activeItem !== item) return;
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner && positioner.PlaceAbove) {
                positioner.PlaceAbove(tooltip, panel, 350, 240);
            }
        });
    }

    function inventoryRoot() {
        var root = rootPanel();
        if (!root || !root.FindChildTraverse) return null;
        return root.FindChildTraverse("inventory")
            || root.FindChildTraverse("InventoryContainer")
            || root.FindChildTraverse("inventory_items");
    }

    function findSlot(inventory, slot) {
        if (!inventory || !inventory.FindChildTraverse) return null;
        return inventory.FindChildTraverse("inventory_slot_" + String(slot))
            || inventory.FindChildTraverse("inventoryslot" + String(slot))
            || inventory.FindChildTraverse("InventorySlot" + String(slot));
    }

    function bindSlot(panel, slot) {
        if (!panel) return;
        boundPanels[slot] = panel;
        function bindHoverSource(source) {
            if (!source) return;
            source.SetPanelEvent("onmouseover", function () { render(slot, panel); });
            source.SetPanelEvent("onmouseout", function () {
                if (activePanel === panel) hide();
                hideNativeTooltip(panel);
                $.Schedule(0.0, function () { recover("slot_mouseout"); });
                $.Schedule(0.2, function () { recover("slot_mouseout_deferred"); });
            });
        }
        bindHoverSource(panel);
        function bindItemImages(parent) {
            var children = parent && parent.Children ? parent.Children() : [];
            children.forEach(function (child) {
                if (child.paneltype === "DOTAItemImage") bindHoverSource(child);
                bindItemImages(child);
            });
        }
        bindItemImages(panel);
    }

    function recover(reason) {
        var inventory = inventoryRoot();
        if (!inventory) return;
        for (var slot = 0; slot < 6; slot++) bindSlot(findSlot(inventory, slot), slot);
        $.Msg("[SURVIVAL_INVENTORY_TOOLTIP] bindings recovered reason=",
            String(reason || "unknown"));
    }

    function refreshVisible() {
        if (activeSlot >= 0 && activePanel) render(activeSlot, activePanel);
    }

    GameUI.CustomUIConfig().SurvivalInventoryTooltip = {
        Recover: recover,
        RefreshVisible: refreshVisible,
        Hide: hide
    };

    CustomNetTables.SubscribeNetTableListener(
        "survival_inventory_item_identity",
        function () {
            recover("item_identity_changed");
            refreshVisible();
        }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_item_tooltips",
        function () { refreshVisible(); }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_weapon_snapshot",
        function (tableName, key) {
            if (Number(key) === Number(playerId)) {
                recover("weapon_snapshot_changed");
                refreshVisible();
            }
        }
    );
    GameEvents.Subscribe("ui_weapon_synthesis_snapshot", function () {
        recover("weapon_snapshot_event");
        refreshVisible();
    });

    [0.0, 0.1, 0.35, 1.0].forEach(function (delay) {
        $.Schedule(delay, function () { recover("initial_" + String(delay)); });
    });
})();