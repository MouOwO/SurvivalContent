(function () {
    "use strict";
    // Generated public product projection from the formal CSV compiler. The
    // release manifest signs these bytes; this is not a live account quote.
    var SNAPSHOT = {"catalog_sha256":"76bf5409b90ed58f6061745302411bf38c71a3c8eb52645364235a2a2a31f1b6","source":"payment_backend.csv_catalog.build","products":[{"sku":"archive_pass_monthly","title":"签到月卡（30天）","amount_fen":5800,"reward_lines":[{"kind":"entitlement","id":"archive_pass","quantity":1,"label":"签到月卡30天","duration_days":30}]},{"sku":"special_lottery_ticket_single","title":"特殊抽奖券 ×1","amount_fen":2500,"reward_lines":[{"kind":"item","id":"special_lottery_ticket","quantity":1,"label":"特殊抽奖券"}]},{"sku":"u_coin_recharge","title":"U币充值","amount_fen":100,"reward_lines":[{"kind":"wallet","id":"u_coin","quantity":100,"label":"U币"}]}]};
    var root = $.GetContextPanel(), state = null, opened = false, collapsed = false, selected = 0, listener = null;
    var table = "survival_arcade_multiplayer_test";
    var diagnostics = Object.create(null), mapName = "<not_read>", mapType = "undefined";
    var phases = {not_run: "未验证", probing: "检测中", available: "已收到响应", unavailable: "当前不可用"};
    var keys = ["schema_version", "enabled", "session_only", "online_players", "capacity", "host_player_id", "http_phase", "sequence"];
    var required = ["ArcadeTestCard", "ArcadeTestBody", "ArcadeTestToggle", "ArcadeTestToggleText", "ArcadeTestPlayers", "ArcadeTestHost", "ArcadeTestHTTP", "ArcadeTestPurchaseOpen", "ArcadeTestPurchase", "ArcadeTestScrim", "ArcadeTestDialog", "ArcadeTestClose", "ArcadeTestProducts", "ArcadeTestProductTitle", "ArcadeTestPrice", "ArcadeTestRewards"];
    function p(id) { try { return root.FindChildTraverse(id); } catch (ignore) { return null; } }
    function valid(item) { return !!item && (!item.IsValid || item.IsValid()); }
    function diagnostic(phase, raw) {
        if (diagnostics[phase]) return;
        diagnostics[phase] = true;
        try {
            var types = raw && typeof raw === "object" ? keys.map(function (key) { return key + ":" + typeof raw[key]; }).join(",") : "none";
            if (typeof $.Msg === "function") $.Msg("[WS4-MP-10-UI] phase=" + phase + " map_name=" + mapName + " map_type=" + mapType + " state_types=" + types);
        } catch (ignore) {}
    }
    function exactMap() {
        try {
            var info = Game.GetMapInfo(), value = info && info.map_name;
            mapType = typeof value;
            mapName = mapType === "string" ? value.replace(/[^A-Za-z0-9_./-]/g, "_").slice(0, 80) || "<empty>" : "<missing>";
            return value === "template_map" || value === "maps/template_map.vpk";
        } catch (ignore) { mapName = "<api_error>"; mapType = "unavailable"; return false; }
    }
    function ready() { for (var i = 0; i < required.length; i++) if (!valid(p(required[i]))) return false; return true; }
    function integer(value, low, high) { return typeof value === "number" && isFinite(value) && value === Math.floor(value) && value >= low && value <= high; }
    function flag(value) { return value === true || value === 1; }
    function rejected(raw) {
        if (!raw || typeof raw !== "object" || Object.keys(raw).length !== keys.length) return "shape";
        for (var i = 0; i < keys.length; i++) if (!Object.prototype.hasOwnProperty.call(raw, keys[i])) return "shape";
        if (raw.schema_version !== 1) return "schema_version";
        if (!integer(raw.sequence, 1, 2147483647)) return "sequence";
        if (!flag(raw.enabled)) return "enabled";
        if (!flag(raw.session_only)) return "session_only";
        if (!integer(raw.online_players, 1, 4)) return "online_players";
        if (raw.capacity !== 4) return "capacity";
        if (!integer(raw.host_player_id, -1, 23)) return "host_player_id";
        if (typeof raw.http_phase !== "string" || !Object.prototype.hasOwnProperty.call(phases, raw.http_phase)) return "http_phase";
        return "";
    }
    function show(id, value) {
        var item = p(id); if (!valid(item)) return;
        item.style.visibility = value ? "visible" : "collapse";
        item.visible = value; item.hittest = value; item.hittestchildren = value;
    }
    function hide() {
        state = null; opened = false;
        root.hittest = false; root.hittestchildren = false;
        show("ArcadeTestCard", false); show("ArcadeTestPurchase", false);
    }
    function enabled() {
        if (!state) { hide(); return false; }
        if (!valid(root)) { diagnostic("context_invalid", state); hide(); return false; }
        if (!exactMap()) { diagnostic("map_rejected", state); hide(); return false; }
        if (!ready()) { diagnostic("layout_pending", state); hide(); return false; }
        return true;
    }
    function display(value) { return String(value).replace(/U币/g, "G币"); }
    function price(product) { return "¥" + (product.amount_fen / 100).toFixed(2); }
    function renderProduct() {
        var product = SNAPSHOT.products[selected];
        p("ArcadeTestProductTitle").text = display(product.title);
        p("ArcadeTestPrice").text = "配置售价 " + price(product);
        p("ArcadeTestRewards").text = "配置奖励：\n" + product.reward_lines.map(function (line) {
            return display(line.label) + " ×" + line.quantity + (line.duration_days ? "（" + line.duration_days + "天）" : "");
        }).join("\n");
        var buttons = p("ArcadeTestProducts").Children();
        for (var i = 0; i < buttons.length; i++) buttons[i].SetHasClass("Selected", i === selected);
    }
    function render() {
        if (!enabled()) return;
        root.hittest = false; root.hittestchildren = true;
        p("ArcadeTestPlayers").text = "在线：" + state.online_players + " / " + state.capacity;
        var name = state.host_player_id < 0 ? "尚未识别" : "玩家槽位 " + (state.host_player_id + 1);
        try {
            var actual = state.host_player_id < 0 ? "" : Players.GetPlayerName(state.host_player_id);
            if (typeof actual === "string" && actual.length) name = actual.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 40);
        } catch (ignore) {}
        p("ArcadeTestHost").text = "房主：" + name;
        p("ArcadeTestHTTP").text = "HTTP：" + phases[state.http_phase];
        p("ArcadeTestToggleText").text = collapsed ? "展开" : "收起";
        show("ArcadeTestBody", !collapsed); show("ArcadeTestCard", true);
        diagnostic("enabled", state);
        show("ArcadeTestPurchase", opened);
        if (opened) renderProduct();
    }
    function action(callback) { return function () { if (!enabled()) return true; try { callback(); render(); } catch (ignore) { diagnostic("action_error", state); hide(); } return true; }; }
    var bound = false;
    function bind() {
        if (bound || !ready()) return;
        p("ArcadeTestToggle").SetPanelEvent("onactivate", action(function () { collapsed = !collapsed; }));
        p("ArcadeTestPurchaseOpen").SetPanelEvent("onactivate", action(function () { opened = true; }));
        ["ArcadeTestClose", "ArcadeTestScrim"].forEach(function (id) { p(id).SetPanelEvent("onactivate", action(function () { opened = false; })); });
        p("ArcadeTestDialog").SetPanelEvent("onactivate", function () { return true; });
        var list = p("ArcadeTestProducts"); list.RemoveAndDeleteChildren();
        SNAPSHOT.products.forEach(function (product, index) {
            var button = $.CreatePanel("Button", list, ""); button.AddClass("ArcadeTestProduct");
            var label = $.CreatePanel("Label", button, ""); label.html = false; label.text = display(product.title) + "\n" + price(product);
            button.SetPanelEvent("onactivate", action(function () { selected = index; }));
        });
        bound = true;
    }
    function receive(name, key, raw) {
        if (name !== table || key !== "state") return;
        diagnostic("state_received", raw);
        if (!exactMap()) { diagnostic("map_rejected", raw); hide(); return; }
        var reason = rejected(raw);
        if (reason) { diagnostic("reject_" + reason, raw); hide(); return; }
        // Copy only the eight public fields; credentials/orders never belong here.
        state = {}; keys.forEach(function (key) { state[key] = raw[key]; });
        try { bind(); render(); } catch (ignore) { diagnostic("render_error", state); hide(); }
    }
    function monitor() {
        try {
            if (!valid(root)) {
                if (listener !== null) CustomNetTables.UnsubscribeNetTableListener(listener);
                return;
            }
            if (!exactMap()) { diagnostic("map_rejected", state); hide(); }
            else if (state) { bind(); render(); }
        } catch (ignore) { diagnostic("monitor_error", state); hide(); }
        $.Schedule(0.1, monitor);
    }
    hide();
    exactMap(); diagnostic("script_loaded", null);
    // No cached table read: entering this map requires a fresh server signal.
    try { listener = CustomNetTables.SubscribeNetTableListener(table, receive); diagnostic("listener_ready", null); } catch (ignore) { diagnostic("listener_error", null); }
    monitor();
})();
