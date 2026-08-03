(function () {
    "use strict";

    var takeover = GameUI.CustomUIConfig().SurvivalHudTakeover || {};
    if (takeover.abilityTooltips === false) {
        GameUI.CustomUIConfig().SurvivalTooltipBindings = {
            Recover: function () {},
            RefreshVisible: function () {}
        };
        $.Msg("[SURVIVAL_TOOLTIP] DISABLED crash_isolation_v3_alt_ability_takeover_disabled valve_ability_bindings=false click_proxies=false");
        return;
    }
    if (takeover.abilities) {
        // hud_takeover.js owns every visible ability hover source. Do not bind
        // events inside Valve's AbilityN tree, otherwise its ancestor can still
        // create DOTAAbilityTooltip even when our child handler hides it.
        GameUI.CustomUIConfig().SurvivalTooltipBindings = {
            Recover: function () {
                var controller = GameUI.CustomUIConfig().SurvivalAbilityTakeover;
                if (controller && controller.Refresh) controller.Refresh("binding_recovery");
            },
            RefreshVisible: function () {
                var controller = GameUI.CustomUIConfig().SurvivalAbilityTakeover;
                if (controller && controller.RefreshTooltip) controller.RefreshTooltip();
            }
        };
        $.Msg("[SURVIVAL_TOOLTIP] legacy AbilityN binding disabled; takeover controller pending");
        return;
    }

    var activeAbilityIndex = -1;
    var activeAbilityName = "";
    var activeSourcePanel = null;
    var nativeTooltipSuppressToken = 0;

    function byId(id) { return $("#" + id); }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }

    function setText(id, value) {
        var target = byId(id);
        if (target) target.text = String(value === undefined ? "" : value);
    }

    function localize(key, fallback) {
        var value = "";
        try { value = $.Localize("#" + key); } catch (error) {}
        if (!value || value === "#" + key) return fallback || "";
        return value;
    }

    function localizedAbilityName(abilityName) {
        return localize("DOTA_Tooltip_ability_" + abilityName, abilityName);
    }

    function localizedAbilityDescription(abilityName) {
        return localize(
            "DOTA_Tooltip_ability_" + abilityName + "_Description",
            ""
        );
    }

    function nativeTooltipOwners(sourcePanel) {
        var panels = [sourcePanel, activeSourcePanel, $.GetContextPanel()];
        var current = sourcePanel;
        for (var depth = 0; current && depth < 8; depth++) {
            panels.push(current);
            if (current.FindChildTraverse) {
                panels.push(current.FindChildTraverse("AbilityButton"));
                panels.push(current.FindChildTraverse("ButtonWell"));
                panels.push(current.FindChildTraverse("AbilityImage"));
            }
            current = current.GetParent ? current.GetParent() : null;
        }
        return panels;
    }

    function hideNativeTooltip(sourcePanel) {
        var panels = nativeTooltipOwners(sourcePanel);
        var seen = [];
        panels.forEach(function (panel) {
            if (!panel || seen.indexOf(panel) >= 0) return;
            seen.push(panel);
            try { $.DispatchEvent("DOTAHideAbilityTooltip", panel); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTextTooltip", panel); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTitleTextTooltip", panel); } catch (error) {}
        });
        // Compatibility fallback for HUD builds where Valve replaces the
        // tooltip owner panel after hover begins (notably while Alt is held).
        try { $.DispatchEvent("DOTAHideAbilityTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTextTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTitleTextTooltip"); } catch (error) {}
    }

    function suppressNativeTooltip(abilityIndex, sourcePanel) {
        nativeTooltipSuppressToken += 1;
        var token = nativeTooltipSuppressToken;
        function active() {
            return token === nativeTooltipSuppressToken
                && activeAbilityIndex === abilityIndex
                && activeSourcePanel === sourcePanel;
        }
        function suppressOnce() {
            if (active()) hideNativeTooltip(sourcePanel);
        }
        function suppress() {
            if (!active()) return;
            hideNativeTooltip(sourcePanel);
            $.Schedule(0.08, suppress);
        }
        suppress();
        [0.0, 0.03, 0.16, 0.30].forEach(function (delay) {
            $.Schedule(delay, suppressOnce);
        });
    }

    function hideCustomTooltip() {
        nativeTooltipSuppressToken += 1;
        activeAbilityIndex = -1;
        activeAbilityName = "";
        activeSourcePanel = null;
        var tooltip = byId("CustomAbilityTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function showNativeAbilityTooltip(panel, abilityName) {
        if (!panel || !abilityName) return;
        try { $.DispatchEvent("DOTAShowAbilityTooltip", panel, abilityName); } catch (error) {}
    }

    function hideAllTooltips(panel) {
        hideCustomTooltip();
        hideNativeTooltip(panel);
    }

    function addField(container, label, value) {
        if (value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("AbilityFieldRow");
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("AbilityFieldLabel");
        left.text = label;
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("AbilityFieldValue");
        right.text = String(value);
    }

    function render(abilityIndex, abilityName, sourcePanel) {
        var definition = CustomNetTables.GetTableValue(
            "survival_ability_data",
            abilityName
        ) || {};
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips",
            definition.tooltip_id || ("ability:" + abilityName)
        ) || {};

        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
        if (runtime.removed === 1) runtime = {};

        var tooltip = byId("CustomAbilityTooltip");
        var fields = byId("CustomAbilityFields");
        var icon = byId("CustomAbilityIcon");
        if (!tooltip || !fields) return false;
        tooltip.RemoveClass("ItemOnly");
        tooltip.RemoveClass("ExtensionOnly");
        setText("CustomAbilityExtensionLabel", "生存防守 · 自定义技能详情");

        setText("CustomAbilityTitle", runtime.display_name || tooltipDefinition.name
            || definition.abilityname || localizedAbilityName(abilityName));
        setText("CustomAbilityLevel", runtime.current_level !== undefined
            ? "【等级】 " + runtime.current_level : "");
        var behavior = 0;
        try { behavior = Number(Abilities.GetBehavior(abilityIndex) || 0); } catch (error) {}
        var description = runtime.upgrade_description || tooltipDefinition.desc
            || definition.abilitydesc
            || localizedAbilityDescription(abilityName);
        if (!description) {
            description = "该技能由项目服务器管理，具体效果和消耗以当前实时数据为准。";
        }
        setText("CustomAbilityDescription", description);

        var goldCost = runtime.cost_gold !== undefined
            ? runtime.cost_gold : Number(tooltipDefinition.needgold || 0);
        var woodCost = runtime.cost_wood !== undefined
            ? runtime.cost_wood : Number(tooltipDefinition.needwood || 0);
        var costRow = byId("CustomAbilityCostRow");
        if (costRow) costRow.SetHasClass(
            "Hidden",
            Number(goldCost || 0) <= 0 && Number(woodCost || 0) <= 0
        );
        setText("CustomAbilityGoldCost", goldCost);
        setText("CustomAbilityWoodCost", woodCost);

        fields.RemoveAndDeleteChildren();
        asArray(runtime.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        var unavailable = runtime.available === 0;
        var lacksResources = !unavailable && runtime.can_afford === 0;
        setText(
            "CustomAbilityType",
            unavailable ? "不可施法技能"
                : (lacksResources ? "可点击技能（资源不足）" : "可施法技能")
        );
        setText("CustomAbilityStatus", runtime.status_text
            || (unavailable ? "不可施法 · 前置条件未满足"
                : (lacksResources ? "当前资源不足 · 由服务器最终校验" : "可施法")));

        tooltip.SetHasClass(
            "Unavailable",
            unavailable
        );
        tooltip.RemoveClass("Hidden");

        $.Schedule(0.0, function () {
            if (activeAbilityIndex !== abilityIndex) return;
            var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
            if (positioner) positioner.PlaceAbove(tooltip, sourcePanel, 337, 220);
        });
        return true;
    }

    function managedRuntime(abilityIndex) {
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
        return runtime.removed !== 1
            && Number(runtime.ability_entindex) === Number(abilityIndex)
            && Number(runtime.owner_entindex) === Number(selectedUnit());
    }

    function selectedUnit() {
        try {
            var unit = Players.GetLocalPlayerPortraitUnit();
            if (unit !== undefined && unit !== -1) return unit;
        } catch (error) {}
        return Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID());
    }

    function abilityFromSlot(slot) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        try { return Entities.GetAbility(unit, slot); } catch (error) { return -1; }
    }

    function abilityFromDisplayIndex(displayIndex) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        var visible = [];
        for (var slot = 0; slot < 24; slot++) {
            var abilityIndex = abilityFromSlot(slot);
            if (abilityIndex === undefined || abilityIndex < 0) continue;
            var abilityName = "";
            var hidden = false;
            try {
                abilityName = Abilities.GetAbilityName(abilityIndex) || "";
                hidden = Abilities.IsHidden(abilityIndex);
            } catch (error) {}
            if (abilityName && !hidden) visible.push(abilityIndex);
        }
        return visible[displayIndex] === undefined
            ? -1 : visible[displayIndex];
    }

    function isManagedBuildingAction(abilityName) {
        return /^ability_build_/.test(abilityName)
            || /^ability_upgrade_tower/.test(abilityName)
            || /^ability_tower_class_[1-7]$/.test(abilityName)
            || abilityName === "ability_upgrade_wall"
            || abilityName === "ability_upgrade_city"
            || abilityName === "ability_upgrade_farm"
            || abilityName === "ability_upgrade_gold_mine"
            || abilityName === "ability_upgrade_gold_mine_efficiency"
            || abilityName === "ability_upgrade_gold_mine_crit"
            || abilityName === "ability_gold_mine_auto_upgrade"
            || abilityName === "ability_gold_mine_stop_auto_upgrade";
    }

    function executeAbility(abilityIndex) {
        if (abilityIndex === undefined || abilityIndex < 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] reject invalid ability=", String(abilityIndex));
            return false;
        }
        var unit = selectedUnit();
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
        if (runtime.removed === 1
            || runtime.available === 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] reject unavailable ability=",
                String(abilityIndex), " status=", String(runtime.status_text || ""));
            return false;
        }
        if (runtime.can_afford === 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] LOCAL_RESOURCE_LOW request_sent=1 ability=",
                String(abilityIndex), " resource_version=",
                String(runtime.resource_version || 0));
        }
        var name = "";
        var behavior = 0;
        try {
            name = Abilities.GetAbilityName(abilityIndex) || "";
            behavior = Number(Abilities.GetBehavior(abilityIndex) || 0);
        } catch (error) {}
        if ((behavior & 16) !== 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_BEGIN unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
            var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput;
            if (pointInput && pointInput.Begin) return pointInput.Begin(abilityIndex);
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_NO_INPUT_HANDLER");
            return false;
        }
        $.Msg("[SURVIVAL_CAST][TOOLTIP] SEND_NO_TARGET unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_request", {
            entindex: unit,
            ability_entindex: abilityIndex
        });
        return true;
    }

    GameUI.CustomUIConfig().SurvivalAbilityInput = {
        ExecuteAbility: executeAbility
    };

    function showSlot(slot, sourcePanel) {
        var boundAbility = sourcePanel
            && sourcePanel.__survivalAbilityIndex !== undefined
            ? Number(sourcePanel.__survivalAbilityIndex) : -1;
        var abilityIndex = boundAbility >= 0
            ? boundAbility : abilityFromSlot(slot);
        if (abilityIndex === undefined || abilityIndex < 0) return;
        var abilityName = Abilities.GetAbilityName(abilityIndex);
        if (!abilityName) return;

        if (!managedRuntime(abilityIndex)
            && !isManagedBuildingAction(abilityName)) {
            hideCustomTooltip();
            showNativeAbilityTooltip(sourcePanel, abilityName);
            return;
        }

        activeAbilityIndex = abilityIndex;
        activeAbilityName = abilityName;
        activeSourcePanel = sourcePanel;
        // Valve may recreate its tooltip after our hover handler has already
        // run. Keep suppressing every known owner panel while this managed
        // action remains hovered, instead of hiding only once.
        suppressNativeTooltip(abilityIndex, sourcePanel);
        if (!render(abilityIndex, abilityName, sourcePanel)) {
            activeAbilityIndex = -1;
            activeAbilityName = "";
            activeSourcePanel = null;
            try {
                $.DispatchEvent("DOTAShowAbilityTooltip", sourcePanel, abilityName);
            } catch (error) {}
        }
    }

    function slotFromPanel(panel) {
        var id = panel && panel.id ? panel.id : "";
        var match = id.match(/^(?:Survival)?Ability([0-9]+)$/);
        return match ? Number(match[1]) : -1;
    }

    function bindPanel(panel) {
        if (!panel) return;
        var slot = slotFromPanel(panel);
        if (slot < 0) return;
        if (panel.BHasClass("SurvivalTooltipBound")) return;
        panel.AddClass("SurvivalTooltipBound");
        panel.hittest = true;
        panel.SetPanelEvent("onmouseover", function () {
            var abilityIndex = abilityFromSlot(slot);
            var abilityName = abilityIndex >= 0
                ? (Abilities.GetAbilityName(abilityIndex) || "") : "";
            if (managedRuntime(abilityIndex)
                || isManagedBuildingAction(abilityName)) {
                showSlot(slot, panel);
            } else {
                showNativeAbilityTooltip(panel, abilityName);
            }
        });
        panel.SetPanelEvent("onmouseout", function () {
            hideAllTooltips(panel);
            var tooltip = GameUI.CustomUIConfig().SurvivalShopTooltip;
            if (tooltip) tooltip.Hide();
        });
        if (slot >= 0) {
            panel.SetPanelEvent("onactivate", function () {
                var boundAbility = panel.__survivalAbilityIndex !== undefined
                    ? Number(panel.__survivalAbilityIndex) : -1;
                var abilityIndex = boundAbility >= 0
                    ? boundAbility : abilityFromSlot(slot);
                if (abilityIndex === undefined || abilityIndex < 0) return;
                var input = GameUI.CustomUIConfig().SurvivalAbilityInput;
                if (input && input.ExecuteAbility) input.ExecuteAbility(abilityIndex);
            });
        }
    }

    function scan(panel) {
        if (!panel) return;
        bindPanel(panel);
        var count = panel.GetChildCount();
        for (var index = 0; index < count; index++) scan(panel.GetChild(index));
    }

    function hudRoot() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) {
            root = root.GetParent();
        }
        return root;
    }

    function bindOfficialAbility(panel, displayIndex) {
        if (!panel) return;
        var sourcePanel = panel.FindChildTraverse
            ? (panel.FindChildTraverse("AbilityButton")
                || panel.FindChildTraverse("ButtonWell")
                || panel.FindChildTraverse("AbilityImage")
                || panel)
            : panel;
        sourcePanel.__survivalAbilityIndex = abilityFromDisplayIndex(displayIndex);
        // Do not overwrite Valve's ability-button hover handlers. Managed
        // building actions are covered by the proxy below; ordinary abilities
        // remain completely native.

        // Dynamic Lua abilities on buildings do not reliably reach OnSpellStart
        // through Valve's native button. A transparent child button takes only
        // the managed building actions and forwards them to the same custom
        // request dispatcher as Q/W/E. Ordinary abilities remain fully native.
        var clickProxy = panel.FindChildTraverse
            ? panel.FindChildTraverse("SurvivalManagedAbilityClick") : null;
        if (!clickProxy) {
            clickProxy = $.CreatePanel(
                "Button",
                panel,
                "SurvivalManagedAbilityClick"
            );
            clickProxy.style.width = "100%";
            clickProxy.style.height = "100%";
            clickProxy.style.position = "0px 0px 0px";
            clickProxy.style.opacity = "0.0";
            clickProxy.SetPanelEvent("onmouseover", function () {
                var abilityIndex = abilityFromDisplayIndex(displayIndex);
                if (abilityIndex >= 0) showSlot(displayIndex, clickProxy);
            });
            clickProxy.SetPanelEvent("onmouseout", function () {
                hideCustomTooltip();
                hideNativeTooltip(clickProxy);
            });
            clickProxy.SetPanelEvent("onactivate", function () {
                var abilityIndex = abilityFromDisplayIndex(displayIndex);
                if (abilityIndex < 0) return;
                var abilityName = "";
                try {
                    abilityName = Abilities.GetAbilityName(abilityIndex) || "";
                } catch (error) {}
                if (!managedRuntime(abilityIndex)
                    && !isManagedBuildingAction(abilityName)) return;
                var runtime = CustomNetTables.GetTableValue(
                    "survival_ability_runtime",
                    String(abilityIndex)
                ) || {};
                $.Msg("[SURVIVAL_CAST][CLIENT] OFFICIAL_BUTTON display_slot=",
                    String(displayIndex), " ability=", String(abilityIndex),
                    " name=", abilityName, " available=",
                    String(runtime.available), " can_afford=",
                    String(runtime.can_afford), " resource_version=",
                    String(runtime.resource_version || 0));
                var input = GameUI.CustomUIConfig().SurvivalAbilityInput;
                if (input && input.ExecuteAbility) {
                    input.ExecuteAbility(abilityIndex);
                }
            });
        }
        var currentAbility = abilityFromDisplayIndex(displayIndex);
        var currentName = "";
        try {
            currentName = currentAbility >= 0
                ? (Abilities.GetAbilityName(currentAbility) || "") : "";
        } catch (error) {}
        var managed = managedRuntime(currentAbility)
            || isManagedBuildingAction(currentName);
        clickProxy.hittest = managed;
        clickProxy.hittestchildren = managed;
        clickProxy.style.visibility = managed ? "visible" : "collapse";
    }

    function bindOfficialAbilities() {
        var root = hudRoot();
        if (!root || !root.FindChildTraverse) return;
        var abilities = root.FindChildTraverse("abilities")
            || root.FindChildTraverse("AbilitiesAndStatBranch");
        if (!abilities || !abilities.FindChildTraverse) return;
        for (var displayIndex = 0; displayIndex < 24; displayIndex++) {
            bindOfficialAbility(
                abilities.FindChildTraverse("Ability" + displayIndex),
                displayIndex
            );
        }
    }

    function refreshBindings() {
        scan($("#SurvivalHeroAbilitySlots"));
        bindOfficialAbilities();
    }

    function refreshVisible(reason) {
        if (activeAbilityIndex >= 0 && activeAbilityName && activeSourcePanel) {
            render(activeAbilityIndex, activeAbilityName, activeSourcePanel);
        }
    }

    function scheduleBindingRecovery() {
        [0.0, 0.1, 0.35, 1.0].forEach(function (delay) {
            $.Schedule(delay, refreshBindings);
        });
    }

    CustomNetTables.SubscribeNetTableListener(
        "survival_ability_runtime",
        function (name, key) {
            if (Number(key) === Number(activeAbilityIndex)) {
                refreshVisible("ability_runtime");
            }
        }
    );
    GameUI.CustomUIConfig().SurvivalTooltipBindings = {
        Recover: scheduleBindingRecovery,
        RefreshVisible: refreshVisible
    };
    scheduleBindingRecovery();
})();
