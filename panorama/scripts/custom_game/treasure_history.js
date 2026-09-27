(function () {
    "use strict";
    var CAPACITY = 20;
    var opened = false, history = [];
    function p(id) { return $("#" + id); }
    function layers() { return GameUI.CustomUIConfig().SurvivalUILayers; }
    function hideDetail() {
        p("TreasureTooltip").AddClass("ArchiveHidden");
        p("TreasureDetailHint").RemoveClass("ArchiveHidden");
    }
    function close() {
        opened = false;
        p("TreasureWindow").AddClass("ArchiveHidden");
        p("TreasureScrim").AddClass("ArchiveHidden");
        hideDetail();
        if (layers()) layers().Close("treasure");
    }
    function label(parent, text, style) {
        var node = $.CreatePanel("Label", parent, "");
        node.text = text; node.hittest = false;
        if (style) node.AddClass(style);
        return node;
    }
    function showDetail(reward) {
        if (!opened) return;
        p("TreasureTooltipName").text = reward.name || "宝物";
        p("TreasureTooltipEffect").text = reward.description || "暂无效果说明";
        p("TreasureDetailHint").AddClass("ArchiveHidden");
        p("TreasureTooltip").RemoveClass("ArchiveHidden");
    }
    function render() {
        hideDetail();
        p("TreasureCards").RemoveAndDeleteChildren();
        p("TreasureCount").text = history.length + " / " + CAPACITY;
        for (var i = 0; i < CAPACITY; i++) {
            var card = $.CreatePanel("Panel", p("TreasureCards"), "");
            card.AddClass("TreasureCard"); card.hittestchildren = false;
            var item = history[i];
            label(card, (i + 1 < 10 ? "0" : "") + (i + 1), "TreasureOrder");
            var art = $.CreatePanel("Panel", card, "");
            art.AddClass("TreasureArt"); art.hittest = false;
            if (item && item.icon_name) {
                var iconName = String(item.icon_name);
                var isTexture = iconName.indexOf("/") >= 0;
                var isItem = iconName.indexOf("item_") === 0;
                var icon = $.CreatePanel(isTexture ? "Image" : (isItem ? "DOTAItemImage" : "DOTAAbilityImage"), art, "");
                if (isTexture) icon.SetImage("file://{images}/spellicons/" + iconName + ".png");
                else if (isItem) icon.itemname = iconName;
                else icon.abilityname = iconName;
                icon.AddClass("TreasureIcon"); icon.hittest = false;
            } else {
                label(art, item ? String(item.name || "宝").substring(0, 1) : "◇", "TreasureGlyph");
            }
            label(card, item ? item.name : "尚未获得", "TreasureName");
            if (!item) { card.AddClass("TreasureVacant"); continue; }
            if (i === 0) { card.AddClass("TreasureLatest"); label(card, "最新", "TreasureLatestBadge"); }
            (function (panel, reward) {
                panel.SetPanelEvent("onmouseover", function () { showDetail(reward); });
                panel.SetPanelEvent("onmouseout", hideDetail);
            })(card, item);
        }
    }
    function update(value) {
        var data = value && value.history || {};
        history = Array.isArray(data) ? data.slice(0, CAPACITY)
            : Object.keys(data).sort(function (a, b) { return Number(a) - Number(b); })
                .slice(0, CAPACITY).map(function (key) { return data[key]; });
        if (opened) render();
    }
    CustomNetTables.SubscribeNetTableListener("survival_rogue_reward", function (table, key, value) {
        if (String(key) === String(Game.GetLocalPlayerID())) update(value);
    });
    GameUI.CustomUIConfig().SurvivalTreasure = {
        Close: close,
        Toggle: function () {
            if (opened) { close(); return; }
            opened = true;
            p("TreasureWindow").RemoveClass("ArchiveHidden");
            p("TreasureScrim").RemoveClass("ArchiveHidden");
            update(CustomNetTables.GetTableValue("survival_rogue_reward", String(Game.GetLocalPlayerID())));
            if (layers()) layers().Open("treasure", p("TreasureWindow"), close, { scrim: p("TreasureScrim") });
            p("TreasureWindow").SetFocus();
        }
    };
    $.RegisterEventHandler("Cancelled", p("TreasureWindow"), close);
})();
