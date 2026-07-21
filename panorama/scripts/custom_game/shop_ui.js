(function () {
    "use strict";

    var snapshot = null;
    var selectedShopId = "";
    var latestSequence = 0;
    var closeBound = false;

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
        setLoading(true);
        setStatus("正在同步服务器商店……", false);
        GameEvents.SendCustomGameEventToServer("ui_shop_open_request", {
            request_id: requestId("shop_open"),
            known_sequence: latestSequence
        });
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
        hideValveShopWindow();
        if (!byId("CustomShopWindow")) return;
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
    }

    function createCost(parent, iconItem, value) {
        var block = $.CreatePanel("Panel", parent, "");
        block.AddClass("ShopCardCostBlock");
        var icon = $.CreatePanel("DOTAItemImage", block, "");
        icon.AddClass("ShopCardCostIcon");
        icon.itemname = iconItem;
        var label = $.CreatePanel("Label", block, "");
        label.AddClass("ShopCardCostValue");
        label.text = formatNumber(value);
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

    function renderItems() {
        var list = byId("ShopItemList");
        if (!list || !snapshot) return;
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (tooltip) tooltip.Hide();
        list.RemoveAndDeleteChildren();

        var entries = asArray(snapshot.entries).filter(function (entry) {
            return entry && entry.visible === 1 && entry.shop_id === selectedShopId;
        });
        entries.sort(function (a, b) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        });

        entries.forEach(function (entry) {
            var card = $.CreatePanel("Panel", list, "");
            card.AddClass("ShopShelfSlot");
            card.SetHasClass("Unavailable", entry.purchasable !== 1);
            card.SetHasClass("Technology", entry.content_type === "technology");
            card.SetAttributeString("entry_id", entry.entry_id || "");

            var frame = $.CreatePanel("Panel", card, "");
            frame.AddClass("ShopItemFrame");
            createEntryIcon(frame, entry, "ShopItemIcon");

            var name = $.CreatePanel("Label", card, "");
            name.AddClass("ShopItemName");
            name.text = entry.name || entry.content_id;

            var costs = $.CreatePanel("Panel", card, "");
            costs.AddClass("ShopCardCostRow");
            createCost(costs, "item_ironwood_tree", entry.wood_cost);
            createCost(costs, "item_hand_of_midas", entry.gold_cost);

            var status = $.CreatePanel("Label", card, "");
            status.AddClass("ShopItemAvailability");
            status.text = entry.purchasable === 1
                ? "右键购买"
                : (entry.disabled_reason || "不可购买");

            card.SetPanelEvent("onmouseover", function () {
                if (tooltip) tooltip.Show(entry, card);
            });
            card.SetPanelEvent("onmouseout", function () {
                if (tooltip) tooltip.Hide();
            });
            card.SetPanelEvent("oncontextmenu", function () {
                purchase(entry);
            });
        });

        if (entries.length === 0) {
            var empty = $.CreatePanel("Label", list, "");
            empty.AddClass("ShopEmptyLabel");
            empty.text = "该分类当前没有可显示内容";
        }
    }

    function selectShop(shopId) {
        selectedShopId = shopId;
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
        list.RemoveAndDeleteChildren();
        var categories = asArray(snapshot.categories);
        categories.sort(function (a, b) { return (a.order || 0) - (b.order || 0); });

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

    function onSnapshot(payload) {
        if (!payload) return;
        var sequence = Number(payload.sequence || 0);
        if (sequence > 0 && sequence < latestSequence) return;
        latestSequence = Math.max(latestSequence, sequence);
        snapshot = payload;
        setLoading(false);
        renderResources();
        renderCategories();
        setStatus("商店数据已同步", false);
    }

    function onResult(payload) {
        if (!payload) return;
        if (payload.operation === "shop_open" && payload.success !== 1) {
            setLoading(false);
            setStatus("商店同步失败：" + (payload.error || "未知错误"), true);
            return;
        }
        if (payload.operation !== "shop_purchase") return;
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
    GameEvents.Subscribe("ui_operation_result", onResult);
    GameUI.CustomUIConfig().SurvivalShop = {
        Open: open,
        Close: close,
        Toggle: toggle,
        Refresh: refresh
    };
    setOpenState(false);
})();
