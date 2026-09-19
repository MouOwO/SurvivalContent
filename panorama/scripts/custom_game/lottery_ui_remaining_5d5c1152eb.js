(function () {
    "use strict";
    // UI_REUSE_V1
    var U=GameUI.CustomUIConfig().SurvivalUI, LH=GameUI.CustomUIConfig().LotteryHandoff, RH=GameUI.CustomUIConfig().RemainingHandoff;

    var drawSequence=U.DrawResultSequence();
    var infoOptions={id:"lottery_info",panel:$("#LotteryInfoDialog"),root:$.GetContextPanel(),scrim:$("#LotteryInfoOverlay"),header:$("#LotteryInfoHeader"),titlePanel:$("#LotteryInfoTitle"),closeButton:$("#LotteryInfoClose"),width:840,height:610,fit:{reference:[1672,941]},onClose:closeInfo};
    var infoShell=U.ModalShell.Adopt(infoOptions); RH.Window(infoOptions.panel,infoOptions.header,infoOptions.closeButton);
    U.FullscreenShell.Adopt({panel:$("#LotteryWindow")});
    ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm","LotteryInfoConfirm"].forEach(function(id){U.ActionButton.Adopt($("#"+id),{variant:id==="LotteryTenButton"||id==="LotteryAgain"?"gold":"ivory"});});
    RH.LotteryActions();U.Checkbox.Adopt($("#LotterySkipAnimation")); LH.CloseButton($("#LotteryCloseButton"),close);
    var state = null;
    var poolCache={}, poolVersions={}, poolAssemblies={};
    var pending = false;
    var requestSerial = 0;
    var selectedPoolId = "map";
    var visibleResults = [];
    var activeTooltipItem = null, archiveEffectTooltipActive = false;
    var animating = false, animationSerial = 0, skipAnimation = !!$("#LotterySkipAnimation").checked;
    var resultCards = [], lastDrawCount = 1, history = [], seenResults = {};
    var activeRequest = null, opened = false, switchingPool = false;
    var motion = { single: {enter:650, flip:1250, ready:2000}, ten: {enter:800, enterStep:40, flip:1350, flipStep:110, ready:2800}, flipHalf:100 };
    var historyPoolId = "map", detailPoolId = null, detailState = null, detailRequestSerial = 0;
    var animationTimers = [], activeFeature = "", reopenDetails = false, knownPools = [], selectedRewardId = null, poolCards = [];
    var skipRevealButton=$("#LotterySkipReveal");skipRevealButton.hittest=true;skipRevealButton.hittestchildren=false;skipRevealButton.SetPanelEvent("onactivate",function(){finishReveal();$.Msg("[LOTTERY_SKIP_UI] actual_results="+visibleResults.length);});
    function cancelAnimation() { animationSerial++; drawSequence.Cancel(); animationTimers = []; }
    function cardState(card, name, on) { if (card && (!card.IsValid || card.IsValid())) card.SetHasClass(name, on); }
    function drawCost(selected, count) { var value = Number(count === 10 ? selected.ten_cost : selected.single_cost); return isFinite(value) && value >= 0 ? value : count; }

    function label(parent, text, className) {
        var node = $.CreatePanel("Label", parent, "");
        node.text = String(text || "");
        if (className) node.AddClass(className);
        node.hittest = false;
        return node;
    }
    function rootClass(name, on) { var root = panel("LotteryWindow"); if (root) root.SetHasClass(name, on); }
    function closeInfo() { detailRequestSerial++; activeFeature = ""; infoShell.Close(); var info = panel("LotteryInfoOverlay"); if (info) info.AddClass("LotteryInfoHidden"); hideTooltip(); reopenDetails = false; updateButtons(); }
    function updateButtons() {
        var selected = state && (state.selected_pool || state);
        var locked = pending || animating || switchingPool || !selected || !!activeFeature;
        [["LotterySingleButton", 1], ["LotteryTenButton", 10], ["LotteryAgain", lastDrawCount]].forEach(function (entry) {
            var button = panel(entry[0]);
            if (!button) return;
            var cost = selected ? drawCost(selected, entry[1]) : 0;
            if (!isFinite(cost)) cost = entry[1];
            button.enabled = !locked && Number(selected.tickets || 0) >= cost;
            button.SetHasClass("Disabled", !button.enabled);
        });
        var confirm = panel("LotteryConfirm"); if (confirm) confirm.enabled = !pending && !animating;
        var refresh = panel("LotteryRefreshButton"); if (refresh) refresh.enabled = !pending && !animating;
        rootClass("LotteryWaiting", pending);
        setText("LotterySingleText", pending && lastDrawCount === 1 ? "请求中…" : (selected && drawCost(selected,1) === 0 ? "免费单抽" : "单抽"));
        setText("LotteryTenText", pending && lastDrawCount === 10 ? "请求中…" : "10连");
        LH.Buttons(selected, pending && lastDrawCount === 10);
    }
    function finishReveal() {
        cancelAnimation();
        animating = false;
        rootClass("LotteryAnimating", false);
        rootClass("LotteryCharging", false);
        resultCards.forEach(function (card) { ["LotteryCardCovered", "LotteryCardEntering", "LotteryCardNarrow"].forEach(function (name) { cardState(card, name, false); }); });
        updateButtons();
    }
    function revealResults() {
        if (skipAnimation || !opened || !visibleResults.length) return;
        cancelAnimation();
        var generation = animationSerial, ten = lastDrawCount === 10, timing = ten ? motion.ten : motion.single;
        animating = true; rootClass("LotteryAnimating", true); rootClass("LotteryCharging", true);
        resultCards.forEach(function (card) { cardState(card,"LotteryCardCovered",true); cardState(card,"LotteryCardEntering",true); });
        updateButtons(); setText("LotteryRevealPhase", "星轨汇聚");
        drawSequence.Play(visibleResults,{timing:timing,flipHalf:motion.flipHalf,onCharged:function(){rootClass("LotteryCharging",false);},onEnter:function(i){cardState(resultCards[i],"LotteryCardEntering",false);},onFlip:function(i){cardState(resultCards[i],"LotteryCardNarrow",true);},onReveal:function(i){cardState(resultCards[i],"LotteryCardCovered",false);cardState(resultCards[i],"LotteryCardNarrow",false);},onReady:finishReveal});
    }

    function panel(id) { return $("#" + id); }
    function setText(id, value) {
        var target = panel(id);
        if (target) { target.text = String(value === undefined ? "" : value); if(id === "LotteryInfoRules"){target.html=true;target.text=RH.QualityText(value);} }
        if (id === "LotteryStatus") LH.Status(String(value || ""));
        if (id === "LotteryGuaranteeValue") LH.Guarantee([]);
    }
    function rows(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return value[key]; });
    }
    function succeeded(value) {
        return value === true || Number(value) === 1;
    }
    function requestId() {
        requestSerial += 1;
        return "lottery_" + Date.now() + "_" + requestSerial;
    }
    function historyTime() {
        // Avoid locale/Intl formatting in the embedded V8 runtime. A native
        // failure cannot be recovered with JavaScript try/catch.
        var time = new Date();
        function two(value) { return value < 10 ? "0" + value : String(value); }
        return two(time.getHours()) + ":" + two(time.getMinutes()) + ":" + two(time.getSeconds());
    }
    function qualityText(quality) {
        return String(quality || "n").toUpperCase();
    }
    function qualityClass(quality) {
        return "LotteryQuality_" + qualityText(quality);
    }

    function errorText(code) {
        var messages = {
            lottery_ticket_insufficient: "抽奖券不足",
            lottery_ticket_consume_failed: "抽奖券扣除失败",
            lottery_item_grant_failed: "奖励发放失败",
            lottery_pool_empty: "奖池配置为空",
            lottery_player_busy: "上一项操作尚未完成",
            lottery_count_invalid: "抽奖次数不合法",
            lottery_request_id_invalid: "抽奖请求无效",
            lottery_pool_invalid: "奖池不存在或尚未开放",
            inventory_tx_snapshot_unavailable: "内容背包尚未就绪",
            inventory_tx_player_locked: "内容背包正在处理其他操作"
        };
        return messages[String(code || "")] || String(code || "未知错误");
    }

    function createRewardIcon(parent,item,className) {
        // Daedalus is the display name; Valve's texture/item key is greater_crit. UI-only alias.
        if(item.icon === "item_daedalus"){var art={};Object.keys(item).forEach(function(k){art[k]=item[k];});art.icon="item_greater_crit";item=art;}
        return GameUI.CustomUIConfig().SurvivalRewardPresentation.CreateIcon(parent,item,className||"LotteryRewardIcon");
    }

    function createIconFrame(parent, item, className) {
        var frame = $.CreatePanel("Panel", parent, "");
        frame.AddClass(className || "LotteryRewardIconFrame");
        frame.AddClass(qualityClass(item.quality));
        frame.hittest = false;
        frame.hittestchildren = false;
        createRewardIcon(frame, item, "LotteryRewardIcon");
        var quality = $.CreatePanel("Label", frame, "");
        quality.AddClass("LotteryRewardQuality");
        quality.text = qualityText(item.quality);
        quality.hittest = false;
        return frame;
    }

    function hideTooltip() {
        if(archiveEffectTooltipActive){var archiveTip=GameUI.CustomUIConfig().ArchiveHandoff;if(archiveTip)archiveTip.Hide();archiveEffectTooltipActive=false;}
        activeTooltipItem = null;
        var tooltip = panel("LotteryItemTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function showTooltip(item, sourcePanel, simple) {
        hideTooltip();
        if(simple){
            var archiveTip=GameUI.CustomUIConfig().ArchiveHandoff;
            if(archiveTip&&archiveTip.ShowEffectOnly&&item&&sourcePanel){
                archiveEffectTooltipActive=true;
                archiveTip.ShowEffectOnly({name:item.name||item.id||'未命名道具',description:item.description||'暂无效果说明'},sourcePanel);
            }
            return;
        }
        var tooltip = panel("LotteryItemTooltip");
        var iconHost = panel("LotteryTooltipIconHost");
        if (!tooltip || !iconHost || !item || !sourcePanel) return;
        activeTooltipItem = item;
        tooltip.SetHasClass("LotterySimpleTooltip", !!simple);
        tooltip.style.zIndex = "100010";
        iconHost.RemoveAndDeleteChildren();
        if (!simple) createIconFrame(iconHost, item, "LotteryTooltipIconFrame");
        setText("LotteryTooltipName", item.name || item.id || "未命名道具");
        panel("LotteryTooltipName").style.color = GameUI.CustomUIConfig().SurvivalRewardPresentation.NameColor(item.quality);
        setText("LotteryTooltipType", "类型：" + String(item.item_type || "积分道具"));
        setText("LotteryTooltipDuration", "期限：" + String(item.duration_text || "永久"));
        setText("LotteryTooltipDescription", simple ? String(item.description || "暂无属性说明") : "简介：" + String(item.description || "暂无简介"));
        ["N", "R", "SR", "SSR", "UR"].forEach(function (quality) {
            tooltip.SetHasClass("LotteryQuality_" + quality, false);
        });
        tooltip.AddClass(qualityClass(item.quality));
        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (activeTooltipItem !== item) return;
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner && positioner.PlaceRight) {
                positioner.PlaceRight(tooltip, sourcePanel, 340, 210);
            }
        });
    }

    function renderChest() {
        var list = panel("LotteryItemList");
        if (!list) return;
        hideTooltip();
        list.RemoveAndDeleteChildren();
        resultCards = [];
        rootClass("LotteryResultsShown", false);
        list.SetHasClass("LotterySingleResult", false);
        list.SetHasClass("LotteryTenResults", false);
        list.SetHasClass("LotteryChestMode", true);
        // The main scene already contains the illustrated chest; no stock icon overlay.
    }

    function createResultCard(parent, item) {
        var card = $.CreatePanel("Panel", parent, "");
        card.AddClass("LotteryRewardCard");
        var outline=$.CreatePanel("Panel",card,"");outline.AddClass("LotteryCardState");outline.hittest=false;
        card.AddClass(qualityClass(item.quality));
        card.style.borderColor = GameUI.CustomUIConfig().SurvivalRewardPresentation.NameColor(item.quality);
        card.hittestchildren = false;
        var iconFrame = createIconFrame(card, item, "LotteryRewardIconFrame");
        var name = $.CreatePanel("Label", card, "");
        name.AddClass("LotteryRewardName");
        name.text = item.name || item.id || "物品";
        label(card, item.description || "暂无效果说明", "LotteryRewardDescription");
        label(card, item.duration_text || "永久", "LotteryRewardDuration");
        var back = $.CreatePanel("Panel", card, "");
        back.AddClass("LotteryCardBack");
        label(card, "×" + Number(item.count || item.quantity || 1), "LotteryRewardQuantity");
        if (succeeded(item.duplicate)) {
            var duplicate = $.CreatePanel("Label", iconFrame, "");
            duplicate.AddClass("LotteryDuplicateBadge");
            duplicate.text = "已转化 "
                + Number(item.converted_points || 0) + " 积分";
            duplicate.hittest = false;
        }
        card.SetPanelEvent("onmouseover", function () {
            if (card.BHasClass("LotteryCardCovered")) return;
            showTooltip(item, card);
        });
        card.SetPanelEvent("onmouseout", hideTooltip);
        card.SetPanelEvent("onactivate", function () { if (!card.BHasClass("LotteryCardCovered")) rewardDetails(item); });
        return card;
    }

    function renderResults(items) {
        var list = panel("LotteryItemList");
        if (!list) return;
        hideTooltip();
        list.RemoveAndDeleteChildren();
        rootClass("LotteryResultsShown", true);
        setText("LotteryAgainText", lastDrawCount === 10 ? "再开十次" : "再开一次");
        list.SetHasClass("LotteryChestMode", false);
        list.SetHasClass("LotterySingleResult", items.length === 1);
        list.SetHasClass("LotteryTenResults", items.length > 1);
        resultCards = items.map(function (item) { return createResultCard(list, item); });
    }

    function renderDrawStage() {
        if (animating) return;
        if (visibleResults.length > 0) renderResults(visibleResults);
        else renderChest();
    }

    var readsPending = {};
    // Keep local reads through panel reloads; cloud acknowledgements retain them across games.
    var localReads = GameUI.CustomUIConfig().SurvivalLotteryDetailReads;
    if (!localReads) localReads = GameUI.CustomUIConfig().SurvivalLotteryDetailReads = {};
    function readKey(pool) {
        var player = typeof Game !== "undefined" && Game.GetLocalPlayerInfo ? Game.GetLocalPlayerInfo() : null;
        return String(player && player.player_steamid || "local") + ":" + String(pool.id);
    }
    function poolUpdatedAt(pool) {
        var value = Number(pool.updated_at || (pool.update_notice && pool.update_notice.updated_at) || 0);
        return isFinite(value) && value > 0 ? value : 0;
    }
    function detailsUnread(pool) {
        var read = localReads[readKey(pool)], updated = poolUpdatedAt(pool);
        if (read) return updated > 0 ? read.opened_at < updated : read.revision !== String(pool.revision || "");
        return succeeded(pool.update_unread);
    }
    function recordDetailsRead(pool) {
        if (!pool || !pool.id) return;
        localReads[readKey(pool)] = {
            opened_at: Math.max(Date.now() / 1000, poolUpdatedAt(pool)),
            revision: String(pool.revision || "")
        };
        updateDots();
        markRead(pool, "details");
    }
    function sortedRewards(value) {
        var rank = {UR:0, SSR:1, SR:2, R:3, N:4};
        return rows(value).slice().sort(function(a,b) {
            var delta = rank[qualityText(a.quality)] - rank[qualityText(b.quality)];
            return delta || (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
        });
    }
    function markRead(pool, action) {
        if (!pool || !pool.revision) return;
        var key = pool.id + ':' + action + ':' + pool.revision;
        if (readsPending[key]) return;
        readsPending[key] = true;
        GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request", {
            pool_id:pool.id, read_action:action, revision:pool.revision, snapshot_scope:"read"
        });
    }
    function updateDots() {
        var button = panel("LHDetails");
        if (!button) return;
        var dot = panel("LotteryUpdateDot");
        if (!dot) { dot = $.CreatePanel("Panel",button,"LotteryUpdateDot"); dot.AddClass("LotteryUpdateDot"); dot.hittest=false; }
        dot.visible = knownPools.some(function(p){return String(p.id) === selectedPoolId && detailsUnread(p);});
    }
    function requestSnapshot(visit) {
        GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request", {
            pool_id: selectedPoolId, read_action: visit ? "visit" : ""
        });
    }

    function resetDrawStage() {
        if (pending) return;
        finishReveal();
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "请选择开启数量");
    }

    function open() {
        var root = panel("LotteryWindow");
        if (!root) return;
        opened = true;
        LH.Prepare();
        LH.Background(selectedPoolId);
        var layers = GameUI.CustomUIConfig().SurvivalUILayers;
        if (layers) layers.Open("lottery", root, close);
        root.SetHasClass("LotteryOpen", true);
        root.SetHasClass("LotteryClosed", false); LH.Open();
        renderDrawStage();
        updateButtons();
        if(poolCache[selectedPoolId])render(poolCache[selectedPoolId]);else requestSnapshot(true);
        markRead(state&&state.selected_pool,"visit");
    }

    function openFromShop() {
        var shop = GameUI.CustomUIConfig().SurvivalShop;
        if (shop && shop.Close) shop.Close();
        $.Schedule(0.01, open);
    }

    function close() {
        opened = false;
        var layers = GameUI.CustomUIConfig().SurvivalUILayers; if (layers) layers.Close("lottery");
        finishReveal(); closeInfo();
        hideTooltip();
        var root = panel("LotteryWindow");
        if (!root) return;
        root.SetHasClass("LotteryOpen", false);
        root.SetHasClass("LotteryClosed", true); LH.Close();
    }

    function toggle() {
        var root = panel("LotteryWindow");
        if (root && root.BHasClass("LotteryOpen")) close(); else open();
    }

    function selectDetailPool(poolId) {
        var cached=poolCache[String(poolId||"map")];
        if(cached){detailPoolId=String(poolId||"map");detailState=cached;selectedRewardId=null;feature("details");return;}
        detailPoolId = String(poolId || "map"); detailState = null; selectedRewardId = null;
        feature("details");
        GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request", {pool_id: detailPoolId, snapshot_scope: "details", snapshot_request_id: ++detailRequestSerial});
    }

    function selectPool(poolId) {
        if (activeFeature === "details") { selectDetailPool(poolId); return; }
        if (pending || animating || switchingPool) return;
        selectedPoolId = String(poolId || "map");
        LH.Background(selectedPoolId);
        if(poolCache[selectedPoolId]){
            selectedRewardId=null;visibleResults=[];closeInfo();
            render(poolCache[selectedPoolId]);markRead(state&&state.selected_pool,"visit");return;
        }
        switchingPool = true;
        reopenDetails = activeFeature === "details";
        state = null; selectedRewardId = null;
        if (reopenDetails) feature("details"); else closeInfo();
        ["LotteryTitle","LotterySubtitle","LotteryGuaranteeValue","LotteryTicketValue","LotterySingleCost","LotteryTenCost"].forEach(function (id) { setText(id,"正在读取…"); });
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "正在切换奖池……");
        requestSnapshot(true);
        updateButtons();
    }

    function renderPoolTabs(pools, hostId) {
        var host = panel(hostId || "LotteryPoolTabs");
        if (!host) return;
        host.RemoveAndDeleteChildren();
        rows(pools).forEach(function (pool,index) {
            var button = $.CreatePanel("Button", host, "");
            button.AddClass("LotteryPoolTab"); U.TabBar.Adopt(button); LH.Tab(button,pool,hostId); if(hostId === "LotteryInfoTabs") RH.Tab(button,index);
            var mark = $.CreatePanel("Image", button, ""); mark.AddClass("LotteryTabMark");  mark.hittest = false;
            button.SetHasClass("Selected", String(pool.id) === (hostId === "LotteryInfoTabs" ? (activeFeature === "history" ? historyPoolId : detailPoolId) : selectedPoolId));
            var label = $.CreatePanel("Label", button, "");
            label.text = pool.display_name || pool.id;
            label.AddClass("LotteryPoolTabName");
            if (String(pool.id) === "map") label.text = "地图宝箱";
            label.text=LH.Name(String(pool.id),label.text);
            var badge = $.CreatePanel("Label", button, "");
            badge.AddClass("LotteryPoolBadge");
            var guarantees = rows(pool.pity);
            badge.text = guarantees.length ? String(guarantees[0].label || "十连保底") : "";
            button.SetPanelEvent("onactivate", function () {
                if (hostId === "LotteryInfoTabs") { if(activeFeature === "history") {historyPoolId=String(pool.id);feature("history");} else selectDetailPool(pool.id); } else selectPool(pool.id);
            });
        });
        if(hostId === "LotteryInfoTabs") RH.TabSelection(host,activeFeature === "history");
    }

    function renderGuarantee(pity) {
        var rules = rows(pity);
        var text = rules.length > 0
            ? String(rules[0].label || (Number(rules[0].batch_size || 10)
                + "连保底 " + qualityText(rules[0].quality)))
            : "本奖池无批量保底";
        setText("LotteryGuaranteeValue", text); LH.Guarantee(rules);
    }

    function render(snapshot) {
        if (!snapshot) return;
        var cacheId=String(snapshot.selected_pool_id||"");
        if(snapshot.snapshot_scope==="cache"||snapshot.snapshot_scope==="cache_patch"){
            var seq=Number(snapshot.cache_sequence||0);
            if(seq<=(poolVersions[cacheId]||0))return;
            if(snapshot.snapshot_scope==="cache_patch"){
                var parts=poolAssemblies[cacheId];
                if(!parts||seq>parts.sequence)parts=poolAssemblies[cacheId]={sequence:seq,chunks:{}};
                if(seq!==parts.sequence)return;
                parts.chunks[snapshot.chunk]=rows(snapshot.changes);
                if(Object.keys(parts.chunks).length!==Number(snapshot.chunks))return;
                var changes=[];for(var i=1;i<=Number(snapshot.chunks);i++)changes=changes.concat(parts.chunks[i]);
                delete poolAssemblies[cacheId];
                if(poolVersions[cacheId]!==Number(snapshot.base_sequence)){
                    GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request",{prefetch:1,pool_id:selectedPoolId});return;
                }
                snapshot=GameUI.CustomUIConfig().SurvivalSnapshotCache.Apply(poolCache[cacheId],changes);
            }
            snapshot.snapshot_scope="main";
            poolVersions[cacheId]=seq;poolCache[cacheId]=snapshot;
            rows(snapshot.items).forEach(function(item){
                GameUI.CustomUIConfig().SurvivalSnapshotCache.Warm("lottery:"+cacheId+":"+item.id+":"+item.icon,function(host){createRewardIcon(host,item,"LotteryRewardIcon");});
            });
            if(activeFeature==="details"&&detailPoolId===cacheId){detailState=snapshot;feature("details");}
        }
        if (snapshot.snapshot_scope === "read") {
            if (snapshot.error || snapshot.read_error) { readsPending = {}; return; }
            knownPools = rows(snapshot.pools); updateDots();
            renderPoolTabs(knownPools);
            if (activeFeature === "details") renderPoolTabs(knownPools, "LotteryInfoTabs");
            return;
        }
        if (snapshot.snapshot_scope === "details") {
            if (activeFeature !== "details" || Number(snapshot.snapshot_request_id) !== detailRequestSerial) return;
            detailState = snapshot.error ? null : snapshot; feature("details");
            if (snapshot.error) setText("LotteryInfoRules", "加载失败：" + errorText(snapshot.error));
            return;
        }
        if (activeFeature === "details" && snapshot.selected_pool_id && String(snapshot.selected_pool_id) === detailPoolId && detailPoolId !== selectedPoolId) {
            detailState = snapshot.error ? null : snapshot;
            feature("details");
            if (snapshot.error) setText("LotteryInfoRules", "加载失败：" + errorText(snapshot.error));
            return;
        }
        if (snapshot.error) {
            state = null; switchingPool = false; updateButtons();
            if (activeFeature === "details") { feature("details"); setText("LotteryInfoRules", "加载失败：" + errorText(snapshot.error)); }
            setText("LotteryStatus", "抽奖数据加载失败："
                + errorText(snapshot.error));
            return;
        }
        if (snapshot.selected_pool_id && String(snapshot.selected_pool_id) !== selectedPoolId) return;
        state = snapshot;
        if(opened)markRead(snapshot.selected_pool,"visit");
        if (activeFeature === "details" && detailPoolId === selectedPoolId) detailState = snapshot;
        knownPools = rows(snapshot.pools);
        switchingPool = false;
        selectedPoolId = String(snapshot.selected_pool_id || selectedPoolId);
        LH.Background(selectedPoolId);
        var selected = snapshot.selected_pool || snapshot;
        renderPoolTabs(snapshot.pools); updateDots();
        setText("LotteryTitle", LH.Name(selectedPoolId,selected.display_name || "星悦抽奖"));
        setText("LotterySubtitle", selected.description
            || "重复物品自动兑换为星悦积分");
        setText("LotteryTicketValue", String(selected.ticket_name || "抽奖券")
            + "  " + Number(selected.tickets || 0));
        setText("LotteryPointValue", "星悦积分  "
            + Number(snapshot.starjoy_points || 0));
        renderGuarantee(selected.pity || snapshot.pity); LH.Ready();
        setText("LotteryTierValue", selected.pool_group === "special"
            ? "特殊奖池" : "地图奖池");
        var ten = panel("LotteryTenButton");
        var single = panel("LotterySingleButton");
        var singleCost = drawCost(selected, 1);
        var tenCost = drawCost(selected, 10);
        if (ten) ten.SetHasClass("Disabled",
            Number(selected.tickets || 0) < tenCost);
        if (single) single.SetHasClass("Disabled",
            Number(selected.tickets || 0) < singleCost);
        setText("LotterySingleText", singleCost === 0 ? "免费单抽" : "单抽");
        setText("LotterySingleCost", singleCost === 0 ? "" : String(singleCost));
        setText("LotteryTenCost", String(tenCost));
        renderDrawStage();
        updateButtons();
        if (activeFeature === "details") { reopenDetails = false; feature("details"); }
    }

    function draw(count) {
        if (pending || animating || switchingPool || !state || activeFeature) return;
        if (count !== 1 && count !== 10) return;
        var selected = state.selected_pool || state;
        var cost = drawCost(selected, count);
        if (Number(selected.tickets || 0) < cost) {
            setText("LotteryStatus",
                String(selected.ticket_name || "抽奖券") + "不足");
            return;
        }
        pending = true;
        lastDrawCount = count;
        closeInfo();
        updateButtons();
        hideTooltip();
        setText("LotteryStatus", count === 10
            ? "十连抽进行中……" : "单抽进行中……");
        activeRequest = requestId();
        GameEvents.SendCustomGameEventToServer("ui_lottery_draw_request", {
            request_id: activeRequest,
            pool_id: selectedPoolId,
            count: count
        });
    }

    function renderResult(payload) {
        if (payload && payload.request_id && seenResults[payload.request_id]) return;
        if (payload && payload.request_id && activeRequest && payload.request_id !== activeRequest) return;
        $.Msg("[SURVIVAL_LOTTERY_UI] stage=result_received request="
            + String(payload && payload.request_id || "none"));
        pending = false;
        activeRequest = null;
        if (!payload || !succeeded(payload.ok)) {
            setText("LotteryStatus", "抽奖失败："
                + errorText(payload && payload.error));
            if (payload && payload.snapshot) render(payload.snapshot);
            else requestSnapshot();
            updateButtons();
            return;
        }
        if (payload.request_id) seenResults[payload.request_id] = true;
        finishReveal();
        visibleResults = rows(payload.results);
        lastDrawCount = visibleResults.length > 1 ? 10 : 1;
        if (payload.pool_id) selectedPoolId = String(payload.pool_id);
        history.unshift({ time: historyTime(), pool: selectedPoolId, items: visibleResults.slice(0) });
        if (history.length > 30) history.pop();
        $.Msg("[SURVIVAL_LOTTERY_UI] result_count=" + visibleResults.length
            + " server_count=" + Number(payload.count || 0)
            + " guarantee=" + String(payload.guarantee_quality || "none")
            + " satisfied=" + String(payload.guarantee_satisfied));
        if (payload.snapshot) render(payload.snapshot);
        else renderDrawStage();
        $.Msg("[SURVIVAL_LOTTERY_UI] stage=cards_ready count=" + resultCards.length);
        setText("LotteryStatus", "本次获得 "
            + Number(payload.count || visibleResults.length) + " 件物品");
        updateButtons();
        revealResults();
        $.Msg("[SURVIVAL_LOTTERY_UI] stage=reveal_ready animated=" + animating);
    }

    function renderExchangeResult(payload) {
        pending = false;
        if (!payload || !succeeded(payload.ok)) {
            setText("LotteryStatus", "兑换失败："
                + errorText(payload && payload.error));
            return;
        }
        visibleResults = [payload.item];
        lastDrawCount = 1;
        if (payload.snapshot) render(payload.snapshot);
        else renderDrawStage();
        setText("LotteryStatus", "兑换成功");
        updateButtons();
    }

    function rewardDetails(item) {
        feature("reward");
        setText("LotteryInfoTitle", item.name || item.id);
        setText("LotteryInfoNote", qualityText(item.quality) + " · " + (item.duration_text || "永久"));
        var host = panel("LotteryInfoList"); host.RemoveAndDeleteChildren();
        createIconFrame(host, item, "LotteryDetailIcon");
        label(host, item.description || "暂无效果说明", "LotteryDetailDescription");
    }

    function selectReward(item) {
        selectedRewardId = item ? item.id : null;
        poolCards.forEach(function (entry) { entry.panel.SetHasClass("Selected", !!item && entry.id === item.id); });
        var host = panel("LotterySelectedIcon"); if (host) host.RemoveAndDeleteChildren();
        setText("LotterySelectedName", item ? (item.name || item.id) : (switchingPool ? "正在读取奖池…" : "暂无奖励"));
        setText("LotterySelectedMeta", item ? qualityText(item.quality) + " · 已拥有 " + Number(item.owned_count || 0) + (item.max_owned ? "/" + item.max_owned : "") + " · " + (item.duration_text || "永久") : "");
        setText("LotterySelectedDescription", item ? item.description || "暂无效果说明" : "");
        if (item && host) createIconFrame(host, item, "LotteryDetailIcon");
        // No public probability field exists in the current server contract.
        // Do not expose server weights or manufacture percentages.
    }

    function createV3CardBorder(parent) { U.CardShell.Adopt(parent,{bodyVariant:"square"}); }
    function setHeaderIcon(icon, path) {
        var mappings = {pool:"pool_details_icon",history:"history_icon",plus:"currency_plus"}, match = /icons\/([a-z_]+)\.svg$/.exec(path);
        Object.keys(mappings).forEach(function(key){icon.RemoveClass("LotteryV3_"+mappings[key]);});
        if (match && mappings[match[1]]) { icon.SetImage("");icon.AddClass("LotteryV3_"+mappings[match[1]]); } else icon.SetImage(path);
    }

    function feature(name) {
        if (pending || animating) return;
        if (name === "purchase") {
            var selectedTicketPool = state && (state.selected_pool || state);
            var commerce = GameUI.CustomUIConfig().SurvivalCommerceView;
            hideTooltip();
            if (commerce && commerce.OpenTicketPurchase && selectedTicketPool) {
                commerce.OpenTicketPurchase({id:selectedTicketPool.id || selectedPoolId,display_name:selectedTicketPool.display_name || selectedPoolId,ticket_name:selectedTicketPool.ticket_name || "抽奖券"});
            } else { setText("LotteryStatus", "抽奖券购买暂未开放"); }
            return;
        }
        var host = panel("LotteryInfoList"), overlay = panel("LotteryInfoOverlay");
        if (!host || !overlay) return;
        hideTooltip(); host.RemoveAndDeleteChildren(); poolCards = [];
        host.SetHasClass("LotteryPoolGrid", name === "details" || name === "update");
        overlay.SetHasClass("LotteryUpdateAnnouncement", name === "update");
        overlay.RemoveClass("LotteryInfoHidden");
        if (name === "details" && activeFeature !== "details") { detailPoolId = selectedPoolId; detailState = state; }
        if(name === "history" && activeFeature !== "history") historyPoolId=selectedPoolId;
        activeFeature = name; updateButtons();
        overlay.SetHasClass("LotteryPoolDetails", name === "details");
        // Shared shell owns frame and the only modal scale.
        var headerIcon = panel("LotteryInfoIcon");
        if (headerIcon) setHeaderIcon(headerIcon, U.Asset(({details:"icon.pool_details",history:"icon.history",purchase:"icon.add",announcement:"icon.nav.social",firstgift:"icon.nav.benefit",privilege:"icon.nav.benefit"}[name]||"icon.pool_details")));
        RH.LotteryDialog(name,infoOptions); infoShell.Open();
        var tabs = panel("LotteryInfoTabs"); if (tabs) tabs.visible = name === "details" || name === "history";
        if (name === "details" || name === "history") renderPoolTabs(knownPools, "LotteryInfoTabs");
        var viewState = name === "details" ? detailState : state;
        var selected = viewState && (viewState.selected_pool || viewState);
        var titles = { details: "奖池详情", history: "抽奖记录", announcement: "开奖公告", purchase: "购买抽奖券", firstgift: "首充礼包 · 连领3天", privilege: "抽奖券礼包特权" };
        setText("LotteryInfoTitle", titles[name] || "功能提示");
        setText("LotteryInfoNote", "");
        setText("LotteryInfoRules", "");
        if (name === "update") {
            panel("LotteryInfoNote").style.position = "40px 96px 0px";
            var notice = selected && selected.update_notice || {};
            setText("LotteryInfoTitle", notice.title || ((selected && selected.display_name || "宝箱") + "奖励更新公告"));
            setText("LotteryInfoNote", notice.effective_date ? "更新生效日期：" + notice.effective_date : "奖池配置已更新");
            setText("LotteryInfoRules", notice.summary || "本次奖池内容已更新，以下为当前可获得的奖励。");
            sortedRewards(state && state.items).forEach(function(item,index) {
                var card=$.CreatePanel("Button",host,""); card.AddClass("LotteryDetailRow");
                card.SetHasClass("RHFourth",index%4===3); card.hittestchildren=false;
                createIconFrame(card,item,"LotteryDetailIcon"); RH.RewardCard(card,item);
                card.SetPanelEvent("onmouseover",function(){showTooltip(item,card,true);});
                card.SetPanelEvent("onmouseout",hideTooltip);
            });
        } else if (name === "details") {
            if (selected) recordDetailsRead(selected);
            setText("LotteryInfoRules", selected ? selected.description + " · " + rows(selected.pity).map(function (r) { return r.label; }).join("；") + " · 单抽 " + drawCost(selected,1) + " / 十连 " + drawCost(selected,10) + " 张" + String(selected.ticket_name || "抽奖券") : "正在读取当前奖池…");
            setText("LotteryPoolGuarantee", selected ? rows(selected.pity).map(function (r) { return r.label; }).join("；") || "本奖池无批量保底" : "正在读取…");
            var rewards = sortedRewards(viewState && viewState.items);
            rewards.forEach(function (item,index) {
                var row = $.CreatePanel("Button", host, ""); row.AddClass("LotteryDetailRow");
                row.hittestchildren = false;row.SetHasClass("RHFourth",index%4===3);

                poolCards.push({id:item.id, panel:row});
                row.SetPanelEvent("onactivate", function () { selectReward(item); });
                row.SetPanelEvent("onmouseover", function () { showTooltip(item, row, true); });
                row.SetPanelEvent("onmouseout", hideTooltip);
                createIconFrame(row, item, "LotteryDetailIcon");
                var copy = $.CreatePanel("Panel", row, ""); copy.AddClass("LotteryDetailCopy");
                label(copy, qualityText(item.quality) + " · " + (item.name || item.id), "LotteryDetailName");
                label(copy, item.description || "暂无效果说明", "LotteryDetailDescription");
                RH.RewardCard(row,item);
                var outline = $.CreatePanel("Panel",row,"");outline.AddClass("LotteryCardState");outline.hittest=false;
                label(copy, (item.duration_text || "永久") + " · 重复转化 " + Number(item.duplicate_points || 0) + " 积分", "LotteryDetailMeta");
            });
            selectReward(rewards.filter(function (item) { return item.id === selectedRewardId; })[0] || rewards[0] || null);
        } else if (name === "history") {
            var entries=history.filter(function(entry){return String(entry.pool)===historyPoolId;});
            RH.History(host,entries,createRewardIcon,showTooltip,hideTooltip);
            setText("LotteryInfoNote", "仅本局最近30次抽取 · 跨局记录暂未接入");
            var total=0;entries.forEach(function(entry){total+=entry.items.length;});
            setText("LotteryInfoRules", "共 "+total+" 条奖励记录");
        } else if (name === "announcement") {
            setText("LotteryInfoNote", "当前奖池规则");
            label(host, selected ? selected.description : "奖池数据尚未就绪", "LotteryDetailDescription");
            rows(selected && selected.pity).forEach(function (rule) { label(host, rule.label || "", "LotteryHistoryHeading"); });
            label(host, "仅直接十连触发批量保底，连续十次单抽不触发。重复道具按服务端配置转为星悦积分。", "LotteryDetailDescription");
            label(host, "活动公告内容暂未接入。", "LotteryDetailMeta");
        } else {
            label(host, "此入口暂未开放，后续补充。", "LotteryHistoryHeading");
            label(host, name === "privilege" ? "免费单抽权益尚未接入；当前单抽按页面显示的抽奖券数量消耗。" : "当前不会扣款、扣券或发放礼包。", "LotteryDetailDescription");
        }
    }

    close();
    GameEvents.Subscribe("ui_lottery_snapshot", render);
    GameEvents.Subscribe("ui_lottery_result", renderResult);
    GameEvents.Subscribe("ui_lottery_exchange_result", renderExchangeResult);
    $.Schedule(0.3,function(){GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request",{prefetch:1,pool_id:selectedPoolId});});
    GameUI.CustomUIConfig().SurvivalLottery = {
        Open: open,
        OpenFromShop: openFromShop,
        Close: close,
        CloseResult: resetDrawStage,
        Toggle: toggle,
        DrawSingle: function () { draw(1); },
        DrawTen: function () { draw(10); },
        DrawAgain: function () { draw(lastDrawCount); },
        Feature: feature,
        CloseInfo: closeInfo,
        SkipReveal: finishReveal,
        SetSkipAnimation: function () { skipAnimation = !!panel("LotterySkipAnimation").checked; if (skipAnimation && animating) finishReveal(); },
        SelectPool: selectPool,
        Refresh: function () { if (!pending && !animating) requestSnapshot(); }
    };
})();
