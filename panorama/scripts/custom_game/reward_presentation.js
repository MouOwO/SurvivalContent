(function () {
    "use strict";
    var colors = { n: "#ffffff", r: "#55aee9", sr: "#c471ed", ssr: "#ffd069", ur: "#8844bb",
        white: "#ffffff", blue: "#55aee9", purple: "#c471ed", gold: "#ffd069", green: "#66c9a5" };
    function fillIcon(icon, item) {
        var resources = GameUI.CustomUIConfig().SurvivalItemResources;
        if (resources && resources.FillIcon) return resources.FillIcon(icon, item);
        if (icon && icon.SetScaling) icon.SetScaling("stretch-to-cover-preserve-aspect");
        return icon;
    }
    function registeredIcon(parent, item, className, options) {
        var cfg = GameUI.CustomUIConfig(), resources = cfg.SurvivalItemResources;
        var row = resources && resources.Lookup(item);
        if (!row) return null;
        if (row.kind === "layered_title") return null;
        var icon;
        if (row.kind === "tier_badge") {
            icon = $.CreatePanel("Panel", parent, "");
            icon.__survivalTierBadge = true;
            icon.style.overflow = "clip";
            // One nested stage keeps all native layers aligned when archive,
            // VIP and tooltip consumers resize only their outer icon container.
            var stage = $.CreatePanel("Panel", icon, "");
            stage.style.width = "100%"; stage.style.height = "100%";
            stage.hittest = stage.hittestchildren = false;
            var base = $.CreatePanel("Image", stage, "");
            base.SetImage(row.uri); base.SetScaling("stretch-to-fit-preserve-aspect");
            base.style.width = "100%"; base.style.height = "100%";
            base.hittest = false;
            if (row.overlay_uri) {
                var overlay = $.CreatePanel("Image", stage, "");
                overlay.SetImage(row.overlay_uri); overlay.SetScaling("stretch-to-fit-preserve-aspect");
                overlay.style.width = "100%"; overlay.style.height = "100%";
                overlay.style.marginTop = "7%";
                overlay.hittest = false;
            }
            var tier = $.CreatePanel("Label", stage, "");
            tier.text = row.badge_text; tier.hittest = false;
            tier.style.width = "fit-children"; tier.style.minWidth = "28px";
            tier.style.height = "18px"; tier.style.padding = "0px 3px";
            tier.style.horizontalAlign = "center"; tier.style.verticalAlign = "bottom";
            tier.style.marginBottom = "5%";
            tier.style.fontFamily = '"Source Han Sans SC"'; tier.style.fontWeight = "bold";
            tier.style.fontSize = "13px"; tier.style.textAlign = "center";
            tier.style.textOverflow = "shrink"; tier.style.color = row.badge_color;
            tier.style.backgroundColor = "#080e14ed";
            tier.style.border = "1px solid " + row.badge_color;
            tier.style.textShadow = "#000000 0px 1px 2px 1.0";
        } else if (row.kind === "endless_emblem") {
            icon = $.CreatePanel("Panel", parent, "");
            icon.AddClass("ArchiveEndlessEmblem");
            icon.style.width = "72px"; icon.style.height = "56px"; icon.style.overflow = "clip";
            ["Left", "Right"].forEach(function (side) {
                var ring = $.CreatePanel("Panel", icon, "");
                ring.AddClass("ArchiveEndlessRing");
                ring.AddClass("ArchiveEndlessRing" + side);
                ring.style.width = "35px"; ring.style.height = "28px";
                ring.style.border = "4px solid #cfb879"; ring.style.borderRadius = "50%";
                ring.style.backgroundColor = "transparent";
                ring.style.position = (side === "Left" ? "6px" : "31px") + " 14px 0px";
                ring.style.transform = "rotateZ(" + (side === "Left" ? "28deg" : "-28deg") + ")";
                ring.hittest = false;
            });
        } else if (row.kind === "hero" && row.hero_name) {
            icon = $.CreatePanel("DOTAHeroImage", parent, "");
            icon.heroname = row.hero_name;
            icon.heroimagestyle = "portrait";
        } else if (row.kind === "vip" && row.vip_level && cfg.SurvivalVIPBadges) {
            icon = $.CreatePanel("Panel", parent, "");
            cfg.SurvivalVIPBadges.Render(icon, row.vip_level, options);
        } else if (row.uri) {
            icon = $.CreatePanel("Image", parent, "");
            icon.SetImage(row.uri);
            fillIcon(icon, item);
        } else return null;
        if (className) icon.AddClass(className);
        icon.hittest = false;
        icon.hittestchildren = false;
        icon.__itemResourceId = row.id;
        fillIcon(icon, item);
        return icon;
    }
    GameUI.CustomUIConfig().SurvivalRewardPresentation = {
        CreateRegisteredIcon: registeredIcon,
        FillIcon: fillIcon,
        BadgeColor: function (quality) { return ({n:"#e4f5eb",r:"#88ceff",sr:"#e0acff",ssr:"#ffe19a",ur:"#ffb9ed"})[String(quality || "").toLowerCase()] || "#ffffff"; },
        NameColor: function (quality) { return colors[String(quality || "n").toLowerCase()] || colors.n; },
        CreateIcon: function (parent, item, className) {
            var registered = registeredIcon(parent, item, className);
            if (registered) return registered;
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
            fillIcon(icon, item);
            return icon;
        }
    };
})();
