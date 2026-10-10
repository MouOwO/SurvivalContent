(function () {
    "use strict";
    // UI_REUSE_V1
    var U=GameUI.CustomUIConfig().SurvivalUI;

    var snapshot = null;
    var latestSequence = 0;
    var closeBound = false;
    var currentMode = "shop";
    var lastShopMode = "shop";
    var shopCategory = "equipment";
    var shopLayoutHeight = 600;
    var drawerOpened = false, drawerGeneration = 0;
    var researchSourceEntindex = -1;
    var unlocks = { shop: false, research: false };
    var entryCardsById = {};
    var renderedStructureSignature = "";
    var cooldownAnimationSerial = 0;
    var pendingTechnologyPurchases = {};
    var snapshotRequest = null;
    var snapshotRequestFailed = false;
    var renderedSnapshotSignature = "";
    var entriesById = {};
    var cooldownRefreshDeadlines = {};
    var rejectedPatchSequence = -1;

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
        setProperty(panel, "text", String(value === undefined ? "" : value));
    }

    function setProperty(panel, property, value) {
        if (panel && panel[property] !== value) panel[property] = value;
    }

    function setClass(panel, name, enabled) {
        if (panel && panel.BHasClass(name) !== !!enabled) panel.SetHasClass(name, !!enabled);
    }

    // Transport counters do not change presentation. Absolute cooldown deadlines
    // drive the existing local animation; their periodically reported remainder
    // must not redraw every item or the hovered tooltip.
    function contentSignature(value, snapshotRoot) {
        if (value === null || typeof value !== "object") return JSON.stringify(value);
        if (Array.isArray(value)) return "[" + value.map(function (item) {
            return contentSignature(item, false);
        }).join(",") + "]";
        return "{" + Object.keys(value).sort().filter(function (key) {
            if (snapshotRoot && (key === "sequence" || key === "base_sequence"
                || key === "full" || key === "reason")) return false;
            if (key === "technology_cooldown_remaining" && Number(value.technology_cooldown_until) > 0) return false;
            if (key === "early_final_cooldown_remaining" && Number(value.early_final_cooldown_until) > 0) return false;
            return true;
        }).map(function (key) {
            return JSON.stringify(key) + ":" + contentSignature(value[key], false);
        }).join(",") + "}";
    }

    function snapshotMatchesContext(data) {
        if (!data) return false;
        var mode = data.ui_mode || "shop";
        if (mode !== currentMode) return false;
        return mode !== "research" || Number(data.research_source_entindex) === researchSourceEntindex;
    }

    function indexEntries() {
        entriesById = {};
        asArray(snapshot && snapshot.entries).forEach(function (entry) {
            if (entry && entry.entry_id) entriesById[entry.entry_id] = entry;
        });
    }

    function formatNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        if (formatter && formatter.Format) return formatter.Format(value);
        return String(value || 0);
    }

    function setStatus(text, error) {
        if (!drawerOpened) return;
        var target = byId("ShopStatus");
        if (!target) return;
        setProperty(target, "text", text || "");
        setClass(target, "error", !!error);
        var footer = byId("ShopFooter");
        setProperty(footer, "visible", !!error);
    }

    function setLoading(loading) {
        var loadingPanel = byId("ShopLoading");
        var itemList = byId("ShopItemList");
        setClass(loadingPanel, "Hidden", !loading);
        setClass(itemList, "Hidden", loading);
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

    function requestSnapshot(resync) {
        if (!drawerOpened) return;
        var context = currentMode + ":" + researchSourceEntindex;
        if (snapshotRequest && snapshotRequest.context === context
            && Date.now() - snapshotRequest.started < 10000) return;
        snapshotRequestFailed = false;
        snapshotRequest = {context: context, started: Date.now(), id: requestId("shop_open"), resync: !!resync};
        // Keep existing cards alive during an in-place refresh. Hiding the list
        // dismisses Panorama hover state even when the server changes only gold.
        setLoading(!snapshotMatchesContext(snapshot));
        setStatus(
            currentMode === "research" ? "正在同步科技……"
                : (currentMode === "challenge" ? "正在同步挑战……"
                    : "正在同步服务器商店……"),
            false
        );
        GameEvents.SendCustomGameEventToServer("ui_shop_open_request", {
            request_id: snapshotRequest.id,
            known_sequence: latestSequence,
            mode: currentMode,
            source_entindex: researchSourceEntindex
        });
    }

    function updateModeText() {
        var research = currentMode === "research";
        var challenge = currentMode === "challenge";
        var advancedResearch = research
            && snapshotMatchesContext(snapshot) && snapshot.research_scope === "advanced";
        setText("ShopTitle", research
            ? (advancedResearch ? "高级研究" : "科技")
            : "生存商店");
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
        var otherToggle = byId("ShopModeOther");
        setClass(shopToggle, "Selected", !research && !challenge && shopCategory === "equipment");
        setClass(challengeToggle, "Selected", challenge);
        setClass(otherToggle, "Selected", !research && !challenge && shopCategory === "other");
        setProperty(byId("ShopModeToggles"), "visible", !research);
    }

    function applyShopLayout() {
        var windowPanel = byId("CustomShopWindow");
        if (!windowPanel) return;
        var root = $.GetContextPanel();
        var rootWidth = (root.actuallayoutwidth || 1920) / (root.actualuiscale_x || 1);
        var rootHeight = (root.actuallayoutheight || 1080) / (root.actualuiscale_y || 1);
        var scale = Math.min(rootWidth / 1920, rootHeight / 1080);
        var top = Math.max(12, (rootHeight - shopLayoutHeight * scale) / 2);
        windowPanel.style.width = "680px";
        windowPanel.style.height = shopLayoutHeight + "px";
        windowPanel.style.horizontalAlign = "left";
        windowPanel.style.verticalAlign = "top";
        windowPanel.style.transformOrigin = "0% 0%";
        windowPanel.style.margin = "0px";
        // Fit owns scale; position owns the drawer transition. They never overwrite each other.
        windowPanel.style.position = Math.round(drawerOpened ? 16 : -700 * scale) + "px " + Math.round(top) + "px 0px";
        if (byId("ShopHeader")) {
            byId("ShopHeader").style.borderBottom = "0px";
            byId("ShopHeader").style.backgroundColor = "gradient(linear,0% 0%,0% 100%,from(#282035),to(#191325))";
        }
        if (byId("ShopBackdrop")) byId("ShopBackdrop").style.backgroundColor = "transparent";
        if (byId("ShopBody")) byId("ShopBody").style.height = "426px";
        if (byId("ShopFooter")) byId("ShopFooter").style.position = "24px 548px 0px";
    }

    function updateShopLayout(entries) {
        // The reference keeps a stable three-row viewport, including sparse categories.
        shopLayoutHeight = 600;
        applyShopLayout();
    }

    function setOpenState(opened) {
        var windowPanel = byId("CustomShopWindow");
        var exiting = drawerOpened || !!(windowPanel && windowPanel.visible);
        var serial = ++drawerGeneration;
        drawerOpened = opened;
        if (windowPanel) {
            windowPanel.style.backgroundColor = "gradient(linear,0% 0%,100% 100%,from(#2e243d),to(#21182f))";
            windowPanel.style.border = "2px solid #b6996e"; windowPanel.style.borderRadius = "2px";
        }
        if(shopShell){if(opened)shopShell.Open();else shopShell.Close();}
        if (windowPanel) {
            windowPanel.SetHasClass("ShopOpen", opened);
            windowPanel.SetHasClass("Closed", !opened);
            windowPanel.RemoveClass("Hidden");
            windowPanel.visible = opened || exiting;
            windowPanel.hittest = opened;
            windowPanel.hittestchildren = opened;
            applyShopLayout();
            if (!opened && exiting) $.Schedule(0.29, function () {
                if (serial === drawerGeneration && !drawerOpened && windowPanel.IsValid()) windowPanel.visible = false;
            });
        }
    }

    function openMode(mode, source) {
        if (drawerOpened && currentMode === mode && researchSourceEntindex === source) {
            if (snapshotRequestFailed || (snapshotRequest && Date.now() - snapshotRequest.started >= 10000)) requestSnapshot();
            return;
        }
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (drawerOpened && tooltip) tooltip.Hide();
        currentMode = mode;
        researchSourceEntindex = source;
        snapshotRequest = null;
        hideValveShopWindow();
        if (!byId("CustomShopWindow")) return;
        if (!drawerOpened) setOpenState(true);
        updateModeText();
        renderSnapshot(true);
        requestSnapshot();
    }

    function open() {
        if (unlocks.shop) openMode(lastShopMode, -1);
    }

    function openChallenge() {
        if (!unlocks.shop) return;
        lastShopMode = "challenge";
        openMode("challenge", -1);
    }

    function openResearch(sourceEntindex) {
        var source = Number(sourceEntindex || -1);
        if (source <= 0) return;
        openMode("research", source);
    }

    function close() {
        if (!drawerOpened) return;
        cooldownAnimationSerial++;
        snapshotRequest = null;
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (tooltip) tooltip.Hide();
        setOpenState(false);
        GameEvents.SendCustomGameEventToServer("ui_shop_close_request", {
            request_id: requestId("shop_close")
        });
    }

    function toggle() {
        var windowPanel = byId("CustomShopWindow");
        if (!windowPanel || !windowPanel.BHasClass("ShopOpen")) open();
        else close();
    }

    function selectCategory(category) {
        if (!unlocks.shop) return;
        var changed = shopCategory !== category;
        shopCategory = category;
        lastShopMode = "shop";
        if (drawerOpened && currentMode === "shop") {
            if (changed) renderSnapshot(true);
        } else open();
    }
    function selectShop() { selectCategory("equipment"); }
    function selectOther() { selectCategory("other"); }

    function toggleShop() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && windowPanel.BHasClass("ShopOpen")
            && currentMode === "shop") close();
        else if (!windowPanel || !windowPanel.BHasClass("ShopOpen")) open();
        else selectShop();
    }

    function toggleChallenge() {
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && windowPanel.BHasClass("ShopOpen")
            && currentMode === "challenge") close();
        else openChallenge();
    }

    function setUnlocks(value) {
        unlocks = value || unlocks;
        GameUI.CustomUIConfig().SurvivalShopUnlocks = unlocks;
        if (drawerOpened) updateModeText();
        var shopButton = byId("CustomShopButton");
        setClass(shopButton, "Locked", !unlocks.shop);
    }

    function onShopUnlock(payload) {
        var unlocked = Number(payload && payload.unlocked || 0) === 1;
        var wasUnlocked = !!unlocks.shop;
        setUnlocks({ shop: unlocked, research: unlocks.research });
        if (unlocked && !wasUnlocked) {
            setStatus("装备商店已解锁", false);
        }
    }

    function refresh() {
        if (drawerOpened) requestSnapshot();
    }

    function createEntryIcon(parent, entry, className) {
        var art=GameUI.CustomUIConfig().SurvivalItemArt; if(art&&art.Create(parent,entry,className))return;
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

    function usesTechnologyPrerequisites(entry) {
        return !!entry && entry.content_type === "technology" && entry.prerequisite_met !== undefined;
    }

    function entryUnavailable(entry) {
        if (!entry) return true;
        return usesTechnologyPrerequisites(entry)
            ? Number(entry.prerequisite_met) === 0 : entry.purchasable !== 1;
    }

    function entryCompleted(entry) {
        return usesTechnologyPrerequisites(entry)
            && (Number(entry.completed) === 1 || Number(entry.removed) === 1);
    }

    function queuedTechnology(entry) {
        return usesTechnologyPrerequisites(entry) && currentMode === "research"
            && Number(researchSourceEntindex) > 0;
    }

    function purchase(entry) {
        if (!drawerOpened || !snapshotMatchesContext(snapshot)) return;
        if (earlyFinalCooldownRemaining(entry) > 0) return;
        if (entryUnavailable(entry) || entryCompleted(entry)) {
            setStatus(
                "当前不可购买：" + ((entry && entry.disabled_reason) || "条件不满足"),
                true
            );
            return;
        }
        if (entry.content_type === "technology" && !queuedTechnology(entry)
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
        if (!drawerOpened || !snapshotMatchesContext(snapshot)) return;
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
        return entriesById[entryId] || null;
    }

    function earlyFinalCooldownRemaining(entry) {
        if (!entry || entry.content_id !== "service_early_final_boss") return 0;
        var until = Number(entry.early_final_cooldown_until || 0);
        return Math.max(0, until > 0
            ? until - Number(Game.GetGameTime())
            : Number(entry.early_final_cooldown_remaining || 0));
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
        if (entry.content_id === "service_early_final_boss") {
            remaining = earlyFinalCooldownRemaining(entry);
            total = Number(entry.early_final_cooldown_total || 60);
            source = entry.entry_id;
            if (remaining <= 0 && Number(entry.early_final_cooldown_remaining) > 0
                && cooldownRefreshDeadlines[entry.entry_id] !== String(entry.early_final_cooldown_until || 0)) {
                cooldownRefreshDeadlines[entry.entry_id] = String(entry.early_final_cooldown_until || 0);
                requestSnapshot();
            }
        }
        var mask = card.__survivalCooldownMask;
        var isSource = !!source && (String(entry.entry_id) === source
            || String(entry.technology_group || "") === source);
        var active = isSource && remaining > 0;
        setClass(card, "CooldownSource", active);
        setProperty(mask, "visible", active);
        if (!active) return;
        var progress = Math.max(0, Math.min(1, remaining / Math.max(0.01, total)));
        var endAngle = Math.max(0, Math.min(360, progress * 360));
        setProperty(mask.style, "clip", "radial(50% 50%, 0deg, " + endAngle.toFixed(2) + "deg)");
    }

    function updateAllCooldownOverlays() {
        if (!drawerOpened || !snapshotMatchesContext(snapshot)) return;
        var serial = ++cooldownAnimationSerial;
        var remaining = technologyCooldownRemaining();
        var animationRemaining = 0;
        var source = technologyCooldownSource();
        var total = Number(snapshot && snapshot.technology_cooldown_total || 2);
        Object.keys(entryCardsById).forEach(function (entryId) {
            var card = entryCardsById[entryId];
            var entry = entryById(entryId);
            if (card && entry) {
                updateCooldownOverlay(card, entry, remaining, total, source);
                setClass(card, "PurchaseCooldownLocked", remaining > 0
                    && entry.content_type === "technology" && !queuedTechnology(entry));
                if (card.__survivalCooldownMask && card.__survivalCooldownMask.visible) {
                    animationRemaining = Math.max(animationRemaining, remaining, earlyFinalCooldownRemaining(entry));
                }
            }
        });
        if (animationRemaining <= 0) return;
        $.Schedule(0.05, function tick() {
            if (!drawerOpened || serial !== cooldownAnimationSerial) return;
            updateAllCooldownOverlays();
        });
    }

    function updateEntryCard(card, entry) {
        if (!card || !entry) return;
        var entrySignature = contentSignature(entry, false);
        var signature = entrySignature + "|" + (technologyCooldownRemaining() > 0 && !queuedTechnology(entry));
        if (card.__survivalEntrySignature === signature) return;
        var entryChanged = card.__survivalEntryContent !== entrySignature;
        card.__survivalEntrySignature = signature;
        card.__survivalEntryContent = entrySignature;
        var R=GameUI.CustomUIConfig().RemainingHandoff;if(R)R.UpdateShopPrices(card,entry);
        setClass(card, "Unavailable", entryUnavailable(entry));
        setClass(card, "Technology", entry.content_type === "technology");
        setClass(card, "AutoResearchAvailable", entry.auto_research_available === 1);
        setClass(card, "AutoResearchActive", entry.auto_research_enabled === 1);
        var code = String(entry.disabled_reason_code || "");
        setClass(card, "PrerequisiteLocked", usesTechnologyPrerequisites(entry)
            ? Number(entry.prerequisite_met) === 0 : (code === "prerequisite_not_met"
                || code === "rebirth_level_not_met" || code === "research_access_not_met"));
        setClass(card, "ResourceLocked", !usesTechnologyPrerequisites(entry)
            && (code === "insufficient_gold" || code === "insufficient_wood"));
        setClass(card, "MaxLevel", code === "max_level_reached");
        setClass(card, "PurchaseCooldownLocked", technologyCooldownRemaining() > 0
            && entry.content_type === "technology" && !queuedTechnology(entry));
        setProperty(card, "visible", !entryCompleted(entry));
        setProperty(card, "hittest", true);
        setProperty(card.__survivalNameLabel, "text", entry.name || entry.content_id || "");
        setProperty(card.__survivalLevelLabel, "text", entry.level_text || ("Lv." + Number(entry.technology_level || 0)));
        if (card.__survivalLockBadge) {
            setProperty(card.__survivalLockBadge, "text", lockBadgeText(entry));
            setProperty(card.__survivalLockBadge, "visible", card.__survivalLockBadge.text !== "");
        }
        var stock=GameUI.CustomUIConfig().RemainingHandoff.ShopStock(entry);
        var purchaseLimitReached = entry.disabled_reason_code === "purchase_limit_reached"
            || (entry.purchasable !== 1 && Number(entry.purchase_limit || 0) > 0
                && Number(entry.owned_count || 0) >= Number(entry.purchase_limit));
        setClass(card, "StockEmpty", (!!stock && stock.count <= 0) || purchaseLimitReached);
        if (stock && !card.__survivalStockLabel) {
            card.__survivalStockLabel = $.CreatePanel("Label", card.__survivalFrame, "");
            card.__survivalStockLabel.AddClass("ShopStockLabel");
            card.__survivalStockLabel.hittest = false;
        }
        if (card.__survivalStockLabel) {
            setProperty(card.__survivalStockLabel, "visible", false);
            setProperty(card.__survivalStockLabel, "text", stock ? stock.count+"/"+stock.max : "");
        }
        updateCooldownOverlay(card, entry, technologyCooldownRemaining(),
            Number(snapshot && snapshot.technology_cooldown_total || 2),
            technologyCooldownSource());
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (entryChanged && tooltip && tooltip.UpdateEntry) tooltip.UpdateEntry(entry);
    }

    function visibleEntries() {
        var entries = asArray(snapshot && snapshot.entries).filter(function (entry) {
            if (!entry || entry.visible !== 1 || entryCompleted(entry)) return false;
            if (currentMode !== "shop") return true;
            // Use the real category when supplied. Older snapshots keep their
            // equipment/items in the first tab rather than hiding unknown rows.
            var other = (entry.shop_id || entry.category_id) === "item" || entry.content_id === "service_early_final_boss";
            return shopCategory === "other" ? other : !other;
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
        return currentMode + "|" + shopCategory + "|" + entries.map(function (entry) {
            return [
                entry.entry_id,
                entry.shop_id,
                entry.sort_order,
                entry.content_type,
                entry.technology_track,
                entry.content_id,
                entry.icon_type,
                entry.icon,
                entry.technology_id
            ].join(":");
        }).join("|");
    }

    var autoBookButtons = {};
    function updateAutoBookButtons() {
        if (!drawerOpened) return;
        var values = CustomNetTables.GetTableValue("survival_shop_config", "auto_purchase_" + Game.GetLocalPlayerID()) || {};
        var changed = false;
        Object.keys(autoBookButtons).forEach(function(id) {
            var button = autoBookButtons[id];
            if (button && button.IsValid()) {
                var enabled = Number(values[id] || 0) === 1;
                if (button.__survivalAutoEnabled !== enabled) changed = true;
                button.__survivalAutoEnabled = enabled;
                setClass(button, "AutoBookEnabled", enabled);
                setProperty(button.GetChild(0), "text", enabled ? "自动 ✓" : "自动");
            }
        });
        var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
        if (changed && tooltip && tooltip.UpdateAutoPurchaseState) tooltip.UpdateAutoPurchaseState();
    }
    if (typeof CustomNetTables !== "undefined") CustomNetTables.SubscribeNetTableListener("survival_shop_config", function(table, key) {
        if (key === "auto_purchase_" + Game.GetLocalPlayerID()) updateAutoBookButtons();
    });
    function renderItems() {
        if (currentMode === "shop" || currentMode === "challenge") lastShopMode = currentMode;
        var list = byId("ShopItemList");
        if (!list || !snapshot || !drawerOpened) return;
        var entries = visibleEntries();
        var nextSignature = structureSignature(entries);
        if (nextSignature === renderedStructureSignature) {
            // A category refresh can leave the layout unchanged after a purchase.
            // Still apply availability/stock updates to the existing cards.
            entries.forEach(function(entry) {
                updateEntryCard(entryCardsById[entry.entry_id], entry);
            });
            updateAllCooldownOverlays();
            return;
        }
        updateShopLayout(entries);
        autoBookButtons = {};
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
            if (sectionKey !== lastSection && currentMode === "research") {
                lastSection = sectionKey;
                var section = $.CreatePanel("Label", list, "");
                section.AddClass("ShopSectionTitle");
                section.text = sectionText;
            }
            var card = $.CreatePanel("Panel", list, "");
            card.AddClass("ShopShelfSlot"); U.CardShell.Adopt(card,{bodyVariant:"product"});
            card.SetHasClass("Unavailable", entryUnavailable(entry));
            card.SetHasClass("Technology", entry.content_type === "technology");
            card.SetHasClass("AutoResearchAvailable", entry.auto_research_available === 1);
            card.SetHasClass("AutoResearchActive", entry.auto_research_enabled === 1);
            card.SetAttributeString("entry_id", entry.entry_id || "");
            entryCardsById[entry.entry_id] = card;

            var frame = $.CreatePanel("Panel", card, "");
            frame.AddClass("ShopItemFrame");
            card.__survivalFrame = frame;
            createEntryIcon(frame, entry, "ShopItemIcon");
            if (entry.content_type === "technology" || entry.content_id === "service_early_final_boss") {
                var cooldownMask = $.CreatePanel("Panel", frame, "");
                cooldownMask.AddClass("ShopTechnologyCooldownMask");
                cooldownMask.hittest = false;
                cooldownMask.hittestchildren = false;
                // Explicit overlay geometry also survives a cached base stylesheet.
                cooldownMask.style.position = "0px 0px 0px";
                cooldownMask.style.width = "100%";
                cooldownMask.style.height = "100%";
                cooldownMask.style.zIndex = "5";
                cooldownMask.style.backgroundColor = "#000000cc";
                cooldownMask.visible = false;
                card.__survivalCooldownMask = cooldownMask;
            }
            if (entry.content_type === "technology") {
                var lockBadge = $.CreatePanel("Label", frame, "");
                lockBadge.AddClass("ShopTechnologyLockBadge");
                lockBadge.hittest = false;
                card.__survivalLockBadge = lockBadge;
                var level = $.CreatePanel("Label", frame, "");
                level.AddClass("ShopTechnologyLevel");
                card.__survivalLevelLabel = level;
                level.text = entry.level_text || ("Lv." + Number(entry.technology_level || 0));
                if (entry.technology_id) {
                    var code = $.CreatePanel("Label", frame, "");
                    code.AddClass("ShopTechnologyCode");
                    code.text = entry.technology_id;
                }
            }
            var name = $.CreatePanel("Label", card, "");
            name.AddClass("ShopCardName");
            card.__survivalNameLabel = name;
            name.text = entry.name || entry.content_id || "";
            name.hittest = false;
            name.visible = false; // Icon-only reference; names remain in the detail tooltip.
            if (GameUI.CustomUIConfig().RemainingHandoff.ShopStock(entry)) {
                var stockLabel = $.CreatePanel("Label", frame, "");
                stockLabel.AddClass("ShopStockLabel");
                stockLabel.hittest=false;
                card.__survivalStockLabel = stockLabel;
            }

            card.SetPanelEvent("onmouseover", function () {
                var current = entryById(card.GetAttributeString("entry_id", ""));
                if (tooltip && current) tooltip.Show(current, card);
            });
            card.SetPanelEvent("onmouseout", function () {
                if (tooltip) (tooltip.RequestHide || tooltip.Hide)();
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
                var current = entryById(card.GetAttributeString("entry_id", ""));
                if (currentMode === "research") purchase(current);
                else if (tooltip && current) tooltip.Show(current, card, true);
            });
            var R=GameUI.CustomUIConfig().RemainingHandoff;
            if(R)R.SurvivalShopCard(card,entry,function(){purchase(entryById(card.GetAttributeString("entry_id","")));});
            if (entry.entry_id === "shop_item_knowledge_book" || entry.entry_id === "shop_item_super_knowledge_book") {
                card.AddClass("AutoBookCard");
                var autoButton = $.CreatePanel("Button", card, "");
                autoButton.AddClass("AutoBookButton");
                autoButton.hittest = true;
                autoButton.hittestchildren = false;
                var autoLabel = $.CreatePanel("Label", autoButton, "");
                autoLabel.text = "自动";
                var bookEntryId = entry.entry_id;
                autoBookButtons[bookEntryId] = autoButton;
                autoButton.SetPanelEvent("onactivate", function() {
                    GameEvents.SendCustomGameEventToServer("ui_shop_auto_purchase_toggle_request", {entry_id:bookEntryId});
                    return true;
                });
            }
            card.style.width = "136px"; card.style.height = "132px";
            card.style.margin = "0px 20px 10px 0px"; card.style.padding = "0px";
            updateEntryCard(card, entry);
        });
        updateAutoBookButtons();

        if (entries.length === 0) {
            var empty = $.CreatePanel("Label", list, "");
            empty.AddClass("ShopEmptyLabel");
            empty.text = "该分类当前没有可显示内容";
        }
        updateAllCooldownOverlays();
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
            if (drawerOpened && rejectedPatchSequence !== Number(payload.sequence || 0)) {
                rejectedPatchSequence = Number(payload.sequence || 0);
                if (snapshotRequest && snapshotRequest.resync && Date.now() - snapshotRequest.started < 10000) return null;
                snapshotRequest = null;
                requestSnapshot(true);
            }
            return null;
        }
        var previousById = {};
        asArray(snapshot.entries).forEach(function (entry) {
            if (entry && entry.entry_id) previousById[entry.entry_id] = entry;
        });
        asArray(payload.removed_entry_ids).forEach(function (entryId) {
            delete previousById[entryId];
        });
        asArray(payload.changed_entries).forEach(function (entry) {
            if (!entry || !entry.entry_id) return;
            previousById[entry.entry_id] = entry;
        });
        snapshot.entries = Object.keys(previousById).map(function (entryId) {
            return previousById[entryId];
        });
        // Omitted fields retain their previous values. Carry all supplied business
        // fields, including research queues and purchase cooldowns, without a
        // second hand-maintained projection that can silently lose new fields.
        Object.keys(payload).forEach(function (key) {
            if (key !== "changed_entries" && key !== "removed_entry_ids"
                && key !== "entries" && key !== "full" && key !== "base_sequence") {
                snapshot[key] = payload[key];
            }
        });
        return snapshot;
    }

    function renderSnapshot(force) {
        if (!drawerOpened || !snapshotMatchesContext(snapshot)) return;
        var signature = currentMode + "|" + shopCategory + "|" + contentSignature(snapshot, true);
        if (!force && signature === renderedSnapshotSignature) return;
        renderedSnapshotSignature = signature;
        updateModeText();
        setLoading(false);
        renderResources();
        renderItems();
        updateAutoBookButtons();
    }

    function onSnapshot(payload) {
        if (!payload) return;
        if (drawerOpened) {
            var mode = payload.ui_mode || (snapshot && snapshot.ui_mode) || "shop";
            var source = payload.research_source_entindex === undefined
                ? snapshot && snapshot.research_source_entindex : payload.research_source_entindex;
            if (mode !== currentMode || (mode === "research" && Number(source) !== researchSourceEntindex)) return;
        }
        var sequence = Number(payload.sequence || 0);
        if (sequence > 0 && sequence <= latestSequence) return;
        if (payload.full === 0) {
            if (!mergePatch(payload)) return;
        } else {
            snapshot = payload;
        }
        latestSequence = Math.max(latestSequence, sequence);
        rejectedPatchSequence = -1;
        indexEntries();
        if (!drawerOpened) return;
        snapshotRequest = null;
        snapshotRequestFailed = false;
        renderSnapshot(false);
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
        renderSnapshot(true);
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
            if (payload.request_id && (!snapshotRequest || payload.request_id !== snapshotRequest.id)) return;
            snapshotRequest = null;
            snapshotRequestFailed = true;
            if (drawerOpened) setLoading(false);
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
    GameEvents.Subscribe("ui_shop_unlock_state", onShopUnlock);
    GameEvents.Subscribe("ui_shop_force_open", onForceOpen);
    GameEvents.Subscribe("ui_operation_result", onResult);
    GameUI.CustomUIConfig().SurvivalShop = {
        Open: open,
        SelectShop: selectShop,
        SelectOther: selectOther,
        Close: close,
        Toggle: toggle,
        ToggleShop: toggleShop,
        OpenChallenge: openChallenge,
        OpenResearch: openResearch,
        ToggleChallenge: toggleChallenge,
        SetUnlocks: setUnlocks,
        PurchaseEntry: function (id) { var entry = entryById(id); if (entry) purchase(entry); },
        ToggleAutoPurchaseEntry: function (id) {
            if (id !== "shop_item_knowledge_book" && id !== "shop_item_super_knowledge_book") return;
            GameEvents.SendCustomGameEventToServer("ui_shop_auto_purchase_toggle_request", {entry_id:id});
        },
        Refresh: refresh,
        Inspect: function () { return {mode:currentMode,category:shopCategory,height:shopLayoutHeight}; }
    };
    var shopWindow = byId("CustomShopWindow");
    var purple = GameUI.CustomUIConfig().SurvivalPurpleShell;
    if (purple && purple.Detach) purple.Detach(shopWindow);
    else if (shopWindow.__purpleShell) { shopWindow.__purpleShell.Dispose(); shopWindow.RemoveClass("PurpleShell"); }
    shopWindow.AddClass("ShopPurple"); shopWindow.AddClass("ShopStandalone"); shopWindow.AddClass("RHSurvivalShop");
    var shopShell=U.ModalShell.Adopt({id:"shop",panel:byId("CustomShopWindow"),root:$.GetContextPanel(),header:byId("ShopHeader"),titlePanel:byId("ShopTitle"),scrim:byId("ShopBackdrop"),scrimButton:byId("ShopBackdropClick"),closeButton:byId("ShopCloseButton"),width:680,height:600,fit:{reference:[1920,1080]},onClose:close});
    var categoryHost = byId("ShopModeToggles");
    if (categoryHost && !byId("ShopModeOther")) {
        var other = $.CreatePanel("Button", categoryHost, "ShopModeOther");
        other.AddClass("ShopModeToggle"); other.hittestchildren = false;
        var otherLabel = $.CreatePanel("Label", other, ""); otherLabel.text = "其他";
        other.SetPanelEvent("onactivate", selectOther);
    }
    var shopButton = byId("ShopModeShop");
    if (shopButton && shopButton.GetChildCount && shopButton.GetChildCount()) shopButton.GetChild(0).text = "装备";
    ["ShopModeShop","ShopModeChallenge","ShopModeOther"].forEach(function(id){if(byId(id))U.TabBar.Adopt(byId(id));});
    U.Tooltip.Adopt(byId("ShopEntryTooltip"));
    byId("ShopTitle").style.color = "#ffdb82";
    var closeButton = byId("ShopCloseButton");
    closeButton.RemoveAndDeleteChildren();
    var closeGlyph = $.CreatePanel("Label", closeButton, ""); closeGlyph.text = "×"; closeGlyph.hittest = false;
    var titleDivider = $.CreatePanel("Panel", byId("ShopHeader"), "ShopTitleDivider");
    titleDivider.hittest = false; titleDivider.hittestchildren = false;
    ["TL","TR","BL","BR"].forEach(function(c) {
        var corner = $.CreatePanel("Panel", shopWindow, "");
        corner.AddClass("ShopFrameCorner"); corner.AddClass("ShopFrameCorner" + c);
        corner.hittest = false; corner.hittestchildren = false;
    });
    setUnlocks(GameUI.CustomUIConfig().SurvivalShopUnlocks || unlocks);
    setOpenState(false);
})();
