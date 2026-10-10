(function () {
    "use strict";
    var config = GameUI.CustomUIConfig();
    if (config.SurvivalHeroSkillChoice && config.SurvivalHeroSkillChoice.Dispose) config.SurvivalHeroSkillChoice.Dispose();
    var playerId = Game.GetLocalPlayerID();
    var key = "player_" + playerId;
    var currentChoice = {}, choiceToken = "", dismissed = false, opened = false, disposed = false;
    var subscriptions = [], tableSubscription;
    var resume = $.CreatePanel("Button", panel("HeroSkillChoiceBackdrop").GetParent(), "HeroSkillChoiceResume");
    resume.hittest = true; resume.hittestchildren = false;
    resume.style.width = "200px"; resume.style.height = "44px"; resume.style.horizontalAlign = "right"; resume.style.verticalAlign = "center";
    resume.style.marginRight = "28px"; resume.style.marginTop = "20px"; resume.style.backgroundColor = "#23414d"; resume.style.border = "1px solid #b59d69";
    var resumeText = addLabel(resume, "", "继续选择技能");
    resumeText.hittest = false; resumeText.style.horizontalAlign = "center"; resumeText.style.verticalAlign = "center";
    resumeText.style.fontSize = "20px"; resumeText.style.color = "#eee0b7";
    resume.SetPanelEvent("onactivate", open);

    function panel(id) { return $("#" + id); }
    function valid(p) { return p && (!p.IsValid || p.IsValid()); }
    function rows(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (index) { return value[index]; });
    }
    function clear(parent) { if (parent) parent.RemoveAndDeleteChildren(); }
    function pending() { return !disposed && Number(currentChoice.pending || 0) === 1; }
    function show() {
        var backdrop = panel("HeroSkillChoiceBackdrop");
        if (valid(backdrop)) {
            backdrop.SetHasClass("Hidden", !opened); backdrop.visible = opened;
            backdrop.hittest = opened; backdrop.hittestchildren = opened;
        }
        if (valid(resume)) resume.visible = pending() && dismissed;
    }
    function close() {
        if (disposed) return;
        dismissed = pending(); opened = false; show();
        if (config.SurvivalUILayers) config.SurvivalUILayers.Close("hero_skill_choice");
    }
    function open() {
        if (!pending() || opened) return;
        dismissed = false; opened = true; show();
        if (config.SurvivalUILayers) config.SurvivalUILayers.Open("hero_skill_choice", panel("HeroSkillChoiceBackdrop"), close);
    }
    function addLabel(parent, className, text) {
        var item = $.CreatePanel("Label", parent, "");
        if (className) item.AddClass(className);
        item.text = String(text || "");
        return item;
    }
    function chance(value) { return String(Math.round(Number(value || 0) * 1000) / 10) + "%"; }
    function coefficient(value) { return Number(value || 0).toFixed(2); }
    function createCandidate(parent, item) {
        var button = $.CreatePanel("Button", parent, "");
        button.AddClass("HeroSkillChoiceCard");
        addLabel(button, "HeroSkillChoiceName", item.display_name || item.skill_id);
        addLabel(button, "HeroSkillPassiveBadge", "被动技能 · 主攻击概率触发");
        var owned = Number(item.current_level || 0) > 0;
        addLabel(button, "HeroSkillChoiceLevel", "当前：" + (owned ? "LV" + item.current_level : "未获得")
            + "　选择后：LV" + item.next_level);
        addLabel(button, "HeroSkillStat", "触发概率：" + (owned
            ? chance(item.current_trigger_chance) + " → " : "") + chance(item.trigger_chance));
        addLabel(button, "HeroSkillStat", "伤害系数：三围×" + (owned
            ? coefficient(item.current_damage_multiplier) + " → 三围×" : "") + coefficient(item.damage_multiplier));
        addLabel(button, owned ? "HeroSkillNextEffect" : "HeroSkillEffect",
            (owned ? "升级强化：" : "效果：") + (item.effect || ""));
        button.SetPanelEvent("onactivate", function () {
            if (!opened || !pending()) return;
            GameEvents.SendCustomGameEventToServer("ui_hero_skill_choice_select", {
                choice_token: currentChoice.choice_token,
                skill_id: item.skill_id
            });
        });
    }

    function renderChoice(choice) {
        if (disposed) return;
        currentChoice = choice || {};
        var nextToken = pending() ? String(currentChoice.choice_token || "") : "";
        if (nextToken !== choiceToken) dismissed = false;
        choiceToken = nextToken;
        var shouldShow = pending() && !dismissed;
        if (shouldShow && !opened) open();
        else if (!shouldShow) { opened = false; if (config.SurvivalUILayers) config.SurvivalUILayers.Close("hero_skill_choice"); }
        show();
        var list = panel("HeroSkillChoiceList");
        clear(list);
        if (pending()) rows(currentChoice.candidates).forEach(function (item) { createCandidate(list, item); });
        if (pending() && Number(currentChoice.rerolls || 0) > 0) {
            var reroll = $.CreatePanel("Button", list, "");
            reroll.AddClass("HeroSkillChoiceCard");
            addLabel(reroll, "HeroSkillChoiceName", "焕天印：重抽（剩余 " + currentChoice.rerolls + " 次）");
            reroll.SetPanelEvent("onactivate", function () {
                if (!opened || !pending()) return;
                GameEvents.SendCustomGameEventToServer("ui_hero_skill_choice_select", {choice_token: currentChoice.choice_token, reroll: 1});
            });
        }
    }
    function showResult(payload) {
        if (disposed) return;
        panel("HeroSkillChoiceResult").text = payload && payload.ok
            ? "操作成功" : "操作失败：" + String(payload && payload.error || "unknown");
    }

    subscriptions.push(GameEvents.Subscribe("ui_hero_skill_choice", renderChoice));
    subscriptions.push(GameEvents.Subscribe("ui_hero_skill_choice_result", showResult));
    tableSubscription = CustomNetTables.SubscribeNetTableListener("survival_hero_skill_choice", function (_, changedKey, data) {
        if (changedKey === key) renderChoice(data);
    });
    config.SurvivalHeroSkillChoice = { Open: open, Close: close, IsOpen: function () { return !disposed && opened; }, Dispose: function () {
        disposed = true; opened = false; show(); if (valid(resume)) resume.DeleteAsync(0);
        subscriptions.forEach(function (id) { if (GameEvents.Unsubscribe) GameEvents.Unsubscribe(id); });
        if (CustomNetTables.UnsubscribeNetTableListener) CustomNetTables.UnsubscribeNetTableListener(tableSubscription);
        if (config.SurvivalUILayers) config.SurvivalUILayers.Close("hero_skill_choice");
    }};
    renderChoice(CustomNetTables.GetTableValue("survival_hero_skill_choice", key) || {});
})();
