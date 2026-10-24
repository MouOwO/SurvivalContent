(function () {
    "use strict";
    var root = $.GetContextPanel(), footer = root.FindChildTraverse("StartupLoadingFooter");
    if (!footer) return;
    function create(type, parent, id, css, text) {
        var result = $.CreatePanel(type, parent, id);
        if (css) result.AddClass(css);
        if (text) result.text = text;
        return result;
    }
    // Keep the frozen loading layout intact; this optional component owns only
    // its new subtree and appears after a private authorization event arrives.
    var panel = create("Panel", footer, "PlayerWebAuth", "PlayerWebAuth");
    panel.AddClass("PlayerWebAuthHidden");
    create("Label", panel, "", "PlayerWebAuthTitle", "授权当前 Steam 账号");
    create("Label", panel, "", "PlayerWebAuthDescription", "打开网页登录并确认下方短码，完成后返回游戏。");
    create("Label", panel, "PlayerWebAuthCode", "PlayerWebAuthCode");
    create("Label", panel, "PlayerWebAuthStatus", "PlayerWebAuthStatus");
    var actions = create("Panel", panel, "", "PlayerWebAuthActions");
    var open = create("Button", actions, "PlayerWebAuthOpen", "PlayerWebAuthButton");
    create("Label", open, "", "", "打开网页登录");
    var retry = create("Button", actions, "PlayerWebAuthRetry", "PlayerWebAuthButton");
    retry.AddClass("PlayerWebAuthSecondary");
    create("Label", retry, "", "", "刷新授权状态");
    create("Label", panel, "", "PlayerWebAuthHint", "独立测试存档。请使用当前游玩的同一 Steam 账号，游戏内无需输入 Steam 密码。");
    var codeLabel = root.FindChildTraverse("PlayerWebAuthCode");
    var statusLabel = root.FindChildTraverse("PlayerWebAuthStatus");
    var openButton = root.FindChildTraverse("PlayerWebAuthOpen");
    var retryButton = root.FindChildTraverse("PlayerWebAuthRetry");
    var loading = null, personal = null, session = "", requested = false, disposed = false;
    var tableSubscription = null, eventSubscription = null;
    var diagnosticRevision = "WS4-WEB-04";
    var diagnosticPhases = {start: true, poll: true};
    var diagnosticStages = {API: true, create: true, send: true, http: true, json: true, fields: true, timeout: true};
    var messages = {
        requesting: "正在准备网页授权…",
        pending: "等待网页确认。完成后会自动继续加载。",
        approved: "网页授权已确认，正在校验账号和读取档案…",
        expired: "本次短码已过期，请刷新后使用新短码。",
        failed: "暂时无法获取授权状态，请刷新重试。"
    };
    function valid() { return !disposed && root && root.IsValid() && panel && panel.IsValid(); }
    function yes(value) { return value === true || value === 1; }
    function localId() {
        try { return Game.GetLocalPlayerID(); } catch (ignored) { return -1; }
    }
    function validSession(value) { return typeof value === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(value); }
    function ownRow() {
        var id = localId(), rows = loading && loading.players;
        if (!rows || id < 0) return null;
        var keys = Object.keys(rows);
        for (var i = 0; i < keys.length; i++) {
            if (rows[keys[i]] && rows[keys[i]].player_id === id) return rows[keys[i]];
        }
        return null;
    }
    function gated() {
        var row = ownRow();
        return !!loading && validSession(session) && row !== null && !yes(row.authenticated)
            && !yes(loading.admission_complete) && !yes(loading.all_ready);
    }
    function safeUri(value) {
        if (!value || typeof value.user_code !== "string" || !/^[A-Z0-9-]{6,16}$/.test(value.user_code)) return "";
        var expected = "https://pay.xiaofengnet.com/ws4-web/authorize?code=" + value.user_code;
        return value.verification_uri === expected ? expected : "";
    }
    function safeDiagnostic(value) {
        if (value.status !== "failed" || value.diagnostic_revision !== diagnosticRevision
            || typeof value.diagnostic_phase !== "string" || typeof value.diagnostic_stage !== "string"
            || !Object.prototype.hasOwnProperty.call(diagnosticPhases, value.diagnostic_phase)
            || !Object.prototype.hasOwnProperty.call(diagnosticStages, value.diagnostic_stage)
            || typeof value.diagnostic_status !== "number" || !isFinite(value.diagnostic_status)
            || value.diagnostic_status < 0 || value.diagnostic_status > 599
            || value.diagnostic_status !== Math.floor(value.diagnostic_status)) return null;
        return {diagnostic_revision: diagnosticRevision, diagnostic_phase: value.diagnostic_phase,
            diagnostic_stage: value.diagnostic_stage, diagnostic_status: value.diagnostic_status};
    }
    function request() {
        if (!valid() || !gated()) return;
        GameEvents.SendCustomGameEventToServer("survival_player_web_auth_request", {session_id: session});
    }
    function render() {
        if (!valid()) return;
        var visible = gated() && personal && personal.session_id === session && personal.player_id === localId();
        panel.SetHasClass("PlayerWebAuthHidden", !visible);
        panel.hittest = !!visible;
        panel.hittestchildren = !!visible;
        var uri = visible && personal.status === "pending" ? safeUri(personal) : "";
        codeLabel.text = uri ? personal.user_code : "";
        statusLabel.text = visible ? messages[personal.status] || messages.failed : "";
        if (visible && personal.diagnostic_revision === diagnosticRevision) {
            statusLabel.text += "\n(" + diagnosticRevision + " / " + personal.diagnostic_phase
                + " / " + personal.diagnostic_stage + " / " + personal.diagnostic_status + ")";
        }
        openButton.enabled = !!uri;
        retryButton.enabled = !!visible;
    }
    function acceptLoading(value) {
        if (!valid()) { dispose(); return; }
        loading = value && typeof value === "object" ? value : null;
        var next = loading && validSession(loading.session_id) ? loading.session_id : "";
        if (next !== session) { session = next; personal = null; requested = false; }
        render();
        // Fetch only the private view after a real server snapshot identifies
        // this player/session. Existing server admission retries own polling.
        if (!requested && gated()) { requested = true; request(); }
    }
    function acceptPersonal(value) {
        if (!valid()) { dispose(); return; }
        if (!value || value.session_id !== session || value.player_id !== localId()
            || !Object.prototype.hasOwnProperty.call(messages, value.status)) return;
        // Copy only display fields. Bearers, device codes and arbitrary errors
        // never enter this component's state, even in a malformed event.
        personal = {session_id: session, player_id: value.player_id, status: value.status,
            user_code: typeof value.user_code === "string" ? value.user_code : "",
            verification_uri: typeof value.verification_uri === "string" ? value.verification_uri : ""};
        var diagnostic = safeDiagnostic(value);
        if (diagnostic) {
            personal.diagnostic_revision = diagnostic.diagnostic_revision;
            personal.diagnostic_phase = diagnostic.diagnostic_phase;
            personal.diagnostic_stage = diagnostic.diagnostic_stage;
            personal.diagnostic_status = diagnostic.diagnostic_status;
        }
        render();
    }
    function dispose() {
        if (disposed) return;
        disposed = true; personal = null; loading = null;
        try { if (tableSubscription !== null) CustomNetTables.UnsubscribeNetTableListener(tableSubscription); } catch (ignored) {}
        try { if (eventSubscription !== null) GameEvents.Unsubscribe(eventSubscription); } catch (ignored) {}
    }
    openButton.SetPanelEvent("onactivate", function () {
        if (!valid() || !gated() || !personal || personal.status !== "pending") return;
        var uri = safeUri(personal);
        if (uri) $.DispatchEvent("ExternalBrowserGoToURL", uri);
    });
    retryButton.SetPanelEvent("onactivate", request);
    // Some native Panorama contexts reject this optional event type. Cleanup
    // must never prevent the private state/table subscriptions from mounting.
    try { $.RegisterEventHandler("PanelDeleted", root, dispose); } catch (ignored) {}
    eventSubscription = GameEvents.Subscribe("survival_player_web_auth_state", acceptPersonal);
    tableSubscription = CustomNetTables.SubscribeNetTableListener("survival_loading", function (table, key, value) {
        if (key === "state") acceptLoading(value);
    });
    acceptLoading(CustomNetTables.GetTableValue("survival_loading", "state"));
})();
