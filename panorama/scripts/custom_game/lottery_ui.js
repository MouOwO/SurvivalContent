(function () {
    "use strict";

    var state = null;
    var pending = false;
    var requestSerial = 0;
    var selectedPoolId = "map";
    var visibleResults = [];
    var activeTooltipItem = null;

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
        var iconType = String(item.icon_type || "item");
        var icon;
        if (iconType === "image") {
            icon = $.CreatePanel("Image", parent, "");
            if (icon.SetImage) icon.SetImage(item.icon || "");
        } else if (iconType === "ability") {
            icon = $.CreatePanel("DOTAAbilityImage", parent, "");
            icon.abilityname = item.icon || "attribute_bonus";
        } else {
            icon = $.CreatePanel("DOTAItemImage", parent, "");
            icon.itemname = item.icon || "item_branches";
        }
        icon.AddClass(className || "LotteryRewardIcon");
        icon.hittest = false;
        icon.hittestchildren = false;
        return icon;
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
        iconHost.RemoveAndDeleteChildren();
        createIconFrame(iconHost, item, "LotteryTooltipIconFrame");
        setText("LotteryTooltipName", item.name || item.id || "未命名道具");
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
        list.SetHasClass("LotterySingleResult", false);
        list.SetHasClass("LotteryTenResults", false);
        list.SetHasClass("LotteryChestMode", true);
        var stage = $.CreatePanel("Panel", list, "");
        stage.AddClass("LotteryChestStage");
        var aura = $.CreatePanel("Panel", stage, "");
        aura.AddClass("LotteryChestAura");
        var chestFrame = $.CreatePanel("Panel", stage, "");
        chestFrame.AddClass("LotteryChestFrame");
        var chest = $.CreatePanel("DOTAItemImage", chestFrame, "");
        chest.AddClass("LotteryChestIcon");
        chest.itemname = "item_treasure_chest";
        chest.hittest = false;
        chest.hittestchildren = false;
        var prompt = $.CreatePanel("Label", stage, "");
        prompt.AddClass("LotteryChestPrompt");
        prompt.text = "选择下方单抽或十连，开启本次宝箱";
    }

    function createResultCard(parent, item) {
        var card = $.CreatePanel("Panel", parent, "");
        card.AddClass("LotteryRewardCard");
        card.AddClass(qualityClass(item.quality));
        createIconFrame(card, item, "LotteryRewardIconFrame");
        var name = $.CreatePanel("Label", card, "");
        name.AddClass("LotteryRewardName");
        name.text = item.name || item.id || "物品";
        if (succeeded(item.duplicate)) {
            var duplicate = $.CreatePanel("Label", card, "");
            duplicate.AddClass("LotteryDuplicateBadge");
            duplicate.text = "已拥有，兑换 "
                + Number(item.converted_points || 0) + " 积分";
        }
        card.SetPanelEvent("onmouseover", function () {
            showTooltip(item, card);
        });
        card.SetPanelEvent("onmouseout", hideTooltip);
        return card;
    }

    function renderResults(items) {
        var list = panel("LotteryItemList");
        if (!list) return;
        hideTooltip();
        list.RemoveAndDeleteChildren();
        list.SetHasClass("LotteryChestMode", false);
        list.SetHasClass("LotterySingleResult", items.length === 1);
        list.SetHasClass("LotteryTenResults", items.length > 1);
        items.forEach(function (item) { createResultCard(list, item); });
    }

    function renderDrawStage() {
        if (visibleResults.length > 0) renderResults(visibleResults);
        else renderChest();
    }

    function requestSnapshot() {
        GameEvents.SendCustomGameEventToServer("ui_lottery_snapshot_request", {
            pool_id: selectedPoolId
        });
    }

    function resetDrawStage() {
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "请选择开启数量");
    }

    function open() {
        var root = panel("LotteryWindow");
        if (!root) return;
        visibleResults = [];
        root.SetHasClass("LotteryOpen", true);
        root.SetHasClass("LotteryClosed", false);
        renderChest();
        requestSnapshot();
    }

    function openFromShop() {
        var shop = GameUI.CustomUIConfig().SurvivalShop;
        if (shop && shop.Close) shop.Close();
        $.Schedule(0.01, open);
    }

    function close() {
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
        if (pending) return;
        selectedPoolId = String(poolId || "map");
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "正在切换奖池……");
        requestSnapshot();
    }

    function renderPoolTabs(pools) {
        var host = panel("LotteryPoolTabs");
        if (!host) return;
        host.RemoveAndDeleteChildren();
        rows(pools).forEach(function (pool) {
            var button = $.CreatePanel("Button", host, "");
            button.AddClass("LotteryPoolTab");
            button.SetHasClass("Selected", String(pool.id) === selectedPoolId);
            var label = $.CreatePanel("Label", button, "");
            label.text = pool.display_name || pool.id;
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
            setText("LotteryStatus", "抽奖数据加载失败："
                + errorText(snapshot.error));
            return;
        }
        state = snapshot;
        selectedPoolId = String(snapshot.selected_pool_id || selectedPoolId);
        var selected = snapshot.selected_pool || snapshot;
        renderPoolTabs(snapshot.pools);
        setText("LotteryTitle", selected.display_name || "星悦抽奖");
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
        var singleCost = Number(selected.single_cost || 1);
        var tenCost = Number(selected.ten_cost || 10);
        if (ten) ten.SetHasClass("Disabled",
            Number(selected.tickets || 0) < tenCost);
        if (single) single.SetHasClass("Disabled",
            Number(selected.tickets || 0) < singleCost);
        setText("LotterySingleCost", "使用 " + singleCost
            + " 张" + String(selected.ticket_name || "抽奖券"));
        setText("LotteryTenCost", "使用 " + tenCost
            + " 张" + String(selected.ticket_name || "抽奖券"));
        renderDrawStage();
    }

    function draw(count) {
        if (pending || !state) return;
        var selected = state.selected_pool || state;
        var cost = Number(count === 10
            ? (selected.ten_cost || 10) : (selected.single_cost || 1));
        if (Number(selected.tickets || 0) < cost) {
            setText("LotteryStatus",
                String(selected.ticket_name || "抽奖券") + "不足");
            return;
        }
        pending = true;
        hideTooltip();
        setText("LotteryStatus", count === 10
            ? "十连抽进行中……" : "单抽进行中……");
        GameEvents.SendCustomGameEventToServer("ui_lottery_draw_request", {
            request_id: requestId(),
            pool_id: selectedPoolId,
            count: count
        });
    }

    function renderResult(payload) {
        pending = false;
        if (!payload || !succeeded(payload.ok)) {
            setText("LotteryStatus", "抽奖失败："
                + errorText(payload && payload.error));
            if (payload && payload.snapshot) render(payload.snapshot);
            else requestSnapshot();
            return;
        }
        visibleResults = rows(payload.results);
        $.Msg("[SURVIVAL_LOTTERY_UI] result_count=" + visibleResults.length
            + " server_count=" + Number(payload.count || 0)
            + " guarantee=" + String(payload.guarantee_quality || "none")
            + " satisfied=" + String(payload.guarantee_satisfied));
        if (payload.snapshot) render(payload.snapshot);
        else renderDrawStage();
        setText("LotteryStatus", "本次获得 "
            + Number(payload.count || visibleResults.length) + " 件物品");
    }

    function renderExchangeResult(payload) {
        pending = false;
        if (!payload || !succeeded(payload.ok)) {
            setText("LotteryStatus", "兑换失败："
                + errorText(payload && payload.error));
            return;
        }
        visibleResults = [payload.item];
        if (payload.snapshot) render(payload.snapshot);
        else renderDrawStage();
        setText("LotteryStatus", "兑换成功");
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
        SelectPool: selectPool,
        Refresh: requestSnapshot
    };
})();
