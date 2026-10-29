(function () {
    "use strict";
    var id = Game.GetLocalPlayerID(), data = {}, aiming = "";
    var cfg = GameUI.CustomUIConfig(), disposed = false, subscriptions = [];
    var shieldTask = null, refreshTask = null, shieldKey = "", initialShieldRead = false;
    var counters = {refreshes:0, events:0, coalesced:0, textWrites:0, visibleWrites:0, initialReads:0};
    var previous = cfg.SurvivalCommerceActions;
    if (previous && previous.Dispose) previous.Dispose();
    var root = $.CreatePanel("Panel", $.GetContextPanel(), "CommerceActions");
    root.style.horizontalAlign = "right"; root.style.verticalAlign = "center";
    root.style.flowChildren = "down"; root.style.marginRight = "12px";
    root.style.backgroundColor = "#142431ee"; root.style.padding = "8px";
    var title = $.CreatePanel("Label", root, "");
    title.style.color = "#edc977";
    var hint = $.CreatePanel("Label", root, ""); hint.style.color = "#d8e1e8";
    var shield = $.CreatePanel("Label", root, ""), shieldState = {};
    shield.style.color = "#78d9ed";
    var api = {
        Inspect:function(){return {active:active(), barrier:Number(data.barrier) === 1,
            countdownPending:!!shieldTask, refreshPending:!!refreshTask,
            initialRead:initialShieldRead, wallKey:shieldKey, counters:counters};},
        Dispose:function(){
            if (disposed) return;
            disposed = true;
            cancelTask(shieldTask); cancelTask(refreshTask);
            shieldTask = null; refreshTask = null;
            subscriptions.forEach(function(token){
                if (CustomNetTables.UnsubscribeNetTableListener) {
                    try { CustomNetTables.UnsubscribeNetTableListener(token); } catch (error) {}
                }
            });
            subscriptions = [];
            if (cfg.SurvivalCommerceAim === aimHandler) cfg.SurvivalCommerceAim = null;
            if (cfg.SurvivalCommerceBlink === blinkHandler) cfg.SurvivalCommerceBlink = null;
            if (root.IsValid && !root.IsValid()) return;
            root.visible = false;
            if (root.DeleteAsync) root.DeleteAsync(0);
        }
    };
    cfg.SurvivalCommerceActions = api;
    function active() {
        if (disposed || cfg.SurvivalCommerceActions !== api) return false;
        try { return !root.IsValid || root.IsValid(); } catch (error) { return false; }
    }
    function cancelTask(task) {
        if (!task || task.cancelled) return;
        task.cancelled = true;
        if (task.handle !== undefined && $.CancelScheduled) {
            try { $.CancelScheduled(task.handle); } catch (error) {}
        }
    }
    function scheduleTask(delay, callback) {
        var task = {cancelled:false};
        task.handle = $.Schedule(delay, function(){
            if (!task.cancelled && active()) callback();
        });
        return task;
    }
    function subscribe(name, callback) {
        subscriptions.push(CustomNetTables.SubscribeNetTableListener(name, function(){
            if (active()) return callback.apply(null, arguments);
        }));
    }
    function readInitialShield() {
        initialShieldRead = true; counters.initialReads++;
        shieldState = {}; shieldKey = "";
        if (!CustomNetTables.GetAllTableValues) return;
        var rows = CustomNetTables.GetAllTableValues("survival_commerce_wall") || [], newest = -Infinity;
        var values = Array.isArray(rows) ? rows : Object.keys(rows).map(function(key){return {key:key,value:rows[key]};});
        values.forEach(function(entry){
            var value = entry && (entry.value || entry), key = entry && entry.key;
            if (!value || Number(value.player_id) !== id) return;
            if (key !== undefined && typeof Entities !== "undefined" && Entities.IsValidEntity
                && !Entities.IsValidEntity(Number(key))) return;
            var deadline = Math.max(Number(value.ready_at) || 0, Number(value.expires) || 0);
            if (deadline < newest) return;
            newest = deadline; shieldState = value; shieldKey = key === undefined ? "" : String(key);
        });
    }
    function shieldTick() {
        if (!active()) return;
        counters.refreshes++;
        var shown = Number(data.barrier) === 1;
        if (shield.visible !== shown) { shield.visible = shown; counters.visibleWrites++; }
        var now = Game.GetGameTime(), remaining = Math.max(0, Number(shieldState.ready_at || 0) - now);
        var protectedNow = Number(shieldState.expires || 0) > now && Number(shieldState.remaining || 0) > 0;
        if (shown) {
            var text = protectedNow
                ? "次元护盾：" + Math.ceil(shieldState.remaining) + "（" + Math.ceil(shieldState.expires - now) + "秒）"
                : remaining > 0 ? "次元护盾冷却：" + Math.ceil(remaining) + "秒" : "次元护盾：已就绪";
            if (shield.text !== text) { shield.text = text; counters.textWrites++; }
        }
        if (shown && (protectedNow || remaining > 0)) {
            if (!shieldTask) shieldTask = scheduleTask(0.25, function(){shieldTask = null; shieldTick();});
        } else {
            cancelTask(shieldTask); shieldTask = null;
        }
    }
    function queueShieldRefresh() {
        if (!active()) return;
        if (refreshTask) { counters.coalesced++; return; }
        cancelTask(shieldTask); shieldTask = null;
        refreshTask = scheduleTask(0, function(){refreshTask = null; shieldTick();});
    }
    subscribe("survival_commerce_wall", function (_, key, value) {
        if (value && Number(value.player_id) === id) {
            counters.events++; shieldState = value; shieldKey = String(key);
            if (Number(data.barrier) === 1) queueShieldRefresh();
        } else if (!value && String(key) === shieldKey) {
            counters.events++; shieldState = {}; shieldKey = "";
            queueShieldRefresh();
        }
    });
    var buttons = {};
    function send(action, point) {
        if (!active()) return;
        GameEvents.SendCustomGameEventToServer("survival_commerce_action", {
            action: action, x: point ? point[0] : 0, y: point ? point[1] : 0
        });
    }
    function act(action) {
        if (!active()) return;
        if (action === "blink" || action === "ultimate") {
            aiming = action; hint.text = "点击地面施放，右键取消";
        } else send(action);
    }
    [["blink", "D · 侏儒瞬移"], ["copper", "铜斧：传送到资源树（一次）"],
        ["bomb", "油锯：清除附近普通怪（一次）"], ["ultimate", "凌霄塔纹：建造终极塔"],
        ["immortal", "仙人：融合附近超级伐木工"]].forEach(function (row) {
        var button = $.CreatePanel("Button", root, "");
        button.style.padding = "6px"; button.style.marginTop = "3px";
        button.style.backgroundColor = "#365162";
        var label = $.CreatePanel("Label", button, ""); label.text = row[1]; label.style.color = "white";
        button.SetPanelEvent("onactivate", function () { act(row[0]); }); buttons[row[0]] = button;
    });
    function render(value) {
        if (!active()) return;
        var hadBarrier = Number(data.barrier) === 1;
        data = value || {}; var visible = !!data.title || Number(data.barrier) === 1;
        title.text = data.title || "商城技能";
        Object.keys(buttons).forEach(function (key) { buttons[key].visible = Number(data[key]) === 1; visible = visible || buttons[key].visible; });
        root.visible = visible;
        if (!hadBarrier && Number(data.barrier) === 1) readInitialShield();
        if (hadBarrier || Number(data.barrier) === 1 || shield.visible !== false) queueShieldRefresh();
    }
    subscribe("survival_commerce_actions", function (_, key, value) {
        if (key === "player_" + id) render(value);
    });
    render(CustomNetTables.GetTableValue("survival_commerce_actions", "player_" + id));
    // Use the shared input dispatcher; do not replace the game's mouse callback.
    var aimHandler = function (eventName, button) {
        if (!active() || !aiming || eventName !== "pressed") return false;
        if (button === 1) { aiming = ""; hint.text = ""; return true; }
        if (button !== 0) return false;
        var point = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
        if (point) { var action = aiming; aiming = ""; hint.text = ""; send(action, point); }
        return true;
    };
    var blinkHandler = function () {
        if (!active() || Number(data.blink) !== 1) return false;
        var point = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
        if (point) send("blink", point);
        return true;
    };
    cfg.SurvivalCommerceAim = aimHandler;
    cfg.SurvivalCommerceBlink = blinkHandler;
    // Explicit Tools console bridge: no UI refresh, request or timer is started.
    function registerReadOnlyIdleInspect() {
        try {
            if (typeof Game.IsInToolsMode !== "function" || !Game.IsInToolsMode()
                || typeof Game.AddCommand !== "function") return;
            var config = GameUI.CustomUIConfig();
            var serial = Number(config.SurvivalCommerceIdleInspectSerial || 0);
            serial = isFinite(serial) && serial >= 0 ? Math.floor(serial) + 1 : 1;
            config.SurvivalCommerceIdleInspectSerial = serial;
            var command = "survival_commerce_idle_inspect_" + Date.now() + "_" + serial;
            var result = Game.AddCommand(command, function(){
                var args = Array.prototype.slice.call(arguments);
                var nonce = args.length ? args[args.length - 1] : null;
                var response = {api:"SurvivalCommerceActions.Inspect",command:command,readonly:true};
                if ((args.length !== 1 && !(args.length === 2 && args[0] === command))
                    || typeof nonce !== "string" || !/^[0-9a-f]{32}$/i.test(nonce)) {
                    response.status = "invalid_nonce";
                    $.Msg("[IDLE_COMMERCE_INSPECT] " + JSON.stringify(response));
                    return;
                }
                response.nonce = nonce;
                var current = GameUI.CustomUIConfig().SurvivalCommerceActions;
                if (!active() || current !== api) {
                    response.status = "inactive_context";
                    $.Msg("[IDLE_COMMERCE_INSPECT] " + JSON.stringify(response));
                    return;
                }
                try {
                    if (!current || typeof current.Inspect !== "function") throw new Error("inspect_unavailable");
                    var state = current.Inspect() || {};
                    response.status = "ok";
                    ["active", "barrier", "countdownPending", "refreshPending", "initialRead"].forEach(function(key){response[key] = typeof state[key] === "boolean" ? state[key] : null;});
                    [].forEach(function(key){
                        var value = state[key];
                        response[key] = typeof value === "number" && isFinite(value) ? value : null;
                    });
                    response.counters = {};
                    ["refreshes", "events", "coalesced", "textWrites", "visibleWrites", "initialReads"].forEach(function(key){
                        var value = state.counters && state.counters[key];
                        response.counters[key] = typeof value === "number" && isFinite(value) ? value : null;
                    });
                } catch (error) { response.status = "inspect_failed"; }
                $.Msg("[IDLE_COMMERCE_INSPECT] " + JSON.stringify(response));
            }, "Tools read-only idle UI counters; requires one 32 hex nonce", 0);
            if (result === false) {
                $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalCommerceActions.Inspect",status:"registration_failed",readonly:true}));
                return;
            }
            api.InspectCommand = command;
            $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalCommerceActions.Inspect",command:command,nonce:"32hex",readonly:true}));
        } catch (error) {
            $.Msg("[IDLE_UI_COMMAND] " + JSON.stringify({api:"SurvivalCommerceActions.Inspect",status:"registration_failed",readonly:true}));
        }
    }
    registerReadOnlyIdleInspect();
}());
