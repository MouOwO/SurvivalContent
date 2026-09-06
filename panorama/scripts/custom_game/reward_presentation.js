(function () {
    "use strict";
    var colors = { n: "#ffffff", r: "#55aee9", sr: "#c471ed", ssr: "#ffd069", ur: "#8844bb",
        white: "#ffffff", blue: "#55aee9", purple: "#c471ed", gold: "#ffd069", green: "#66c9a5" };
    GameUI.CustomUIConfig().SurvivalRewardPresentation = {
        NameColor: function (quality) { return colors[String(quality || "n").toLowerCase()] || colors.n; },
        CreateIcon: function (parent, item, className) {
            var type = String(item.icon_type || "item"), icon;
            if (type === "image") {
                icon = $.CreatePanel("Image", parent, "");
                icon.SetImage(item.icon || "");
            } else if (type === "ability") {
                icon = $.CreatePanel("DOTAAbilityImage", parent, "");
                icon.abilityname = item.icon || "attribute_bonus";
            } else {
                icon = $.CreatePanel("DOTAItemImage", parent, "");
                icon.itemname = item.icon || "item_branches";
            }
            icon.AddClass(className);
            icon.hittest = false;
            icon.hittestchildren = false;
            return icon;
        }
    };
})();
