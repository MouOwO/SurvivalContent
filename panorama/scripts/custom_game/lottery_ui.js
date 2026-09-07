(function () {
    "use strict";

    var state = null;
    var pending = false;
    var requestSerial = 0;
    var selectedPoolId = "map";
    var visibleResults = [];
    var activeTooltipItem = null;
    var animating = false, animationSerial = 0, skipAnimation = false;
    var resultCards = [], lastDrawCount = 1, history = [], seenResults = {};
    var activeRequest = null, opened = false, switchingPool = false;
    var motion = { single: {enter:650, flip:1250, ready:2000}, ten: {enter:800, enterStep:40, flip:1350, flipStep:110, ready:2800}, flipHalf:100 };
    var animationTimers = [], activeFeature = "", reopenDetails = false;
    function cancelAnimation() { animationSerial++; animationTimers.forEach(function (timer) { if ($.CancelScheduled) $.CancelScheduled(timer); }); animationTimers = []; }
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
    function closeInfo() { activeFeature = ""; var layers = GameUI.CustomUIConfig().SurvivalUILayers; if (layers) layers.Close("lottery_info"); var info = panel("LotteryInfoOverlay"); if (info) info.AddClass("LotteryInfoHidden"); hideTooltip(); }
    function updateButtons() {
        var selected = state && (state.selected_pool || state);
        var locked = pending || animating || switchingPool || !selected;
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
        setText("LotterySingleText", pending && lastDrawCount === 1 ? "请求中…" : (selected && drawCost(selected,1) === 0 ? "免费开启1个" : "开启1个"));
        setText("LotteryTenText", pending && lastDrawCount === 10 ? "请求中…" : "开启10个");
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
        function later(ms, action) { animationTimers.push($.Schedule(ms / 1000, function () { if (generation === animationSerial && opened) action(); })); }
        later(650, function () { rootClass("LotteryCharging",false); });
        resultCards.forEach(function (card, i) {
            later(timing.enter + (timing.enterStep || 0) * i, function () { cardState(card,"LotteryCardEntering",false); });
            var flip = timing.flip + (timing.flipStep || 0) * i;
            later(flip, function () { cardState(card,"LotteryCardNarrow",true); });
            later(flip + motion.flipHalf, function () { cardState(card,"LotteryCardCovered",false); cardState(card,"LotteryCardNarrow",false); });
        });
        later(timing.ready, finishReveal);
    }

    function panel(id) { return $("#" + id); }
    function setText(id, value) {
        var target = panel(id);
        if (target) target.text = String(value === undefined ? "" : value);
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

    function createRewardIcon(parent, item, className) {
        return GameUI.CustomUIConfig().SurvivalRewardPresentation.CreateIcon(parent, item, className || "LotteryRewardIcon");
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
        activeTooltipItem = null;
        var tooltip = panel("LotteryItemTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function showTooltip(item, sourcePanel) {
        var tooltip = panel("LotteryItemTooltip");
        var iconHost = panel("LotteryTooltipIconHost");
        if (!tooltip || !iconHost || !item || !sourcePanel) return;
        activeTooltipItem = item;
        tooltip.style.zIndex = "100010";
        iconHost.RemoveAndDeleteChildren();
        createIconFrame(iconHost, item, "LotteryTooltipIconFrame");
        setText("LotteryTooltipName", item.name || item.id || "未命名道具");
        panel("LotteryTooltipName").style.color = GameUI.CustomUIConfig().SurvivalRewardPresentation.NameColor(item.quality);
        setText("LotteryTooltipType", "类型：" + String(item.item_type || "积分道具"));
        setText("LotteryTooltipDuration", "期限：" + String(item.duration_text || "永久"));
        setText("LotteryTooltipDescription", "简介：" + String(item.description || "暂无简介"));
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
            duplicate.text = "重复物品，已转化为"
                + Number(item.converted_points || 0) + "积分";
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

    function requestSnapshot() {
        GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request", {
            pool_id: selectedPoolId
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
        var layers = GameUI.CustomUIConfig().SurvivalUILayers;
        if (layers) layers.Open("lottery", root, close);
        root.SetHasClass("LotteryOpen", true);
        root.SetHasClass("LotteryClosed", false);
        renderDrawStage();
        updateButtons();
        requestSnapshot();
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
        root.SetHasClass("LotteryClosed", true);
    }

    function toggle() {
        var root = panel("LotteryWindow");
        if (root && root.BHasClass("LotteryOpen")) close(); else open();
    }

    function selectPool(poolId) {
        if (pending || animating || switchingPool) return;
        selectedPoolId = String(poolId || "map");
        switchingPool = true;
        reopenDetails = activeFeature === "details";
        state = null; closeInfo();
        ["LotteryTitle","LotterySubtitle","LotteryGuaranteeValue","LotteryTicketValue","LotterySingleCost","LotteryTenCost"].forEach(function (id) { setText(id,"正在读取…"); });
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "正在切换奖池……");
        requestSnapshot();
        updateButtons();
    }

    function renderPoolTabs(pools, hostId) {
        var host = panel(hostId || "LotteryPoolTabs");
        if (!host) return;
        host.RemoveAndDeleteChildren();
        rows(pools).forEach(function (pool) {
            var button = $.CreatePanel("Button", host, "");
            button.AddClass("LotteryPoolTab");
            button.SetHasClass("Selected", String(pool.id) === selectedPoolId);
            var label = $.CreatePanel("Label", button, "");
            label.text = pool.display_name || pool.id;
            label.AddClass("LotteryPoolTabName");
            if (String(pool.id) === "map") label.text = "地图宝箱";
            var badge = $.CreatePanel("Label", button, "");
            badge.AddClass("LotteryPoolBadge");
            var guarantees = rows(pool.pity);
            badge.text = guarantees.length ? String(guarantees[0].label || "十连保底") : "";
            button.SetPanelEvent("onactivate", function () {
                selectPool(pool.id);
            });
        });
    }

    function renderGuarantee(pity) {
        var rules = rows(pity);
        var text = rules.length > 0
            ? String(rules[0].label || (Number(rules[0].batch_size || 10)
                + "连保底 " + qualityText(rules[0].quality)))
            : "本奖池无批量保底";
        setText("LotteryGuaranteeValue", text);
    }

    function render(snapshot) {
        if (!snapshot) return;
        if (snapshot.error) {
            state = null; switchingPool = false; updateButtons();
            setText("LotteryStatus", "抽奖数据加载失败："
                + errorText(snapshot.error));
            return;
        }
        if (snapshot.selected_pool_id && String(snapshot.selected_pool_id) !== selectedPoolId) return;
        state = snapshot;
        switchingPool = false;
        selectedPoolId = String(snapshot.selected_pool_id || selectedPoolId);
        var selected = snapshot.selected_pool || snapshot;
        renderPoolTabs(snapshot.pools);
        setText("LotteryTitle", selectedPoolId === "map" ? "地图宝箱" : (selected.display_name || "星悦抽奖"));
        setText("LotterySubtitle", selected.description
            || "重复物品自动兑换为星悦积分");
        setText("LotteryTicketValue", String(selected.ticket_name || "抽奖券")
            + "  " + Number(selected.tickets || 0));
        setText("LotteryPointValue", "星悦积分  "
            + Number(snapshot.starjoy_points || 0));
        renderGuarantee(selected.pity || snapshot.pity);
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
        setText("LotterySingleText", singleCost === 0 ? "免费开启1个" : "开启1个");
        setText("LotterySingleCost", "使用 " + singleCost
            + " 张" + String(selected.ticket_name || "抽奖券"));
        setText("LotteryTenCost", "使用 " + tenCost
            + " 张" + String(selected.ticket_name || "抽奖券"));
        renderDrawStage();
        updateButtons();
        if (reopenDetails) { reopenDetails = false; feature("details"); }
    }

    function draw(count) {
        if (pending || animating || switchingPool || !state) return;
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

    function feature(name) {
        var host = panel("LotteryInfoList"), overlay = panel("LotteryInfoOverlay");
        if (!host || !overlay) return;
        hideTooltip(); host.RemoveAndDeleteChildren();
        host.SetHasClass("LotteryPoolGrid", name === "details");
        overlay.RemoveClass("LotteryInfoHidden");
        activeFeature = name;
        var layers = GameUI.CustomUIConfig().SurvivalUILayers; if (layers) layers.Open("lottery_info", overlay, closeInfo);
        var tabs = panel("LotteryInfoTabs"); if (tabs) tabs.visible = name === "details";
        if (name === "details") renderPoolTabs(state && state.pools, "LotteryInfoTabs");
        var selected = state && (state.selected_pool || state);
        var titles = { details: "奖池详情", history: "抽奖记录", announcement: "开奖公告", purchase: "购买抽奖券", firstgift: "首充礼包 · 连领3天", privilege: "抽奖券礼包特权" };
        setText("LotteryInfoTitle", titles[name] || "功能提示");
        setText("LotteryInfoNote", "");
        if (name === "details") {
            setText("LotteryInfoNote", selected ? selected.description + " · " + rows(selected.pity).map(function (r) { return r.label; }).join("；") : "正在读取当前奖池…");
            rows(state && state.items).forEach(function (item) {
                var row = $.CreatePanel("Panel", host, ""); row.AddClass("LotteryDetailRow");
                createIconFrame(row, item, "LotteryDetailIcon");
                var copy = $.CreatePanel("Panel", row, ""); copy.AddClass("LotteryDetailCopy");
                label(copy, qualityText(item.quality) + " · " + (item.name || item.id), "LotteryDetailName");
                label(copy, item.description || "暂无效果说明", "LotteryDetailDescription");
                label(copy, (item.duration_text || "永久") + " · 重复转化 " + Number(item.duplicate_points || 0) + " 积分", "LotteryDetailMeta");
            });
        } else if (name === "history") {
            setText("LotteryInfoNote", "仅显示本次游戏中收到的最近30次抽奖结果；跨局记录暂未接入。");
            if (!history.length) label(host, "暂无本局抽奖记录", "LotteryDetailDescription");
            history.forEach(function (entry) {
                label(host, entry.time + " · " + entry.items.length + "件", "LotteryHistoryHeading");
                entry.items.forEach(function (item) { label(host, qualityText(item.quality) + "  " + (item.name || item.id) + (succeeded(item.duplicate) ? " · 已转化" + Number(item.converted_points || 0) + "积分" : ""), "LotteryHistoryItem"); });
            });
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

    GameEvents.Subscribe("ui_lottery_snapshot", render);
    GameEvents.Subscribe("ui_lottery_result", renderResult);
    GameEvents.Subscribe("ui_lottery_exchange_result", renderExchangeResult);
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
