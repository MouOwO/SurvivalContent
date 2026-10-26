(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), previous = cfg.SurvivalArcadeReadOnlyShop;
    if (previous && typeof previous.Dispose === "function") previous.Dispose();
    var root = $.GetContextPanel(), state = null, opened = false, collapsed = false, listener = null;
    var disposed = false, timer = null, api = null, bound = false, hook = null, modal = null;
    var catalog = null, catalogSource = null, selected = "", category = "*", listRevision = "", detailRevision = "";
    var table = "survival_arcade_multiplayer_test", modalId = "arcade_readonly_shop";
    var SHOP_URL = "https://pay.xiaofengnet.com/ws4-shop/";
    var diagnostics = Object.create(null), mapName = "<not_read>", mapType = "undefined";
    var phases = {not_run:"未验证", probing:"检测中", available:"已收到响应", unavailable:"当前不可用"};
    var currencies = {CNY:"人民币", u_coin:"G币", shop_points:"商城积分", shop_gold:"商城金币"};
    var keys = ["schema_version", "enabled", "session_only", "online_players", "capacity", "host_player_id", "http_phase", "sequence"];
    var required = ["ArcadeTestCard", "ArcadeTestBody", "ArcadeTestToggle", "ArcadeTestToggleText", "ArcadeTestPlayers", "ArcadeTestHost", "ArcadeTestHTTP", "ArcadeTestPurchaseOpen", "ArcadeTestPurchase", "ArcadeTestScrim", "ArcadeTestDialog", "ArcadeTestClose", "ArcadeTestCategories", "ArcadeTestProducts", "ArcadeTestProductTitle", "ArcadeTestPrice", "ArcadeTestRewards", "ArcadeTestDescription", "ArcadeTestLimits", "ArcadeTestCatalogStatus", "ArcadeTestWebShop"];
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
        var old = modal; modal = null;
        if (old) { try { old.layers.Close(modalId); } catch (ignore) {} }
        show("ArcadeTestPurchase", false);
    }
    function hide() {
        state = null; opened = false;
        closeModal(); releaseHook();
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
        return {catalog_sha256:raw.catalog_sha256, products:products, categories:categories};
    }
    function price(item) { return item.currency === "CNY" ? "¥" + (item.price / 100).toFixed(2) : item.price + " " + currencies[item.currency]; }
    function quoteKind(item) { return item.currency === "CNY" ? "现金配置 · 收款未开放" : currencies[item.currency] + "兑换配置"; }
    function readCatalog() {
        var raw = cfg.SurvivalArcadeShopCatalog;
        if (catalog && raw === catalogSource && raw.checkout_enabled === false && raw.schema_version === 1 && raw.catalog_sha256 === catalog.catalog_sha256) return true;
        var value = validateCatalog(raw);
        catalogSource = raw; catalog = value; listRevision = "";
        if (!value) { opened = false; closeModal(); return false; }
        if (!value.categories.some(function (row) { return row.id === category; })) category = "*";
        if (!value.products.some(function (row) { return row.offer_id === selected; })) selected = value.products[0].offer_id;
        buildCategories(); return true;
    }
    function label(parent, value, className) {
        var node = $.CreatePanel("Label", parent, ""); node.html = false; node.text = value;
        if (className) node.AddClass(className); return node;
    }
    function action(callback) { return function () {
        if (!enabled()) return true;
        try { callback(); render(); } catch (ignore) { diagnostic("action_error", state); hide(); }
        return true;
    }; }
    function buildCategories() {
        var container = p("ArcadeTestCategories"); container.RemoveAndDeleteChildren();
        [{id:"*", label:"全部"}].concat(catalog.categories).forEach(function (row) {
            var button = $.CreatePanel("Button", container, ""); button.AddClass("ArcadeTestCategory");
            button.__shopCategory = row.id; label(button, row.label);
            button.SetPanelEvent("onactivate", action(function () { category = row.id; listRevision = ""; }));
        });
    }
    function renderProducts() {
        var visible = catalog.products.filter(function (row) { return category === "*" || row.category_id === category; });
        if (!visible.some(function (row) { return row.offer_id === selected; })) selected = visible.length ? visible[0].offer_id : "";
        var revision = category + "|" + catalog.catalog_sha256;
        if (revision !== listRevision) {
            // A new category/catalog starts at its first offer. Native panels
            // retain their previous scroll offset when children are replaced.
            selected = visible.length ? visible[0].offer_id : "";
            var container = p("ArcadeTestProducts"); container.RemoveAndDeleteChildren();
            visible.forEach(function (item) {
                var button = $.CreatePanel("Button", container, ""); button.AddClass("ArcadeTestProduct");
                button.__shopOffer = item.offer_id;
                label(button, item.title, "ArcadeTestProductName");
                label(button, price(item) + " · " + quoteKind(item), "ArcadeTestProductQuote");
                button.SetPanelEvent("onactivate", action(function () { selected = item.offer_id; }));
            });
            container.ScrollToTop();
            listRevision = revision;
        }
        p("ArcadeTestProducts").Children().forEach(function (button) { button.SetHasClass("Selected", button.__shopOffer === selected); });
        p("ArcadeTestCategories").Children().forEach(function (button) { button.SetHasClass("Selected", button.__shopCategory === category); });
        var product = visible.filter(function (row) { return row.offer_id === selected; })[0];
        p("ArcadeTestProductTitle").text = product ? product.title : "本分类暂无商品";
        p("ArcadeTestDescription").text = product ? product.description : "";
        p("ArcadeTestPrice").text = product ? "配置" + (product.currency === "CNY" ? "售价 " : "兑换价 ") + price(product) + " · " + quoteKind(product) : "";
        p("ArcadeTestLimits").text = product ? "配置限购：" + (product.purchase_limit ? product.purchase_limit + " 次" : "不限次数")
            + "；VIP门槛：" + (product.required_vip_level || "无") + "。不代表本账号剩余次数或资格。" : "";
        p("ArcadeTestRewards").text = product ? "配置奖励（本局不发放）：\n" + product.reward_lines.map(function (row) {
            return row.label + " ×" + row.quantity + (row.duration_days ? "（" + row.duration_days + "天）" : "");
        }).join("\n") : "";
        var nextDetail = catalog.catalog_sha256 + "|" + (product ? product.offer_id : "");
        if (nextDetail !== detailRevision) {
            p("ArcadeTestProductTitle").GetParent().ScrollToTop();
            detailRevision = nextDetail;
        }
    }
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
    function syncModal() {
        var activeLayers = layers();
        if (!opened) { closeModal(); return; }
        if (!activeLayers) { opened = false; closeModal(); p("ArcadeTestCatalogStatus").text = "窗口正在准备，请稍后重试。"; return; }
        if (modal && modal.layers !== activeLayers) closeModal();
        if (!modal) {
            modal = {layers:activeLayers};
            activeLayers.Open(modalId, p("ArcadeTestDialog"), function () { if (!current()) return; opened = false; closeModal(); render(); }, {scrim:p("ArcadeTestScrim")});
        }
        show("ArcadeTestPurchase", true);
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
        var available = readCatalog(), layerReady = !!layers();
        p("ArcadeTestPurchaseOpen").enabled = available && layerReady;
        p("ArcadeTestCatalogStatus").text = !available ? "正式商品目录正在准备，暂不可打开。" : !layerReady ? "窗口正在准备，请稍后重试。" : "正式商品配置 · " + catalog.products.length + " 项，只读。";
        if (available) renderProducts();
        syncHook(); syncModal(); diagnostic("enabled", state);
    }
    function openShop() {
        if (!enabled()) return false;
        try {
            if (!readCatalog() || !layers()) { render(); return false; }
            if (!opened) { listRevision = ""; detailRevision = ""; }
            opened = true; render(); return opened;
        } catch (ignore) { diagnostic("open_error", state); hide(); return false; }
    }
    function bind() {
        if (bound || !ready()) return;
        p("ArcadeTestToggle").SetPanelEvent("onactivate", action(function () { collapsed = !collapsed; }));
        p("ArcadeTestPurchaseOpen").SetPanelEvent("onactivate", action(openShop));
        ["ArcadeTestClose", "ArcadeTestScrim"].forEach(function (id) { p(id).SetPanelEvent("onactivate", action(function () { opened = false; })); });
        p("ArcadeTestDialog").SetPanelEvent("onactivate", function () { return true; });
        p("ArcadeTestWebShop").SetPanelEvent("onactivate", action(function () {
            if (opened && readCatalog() && modal && modal.layers === layers()) $.DispatchEvent("ExternalBrowserGoToURL", SHOP_URL);
        }));
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
    api = {Open:openShop, Close:function () { if (!current()) return; opened = false; closeModal(); }, IsAvailable:function () { return enabled() && readCatalog() && !!layers(); }, Dispose:dispose};
    cfg.SurvivalArcadeReadOnlyShop = api;
    hide(); exactMap(); diagnostic("script_loaded", null);
    // Cached table values cannot activate this layout. The catalog is a signed
    // public build projection, never a live balance, ownership or order quote.
    try { listener = CustomNetTables.SubscribeNetTableListener(table, receive); diagnostic("listener_ready", null); } catch (ignore) { diagnostic("listener_error", null); }
    monitor();
})();
