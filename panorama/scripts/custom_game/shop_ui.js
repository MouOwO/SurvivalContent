(function () {
    "use strict";

    var snapshot = null;
    var selectedShopId = "";
    var latestSequence = 0;
    var closeBound = false;
    var currentMode = "shop";
    var researchSourceEntindex = -1;
    var unlocks = { shop: false, research: false };
    var entryCardsById = {};
    var renderedStructureSignature = "";
    var renderedCategorySignature = "";

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

    function setStatus(text, error) {
        var target = byId("ShopStatus");
        if (!target) return;
        target.text = text || "";
        target.SetHasClass("error", !!error);
    }

    function setLoading(loading) {
        var loadingPanel = byId("ShopLoading");
        var itemList = byId("ShopItemList");
        if (loadingPanel) loadingPanel.SetHasClass("Hidden", !loading);
        if (itemList) itemList.SetHasClass("Hidden", loading);
    }

    function disableValveShop() {
        try {
            if (!GameUI.SetDefaultUIEnabled
                || typeof DotaDefaultUIElement_t === "undefined") return;
            var inventoryShop =
                DotaDefaultUIElement_t.DOTA_DEFAULT_UI_INVENTORY_SHOP;
            var suggestedItems =
                DotaDefaultUIElement_t.DOTA_DEFAULT_UI_SHOP_SUGGESTEDITEMS;
            if (inventoryShop !== undefined) {
                GameUI.SetDefaultUIEnabled(inventoryShop, false);
            }
            if (suggestedItems !== undefined) {
                GameUI.SetDefaultUIEnabled(suggestedItems, false);
            }
        } catch (error) {
            $.Msg("[SurvivalShop] disable Valve shop failed: ", error);
        }
    }

    function hideValveShopWindow() {
        try { $.DispatchEvent("DOTAShopHideShop"); } catch (error) {}
    }

    function requestId(prefix) {
        return prefix + "_" + Date.now() + "_"
            + Math.floor(Math.random() * 100000);
    }

    function requestSnapshot() {
        // Keep existing cards alive during an in-place refresh. Hiding the list
        // dismisses Panorama hover state even when the server changes only gold.
        setLoading(!snapshot || snapshot.ui_mode !== currentMode);
        setStatus(
            currentMode === "research"
                ? "正在同步研究所科技……"
                : "正在同步服务器商店……",
            false
        );
        GameEvents.SendCustomGameEventToServer("ui_shop_open_request", {
            request_id: requestId("shop_open"),
            known_sequence: latestSequence,
            mode: currentMode,
            source_entindex: researchSourceEntindex
        });
    }

    function updateModeText() {
        var research = currentMode === "research";
        setText("ShopTitle", research ? "研究所" : "生存商店");
        setText(
            "ShopSubtitle",
            research
                ? "建筑与工人科技 · 升级由服务器校验"
                : "英雄物品与英雄科技 · 每次打开均从服务器同步"
        );
        var shopToggle = byId("ShopModeShop");
        var researchToggle = byId("ShopModeResearch");
        if (shopToggle) shopToggle.SetHasClass("Selected", !research);
        if (researchToggle) {
            researchToggle.SetHasClass("Selected", research);
            researchToggle.SetHasClass("Disabled", !unlocks.research);
            researchToggle.enabled = unlocks.research;
        }
    }

    function setOpenState(opened) {
        var windowPanel = byId("CustomShopWindow");
        var backdrop = byId("ShopBackdrop");
        if (windowPanel) {
            windowPanel.SetHasClass("ShopOpen", opened);
            windowPanel.SetHasClass("Closed", !opened);
            windowPanel.SetHasClass("Hidden", false);
            windowPanel.hittest = opened;
        }
        if (backdrop) {
            backdrop.SetHasClass("ShopOpen", opened);
            backdrop.SetHasClass("Hidden", false);
            backdrop.hittest = opened;
        }
    }

    function open() {
        if (!unlocks.shop) return;
        currentMode = "shop";
        researchSourceEntindex = -1;
        hideValveShopWindow();
        if (!byId("CustomShopWindow")) return;
        updateModeText();
        setOpenState(true);
        requestSnapshot();
    }

    function openResearch(sourceEntindex) {
        if (!unlocks.research) return;
        currentMode = "research";
        researchSourceEntindex = Number(sourceEntindex || -1);
        hideValveShopWindow();
        if (!byId("CustomShopWindow")) return;
        updateModeText();
        setOpenState(true);
        requestSnapshot();
    }

    function close() {
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (tooltip) tooltip.Hide();
        setOpenState(false);
        GameEvents.SendCustomGameEventToServer("ui_shop_close_request", {
            request_id: requestId("shop_close")
        });
    }

    function toggle() {
        var windowPanel = byId("CustomShopWindow");
        // The drawer is intentionally never Hidden; its visual state is driven by ShopOpen.
        if (!windowPanel || !windowPanel.BHasClass("ShopOpen")) open();
        else close();
    }

    function toggleShop() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && windowPanel.BHasClass("ShopOpen")
            && currentMode === "shop") close();
        else open();
    }

    function toggleResearch() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && windowPanel.BHasClass("ShopOpen")
            && currentMode === "research") close();
        else openResearch(-1);
    }

    function setUnlocks(value) {
        unlocks = value || unlocks;
        updateModeText();
    }

    function refresh() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && !windowPanel.BHasClass("Hidden")) requestSnapshot();
    }

    function createEntryIcon(parent, entry, className) {
        var panel;
        if (entry.icon_type === "ability") {
            panel = $.CreatePanel("DOTAAbilityImage", parent, "");
            panel.abilityname = entry.icon || "ability_upgrade_wall";
        } else {
            panel = $.CreatePanel("DOTAItemImage", parent, "");
            panel.itemname = entry.icon || "item_branches";
        }
        panel.AddClass(className);
        panel.hittest = false;
        panel.hittestchildren = false;
    }

    function purchase(entry) {
        if (!entry || entry.purchasable !== 1) {
            setStatus(
                "当前不可购买：" + ((entry && entry.disabled_reason) || "条件不满足"),
                true
            );
            return;
        }
        setStatus("正在购买 " + entry.name + "……", false);
        GameEvents.SendCustomGameEventToServer("ui_shop_purchase_request", {
            request_id: requestId("shop_buy"),
            entry_id: entry.entry_id
        });
    }

    function entryById(entryId) {
        var entries = asArray(snapshot && snapshot.entries);
        for (var index = 0; index < entries.length; index++) {
            if (entries[index] && entries[index].entry_id === entryId) return entries[index];
        }
        return null;
    }

    function updateEntryCard(card, entry) {
        if (!card || !entry) return;
        card.SetHasClass("Unavailable", entry.purchasable !== 1);
        card.SetHasClass("Technology", entry.content_type === "technology");
    }

    function updateVisibleEntryCards(changedIds) {
        Object.keys(changedIds || {}).forEach(function (entryId) {
            var card = entryCardsById[entryId];
            if (card && card.IsValid && card.IsValid()) {
                updateEntryCard(card, entryById(entryId));
            }
        });
    }

    function entriesFor(data, shopId) {
        var entries = asArray(data && data.entries).filter(function (entry) {
            return entry && entry.visible === 1 && entry.shop_id === shopId;
        });
        entries.sort(function (a, b) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
        return entries;
    }

    function visibleEntries() {
        var entries = asArray(snapshot && snapshot.entries).filter(function (entry) {
            return entry && entry.visible === 1 && entry.shop_id === selectedShopId;
        });
        entries.sort(function (a, b) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
        return entries;
    }

    function structureSignature(entries) {
        return selectedShopId + "|" + entries.map(function (entry) {
            return [
                entry.entry_id,
                entry.shop_id,
                entry.sort_order,
                entry.content_type,
                entry.technology_track,
                entry.content_id,
                entry.icon_type,
                entry.icon
            ].join(":");
        }).join("|");
    }

    function categorySignature(categoriesValue) {
        var categories = asArray(categoriesValue);
        categories.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        return categories.map(function (category) {
            return category.shopid + ":" + category.shopname + ":" + category.order;
        }).join("|");
    }

    function compareFullSnapshot(previous, current) {
        var previousById = {};
        var changedIds = {};
        asArray(previous.entries).forEach(function (entry) {
            if (entry && entry.entry_id) previousById[entry.entry_id] = entry;
        });
        asArray(current.entries).forEach(function (entry) {
            if (!entry || !entry.entry_id) return;
            if (!previousById[entry.entry_id]
                || JSON.stringify(previousById[entry.entry_id]) !== JSON.stringify(entry)) {
                changedIds[entry.entry_id] = true;
            }
            delete previousById[entry.entry_id];
        });
        Object.keys(previousById).forEach(function (entryId) {
            changedIds[entryId] = true;
        });
        return {
            categories: categorySignature(previous.categories)
                !== categorySignature(current.categories),
            structural: structureSignature(entriesFor(previous, selectedShopId))
                !== structureSignature(entriesFor(current, selectedShopId)),
            changedIds: changedIds
        };
    }

    function renderItems() {
        var list = byId("ShopItemList");
        if (!list || !snapshot) return;
        var entries = visibleEntries();
        var nextSignature = structureSignature(entries);
        if (nextSignature === renderedStructureSignature) return;
        renderedStructureSignature = nextSignature;
        entryCardsById = {};
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (tooltip) tooltip.Hide();
        list.RemoveAndDeleteChildren();

        var lastTechnologyTrack = "";
        entries.forEach(function (entry) {
            if (entry.content_type === "technology"
                && entry.technology_track !== lastTechnologyTrack) {
                lastTechnologyTrack = entry.technology_track;
                var section = $.CreatePanel("Label", list, "");
                section.AddClass("ShopTechnologySectionTitle");
                section.text = entry.technology_track === "advanced_researcher"
                    ? "高级研究员科技"
                    : (entry.technology_track === "advanced"
                        ? "高级科技"
                        : "普通科技");
            }
            var card = $.CreatePanel("Panel", list, "");
            card.AddClass("ShopShelfSlot");
            card.SetHasClass("Unavailable", entry.purchasable !== 1);
            card.SetHasClass("Technology", entry.content_type === "technology");
            card.SetAttributeString("entry_id", entry.entry_id || "");
            entryCardsById[entry.entry_id] = card;

            var frame = $.CreatePanel("Panel", card, "");
            frame.AddClass("ShopItemFrame");
            createEntryIcon(frame, entry, "ShopItemIcon");

            card.SetPanelEvent("onmouseover", function () {
                var current = entryById(card.GetAttributeString("entry_id", ""));
                if (tooltip && current) tooltip.Show(current, card);
            });
            card.SetPanelEvent("onmouseout", function () {
                if (tooltip) tooltip.Hide();
            });
            card.SetPanelEvent("oncontextmenu", function () {
                purchase(entryById(card.GetAttributeString("entry_id", "")));
            });
        });

        if (entries.length === 0) {
            var empty = $.CreatePanel("Label", list, "");
            empty.AddClass("ShopEmptyLabel");
            empty.text = "该分类当前没有可显示内容";
        }
    }

    function selectShop(shopId) {
        var changed = selectedShopId !== shopId;
        selectedShopId = shopId;
        if (changed) renderedStructureSignature = "";
        var list = byId("ShopCategoryList");
        if (list) {
            for (var index = 0; index < list.GetChildCount(); index++) {
                var child = list.GetChild(index);
                child.SetHasClass(
                    "Selected",
                    child.GetAttributeString("shop_id", "") === shopId
                );
            }
        }
        renderItems();
    }

    function renderCategories() {
        var list = byId("ShopCategoryList");
        if (!list || !snapshot) return;
        var categories = asArray(snapshot.categories);
        categories.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
        var nextSignature = categorySignature(categories);

        if (nextSignature === renderedCategorySignature) {
            var stillExists = categories.some(function (category) {
                return category.shopid === selectedShopId;
            });
            if (!stillExists) {
                selectedShopId = categories.length > 0 ? categories[0].shopid : "";
            }
            selectShop(selectedShopId);
            return;
        }
        renderedCategorySignature = nextSignature;
        list.RemoveAndDeleteChildren();

        categories.forEach(function (category) {
            var button = $.CreatePanel("Button", list, "");
            button.AddClass("ShopCategoryButton");
            button.SetAttributeString("shop_id", category.shopid);
            var label = $.CreatePanel("Label", button, "");
            label.text = category.shopname || category.shopid;
            button.SetPanelEvent("onactivate", function () {
                selectShop(category.shopid);
            });
        });

        var exists = categories.some(function (category) {
            return category.shopid === selectedShopId;
        });
        if (!exists) selectedShopId = categories.length > 0 ? categories[0].shopid : "";
        selectShop(selectedShopId);
    }

    function renderResources() {
        var resources = snapshot && snapshot.resources || {};
        setText(
            "ShopResourceSummary",
            "木材 " + formatNumber(resources.wood)
                + " · 金币 " + formatNumber(resources.gold)
        );
    }

    function mergePatch(payload) {
        if (!snapshot || Number(payload.base_sequence || 0) !== latestSequence) {
            requestSnapshot();
            return null;
        }
        var previousById = {};
        asArray(snapshot.entries).forEach(function (entry) {
            if (entry && entry.entry_id) previousById[entry.entry_id] = entry;
        });
        var structural = false;
        var changedIds = {};
        asArray(payload.removed_entry_ids).forEach(function (entryId) {
            var previous = previousById[entryId];
            if (previous && previous.shop_id === selectedShopId) structural = true;
            delete previousById[entryId];
        });
        asArray(payload.changed_entries).forEach(function (entry) {
            if (!entry || !entry.entry_id) return;
            var previous = previousById[entry.entry_id];
            if (!previous
                || previous.shop_id !== entry.shop_id
                || previous.sort_order !== entry.sort_order
                || previous.content_type !== entry.content_type
                || previous.technology_track !== entry.technology_track) {
                if ((!previous || previous.shop_id === selectedShopId)
                    || entry.shop_id === selectedShopId) structural = true;
            }
            previousById[entry.entry_id] = entry;
            changedIds[entry.entry_id] = true;
        });
        snapshot.entries = Object.keys(previousById).map(function (entryId) {
            return previousById[entryId];
        });
        if (payload.resources) snapshot.resources = payload.resources;
        if (payload.categories) snapshot.categories = payload.categories;
        snapshot.sequence = payload.sequence;
        snapshot.reason = payload.reason;
        snapshot.ui_mode = payload.ui_mode || snapshot.ui_mode;
        return {
            structural: structural,
            categories: !!payload.categories,
            changedIds: changedIds
        };
    }

    function onSnapshot(payload) {
        if (!payload) return;
        var sequence = Number(payload.sequence || 0);
        if (sequence > 0 && sequence <= latestSequence) return;
        var patchResult = null;
        if (payload.full === 0) {
            patchResult = mergePatch(payload);
            if (!patchResult) return;
        } else {
            if (snapshot && snapshot.ui_mode === payload.ui_mode) {
                patchResult = compareFullSnapshot(snapshot, payload);
            }
            snapshot = payload;
            if (!patchResult) {
                renderedCategorySignature = "";
                renderedStructureSignature = "";
            }
        }
        latestSequence = Math.max(latestSequence, sequence);
        currentMode = payload.ui_mode === "research" ? "research" : "shop";
        updateModeText();
        setLoading(false);
        if (!patchResult || payload.resources) renderResources();
        if (!patchResult || patchResult.categories) {
            renderCategories();
        } else if (patchResult.structural) {
            renderItems();
        } else {
            updateVisibleEntryCards(patchResult.changedIds);
        }
        setStatus(
            currentMode === "research"
                ? "研究所科技已同步"
                : "商店数据已同步",
            false
        );
    }

    function onForceOpen(payload) {
        if (!payload || payload.success !== 1) {
            setStatus(
                "研究所打开失败：" + (payload && payload.error || "未知错误"),
                true
            );
            return;
        }
        currentMode = "research";
        researchSourceEntindex = Number(payload.source_entindex || -1);
        hideValveShopWindow();
        updateModeText();
        setOpenState(true);
        onSnapshot(payload.snapshot || {});
    }

    function focusHero(payload) {
        var camera = GameUI.CustomUIConfig().SurvivalCamera;
        if (camera && camera.FollowHeroUntilArrival) {
            camera.FollowHeroUntilArrival(payload || {});
            return;
        }
        var target = Number(payload && payload.focus_hero_entindex || -1);
        if (target <= 0 || !GameUI.SetCameraTarget) return;
        GameUI.SetCameraTarget(target);
        $.Schedule(5.0, function () { GameUI.SetCameraTarget(-1); });
    }

    function onResult(payload) {
        if (!payload) return;
        if (payload.operation === "shop_open" && payload.success !== 1) {
            setLoading(false);
            setStatus("商店同步失败：" + (payload.error || "未知错误"), true);
            return;
        }
        if (payload.operation !== "shop_purchase") return;
        if (payload.success === 1
            && Number(payload.close_shop_and_focus_hero || 0) === 1) {
            close();
            focusHero(payload);
            return;
        }
        setStatus(
            payload.success === 1
                ? "购买成功，正在刷新商店状态……"
                : ("购买失败：" + (payload.error || "未知错误")),
            payload.success !== 1
        );
    }

    function bindNativeShopOpen() {
        try {
            $.RegisterForUnhandledEvent("DOTAHUDShopOpened", function () {
                hideValveShopWindow();
                open();
            });
        } catch (error) {
            $.Msg("[SurvivalShop] native shop event hook unavailable: ", error);
        }
    }

    disableValveShop();
    bindNativeShopOpen();
    function bindCloseSurfaces() {
        if (closeBound) return;
        var backdropClick = byId("ShopBackdropClick");
        var closeButton = byId("ShopCloseButton");
        if (!backdropClick || !closeButton) return;
        closeBound = true;
        backdropClick.hittest = true;
        backdropClick.SetPanelEvent("onactivate", close);
        closeButton.hittest = true;
        closeButton.SetPanelEvent("onactivate", close);
    }
    bindCloseSurfaces();
    GameEvents.Subscribe("ui_shop_snapshot", onSnapshot);
    GameEvents.Subscribe("ui_shop_force_open", onForceOpen);
    GameEvents.Subscribe("ui_operation_result", onResult);
    GameUI.CustomUIConfig().SurvivalShop = {
        Open: open,
        OpenResearch: openResearch,
        Close: close,
        Toggle: toggle,
        ToggleShop: toggleShop,
        ToggleResearch: toggleResearch,
        SetUnlocks: setUnlocks,
        Refresh: refresh
    };
    setUnlocks(GameUI.CustomUIConfig().SurvivalShopUnlocks || unlocks);
    setOpenState(false);
})();
