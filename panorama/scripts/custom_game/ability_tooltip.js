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
    var bindingRecoverySerial = 0;
    var officialMapDiagnostic = "";
    var externalProxyDiagnostic = "";
    var externalHoverDiagnostic = "";
    var externalLayerDiagnostic = "";
    var externalGeometryDiagnostics = [];
    var externalProxyLayer = null;
    var externalProxies = [];
    var officialBindings = [];
    var bindingDecisionDiagnostic = "";
    var cursorProbeSerial = 0;
    var cursorProbeDiagnostic = "";
    var pendingHoverRestore = null;
    var observedSelectedUnit = null;
    var observedAuthorityAbilitySignature = "";
    var scopeDiagnostic = "";
    var recoveryDiagnostic = "";
    var authorityRuntimeObservationSerial = 0;
    var authorityRuntimeEventKey = "";
    var authorityRuntimeEventData = null;
    var selectionObservationSerial = 0;
    var externalHoverExitSerial = 0;
    var selectiveTooltipOwner = "selective_proxy";
    var tooltipAnimationSerial = 0;
    var defaultTooltipFadeDuration = 0.08;
    var tooltipFadeDuration = defaultTooltipFadeDuration;
    var tooltipAnimationFrame = 0.016;
    // Entities.GetAbility() addresses sparse engine slots, not Valve's compact
    // Ability0..N visual row. Native heroes can have many hidden abilities ahead
    // of the six project-visible abilities, so every Tooltip path must share this
    // bounded sparse scan instead of assuming a small contiguous engine range.
    var maxAbilityEngineSlots = 64;

    function byId(id) { return $("#" + id); }

    function normalizeTooltipFadeDuration(value) {
        var duration = Number(value);
        if (!isFinite(duration)) return null;
        duration = Math.max(0, Math.min(1, duration));
        return Math.round(duration * 1000) / 1000;
    }

    function applyTooltipFadeDuration(value, source) {
        var duration = normalizeTooltipFadeDuration(value);
        if (duration === null) {
            $.Msg("[SURVIVAL_TOOLTIP_FADE] rejected value=", String(value),
                " current=", tooltipFadeDuration.toFixed(3), "s");
            return tooltipFadeDuration;
        }
        tooltipFadeDuration = duration;
        GameUI.CustomUIConfig().SurvivalTooltipFadeDuration = duration;
        var tooltip = byId("CustomAbilityTooltip");
        if (tooltip) tooltip.style.transitionDuration = duration.toFixed(3) + "s";
        $.Msg("[SURVIVAL_TOOLTIP_FADE] duration=", duration.toFixed(3),
            "s source=", String(source || "api"));
        return duration;
    }

    function registerTooltipFadeDebug() {
        var config = GameUI.CustomUIConfig();
        var stored = normalizeTooltipFadeDuration(config.SurvivalTooltipFadeDuration);
        applyTooltipFadeDuration(
            stored === null ? defaultTooltipFadeDuration : stored,
            stored === null ? "default" : "restored"
        );
        config.SurvivalTooltipDebug = {
            SetFadeDuration: function (seconds) {
                return applyTooltipFadeDuration(seconds, "api");
            },
            GetFadeDuration: function () { return tooltipFadeDuration; },
            ResetFadeDuration: function () {
                return applyTooltipFadeDuration(defaultTooltipFadeDuration, "api_reset");
            }
        };
        if (!Game.AddCommand) return;
        Game.AddCommand("survival_tooltip_fade", function (seconds) {
            if (seconds === undefined || seconds === null || String(seconds) === "") {
                $.Msg("[SURVIVAL_TOOLTIP_FADE] usage: survival_tooltip_fade <seconds>",
                    " current=", tooltipFadeDuration.toFixed(3), "s");
                return;
            }
            applyTooltipFadeDuration(seconds, "console");
        }, "设置技能提示淡入淡出秒数", 0);
        Game.AddCommand("survival_tooltip_fade_faster", function () {
            applyTooltipFadeDuration(tooltipFadeDuration - 0.01, "console_faster");
        }, "技能提示淡入淡出加快 0.01 秒", 0);
        Game.AddCommand("survival_tooltip_fade_slower", function () {
            applyTooltipFadeDuration(tooltipFadeDuration + 0.01, "console_slower");
        }, "技能提示淡入淡出减慢 0.01 秒", 0);
        Game.AddCommand("survival_tooltip_fade_print", function () {
            $.Msg("[SURVIVAL_TOOLTIP_FADE] duration=",
                tooltipFadeDuration.toFixed(3), "s source=console_print");
        }, "显示技能提示淡入淡出秒数", 0);
        Game.AddCommand("survival_tooltip_fade_reset", function () {
            applyTooltipFadeDuration(defaultTooltipFadeDuration, "console_reset");
        }, "重置技能提示淡入淡出秒数", 0);
    }

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

    function hideNativeTooltip(sourcePanel) {
        if (sourcePanel) {
            try { $.DispatchEvent("DOTAHideAbilityTooltip", sourcePanel); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTextTooltip", sourcePanel); } catch (error) {}
            try { $.DispatchEvent("DOTAHideTitleTextTooltip", sourcePanel); } catch (error) {}
        }
        try { $.DispatchEvent("DOTAHideAbilityTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTextTooltip"); } catch (error) {}
        try { $.DispatchEvent("DOTAHideTitleTextTooltip"); } catch (error) {}
    }

    function tooltipError(stage, error, sourcePanel) {
        var message = error && error.message !== undefined
            ? error.message : String(error || "unknown");
        $.Msg("[SURVIVAL_TOOLTIP_ERROR] stage=", String(stage),
            " unit=", String(selectedUnit()),
            " ability=", String(activeAbilityIndex),
            " source=", panelIdentity(sourcePanel || activeSourcePanel),
            " error=", String(message));
    }

    function externalAbilityHighlightTarget(proxy) {
        var anchor = proxy && proxy.__survivalVisualAnchor;
        if (!anchor || !anchor.IsValid || !anchor.IsValid()) return null;
        if (String(anchor.id || "") === "AbilityImage") return anchor;
        if (!anchor.FindChildTraverse) return anchor;
        return anchor.FindChildTraverse("AbilityImage") || anchor;
    }

    function setExternalProxyHighlight(proxy, active) {
        if (!proxy || !proxy.IsValid || !proxy.IsValid()) return;
        var previous = proxy.__survivalHighlightTarget;
        var target = active ? externalAbilityHighlightTarget(proxy) : null;
        if (previous && previous !== target && previous.IsValid && previous.IsValid()) {
            try {
                previous.style.brightness = proxy.__survivalHighlightBrightness || null;
                previous.style.saturation = proxy.__survivalHighlightSaturation || null;
            }
            catch (error) { tooltipError("old_image_highlight", error, proxy); }
        }
        if (target && previous !== target) {
            proxy.__survivalHighlightBrightness = String(target.style.brightness || "");
            proxy.__survivalHighlightSaturation = String(target.style.saturation || "");
        }
        proxy.__survivalHighlightTarget = target;
        if (!target) {
            proxy.__survivalHighlightBrightness = "";
            proxy.__survivalHighlightSaturation = "";
            return;
        }
        var anchor = proxy && proxy.__survivalVisualAnchor;
        try {
            // Project CSS does not reliably cross into Valve's HUD layout
            // context. Inline visual properties work on the real image node.
            target.style.brightness = "1.25";
            target.style.saturation = "1.35";
        } catch (error) {
            // Valve can rebuild AbilityImage during a bounded recovery. The
            // next binding refresh reacquires the current image node.
            tooltipError("image_highlight", error, anchor);
        }
    }

    function acquireSelectiveTooltip(tooltip) {
        if (!tooltip) return;
        var previous = String(tooltip.__survivalTooltipOwner || "none");
        tooltip.__survivalTooltipOwner = selectiveTooltipOwner;
        if (previous !== selectiveTooltipOwner) {
            $.Msg("[SURVIVAL_TOOLTIP_OWNER] action=acquire owner=",
                selectiveTooltipOwner, " previous=", previous);
        }
    }

    function releaseSelectiveTooltip(tooltip) {
        if (!tooltip) return false;
        var owner = String(tooltip.__survivalTooltipOwner || "");
        if (owner && owner !== selectiveTooltipOwner) {
            $.Msg("[SURVIVAL_TOOLTIP_OWNER] action=skip_foreign_hide requester=",
                selectiveTooltipOwner, " owner=", owner);
            return false;
        }
        tooltip.__survivalTooltipOwner = "";
        if (owner === selectiveTooltipOwner) {
            $.Msg("[SURVIVAL_TOOLTIP_OWNER] action=release owner=",
                selectiveTooltipOwner);
        }
        return true;
    }

    function hideCustomTooltip() {
        setExternalProxyHighlight(activeSourcePanel, false);
        externalHoverExitSerial += 1;
        activeAbilityIndex = -1;
        activeAbilityName = "";
        activeSourcePanel = null;
        var tooltip = byId("CustomAbilityTooltip");
        if (!tooltip) return;
        var owner = String(tooltip.__survivalTooltipOwner || "");
        if (owner && owner !== selectiveTooltipOwner) {
            releaseSelectiveTooltip(tooltip);
            return;
        }
        tooltip.hittest = false;
        tooltip.hittestchildren = false;
        tooltipAnimationSerial += 1;
        var animationSerial = tooltipAnimationSerial;
        if (tooltip.BHasClass("Hidden")) {
            tooltip.RemoveClass("FadingOut");
            releaseSelectiveTooltip(tooltip);
            return;
        }
        tooltip.AddClass("FadingOut");
        // Keep the fully transparent panel alive for one render frame so
        // Panorama presents the final alpha sample before collapsing it.
        $.Schedule(tooltipFadeDuration + tooltipAnimationFrame, function () {
            if (animationSerial !== tooltipAnimationSerial) return;
            var currentOwner = String(tooltip.__survivalTooltipOwner || "");
            if (currentOwner && currentOwner !== selectiveTooltipOwner) {
                tooltip.RemoveClass("FadingOut");
                return;
            }
            tooltip.AddClass("Hidden");
            tooltip.RemoveClass("FadingOut");
            releaseSelectiveTooltip(tooltip);
        });
    }

    function showNativeAbilityTooltip(panel, abilityName) {
        if (!panel || !abilityName) return;
        try { $.DispatchEvent("DOTAShowAbilityTooltip", panel, abilityName); } catch (error) {}
    }

    function hideAllTooltips(panel) {
        hideCustomTooltip();
        hideNativeTooltip(panel);
    }

    function propertyIcon(label) {
        var icons = {
            "生命": { type: "item", name: "item_vitality_booster" },
            "护甲": { type: "item", name: "item_chainmail" },
            "攻击提升": { type: "image", name: "file://{images}/custom_game/survival_native/icon_damage.png" },
            "攻击速度": { type: "image", name: "file://{images}/custom_game/survival_native/icon_attack_speed.png" },
            "人口上限": { type: "ability", name: "ability_train_population" },
            "每秒金币": { type: "item", name: "item_hand_of_midas" },
            "效率": { type: "ability", name: "ability_upgrade_gold_mine_efficiency" },
            "暴击率": { type: "ability", name: "ability_upgrade_gold_mine_crit" },
            "暴击倍率": { type: "ability", name: "ability_upgrade_gold_mine_crit" }
        };
        return icons[String(label || "")] || null;
    }

    function localizedFieldLabel(label) {
        var tokens = {
            "等级": "Survival_UpgradeField_Level",
            "目标等级": "Survival_UpgradeField_TargetLevel",
            "升级目标": "Survival_UpgradeField_Target",
            "生命": "Survival_UpgradeField_Health",
            "护甲": "Survival_UpgradeField_Armor",
            "攻击提升": "Survival_UpgradeField_Attack",
            "攻击速度": "Survival_UpgradeField_AttackSpeed",
            "人口上限": "Survival_UpgradeField_Population",
            "每秒金币": "Survival_UpgradeField_GoldPerSecond",
            "科技等级": "Survival_UpgradeField_TechnologyLevel",
            "效率": "Survival_UpgradeField_Efficiency",
            "暴击率": "Survival_UpgradeField_CritChance",
            "暴击倍率": "Survival_UpgradeField_CritMultiplier",
            "模型状态": "Survival_UpgradeField_ModelStatus"
        };
        var token = tokens[String(label || "")];
        return token ? localize(token, label) : label;
    }

    function localizedFieldValue(label, value) {
        if (label !== "模型状态") return value;
        var normalized = String(value || "unchanged").toLowerCase();
        if (normalized === "ready") {
            return localize("Survival_UpgradeModel_Ready", "Ready");
        }
        if (normalized === "failed" || normalized === "retired") {
            return localize("Survival_UpgradeModel_Failed", "Failed · keeping current model");
        }
        if (normalized === "unchanged") {
            return localize("Survival_UpgradeModel_Unchanged", "Current model retained");
        }
        return localize("Survival_UpgradeModel_Loading", "Loading");
    }

    function addField(container, label, value) {
        if (value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("AbilityFieldRow");
        var iconDefinition = propertyIcon(label);
        if (iconDefinition) {
            var panelType = iconDefinition.type === "item" ? "DOTAItemImage"
                : (iconDefinition.type === "ability" ? "DOTAAbilityImage" : "Image");
            var icon = $.CreatePanel(panelType, row, "");
            icon.AddClass("AbilityFieldIcon");
            icon.hittest = false;
            if (iconDefinition.type === "item") icon.itemname = iconDefinition.name;
            else if (iconDefinition.type === "ability") icon.abilityname = iconDefinition.name;
            else icon.SetImage(iconDefinition.name);
        }
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("AbilityFieldLabel");
        left.text = localizedFieldLabel(label);
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("AbilityFieldValue");
        right.text = String(localizedFieldValue(label, value));
    }

    function render(abilityIndex, abilityName, sourcePanel) {
        var upgradeMode = managedUpgrade(abilityIndex, abilityName);
        var heroMode = isSelectedCombatHero()
            && unitOwnsAbility(selectedUnit(), abilityIndex);
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
        setText("CustomAbilityExtensionLabel", upgradeMode
            ? localize("Survival_UpgradeTooltip_Category", "SURVIVAL · UPGRADE")
            : (heroMode ? "SURVIVAL · HERO" : "SURVIVAL · ABILITY"));

        var localizedTitle = localize("DOTA_Tooltip_ability_" + abilityName, "");
        setText("CustomAbilityTitle", runtime.display_name || localizedTitle
            || tooltipDefinition.name || definition.abilityname || abilityName);
        var abilityLevel = 0;
        try { abilityLevel = Number(Abilities.GetLevel(abilityIndex) || 0); } catch (error) {}
        var displayedLevel = upgradeMode && runtime.current_level !== undefined
            ? runtime.current_level : abilityLevel;
        setText("CustomAbilityLevel", displayedLevel > 0
            ? localize("Survival_UpgradeField_Level", "Level")
                + " " + displayedLevel : "");
        var behavior = 0;
        try { behavior = Number(Abilities.GetBehavior(abilityIndex) || 0); } catch (error) {}
        var description = localizedAbilityDescription(abilityName)
            || (upgradeMode ? runtime.upgrade_description : "") || tooltipDefinition.desc
            || definition.abilitydesc
            || "";
        if (!description) {
            description = upgradeMode
                ? "该技能由项目服务器管理，具体效果和消耗以当前实时数据为准。"
                : "该技能由生存模式管理。";
        }
        setText("CustomAbilityDescription", description);

        var goldCost = upgradeMode && runtime.cost_gold !== undefined
            ? runtime.cost_gold : Number(tooltipDefinition.needgold || 0);
        var woodCost = upgradeMode && runtime.cost_wood !== undefined
            ? runtime.cost_wood : Number(tooltipDefinition.needwood || 0);
        var hasGoldCost = upgradeMode && Number(goldCost || 0) > 0;
        var hasWoodCost = upgradeMode && Number(woodCost || 0) > 0;
        var costRow = byId("CustomAbilityCostRow");
        var goldCostBlock = byId("CustomAbilityGoldCostBlock");
        var woodCostBlock = byId("CustomAbilityWoodCostBlock");
        if (costRow) costRow.SetHasClass("Hidden", !hasGoldCost && !hasWoodCost);
        if (goldCostBlock) goldCostBlock.SetHasClass("Hidden", !hasGoldCost);
        if (woodCostBlock) woodCostBlock.SetHasClass("Hidden", !hasWoodCost);
        setText("CustomAbilityGoldCost", goldCost);
        setText("CustomAbilityWoodCost", woodCost);

        fields.RemoveAndDeleteChildren();
        if (upgradeMode || heroMode) {
            asArray(runtime.fields).forEach(function (field) {
                if (field) addField(fields, field.label, field.value);
            });
        }
        var unavailable = upgradeMode && runtime.available === 0;
        var lacksResources = upgradeMode && !unavailable && runtime.can_afford === 0;
        setText("CustomAbilityType", !upgradeMode ? ""
            : runtime.upgrade_in_progress === 1
            ? localize("Survival_UpgradeTooltip_InProgress", "UPGRADING")
            : (unavailable ? localize("Survival_UpgradeTooltip_Unavailable", "UNAVAILABLE")
                : (lacksResources
                    ? localize("Survival_UpgradeTooltip_ResourceLow", "RESOURCE LOW")
                    : localize("Survival_UpgradeTooltip_Available", "AVAILABLE"))));
        var statusText = upgradeMode && runtime.upgrade_in_progress === 1
            ? localize("Survival_UpgradeTooltip_InProgressDetail", "Upgrade completes in 1 second")
            : (lacksResources
                ? localize("Survival_UpgradeTooltip_ResourceLowDetail", "Not enough resources · server validates the final cost")
                : (upgradeMode ? runtime.status_text : ""));
        setText("CustomAbilityStatus", !upgradeMode ? "" : statusText
            || (unavailable ? "不可施法 · 前置条件未满足"
                : (lacksResources ? "当前资源不足 · 由服务器最终校验" : "可施法")));

        tooltip.SetHasClass(
            "Unavailable",
            unavailable
        );
        tooltip.SetHasClass("ResourceLow", lacksResources);
        acquireSelectiveTooltip(tooltip);
        tooltip.hittest = false;
        tooltip.hittestchildren = false;
        tooltipAnimationSerial += 1;
        var animateIn = tooltip.BHasClass("Hidden") || tooltip.BHasClass("FadingOut");
        if (animateIn) tooltip.AddClass("FadingOut");
        tooltip.RemoveClass("Hidden");
        if (animateIn) {
            var animationSerial = tooltipAnimationSerial;
            // Hidden and FadingOut establish a rendered alpha-zero start.
            // Waiting one frame prevents Panorama from coalescing the class
            // removal with visibility restoration and skipping the fade-in.
            $.Schedule(tooltipAnimationFrame, function () {
                if (animationSerial !== tooltipAnimationSerial
                    || String(tooltip.__survivalTooltipOwner || "")
                        !== selectiveTooltipOwner) return;
                tooltip.RemoveClass("FadingOut");
            });
        }
        $.Msg("[SURVIVAL_TOOLTIP_SHOW] phase=visible unit=", String(selectedUnit()),
            " ability=", String(abilityIndex),
            " source=", panelIdentity(sourcePanel),
            " hidden=", String(tooltip.BHasClass("Hidden")));

        $.Schedule(0.0, function () {
            if (activeAbilityIndex !== abilityIndex
                || activeSourcePanel !== sourcePanel) return;
            try {
                var positioner = GameUI.CustomUIConfig().SurvivalTooltipPosition;
                if (positioner) positioner.PlaceAbove(tooltip, sourcePanel, 337, 220);
                var tooltipState = proxyCursorState(tooltip);
                $.Msg("[SURVIVAL_TOOLTIP_SHOW] phase=positioned unit=", String(selectedUnit()),
                    " ability=", String(abilityIndex),
                    " hidden=", String(tooltip.BHasClass("Hidden")),
                    " cursor=", Math.round(tooltipState.cursorX), ",",
                    Math.round(tooltipState.cursorY),
                    " rect=", Math.round(tooltipState.left), ",",
                    Math.round(tooltipState.top), ",",
                    Math.round(tooltipState.width), ",",
                    Math.round(tooltipState.height));
            } catch (error) {
                tooltipError("position", error, sourcePanel);
            }
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
            && unitOwnsAbility(Number(runtime.owner_entindex), abilityIndex);
    }

    function selectedUnit() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (resolver && resolver.Resolve) return resolver.Resolve();
        return Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID());
    }

    function enumerateAbilitySlots(unit) {
        var entries = [];
        unit = Number(unit);
        if (!isFinite(unit) || unit < 0) return entries;
        for (var engineSlot = 0; engineSlot < maxAbilityEngineSlots; engineSlot++) {
            var abilityIndex = -1;
            try { abilityIndex = Number(Entities.GetAbility(unit, engineSlot)); } catch (error) {}
            if (!isFinite(abilityIndex) || abilityIndex < 0) continue;
            var abilityName = "";
            var hidden = false;
            try {
                abilityName = Abilities.GetAbilityName(abilityIndex) || "";
                hidden = !!Abilities.IsHidden(abilityIndex);
            } catch (error) {}
            entries.push({
                engineSlot: engineSlot,
                abilityIndex: abilityIndex,
                abilityName: abilityName,
                hidden: hidden
            });
        }
        return entries;
    }

    function visibleAbilityEntries() {
        return enumerateAbilitySlots(selectedUnit()).filter(function (entry) {
            return entry.abilityName && !entry.hidden
                && entry.abilityName.indexOf("special_bonus_") !== 0;
        });
    }

    function unitOwnsAbility(unit, abilityIndex) {
        return enumerateAbilitySlots(unit).some(function (entry) {
            return Number(entry.abilityIndex) === Number(abilityIndex);
        });
    }

    function engineSlotForAbility(unit, abilityIndex) {
        var matched = -1;
        enumerateAbilitySlots(unit).some(function (entry) {
            if (Number(entry.abilityIndex) !== Number(abilityIndex)) return false;
            matched = entry.engineSlot;
            return true;
        });
        return matched;
    }

    function abilityFromDisplayIndex(displayIndex) {
        var entry = visibleAbilityEntries()[displayIndex];
        return entry === undefined ? -1 : entry.abilityIndex;
    }

    function visibleAbilityIndexes() {
        return visibleAbilityEntries().map(function (entry) {
            return entry.abilityIndex;
        });
    }

    function localBuilderEntity() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (!resolver || !resolver.BuilderEntity) return -1;
        try { return Number(resolver.BuilderEntity()); } catch (error) { return -1; }
    }

    function localCombatHeroEntity() {
        var playerId = Game.GetLocalPlayerID();
        var identity = CustomNetTables.GetTableValue(
            "survival_hero_skills", "player_" + String(playerId)
        ) || {};
        var hero = Number(identity.unit_entindex);
        if (!isFinite(hero) || hero < 0) return -1;
        try { return Entities.IsValidEntity(hero) ? hero : -1; } catch (error) { return -1; }
    }

    function isSelectedCombatHero() {
        var unit = Number(selectedUnit());
        var hero = localCombatHeroEntity();
        return isFinite(unit) && unit >= 0 && hero >= 0 && unit === hero;
    }

    function isSelectedLocalBuilder() {
        var unit = Number(selectedUnit());
        if (!isFinite(unit) || unit < 0) return false;
        var builder = localBuilderEntity();
        if (isFinite(builder) && builder >= 0) return unit === builder;
        // The identity net table can arrive one HUD frame after the initial
        // Builder selection. Unit-name fallback keeps that first binding from
        // exposing Valve's Tooltip without broadening the rule to heroes.
        try {
            return Entities.GetUnitName(unit) === "npc_survival_builder_proxy";
        } catch (error) {
            return false;
        }
    }

    function runtimeOwnerMatchesSelectedUnit(runtime) {
        var unit = Number(selectedUnit());
        return !!runtime && isFinite(unit) && unit >= 0
            && Number(runtime.owner_entindex) === unit;
    }

    function runtimeOwnedBySelectedUnit(runtime, abilityIndex) {
        var unit = Number(selectedUnit());
        if (!runtimeOwnerMatchesSelectedUnit(runtime)) return false;
        return abilityIndex === undefined
            || unitOwnsAbility(unit, Number(abilityIndex));
    }

    function isSelectedRuntimeManagedUnit() {
        var entries = visibleAbilityEntries();
        return entries.some(function (entry) {
            var runtime = CustomNetTables.GetTableValue(
                "survival_ability_runtime", String(entry.abilityIndex)
            ) || {};
            return runtimeOwnedBySelectedUnit(runtime, entry.abilityIndex);
        });
    }

    function authorityAbilitySignature() {
        if (!isSelectedLocalBuilder() && !isSelectedCombatHero()
            && !isSelectedRuntimeManagedUnit()) return "";
        return visibleAbilitySignature();
    }

    function visibleAbilitySignature() {
        return visibleAbilityEntries().map(function (entry) {
            return String(entry.engineSlot) + ":"
                + String(entry.abilityIndex) + ":" + entry.abilityName;
        }).join("|");
    }

    function selectionSnapshot() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (resolver && resolver.Snapshot) {
            try { return resolver.Snapshot() || {}; } catch (error) {}
        }
        return { resolved: selectedUnit(), builder: localBuilderEntity() };
    }

    function selectedTooltipScope() {
        if (isSelectedLocalBuilder()) return "builder";
        if (isSelectedCombatHero()) return "combat_hero";
        if (isSelectedRuntimeManagedUnit()) return "runtime_unit";
        return "native_or_managed";
    }

    function logTooltipScope(reason) {
        var snapshot = selectionSnapshot();
        var unit = Number(selectedUnit());
        var unitName = "";
        try { unitName = Entities.GetUnitName(unit) || ""; } catch (error) {}
        var diagnostic = "reason=" + String(reason || "unknown")
            + " selected=" + String(snapshot.selected === undefined ? "" : snapshot.selected)
            + " portrait=" + String(snapshot.portrait === undefined ? -1 : snapshot.portrait)
            + " resolved=" + String(unit)
            + " resolved_name=" + unitName
            + " builder=" + String(localBuilderEntity())
            + " combat_hero=" + String(localCombatHeroEntity())
            + " scope=" + selectedTooltipScope()
            + " abilities=" + visibleAbilitySignature();
        if (diagnostic === scopeDiagnostic) return;
        scopeDiagnostic = diagnostic;
        $.Msg("[SURVIVAL_TOOLTIP_SCOPE] ", diagnostic);
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
            || abilityName === "ability_challenge_auto_summon"
            || abilityName === "ability_building_blink"
            || abilityName === "ability_destroy_arrow_tower"
            || abilityName === "ability_train_lumberjack"
            || abilityName === "ability_train_repairer"
            || abilityName === "ability_train_advanced_repairer";
    }

    function managedUpgrade(abilityIndex, abilityName) {
        if (!managedRuntime(abilityIndex)) return false;
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime", String(abilityIndex)
        ) || {};
        var ownerName = "";
        try {
            ownerName = Entities.GetUnitName(Number(runtime.owner_entindex)) || "";
        } catch (error) {}
        return isManagedBuildingAction(abilityName)
            || /^building_/.test(ownerName);
    }

    function isSelectedBuilderVisibleAbility(abilityIndex) {
        if (!isSelectedLocalBuilder()) return false;
        try {
            if (Abilities.IsHidden(abilityIndex)) return false;
        } catch (error) {}
        return unitOwnsAbility(Number(selectedUnit()), abilityIndex);
    }

    function isSelectedCombatHeroVisibleAbility(abilityIndex) {
        if (!isSelectedCombatHero()) return false;
        try {
            if (Abilities.IsHidden(abilityIndex)) return false;
        } catch (error) {}
        return unitOwnsAbility(Number(selectedUnit()), abilityIndex);
    }

    function customTooltipAbility(abilityIndex, abilityName) {
        return managedUpgrade(abilityIndex, abilityName)
            || isSelectedBuilderVisibleAbility(abilityIndex)
            || isSelectedCombatHeroVisibleAbility(abilityIndex);
    }

    function selectedEntindexesForRequest() {
        var raw = [];
        try {
            raw = Players.GetSelectedEntities(Players.GetLocalPlayer()) || [];
        } catch (error) {}
        var result = [];
        var seen = {};
        for (var index = 0; index < raw.length && result.length < 64; index += 1) {
            var entindex = Number(raw[index]);
            var key = String(entindex);
            if (entindex >= 0 && !seen[key]) {
                seen[key] = true;
                result.push(entindex);
            }
        }
        return result;
    }

    function executeAbility(abilityIndex) {
        if (abilityIndex === undefined || abilityIndex < 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] reject invalid ability=", String(abilityIndex));
            return false;
        }
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
        var unit = Number(runtime.owner_entindex);
        if (!unitOwnsAbility(unit, abilityIndex)) unit = selectedUnit();
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
        if (name === "ability_building_blink"
            || name === "ability_destroy_arrow_tower") {
            var tools = GameUI.CustomUIConfig().SurvivalArrowTowerTools;
            return !!(tools && tools.TriggerAbility
                && tools.TriggerAbility(name, unit));
        }
        if ((behavior & 16) !== 0) {
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_BEGIN unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
            var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput;
            if (pointInput && pointInput.Begin) {
                return pointInput.Begin(abilityIndex, unit);
            }
            $.Msg("[SURVIVAL_CAST][TOOLTIP] POINT_TARGET_NO_INPUT_HANDLER");
            return false;
        }
        $.Msg("[SURVIVAL_CAST][TOOLTIP] SEND_NO_TARGET unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_request", {
            entindex: unit,
            ability_entindex: abilityIndex,
            selected_entindexes: selectedEntindexesForRequest()
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
        if (abilityIndex === undefined || abilityIndex < 0) return false;
        var abilityName = Abilities.GetAbilityName(abilityIndex);
        if (!abilityName) return false;

        if (!customTooltipAbility(abilityIndex, abilityName)) {
            hideCustomTooltip();
            showNativeAbilityTooltip(sourcePanel, abilityName);
            return false;
        }

        activeAbilityIndex = abilityIndex;
        activeAbilityName = abilityName;
        activeSourcePanel = sourcePanel;
        hideNativeTooltip(sourcePanel);
        if (!render(abilityIndex, abilityName, sourcePanel)) {
            activeAbilityIndex = -1;
            activeAbilityName = "";
            activeSourcePanel = null;
            try {
                $.DispatchEvent("DOTAShowAbilityTooltip", sourcePanel, abilityName);
            } catch (error) {}
            return false;
        }
        return true;
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
            if (customTooltipAbility(abilityIndex, abilityName)) {
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

    function panelIdentity(panel) {
        if (!panel) return "<none>";
        return String(panel.id || panel.paneltype || "<anonymous>");
    }

    function insideOfficialAbilityTree(panel) {
        var current = panel;
        while (current) {
            if (/^Ability[0-9]+$/.test(String(current.id || ""))) return true;
            current = current.GetParent ? current.GetParent() : null;
        }
        return false;
    }

    function customHudProxyHost(root) {
        var tooltip = byId("CustomAbilityTooltip");
        if ((!tooltip || !tooltip.GetParent) && root && root.FindChildTraverse) {
            tooltip = root.FindChildTraverse("CustomAbilityTooltip");
        }
        var host = tooltip && tooltip.GetParent ? tooltip.GetParent() : null;
        if (!host || insideOfficialAbilityTree(host)) return null;
        return host;
    }

    function disableInactiveTakeoverLayer() {
        var layer = byId("SurvivalAbilityTakeoverLayer");
        if (!layer) return;
        layer.hittest = false;
        layer.hittestchildren = false;
    }

    function moveProxyLayerToFront(host, layer) {
        if (!host || !layer || !host.MoveChildAfter || !host.GetChildCount) return;
        var count = host.GetChildCount();
        if (count <= 0) return;
        var last = host.GetChild(count - 1);
        if (last && last !== layer) host.MoveChildAfter(layer, last);
    }

    function ensureExternalProxyLayer() {
        var root = hudRoot();
        if (!root) return null;
        var host = customHudProxyHost(root);
        if (!host) return null;
        var layer = externalProxyLayer;
        if (!layer || !layer.IsValid || !layer.IsValid()) {
            layer = byId("SurvivalManagedAbilityProxyLayer");
            // Recover a layer already moved out of this layout context.
            if (!layer && root.FindChildTraverse) {
                layer = root.FindChildTraverse("SurvivalManagedAbilityProxyLayer");
            }
        }
        if (!layer || !layer.GetParent || !layer.SetParent) return null;
        if (layer.GetParent() !== host) layer.SetParent(host);
        if (layer.GetParent() !== host || insideOfficialAbilityTree(layer)) return null;
        disableInactiveTakeoverLayer();
        externalProxyLayer = layer;
        layer.hittest = false;
        layer.hittestchildren = true;
        layer.style.width = "100%";
        layer.style.height = "100%";
        layer.style.position = "0px 0px 0px";
        layer.style.overflow = "noclip";
        layer.style.zIndex = "32767";
        layer.style.visibility = "visible";
        moveProxyLayerToFront(host, layer);
        var position = layer.GetPositionWithinWindow
            ? layer.GetPositionWithinWindow() : { x: 0, y: 0 };
        var diagnostic = "mode=custom_hud parent=" + panelIdentity(layer.GetParent())
            + " host=" + panelIdentity(host)
            + " root=" + panelIdentity(root)
            + " rect=" + Math.round(Number(position.x || 0)) + ","
            + Math.round(Number(position.y || 0)) + ","
            + Math.round(Number(layer.actuallayoutwidth || 0)) + ","
            + Math.round(Number(layer.actuallayoutheight || 0))
            + " scale=" + String(Number(layer.actualuiscale_x || 0))
            + "," + String(Number(layer.actualuiscale_y || 0))
            + " hittest=" + String(layer.hittest)
            + " children=" + String(layer.hittestchildren);
        if (diagnostic !== externalLayerDiagnostic) {
            externalLayerDiagnostic = diagnostic;
            $.Msg("[SURVIVAL_TOOLTIP_LAYER] ", diagnostic);
        }
        return layer;
    }

    function scheduleExternalGeometryDiagnostic(binding) {
        var expectedKey = binding.key;
        $.Schedule(0.0, function () {
            var proxy = binding.proxy;
            var anchor = binding.entry && binding.entry.anchor;
            if (!proxy || !anchor || !proxy.IsValid || !proxy.IsValid()
                || proxy.__survivalBindingKey !== expectedKey
                || !proxy.GetPositionWithinWindow || !anchor.GetPositionWithinWindow) return;
            var anchorPosition = anchor.GetPositionWithinWindow();
            var proxyPosition = proxy.GetPositionWithinWindow();
            var anchorRect = {
                x: Number(anchorPosition.x || 0),
                y: Number(anchorPosition.y || 0),
                width: Number(anchor.actuallayoutwidth || 0),
                height: Number(anchor.actuallayoutheight || 0)
            };
            var proxyRect = {
                x: Number(proxyPosition.x || 0),
                y: Number(proxyPosition.y || 0),
                width: Number(proxy.actuallayoutwidth || 0),
                height: Number(proxy.actuallayoutheight || 0)
            };
            var delta = {
                x: proxyRect.x - anchorRect.x,
                y: proxyRect.y - anchorRect.y,
                width: proxyRect.width - anchorRect.width,
                height: proxyRect.height - anchorRect.height
            };
            var tolerance = 1.5;
            var geometryMismatch = Math.abs(delta.x) > tolerance
                || Math.abs(delta.y) > tolerance
                || Math.abs(delta.width) > tolerance
                || Math.abs(delta.height) > tolerance;
            var diagnostic = "unit=" + String(selectedUnit())
                + " display=" + String(binding.displayIndex)
                + " engine_slot=" + String(binding.engineSlot)
                + " ability=" + String(binding.abilityIndex)
                + " status=" + (geometryMismatch ? "geometry_mismatch" : "aligned")
                + " anchor=" + Math.round(anchorRect.x) + ","
                + Math.round(anchorRect.y) + "," + Math.round(anchorRect.width)
                + "," + Math.round(anchorRect.height)
                + " proxy=" + Math.round(proxyRect.x) + ","
                + Math.round(proxyRect.y) + "," + Math.round(proxyRect.width)
                + "," + Math.round(proxyRect.height)
                + " delta=" + delta.x.toFixed(3) + "," + delta.y.toFixed(3)
                + "," + delta.width.toFixed(3) + "," + delta.height.toFixed(3)
                + " tolerance=" + tolerance.toFixed(1)
                + " type=" + String(proxy.paneltype || "unknown")
                + " parent=" + panelIdentity(proxy.GetParent ? proxy.GetParent() : null)
                + " visibility=" + panelStyle(proxy, "visibility")
                + " opacity=" + panelStyle(proxy, "opacity")
                + " hittest=" + String(proxy.hittest)
                + " children=" + String(proxy.hittestchildren);
            if (diagnostic === externalGeometryDiagnostics[binding.displayIndex]) return;
            externalGeometryDiagnostics[binding.displayIndex] = diagnostic;
            $.Msg("[SURVIVAL_TOOLTIP_HITBOX] ", diagnostic);
        });
    }

    function panelStyle(panel, name) {
        if (!panel || !panel.style) return "";
        try { return String(panel.style[name] || ""); } catch (error) { return ""; }
    }

    function officialAbilityAnchor(panel) {
        if (!panel || !panel.FindChildTraverse) return panel;
        return panel.FindChildTraverse("AbilityButton")
            || panel.FindChildTraverse("ButtonWell")
            || panel.FindChildTraverse("AbilityImage")
            || panel;
    }

    function collectOfficialAbilityPanels(abilities) {
        var result = [];
        var seen = [];
        if (!abilities || !abilities.FindChildTraverse) return result;
        for (var nodeIndex = 0; nodeIndex < maxAbilityEngineSlots; nodeIndex++) {
            var panel = abilities.FindChildTraverse("Ability" + String(nodeIndex));
            if (!panel || seen.indexOf(panel) >= 0) continue;
            seen.push(panel);
            if (panel.IsValid && !panel.IsValid()) continue;
            var anchor = officialAbilityAnchor(panel);
            if (!anchor || !anchor.GetPositionWithinWindow) continue;
            if (panel.visible === false || anchor.visible === false) continue;
            if (panelStyle(panel, "visibility") === "collapse"
                || panelStyle(anchor, "visibility") === "collapse") continue;
            var width = Number(anchor.actuallayoutwidth || 0);
            var height = Number(anchor.actuallayoutheight || 0);
            if (!isFinite(width) || !isFinite(height)
                || width <= 0 || height <= 0) continue;
            var position = anchor.GetPositionWithinWindow();
            result.push({
                panel: panel,
                anchor: anchor,
                nodeIndex: nodeIndex,
                x: Number(position.x || 0),
                y: Number(position.y || 0)
            });
        }
        result.sort(function (left, right) {
            var horizontal = Number(left.x) - Number(right.x);
            if (Math.abs(horizontal) > 0.5) return horizontal;
            var vertical = Number(left.y) - Number(right.y);
            if (Math.abs(vertical) > 0.5) return vertical;
            return Number(left.nodeIndex) - Number(right.nodeIndex);
        });
        return result;
    }

    function disableExternalProxies() {
        externalProxies.forEach(function (proxy) {
            if (!proxy || !proxy.IsValid || !proxy.IsValid()) return;
            proxy.__survivalAbilityIndex = -1;
            proxy.__survivalAbilityName = "";
            proxy.__survivalEngineSlot = -1;
            setExternalProxyHighlight(proxy, false);
            proxy.__survivalVisualAnchor = null;
            proxy.__survivalPointerInside = false;
            proxy.__survivalHoverSerial = Number(proxy.__survivalHoverSerial || 0) + 1;
            proxy.__survivalDisplayIndex = -1;
            proxy.hittest = false;
            proxy.hittestchildren = false;
            proxy.style.visibility = "collapse";
            proxy.__survivalBindingKey = "";
        });
    }

    function disableUnusedExternalProxies(usedProxies) {
        externalProxies.forEach(function (proxy) {
            if (!proxy || !proxy.IsValid || !proxy.IsValid()
                || usedProxies.indexOf(proxy) >= 0) return;
            proxy.__survivalAbilityIndex = -1;
            proxy.__survivalAbilityName = "";
            proxy.__survivalEngineSlot = -1;
            setExternalProxyHighlight(proxy, false);
            proxy.__survivalVisualAnchor = null;
            proxy.__survivalPointerInside = false;
            proxy.__survivalHoverSerial = Number(proxy.__survivalHoverSerial || 0) + 1;
            proxy.__survivalDisplayIndex = -1;
            proxy.__survivalBindingKey = "";
            proxy.hittest = false;
            proxy.hittestchildren = false;
            proxy.style.visibility = "collapse";
        });
    }

    function proxyCursorState(proxy) {
        var cursor = GameUI.GetCursorPosition();
        var position = proxy && proxy.GetPositionWithinWindow
            ? proxy.GetPositionWithinWindow() : { x: 0, y: 0 };
        var left = Number(position.x || 0);
        var top = Number(position.y || 0);
        // GetPositionWithinWindow(), GetCursorPosition(), and actuallayoutwidth/
        // height are already in window coordinates. Multiplying the actual
        // dimensions by actualuiscale again shrinks the hit rectangle twice.
        var width = Number(proxy && proxy.actuallayoutwidth || 0);
        var height = Number(proxy && proxy.actuallayoutheight || 0);
        var x = Number(cursor && cursor[0]);
        var y = Number(cursor && cursor[1]);
        var inside = isFinite(x) && isFinite(y) && width > 0 && height > 0
            && x >= left && x < left + width
            && y >= top && y < top + height;
        return {
            inside: inside,
            cursorX: x,
            cursorY: y,
            left: left,
            top: top,
            width: width,
            height: height
        };
    }

    function rectContainsCursor(panel) {
        return proxyCursorState(panel).inside;
    }

    function panelAncestorDiagnostic(panel) {
        var rows = [];
        var current = panel;
        for (var depth = 0; current && depth < 12; depth++) {
            var state = proxyCursorState(current);
            rows.push(panelIdentity(current)
                + ":inside=" + String(state.inside)
                + ",rect=" + Math.round(state.left) + "," + Math.round(state.top)
                + "," + Math.round(state.width) + "," + Math.round(state.height)
                + ",hit=" + String(current.hittest)
                + ",children=" + String(current.hittestchildren)
                + ",visible=" + panelStyle(current, "visibility"));
            current = current.GetParent ? current.GetParent() : null;
        }
        return rows.join("/");
    }

    function startBoundedCursorProbe(reason) {
        cursorProbeSerial += 1;
        var serial = cursorProbeSerial;
        var observationsRemaining = 200;
        cursorProbeDiagnostic = "";
        function observe() {
            if (serial !== cursorProbeSerial) return;
            var active = null;
            officialBindings.some(function (binding) {
                if (!binding || !binding.entry || !binding.entry.anchor) return false;
                if (!rectContainsCursor(binding.entry.anchor)) return false;
                active = binding;
                return true;
            });
            if (active) {
                var proxy = active.proxy;
                var pending = pendingHoverRestore;
                var restoreHover = pending
                    && Number(pending.unit) === Number(selectedUnit())
                    && Number(pending.displayIndex) === Number(active.displayIndex);
                if (restoreHover) {
                    pendingHoverRestore = null;
                    proxy.__survivalPointerInside = true;
                    setExternalProxyHighlight(activeSourcePanel, false);
                    var shown = false;
                    try {
                        shown = showSlot(-1, proxy);
                        setExternalProxyHighlight(proxy,
                            shown && activeSourcePanel === proxy);
                        if (shown && activeSourcePanel === proxy) {
                            startExternalHoverSession(proxy, active.abilityIndex);
                            $.Msg("[SURVIVAL_TOOLTIP_CURSOR] action=restore_hover reason=",
                                String(reason || "binding"), " unit=",
                                String(selectedUnit()), " display=",
                                String(active.displayIndex), " ability=",
                                String(active.abilityIndex), " name=",
                                active.abilityName);
                        }
                    } catch (error) {
                        tooltipError("cursor_restore_hover", error, proxy);
                        hideCustomTooltip();
                    }
                } else if (pending
                    && Number(pending.unit) === Number(selectedUnit())) {
                    pendingHoverRestore = null;
                }
                var runtime = CustomNetTables.GetTableValue(
                    "survival_ability_runtime", String(active.abilityIndex)
                ) || {};
                var definition = CustomNetTables.GetTableValue(
                    "survival_ability_data", active.abilityName
                ) || {};
                var diagnostic = "reason=" + String(reason || "binding")
                    + " unit=" + String(selectedUnit())
                    + " display=" + String(active.displayIndex)
                    + " engine_slot=" + String(active.engineSlot)
                    + " node=Ability" + String(active.entry.nodeIndex)
                    + " ability=" + String(active.abilityIndex)
                    + " name=" + active.abilityName
                    + " official_inside=true"
                    + " proxy_inside=" + String(rectContainsCursor(proxy))
                    + " proxy_event=" + String(!!(proxy && proxy.__survivalPointerInside))
                    + " definition=" + String(!!definition.abilityid)
                    + " runtime=" + String(Number(runtime.ability_entindex)
                        === Number(active.abilityIndex))
                    + " active=" + String(Number(activeAbilityIndex)
                        === Number(active.abilityIndex))
                    + " ancestors=" + panelAncestorDiagnostic(proxy);
                if (diagnostic !== cursorProbeDiagnostic) {
                    cursorProbeDiagnostic = diagnostic;
                    $.Msg("[SURVIVAL_TOOLTIP_CURSOR] ", diagnostic);
                }
            } else if (pendingHoverRestore
                && Number(pendingHoverRestore.unit) === Number(selectedUnit())) {
                var pendingBinding = null;
                officialBindings.some(function (binding) {
                    if (!binding || Number(binding.displayIndex)
                        !== Number(pendingHoverRestore.displayIndex)) return false;
                    pendingBinding = binding;
                    return true;
                });
                if (pendingBinding) pendingHoverRestore = null;
            }
            observationsRemaining -= 1;
            if (observationsRemaining > 0) $.Schedule(0.05, observe);
        }
        $.Schedule(0.0, observe);
    }

    function bindingDecision(entry, displayIndex, abilityIndex, abilityName,
            requested, prepared) {
        var unit = Number(selectedUnit());
        var engineSlot = engineSlotForAbility(unit, abilityIndex);
        var hidden = false;
        try { hidden = !!Abilities.IsHidden(abilityIndex); } catch (error) {}
        var definition = CustomNetTables.GetTableValue(
            "survival_ability_data", abilityName
        ) || {};
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips", definition.tooltip_id || ("ability:" + abilityName)
        ) || {};
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime", String(abilityIndex)
        ) || {};
        return "display=" + String(displayIndex)
            + ",engine_slot=" + String(engineSlot)
            + ",node=Ability" + String(entry.nodeIndex)
            + ",ability=" + String(abilityIndex)
            + ",name=" + abilityName
            + ",owned=" + String(unitOwnsAbility(unit, abilityIndex))
            + ",hidden=" + String(hidden)
            + ",definition=" + String(!!definition.abilityid)
            + ",tooltip=" + String(!!tooltipDefinition.tooltip_id)
            + ",runtime=" + String(Number(runtime.ability_entindex)
                === Number(abilityIndex))
            + ",runtime_owner=" + String(runtime.owner_entindex)
            + ",scope=" + selectedTooltipScope()
            + ",requested=" + String(requested)
            + ",prepared=" + String(prepared);
    }

    function externalOutDiagnostic(proxy, state, tooltipState, action) {
        $.Msg("[SURVIVAL_TOOLTIP_OUT] unit=", String(selectedUnit()),
            " display=", String(proxy.__survivalDisplayIndex),
            " engine_slot=", String(proxy.__survivalEngineSlot),
            " ability=", String(proxy.__survivalAbilityIndex),
            " inside=", String(state.inside),
            " tooltip_inside=", String(tooltipState.inside),
            " action=", action,
            " cursor=", Math.round(state.cursorX), ",", Math.round(state.cursorY),
            " rect=", Math.round(state.left), ",", Math.round(state.top), ",",
            Math.round(state.width), ",", Math.round(state.height),
            " tooltip_rect=", Math.round(tooltipState.left), ",",
            Math.round(tooltipState.top), ",",
            Math.round(tooltipState.width), ",",
            Math.round(tooltipState.height));
    }

    function startExternalHoverSession(proxy, abilityIndex) {
        externalHoverExitSerial += 1;
        var serial = externalHoverExitSerial;
        var lastState = "";
        function verify() {
            if (serial !== externalHoverExitSerial
                || activeSourcePanel !== proxy
                || Number(activeAbilityIndex) !== Number(abilityIndex)) return;
            var tooltip = byId("CustomAbilityTooltip");
            var state = proxyCursorState(proxy);
            var tooltipState = proxyCursorState(tooltip);
            var tooltipVisible = !!(tooltip && !tooltip.BHasClass("Hidden"));
            var sourceInside = !!state.inside;
            var tooltipInside = tooltipVisible && !!tooltipState.inside;
            var sessionState = sourceInside ? "proxy" : "outside";
            if (sessionState !== lastState) {
                lastState = sessionState;
                $.Msg("[SURVIVAL_TOOLTIP_SESSION] unit=", String(selectedUnit()),
                    " display=", String(proxy.__survivalDisplayIndex),
                    " engine_slot=", String(proxy.__survivalEngineSlot),
                    " ability=", String(abilityIndex),
                    " state=", sessionState,
                    " tooltip_hidden=", String(!tooltipVisible),
                    " cursor=", Math.round(state.cursorX), ",",
                    Math.round(state.cursorY),
                    " proxy_inside=", String(sourceInside),
                    " tooltip_inside=", String(tooltipInside));
            }
            if (!tooltipVisible) {
                externalOutDiagnostic(proxy, state, tooltipState,
                    "session_hidden:event_hide");
                hideCustomTooltip();
                hideNativeTooltip(proxy);
                return;
            }
            if (sourceInside) {
                $.Schedule(0.05, verify);
                return;
            }
            externalOutDiagnostic(proxy, state, tooltipState,
                "session_outside:event_hide");
            hideCustomTooltip();
            hideNativeTooltip(proxy);
        }
        $.Schedule(0.05, verify);
    }

    function observeExternalHoverOut(proxy, abilityIndex, reason) {
        if (!proxy || activeSourcePanel !== proxy
            || Number(activeAbilityIndex) !== Number(abilityIndex)) return;
        var tooltip = byId("CustomAbilityTooltip");
        externalOutDiagnostic(proxy, proxyCursorState(proxy),
            proxyCursorState(tooltip), reason + ":event_hide");
        hideCustomTooltip();
        hideNativeTooltip(proxy);
    }

    function ensureExternalProxy(displayIndex) {
        var proxy = externalProxies[displayIndex];
        if (proxy && proxy.IsValid && proxy.IsValid()) return proxy;
        var layer = ensureExternalProxyLayer();
        if (!layer) return null;
        proxy = $.CreatePanel(
            "Button",
            layer,
            "SurvivalManagedAbilityProxy" + String(displayIndex)
        );
        proxy.AddClass("SurvivalManagedAbilityProxy");
        proxy.style.opacity = "0.01";
        proxy.style.backgroundColor = "#00000000";
        proxy.style.border = "0px solid #00000000";
        proxy.hittest = false;
        proxy.hittestchildren = false;
        proxy.__survivalPointerInside = false;
        proxy.__survivalHoverSerial = 0;
        proxy.__survivalHighlightTarget = null;
        proxy.__survivalHighlightBrightness = "";
        proxy.__survivalHighlightSaturation = "";
        proxy.__survivalEngineSlot = -1;
        proxy.style.visibility = "collapse";
        proxy.SetPanelEvent("onmouseover", function () {
            proxy.__survivalPointerInside = true;
            proxy.__survivalHoverSerial = Number(proxy.__survivalHoverSerial || 0) + 1;
            externalHoverExitSerial += 1;
            var boundAbility = Number(proxy.__survivalAbilityIndex);
            var abilityName = String(proxy.__survivalAbilityName || "");
            if (!isFinite(boundAbility) || boundAbility < 0
                || !customTooltipAbility(boundAbility, abilityName)) return;
            var hover = "unit=" + String(selectedUnit())
                + " display=" + String(proxy.__survivalDisplayIndex)
                + " engine_slot=" + String(proxy.__survivalEngineSlot)
                + " ability=" + String(boundAbility)
                + " name=" + abilityName
                + " source=external_proxy";
            if (hover !== externalHoverDiagnostic) {
                externalHoverDiagnostic = hover;
                $.Msg("[SURVIVAL_TOOLTIP_HOVER] ", hover);
            }
            try {
                setExternalProxyHighlight(activeSourcePanel, false);
                var shown = showSlot(-1, proxy);
                setExternalProxyHighlight(proxy, shown && activeSourcePanel === proxy);
                if (shown && activeSourcePanel === proxy) {
                    startExternalHoverSession(proxy, boundAbility);
                }
            } catch (error) {
                tooltipError("proxy_mouseover", error, proxy);
                hideCustomTooltip();
                showNativeAbilityTooltip(proxy, abilityName);
            }
        });
        proxy.SetPanelEvent("onmouseout", function () {
            var boundAbility = Number(proxy.__survivalAbilityIndex);
            proxy.__survivalPointerInside = false;
            proxy.__survivalHoverSerial = Number(proxy.__survivalHoverSerial || 0) + 1;
            observeExternalHoverOut(proxy, boundAbility, "proxy_out");
        });
        proxy.SetPanelEvent("onactivate", function () {
            var boundAbility = Number(proxy.__survivalAbilityIndex);
            var abilityName = String(proxy.__survivalAbilityName || "");
            if (!isFinite(boundAbility) || boundAbility < 0
                || !customTooltipAbility(boundAbility, abilityName)) return;
            if (!managedUpgrade(boundAbility, abilityName)) {
                $.Msg("[SURVIVAL_CAST][CLIENT] EXTERNAL_PROXY_ENGINE display_slot=",
                    String(proxy.__survivalDisplayIndex), " engine_slot=",
                    String(proxy.__survivalEngineSlot), " ability=", String(boundAbility),
                    " name=", abilityName, " unit=", String(selectedUnit()));
                try {
                    Abilities.ExecuteAbility(boundAbility, selectedUnit(), false);
                } catch (error) {
                    tooltipError("proxy_engine_activate", error, proxy);
                }
                return;
            }
            var runtime = CustomNetTables.GetTableValue(
                "survival_ability_runtime",
                String(boundAbility)
            ) || {};
            $.Msg("[SURVIVAL_CAST][CLIENT] EXTERNAL_PROXY display_slot=",
                String(proxy.__survivalDisplayIndex), " engine_slot=",
                String(proxy.__survivalEngineSlot), " ability=", String(boundAbility),
                " name=", abilityName, " available=",
                String(runtime.available), " can_afford=",
                String(runtime.can_afford), " resource_version=",
                String(runtime.resource_version || 0));
            var input = GameUI.CustomUIConfig().SurvivalAbilityInput;
            if (input && input.ExecuteAbility) input.ExecuteAbility(boundAbility);
        });
        externalProxies[displayIndex] = proxy;
        return proxy;
    }

    function prepareExternalAbility(entry, displayIndex, abilityIndex, abilityName) {
        var layer = ensureExternalProxyLayer();
        var proxy = ensureExternalProxy(displayIndex);
        var anchor = entry && entry.anchor;
        var engineSlot = engineSlotForAbility(selectedUnit(), abilityIndex);
        if (!layer || !proxy || !anchor
            || !layer.GetPositionWithinWindow || !anchor.GetPositionWithinWindow) {
            $.Msg("[SURVIVAL_TOOLTIP_GEOMETRY] status=prepare_failed stage=dependencies",
                " unit=", String(selectedUnit()), " display=", String(displayIndex),
                " engine_slot=", String(engineSlot),
                " ability=", String(abilityIndex), " name=", String(abilityName),
                " layer=", String(!!layer), " proxy=", String(!!proxy),
                " anchor=", panelIdentity(anchor));
            return null;
        }
        if (!customTooltipAbility(abilityIndex, abilityName)) {
            $.Msg("[SURVIVAL_TOOLTIP_GEOMETRY] status=prepare_failed stage=scope",
                " unit=", String(selectedUnit()), " display=", String(displayIndex),
                " engine_slot=", String(engineSlot),
                " ability=", String(abilityIndex), " name=", String(abilityName),
                " scope=", selectedTooltipScope());
            return null;
        }
        var layerPosition = layer.GetPositionWithinWindow();
        var anchorPosition = anchor.GetPositionWithinWindow();
        var positionLimit = 1000000;
        if (!layerPosition || !anchorPosition
            || !isFinite(Number(layerPosition.x)) || !isFinite(Number(layerPosition.y))
            || !isFinite(Number(anchorPosition.x)) || !isFinite(Number(anchorPosition.y))
            || Math.abs(Number(layerPosition.x)) > positionLimit
            || Math.abs(Number(layerPosition.y)) > positionLimit
            || Math.abs(Number(anchorPosition.x)) > positionLimit
            || Math.abs(Number(anchorPosition.y)) > positionLimit) {
            $.Msg("[SURVIVAL_TOOLTIP_GEOMETRY] status=prepare_failed stage=position",
                " unit=", String(selectedUnit()), " display=", String(displayIndex),
                " engine_slot=", String(engineSlot),
                " ability=", String(abilityIndex), " name=", String(abilityName));
            return null;
        }
        var scaleX = Math.max(0.001, Number(layer.actualuiscale_x || 1));
        var scaleY = Math.max(0.001, Number(layer.actualuiscale_y || 1));
        var width = Number(anchor.actuallayoutwidth || 0) / scaleX;
        var height = Number(anchor.actuallayoutheight || 0) / scaleY;
        var x = (Number(anchorPosition.x || 0)
            - Number(layerPosition.x || 0)) / scaleX;
        var y = (Number(anchorPosition.y || 0)
            - Number(layerPosition.y || 0)) / scaleY;
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)
            || width <= 0 || height <= 0) {
            $.Msg("[SURVIVAL_TOOLTIP_GEOMETRY] status=prepare_failed stage=rect",
                " unit=", String(selectedUnit()), " display=", String(displayIndex),
                " engine_slot=", String(engineSlot),
                " ability=", String(abilityIndex), " name=", String(abilityName),
                " rect=", String(x), ",", String(y), ",",
                String(width), ",", String(height));
            return null;
        }
        var position = Math.round(x * 1000) / 1000 + "px "
            + Math.round(y * 1000) / 1000 + "px 0px";
        var proxyWidth = Math.round(width * 1000) / 1000 + "px";
        var proxyHeight = Math.round(height * 1000) / 1000 + "px";
        return {
            entry: entry,
            proxy: proxy,
            displayIndex: displayIndex,
            engineSlot: engineSlot,
            abilityIndex: abilityIndex,
            abilityName: abilityName,
            x: x,
            y: y,
            width: width,
            height: height,
            position: position,
            proxyWidth: proxyWidth,
            proxyHeight: proxyHeight,
            key: String(engineSlot) + "|" + String(abilityIndex) + "|" + abilityName + "|"
                + String(displayIndex) + "|" + position + "|"
                + proxyWidth + "|" + proxyHeight
        };
    }

    function commitExternalAbility(binding) {
        var proxy = binding.proxy;
        if (proxy.__survivalVisualAnchor !== binding.entry.anchor) {
            setExternalProxyHighlight(proxy, false);
            proxy.__survivalVisualAnchor = binding.entry.anchor;
        }
        // Reacquire AbilityImage even when Valve preserves AbilityButton but
        // replaces its visual child during a HUD refresh.
        setExternalProxyHighlight(proxy, activeSourcePanel === proxy);
        if (proxy.__survivalBindingKey !== binding.key) {
            proxy.__survivalAbilityIndex = binding.abilityIndex;
            proxy.__survivalAbilityName = binding.abilityName;
            proxy.__survivalDisplayIndex = binding.displayIndex;
            proxy.__survivalEngineSlot = binding.engineSlot;
            proxy.style.position = binding.position;
            proxy.style.width = binding.proxyWidth;
            proxy.style.height = binding.proxyHeight;
            proxy.hittest = true;
            proxy.hittestchildren = false;
            proxy.style.visibility = "visible";
            proxy.__survivalBindingKey = binding.key;
            scheduleExternalGeometryDiagnostic(binding);
        }
        var proxyPosition = proxy.GetPositionWithinWindow
            ? proxy.GetPositionWithinWindow() : { x: 0, y: 0 };
        return "Ability" + String(binding.entry.nodeIndex) + "->" + binding.abilityName
            + " engine_slot=" + String(binding.engineSlot)
            + " anchor=" + String(binding.entry.anchor.id || "unknown")
            + " rect=" + Math.round(binding.x) + "," + Math.round(binding.y)
            + "," + Math.round(binding.width) + "," + Math.round(binding.height)
            + " actual=" + Math.round(Number(proxyPosition.x || 0)) + ","
            + Math.round(Number(proxyPosition.y || 0)) + ","
            + Math.round(Number(proxy.actuallayoutwidth || 0)) + ","
            + Math.round(Number(proxy.actuallayoutheight || 0))
            + " parent=" + panelIdentity(proxy.GetParent ? proxy.GetParent() : null);
    }

    function bindOfficialAbilities() {
        var root = hudRoot();
        if (!root || !root.FindChildTraverse) {
            disableExternalProxies();
            return;
        }
        var abilities = root.FindChildTraverse("abilities")
            || root.FindChildTraverse("AbilitiesAndStatBranch");
        if (!abilities || !abilities.FindChildTraverse) {
            disableExternalProxies();
            return;
        }
        // Prepare every external proxy before changing the active set. Stable
        // recovery checks must not collapse a hovered proxy and synthesize a
        // mouseout merely to recommit identical geometry.
        // Never attach, hide, or change hit testing inside Valve's AbilityN tree.
        var officialPanels = collectOfficialAbilityPanels(abilities);
        var abilityIndexes = visibleAbilityIndexes();
        var builderScope = isSelectedLocalBuilder();
        var heroScope = isSelectedCombatHero();
        var fullScope = builderScope || heroScope;
        var mappingUnavailable = officialPanels.length < abilityIndexes.length
            || (!fullScope && officialPanels.length !== abilityIndexes.length);
        if (mappingUnavailable) {
            officialBindings = [];
            cursorProbeSerial += 1;
            disableExternalProxies();
            var mismatch = "unit=" + String(selectedUnit())
                + " mode=fallback abilities=" + String(abilityIndexes.length)
                + " panels=" + String(officialPanels.length)
                + " builder=" + String(builderScope)
                + " combat_hero=" + String(heroScope);
            if (mismatch !== officialMapDiagnostic) {
                officialMapDiagnostic = mismatch;
                $.Msg("[SURVIVAL_TOOLTIP_MAP] ", mismatch);
            }
            var proxyFallback = "unit=" + String(selectedUnit())
                + " mode=fallback_mapping managed=0";
            if (proxyFallback !== externalProxyDiagnostic) {
                externalProxyDiagnostic = proxyFallback;
                $.Msg("[SURVIVAL_TOOLTIP_PROXY] ", proxyFallback);
            }
            return;
        }
        if (fullScope && officialPanels.length > abilityIndexes.length) {
            officialPanels = officialPanels.slice(0, abilityIndexes.length);
        }
        var mapping = [];
        var proxyMapping = [];
        var preparedBindings = [];
        var decisions = [];
        var proxyFailed = false;
        officialPanels.forEach(function (entry, displayIndex) {
            var abilityIndex = abilityIndexes[displayIndex];
            var abilityName = "";
            try { abilityName = Abilities.GetAbilityName(abilityIndex) || ""; } catch (error) {}
            var engineSlot = engineSlotForAbility(selectedUnit(), abilityIndex);
            mapping.push("Ability" + String(entry.nodeIndex) + "->" + abilityName
                + " engine_slot=" + String(engineSlot)
                + " ability=" + String(abilityIndex));
            var requested = customTooltipAbility(abilityIndex, abilityName);
            var prepared = null;
            if (requested) {
                prepared = prepareExternalAbility(
                    entry, displayIndex, abilityIndex, abilityName
                );
                if (prepared) preparedBindings.push(prepared);
                else proxyFailed = true;
            }
            decisions.push(bindingDecision(
                entry, displayIndex, abilityIndex, abilityName,
                requested, !!prepared
            ));
        });
        if (proxyFailed) {
            disableExternalProxies();
            preparedBindings = [];
            officialBindings = [];
        } else {
            preparedBindings.forEach(function (binding) {
                proxyMapping.push(commitExternalAbility(binding));
            });
            disableUnusedExternalProxies(preparedBindings.map(function (binding) {
                return binding.proxy;
            }));
            officialBindings = preparedBindings;
        }
        var decisionSignature = "unit=" + String(selectedUnit())
            + " commit=" + (proxyFailed ? "atomic_fallback" : "external")
            + " " + decisions.join("|");
        var bindingChanged = decisionSignature !== bindingDecisionDiagnostic;
        if (bindingChanged) {
            bindingDecisionDiagnostic = decisionSignature;
            $.Msg("[SURVIVAL_TOOLTIP_BIND] ", decisionSignature);
        }
        var mapped = "unit=" + String(selectedUnit())
            + " scope=" + selectedTooltipScope()
            + " mode=mapped " + mapping.join("|");
        if (mapped !== officialMapDiagnostic) {
            officialMapDiagnostic = mapped;
            $.Msg("[SURVIVAL_TOOLTIP_MAP] ", mapped);
        }
        var proxyMode = proxyFailed ? "fallback_geometry" : "external";
        var proxyMapped = "unit=" + String(selectedUnit())
            + " mode=" + proxyMode
            + " managed=" + String(proxyMapping.length)
            + (proxyMapping.length > 0 ? " " + proxyMapping.join("|") : "");
        if (proxyMapped !== externalProxyDiagnostic) {
            externalProxyDiagnostic = proxyMapped;
            $.Msg("[SURVIVAL_TOOLTIP_PROXY] ", proxyMapped);
        }
        if (bindingChanged && !proxyFailed && preparedBindings.length > 0) {
            startBoundedCursorProbe("mapped");
        }
    }

    function handleSelectedUnitChange(unit, reason) {
        if (Number(unit) === Number(observedSelectedUnit)) return false;
        observedSelectedUnit = Number(unit);
        selectionObservationSerial += 1;
        bindingRecoverySerial += 1;
        pendingHoverRestore = null;
        hideAllTooltips(activeSourcePanel);
        officialMapDiagnostic = "";
        externalProxyDiagnostic = "";
        externalHoverDiagnostic = "";
        observedAuthorityAbilitySignature = authorityAbilitySignature();
        disableExternalProxies();
        logTooltipScope(reason || "selected_unit_changed");
        scheduleBindingRecovery(reason || "selected_unit_changed");
        return true;
    }

    function refreshBindings(reason) {
        var unit = selectedUnit();
        if (handleSelectedUnitChange(unit, reason || "binding_refresh")) return;
        scan($("#SurvivalHeroAbilitySlots"));
        bindOfficialAbilities();
    }

    function refreshVisible(reason) {
        if (activeAbilityIndex >= 0 && activeAbilityName && activeSourcePanel) {
            render(activeAbilityIndex, activeAbilityName, activeSourcePanel);
        }
    }

    function scheduleBindingRecovery(reason) {
        bindingRecoverySerial += 1;
        var serial = bindingRecoverySerial;
        var authorityScope = isSelectedLocalBuilder() || isSelectedCombatHero()
            || isSelectedRuntimeManagedUnit();
        var delays = reason === "startup"
            ? [0.0, 0.10, 0.35, 1.0]
            : (authorityScope
                ? [0.0, 0.016, 0.05, 0.10, 0.20, 0.35, 0.60, 1.0]
                : [0.0, 0.016, 0.05, 0.10, 0.20]);
        var recoveryKey = "reason=" + String(reason || "recovery")
            + " unit=" + String(selectedUnit())
            + " scope=" + selectedTooltipScope();
        if (recoveryKey !== recoveryDiagnostic) {
            recoveryDiagnostic = recoveryKey;
            $.Msg("[SURVIVAL_TOOLTIP_RECOVERY] action=schedule ", recoveryKey,
                " serial=", String(serial));
        }
        delays.forEach(function (delay) {
            $.Schedule(delay, function () {
                if (serial !== bindingRecoverySerial) return;
                try {
                    var root = hudRoot();
                    var abilities = root && root.FindChildTraverse
                        ? (root.FindChildTraverse("abilities")
                            || root.FindChildTraverse("AbilitiesAndStatBranch")) : null;
                    var panels = collectOfficialAbilityPanels(abilities);
                    $.Msg("[SURVIVAL_TOOLTIP_RECOVERY] action=attempt reason=",
                        String(reason || "recovery"), " serial=", String(serial),
                        " delay=", Number(delay).toFixed(3),
                        " unit=", String(selectedUnit()),
                        " scope=", selectedTooltipScope(),
                        " abilities=", String(visibleAbilityIndexes().length),
                        " panels=", String(panels.length),
                        " signature=", visibleAbilitySignature());
                    refreshBindings(reason || "recovery");
                } catch (error) {
                    tooltipError("binding_recovery:" + String(reason || "recovery"),
                        error, activeSourcePanel);
                }
            });
        });
    }

    function localSelectionEvent(payload) {
        if (!payload) return true;
        var eventPlayer = payload.PlayerID;
        if (eventPlayer === undefined) eventPlayer = payload.player_id;
        if (eventPlayer === undefined) eventPlayer = payload.playerid;
        return eventPlayer === undefined
            || Number(eventPlayer) === Number(Game.GetLocalPlayerID());
    }

    function onSelectionEvent(reason, payload) {
        if (!localSelectionEvent(payload)) return;
        selectionObservationSerial += 1;
        var serial = selectionObservationSerial;
        [0.0, 0.016, 0.05, 0.10, 0.20, 0.35, 0.60, 1.0].forEach(function (delay) {
            $.Schedule(delay, function () {
                if (serial !== selectionObservationSerial) return;
                if (handleSelectedUnitChange(selectedUnit(), reason)) return;
                if (!recoverChangedAuthorityAbilities()) {
                    refreshBindings(reason + "_same_unit");
                }
            });
        });
    }

    function forceAuthorityRecovery(reason) {
        pendingHoverRestore = null;
        hideAllTooltips(activeSourcePanel);
        officialMapDiagnostic = "";
        externalProxyDiagnostic = "";
        externalHoverDiagnostic = "";
        disableExternalProxies();
        observedSelectedUnit = Number(selectedUnit());
        observedAuthorityAbilitySignature = authorityAbilitySignature();
        logTooltipScope(reason);
        scheduleBindingRecovery(reason);
    }

    function recoverChangedAuthorityAbilities() {
        var signature = authorityAbilitySignature();
        if (signature === observedAuthorityAbilitySignature) return false;
        var previous = observedAuthorityAbilitySignature;
        observedAuthorityAbilitySignature = signature;
        var hoveredProxy = activeSourcePanel;
        var hoveredDisplayIndex = Number(
            hoveredProxy && hoveredProxy.__survivalDisplayIndex
        );
        pendingHoverRestore = hoveredProxy && activeAbilityIndex >= 0
            && isFinite(hoveredDisplayIndex) && hoveredDisplayIndex >= 0
            && rectContainsCursor(hoveredProxy)
            ? { unit: Number(selectedUnit()), displayIndex: hoveredDisplayIndex }
            : null;
        hideAllTooltips(activeSourcePanel);
        officialMapDiagnostic = "";
        externalProxyDiagnostic = "";
        externalHoverDiagnostic = "";
        disableExternalProxies();
        $.Msg("[SURVIVAL_TOOLTIP_RECOVERY] action=signature_changed unit=",
            String(selectedUnit()), " scope=", selectedTooltipScope(),
            " previous=", previous, " current=", signature);
        scheduleBindingRecovery("authority_abilities_changed");
        return true;
    }

    function observeAuthorityRuntimeEvent() {
        var runtime = authorityRuntimeEventData || CustomNetTables.GetTableValue(
            "survival_ability_runtime", String(authorityRuntimeEventKey)
        ) || {};
        if (!runtimeOwnerMatchesSelectedUnit(runtime)) return;
        authorityRuntimeObservationSerial += 1;
        var serial = authorityRuntimeObservationSerial;
        [0.0, 0.016, 0.05, 0.10, 0.20, 0.35, 0.60, 1.0].forEach(function (delay) {
            $.Schedule(delay, function () {
                if (serial !== authorityRuntimeObservationSerial) return;
                recoverChangedAuthorityAbilities();
            });
        });
    }

    CustomNetTables.SubscribeNetTableListener(
        "survival_ability_runtime",
        function (name, key, data) {
            authorityRuntimeEventKey = key;
            authorityRuntimeEventData = data || null;
            observeAuthorityRuntimeEvent();
            if (Number(key) === Number(activeAbilityIndex)) {
                refreshVisible("ability_runtime");
            }
        }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_builder_identity",
        function (name, key) {
            if (key === "player_" + String(Game.GetLocalPlayerID())) {
                forceAuthorityRecovery("builder_identity");
            }
        }
    );
    CustomNetTables.SubscribeNetTableListener(
        "survival_hero_skills",
        function (name, key) {
            if (key === "player_" + String(Game.GetLocalPlayerID())) {
                forceAuthorityRecovery("combat_hero_identity");
            }
        }
    );
    GameUI.CustomUIConfig().SurvivalTooltipBindings = {
        Recover: scheduleBindingRecovery,
        RefreshVisible: refreshVisible
    };
    registerTooltipFadeDebug();
    observedSelectedUnit = Number(selectedUnit());
    observedAuthorityAbilitySignature = authorityAbilitySignature();
    disableInactiveTakeoverLayer();
    GameEvents.Subscribe("dota_player_update_selected_unit", function (payload) {
        onSelectionEvent("selected_unit_event", payload);
    });
    GameEvents.Subscribe("dota_player_update_query_unit", function (payload) {
        onSelectionEvent("query_unit_event", payload);
    });
    GameEvents.Subscribe("survival_select_unit", function (payload) {
        if (!localSelectionEvent(payload)) return;
        forceAuthorityRecovery("project_select_unit");
    });
    logTooltipScope("startup");
    scheduleBindingRecovery("startup");
})();
