(function () {
    "use strict";
    var playerId = Game.GetLocalPlayerID();
    var current = {};

    function panel(id) { return $("#" + id); }
    function rows(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }
    function label(parent, className, text) {
        var result = $.CreatePanel("Label", parent, "");
        result.AddClass(className);
        result.text = String(text || "");
        return result;
    }

    function choose(cardId) {
        if (!current.token) return;
        Game.EmitSound("ui_generic_button_click");
        GameEvents.SendCustomGameEventToServer("ui_rogue_reward_select", {
            token: current.token,
            card_id: cardId
        });
    }

    function createCard(parent, card, index) {
        var button = $.CreatePanel("Button", parent, "");
        button.AddClass("RogueRewardCard");
        button.AddClass("RogueRewardCard" + String(index + 1));
        var art = $.CreatePanel("DOTAAbilityImage", button, "");
        art.AddClass("RogueRewardArt");
        art.abilityname = card.icon_name || "attribute_bonus";
        var body = $.CreatePanel("Panel", button, "");
        body.AddClass("RogueRewardBody");
        label(body, "RogueRewardCardName", card.display_name || card.card_id);
        label(body, "RogueRewardDescription", card.description || "");
        var footer = $.CreatePanel("Panel", button, "");
        footer.AddClass("RogueRewardFooter");
        label(footer, "RogueRewardPickText", "领取");
        button.SetPanelEvent("onactivate", function () { choose(card.card_id); });
        button.SetPanelEvent("onmouseover", function () {
            Game.EmitSound("ui_rollover_micro");
        });
    }

    function render(value) {
        current = value || {};
        var active = Number(current.active || 0) === 1;
        panel("RogueRewardBackdrop").SetHasClass("RogueRewardHidden", !active);
        var list = panel("RogueRewardCards");
        list.RemoveAndDeleteChildren();
        if (!active) return;
        rows(current.cards).forEach(function (card, index) {
            createCard(list, card, index);
        });
        var remaining = Number(current.rerolls_remaining || 0);
        var reroll = panel("RogueRewardReroll");
        reroll.enabled = remaining > 0;
        reroll.SetHasClass("Disabled", remaining <= 0);
        panel("RogueRewardRerollText").text = remaining > 0
            ? "免费重抽  " + String(remaining) : "本次已重抽";
    }

    panel("RogueRewardReroll").SetPanelEvent("onactivate", function () {
        if (!current.token || Number(current.rerolls_remaining || 0) <= 0) return;
        Game.EmitSound("ui_generic_button_click");
        GameEvents.SendCustomGameEventToServer("ui_rogue_reward_reroll", {
            token: current.token
        });
    });
    CustomNetTables.SubscribeNetTableListener("survival_rogue_reward", function (_, key, value) {
        if (String(key) === String(playerId)) render(value);
    });
    render(CustomNetTables.GetTableValue("survival_rogue_reward", String(playerId)) || {});
})();