(function () {
    "use strict";
    var config = GameUI.CustomUIConfig();
    var context = $.GetContextPanel();
    var previous = config.SurvivalHeroSkillUpgrade;
    if (previous && previous.Shutdown) previous.Shutdown();
    var stopped = false;
    var bindings = [];
    var buttons = [];
    var host = null;
    var selected = function () { return -1; };
    var pending = null;
    var lastButton = null;
    var sequence = 0;
    var playerKey = "player_" + Game.GetLocalPlayerID();

    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function active() { return !stopped && valid(context); }
    function rows(value) {
        if (!value) return [];
        return Object.keys(value).map(function (key) { return value[key]; });
    }
    function state() { return CustomNetTables.GetTableValue("survival_hero_skills", playerKey) || {}; }
    function skillFor(data, name) {
        return rows(data.skills).filter(function (item) { return item.ability_name === name; })[0];
    }
    function eligible(data, item) {
        return Number(data.hero_ready) === 1 && Number(data.unit_entindex) >= 0
            && Number(selected()) === Number(data.unit_entindex)
            && Number(data.skill_points) > 0 && item && Number(item.can_upgrade) === 1
            && Number(item.locked || 0) === 0 && Number(item.level) > 0
            && Number(item.level) < Number(item.max_level);
    }
    function hideButtons() {
        buttons.forEach(function (button) {
            if (!valid(button)) return;
            button.style.visibility = "collapse";
            button.hittest = false;
            button.__upgradeBinding = null;
        });
    }
    function hide() { bindings = []; hideButtons(); }
    function showError(error) {
        var messages = {
            skill_points_insufficient: "技能点不足",
            skill_already_max: "技能已满级",
            skill_level_changed: "技能等级已更新，请重新选择",
            combat_hero_changed: "英雄已变化，请重新选择",
            skill_locked: "该技能尚未解锁"
        };
        var anchor = lastButton;
        if (!valid(anchor)) return;
        $.DispatchEvent("DOTAShowTextTooltip", anchor, messages[error] || "技能升级失败，请稍后重试");
        $.Schedule(2, function () {
            if (active() && valid(anchor)) $.DispatchEvent("DOTAHideTextTooltip", anchor);
        });
    }
    function ensureButton(index) {
        var button = buttons[index];
        if (valid(button) && button.GetParent() === host) return button;
        if (valid(button)) button.DeleteAsync(0);
        button = $.CreatePanel("Button", host, "SurvivalHeroSkillUpgrade" + index);
        button.AddClass("SurvivalHeroSkillUpgrade");
        button.hittestchildren = false;
        var label = $.CreatePanel("Label", button, "");
        label.text = "+";
        label.hittest = false;
        button.SetPanelEvent("onactivate", function () {
            var binding = button.__upgradeBinding;
            if (!active() || pending || !binding) return;
            var data = state();
            var item = skillFor(data, binding.abilityName);
            if (!eligible(data, item)) { render(); return; }
            var request = {
                request_id: "skill_" + Date.now() + "_" + (++sequence),
                skill_id: item.skill_id,
                unit_entindex: Number(data.unit_entindex),
                expected_level: Number(item.level)
            };
            lastButton = button;
            pending = request;
            render();
            GameEvents.SendCustomGameEventToServer("ui_hero_skill_upgrade_request", request);
            // A lost response may be retried; expected_level prevents charging
            // twice if the first request reached the server successfully.
            $.Schedule(5, function () {
                if (!active() || pending !== request) return;
                pending = null;
                render();
            });
        });
        button.SetPanelEvent("onmouseover", function () {
            var binding = button.__upgradeBinding;
            var data = state();
            var item = binding && skillFor(data, binding.abilityName);
            if (item) $.DispatchEvent("DOTAShowTextTooltip", button,
                "升级 " + item.display_name + "（消耗 1 技能点，剩余 " + data.skill_points + "）");
        });
        button.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip", button); });
        buttons[index] = button;
        return button;
    }
    function render() {
        if (!active()) return;
        var data = state();
        if (pending) {
            var pendingSkill = rows(data.skills).filter(function (item) {
                return item.skill_id === pending.skill_id;
            })[0];
            if (Number(data.unit_entindex) !== pending.unit_entindex
                || (pendingSkill && Number(pendingSkill.level) !== pending.expected_level)) pending = null;
        }
        var used = [];
        if (valid(host)) bindings.forEach(function (binding, index) {
            var item = skillFor(data, binding.abilityName);
            if (!eligible(data, item) || !isFinite(binding.x) || !isFinite(binding.y)
                || !(binding.width > 0) || !(binding.height > 0)) return;
            var button = ensureButton(index);
            var height = Math.max(18, Math.min(24, binding.height * 0.4));
            var width = Math.min(binding.width, 48);
            button.__upgradeBinding = binding;
            button.style.position = (binding.x + (binding.width - width) / 2) + "px "
                + (binding.y - height - 2) + "px 0px";
            button.style.width = width + "px";
            button.style.height = height + "px";
            button.style.visibility = "visible";
            button.hittest = !pending;
            button.enabled = !pending;
            button.SetHasClass("Pending", !!pending);
            used.push(button);
        });
        buttons.forEach(function (button) {
            if (!valid(button) || used.indexOf(button) >= 0) return;
            button.style.visibility = "collapse";
            button.hittest = false;
            button.__upgradeBinding = null;
        });
    }
    config.SurvivalHeroSkillUpgrade = {
        Update: function (layer, entries, selectedUnit) {
            if (!active()) return;
            host = layer;
            bindings = entries || [];
            selected = selectedUnit;
            render();
        },
        Hide: hide,
        Shutdown: function () {
            hide();
            stopped = true;
            buttons.forEach(function (button) { if (valid(button)) button.DeleteAsync(0); });
            buttons = [];
        }
    };
    CustomNetTables.SubscribeNetTableListener("survival_hero_skills", function (_, key) {
        if (key === playerKey) render();
    });
    GameEvents.Subscribe("ui_hero_skill_upgrade_result", function (result) {
        if (!active() || !pending || !result || result.request_id !== pending.request_id) return;
        // Success can precede its NetTable snapshot. Keep the button locked
        // until the authoritative level arrives, rather than offering it twice.
        if (!result.ok) { pending = null; showError(result.error); }
        render();
    });
})();
