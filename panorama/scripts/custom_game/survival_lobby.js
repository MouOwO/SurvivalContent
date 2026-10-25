(function () {
    "use strict";
    var root = $.GetContextPanel();
    // The host owns the context panel's visibility. Only our inner panel paints
    // or receives input, and XML/CSS keep it collapsed before this script runs.
    root.hittest = false;
    root.hittestchildren = false;
    var mounted = false;
    var generation = 0;
    var subscriptions = [];
    var renderTicks = 0;
    var requiredPanels = ["SurvivalLobbyOverlay", "LobbyCard", "LobbyStatusTitle", "LobbyStatusDetail", "LobbyStatusStrip",
        "LobbyAuthPanel", "LobbyAuthStatus", "LobbyAuthCode", "LobbyAuthOpen", "LobbyRoomNumber", "LobbyRoomHint",
        "LobbyReadyText", "LobbyInviteBar", "LobbyInviteCode", "LobbyCreate", "LobbyJoin", "LobbyInvite", "LobbyLeave",
        "LobbyReady", "LobbyStart", "LobbyReconnect", "LobbyRefresh", "LobbyInviteInput", "LobbyActionHint",
        "LobbyPlayers", "LobbyRoomList", "LobbyRoomsEmpty"];

    var state = null;
    var lastReply = -1;
    var lastRequest = -Infinity;
    var nextRefresh = -Infinity;
    var pendingUntil = -Infinity;
    var localNotice = "";
    var auth = null;
    var invite = null;
    var dispatchedMatches = Object.create(null);
    var dispatchedCount = 0;
    var AUTH_TEXT = {
        requesting: "正在准备网页授权…",
        pending: "请打开网页登录并确认短码，完成后会自动继续。",
        approved: "网页登录已确认，正在校验大厅身份…",
        expired: "短码已过期，正在等待游戏自动更新。",
        failed: "暂时无法获取网页授权，游戏会自动重试。"
    };
    var ERROR_TEXT = {
        service_unavailable: "大厅服务暂不可用，请稍后刷新。",
        worker_unavailable: "暂无可用服务器，暂时无法开始。",
        no_worker: "暂无可用服务器，暂时无法开始。",
        unauthenticated: "请先完成本次网页登录授权。",
        authentication_required: "请先完成本次网页登录授权。",
        room_full: "房间已满，请选择其他房间。",
        room_not_found: "房间已关闭，请刷新列表。",
        revision_conflict: "房间状态已变化，请刷新后重试。",
        stale_revision: "房间状态已变化，请刷新后重试。",
        not_host: "只有房主可以开始本局。",
        not_ready: "请等待所有玩家准备。",
        forbidden: "当前账号不能执行此操作。",
        invalid_invite_code: "请输入房主发送的有效邀请码。",
        invite_invalid_or_expired: "邀请码无效、已使用或已过期，请让房主重新获取。",
        room_full_or_already_joined: "房间已满，或你已经在此房间。",
        already_in_room: "你已经在一个房间中，请先离开。",
        room_owner_required: "只有房主可以执行此操作。",
        room_not_ready: "请等待所有玩家准备。",
        room_version_conflict: "房间状态已变化，请刷新后重试。",
        room_not_open: "房间已经开始或关闭，无法加入。",
        no_ready_worker: "暂无通过验证的服务器，暂时无法开始。"
    };
    function panel(id) {
        try { return root.FindChildTraverse(id); } catch (ignore) { return null; }
    }
    function lobbyMap() {
        try {
            var map = Game.GetMapInfo();
            var name = map && (typeof map.map_name === "string" ? map.map_name : map.map_display_name);
            return name === "ws4_lobby" || name === "maps/ws4_lobby.vpk";
        } catch (ignore) { return false; }
    }
    function layoutReady() {
        for (var i = 0; i < requiredPanels.length; i++) {
            var item = panel(requiredPanels[i]);
            if (!item || (item.IsValid && !item.IsValid())) return false;
        }
        return true;
    }
    function contentVisible(show) {
        root.hittest = false;
        root.hittestchildren = show;
        var content = panel("SurvivalLobbyOverlay");
        if (!content) return;
        content.style.visibility = show ? "visible" : "collapse";
        content.visible = show;
        content.hittest = show;
        content.hittestchildren = show;
    }
    function deactivate() {
        contentVisible(false);
        if (!mounted && !subscriptions.length) return;
        mounted = false;
        generation++;
        subscriptions.forEach(function (id) {
            try { if (typeof GameEvents.Unsubscribe === "function") GameEvents.Unsubscribe(id); } catch (ignore) {}
        });
        subscriptions = [];
        state = null; auth = null; invite = null;
        lastReply = -1; lastRequest = -Infinity; nextRefresh = -Infinity; pendingUntil = -Infinity;
        localNotice = ""; renderTicks = 0;
    }
    function current() {
        if (mounted && lobbyMap() && layoutReady()) return true;
        deactivate();
        return false;
    }
    function guarded(epoch, callback) {
        return function (value) {
            if (epoch !== generation || !current()) return;
            try { callback(value); } catch (ignore) { deactivate(); }
        };
    }
    function flag(value) { return value === true || value === 1; }
    function now() { return Game.Time(); }
    function text(value, limit) {
        return typeof value === "string" ? value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, limit) : "";
    }
    function roomId(value) {
        return typeof value === "string" && value.length >= 1 && value.length <= 64 && !/[^A-Za-z0-9_-]/.test(value) ? value : "";
    }
    function inviteCode(value) {
        return typeof value === "string" && value.length >= 16 && value.length <= 64 && !/[^A-Za-z0-9_-]/.test(value) ? value : "";
    }
    function revision(value) {
        return typeof value === "number" && isFinite(value) && value >= 0 && value <= 9007199254740991 && Math.floor(value) === value ? value : 0;
    }
    function rows(value, limit) {
        if (!value || typeof value !== "object") return [];
        var result = [];
        var keys = Object.keys(value).filter(function (key) { return /^(0|[1-9][0-9]*)$/.test(key); });
        keys.sort(function (a, b) { return Number(a) - Number(b); });
        for (var i = 0; i < keys.length && result.length < limit; i++) {
            if (value[keys[i]] && typeof value[keys[i]] === "object") result.push(value[keys[i]]);
        }
        return result;
    }
    function receive(raw) {
        if (!current()) return;
        if (!raw || typeof raw !== "object") return;
        var id = roomId(raw.room_id);
        var rev = revision(raw.revision);
        if (state && state.room_id === id && rev < state.revision) return;
        state = {
            ok: flag(raw.ok) && /^(open|lobby|idle|ready|starting|connecting|started|running|in_game|allocated|interrupted|closed)$/.test(raw.phase), authenticated: flag(raw.authenticated),
            phase: text(raw.phase, 32), room_id: id, revision: rev,
            players: rows(raw.players, 4), rooms: rows(raw.rooms, 30),
            worker_available: flag(raw.worker_available),
            self_is_host: flag(raw.self_is_host), self_ready: flag(raw.self_ready),
            error: typeof raw.error === "string" && Object.prototype.hasOwnProperty.call(ERROR_TEXT, raw.error) ? ERROR_TEXT[raw.error] : (raw.error ? "操作未完成，请刷新后重试。" : "")
        };
        var code = state.self_is_host && state.phase === "open" ? inviteCode(raw.invite_code) : "";
        if (!code) invite = null;
        else if (!invite || invite.code !== code || invite.room_id !== id) invite = {code: code, room_id: id, expires: now() + 600};
        lastReply = now();
        pendingUntil = -Infinity;
        localNotice = "";
        render();
    }
    function available() { return state && state.ok && now() - lastReply < 16; }
    function inRoom() { return !!(state && state.room_id && state.phase !== "closed"); }
    function busy() { return !!(state && /^(starting|connecting|started|running|in_game|allocated)$/.test(state.phase)); }
    function openRoom() { return !!(state && /^(open|lobby|idle|ready)$/.test(state.phase)); }
    function everyoneReady() {
        if (!state || !state.players.length) return false;
        for (var i = 0; i < state.players.length; i++) if (!flag(state.players[i].ready)) return false;
        return true;
    }
    function permitted(action) {
        if (!current()) return false;
        if (action === "refresh") return true;
        if (!available() || !state.authenticated || now() < pendingUntil) return false;
        if (action === "create" || action === "join") return !inRoom() && !busy();
        if (action === "leave") return inRoom() && (openRoom() || (state.phase === "interrupted" && state.self_is_host));
        if (action === "ready") return inRoom() && openRoom();
        if (action === "invite") return inRoom() && openRoom() && state.self_is_host && state.players.length < 4;
        if (action === "start") return inRoom() && openRoom() && state.self_is_host && everyoneReady() && state.worker_available;
        if (action === "reconnect") return inRoom() && /^(started|running|in_game|connecting)$/.test(state.phase) && state.worker_available;
        return false;
    }
    function request(action, selectedInvite) {
        if (!permitted(action) || now() - lastRequest < 0.35) return;
        var payload;
        if (action === "join") {
            var code = inviteCode(typeof selectedInvite === "string" ? selectedInvite.trim() : "");
            if (!code) { localNotice = ERROR_TEXT.invalid_invite_code; render(); return; }
            payload = {action: "join", invite_code: code};
        } else {
            payload = {action: action, room_id: inRoom() ? state.room_id : "", revision: state ? state.revision : 0};
        }
        lastRequest = now();
        if (action !== "refresh") pendingUntil = now() + 5;
        try {
            GameEvents.SendCustomGameEventToServer("survival_lobby_request", payload);
            if (action === "join") panel("LobbyInviteInput").text = "";
        } catch (ignore) {
            pendingUntil = -Infinity;
            localNotice = ERROR_TEXT.service_unavailable;
        }
        render();
    }
    function authUri() {
        if (!current()) return "";
        if (!auth || auth.status !== "pending" || now() >= auth.expires || (state && state.authenticated)) return "";
        if (auth.user_code.length < 6 || auth.user_code.length > 16 || /[^A-Z0-9-]/.test(auth.user_code)) return "";
        var expected = "https://pay.xiaofengnet.com/ws4-web/authorize?code=" + auth.user_code;
        return auth.verification_uri === expected ? expected : "";
    }
    function authDiagnostic(raw) {
        if (raw.status !== "failed" || raw.diagnostic_revision !== "WS4-WEB-04"
            || !/^(start|poll)$/.test(raw.diagnostic_phase)
            || !/^(API|create|send|http|json|fields|timeout)$/.test(raw.diagnostic_stage)
            || typeof raw.diagnostic_status !== "number" || raw.diagnostic_status > 599
            || raw.diagnostic_status < 0 || raw.diagnostic_status !== Math.floor(raw.diagnostic_status)) return "";
        return " (WS4-WEB-04 / " + raw.diagnostic_phase + " / " + raw.diagnostic_stage + " / " + raw.diagnostic_status + ")";
    }
    function receiveAuth(raw) {
        if (!current()) return;
        if (!raw || typeof raw !== "object" || !Object.prototype.hasOwnProperty.call(AUTH_TEXT, raw.status)) return;
        var localPlayer;
        try { localPlayer = Game.GetLocalPlayerID(); } catch (ignore) { return; }
        if (typeof raw.player_id !== "number" || raw.player_id < 0 || raw.player_id !== Math.floor(raw.player_id) || raw.player_id !== localPlayer) return;
        var lifetime = typeof raw.expires_in === "number" ? Math.min(900, revision(raw.expires_in)) : 600;
        var expires = now() + lifetime;
        var code = typeof raw.user_code === "string" && raw.user_code.length >= 6 && raw.user_code.length <= 16 && !/[^A-Z0-9-]/.test(raw.user_code) ? raw.user_code : "";
        if (auth && auth.status === "pending" && auth.user_code === code) expires = Math.min(expires, auth.expires);
        auth = {status: raw.status, user_code: code,
            verification_uri: code && raw.verification_uri === "https://pay.xiaofengnet.com/ws4-web/authorize?code=" + code ? raw.verification_uri : "",
            expires: expires, diagnostic: authDiagnostic(raw)};
        render();
    }
    function renderAuth() {
        panel("LobbyAuthPanel").visible = !(state && state.authenticated);
        var uri = authUri();
        var status = auth ? AUTH_TEXT[auth.status] : "正在等待网页授权短码…";
        if (auth && auth.status === "pending" && now() >= auth.expires) status = AUTH_TEXT.expired;
        if (auth && auth.diagnostic) status += auth.diagnostic;
        panel("LobbyAuthStatus").text = status;
        panel("LobbyAuthCode").text = uri ? auth.user_code : "";
        panel("LobbyAuthOpen").enabled = !!uri;
    }
    function connectAddress(value) {
        if (typeof value !== "string" || value.length > 21) return "";
        var parts = /^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3}):([0-9]{4,5})$/.exec(value);
        if (!parts) return "";
        var octets = [];
        for (var i = 1; i <= 4; i++) {
            var octet = Number(parts[i]);
            if (octet > 255 || String(octet) !== parts[i]) return "";
            octets.push(String(octet));
        }
        var port = Number(parts[5]);
        if (port < 1024 || port > 65535 || String(port) !== parts[5]) return "";
        var canonical = octets.join(".") + ":" + String(port);
        return canonical === value ? canonical : "";
    }
    function receiveConnect(raw) {
        if (!current()) return;
        // A full idle pool is irrelevant to an already allocated room. The
        // native client VM independently checks its pinned endpoint/build.
        if (!state || !state.authenticated || !inRoom() || now() - lastReply >= 16
            || (state.phase !== "started" && state.phase !== "running")
            || !raw || typeof raw !== "object" || Object.keys(raw).length !== 3
            || !Object.prototype.hasOwnProperty.call(raw, "address")
            || !Object.prototype.hasOwnProperty.call(raw, "match_id")
            || !Object.prototype.hasOwnProperty.call(raw, "build_sha256")) return;
        var address = connectAddress(raw.address);
        var match = raw.match_id, build = raw.build_sha256;
        if (!address || typeof match !== "string" || match.length < 8 || match.length > 128
            || /[^A-Za-z0-9_-]/.test(match) || typeof build !== "string"
            || build.length !== 64 || /[^a-f0-9]/.test(build)
            || dispatchedMatches[match] || dispatchedCount >= 128
            || typeof GameEvents.SendEventClientSide !== "function") return;
        // Latch before dispatch, including a native error, to prevent a loop.
        dispatchedMatches[match] = true;
        dispatchedCount++;
        try {
            GameEvents.SendEventClientSide("survival_lobby_connect_local", {
                address: address, match_id: match, build_sha256: build
            });
        } catch (ignore) {}
    }
    function label(parent, value, className) {
        var item = $.CreatePanel("Label", parent, "");
        item.AddClass(className);
        item.html = false;
        item.text = value;
        return item;
    }
    function renderPlayers() {
        var list = panel("LobbyPlayers");
        list.RemoveAndDeleteChildren();
        var players = inRoom() ? state.players : [];
        for (var i = 0; i < 4; i++) {
            var row = $.CreatePanel("Panel", list, "");
            row.AddClass("LobbyPlayerRow");
            label(row, String(i + 1), "LobbyPlayerSeat");
            var player = players[i];
            var name = label(row, player ? (text(player.name, 48) || "玩家") : "空位", "LobbyPlayerName");
            if (!player) { name.AddClass("LobbyPlayerEmpty"); continue; }
            label(row, flag(player.is_host) ? "房主" : "", "LobbyPlayerHost");
            var ready = label(row, flag(player.ready) ? "已准备" : "未准备", "LobbyPlayerReady");
            ready.SetHasClass("IsReady", flag(player.ready));
        }
    }
    function renderRooms() {
        var list = panel("LobbyRoomList");
        list.RemoveAndDeleteChildren();
        var rooms = state ? state.rooms : [];
        panel("LobbyRoomsEmpty").visible = !rooms.length;
        panel("LobbyRoomsEmpty").text = available() ? "你还没有房间；可以创建，或凭邀请码加入。" : "收到服务状态后显示自己的房间。";
        for (var i = 0; i < rooms.length; i++) {
            var room = rooms[i], id = roomId(room.id);
            if (!id) continue;
            var row = $.CreatePanel("Panel", list, "");
            row.AddClass("LobbyRoomRow");
            var count = Math.max(0, Math.min(4, revision(room.count)));
            label(row, text(room.name, 64) || ("房间 " + id), "LobbyRoomName");
            label(row, String(count) + " / 4", "LobbyRoomCount");
            row.hittest = false;
        }
    }
    function render() {
        if (!current()) return;
        var live = available();
        var title = "正在查询大厅服务…";
        var detail = "收到服务端状态后才可操作。";
        if (!live && (state || now() > 5)) {
            title = "大厅服务暂不可用";
            detail = "请稍后刷新；当前无法开始或连接正式局。";
        } else if (live && !state.authenticated) {
            title = "等待本次登录授权";
            detail = "请先完成网页登录授权，再创建或加入房间。";
        } else if (live && state.phase === "interrupted") {
            title = "本局已中断";
            detail = "服务器连接已失效；请房主关闭房间后重新创建。";
        } else if (live && state.phase === "closed") {
            title = "房间已关闭";
            detail = "可以创建新房间，或凭新的邀请码加入。";
        } else if (live && !state.worker_available) {
            title = "暂无可用服务器";
            detail = "可以查看房间；服务器就绪前无法开始本局。";
        } else if (live && busy()) {
            title = /^(starting|allocated)$/.test(state.phase) ? "正在分配服务器" : "服务器已分配";
            detail = "连接由游戏处理；未连接成功前请留在当前页面。";
        } else if (live) {
            title = "大厅服务可用";
            detail = inRoom() ? "等待所有玩家准备，由房主开始本局。" : "创建或加入一个房间。";
        }
        if (localNotice || (state && state.error)) detail = localNotice || state.error;
        panel("LobbyStatusTitle").text = title;
        panel("LobbyStatusDetail").text = detail;
        panel("LobbyStatusStrip").SetHasClass("Unavailable", !live || !!(state && !state.worker_available));
        panel("LobbyRoomNumber").text = inRoom() ? state.room_id : "尚未加入";
        panel("LobbyRoomHint").text = inRoom() ? "4 人房间 · 所有玩家准备后开始" : "先加入一个房间，再准备开始。";
        panel("LobbyReadyText").text = state && state.self_ready ? "取消准备" : "准备";
        panel("LobbyInviteBar").visible = !!(live && inRoom() && openRoom() && state.self_is_host);
        panel("LobbyInviteCode").text = invite && now() < invite.expires ? invite.code : "获取邀请码后发送给一位队友";
        ["Create", "Join", "Invite", "Leave", "Ready", "Start", "Reconnect"].forEach(function (name) {
            panel("Lobby" + name).enabled = permitted(name.toLowerCase());
        });
        panel("LobbyReconnect").SetHasClass("ReconnectAvailable", !!(live && inRoom() && /^(started|running|in_game|connecting)$/.test(state.phase)));
        panel("LobbyActionHint").text = !live ? "大厅尚不可用。" : state.phase === "interrupted" ? "本局已中断，请房主关闭房间。" : !inRoom() ? "创建房间，或凭邀请码加入。" : !state.worker_available ? "暂无服务器，不能开始。" : busy() ? "正在交接连接，请等待游戏结果。" : !everyoneReady() ? "请等待所有玩家准备。" : !state.self_is_host ? "等待房主开始本局。" : "所有玩家已准备，可以开始。";
        renderAuth();
        renderPlayers();
        renderRooms();
    }
    function mount() {
        // Layout creation can lag the script include. Never reveal partial XML.
        if (!lobbyMap() || !layoutReady()) return;
        mounted = true;
        var epoch = ++generation;
        ["Create", "Invite", "Leave", "Ready", "Start", "Reconnect", "Refresh"].forEach(function (name) {
            panel("Lobby" + name).SetPanelEvent("onactivate", guarded(epoch, function () { request(name.toLowerCase()); }));
        });
        panel("LobbyJoin").SetPanelEvent("onactivate", guarded(epoch, function () { request("join", panel("LobbyInviteInput").text); }));
        panel("LobbyAuthOpen").SetPanelEvent("onactivate", guarded(epoch, function () {
            var uri = authUri();
            if (uri) $.DispatchEvent("ExternalBrowserGoToURL", uri);
        }));
        subscriptions.push(GameEvents.Subscribe("survival_lobby_connect", guarded(epoch, receiveConnect)));
        subscriptions.push(GameEvents.Subscribe("survival_lobby_state", guarded(epoch, receive)));
        subscriptions.push(GameEvents.Subscribe("survival_player_web_auth_state", guarded(epoch, receiveAuth)));
        render();
        if (current()) contentVisible(true);
    }
    function tick() {
        try {
            if (root.IsValid && !root.IsValid()) { deactivate(); return; }
            if (!lobbyMap() || !layoutReady()) deactivate();
            else {
                if (!mounted) mount();
                if (current()) {
                    if (now() >= nextRefresh) { nextRefresh = now() + 5; request("refresh"); }
                    if (++renderTicks >= 10) { renderTicks = 0; render(); }
                }
            }
        } catch (ignore) { deactivate(); }
        // The map guard uses scheduled callbacks, even when Game.Time is paused.
        $.Schedule(0.1, tick);
    }
    contentVisible(false);
    tick();
})();
