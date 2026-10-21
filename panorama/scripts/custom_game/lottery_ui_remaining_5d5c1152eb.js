(function () {
    "use strict";
    // UI_REUSE_V1
    var cfg=GameUI.CustomUIConfig(), owner=$.GetContextPanel();
    // A HUD rebuild loads this controller before its presentation. Release a
    // dead previous skin before controller disposal can call its render hooks.
    var previousPresentation=cfg.SurvivalPurpleLottery;
    if(previousPresentation&&previousPresentation.IsAlive&&!previousPresentation.IsAlive()&&previousPresentation.Dispose)previousPresentation.Dispose();
    if(cfg.SurvivalLottery&&cfg.SurvivalLottery.Dispose)cfg.SurvivalLottery.Dispose();
    var lifetime=$.CreatePanel("Panel",owner,""),disposed=false,subscriptions=[];lifetime.visible=false;
    function alive(){return !disposed&&(!lifetime.IsValid||lifetime.IsValid());}
    function displayDescription(item,value){var resources=cfg.SurvivalItemResources;return resources&&resources.DisplayDescription?resources.DisplayDescription(item,value):value;}
    function active(fn){return function(){if(alive())return fn.apply(null,arguments);};}
    var presentationVersion="lottery_current_20261018",openRequested=false,activePresenter=null,openIntentSerial=0;
    var cache=cfg.SurvivalLotteryCache,cacheSubscription=null;
    function currentPresentation(){
        var view=cfg.SurvivalPurpleLottery;
        return view&&view.Version===presentationVersion&&typeof view.IsAlive==="function"&&view.IsAlive()
            &&typeof view.Owns==="function"&&view.Owns(owner)===true
            &&typeof view.IsReady==="function"&&view.IsReady()===true?view:null;
    }
    var U=cfg.SurvivalUI, LH=cfg.LotteryHandoff, RH=cfg.RemainingHandoff, panelRefs={};
    (function remember(n){if(!n||n.IsValid&&!n.IsValid())return;if(n.id)panelRefs[n.id]=n;n.Children().forEach(remember);})(owner);

    var drawSequence=U.DrawResultSequence();
    var infoOptions={id:"lottery_info",panel:$("#LotteryInfoDialog"),root:$.GetContextPanel(),scrim:$("#LotteryInfoOverlay"),header:$("#LotteryInfoHeader"),titlePanel:$("#LotteryInfoTitle"),closeButton:$("#LotteryInfoClose"),width:840,height:610,fit:{reference:[1672,941]},onClose:closeInfo};
    // Details are a right-content view inside the one lottery shell. Keep the
    // business anchors but never create another scaled window above it.
    var infoShell={Open:function(){if(!currentPresentation())return;var n=panel("LotteryInfoOverlay"),layers=cfg.SurvivalUILayers;if(n){n.visible=true;n.RemoveClass("LotteryInfoHidden");}if(n&&layers)layers.Open("lottery_info",n,closeInfo);},Close:function(){var n=panel("LotteryInfoOverlay"),layers=cfg.SurvivalUILayers;if(layers)layers.Close("lottery_info");if(n){n.visible=false;n.AddClass("LotteryInfoHidden");}},Dispose:function(){if(cfg.SurvivalUILayers)cfg.SurvivalUILayers.Close("lottery_info");}};
    // Scene fills the viewport; LotteryHandoff owns responsive control placement.
    $("#LotteryWindow").RemoveClass("UIFullscreen");
    ["LotterySingleButton","LotteryTenButton","LotteryAgain","LotteryConfirm","LotteryInfoConfirm"].forEach(function(id){U.ActionButton.Adopt($("#"+id),{variant:id==="LotteryTenButton"||id==="LotteryAgain"?"gold":"ivory"});});
    LH.Actions();U.Checkbox.Adopt($("#LotterySkipAnimation")); LH.CloseButton($("#LotteryCloseButton"),close);
    var state = null;
    var pending = false;
    var requestSerial = 0;
    var selectedPoolId = "map";
    var visibleResults = [];
    var animating = false, animationSerial = 0, skipAnimation = !!$("#LotterySkipAnimation").checked;
    var resultCards = [], lastDrawCount = 1, history = [], seenResults = {};
    var activeRequest = null, opened = false, switchingPool = false;
    var feedbackRequest = null, rewardReceipt = null, rewardFX = null, rewardFXRoot = null;
    var walletRefreshes={};
    var motion = { single: {enter:650, flip:1250, ready:2000}, ten: {enter:800, enterStep:40, flip:1350, flipStep:110, ready:2800}, flipHalf:100 };
    var historyPoolId = "map", detailPoolId = null, detailState = null, detailRequestSerial = 0;
    var animationTimers = [], activeFeature = "", reopenDetails = false, knownPools = [], selectedRewardId = null, poolCards = [];
    var skipRevealButton=$("#LotterySkipReveal");skipRevealButton.hittest=true;skipRevealButton.hittestchildren=false;skipRevealButton.SetPanelEvent("onactivate",function(){completeReveal();$.Msg("[LOTTERY_SKIP_UI] actual_results="+visibleResults.length);});
    function cancelAnimation() { animationSerial++; drawSequence.Cancel(); if(GameUI.CustomUIConfig().LotteryCinematic)GameUI.CustomUIConfig().LotteryCinematic.Cancel(); animationTimers = []; }
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
    function closeInfo() { if(!alive())return;detailRequestSerial++; activeFeature = ""; infoShell.Close(); var info = panel("LotteryInfoOverlay"); if (info) info.AddClass("LotteryInfoHidden"); hideTooltip(); reopenDetails = false; updateButtons(); var presenter=currentPresentation();if(presenter&&presenter.CloseInfo)presenter.CloseInfo();if(presenter&&presenter.Pools)presenter.Pools(rows(knownPools),selectedPoolId); }
    function updateButtons() {
        var selected = state && (state.selected_pool || state);
        var locked = pending || animating || switchingPool || !selected || !cache || !cache.IsAuthoritative(selectedPoolId) || selected.unlocked===false || !!activeFeature;
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
        if(currentPresentation())LH.Buttons(selected, pending && lastDrawCount === 10);
    }
    function finishReveal() {
        cancelAnimation();
        animating = false;
        rootClass("LotteryAnimating", false);
        rootClass("LotteryCharging", false);
        resultCards.forEach(function (card) { ["LotteryCardCovered", "LotteryCardEntering", "LotteryCardNarrow"].forEach(function (name) { cardState(card, name, false); }); });
        updateButtons();
    }
    function clearRewardFeedback() { rewardReceipt = null; if (rewardFX) rewardFX.Clear(); }
    function playRewardFeedback() {
        var receipt = rewardReceipt; rewardReceipt = null;
        if (!receipt || !alive() || !opened || receipt.pool !== selectedPoolId || !U.RewardFX) return;
        var view = currentPresentation();
        var host = view && view.Content ? view.Content() : null;
        if (!host || host.IsValid && !host.IsValid()) host = panel("LotteryMainCanvas") || panel("LotteryWindow");
        if (!host) return;
        if (!rewardFX || rewardFXRoot !== host) {
            if (rewardFX) rewardFX.Dispose();
            // The GW2 content is a child of the fitted MainCanvas. The helper
            // reads that ancestor transform; no second Fit scale is applied.
            rewardFX = U.RewardFX.Create(host, {channel:"lottery"}); rewardFXRoot = host;
        }
        rewardFX.Play({key:receipt.key,anchor:resultCards.length === 1 ? resultCards[0] : panel("LotteryItemList"),
            title:"抽奖成功",text:visibleResults.length === 1 ? String(visibleResults[0].name || "获得奖励") : "获得 " + visibleResults.length + " 件奖励"});
    }
    function completeReveal() { finishReveal(); playRewardFeedback(); }
    function revealResults() {
        if (!opened || !visibleResults.length) return;
        if (skipAnimation) { playRewardFeedback(); return; }
        cancelAnimation();
        var generation = animationSerial, ten = lastDrawCount === 10, timing = ten ? motion.ten : motion.single;
        animating = true; rootClass("LotteryAnimating", true); rootClass("LotteryCharging", true);
        resultCards.forEach(function (card) { cardState(card,"LotteryCardCovered",true); cardState(card,"LotteryCardEntering",true); });
        updateButtons(); setText("LotteryRevealPhase", "星轨汇聚");
        function showCards() {
            if(!alive()||generation!==animationSerial || !opened)return;
            rootClass("LotteryCharging",false);
            var cardTiming=ten?{enter:60,enterStep:70,flip:320,flipStep:100,ready:1550}:{enter:60,flip:350,ready:1000};
            drawSequence.Play(visibleResults,{timing:cardTiming,flipHalf:100,onCharged:function(){},onEnter:function(i){cardState(resultCards[i],"LotteryCardEntering",false);},onFlip:function(i){cardState(resultCards[i],"LotteryCardNarrow",true);},onReveal:function(i){cardState(resultCards[i],"LotteryCardCovered",false);cardState(resultCards[i],"LotteryCardNarrow",false);},onReady:completeReveal});
        }
        var cinema=GameUI.CustomUIConfig().LotteryCinematic;
        if(!cinema || !cinema.Play(selectedPoolId,visibleResults,showCards))showCards();
    }

    function panel(id) { if(!alive())return null;var n=panelRefs[id];if(n&&(!n.IsValid||n.IsValid()))return n;n=owner.FindChildTraverse(id);if(n&&(!n.IsValid||n.IsValid())){panelRefs[id]=n;return n;}return null; }
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
    function duplicateCurrency(item) {
        return item&&(item.converted_currency||item.duplicate_currency)==="shop_points"?"商城积分":"星悦积分";
    }
    function pointsBalance(value) {
        if(value===undefined||value===null||value==="")return "—";
        var number=Number(value);return isFinite(number)&&number>=0?String(number):"—";
    }
    function refreshRewardWallet(key) {
        if(!key||walletRefreshes[key])return;
        var job=walletRefreshes[key]={attempts:0},delays=[1.1,3,9];
        function attempt(){
            if(!alive()||walletRefreshes[key]!==job)return;
            var wallet=cfg.SurvivalCommerceWallet;
            if(wallet){
                if(wallet.Invalidate&&wallet.Invalidate("lottery:"+key)!==false)return;
                if(!wallet.Invalidate&&wallet.Refresh&&wallet.Refresh()!==false)return;
            }
            if(job.attempts<delays.length)$.Schedule(delays[job.attempts++],attempt);
        }
        $.Schedule(0,attempt);
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
            archive_config_mismatch: "游戏与服务器配置版本不一致，请同步配置后重新进入游戏",
            lottery_config_refresh_required: "抽奖规则已更新，请重新进入游戏后再试",
            mode_not_selected: "请先选择游戏模式，再打开抽奖",
            http_profile_required: "服务器存档尚未连接，请稍后重新打开抽奖",
            lottery_ticket_insufficient: "抽奖券不足",
            lottery_pool_locked: "地图宝箱累计开启100次后解锁修仙宝箱",
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
        var presenter=currentPresentation();
        if(presenter&&presenter.HideTooltip)presenter.HideTooltip();
        var tooltip = panel("LotteryItemTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }
    function requestTooltipHide() {
        var purple=currentPresentation();
        if(purple&&purple.RequestTooltipHide&&purple.RequestTooltipHide())return;
        hideTooltip();
    }

    function showTooltip(item, sourcePanel, simple) {
        hideTooltip();
        var presenter=currentPresentation();
        if(presenter&&presenter.Tooltip&&item&&sourcePanel)presenter.Tooltip(item,sourcePanel);
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
        // Reparented fullscreen results keep presentation-only visibility and
        // status placement. Refresh after clearing the result class as well.
        var presenter=currentPresentation();if(presenter&&presenter.Apply)presenter.Apply();
    }

    function createResultCard(parent, item) {
        var card = $.CreatePanel("Panel", parent, "");
        card.__lotteryItem=item;
        card.AddClass("LotteryRewardCard");
        var outline=$.CreatePanel("Panel",card,"");outline.AddClass("LotteryCardState");outline.hittest=false;
        card.AddClass(qualityClass(item.quality));
        card.style.borderColor = GameUI.CustomUIConfig().SurvivalRewardPresentation.NameColor(item.quality);
        card.hittestchildren = false;
        var iconFrame = createIconFrame(card, item, "LotteryRewardIconFrame");
        var name = $.CreatePanel("Label", card, "");
        name.AddClass("LotteryRewardName");
        name.text = item.name || item.id || "物品";
        label(card, displayDescription(item,item.description || "暂无效果说明"), "LotteryRewardDescription");
        label(card, item.duration_text || "永久", "LotteryRewardDuration");
        var back = $.CreatePanel("Panel", card, "");
        back.AddClass("LotteryCardBack");
        label(card, "×" + Number(item.count || item.quantity || 1), "LotteryRewardQuantity");
        if (succeeded(item.duplicate)) {
            var duplicate = $.CreatePanel("Label", iconFrame, "");
            duplicate.AddClass("LotteryDuplicateBadge");
            duplicate.text = "已转化 "
                + Number(item.converted_points || 0) + " "+duplicateCurrency(item);
            duplicate.hittest = false;
        }
        card.SetPanelEvent("onmouseover", function () {
            if (card.BHasClass("LotteryCardCovered")) return;
            showTooltip(item, card);
        });
        card.SetPanelEvent("onmouseout", requestTooltipHide);
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
        resultCards = items.map(function (item, index) {
            var card = createResultCard(list, item);
            if (items.length > 1) {
                // Five explicit slots per row: scaled pixel rounding must not wrap
                // the fifth card into a clipped third row.
                card.style.position = (14 + (index % 5) * 272) + "px "
                    + (8 + Math.floor(index / 5) * 284) + "px 0px";
                card.style.margin = "0px";
                card.style.horizontalAlign = "left";
                card.style.verticalAlign = "top";
            }
            return card;
        });
        var presenter=currentPresentation();
        if(presenter&&presenter.Compact)presenter.Compact(list);
        if(presenter&&presenter.Apply)presenter.Apply();
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
        if (!pool || !pool.revision || !cache || !cache.IsAuthoritative(pool.id)) return;
        var key = pool.id + ':' + action + ':' + pool.revision;
        if (readsPending[key]) return;
        readsPending[key] = true;
        if(cache)cache.ReadAck(pool,action);
    }
    function updateDots() {
        var button = panel("LHDetails");
        if (!button) return;
        var dot = panel("LotteryUpdateDot");
        if (!dot) { dot = $.CreatePanel("Panel",button,"LotteryUpdateDot"); dot.AddClass("LotteryUpdateDot"); dot.hittest=false; }
        dot.visible = knownPools.some(function(p){return String(p.id) === selectedPoolId && detailsUnread(p);});
    }
    function refreshLocal(poolId) {
        if(!cache)return;
        var main=cache.Snapshot(selectedPoolId);
        if(!poolId || poolId===selectedPoolId) {
            if(main)render(main);else {state=null;updateButtons();}
        }
        if(activeFeature==="details" && (!poolId || poolId===detailPoolId) && detailPoolId!==selectedPoolId) {
            detailState=cache.Snapshot(detailPoolId);feature("details");
        }
    }
    function acceptSnapshot(snapshot) {
        if(cache && !cache.Ingest(snapshot))refreshLocal("");
    }

    function resetDrawStage() {
        if (pending) return;
        clearRewardFeedback();
        finishReveal();
        visibleResults = [];
        renderChest();
        setText("LotteryStatus", "请选择开启数量");
    }

    function open() {
        if(!alive())return;
        var root = panel("LotteryWindow");
        if (!root) return;
        var presenter=currentPresentation();
        if(!presenter){openRequested=true;hideUnreadyWindow();return false;}
        openRequested=false;
        if(opened){
            if(activePresenter!==presenter)showPresentation(presenter);
            return true;
        }
        opened = true;
        showPresentation(presenter);
        renderDrawStage();
        updateButtons();
        refreshLocal("");
        markRead(state&&state.selected_pool,"visit");
        return true;
    }

    function hideUnreadyWindow(){
        var root=panel("LotteryWindow"),canvas=panel("LotteryMainCanvas"),info=panel("LotteryInfoOverlay");
        if(root){root.visible=false;root.SetHasClass("LotteryOpen",false);root.SetHasClass("LotteryClosed",true);}
        if(canvas)canvas.style.opacity="0";
        if(info){info.visible=false;info.AddClass("LotteryInfoHidden");}
        var tooltip=panel("LotteryItemTooltip");if(tooltip)tooltip.AddClass("Hidden");
        var layers=cfg.SurvivalUILayers;if(layers){layers.Close("lottery_info");layers.Close("lottery");}
    }

    function showPresentation(presenter){
        activePresenter=presenter;
        LH.Prepare();
        LH.Background(selectedPoolId);
        presenter.Open();
        if(presenter.Pools)presenter.Pools(rows(knownPools),selectedPoolId);
        if(state&&presenter.Snapshot)presenter.Snapshot(state);
        if(presenter.Compact)presenter.Compact(panel("LotteryItemList"));
        var root=panel("LotteryWindow");root.visible=true;
        var layers = GameUI.CustomUIConfig().SurvivalUILayers;
        if (layers) layers.Open("lottery", root, close);
        root.SetHasClass("LotteryOpen", true);
        root.SetHasClass("LotteryClosed", false); LH.Open();
        updateButtons();
        if(activeFeature&&presenter.Info){presenter.Info(activeFeature,infoOptions,activeFeature==="details"?detailState:state);infoShell.Open();}
    }

    function presentationReady(presenter){
        if(!alive()||presenter!==currentPresentation())return false;
        if(openRequested)return open();
        if(opened){if(activePresenter!==presenter)showPresentation(presenter);return true;}
        return true;
    }

    function openFromShop() {
        var shop = GameUI.CustomUIConfig().SurvivalShop;
        if (shop && shop.Close) shop.Close();
        var serial=++openIntentSerial;
        $.Schedule(0.01, function(){if(alive()&&serial===openIntentSerial)open();});
    }

    function close() {
        if(!alive())return;
        openRequested=false;activePresenter=null;openIntentSerial++;
        opened = false;
        feedbackRequest = null; clearRewardFeedback();
        var layers = GameUI.CustomUIConfig().SurvivalUILayers; if (layers) layers.Close("lottery");
        finishReveal(); closeInfo();
        hideTooltip();
        var root = panel("LotteryWindow");
        if (!root) return;
        root.SetHasClass("LotteryOpen", false);
        root.SetHasClass("LotteryClosed", true);root.visible=false; LH.Close();
        var presenter=currentPresentation();if(presenter&&presenter.Close)presenter.Close();
    }

    function toggle() {
        var root = panel("LotteryWindow");
        if (root && root.BHasClass("LotteryOpen")) close(); else open();
    }

    function selectDetailPool(poolId) {
        detailPoolId = String(poolId || "map"); detailState = cache && cache.Snapshot(detailPoolId); selectedRewardId = null;
        feature("details");
    }

    function selectPool(poolId) {
        if (activeFeature === "details") { selectDetailPool(poolId); return; }
        if (pending || animating || switchingPool) return;
        clearRewardFeedback();
        selectedPoolId = String(poolId || "map");
        LH.Background(selectedPoolId);
        selectedRewardId=null;visibleResults=[];closeInfo();
        refreshLocal("");
        markRead(state&&state.selected_pool,"visit");
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
            badge.text = pool.unlocked===false?"解锁进度 "+Number(pool.unlock_progress||0)+"/"+Number(pool.unlock_required||100):(guarantees.length ? String(guarantees[0].label || "十连保底") : "");
            button.SetHasClass("LotteryPoolLocked",pool.unlocked===false);
            button.SetPanelEvent("onactivate", function () {
                if (hostId === "LotteryInfoTabs") { if(activeFeature === "history") {historyPoolId=String(pool.id);feature("history");} else selectDetailPool(pool.id); } else selectPool(pool.id);
            });
        });
        if(hostId === "LotteryInfoTabs") RH.TabSelection(host,activeFeature === "history");
        var presenter=currentPresentation();
        if(presenter&&presenter.StyleTabs)presenter.StyleTabs();
        if(presenter&&presenter.Pools)presenter.Pools(rows(pools),hostId==="LotteryInfoTabs"?(activeFeature==="history"?historyPoolId:detailPoolId):selectedPoolId);
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
        if (snapshot.selected_pool_id && String(snapshot.selected_pool_id) !== selectedPoolId) return;
        state = snapshot;
        if(opened)markRead(snapshot.selected_pool,"visit");
        if (activeFeature === "details" && detailPoolId === selectedPoolId) detailState = snapshot;
        knownPools = rows(snapshot.pools);
        switchingPool = false;
        selectedPoolId = String(snapshot.selected_pool_id || selectedPoolId);
        LH.Background(selectedPoolId);
        var selected = snapshot.selected_pool || snapshot;
        LH.Ticket(selected);
        renderPoolTabs(snapshot.pools); updateDots();
        setText("LotteryTitle", LH.Name(selectedPoolId,selected.display_name || "星悦抽奖"));
        setText("LotterySubtitle", selected.description
            || "重复物品自动兑换为"+(snapshot.shop_points!==undefined?"商城积分":"星悦积分"));
        setText("LotteryTicketValue", String(selected.ticket_name || "抽奖券")
            + "  " + Number(selected.tickets || 0));
        setText("LotteryPointValue", "商城积分  "+pointsBalance(snapshot.shop_points));
        renderGuarantee(selected.pity || snapshot.pity); if(currentPresentation())LH.Ready();
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
        else if (activeFeature === "announcement") { feature("announcement"); }
        var presenter=currentPresentation();if(presenter&&presenter.Snapshot)presenter.Snapshot(snapshot);
    }

    function draw(count) {
        if (!opened || !currentPresentation() || pending || animating || switchingPool || !state || activeFeature || !cache || !cache.IsAuthoritative(selectedPoolId)) return;
        if (count !== 1 && count !== 10) return;
        var selected = state.selected_pool || state;
        if(selected.unlocked===false){setText("LotteryStatus","地图宝箱累计开启 "+Number(selected.unlock_progress||0)+" / "+Number(selected.unlock_required||100)+" 次后解锁");return;}
        var cost = drawCost(selected, count);
        if (Number(selected.tickets || 0) < cost) {
            setText("LotteryStatus",
                String(selected.ticket_name || "抽奖券") + "不足");
            return;
        }
        pending = true;
        clearRewardFeedback();
        lastDrawCount = count;
        closeInfo();
        updateButtons();
        hideTooltip();
        setText("LotteryStatus", count === 10
            ? "十连抽进行中……" : "单抽进行中……");
        activeRequest = requestId();
        feedbackRequest = opened ? activeRequest : null;
        GameEvents.SendCustomGameEventToServer("ui_lottery_draw_request", {
            request_id: activeRequest,
            pool_id: selectedPoolId,
            count: count,
            expected_config_hash: cache.Catalog().config_hash
        });
    }

    function renderResult(payload) {
        if (payload && payload.request_id && seenResults[payload.request_id]) return;
        if (payload && payload.request_id && activeRequest && payload.request_id !== activeRequest) return;
        var feedbackAllowed = opened && payload && payload.request_id && payload.request_id === feedbackRequest;
        feedbackRequest = null;
        $.Msg("[SURVIVAL_LOTTERY_UI] stage=result_received request="
            + String(payload && payload.request_id || "none"));
        pending = false;
        activeRequest = null;
        if (!payload || !succeeded(payload.ok)) {
            setText("LotteryStatus", "抽奖失败："
                + errorText(payload && payload.error));
            if (payload && payload.snapshot) acceptSnapshot(payload.snapshot);
            else if(cache)cache.Invalidate(selectedPoolId);
            updateButtons();
            return;
        }
        if (payload.request_id) seenResults[payload.request_id] = true;
        refreshRewardWallet(payload.request_id);
        clearRewardFeedback();
        finishReveal();
        visibleResults = rows(payload.results);
        lastDrawCount = visibleResults.length > 1 ? 10 : 1;
        if (payload.pool_id) selectedPoolId = String(payload.pool_id);
        if (feedbackAllowed) rewardReceipt = {key:payload.request_id,pool:selectedPoolId};
        history.unshift({ time: historyTime(), pool: selectedPoolId, items: visibleResults.slice(0) });
        if (history.length > 30) history.pop();
        $.Msg("[SURVIVAL_LOTTERY_UI] result_count=" + visibleResults.length
            + " server_count=" + Number(payload.count || 0)
            + " guarantee=" + String(payload.guarantee_quality || "none")
            + " satisfied=" + String(payload.guarantee_satisfied));
        if (payload.snapshot) acceptSnapshot(payload.snapshot);
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
        if (payload.snapshot) acceptSnapshot(payload.snapshot);
        else renderDrawStage();
        setText("LotteryStatus", "兑换成功");
        updateButtons();
    }

    function rewardDetails(item) {
        feature("reward");
        setText("LotteryInfoTitle", item.name || item.id);
        setText("LotteryInfoNote", qualityText(item.quality) + (item.duration_text ? " · " + item.duration_text : ""));
        var host = panel("LotteryInfoList"); host.RemoveAndDeleteChildren();
        createIconFrame(host, item, "LotteryDetailIcon");
        label(host, displayDescription(item,item.description || "暂无效果说明"), "LotteryDetailDescription");
        var presenter=currentPresentation();if(presenter&&presenter.Info)presenter.Info("reward",infoOptions);
    }

    function selectReward(item) {
        selectedRewardId = item ? item.id : null;
        poolCards.forEach(function (entry) { entry.panel.SetHasClass("Selected", !!item && entry.id === item.id); });
        var host = panel("LotterySelectedIcon"); if (host) host.RemoveAndDeleteChildren();
        setText("LotterySelectedName", item ? (item.name || item.id) : "暂无奖励");
        setText("LotterySelectedMeta", item ? qualityText(item.quality) + " · 已拥有 " + Number(item.owned_count || 0) + (item.max_owned ? "/" + item.max_owned : "") + " · " + (item.duration_text || "永久") : "");
        setText("LotterySelectedDescription", item ? displayDescription(item,item.description || "暂无效果说明") : "");
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
        var presenter=currentPresentation();
        if (!presenter || pending || animating) return;
        if (name === "purchase") {
            var selectedTicketPool = state && (state.selected_pool || state);
            var commerce = GameUI.CustomUIConfig().SurvivalCommerceView;
            hideTooltip();
            if (commerce && commerce.OpenTicketPurchase && selectedTicketPool) {
                var handled=commerce.OpenTicketPurchase({id:selectedTicketPool.id || selectedPoolId,display_name:selectedTicketPool.display_name || selectedPoolId,ticket_name:selectedTicketPool.ticket_name || "抽奖券",ticket_content_id:selectedTicketPool.ticket_content_id});
                if(!handled)setText("LotteryStatus",(selectedTicketPool.ticket_content_id==="lottery_ticket"||(!selectedTicketPool.ticket_content_id&&selectedPoolId==="map"))?"普通抽奖券通过游戏玩法获得":"抽奖券购买暂未开放，请稍后重试");
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
        if(presenter.Info)presenter.Info(name,infoOptions);infoShell.Open();
        var tabs = panel("LotteryInfoTabs"); if (tabs) tabs.visible = name === "details" || name === "history";
        if (name === "details" || name === "history") renderPoolTabs(knownPools, "LotteryInfoTabs");
        var viewState = name === "details" ? detailState : state;
        var selected = viewState && (viewState.selected_pool || viewState);
        var titles = { details: "奖池详情", history: "抽奖记录", announcement: "开奖公告", purchase: "购买抽奖券", firstgift: "首充礼包 · 连领3天", privilege: "抽奖券礼包特权" };
        setText("LotteryInfoTitle", titles[name] || "功能提示");
        setText("LotteryInfoNote", "");
        setText("LotteryInfoRules", "");
        if (name === "update") {
            var notice = selected && selected.update_notice || {};
            setText("LotteryInfoTitle", notice.title || ((selected && selected.display_name || "宝箱") + "奖励更新公告"));
            setText("LotteryInfoNote", notice.effective_date ? "更新生效日期：" + notice.effective_date : "奖池配置已更新");
            setText("LotteryInfoRules", notice.summary || "本次奖池内容已更新，以下为当前可获得的奖励。");
            sortedRewards(state && state.items).forEach(function(item,index) {
                var card=$.CreatePanel("Button",host,""); card.AddClass("LotteryDetailRow");
                card.SetHasClass("RHFourth",index%4===3); card.hittestchildren=false;
                createIconFrame(card,item,"LotteryDetailIcon"); RH.RewardCard(card,item);
                card.SetPanelEvent("onmouseover",function(){showTooltip(item,card,true);});
                card.SetPanelEvent("onmouseout",requestTooltipHide);
            });
        } else if (name === "details") {
            if (selected) recordDetailsRead(selected);
            setText("LotteryInfoRules", selected ? selected.description + " · " + rows(selected.pity).map(function (r) { return r.label; }).join("；") + " · 单抽 " + drawCost(selected,1) + " / 十连 " + drawCost(selected,10) + " 张" + String(selected.ticket_name || "抽奖券") : "");
            setText("LotteryPoolGuarantee", selected ? rows(selected.pity).map(function (r) { return r.label; }).join("；") || "本奖池无批量保底" : "");
            var rewards = sortedRewards(viewState && viewState.items);
            if(!rewards.length)label(host,"当前奖池暂无奖励","PurpleLotteryEmpty");
            rewards.forEach(function (item,index) {
                var row = $.CreatePanel("Button", host, ""); row.AddClass("LotteryDetailRow");
                row.hittestchildren = false;row.SetHasClass("RHFourth",index%4===3);

                poolCards.push({id:item.id, panel:row});
                row.SetPanelEvent("onactivate", function () { selectReward(item); });
                row.SetPanelEvent("onmouseover", function () { showTooltip(item, row, true); });
                row.SetPanelEvent("onmouseout", requestTooltipHide);
                createIconFrame(row, item, "LotteryDetailIcon");
                var copy = $.CreatePanel("Panel", row, ""); copy.AddClass("LotteryDetailCopy");
                label(copy, qualityText(item.quality) + " · " + (item.name || item.id), "LotteryDetailName");
                label(copy, displayDescription(item,item.description || "暂无效果说明"), "LotteryDetailDescription");
                RH.RewardCard(row,item);
                var outline = $.CreatePanel("Panel",row,"");outline.AddClass("LotteryCardState");outline.hittest=false;
                label(copy, (item.duration_text || "永久") + " · 重复转化 " + Number(item.duplicate_points || 0) + " "+duplicateCurrency(item), "LotteryDetailMeta");
            });
            selectReward(rewards.filter(function (item) { return item.id === selectedRewardId; })[0] || rewards[0] || null);
        } else if (name === "history") {
            var entries=history.filter(function(entry){return String(entry.pool)===historyPoolId;});
            RH.History(host,entries,createRewardIcon,showTooltip,requestTooltipHide);
            setText("LotteryInfoNote", "仅本局最近30次抽取 · 跨局记录暂未接入");
            var total=0;entries.forEach(function(entry){total+=entry.items.length;});
            setText("LotteryInfoRules", "共 "+total+" 条奖励记录");
        } else if (name === "announcement") {
            setText("LotteryInfoNote", "当前奖池规则");
            var announcement = selected && selected.update_notice || {};
            label(host, "玩家须知", "LotteryAnnouncementHeading");
            if (announcement.single_draw_probabilities) {
                label(host, "当前宝箱单次抽奖概率", "LotteryAnnouncementBody");
                label(host, String(announcement.single_draw_probabilities), "LotteryAnnouncementProbability");
            } else {
                label(host, "该宝箱的单次抽奖概率公告暂未公布。", "LotteryAnnouncementBody");
            }
            label(host, selected ? selected.description : "奖池数据尚未就绪", "LotteryAnnouncementBody");
            rows(selected && selected.pity).forEach(function (rule) { label(host, rule.label || "", "LotteryHistoryHeading"); });
            label(host, "仅直接十连触发批量保底，连续十次单抽不触发。重复道具按配置转为"+(state&&state.shop_points!==undefined?"商城积分":"星悦积分")+"。", "LotteryAnnouncementBody");
        } else {
            label(host, "此入口暂未开放，后续补充。", "LotteryHistoryHeading");
            label(host, name === "privilege" ? "免费单抽权益尚未接入；当前单抽按页面显示的抽奖券数量消耗。" : "当前不会扣款、扣券或发放礼包。", "LotteryDetailDescription");
        }
        if(presenter.Info)presenter.Info(name,infoOptions,viewState);
    }

    close();
    if(cache){cacheSubscription=cache.Subscribe(active(function(id,packet){if(packet && packet.read_error){readsPending={};return;}refreshLocal(id);}));refreshLocal("");}
    subscriptions.push(GameEvents.Subscribe("ui_lottery_result", active(renderResult)));
    subscriptions.push(GameEvents.Subscribe("ui_lottery_exchange_result", active(renderExchangeResult)));
    var api={
        SkipCinematic: completeReveal,
        Open: open,
        PresentationReady: presentationReady,
        OpenFromShop: openFromShop,
        Close: close,
        CloseResult: resetDrawStage,
        Toggle: toggle,
        DrawSingle: function () { draw(1); },
        DrawTen: function () { draw(10); },
        DrawAgain: function () { draw(lastDrawCount); },
        Feature: feature,
        CloseInfo: closeInfo,
        SkipReveal: completeReveal,
        SetSkipAnimation: function () { skipAnimation = !!panel("LotterySkipAnimation").checked; if (skipAnimation && animating) completeReveal(); },
        SelectPool: selectPool,
        SelectHistoryPool: function(id){if(pending||animating)return;historyPoolId=String(id||selectedPoolId);feature("history");},
        Refresh: function () { if (!pending && !animating) refreshLocal(""); }
    };
    Object.keys(api).forEach(function(key){api[key]=active(api[key]);});
    api.IsAlive=alive;
    api.Dispose=function(){
        if(disposed)return;
        if(alive())close();
        openRequested=false;activePresenter=null;
        feedbackRequest = null; rewardReceipt = null;
        if(rewardFX)rewardFX.Dispose();rewardFX=null;rewardFXRoot=null;
        disposed=true;animationSerial++;detailRequestSerial++;
        drawSequence.Dispose();
        subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];
        if(cacheSubscription)cacheSubscription();cacheSubscription=null;
        if(infoShell&&infoShell.Dispose)infoShell.Dispose();
        if(!lifetime.IsValid||lifetime.IsValid())lifetime.DeleteAsync(0);
    };
    cfg.SurvivalLottery=api;
})();
