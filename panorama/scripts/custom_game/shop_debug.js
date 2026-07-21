(function () {
    "use strict";

    function onShopDebugShow(payload) {
        $.Msg("[SurvivalShopDebug] show event received: ", payload);

        var config = GameUI.CustomUIConfig();
        var shop = config && config.SurvivalShop;
        if (!shop || typeof shop.Open !== "function") {
            $.Msg(
                "[SurvivalShopDebug] SurvivalShop.Open is unavailable. ",
                "Check custom_ui_manifest.xml and survival_hud.xml."
            );
            return;
        }

        shop.Open();
    }

    GameEvents.Subscribe("ui_shop_debug_show", onShopDebugShow);
    $.Msg("[SurvivalShopDebug] ready; type shopshow in chat.");
})();
