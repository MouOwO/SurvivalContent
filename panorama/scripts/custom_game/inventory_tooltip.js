(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var activeSlot = -1;
    var activePanel = null;
    var activeItem = -1;
    var boundPanels = {}, activeContentId = "", activeItemName = "";
    var config = GameUI.CustomUIConfig(), context = $.GetContextPanel(), api = null;
    var tooltipDismiss = null, tooltipDismissPanel = null;
    var previousTooltip = config.SurvivalInventoryTooltip;
    if (previousTooltip && previousTooltip.DisposeTooltip) previousTooltip.DisposeTooltip();
    function dismissFor(tooltip) {
        if (!config.SurvivalTooltipDismiss || !tooltip) return null;
        if (tooltipDismissPanel !== tooltip) {
            if (tooltipDismiss) tooltipDismiss.Dispose();
            tooltipDismissPanel = tooltip;
            tooltipDismiss = config.SurvivalTooltipDismiss.Create({panel:tooltip,
                hide:function () { var source = activePanel; hide(); hideNativeTooltip(source); },
                isAlive:active,
                isVisible:function () { return activePanel !== null && !tooltip.BHasClass("Hidden"); }});
        }
        return tooltipDismiss;
    }
    var updateQueued = false, queuedRecover = false, queuedVisible = false, queuedReason = "";
    var nativeRepairQueued = false;
    var refreshCounts = {identitySeen:0, identityIgnored:0, scheduled:0, coalesced:0, recovered:0, refreshed:0};
    function active() {
        return (!context.IsValid || context.IsValid()) && (!api || config.SurvivalInventoryTooltip === api);
    }
    function queueUpdate(reason, bindings, visible) {
        if (!active()) return;
        queuedRecover = queuedRecover || bindings; queuedVisible = queuedVisible || visible;
        queuedReason = reason;
        if (updateQueued) { refreshCounts.coalesced++; return; }
        updateQueued = true; refreshCounts.scheduled++;
        $.Schedule(0, function () {
            updateQueued = false;
            var bindings = queuedRecover, visible = queuedVisible, reason = queuedReason;
            queuedRecover = queuedVisible = false; queuedReason = "";
            if (!active()) return;
            if (bindings) recover(reason);
            if (visible) refreshVisible();
        });
    }
    function relevantItemKey(key) {
        var item = Number(key);
        if (!isFinite(item) || item < 0 || Math.floor(item) !== item) return false;
        if (item === Number(activeItem)) return true;
        var unit = selectedUnit();
        if (unit === undefined || unit < 0 || !Entities.GetItemInSlot) return false;
        // Identity packets intentionally carry no player/owner field. Use the
        // actual displayed inventory, including newly replicated slot contents.
        try {
            for (var slot = 0; slot < 6; slot++) if (Number(Entities.GetItemInSlot(unit, slot)) === item) return true;
        } catch (error) { return false; }
        return false;
    }

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
        if (tooltipDismiss) tooltipDismiss.Hidden();
        activeSlot = -1;
        activePanel = null;
        activeItem = -1;
        activeContentId = activeItemName = "";
        var tooltip = byId("CustomInventoryItemTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function addField(container, label, value) {
        if (!container || value === undefined || value === null || value === "") return;
        var rows = container.__fieldRows || (container.__fieldRows = []);
        var index = container.__fieldCursor || 0;
        container.__fieldCursor = index + 1;
        var row = rows[index];
        if (!row) {
            row = $.CreatePanel("Panel", container, "");
            row.AddClass("InventoryItemFieldRow");
            row.__left = $.CreatePanel("Label", row, "");
            row.__left.AddClass("InventoryItemFieldLabel");
            row.__right = $.CreatePanel("Label", row, "");
            row.__right.AddClass("InventoryItemFieldValue");
            rows[index] = row;
        }
        row.visible = true;
        row.__left.text = String(label || "");
        row.__right.text = String(value);
    }

    function itemView(contentId) {
        var snapshot = CustomNetTables.GetTableValue(
            "survival_weapon_snapshot", String(playerId)
        ) || {};
        var viewModel = snapshot.tooltip_view_model || {};
        var items = viewModel.items || {};
        return items[contentId] || {};
    }

    function updateItemIcon(icon, contentId, itemName, sources) {
        if(!icon)return;
        icon.itemname=itemName;
        var cfg=GameUI.CustomUIConfig(),resources=cfg.SurvivalItemResources;
        var registered=resources&&(resources.Lookup(contentId)||resources.Lookup(itemName));
        var art=cfg.SurvivalNativeIcons;
        var resolved=registered&&registered.uri?registered:art&&(art.Resolve(contentId)||art.Resolve(itemName));
        var fitted=icon.FindChildTraverse("InventoryTooltipFittedIcon");
        if(resolved&&!fitted){
            fitted=$.CreatePanel("Image",icon,"InventoryTooltipFittedIcon");
            fitted.hittest=false;fitted.hittestchildren=false;
            fitted.style.width="100%";fitted.style.height="100%";
            fitted.style.position="0px 0px 0px";fitted.style.zIndex="1";
            fitted.SetScaling("stretch-to-cover-preserve-aspect");
        }
        if(fitted){
            fitted.visible=!!resolved;
            if(resolved){
                fitted.SetImage(resolved.uri);
                var artwork={content_id:contentId||itemName};
                for(var i=0;i<(sources||[]).length;i++){
                    var source=sources[i];if(!source||source.quality===undefined&&source.rarity===undefined)continue;
                    ["quality","rarity"].forEach(function(field){if(source[field]!==undefined)artwork[field]=source[field];});break;
                }
                var presentation=cfg.SurvivalRewardPresentation;if(presentation&&presentation.FillIcon)presentation.FillIcon(fitted,artwork);
            }
        }
    }
    function equipmentLevelText(contentId, fallback) {
        var match=String(contentId||"").match(/^equipment_(?:attack_gloves|burning_blade|iron_armor)_(\d+|max)$/);
        return match?(match[1]==="max"?"MAX":"Lv."+Number(match[1])):(fallback||"");
    }
    function render(slot, panel) {
        if (!active()) return;
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
        var dismiss = dismissFor(tooltip);
        if (dismiss && !dismiss.CanShow(panel)) { hide(); return; }

        activeSlot = slot;
        activePanel = panel;
        activeItem = item;
        activeContentId = contentId; activeItemName = itemName;
        hideNativeTooltip(panel);
        [0.0, 0.05].forEach(function (delay) {
            $.Schedule(delay, function () {
                if (activeSlot === slot && activePanel === panel && activeItem === item) {
                    hideNativeTooltip(panel);
                }
            });
        });
        updateItemIcon(icon, contentId, itemName, [dynamic,identity.removed!==1?identity:null,definition]);
        setText("CustomInventoryItemTitle", definition.displayname
            || definition.name
            || localize("DOTA_Tooltip_ability_" + itemName, itemName));
        setText("CustomInventoryItemType", definition.item_type || "物品");
        setText("CustomInventoryItemLevel", equipmentLevelText(contentId, definition.level_text));
        var description=definition.description||localize("DOTA_Tooltip_ability_"+itemName+"_Description","");
        if(config.SurvivalItemResources&&config.SurvivalItemResources.DisplayDescription)description=config.SurvivalItemResources.DisplayDescription({content_id:contentId},description);
        setText("CustomInventoryItemDescription",description);

        fields.__fieldCursor = 0;
        (fields.__fieldRows || []).forEach(function(row) { row.visible = false; });
        asArray(definition.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        asArray(dynamic.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        var quantity = Number(dynamic.quantity || 0);
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        setText("CustomInventoryItemStatus", quantity > 1
            ? ("持有数量：" + (formatter && formatter.Format ? formatter.Format(quantity) : String(quantity)))
            : (contentId !== itemName ? "项目物品 · 实例数据已同步" : "背包物品"));

        var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
        if (positioner && positioner.PlaceInventoryAbove) {
            var inventory = inventoryRoot();
            var upperRow = findSlot(inventory, 0) || findSlot(inventory, 1)
                || findSlot(inventory, 2) || panel;
            positioner.PlaceInventoryAbove(tooltip, panel, upperRow);
        }
        tooltip.RemoveClass("Hidden");
        if (dismiss) dismiss.Shown(panel);
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
        if (!active()) return;
        refreshCounts.recovered++;
        var inventory = inventoryRoot();
        if (!inventory) return;
        for (var slot = 0; slot < 6; slot++) bindSlot(findSlot(inventory, slot), slot);
        if (GameUI.CustomUIConfig().SurvivalStatsDebug === true) $.Msg("[SURVIVAL_INVENTORY_TOOLTIP] bindings recovered reason=",
            String(reason || "unknown"));
    }

    function refreshVisible() {
        if (!active()) return;
        if (activeSlot >= 0 && activePanel) { refreshCounts.refreshed++; render(activeSlot, activePanel); }
    }

    api = config.SurvivalInventoryTooltip = {
        Recover: recover,
        RefreshVisible: refreshVisible,
        Hide: hide,
        DisposeTooltip: function () { hide(); if (tooltipDismiss) tooltipDismiss.Dispose(); },
        CacheInspect: function () {
            var counts = {}; Object.keys(refreshCounts).forEach(function (key) { counts[key] = refreshCounts[key]; });
            return {queued:updateQueued, counts:counts, scope:"actual displayed inventory keys and current hover; no account data"};
        }
    };

    CustomNetTables.SubscribeNetTableListener(
        "survival_inventory_item_identity",
        function (_, key) {
            if (!active()) return;
            refreshCounts.identitySeen++;
            if (!relevantItemKey(key)) { refreshCounts.identityIgnored++; return; }
            queueUpdate("item_identity_changed", true, true);
        }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_item_tooltips",
        function (_, key) {
            if (String(key) === activeContentId || String(key) === activeItemName)
                queueUpdate("item_tooltip_changed", false, true);
        }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_weapon_snapshot",
        function (tableName, key) {
            if (Number(key) === Number(playerId)) {
                queueUpdate("weapon_snapshot_changed", true, true);
            }
        }
    );
    GameEvents.Subscribe("ui_weapon_synthesis_snapshot", function (payload) {
        if (payload && payload.player_id !== undefined && Number(payload.player_id) !== Number(playerId)) return;
        queueUpdate("weapon_snapshot_event", true, true);
    });
    ["dota_player_update_selected_unit", "dota_player_update_query_unit", "dota_ability_changed"].forEach(function (event) {
        GameEvents.Subscribe(event, function (payload) {
            var pid = payload && (payload.PlayerID !== undefined ? payload.PlayerID
                : payload.player_id !== undefined ? payload.player_id : payload.playerid);
            if (pid !== undefined && Number(pid) !== Number(playerId)) return;
            // Selection/native row events remain independent of identity metadata.
            // Rebinding current nodes on the next frame handles native slot rebuilds.
            queueUpdate(event, true, true);
            // Native image children can follow their slot by a later frame.
            // One bounded trailing recovery covers that creation, even after
            // a burst of selection notifications; it reads the final selection.
            if (!nativeRepairQueued) {
                nativeRepairQueued = true;
                $.Schedule(0.2, function () {
                    nativeRepairQueued = false;
                    if (active()) queueUpdate("native_row_deferred", true, true);
                });
            }
        });
    });

    [0.0, 0.1, 0.35, 1.0].forEach(function (delay) {
        $.Schedule(delay, function () { recover("initial_" + String(delay)); });
    });
})();
