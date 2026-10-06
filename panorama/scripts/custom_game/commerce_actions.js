(function () {
    "use strict";
    var id = Game.GetLocalPlayerID(), data = {}, aiming = "";
    var root = $.CreatePanel("Panel", $.GetContextPanel(), "CommerceActions");
    root.style.horizontalAlign = "right"; root.style.verticalAlign = "center";
    root.style.flowChildren = "down"; root.style.marginRight = "12px";
    root.style.backgroundColor = "#142431ee"; root.style.padding = "8px";
    var title = $.CreatePanel("Label", root, "");
    title.style.color = "#edc977";
    var hint = $.CreatePanel("Label", root, ""); hint.style.color = "#d8e1e8";
    var shield = $.CreatePanel("Label", root, ""), shieldState = {};
    shield.style.color = "#78d9ed";
    function shieldTick() {
        shield.visible = Number(data.barrier) === 1;
        var now = Game.GetGameTime(), remaining = Math.max(0, Number(shieldState.ready_at || 0) - now);
        shield.text = Number(shieldState.expires || 0) > now && Number(shieldState.remaining || 0) > 0
            ? "次元护盾：" + Math.ceil(shieldState.remaining) + "（" + Math.ceil(shieldState.expires - now) + "秒）"
            : remaining > 0 ? "次元护盾冷却：" + Math.ceil(remaining) + "秒" : "次元护盾：已就绪";
        $.Schedule(0.25, shieldTick);
    }
    CustomNetTables.SubscribeNetTableListener("survival_commerce_wall", function (_, key, value) {
        if (value && Number(value.player_id) === id) shieldState = value;
    });
    var buttons = {};
    function send(action, point) {
        GameEvents.SendCustomGameEventToServer("survival_commerce_action", {
            action: action, x: point ? point[0] : 0, y: point ? point[1] : 0
        });
    }
    function act(action) {
        if (action === "blink" || action === "ultimate") {
            aiming = action; hint.text = "点击地面施放，右键取消";
        } else send(action);
    }
    [["blink", "D · 侏儒瞬移"], ["copper", "铜斧：传送到资源树（一次）"],
        ["bomb", "油锯：清除附近普通怪（一次）"], ["ultimate", "通天塔印：建造终极塔"],
        ["immortal", "仙人：融合附近超级伐木工"]].forEach(function (row) {
        var button = $.CreatePanel("Button", root, "");
        button.style.padding = "6px"; button.style.marginTop = "3px";
        button.style.backgroundColor = "#365162";
        var label = $.CreatePanel("Label", button, ""); label.text = row[1]; label.style.color = "white";
        button.SetPanelEvent("onactivate", function () { act(row[0]); }); buttons[row[0]] = button;
    });
    function render(value) {
        data = value || {}; var visible = !!data.title || Number(data.barrier) === 1;
        title.text = data.title || "商城技能";
        Object.keys(buttons).forEach(function (key) { buttons[key].visible = Number(data[key]) === 1; visible = visible || buttons[key].visible; });
        root.visible = visible;
    }
    CustomNetTables.SubscribeNetTableListener("survival_commerce_actions", function (_, key, value) {
        if (key === "player_" + id) render(value);
    });
    render(CustomNetTables.GetTableValue("survival_commerce_actions", "player_" + id));
    shieldTick();
    // Use the shared input dispatcher; do not replace the game's mouse callback.
    var cfg = GameUI.CustomUIConfig();
    cfg.SurvivalCommerceAim = function (eventName, button) {
        if (!aiming || eventName !== "pressed") return false;
        if (button === 1) { aiming = ""; hint.text = ""; return true; }
        if (button !== 0) return false;
        var point = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
        if (point) { var action = aiming; aiming = ""; hint.text = ""; send(action, point); }
        return true;
    };
    cfg.SurvivalCommerceBlink = function () {
        if (Number(data.blink) !== 1) return false;
        var point = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
        if (point) send("blink", point);
        return true;
    };
}());
