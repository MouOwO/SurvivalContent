(function () {
    "use strict";
    var TICKET = "special_lottery_ticket", QUANTITY = 2;
    function yes(value) { return value === true || Number(value) === 1; }
    function natural(value) { var n = Number(value); return isFinite(n) && n >= 0 && n === Math.floor(n); }
    function text(value) { return value === undefined || value === null ? "" : String(value); }
    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function beforeDay(left, right) {
        var a = Number(left), b = Number(right);
        return isFinite(a) && isFinite(b) ? a < b : text(left) < text(right);
    }
    function initial() {
        return {schema:1, login_key:"", retired_logins:[], sequence:0, revision:0,
            snapshot:null, pending:null, dismissed:false, want_open:false,
            confirmed:false, notice:"", serial:0};
    }
    function accept(state, payload) {
        if (!payload || !yes(payload.ok) || !text(payload.login_key)
            || !text(payload.day_key) || !natural(payload.sequence) || Number(payload.sequence) < 1 || !natural(payload.revision)
            || payload.ticket_id !== TICKET || Number(payload.ticket_count) !== QUANTITY) return false;
        var login = text(payload.login_key), day = text(payload.day_key);
        if (login !== state.login_key) {
            if (state.retired_logins.indexOf(login) >= 0) return false;
            var retired = state.retired_logins.slice();
            if (state.login_key) retired.push(state.login_key);
            var fresh = initial();
            Object.keys(fresh).forEach(function (key) { state[key] = fresh[key]; });
            state.retired_logins = retired.slice(-8); state.login_key = login;
        }
        if (Number(payload.sequence) <= state.sequence || Number(payload.revision) < state.revision) return false;
        if (state.snapshot && beforeDay(day, state.snapshot.day_key)) return false;
        var next = clone(payload), result = next.claim_result, waiting = state.pending;
        if (state.snapshot && day !== text(state.snapshot.day_key)) { state.confirmed = false; state.notice = ""; }
        state.sequence = Number(next.sequence); state.revision = Number(next.revision); state.snapshot = next;
        // A receipt is not a client-side inventory delta. The server sends a
        // successful terminal result only after its ACK and profile refresh.
        if (waiting && result && text(result.request_id) === waiting.request_id
            && yes(result.terminal) && !yes(result.pending) && !yes(next.claim_pending)) {
            var receiptDay = text(result.day_key);
            if (yes(result.ok) && receiptDay === day && yes(next.claimed)) {
                state.pending = null; state.confirmed = true; state.notice = "";
            } else if (yes(result.ok) && receiptDay === waiting.day_key && receiptDay !== day) {
                // A late receipt for yesterday cannot mark today's gift paid.
                state.pending = null; state.confirmed = false; state.notice = "";
            } else if (!yes(result.ok)) {
                state.pending = null; state.confirmed = false;
                state.notice = yes(next.claimed) ? "" : "领取未完成，请重试";
            }
        }
        if (!yes(next.active)) state.want_open = false;
        return true;
    }
    function eligible(state) {
        var data = state.snapshot;
        return !!data && yes(data.active) && yes(data.eligible) && !yes(data.claimed);
    }
    function busy(state) { return !!state.pending || !!state.snapshot && yes(state.snapshot.claim_pending); }
    function begin(state, requestId, stamp) {
        if (!eligible(state) || busy(state) || state.dismissed || !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) return false;
        state.pending = {request_id:requestId, day_key:text(state.snapshot.day_key), started_at:stamp};
        state.confirmed = false; state.notice = "";
        return true;
    }
    function dismiss(state) { state.dismissed = true; state.want_open = false; }
    var model = {Initial:initial, Accept:accept, Eligible:eligible, Busy:busy, Begin:begin, Dismiss:dismiss};
    if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

    var cfg = GameUI.CustomUIConfig(), context = $.GetContextPanel();
    if (cfg.SurvivalPublicBetaGift && cfg.SurvivalPublicBetaGift.Dispose) cfg.SurvivalPublicBetaGift.Dispose();
    var retained = cfg.SurvivalPublicBetaGiftState;
    var state = retained && retained.schema === 1 ? retained : initial();
    cfg.SurvivalPublicBetaGiftState = state;
    var root = context.FindChildTraverse("PublicBetaGiftWindow"), scrim = context.FindChildTraverse("PublicBetaGiftScrim");
    var button = context.FindChildTraverse("PublicBetaGiftClaim"), buttonText = context.FindChildTraverse("PublicBetaGiftClaimText");
    var reward = context.FindChildTraverse("PublicBetaGiftReward"), quantity = context.FindChildTraverse("PublicBetaGiftQuantity");
    var caption = context.FindChildTraverse("PublicBetaGiftRewardCaption"), notice = context.FindChildTraverse("PublicBetaGiftNotice");
    var closeButton = context.FindChildTraverse("PublicBetaGiftClose"), receipt = context.FindChildTraverse("PublicBetaGiftReceipt");
    var generation = Number(cfg.SurvivalPublicBetaGiftGeneration || 0) + 1;
    cfg.SurvivalPublicBetaGiftGeneration = generation;
    var disposed = false, timer = null, subscription = null, loadingSubscription = null, shell = null, api;
    var lastRequest = -100, requestedLogin = "", hadAdmission = false, hasFreshSnapshot = false;
    function valid(panel) { return !!panel && (!panel.IsValid || panel.IsValid()); }
    function alive() { return !disposed && cfg.SurvivalPublicBetaGiftGeneration === generation && valid(context) && valid(root); }
    function now() { return Date.now() / 1000; }
    function setText(panel, value) { if (valid(panel) && panel.text !== value) panel.text = value; }
    function admitted() {
        var loading = CustomNetTables.GetTableValue("survival_loading", "state");
        return !!loading && yes(loading.admission_complete === undefined ? loading.all_ready : loading.admission_complete);
    }
    function readyUI() {
        var ui = cfg.SurvivalUI, layers = cfg.SurvivalUILayers;
        return ui && ui.ModalShell && (!ui.IsAlive || ui.IsAlive()) && layers && (!layers.IsAlive || layers.IsAlive());
    }
    function request(force) {
        if (!alive() || !admitted() || (!force && now() - lastRequest < 5)) return;
        lastRequest = now();
        GameEvents.SendCustomGameEventToServer("survival_public_beta_gift_request", {});
    }
    function close() {
        if (!alive()) return;
        dismiss(state); if (shell) shell.Close();
    }
    function mount() {
        if (shell || !readyUI()) return;
        shell = cfg.SurvivalUI.ModalShell.Adopt({id:"public_beta_gift", panel:root, scrim:scrim,
            root:context, width:960, height:680, fit:{widthFraction:.92, heightFraction:.90, maxScale:1},
            closePolicy:"explicit", onClose:close});
        // Keep the shell's input/focus machinery and the approved inner design.
        root.style.backgroundColor = "transparent"; root.style.border = "0px"; root.style.boxShadow = "none";
        scrim.style.backgroundColor = "#02080ba3";
        shell.Close();
    }
    function canPresent() {
        if (!admitted() || !readyUI()) return false;
        var layers = cfg.SurvivalUILayers, top = layers.Top();
        return !top || top === "public_beta_gift";
    }
    function render() {
        if (!alive()) return;
        mount();
        if (!shell) return;
        var data = state.snapshot, pending = busy(state), claimed = !!data && yes(data.claimed);
        var success = state.confirmed && claimed;
        if (!state.dismissed && eligible(state) && canPresent()) state.want_open = true;
        if (!hasFreshSnapshot || !data || !yes(data.active) || state.dismissed || !admitted()) {
            shell.Close(); return;
        }
        if (state.want_open && !shell.IsOpen() && canPresent()) shell.Open();
        if (!shell.IsOpen()) return;
        root.SetHasClass("PublicBetaGiftClaimed", success || claimed);
        root.SetHasClass("PublicBetaGiftPending", pending);
        setText(reward, success ? "今日好礼已到账" : claimed ? "今日好礼已领取" : "金色抽奖券");
        quantity.visible = !(success || claimed);
        setText(caption, success || claimed ? "金色抽奖券 ×2" : "今日登录好礼");
        receipt.visible = success;
        var slow = !!state.pending && now() - Number(state.pending.started_at) >= 10;
        setText(buttonText, pending ? (slow ? "正在确认…" : "领取中…") : claimed ? "开始游戏" : state.notice ? "重试领取" : "立即领取");
        button.enabled = !pending && (claimed || eligible(state));
        button.SetHasClass("PublicBetaGiftDisabled", !button.enabled);
        setText(notice, pending ? (slow ? "正在确认领取结果，请稍候…" : "正在领取今日好礼…") : state.notice || "好运相伴，共赴新程");
    }
    function claim() {
        if (!alive() || !shell || !shell.IsOpen() || !admitted()) return;
        if (state.snapshot && yes(state.snapshot.claimed) && !busy(state)) { close(); return; }
        state.serial = Number(state.serial || 0) + 1;
        var requestId = "beta_" + Date.now().toString(36) + "_" + state.serial.toString(36);
        if (!begin(state, requestId, now())) return;
        render();
        // Quantity, item, calendar day and eligibility are all server-owned.
        GameEvents.SendCustomGameEventToServer("survival_public_beta_gift_claim", {request_id:requestId});
    }
    function receive(payload) {
        if (!alive() || !accept(state, payload)) return;
        hasFreshSnapshot = true; requestedLogin = state.login_key; render();
    }
    function dispose() {
        if (disposed) return;
        disposed = true;
        if (timer !== null && $.CancelScheduled) $.CancelScheduled(timer);
        if (subscription !== null && GameEvents.Unsubscribe) GameEvents.Unsubscribe(subscription);
        if (loadingSubscription !== null && CustomNetTables.UnsubscribeNetTableListener) CustomNetTables.UnsubscribeNetTableListener(loadingSubscription);
        if (shell) shell.Dispose();
        // Hot reload retains the intent and dismissal; it never resubmits a claim.
    }
    function loop() {
        timer = null;
        if (!alive()) { dispose(); return; }
        var admission = admitted();
        if (admission && !hadAdmission) request(true);
        hadAdmission = admission;
        if (admission && (!state.snapshot || busy(state) || requestedLogin !== state.login_key)) request(false);
        render(); timer = $.Schedule(.25, loop);
    }
    button.SetPanelEvent("onactivate", claim);
    closeButton.SetPanelEvent("onactivate", function () { if (shell) shell.RequestClose("button"); });
    subscription = GameEvents.Subscribe("survival_public_beta_gift_snapshot", receive);
    if (CustomNetTables.SubscribeNetTableListener) loadingSubscription = CustomNetTables.SubscribeNetTableListener("survival_loading", function () { if (alive()) { render(); } });
    api = cfg.SurvivalPublicBetaGift = {Dispose:dispose, Inspect:function () {
        return {open:!!shell && shell.IsOpen(), login_key:state.login_key, sequence:state.sequence,
            day_key:state.snapshot && state.snapshot.day_key, dismissed:state.dismissed,
            pending:state.pending ? clone(state.pending) : null, claimed:state.snapshot && state.snapshot.claimed,
            confirmed:state.confirmed, eligible:eligible(state), button_enabled:button.enabled};
    }};
    loop();
})();
