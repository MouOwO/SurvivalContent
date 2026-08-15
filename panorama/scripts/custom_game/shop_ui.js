(function () {
    "use strict";

    var snapshot = null;
    var latestSequence = 0;
    var closeBound = false;
    var currentMode = "shop";
    var researchSourceEntindex = -1;
    var unlocks = { shop: false, research: false };
    var entryCardsById = {};
    var renderedStructureSignature = "";
    var renderedCategorySignature = "";
    var cooldownAnimationSerial = 0;
    var pendingTechnologyPurchases = {};

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
            currentMode === "research" ? "正在同步科技……"
                : (currentMode === "challenge" ? "正在同步挑战……"
                    : "正在同步服务器商店……"),
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
        var challenge = currentMode === "challenge";
        var advancedResearch = research
            && snapshot && snapshot.research_scope === "advanced";
        setText("ShopTitle", research
            ? (advancedResearch ? "高级研究" : "科技")
            : (challenge ? "挑战" : "生存商店"));
        setText(
            "ShopSubtitle",
            research
                ? (advancedResearch
                    ? "ARS-01 至 ARS-10 · 团队研究"
                    : "普通研究所科技 · 研究耗时2秒")
                : (challenge ? "11个普通挑战 · 10个转职挑战"
                    : "武器装备 · 道具材料 · 提前通关")
        );
        var shopToggle = byId("ShopModeShop");
        var challengeToggle = byId("ShopModeChallenge");
        if (shopToggle) shopToggle.SetHasClass("Selected", !research && !challenge);
        if (challengeToggle) challengeToggle.SetHasClass("Selected", challenge);
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

    function openChallenge() {
        if (!unlocks.shop) return;
        currentMode = "challenge";
        researchSourceEntindex = -1;
        hideValveShopWindow();
        if (!byId("CustomShopWindow")) return;
        updateModeText();
        setOpenState(true);
        requestSnapshot();
    }

    function openResearch(sourceEntindex) {
        var source = Number(sourceEntindex || -1);
        if (source <= 0) return;
        currentMode = "research";
        researchSourceEntindex = source;
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

    function toggleChallenge() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && windowPanel.BHasClass("ShopOpen")
            && currentMode === "challenge") close();
        else openChallenge();
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
        if (entry.content_type === "technology"
            && technologyCooldownRemaining() > 0) {
            setStatus("已有科技正在研究中，请稍候", true);
            return;
        }
        if (entry.content_type === "technology"
            && Object.keys(pendingTechnologyPurchases).length > 0) {
            return;
        }
        if (entry.content_type === "technology") {
            pendingTechnologyPurchases[entry.entry_id] = true;
        }
        setStatus(entry.content_type === "technology"
            ? ("正在开始研究 " + entry.name + "……")
            : ("正在购买 " + entry.name + "……"), false);
        GameEvents.SendCustomGameEventToServer("ui_shop_purchase_request", {
            request_id: requestId("shop_buy"),
            entry_id: entry.purchase_entry_id || entry.entry_id,
            source_entindex: researchSourceEntindex
        });
    }

    function toggleAutoResearch(entry) {
        if (!entry || entry.auto_research_available !== 1) return;
        if (Number(researchSourceEntindex || -1) <= 0) {
            setStatus("高级研究所来源无效", true);
            return;
        }
        GameEvents.SendCustomGameEventToServer(
            "ui_shop_auto_research_toggle_request",
            {
                request_id: requestId("auto_research"),
                technology_group: entry.technology_group || "",
                source_entindex: researchSourceEntindex
            }
        );
    }

    function entryById(entryId) {
        var entries = asArray(snapshot && snapshot.entries);
        for (var index = 0; index < entries.length; index++) {
            if (entries[index] && entries[index].entry_id === entryId) return entries[index];
        }
        return null;
    }

    function technologyCooldownRemaining() {
        var remaining = Number(snapshot && snapshot.technology_cooldown_remaining || 0);
        var until = Number(snapshot && snapshot.technology_cooldown_until || 0);
        var now = Number(Game.GetGameTime ? Game.GetGameTime() : 0);
        if (until > 0 && now > 0) remaining = until - now;
        return Math.max(0, remaining);
    }

    function technologyCooldownSource() {
        return String(snapshot && (snapshot.technology_cooldown_source_group
            || snapshot.technology_cooldown_source_entry) || "");
    }

    function lockBadgeText(entry) {
        var code = String(entry && entry.disabled_reason_code || "");
        if (code === "prerequisite_not_met") {
            return "前置 Lv." + Number(entry.prerequisite_required_level || 0);
        }
        if (code === "rebirth_level_not_met") {
            return "需要 " + Number(entry.prerequisite_rebirth_level || 0) + " 转";
        }
        if (code === "research_access_not_met") return "研究所未解锁";
        if (code === "max_level_reached") return "已满级";
        return "";
    }

    function updateCooldownOverlay(card, entry, remaining, total, source) {
        if (!card || !card.__survivalCooldownMask) return;
        var mask = card.__survivalCooldownMask;
        var isSource = !!source && (String(entry.entry_id) === source
            || String(entry.technology_group || "") === source);
        var active = isSource && remaining > 0;
        card.SetHasClass("CooldownSource", active);
        mask.visible = active;
        if (!active) return;
        var progress = Math.max(0, Math.min(1, remaining / Math.max(0.01, total)));
        var endAngle = Math.max(0, Math.min(360, progress * 360));
        mask.style.clip = "radial(50% 50%, 0deg, " + endAngle.toFixed(2) + "deg)";
    }

    function updateAllCooldownOverlays() {
        var remaining = technologyCooldownRemaining();
        var source = technologyCooldownSource();
        var total = Number(snapshot && snapshot.technology_cooldown_total || 2);
        Object.keys(entryCardsById).forEach(function (entryId) {
            var card = entryCardsById[entryId];
            var entry = entryById(entryId);
            if (card && entry) updateCooldownOverlay(card, entry, remaining, total, source);
        });
        if (remaining <= 0) return;
        var serial = ++cooldownAnimationSerial;
        $.Schedule(0.05, function tick() {
            if (serial !== cooldownAnimationSerial) return;
            updateAllCooldownOverlays();
        });
    }

    function updateEntryCard(card, entry) {
        if (!card || !entry) return;
        card.SetHasClass("Unavailable", entry.purchasable !== 1);
        card.SetHasClass("Technology", entry.content_type === "technology");
        card.SetHasClass("AutoResearchAvailable", entry.auto_research_available === 1);
        card.SetHasClass("AutoResearchActive", entry.auto_research_enabled === 1);
        var code = String(entry.disabled_reason_code || "");
        card.SetHasClass("PrerequisiteLocked", code === "prerequisite_not_met"
            || code === "rebirth_level_not_met"
            || code === "research_access_not_met");
        card.SetHasClass("ResourceLocked", code === "insufficient_gold"
            || code === "insufficient_wood");
        card.SetHasClass("MaxLevel", code === "max_level_reached");
        card.SetHasClass("PurchaseCooldownLocked", technologyCooldownRemaining() > 0
            && entry.content_type === "technology");
        card.hittest = true;
        if (card.__survivalLockBadge) {
            card.__survivalLockBadge.text = lockBadgeText(entry);
            card.__survivalLockBadge.visible = card.__survivalLockBadge.text !== "";
        }
        updateCooldownOverlay(card, entry, technologyCooldownRemaining(),
            Number(snapshot && snapshot.technology_cooldown_total || 2),
            technologyCooldownSource());
    }

    function updateVisibleEntryCards(changedIds) {
        Object.keys(changedIds || {}).forEach(function (entryId) {
            var card = entryCardsById[entryId];
            if (card && card.IsValid && card.IsValid()) {
                updateEntryCard(card, entryById(entryId));
            }
        });
        updateAllCooldownOverlays();
    }

    function entriesFor(data, shopId) {
        var entries = asArray(data && data.entries).filter(function (entry) {
            return entry && entry.visible === 1;
        });
        entries.sort(function (a, b) {
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
        return entries;
    }

    function visibleEntries() {
        var entries = asArray(snapshot && snapshot.entries).filter(function (entry) {
            return entry && entry.visible === 1;
        });
        entries.sort(function (a, b) {
            var sectionOrder = function (entry) {
                if (currentMode === "challenge") {
                    return entry.content_type === "rebirth" ? 20 : 10;
                }
                if (currentMode === "research") {
                    return entry.technology_track === "advanced_researcher" ? 20 : 10;
                }
                if (entry.content_id === "service_early_final_boss") return 30;
                return entry.content_type === "weapon" ? 10 : 20;
            };
            return sectionOrder(a) - sectionOrder(b)
                || (a.sort_order || 0) - (b.sort_order || 0);
        });
        return entries;
    }

    function structureSignature(entries) {
        return currentMode + "|" + entries.map(function (entry) {
            return [
                entry.entry_id,
                entry.shop_id,
                entry.sort_order,
                entry.content_type,
                entry.technology_track,
                entry.content_id,
                entry.icon_type,
                entry.icon,
                entry.level_text,
                entry.name
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
            structural: structureSignature(entriesFor(previous, ""))
                !== structureSignature(entriesFor(current, "")),
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

        var lastSection = "";
        entries.forEach(function (entry) {
            var sectionKey;
            var sectionText;
            if (currentMode === "research") {
                sectionKey = entry.technology_track === "advanced_researcher"
                    ? "advanced_researcher" : "research";
                sectionText = sectionKey === "advanced_researcher"
                    ? "高级研究所科技" : "研究所科技";
            } else if (currentMode === "challenge") {
                sectionKey = entry.content_type === "rebirth" ? "rebirth" : "challenge";
                sectionText = sectionKey === "rebirth" ? "转职挑战" : "普通挑战";
            } else if (entry.content_id === "service_early_final_boss") {
                sectionKey = "early_final";
                sectionText = "提前通关";
            } else {
                sectionKey = entry.content_type === "weapon" ? "weapon" : "item";
                sectionText = sectionKey === "weapon" ? "武器装备" : "道具材料";
            }
            if (sectionKey !== lastSection) {
                lastSection = sectionKey;
                var section = $.CreatePanel("Label", list, "");
                section.AddClass("ShopSectionTitle");
                section.text = sectionText;
            }
            var card = $.CreatePanel("Panel", list, "");
            card.AddClass("ShopShelfSlot");
            card.SetHasClass("Unavailable", entry.purchasable !== 1);
            card.SetHasClass("Technology", entry.content_type === "technology");
            card.SetHasClass("AutoResearchAvailable", entry.auto_research_available === 1);
            card.SetHasClass("AutoResearchActive", entry.auto_research_enabled === 1);
            card.SetAttributeString("entry_id", entry.entry_id || "");
            entryCardsById[entry.entry_id] = card;

            var frame = $.CreatePanel("Panel", card, "");
            frame.AddClass("ShopItemFrame");
            createEntryIcon(frame, entry, "ShopItemIcon");
            if (entry.content_type === "technology") {
                var cooldownMask = $.CreatePanel("Panel", frame, "");
                cooldownMask.AddClass("ShopTechnologyCooldownMask");
                cooldownMask.hittest = false;
                cooldownMask.visible = false;
                card.__survivalCooldownMask = cooldownMask;
                var lockBadge = $.CreatePanel("Label", frame, "");
                lockBadge.AddClass("ShopTechnologyLockBadge");
                lockBadge.hittest = false;
                card.__survivalLockBadge = lockBadge;
                var level = $.CreatePanel("Label", frame, "");
                level.AddClass("ShopTechnologyLevel");
                level.text = entry.level_text || ("Lv." + Number(entry.technology_level || 0));
                if (entry.technology_id) {
                    var code = $.CreatePanel("Label", frame, "");
                    code.AddClass("ShopTechnologyCode");
                    code.text = entry.technology_id;
                }
            } else if (currentMode === "challenge"
                || entry.content_id === "service_early_final_boss") {
                var name = $.CreatePanel("Label", frame, "");
                name.AddClass("ShopCardName");
                name.text = entry.name || "";
            }

            card.SetPanelEvent("onmouseover", function () {
                var current = entryById(card.GetAttributeString("entry_id", ""));
                if (tooltip && current) tooltip.Show(current, card);
            });
            card.SetPanelEvent("onmouseout", function () {
                if (tooltip) tooltip.Hide();
            });
            card.SetPanelEvent("oncontextmenu", function () {
                var current = entryById(card.GetAttributeString("entry_id", ""));
                if (current && current.auto_research_available === 1) {
                    toggleAutoResearch(current);
                } else {
                    purchase(current);
                }
            });
            card.SetPanelEvent("onactivate", function () {
                if (currentMode === "research") {
                    purchase(entryById(card.GetAttributeString("entry_id", "")));
                }
            });
            updateEntryCard(card, entry);
        });

        if (entries.length === 0) {
            var empty = $.CreatePanel("Label", list, "");
            empty.AddClass("ShopEmptyLabel");
            empty.text = "该分类当前没有可显示内容";
        }
        updateAllCooldownOverlays();
    }

    function renderCategories() {
        renderedCategorySignature = categorySignature(snapshot && snapshot.categories);
        renderItems();
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
            if (previous) structural = true;
            delete previousById[entryId];
        });
        asArray(payload.changed_entries).forEach(function (entry) {
            if (!entry || !entry.entry_id) return;
            var previous = previousById[entry.entry_id];
            if (!previous
                || previous.shop_id !== entry.shop_id
                || previous.sort_order !== entry.sort_order
                || previous.content_type !== entry.content_type
                || previous.technology_track !== entry.technology_track
                || previous.level_text !== entry.level_text
                || previous.name !== entry.name
                || previous.icon !== entry.icon) {
                structural = true;
            }
            previousById[entry.entry_id] = entry;
            changedIds[entry.entry_id] = true;
        });
        snapshot.entries = Object.keys(previousById).map(function (entryId) {
            return previousById[entryId];
        });
        if (payload.resources) snapshot.resources = payload.resources;
        if (payload.categories) snapshot.categories = payload.categories;
        snapshot.technology_cooldown_remaining = payload.technology_cooldown_remaining;
        snapshot.technology_cooldown_total = payload.technology_cooldown_total;
        snapshot.technology_cooldown_until = payload.technology_cooldown_until;
        snapshot.technology_cooldown_source_group = payload.technology_cooldown_source_group;
        snapshot.technology_cooldown_source_entry = payload.technology_cooldown_source_entry;
        snapshot.technology_cooldown_sequence = payload.technology_cooldown_sequence;
        snapshot.research_scope = payload.research_scope || snapshot.research_scope;
        snapshot.research_source_entindex = payload.research_source_entindex === undefined
            ? snapshot.research_source_entindex : payload.research_source_entindex;
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
        currentMode = payload.ui_mode === "research" ? "research"
            : (payload.ui_mode === "challenge" ? "challenge" : "shop");
        if (currentMode === "research") {
            researchSourceEntindex = Number(
                snapshot && snapshot.research_source_entindex || researchSourceEntindex
            );
        }
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
                ? "科技已同步"
                : (currentMode === "challenge" ? "挑战已同步" : "商店数据已同步"),
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
        if (camera && camera.FocusHeroWithoutLock) {
            camera.FocusHeroWithoutLock(payload || {});
            return;
        }
        var target = Number(payload && payload.focus_hero_entindex || -1);
        if (target <= 0) return;
        var x = Number(payload && payload.focus_target_x);
        var y = Number(payload && payload.focus_target_y);
        var z = Number(payload && payload.focus_target_z);
        var hasTarget = isFinite(x) && isFinite(y) && isFinite(z);
        var position = hasTarget ? [x, y, z]
            : (Entities.IsValidEntity(target) ? Entities.GetAbsOrigin(target) : null);
        var result = "api_unavailable";
        if (typeof GameUI.MoveCameraToEntity === "function") {
            try {
                GameUI.MoveCameraToEntity(target);
                result = "move_to_entity";
            } catch (error) {
                result = "move_to_entity_error:" + String(error);
            }
        }
        if (result !== "move_to_entity"
            && position && typeof GameUI.SetCameraTargetPosition === "function") {
            try {
                GameUI.SetCameraTargetPosition(position, 0.0);
                result = "target_position_fallback";
            } catch (error) {
                result = "api_error:" + String(error);
            }
        }
        GameEvents.SendCustomGameEventToServer("ui_client_diagnostic", {
            stage: "camera_fallback",
            entindex: target,
            target: position ? position.join(",") : "unavailable",
            move_camera_api: typeof GameUI.MoveCameraToEntity,
            camera_api: typeof GameUI.SetCameraTargetPosition,
            camera_result: result
        });
    }

    function onResult(payload) {
        if (!payload) return;
        if (payload.operation === "shop_open" && payload.success !== 1) {
            setLoading(false);
            setStatus("商店同步失败：" + (payload.error || "未知错误"), true);
            return;
        }
        if (payload.operation === "shop_auto_research_toggle") {
            setStatus(
                payload.success === 1
                    ? (Number(payload.enabled || 0) === 1
                        ? "自动研究已开启" : "自动研究已关闭")
                    : ("自动研究切换失败：" + (payload.error || "未知错误")),
                payload.success !== 1
            );
            return;
        }
        if (payload.operation !== "shop_purchase") return;
        pendingTechnologyPurchases = {};
        if (payload.success === 1
            && Number(payload.close_shop_and_focus_hero || 0) === 1) {
            close();
            focusHero(payload);
            return;
        }
        setStatus(
            payload.success === 1
                ? (currentMode === "research"
                    ? "已开始研究，请等待进度完成……"
                    : "购买成功，正在刷新商店状态……")
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
        Close: close,
        Toggle: toggle,
        ToggleShop: toggleShop,
        OpenChallenge: openChallenge,
        OpenResearch: openResearch,
        ToggleChallenge: toggleChallenge,
        SetUnlocks: setUnlocks,
        Refresh: refresh
    };
    setUnlocks(GameUI.CustomUIConfig().SurvivalShopUnlocks || unlocks);
    setOpenState(false);
})();
