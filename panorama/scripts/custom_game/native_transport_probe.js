// Echo transport evidence only. No HTTP, account grant, profile or payment action.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), key = "SurvivalNativeTransportProbe";
    var registryKey = "SurvivalNativeTransportProbeCommandsV1";
    var prefix = "[WS4-NATIVE-TRANSPORT-PROBE] ";
    var sendCommand = "survival_native_transport_probe";
    var pollCommand = "survival_native_transport_probe_poll";
    var requestEvent = "survival_native_transport_probe_request";
    var replyEvent = "survival_native_transport_probe_reply";
    var previous = cfg[key], root = $.GetContextPanel(), disposed = false;
    var listener = null, panelHook = false, api = null, rows = Object.create(null), order = [];
    var registry = cfg[registryKey], revision = "WS4-NATIVE-PROBE-01";
    if (previous && typeof previous.Dispose === "function") previous.Dispose();
    if (!registry) {
        registry = {version: 1, commands: Object.create(null), sent: [], clock: 0};
        cfg[registryKey] = registry;
    }
    // An unknown owner must not be replaced or used as a command dispatcher.
    if (registry.version !== 1 || !registry.commands || !Array.isArray(registry.sent)
        || registry.sent.length > 10 || typeof registry.clock !== "number") return;
    function valid() {
        try { return !disposed && cfg[key] === api && cfg[registryKey] === registry
            && root && root.IsValid(); } catch (ignore) { return false; }
    }
    function clock() {
        var now = Date.now();
        if (typeof now !== "number" || !isFinite(now) || now < registry.clock) return null;
        registry.clock = now;
        return now;
    }
    function nonce(value) { return typeof value === "string" && value.length === 32 && !/[^a-f0-9]/.test(value); }
    function echo(value) {
        // URL-safe base64 characters only; this probe never decodes the echo.
        return typeof value === "string" && value.length >= 1 && value.length <= 192 && !/[^A-Za-z0-9_-]/.test(value);
    }
    function numericAccount(value) {
        return typeof value === "number" && isFinite(value) && value % 1 === 0
            && value > 0 && value <= 4294967295 ? String(value) : "";
    }
    function steamAccount(value) {
        if (typeof value !== "string") return "";
        var steam3 = /^\[U:1:([1-9][0-9]{0,9})\]$/.exec(value);
        if (steam3 && steam3[0] === value) return numericAccount(Number(steam3[1]));
        if (value.length !== 17 || /[^0-9]/.test(value) || value <= "76561197960265728" || value > "76561202255233023") return "";
        // Do not round the engine's Steam64 identity through a JS Number.
        var base = "76561197960265728", borrow = 0, result = "";
        for (var i = 16; i >= 0; i--) {
            var digit = Number(value[i]) - Number(base[i]) - borrow;
            borrow = digit < 0 ? 1 : 0;
            if (borrow) digit += 10;
            result = String(digit) + result;
        }
        return borrow ? "" : numericAccount(Number(result.replace(/^0+/, "") || "0"));
    }
    function binding() {
        try {
            var id = Game.GetLocalPlayerID(), info = Game.GetMapInfo(), map = info && info.map_name;
            if (typeof id !== "number" || !isFinite(id) || id % 1 || id < 0 || id > 23
                || map !== "template_map" && map !== "maps/template_map.vpk") return null;
            var account = "", fallback = "";
            if (typeof Players !== "undefined" && typeof Players.GetSteamAccountID === "function")
                account = numericAccount(Players.GetSteamAccountID(id));
            if (typeof Game.GetPlayerInfo === "function") {
                var player = Game.GetPlayerInfo(id);
                fallback = steamAccount(player && player.player_steamid);
            }
            if (account && fallback && account !== fallback) return null;
            account = account || fallback;
            var loading = CustomNetTables.GetTableValue("survival_loading", "state"), session = loading && loading.session_id;
            if (!account || typeof session !== "string" || session.length < 8 || session.length > 128
                || /[^A-Za-z0-9_.:-]/.test(session)) return null;
            return {player_id: id, account_id: account, match_session_id: session, key: id + ":" + account + ":" + session};
        } catch (ignore) { return null; }
    }
    function emit(status, id, value) {
        if (!valid()) return;
        var result = {kind: "WS4_NATIVE_TRANSPORT_PROBE", scope: "echo_only", status: status};
        if (nonce(id)) result.nonce = id;
        if (value && echo(value.echo_b64)) result.echo_b64 = value.echo_b64;
        if (status === "reply") result.ok = true;
        $.Msg(prefix + JSON.stringify(result));
    }
    function prune(now) {
        order = order.filter(function (id) {
            if (!rows[id] || now - rows[id].at >= 120000) { delete rows[id]; return false; }
            return true;
        });
        registry.sent = registry.sent.filter(function (at) { return now - at < 30000; });
    }
    function poll(id) {
        if (!valid()) return false;
        var now = clock();
        if (!nonce(id) || now === null) { emit("invalid_poll"); return false; }
        prune(now);
        var row = rows[id], owner = binding();
        if (!row || !owner || row.owner !== owner.key) { emit("missing", id); return false; }
        emit(row.received ? "reply" : now - row.at >= 30000 ? "timeout" : "pending", id, row);
        return !!row.received;
    }
    function send(id, value) {
        if (!valid()) return false;
        if (!nonce(id) || !echo(value)) { emit("invalid_request"); return false; }
        var now = clock(), owner = binding();
        if (now === null || !owner) { emit("unavailable", id); return false; }
        prune(now);
        if (rows[id]) {
            if (rows[id].echo_b64 !== value || rows[id].owner !== owner.key) { emit("nonce_conflict", id); return false; }
            poll(id); return false;
        }
        if (registry.sent.length >= 10) { emit("rate_limited", id); return false; }
        while (order.length >= 20) delete rows[order.shift()];
        var row = {at: now, owner: owner.key, echo_b64: value, received: false};
        rows[id] = row; order.push(id); registry.sent.push(now);
        try {
            GameEvents.SendCustomGameEventToServer(requestEvent, {nonce: id, echo_b64: value});
            emit("sent", id, row); return true;
        } catch (ignore) {
            // Keep the nonce consumed: an ambiguous send is never automatically retried.
            emit("send_failed", id); return false;
        }
    }
    function receive(value) {
        if (!valid() || !value || typeof value !== "object" || Object.keys(value).length !== 7
            || !["ok", "revision", "nonce", "echo_b64", "player_id", "account_id", "match_session_id"].every(function (name) { return Object.prototype.hasOwnProperty.call(value, name); })
            || value.ok !== true || value.revision !== revision || !nonce(value.nonce) || !echo(value.echo_b64)) return;
        var now = clock();
        if (now === null) return;
        prune(now);
        var row = rows[value.nonce], owner = binding();
        if (!row || row.received || !owner || owner.key !== row.owner || now - row.at >= 30000
            || value.player_id !== owner.player_id || value.account_id !== owner.account_id
            || value.match_session_id !== owner.match_session_id
            || value.echo_b64 !== row.echo_b64) return;
        row.received = true;
        emit("reply", value.nonce, row);
    }
    function dispose() {
        if (disposed) return;
        disposed = true; rows = Object.create(null); order = [];
        if (listener !== null) {
            try { GameEvents.Unsubscribe(listener); } catch (ignore) {}
            listener = null;
        }
        if (panelHook && typeof $.UnregisterEventHandler === "function") {
            try { $.UnregisterEventHandler("PanelDeleted", root, dispose); } catch (ignore) {}
        }
        panelHook = false;
        if (cfg[key] === api) cfg[key] = null;
    }
    api = {Send: send, Poll: poll, Dispose: dispose, IsCurrent: valid,
        Inspect: function () { return {current: valid(), records: order.length, scope: "echo_only"}; }};
    cfg[key] = api;
    function register(name, method, count) {
        var record = registry.commands[name];
        if (record && (record.registered || record.attempts >= 2)) return;
        if (!record) record = registry.commands[name] = {attempts: 0, registered: false};
        record.attempts++;
        try {
            Game.AddCommand(name, function () {
                var current = cfg[key], args = Array.prototype.slice.call(arguments);
                if (cfg[registryKey] !== registry || !current || typeof current.IsCurrent !== "function"
                    || !current.IsCurrent()) return;
                if (args[0] === name) args.shift();
                if (args.length !== count || args.some(function (arg) { return typeof arg !== "string"; })) return;
                if (method === "Send") current.Send(args[0], args[1]);
                else current.Poll(args[0]);
            }, "Echo-only native transport probe; no login, profile or payment action", 0);
            record.registered = true;
        } catch (ignore) { emit("command_unavailable"); }
    }
    try { listener = GameEvents.Subscribe(replyEvent, receive); }
    catch (ignore) { dispose(); return; }
    try { $.RegisterEventHandler("PanelDeleted", root, dispose); panelHook = true; } catch (ignore) {}
    register(sendCommand, "Send", 2);
    register(pollCommand, "Poll", 1);
}());
