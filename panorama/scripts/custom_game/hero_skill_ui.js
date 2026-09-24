(function () {
    "use strict";
    var playerId = Game.GetLocalPlayerID();
    var key = "player_" + playerId;
    var currentChoice = {};

    function panel(id) { return $("#" + id); }
    function rows(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (index) { return value[index]; });
    }
    function clear(parent) { if (parent) parent.RemoveAndDeleteChildren(); }
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
            GameEvents.SendCustomGameEventToServer("ui_hero_skill_choice_select", {
                choice_token: currentChoice.choice_token,
                skill_id: item.skill_id
            });
        });
    }

    function renderChoice(choice) {
        currentChoice = choice || {};
        var pending = Number(currentChoice.pending || 0) === 1;
        panel("HeroSkillChoiceBackdrop").SetHasClass("Hidden", !pending);
        var list = panel("HeroSkillChoiceList");
        clear(list);
        if (pending) rows(currentChoice.candidates).forEach(function (item) { createCandidate(list, item); });
    }
    function showResult(payload) {
        panel("HeroSkillChoiceResult").text = payload && payload.ok
            ? "操作成功" : "操作失败：" + String(payload && payload.error || "unknown");
    }

    GameEvents.Subscribe("ui_hero_skill_choice", renderChoice);
    GameEvents.Subscribe("ui_hero_skill_choice_result", showResult);
    CustomNetTables.SubscribeNetTableListener("survival_hero_skill_choice", function (_, changedKey, data) {
        if (changedKey === key) renderChoice(data);
    });
    renderChoice(CustomNetTables.GetTableValue("survival_hero_skill_choice", key) || {});
})();