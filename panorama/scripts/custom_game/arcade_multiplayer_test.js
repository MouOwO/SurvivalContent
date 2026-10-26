(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), previous = cfg.SurvivalArcadeReadOnlyShop;
    if (previous && typeof previous.Dispose === "function") previous.Dispose();
    var root = $.GetContextPanel(), state = null, collapsed = false, listener = null;
    var disposed = false, timer = null, api = null, bound = false, hook = null, leaseView = null;
    var catalog = null, catalogSource = null;
    var table = "survival_arcade_multiplayer_test";
    var diagnostics = Object.create(null), mapName = "<not_read>", mapType = "undefined";
    var phases = {not_run:"未验证", probing:"检测中", available:"已收到响应", unavailable:"当前不可用"};
    var currencies = {CNY:"人民币", u_coin:"G币", shop_points:"商城积分", shop_gold:"商城金币"};
    var keys = ["schema_version", "enabled", "session_only", "online_players", "capacity", "host_player_id", "http_phase", "sequence"];
    var required = ["ArcadeTestCard", "ArcadeTestBody", "ArcadeTestToggle", "ArcadeTestToggleText", "ArcadeTestPlayers", "ArcadeTestHost", "ArcadeTestHTTP", "ArcadeTestPurchaseOpen", "ArcadeTestCatalogStatus"];
    function p(id) { try { return root.FindChildTraverse(id); } catch (ignore) { return null; } }
    function valid(item) { try { return !!item && (!item.IsValid || item.IsValid()); } catch (ignore) { return false; } }
    function current() { return !disposed && cfg.SurvivalArcadeReadOnlyShop === api && valid(root); }
    function integer(value, low, high) { return typeof value === "number" && isFinite(value) && value === Math.floor(value) && value >= low && value <= high; }
    function text(value, maximum) { return typeof value === "string" && value.length <= maximum && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value); }
    function identifier(value) { return typeof value === "string" && /^[a-z][a-z0-9_]{0,95}$/.test(value); }
    function flag(value) { return value === true || value === 1; }
    function display(value) { return String(value).replace(/U币/g, "G币"); }
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
    function releaseHook() {
        var old = hook; hook = null;
        if (old && old.target.Open === old.wrapper) old.target.Open = old.original;
    }
    function closeModal() {
        var old = leaseView; leaseView = null;
        if (old) { try { old.CloseReadonly(api); } catch (ignore) {} }
    }
    function hide() {
        state = null; closeModal(); releaseHook();
        if (valid(root)) { root.hittest = false; root.hittestchildren = false; }
        show("ArcadeTestCard", false);
    }
    function enabled() {
        if (!current()) return false;
        if (!state) { hide(); return false; }
        if (!exactMap()) { diagnostic("map_rejected", state); hide(); return false; }
        if (!ready()) { diagnostic("layout_pending", state); hide(); return false; }
        return true;
    }
    function layers() {
        var value = cfg.SurvivalUILayers;
        try {
            return value && typeof value.Open === "function" && typeof value.Close === "function" && typeof value.Top === "function"
                && (!value.IsAlive || value.IsAlive()) ? value : null;
        } catch (ignore) { return null; }
    }
    function validateCatalog(raw) {
        if (!raw || typeof raw !== "object" || raw.schema_version !== 1 || raw.checkout_enabled !== false
            || typeof raw.catalog_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.catalog_sha256)
            || !Array.isArray(raw.products) || !raw.products.length || raw.products.length > 1024
            || !Array.isArray(raw.categories) || !raw.categories.length || raw.categories.length > 128) return null;
        var categories = [], categoriesById = Object.create(null), offers = Object.create(null), products = [];
        for (var c = 0; c < raw.categories.length; c++) {
            var row = raw.categories[c];
            if (!row || !identifier(row.id) || categoriesById[row.id] || !text(row.label, 100) || !row.label) return null;
            categoriesById[row.id] = true; categories.push({id:row.id, label:display(row.label)});
        }
        for (var i = 0; i < raw.products.length; i++) {
            var item = raw.products[i];
            if (!item || !identifier(item.sku) || !identifier(item.product_type) || !categoriesById[item.category_id]
                || !Object.prototype.hasOwnProperty.call(currencies, item.currency)
                || item.offer_id !== (item.currency === "CNY" ? "cash:" : "wallet:") + item.sku || offers[item.offer_id]
                || !text(item.title, 256) || !item.title || !text(item.description, 4000)
                || !integer(item.price, 0, 9007199254740991) || !integer(item.purchase_limit, 0, 9007199254740991)
                || !integer(item.required_vip_level, 0, 1000000) || !Array.isArray(item.reward_lines) || item.reward_lines.length > 256) return null;
            var rewards = [];
            for (var r = 0; r < item.reward_lines.length; r++) {
                var line = item.reward_lines[r];
                if (!line || !identifier(line.kind) || !text(line.id, 160) || !line.id || !text(line.label, 256)
                    || typeof line.quantity !== "number" || !isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 9007199254740991
                    || (line.duration_days !== undefined && !integer(line.duration_days, 1, 3650000))) return null;
                var reward = {kind:line.kind, id:line.id, label:display(line.label || line.id), quantity:line.quantity};
                if (line.duration_days !== undefined) reward.duration_days = line.duration_days;
                rewards.push(reward);
            }
            offers[item.offer_id] = true;
            products.push({offer_id:item.offer_id, sku:item.sku, title:display(item.title), description:display(item.description),
                category_id:item.category_id, product_type:item.product_type, currency:item.currency, price:item.price,
                purchase_limit:item.purchase_limit, required_vip_level:item.required_vip_level, reward_lines:rewards, source_index:i});
        }
        var featured = {archive_pass_monthly:0, special_lottery_ticket_single:1, u_coin_recharge:2};
        function rank(item) { return Object.prototype.hasOwnProperty.call(featured, item.sku) ? featured[item.sku] : 3; }
        products.sort(function (a, b) { return rank(a) - rank(b) || a.source_index - b.source_index; });
        return {schema_version:1, checkout_enabled:false, catalog_sha256:raw.catalog_sha256, products:products, categories:categories};
    }
    function shopView() {
        var view = cfg.SurvivalCommerceView;
        return view && typeof view.OpenReadonly === "function" && typeof view.CloseReadonly === "function"
            && typeof view.IsReadonlyOpen === "function" ? view : null;
    }
    function readCatalog() {
        var raw = cfg.SurvivalArcadeShopCatalog;
        if (catalog && raw === catalogSource && raw.checkout_enabled === false && raw.schema_version === 1 && raw.catalog_sha256 === catalog.catalog_sha256) return true;
        catalogSource = raw; catalog = validateCatalog(raw);
        if (!catalog) { closeModal(); return false; }
        return true;
    }
    function action(callback) { return function () {
        if (!enabled()) return true;
        try { callback(); render(); } catch (ignore) { diagnostic("action_error", state); hide(); }
        return true;
    }; }
    function syncHook() {
        var target = cfg.SurvivalPayments;
        if (hook && hook.target === target && target.Open === hook.wrapper) return;
        releaseHook();
        if (!target || typeof target.Open !== "function") return;
        var original = target.Open;
        var wrapper = function () {
            // A presentation redirect is not payment authorization. Outside this
            // fresh server-marked session, preserve the original menu behavior.
            if (enabled()) return api.Open();
            return original.apply(target, arguments);
        };
        hook = {target:target, original:original, wrapper:wrapper}; target.Open = wrapper;
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
        var available = readCatalog(), view = shopView(), layerReady = !!layers() && !!view;
        p("ArcadeTestPurchaseOpen").enabled = available && layerReady;
        p("ArcadeTestCatalogStatus").text = !available ? "正式商品目录正在准备，暂不可打开。" : !layerReady ? "商城正在准备，请稍后重试。" : "自有商城 · " + catalog.products.length + " 项配置，只读。";
        if (leaseView && (leaseView !== view || !leaseView.IsReadonlyOpen(api))) closeModal();
        syncHook(); diagnostic("enabled", state);
    }
    function openShop() {
        if (!enabled()) return false;
        try {
            var view = shopView();
            if (!readCatalog() || !view || !layers()) { render(); return false; }
            closeModal(); leaseView = view;
            if (view.OpenReadonly(catalog, api) !== true) { closeModal(); return false; }
            return view.IsReadonlyOpen(api);
        } catch (ignore) { diagnostic("open_error", state); hide(); return false; }
    }
    function bind() {
        if (bound || !ready()) return;
        p("ArcadeTestToggle").SetPanelEvent("onactivate", action(function () { collapsed = !collapsed; }));
        p("ArcadeTestPurchaseOpen").SetPanelEvent("onactivate", action(openShop));
        bound = true;
    }
    function receive(name, key, raw) {
        if (!current() || name !== table || key !== "state") return;
        diagnostic("state_received", raw);
        if (!exactMap()) { diagnostic("map_rejected", raw); hide(); return; }
        var reason = rejected(raw); if (reason) { diagnostic("reject_" + reason, raw); hide(); return; }
        state = {}; keys.forEach(function (key) { state[key] = raw[key]; });
        try { bind(); render(); } catch (ignore) { diagnostic("render_error", state); hide(); }
    }
    function dispose() {
        if (disposed) return;
        disposed = true; hide();
        if (timer !== null && $.CancelScheduled) { try { $.CancelScheduled(timer); } catch (ignore) {} }
        timer = null;
        if (listener !== null) { try { CustomNetTables.UnsubscribeNetTableListener(listener); } catch (ignore) {} listener = null; }
        if (cfg.SurvivalArcadeReadOnlyShop === api) cfg.SurvivalArcadeReadOnlyShop = null;
    }
    function monitor() {
        timer = null;
        if (!current()) { dispose(); return; }
        try {
            if (!exactMap()) { diagnostic("map_rejected", state); hide(); }
            else if (state) { bind(); render(); }
        } catch (ignore) { diagnostic("monitor_error", state); hide(); }
        if (current()) timer = $.Schedule(0.1, monitor);
    }
    api = {Open:openShop, Close:function () { if (!current()) return; closeModal(); }, IsAvailable:function () { return enabled() && readCatalog() && !!layers() && !!shopView(); }, Dispose:dispose};
    cfg.SurvivalArcadeReadOnlyShop = api;
    hide(); exactMap(); diagnostic("script_loaded", null);
    // Cached table values cannot activate this layout. The catalog is a signed
    // public build projection, never a live balance, ownership or order quote.
    try { listener = CustomNetTables.SubscribeNetTableListener(table, receive); diagnostic("listener_ready", null); } catch (ignore) { diagnostic("listener_error", null); }
    monitor();
})();
