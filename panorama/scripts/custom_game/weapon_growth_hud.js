(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();

    function panel(id) { return $("#" + id); }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }

    function itemDefinition(contentId) {
        return CustomNetTables.GetTableValue(
            "survival_item_tooltips",
            contentId
        ) || {};
    }

    function fieldValue(fields, label) {
        var result = "";
        asArray(fields).some(function (field) {
            if (!field || String(field.label || "") !== label) return false;
            result = String(field.value === undefined ? "" : field.value);
            return true;
        });
        return result;
    }

    function render() {
        var root = panel("WeaponGrowthHUD");
        if (!root) return;
        var snapshot = CustomNetTables.GetTableValue(
            "survival_weapon_snapshot",
            String(playerId)
        ) || {};
        var equipment = snapshot.equipment || {};
        var growth = snapshot.growth || {};
        var contentId = String(equipment.main_hand_content_id || "");
        var itemView = snapshot.tooltip_view_model
            && snapshot.tooltip_view_model.items
            && snapshot.tooltip_view_model.items[contentId];
        var fields = itemView && itemView.fields || [];
        var target = Math.max(0, Number(growth.stage_attack_target || 0));
        var current = Math.max(0, Number(growth.stage_attack_count || 0));
        var hasGrowth = contentId !== "" && (target > 0 || asArray(fields).length > 0);
        root.SetHasClass("Hidden", !hasGrowth);
        if (!hasGrowth) return;

        var definition = itemDefinition(contentId);
        panel("WeaponGrowthName").text = String(
            equipment.main_hand_name || definition.displayname
                || definition.name || contentId
        );
        panel("WeaponGrowthStage").text = String(definition.level_text || "");

        var progressText = fieldValue(fields, "当前进度");
        panel("WeaponGrowthProgressText").text = progressText
            || (target > 0 ? Math.min(current, target) + " / " + target : String(current));
        var ratio = target > 0 ? Math.min(1, current / target) : 0;
        panel("WeaponGrowthProgressFill").style.width = String(ratio * 100) + "%";

        var detailParts = [];
        asArray(fields).forEach(function (field) {
            if (!field) return;
            var label = String(field.label || "");
            if (label === "当前进度" || label === "剩余进度") return;
            detailParts.push(label + " " + String(field.value));
        });
        panel("WeaponGrowthDetails").text = detailParts.join(" · ");
    }

    CustomNetTables.SubscribeNetTableListener(
        "survival_weapon_snapshot",
        function (tableName, key) {
            if (Number(key) === Number(playerId)) render();
        }
    );
    GameEvents.Subscribe("ui_weapon_synthesis_snapshot", render);
    render();
})();