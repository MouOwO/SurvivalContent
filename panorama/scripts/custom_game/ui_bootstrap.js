(function () {
    "use strict";

    var LOG_PREFIX = "[SurvivalUIBootstrap]";
    // Phase 0 rollback boundary. Keep inventory native until the separate item
    // interaction controller (use/drag/swap/drop/sell) is complete.
    GameUI.CustomUIConfig().SurvivalHudTakeover = {
        // Crash isolation v3: pressing Alt still crashes after every configurable
        // native Alt overlay was disabled. Keep Valve's ability tree completely
        // native so Alt detail refresh cannot observe suppressed AbilityN children.
        abilities: false,
        // Keep Valve's ability bar, but selectively proxy upgrade tooltips so
        // dynamic resources and property deltas can use real Panorama images.
        abilityTooltips: true,
        // Keep the completed survey available through SurvivalAbilityTakeover,
        // but run the evidence-based adaptive proxy implementation by default.
        abilitySurvey: false,
        // Character numbers remain authoritative, but detailed stat hover
        // tooltips are intentionally disabled.
        stats: false,
        inventory: false
    };
    var hiddenElements = [
        "DOTA_DEFAULT_UI_TOP_BAR",
        "DOTA_DEFAULT_UI_TOP_BAR_BACKGROUND",
        "DOTA_DEFAULT_UI_TOP_HEROES",
        "DOTA_DEFAULT_UI_TOP_TIMEOFDAY",
        "DOTA_DEFAULT_UI_FLYOUT_SCOREBOARD",
        "DOTA_DEFAULT_UI_INVENTORY_SHOP",
        "DOTA_DEFAULT_UI_INVENTORY_QUICKBUY",
        "DOTA_DEFAULT_UI_INVENTORY_COURIER",
        "DOTA_DEFAULT_UI_INVENTORY_PROTECT",
        "DOTA_DEFAULT_UI_INVENTORY_GOLD",
        "DOTA_DEFAULT_UI_SHOP_SUGGESTEDITEMS",
        "DOTA_DEFAULT_UI_SHOP_COMMONITEMS"
    ];

    // 官方 Reborn 底栏本身已经存在于 hud_reborn.xml 中。
    // 直接恢复引擎管理的角色窗口、技能和物品，而不是复制一套失去绑定的 DOTA* 控件。
    var enabledElements = [
        "DOTA_DEFAULT_UI_ACTION_PANEL",
        "DOTA_DEFAULT_UI_INVENTORY_PANEL",
        "DOTA_DEFAULT_UI_INVENTORY_ITEMS"
    ];

    // 通过 DotaDefaultUIElement_t 隐藏原生底栏；不再猜测原生 HUD 内部节点名，避免误伤头像/三围。
    function setDefaultUIEnabledSafe(elementName, enabled) {
        if (typeof DotaDefaultUIElement_t === "undefined") return false;
        var element = DotaDefaultUIElement_t[elementName];
        if (element === undefined) {
            $.Warning(LOG_PREFIX + " missing default UI enum: " + elementName);
            return false;
        }
        GameUI.SetDefaultUIEnabled(element, enabled);
        return true;
    }

    function hideOfficialTopLeftPanels() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        if (!root || !root.FindChildTraverse) return;
        ["MenuButtons", "quickstats", "spectator_quickstats"].forEach(function (id) {
            var target = root.FindChildTraverse(id);
            if (!target) return;
            target.style.visibility = "collapse";
            target.hittest = false;
            target.hittestchildren = false;
        });
    }

    function applyDefaultUIProfile() {
        if (!GameUI || !GameUI.SetDefaultUIEnabled) {
            $.Warning(LOG_PREFIX + " GameUI.SetDefaultUIEnabled is unavailable.");
            return;
        }
        hiddenElements.forEach(function (name) {
            setDefaultUIEnabledSafe(name, false);
        });
        enabledElements.forEach(function (name) {
            setDefaultUIEnabledSafe(name, true);
        });
        hideOfficialTopLeftPanels();
        $.Msg(LOG_PREFIX + " official Reborn action panel restored; custom shop profile applied.");
    }


    function trimmedNumber(value) {
        return value.toFixed(1).replace(/\.0$/, "");
    }

    function formatLogicalNumber(value) {
        var number = Number(value || 0);
        var sign = number < 0 ? "-" : "";
        var absolute = Math.abs(number);
        if (absolute >= 100000000) {
            return sign + trimmedNumber(absolute / 100000000) + "亿";
        }
        if (absolute >= 10000) {
            return sign + trimmedNumber(absolute / 10000) + "万";
        }
        if (Math.abs(absolute - Math.round(absolute)) < 0.001) {
            return sign + String(Math.round(absolute));
        }
        return sign + trimmedNumber(absolute);
    }

    GameUI.CustomUIConfig().SurvivalNumberFormatter = {
        Format: formatLogicalNumber
    };

    $.Msg("[SURVIVAL_CRASH_ISOLATION] crash_isolation_v3_alt_ability_takeover_disabled abilities=false ability_tooltips=false native_ability_tree=true");
    $.Msg(LOG_PREFIX + " loaded.");
    applyDefaultUIProfile();
    $.Schedule(0.10, applyDefaultUIProfile);
    $.Schedule(1.00, applyDefaultUIProfile);
    $.Schedule(3.00, applyDefaultUIProfile);
})();
