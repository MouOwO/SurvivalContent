(function () {
    "use strict";
    // UI_REUSE_V1
    var U=GameUI.CustomUIConfig().SurvivalUI;

    var snapshot = null;
    var latestSequence = 0;
    var closeBound = false;
    var currentMode = "shop";
    var researchSourceEntindex = -1;
    var unlocks = { shop: false, research: false };
    var entryCardsById = {};
    var renderedStructureSignature = "";
    var cooldownAnimationSerial = 0;
    var pendingTechnologyPurchases = {};
    var entriesById={}, drawerOpened=false, renderedSnapshotSignature="";
    var snapshotRequest=null,snapshotRequestFailed=false,rejectedPatchSequence=-1;
    var entryPositions = {}, entryContents = {}, entryShapes = {}, dirtyEntries = {};
    var entryOrder={},nextEntryOrder=0;
    var rootContents = {}, contentRevision = 0, structureRevision = 0;
    var cooldownGroups = {}, technologyCards = {}, earlyCooldownCards = {}, previousCooldownCards = {};
    var cooldownLocksActive = false;
    var costs = {full_rows:0,delta_rows:0,root_fields:0,render_rows:0,cooldown_rows:0,container_builds:0};
    var walletFactory=GameUI.CustomUIConfig().SurvivalShopWalletModel;
    var previousShop=GameUI.CustomUIConfig().SurvivalShop;
    if(previousShop&&previousShop.DisposeWallet)previousShop.DisposeWallet();
    var walletLane=walletFactory&&walletFactory.Connect({
        config:GameUI.CustomUIConfig(),owner:$.GetContextPanel(),
        onChange:function(data,changed){
            if(snapshot!==data)return;
            renderResources();
            changed.forEach(function(entry){
                var card=entryCardsById[entry.entry_id];
                if(card&&(!card.IsValid||card.IsValid()))updateEntryCard(card,entry);
                var tooltip=GameUI.CustomUIConfig().SurvivalShopTooltip;
                if(tooltip&&tooltip.UpdateEntry)tooltip.UpdateEntry(entry);
            });
        }
    });
    try { $.RegisterEventHandler("PanelDeleted",$.GetContextPanel(),function(){
        drawerOpened=false;cooldownAnimationSerial++;
        if(walletLane)walletLane.Close();
    }); } catch(ignored) {}

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
        setProperty(panel,"text",String(value===undefined?"":value));
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

    // Full input is ingested once. Delta ingestion touches only supplied IDs;
    // the dense row array uses swap removal, while presentation has its own
    // configured order. Never reconstruct a shelf map from old rows per delta.
    function entryShape(entry) {
        return JSON.stringify([entry.visible,entryCompleted(entry),entry.shop_id,entry.category_id,
            entry.sort_order,entry.content_type,entry.technology_track,entry.technology_group,entry.content_id,
            entry.icon_type,entry.icon,entry.technology_id]);
    }
    function rememberEntry(entry, position, full) {
        if (!entry || !entry.entry_id) return;
        var id=entry.entry_id, signature=contentSignature(entry,false), shape=entryShape(entry);
        if (entryContents[id] !== signature) { dirtyEntries[id]=true; contentRevision++; }
        if (entryShapes[id] !== shape) structureRevision++;
        if(entryOrder[id]===undefined)entryOrder[id]=++nextEntryOrder;
        entriesById[id]=entry; entryPositions[id]=position;
        entryContents[id]=signature; entryShapes[id]=shape;
        costs[full?"full_rows":"delta_rows"]++;
    }
    function indexEntries(rows) {
        var previous=entriesById, seen={};
        entriesById={}; entryPositions={};
        rows.forEach(function(entry,index){
            if (!entry || !entry.entry_id) return;
            seen[entry.entry_id]=true; rememberEntry(entry,index,true);
        });
        Object.keys(previous).forEach(function(id){
            if (seen[id]) return;
            delete entryContents[id]; delete entryShapes[id]; delete entryOrder[id];
            dirtyEntries[id]=true; contentRevision++; structureRevision++;
        });
    }
    function removeEntry(id) {
        if (!Object.prototype.hasOwnProperty.call(entryPositions,id)) return;
        var rows=snapshot.entries, position=entryPositions[id], last=rows.pop();
        if (position<rows.length) { rows[position]=last; entryPositions[last.entry_id]=position; }
        delete entriesById[id]; delete entryPositions[id]; delete entryContents[id]; delete entryShapes[id]; delete entryOrder[id];
        dirtyEntries[id]=true; contentRevision++; structureRevision++; costs.delta_rows++;
    }
    function rememberRoot(payload, full) {
        var seen={};
        Object.keys(payload).forEach(function(key){
            if (key==="entries"||key==="changed_entries"||key==="removed_entry_ids"
                ||key==="sequence"||key==="base_sequence"||key==="full"||key==="reason") return;
            var until=key==="technology_cooldown_remaining"?"technology_cooldown_until":
                key==="early_final_cooldown_remaining"?"early_final_cooldown_until":null;
            var deadline=until&&(payload[until]===undefined?snapshot&&snapshot[until]:payload[until]);
            if (until&&Number(deadline)>0) return;
            seen[key]=true; costs.root_fields++;
            var signature=contentSignature(payload[key],false);
            if(rootContents[key]!==signature){rootContents[key]=signature;contentRevision++;}
        });
        if(full)Object.keys(rootContents).forEach(function(key){
            if(!seen[key]){delete rootContents[key];contentRevision++;}
        });
    }

    function formatNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        if (formatter && formatter.Format) return formatter.Format(value);
        return String(value || 0);
    }

    function setStatus(text, error) {
        if(!drawerOpened)return;
        var target = byId("ShopStatus");
        if (!target) return;
        setProperty(target,"text",text||"");
        setClass(target,"error",!!error);
    }

    function showPurchaseFailure(message) {
        setStatus("", false);
        var tips = GameUI.CustomUIConfig().SurvivalTooltipPosition;
        if (tips && tips.ShowActionTip) tips.ShowActionTip($.GetContextPanel(), message || "条件不满足");
    }

    function setLoading(loading) {
        var loadingPanel = byId("ShopLoading");
        var itemList = byId("ShopItemList");
        setClass(loadingPanel,"Hidden",!loading);
        setClass(itemList,"Hidden",loading);
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
            source_entindex: researchSourceEntindex,
            hud_wallet: walletLane ? walletLane.RequestFlag() : 0
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
                    : "武器装备 · 道具材料 · 提前终战")
        );
        var shopToggle = byId("ShopModeShop");
        var challengeToggle = byId("ShopModeChallenge");
        if (shopToggle) shopToggle.SetHasClass("Selected", !research && !challenge);
        if (challengeToggle) challengeToggle.SetHasClass("Selected", challenge);
    }

    function setOpenState(opened) {
        drawerOpened=opened;if(!opened)cooldownAnimationSerial++;
        if(shopShell){if(opened)shopShell.Open();else shopShell.Close();}
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
        renderSnapshot(true);
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
        renderSnapshot(true);
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
        renderSnapshot(true);
        requestSnapshot();
    }

    function close() {
        if(walletLane)walletLane.Close();
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
        var shopButton = byId("CustomShopButton");
        if (shopButton) shopButton.SetHasClass("Locked", !unlocks.shop);
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
        var windowPanel = byId("CustomShopWindow");
        if (windowPanel && !windowPanel.BHasClass("Hidden")) requestSnapshot();
    }

    function createEntryIcon(parent, entry, className) {
        var native = GameUI.CustomUIConfig().SurvivalNativeIcons;
        if (native && native.Create(parent, entry, className)) return;
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
        if (entryUnavailable(entry) || entryCompleted(entry)) {
            showPurchaseFailure(entry && entry.disabled_reason);
            return;
        }
        if (entry.content_type === "technology" && !queuedTechnology(entry)
            && technologyCooldownRemaining() > 0) {
            showPurchaseFailure("已有科技正在研究中，请稍候");
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
        var mask = card.__survivalCooldownMask;
        var isSource = !!source && (String(entry.entry_id) === source
            || String(entry.technology_group || "") === source);
        var active = isSource && remaining > 0;
        setClass(card,"CooldownSource",active);
        setProperty(mask,"visible",active);
        if (!active) return;
        var progress = Math.max(0, Math.min(1, remaining / Math.max(0.01, total)));
        var endAngle = Math.max(0, Math.min(360, progress * 360));
        setProperty(mask.style,"clip","radial(50% 50%, 0deg, "+endAngle.toFixed(2)+"deg)");
    }

    function updateAllCooldownOverlays() {
        if (!drawerOpened || !snapshotMatchesContext(snapshot)) return;
        var serial = ++cooldownAnimationSerial;
        var remaining = technologyCooldownRemaining();
        var animationRemaining = 0;
        var source = technologyCooldownSource();
        var total = Number(snapshot && snapshot.technology_cooldown_total || 2);
        var next={}, visit={}, locked=remaining>0;
        if(locked){
            if(entryCardsById[source])next[source]=true;
            Object.keys(cooldownGroups[source]||{}).forEach(function(id){next[id]=true;});
        }
        Object.keys(earlyCooldownCards).forEach(function(id){next[id]=true;});
        Object.keys(previousCooldownCards).forEach(function(id){visit[id]=true;});
        Object.keys(next).forEach(function(id){visit[id]=true;});
        // A global lock transition changes all technology buttons once. The
        // 20Hz animation itself visits only source/previous active masks.
        if(cooldownLocksActive!==locked){
            cooldownLocksActive=locked;
            Object.keys(technologyCards).forEach(function(id){
                var entry=entryById(id),card=entryCardsById[id];
                if(card&&entry)setClass(card,"PurchaseCooldownLocked",locked&&!queuedTechnology(entry));
            });
        }
        Object.keys(visit).forEach(function (entryId) {
            var card = entryCardsById[entryId];
            var entry = entryById(entryId);
            if (card && entry) {
                costs.cooldown_rows++;
                updateCooldownOverlay(card, entry, remaining, total, source);
                if (card.__survivalCooldownMask && card.__survivalCooldownMask.visible) {
                    animationRemaining = Math.max(animationRemaining, remaining, earlyFinalCooldownRemaining(entry));
                } else if(entry.content_id==="service_early_final_boss")delete earlyCooldownCards[entryId];
            }
        });
        previousCooldownCards=next;
        if (animationRemaining <= 0) return;
        $.Schedule(0.05, function tick() {
            if (!drawerOpened || serial !== cooldownAnimationSerial) return;
            updateAllCooldownOverlays();
        });
    }

    function updateEntryCard(card, entry) {
        if (!card || !entry) return;
        costs.render_rows++;
        var signature=contentSignature(entry,false)+"|"+(technologyCooldownRemaining()>0&&!queuedTechnology(entry));
        if(card.__survivalEntrySignature===signature)return;
        card.__survivalEntrySignature=signature;
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
        setProperty(card,"visible",!entryCompleted(entry));
        setProperty(card,"hittest",true);
        if (card.__survivalLockBadge) {
            setProperty(card.__survivalLockBadge,"text",lockBadgeText(entry));
            setProperty(card.__survivalLockBadge,"visible",card.__survivalLockBadge.text!=="");
        }
        if (card.__survivalStockLabel) {
            card.__survivalStockLabel.text = "库存 " + Number(entry.stock || 0)
                + "/" + Number(entry.stock_max || 0);
        }
        setProperty(card.__survivalNameLabel,"text",entry.name||"");
        setProperty(card.__survivalLevelLabel,"text",entry.level_text||("Lv."+Number(entry.technology_level||0)));
        var tooltip=GameUI.CustomUIConfig().SurvivalShopTooltip;if(tooltip&&tooltip.UpdateEntry)tooltip.UpdateEntry(entry);
        updateCooldownOverlay(card, entry, technologyCooldownRemaining(),
            Number(snapshot && snapshot.technology_cooldown_total || 2),
            technologyCooldownSource());
    }





    function visibleEntries() {
        var entries = asArray(snapshot && snapshot.entries).filter(function (entry) {
            return entry && entry.visible === 1 && !entryCompleted(entry);
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
                || (a.sort_order || 0) - (b.sort_order || 0)
                || entryOrder[a.entry_id]-entryOrder[b.entry_id];
        });
        return entries;
    }







    function renderItems() {
        var list = byId("ShopItemList");
        if (!list || !snapshot) return;
        if (!drawerOpened) return;
        var nextSignature=currentMode+"|"+structureRevision;
        if(nextSignature===renderedStructureSignature){
            Object.keys(dirtyEntries).forEach(function(id){updateEntryCard(entryCardsById[id],entriesById[id]);});
            updateAllCooldownOverlays();return;
        }
        var entries=visibleEntries();costs.container_builds++;
        renderedStructureSignature = nextSignature;
        entryCardsById = {};
        cooldownGroups={};technologyCards={};earlyCooldownCards={};previousCooldownCards={};cooldownLocksActive=false;
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
                sectionText = "提前终战";
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
            card.AddClass("ShopShelfSlot"); U.CardShell.Adopt(card,{bodyVariant:"product"});
            card.SetHasClass("Unavailable", entryUnavailable(entry));
            card.SetHasClass("Technology", entry.content_type === "technology");
            card.SetHasClass("AutoResearchAvailable", entry.auto_research_available === 1);
            card.SetHasClass("AutoResearchActive", entry.auto_research_enabled === 1);
            card.SetAttributeString("entry_id", entry.entry_id || "");
            entryCardsById[entry.entry_id] = card;
            if(entry.content_type==="technology"){
                technologyCards[entry.entry_id]=true;var group=String(entry.technology_group||"");
                if(group){if(!cooldownGroups[group])cooldownGroups[group]={};cooldownGroups[group][entry.entry_id]=true;}
            }

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
                level.AddClass("ShopTechnologyLevel");card.__survivalLevelLabel=level;
                level.text = entry.level_text || ("Lv." + Number(entry.technology_level || 0));
                if (entry.technology_id) {
                    var code = $.CreatePanel("Label", frame, "");
                    code.AddClass("ShopTechnologyCode");
                    code.text = entry.technology_id;
                }
            } else if (currentMode === "challenge"
                || entry.content_id === "service_early_final_boss") {
                var name = $.CreatePanel("Label", frame, "");
                name.AddClass("ShopCardName");card.__survivalNameLabel=name;
                name.text = entry.name || "";
            }
            if (Number(entry.stock_max || 0) > 0) {
                var stockLabel = $.CreatePanel("Label", frame, "");
                stockLabel.AddClass("ShopStockLabel");
                stockLabel.text = "库存 " + Number(entry.stock || 0)
                    + "/" + Number(entry.stock_max);
                card.__survivalStockLabel = stockLabel;
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
        asArray(payload.removed_entry_ids).forEach(function (entryId) {
            removeEntry(entryId);
        });
        asArray(payload.changed_entries).forEach(function (entry) {
            if (!entry || !entry.entry_id) return;
            var position=entryPositions[entry.entry_id];
            if(position===undefined)position=snapshot.entries.length;
            snapshot.entries[position]=entry;rememberEntry(entry,position,false);
        });
        // Omitted fields retain their previous values. Carry all supplied business
        // fields, including research queues and purchase cooldowns, without a
        // second hand-maintained projection that can silently lose new fields.
        rememberRoot(payload,false);
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
        var signature = currentMode + "|" + "legacy" + "|" + contentRevision;
        if (!force && signature === renderedSnapshotSignature) return;
        renderedSnapshotSignature = signature;
        updateModeText();
        setLoading(false);
        renderResources();
        renderItems();
        dirtyEntries={};
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
            rememberRoot(payload,true);
            snapshot = payload;
            snapshot.entries=asArray(payload.entries);
            indexEntries(snapshot.entries);
        }
        latestSequence = Math.max(latestSequence, sequence);
        rejectedPatchSequence=-1;
        if(walletLane)walletLane.Apply(snapshot,payload.full===0?[]:asArray(snapshot.entries),payload.full===0?
            {changed:asArray(payload.changed_entries),removed:asArray(payload.removed_entry_ids)}:null);
        if (!drawerOpened) return;
        snapshotRequest=null;snapshotRequestFailed=false;
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
        if(walletLane&&walletLane.RequestFlag()&&!(payload.snapshot&&payload.snapshot.hud_wallet===1))requestSnapshot();
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
        if (payload.success !== 1) {
            // The UI request router owns exactly one failure notification.
            setStatus("", false);
            return;
        }
        if (payload.success === 1
            && Number(payload.close_shop_and_focus_hero || 0) === 1) {
            close();
            focusHero(payload);
            return;
        }
        setStatus(currentMode === "research"
            ? "已开始研究，请等待进度完成……"
            : "购买成功，正在刷新商店状态……", false);
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
        DisposeWallet:function(){drawerOpened=false;cooldownAnimationSerial++;if(walletLane)walletLane.Close();},
        Open: open,
        Close: close,
        Toggle: toggle,
        ToggleShop: toggleShop,
        OpenChallenge: openChallenge,
        OpenResearch: openResearch,
        ToggleChallenge: toggleChallenge,
        SetUnlocks: setUnlocks,
        Refresh: refresh,
        InspectPerformance:function(){var result={};Object.keys(costs).forEach(function(key){result[key]=costs[key];});return result;}
    };
    var shopShell=U.ModalShell.Adopt({id:"shop",panel:byId("CustomShopWindow"),root:$.GetContextPanel(),header:byId("ShopHeader"),titlePanel:byId("ShopTitle"),scrim:byId("ShopBackdrop"),scrimButton:byId("ShopBackdropClick"),closeButton:byId("ShopCloseButton"),width:1208,height:806,onClose:close});
    ["ShopModeShop","ShopModeChallenge","ShopModeLottery"].forEach(function(id){if(byId(id))U.TabBar.Adopt(byId(id));});
    U.ActionButton.Adopt(byId("ShopRefreshButton")); U.Tooltip.Adopt(byId("ShopEntryTooltip"));
    setUnlocks(GameUI.CustomUIConfig().SurvivalShopUnlocks || unlocks);
    setOpenState(false);
})();
