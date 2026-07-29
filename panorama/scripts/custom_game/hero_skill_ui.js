(function () {
    "use strict";
    var playerId = Game.GetLocalPlayerID();
    var key = "player_" + playerId;
    var currentState = {};
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
    function transition(item, field, formatter) {
        var current = formatter(item[field]);
        return Number(item.is_max_level || 0) === 1
            ? current : current + " → " + formatter(item["next_" + field]);
    }

    function hideSkillTooltip() {
        var tooltip = panel("HeroSkillTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function showSkillTooltip(source, item) {
        var tooltip = panel("HeroSkillTooltip");
        var levels = panel("HeroSkillTooltipLevels");
        if (!tooltip || !levels || !source || !item) return;
        panel("HeroSkillTooltipIcon").abilityname = item.icon_name || "attribute_bonus";
        panel("HeroSkillTooltipTitle").text = item.display_name || item.skill_id;
        panel("HeroSkillTooltipLevel").text = "LV" + item.level + " / LV" + item.max_level;
        panel("HeroSkillTooltipDescription").text = item.description || "主攻击命中后由服务器判定触发。";
        clear(levels);
        rows(item.level_rows).forEach(function (levelRow) {
            var level = Number(levelRow.level || 0);
            var row = $.CreatePanel("Panel", levels, "");
            row.AddClass("HeroSkillTooltipLevelRow");
            row.SetHasClass("Learned", level < Number(item.level || 0));
            row.SetHasClass("Current", level === Number(item.level || 0));
            row.SetHasClass("Next", level === Number(item.level || 0) + 1);
            addLabel(row, "HeroSkillTooltipLevelLabel", "LV" + level);
            var body = $.CreatePanel("Panel", row, "");
            body.AddClass("HeroSkillTooltipLevelBody");
            addLabel(body, "HeroSkillTooltipNumbers",
                "触发 " + chance(levelRow.trigger_chance)
                    + "　伤害 三围×" + coefficient(levelRow.damage_multiplier));
            addLabel(body, "HeroSkillTooltipEffect", levelRow.effect || "");
        });
        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (tooltip.BHasClass("Hidden")) return;
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner) positioner.PlaceRight(tooltip, source, 430, 300);
        });
    }

    function createOwned(parent, item) {
        if (Number(item.passive || 0) !== 1) return false;
        var card = $.CreatePanel("Panel", parent, "");
        card.AddClass("HeroSkillOwnedCard");
        card.SetPanelEvent("onmouseover", function () {
            showSkillTooltip(card, item);
        });
        card.SetPanelEvent("onmouseout", hideSkillTooltip);
        var header = $.CreatePanel("Panel", card, "");
        header.AddClass("HeroSkillCardHeader");
        var icon = $.CreatePanel("DOTAAbilityImage", header, "");
        icon.AddClass("HeroSkillIcon");
        icon.abilityname = item.icon_name || "attribute_bonus";
        var title = $.CreatePanel("Panel", header, "");
        title.AddClass("HeroSkillCardTitleBlock");
        addLabel(title, "HeroSkillCardTitle", (item.display_name || item.skill_id) + " · LV" + item.level);
        addLabel(title, "HeroSkillPassiveBadge", "隐藏被动 · 服务端触发");
        addLabel(card, "HeroSkillStat", "触发概率：" + transition(item, "trigger_chance", chance));
        addLabel(card, "HeroSkillStat", "三围伤害系数：×" + transition(item, "damage_multiplier", coefficient));
        addLabel(card, "HeroSkillEffect", "当前效果：" + (item.current_effect || "基础被动效果"));
        var maximum = Number(item.is_max_level || 0) === 1;
        addLabel(card, maximum ? "HeroSkillMaxText" : "HeroSkillNextEffect",
            maximum ? "满级" : "下一级新增/强化：" + (item.next_effect || "提高触发概率和伤害"));
        var upgrade = $.CreatePanel("Button", card, "");
        upgrade.AddClass("HeroSkillUpgradeButton");
        var enabled = !maximum && Number(currentState.skill_points || 0) > 0;
        upgrade.enabled = enabled;
        upgrade.SetHasClass("Disabled", !enabled);
        addLabel(upgrade, "", maximum ? "已满级" : "消耗1技能点升级");
        if (enabled) upgrade.SetPanelEvent("onactivate", function () {
            GameEvents.SendCustomGameEventToServer("ui_hero_skill_upgrade_request", { skill_id: item.skill_id });
        });
        return true;
    }

    function renderState(state) {
        currentState = state || {};
        panel("HeroSkillPoints").text = "未分配技能点：" + String(Number(currentState.skill_points || 0));
        var list = panel("HeroSkillOwnedList");
        clear(list);
        var count = 0;
        rows(currentState.skills).forEach(function (item) { if (createOwned(list, item)) count += 1; });
        if (count === 0) addLabel(list, "HeroSkillEmpty", "尚未获得随机被动技能");
    }

    function createCandidate(parent, item) {
        var button = $.CreatePanel("Button", parent, "");
        button.AddClass("HeroSkillChoiceCard");
        addLabel(button, "HeroSkillChoiceName", item.display_name || item.skill_id);
        addLabel(button, "HeroSkillPassiveBadge", "隐藏被动 · 主攻击概率触发");
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
    function toggleManagement() {
        hideSkillTooltip();
        panel("HeroSkillManagementPanel").ToggleClass("Hidden");
        GameEvents.SendCustomGameEventToServer("ui_hero_skill_state_request", {});
    }
    function showResult(payload) {
        panel("HeroSkillChoiceResult").text = payload && payload.ok
            ? "操作成功" : "操作失败：" + String(payload && payload.error || "unknown");
    }

    panel("HeroSkillManageButton").SetPanelEvent("onactivate", toggleManagement);
    panel("HeroSkillManagementClose").SetPanelEvent("onactivate", toggleManagement);
    GameEvents.Subscribe("ui_hero_skill_state", renderState);
    GameEvents.Subscribe("ui_hero_skill_choice", renderChoice);
    GameEvents.Subscribe("ui_hero_skill_choice_result", showResult);
    GameEvents.Subscribe("ui_hero_skill_upgrade_result", showResult);
    renderState(CustomNetTables.GetTableValue("survival_hero_skills", key) || {});
    renderChoice(CustomNetTables.GetTableValue("survival_hero_skill_choice", key) || {});
    GameEvents.SendCustomGameEventToServer("ui_hero_skill_state_request", {});
})();