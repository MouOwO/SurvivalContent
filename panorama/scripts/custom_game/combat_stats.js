(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_combat_stats";
    var tableKey = "player_" + playerId;
    var debugTableName = "survival_combat_debug";
    var lastRequestedUnit = -1;
    var selectedUnitSnapshot = null;
    var officialAttackText = "";
    var officialAttackUnit = -1;
    var authoritativeAttackLabel = null;
    var authoritativeAttackSpeedLabel = null;
    var authoritativeArmorLabel = null;
    var officialAttackSpeedText = "";
    var officialArmorText = "";
    var logicalAttributeOverlay = null;
    var officialHudCache = {};
    var officialUnitNameOverlay = null;
    var cosmeticPortraitOverlay = null;
    var cosmeticPortraitSignature = "";
    var unitNameTransitionSerial = 0;
    var unitNameRetryDelays = [0.0, 0.016, 0.05, 0.10, 0.20];
    var observedSelectedUnit = -1;
    var configuredUnitNames = {
        "building_main_city": "主城",
        "building_wall": "城墙",
        "building_arrow_tower": "箭塔",
        "building_gold_mine": "金矿",
        "building_hero_altar": "英雄祭坛",
        "enemy_tree": "树",
        "npc_dota_hero_undying": "建造者"
    };
    var heroPanelState = {
        unit: -1,
        unitName: "",
        displayName: "",
        level: null,
        healthText: "",
        manaText: "",
        healthWidth: "",
        manaWidth: ""
    };
    var portraitCache = {};
    var portraitCacheSerial = 0;
    var portraitPrewarmQueue = [
        "building_main_city",
        "building_wall",
        "building_arrow_tower",
        "building_farm",
        "building_gold_mine",
        "building_research_lab",
        "building_advanced_research_lab",
        "building_hero_altar",
    ];
    var portraitPrewarmIndex = 0;
    var portraitPrewarmRunning = false;
    var portraitPrewarmComplete = false;
    var lastHotkeyCastTime = {};
    var lastReturnHomeTime = -100;
    var towerRuntimeTrace = {};

    function panel(id) { return $("#" + id); }
    function setText(id, value) {
        var target = panel(id);
        if (!target) return;
        var next = String(value === undefined ? "" : value);
        if (target.text !== next) target.text = next;
    }

    function setWidth(target, value) {
        if (target && target.style.width !== value) target.style.width = value;
    }

    function isNativeHero(unitName) {
        return /^npc_dota_hero_/.test(String(unitName || ""));
    }

    function localizedText(token) {
        var localized = $.Localize(token);
        return localized && localized !== token ? localized : "";
    }

    function isInternalUnitName(value, unitName) {
        var name = String(value || "").replace(/^#/, "");
        return !name
            || name === String(unitName || "")
            || /^(npc_|building_|enemy_|zombie_)/.test(name);
    }

    function resolveUnitDisplayName(unitName, snapshotName) {
        var configured = configuredUnitNames[unitName];
        if (snapshotName && !isInternalUnitName(snapshotName, unitName)) {
            return String(snapshotName).replace(/^#/, "");
        }
        return configured
            || localizedText("#npc_dota_unit_" + unitName)
            || localizedText("#" + unitName)
            || String(unitName || "单位")
                .replace(/^(npc_dota_unit_|npc_dota_|npc_survival_|building_|enemy_)/, "")
                .replace(/_/g, " ");
    }

    function copyPanelClasses(source, target) {
        if (!source || !target || !source.GetClasses) return;
        var classes = source.GetClasses();
        if (typeof classes === "string") classes = classes.split(/\s+/);
        (classes || []).forEach(function (className) {
            if (className) target.AddClass(className);
        });
    }

    function ensureOfficialUnitNameOverlay() {
        var root = officialHudRoot();
        var container = root && root.FindChildTraverse
            ? root.FindChildTraverse("unitname") : null;
        if (!container || !container.FindChildTraverse) return null;
        var nativeLabel = container.FindChildTraverse("UnitNameLabel");
        if (nativeLabel) {
            nativeLabel.style.opacity = "0";
            nativeLabel.hittest = false;
            nativeLabel.hittestchildren = false;
        }
        var overlay = container.FindChildTraverse("SurvivalUnitNameLabel");
        if (!overlay) {
            overlay = $.CreatePanel("Label", container, "SurvivalUnitNameLabel");
            copyPanelClasses(nativeLabel, overlay);
            overlay.hittest = false;
            overlay.hittestchildren = false;
            overlay.style.ignoreParentFlow = true;
            overlay.style.width = "100%";
            overlay.style.height = "100%";
            overlay.style.position = "0px 0px 0px";
            overlay.style.horizontalAlign = "center";
            overlay.style.verticalAlign = "center";
            overlay.style.textAlign = "center";
            overlay.style.opacity = "1";
            overlay.style.zIndex = "1000";
        }
        officialUnitNameOverlay = overlay;
        return overlay;
    }

    function setOfficialUnitName(text, visible) {
        var overlay = ensureOfficialUnitNameOverlay();
        if (!overlay) return false;
        if (text !== undefined && overlay.text !== String(text)) overlay.text = String(text);
        overlay.style.visibility = visible ? "visible" : "collapse";
        return true;
    }

    function isHeroUnit(unit, unitName) {
        try {
            if (Entities.IsHero) return !!Entities.IsHero(unit);
        } catch (error) {}
        return isNativeHero(unitName);
    }

    function officialHudRoot() {
        if (officialHudCache.root
            && officialHudCache.root.IsValid
            && officialHudCache.root.IsValid()) return officialHudCache.root;
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        officialHudCache.root = root;
        return root;
    }

    function officialPanel(id) {
        var cached = officialHudCache[id];
        if (cached && cached.IsValid && cached.IsValid()) return cached;
        var root = officialHudRoot();
        cached = root && root.FindChildTraverse ? root.FindChildTraverse(id) : null;
        if (cached) officialHudCache[id] = cached;
        return cached;
    }

    function officialPortraitPanel() {
        var ids = ["HeroImage", "HeroPortrait", "Portrait", "SelectedHeroImage"];
        for (var index = 0; index < ids.length; index++) {
            var candidate = officialPanel(ids[index]);
            if (candidate) return candidate;
        }
        return null;
    }

    function hideCosmeticPortrait() {
        if (cosmeticPortraitOverlay) {
            cosmeticPortraitOverlay.style.visibility = "collapse";
        }
    }

    function updateCosmeticPortrait(snapshot) {
        var previewUnit = String(snapshot && snapshot.portrait_unit_name || "");
        var itemDef = String(snapshot && snapshot.portrait_item_def || "");
        if (!previewUnit || !itemDef) {
            hideCosmeticPortrait();
            return;
        }
        var nativePortrait = officialPortraitPanel();
        var parent = nativePortrait && nativePortrait.GetParent
            ? nativePortrait.GetParent() : null;
        if (!parent) {
            hideCosmeticPortrait();
            return;
        }
        if (!cosmeticPortraitOverlay
            || !cosmeticPortraitOverlay.IsValid
            || !cosmeticPortraitOverlay.IsValid()
            || cosmeticPortraitOverlay.GetParent() !== parent) {
            if (cosmeticPortraitOverlay && cosmeticPortraitOverlay.DeleteAsync) {
                cosmeticPortraitOverlay.DeleteAsync(0);
            }
            cosmeticPortraitOverlay = $.CreatePanel(
                "DOTAScenePanel", parent, "SurvivalCosmeticPortraitOverlay"
            );
            cosmeticPortraitOverlay.hittest = false;
            cosmeticPortraitOverlay.hittestchildren = false;
            cosmeticPortraitOverlay.style.ignoreParentFlow = true;
            cosmeticPortraitOverlay.style.zIndex = "1000";
            cosmeticPortraitSignature = "";
        }
        if (nativePortrait.GetPositionWithinWindow
            && parent.GetPositionWithinWindow) {
            var portraitPosition = nativePortrait.GetPositionWithinWindow();
            var parentPosition = parent.GetPositionWithinWindow();
            var scaleX = Number(parent.actualuiscale_x || 1);
            var scaleY = Number(parent.actualuiscale_y || 1);
            cosmeticPortraitOverlay.style.position = String(
                (Number(portraitPosition.x) - Number(parentPosition.x)) / scaleX
            ) + "px " + String(
                (Number(portraitPosition.y) - Number(parentPosition.y)) / scaleY
            ) + "px 0px";
            cosmeticPortraitOverlay.style.width = String(
                Number(nativePortrait.actuallayoutwidth || 159) / scaleX
            ) + "px";
            cosmeticPortraitOverlay.style.height = String(
                Number(nativePortrait.actuallayoutheight || 145) / scaleY
            ) + "px";
        }
        var signature = previewUnit + ":" + itemDef;
        if (cosmeticPortraitSignature !== signature) {
            try {
                // The second SetUnit argument is the official econ item/bundle
                // definition. Bundle 22722 contains all four Shen components.
                cosmeticPortraitOverlay.SetUnit(previewUnit, itemDef, false);
                cosmeticPortraitSignature = signature;
            } catch (error) {
                $.Warning("[SURVIVAL_PORTRAIT] cosmetic preview failed: " + error);
                hideCosmeticPortrait();
                return;
            }
        }
        cosmeticPortraitOverlay.style.visibility = "visible";
    }

    function setOfficialPanelVisible(root, id, visible) {
        if (!root) return false;
        var target = officialPanel(id);
        if (!target) return false;
        target.style.visibility = visible ? "visible" : "collapse";
        return true;
    }

    function collapseOfficialPanel(id) {
        var target = officialPanel(id);
        if (!target) return false;
        target.style.visibility = "collapse";
        target.hittest = false;
        target.hittestchildren = false;
        return true;
    }

    function restoreOfficialAbilityPanel() {
        // `AbilitiesAndStatBranch` is the complete official ability-bar parent.
        // Never collapse it while hiding its StatBranch child: doing so removes
        // every skill and lets the flow-layout inventory slide beside the portrait.
        ["AbilitiesAndStatBranch", "abilities"].forEach(function (id) {
            var target = officialPanel(id);
            if (!target) return;
            target.style.visibility = "visible";
            target.hittest = true;
            target.hittestchildren = true;
        });
    }

    function hideDeferredHudFeatures() {
        restoreOfficialAbilityPanel();
        [
            "StatBranch", "StatBranchButton", "LevelUpTab",
            "AghsStatusContainer", "AghanimStatus", "AghanimScepter",
            "AghanimShard", "AghanimBlessing", "AghsStatus",
            "inventory_neutral_slot", "inventory_neutral",
            "NeutralItemSlot", "NeutralItem", "neutral_item",
            "inventory_tpscroll_slot", "inventory_tpscroll",
            "TPScrollSlot", "TPScroll", "TeleportScroll",
            "inventory_backpack_list", "inventory_backpack",
            "Backpack", "BackpackSlots", "inventory_extra_slots"
        ].forEach(collapseOfficialPanel);

        var inventory = officialPanel("inventory") || officialPanel("Inventory");
        if (!inventory || !inventory.FindChildTraverse) return;
        for (var slot = 6; slot <= 8; slot++) {
            [
                "inventory_slot_" + String(slot),
                "inventoryslot" + String(slot),
                "InventorySlot" + String(slot)
            ].forEach(function (id) {
                var target = inventory.FindChildTraverse(id);
                if (!target) return;
                target.style.visibility = "collapse";
                target.hittest = false;
                target.hittestchildren = false;
            });
        }
    }

    function setNativeAttackLabelsVisible(damage, visible) {
        if (!damage || !damage.FindChildTraverse) return;
        ["DamageLabel", "DamageLabelBase", "DamageLabelModifier"].forEach(function (id) {
            var nativeLabel = damage.FindChildTraverse(id);
            if (nativeLabel) nativeLabel.style.visibility = visible ? "visible" : "collapse";
        });
    }

    function setNativeStatLabelsVisible(statPanel, visible) {
        if (!statPanel) return;
        function visit(parent) {
            var children = parent.Children ? parent.Children() : [];
            children.forEach(function (child) {
                if (child.paneltype === "Label") {
                    child.style.visibility = visible ? "visible" : "collapse";
                }
                visit(child);
            });
        }
        visit(statPanel);
    }

    function applyAuthoritativeNumberStyle(overlay) {
        if (!overlay) return null;
        overlay.AddClass("MonoNumbersFont");
        overlay.AddClass("StatRegionLabel");
        overlay.style.opacity = "1";
        overlay.style.position = "0px 0px 0px";
        overlay.style.width = "180px";
        overlay.style.height = "fit-children";
        overlay.style.fontSize = "14px";
        overlay.style.color = "#cccccc";
        overlay.style.textAlign = "right";
        overlay.style.zIndex = "1000";
        overlay.hittest = false;
        return overlay;
    }

    function ensureAuthoritativeStatOverlay(statsContainer, id, current) {
        if (!statsContainer) return null;
        if (current && current.IsValid && current.IsValid()
            && current.GetParent && current.GetParent() === statsContainer) {
            return applyAuthoritativeNumberStyle(current);
        }
        var overlay = statsContainer.FindChildTraverse
            ? statsContainer.FindChildTraverse(id) : null;
        if (!overlay) {
            overlay = $.CreatePanel("Label", statsContainer, id);
            overlay.style.visibility = "collapse";
        }
        return applyAuthoritativeNumberStyle(overlay);
    }

    function ensureRelativeAttackOverlay(root, statsContainer) {
        if (!root || !statsContainer) return null;
        if (authoritativeAttackLabel
            && authoritativeAttackLabel.IsValid
            && authoritativeAttackLabel.IsValid()
            && authoritativeAttackLabel.GetParent
            && authoritativeAttackLabel.GetParent() === statsContainer) {
            return applyAuthoritativeNumberStyle(authoritativeAttackLabel);
        }
        var existing = statsContainer.FindChildTraverse
            ? statsContainer.FindChildTraverse("SurvivalAuthoritativeDamageLabel")
            : null;
        authoritativeAttackLabel = existing || $.CreatePanel(
            "Label",
            statsContainer,
            "SurvivalAuthoritativeDamageLabel"
        );
        if (!existing) authoritativeAttackLabel.style.visibility = "collapse";
        return applyAuthoritativeNumberStyle(authoritativeAttackLabel);
    }

    function nativeNumberAnchor(statPanel, preferredIds) {
        if (!statPanel || !statPanel.FindChildTraverse) return null;
        for (var index = 0; index < preferredIds.length; index++) {
            var preferred = statPanel.FindChildTraverse(preferredIds[index]);
            if (preferred && preferred.GetPositionWithinWindow) return preferred;
        }
        var labels = [];
        function collectLabels(parent) {
            var children = parent && parent.Children ? parent.Children() : [];
            children.forEach(function (child) {
                if (child.paneltype === "Label" && child.GetPositionWithinWindow) {
                    labels.push(child);
                }
                collectLabels(child);
            });
        }
        collectLabels(statPanel);
        return labels.length > 0 ? labels[0] : null;
    }

    function positionRelativeToNativeNumber(statPanel, statsContainer, overlay, preferredIds) {
        if (!statPanel || !statsContainer || !overlay
            || !statPanel.GetPositionWithinWindow
            || !statsContainer.GetPositionWithinWindow) return false;
        var anchor = nativeNumberAnchor(statPanel, preferredIds);
        if (!anchor || !anchor.GetPositionWithinWindow) return false;

        var anchorPosition = anchor.GetPositionWithinWindow();
        var parentPosition = statsContainer.GetPositionWithinWindow();
        var parentScaleY = Number(statsContainer.actualuiscale_y || 1);
        var anchorHeight = Number(anchor.actuallayoutheight || 20);
        var top = (Number(anchorPosition.y) - Number(parentPosition.y)) / parentScaleY;

        // 三项权威数字完全复用攻击力文本的右对齐、宽度和原生数字行定位规则。
        var overlayWidth = 180;
        overlay.style.horizontalAlign = "right";
        overlay.style.marginRight = "22px";
        overlay.style.position = "0px " + String(top) + "px 0px";
        overlay.style.width = String(overlayWidth) + "px";
        overlay.style.height = String(Math.max(18, anchorHeight)) + "px";
        return true;
    }

    function positionRelativeToStatRow(statPanel, statsContainer, overlay) {
        if (!statPanel || !statsContainer || !overlay
            || !statPanel.GetPositionWithinWindow
            || !statsContainer.GetPositionWithinWindow) return false;
        var rowPosition = statPanel.GetPositionWithinWindow();
        var parentPosition = statsContainer.GetPositionWithinWindow();
        var parentScaleY = Number(statsContainer.actualuiscale_y || 1);
        var rowHeight = Number(statPanel.actuallayoutheight || 20);
        var top = (Number(rowPosition.y) - Number(parentPosition.y)) / parentScaleY;

        // 官方 Text 已被隐藏；只借用属性行的纵向几何，显示的是项目自己的 Label。
        overlay.style.horizontalAlign = "right";
        overlay.style.marginRight = "22px";
        overlay.style.position = "0px " + String(top) + "px 0px";
        overlay.style.width = "180px";
        overlay.style.height = String(Math.max(18, rowHeight)) + "px";
        return true;
    }

    function writeOfficialAttackText() {
        var root = officialHudRoot();
        if (!root || !root.FindChildTraverse) return;
        var damage = officialPanel("Damage");
        var statsContainer = officialPanel("stats_container")
            || officialPanel("StatContainer");
        if (!damage || !statsContainer) return;
        var overlay = ensureRelativeAttackOverlay(root, statsContainer);
        if (!overlay) return;

        var hasAuthoritativeText = officialAttackText !== ""
            && Number(selectedUnit()) === Number(officialAttackUnit);
        if (!hasAuthoritativeText) {
            overlay.style.visibility = "collapse";
            setNativeAttackLabelsVisible(damage, true);
            return;
        }

        // Label 属于官方统计区域的父节点，位置相对 stats_container，而不是相对屏幕。
        if (!positionRelativeToNativeNumber(
            damage,
            statsContainer,
            overlay,
            ["DamageLabel", "DamageLabelContainer"]
        )) return;
        overlay.text = officialAttackText;
        overlay.style.visibility = "visible";
        setNativeAttackLabelsVisible(damage, false);
    }

    function writeOfficialSecondaryStats() {
        var statsContainer = officialPanel("stats_container")
            || officialPanel("StatContainer");
        var attackSpeedPanel = officialPanel("AttackSpeed");
        var armorPanel = officialPanel("Armor");
        if (!statsContainer || !attackSpeedPanel || !armorPanel) return;

        authoritativeAttackSpeedLabel = ensureAuthoritativeStatOverlay(
            statsContainer, "SurvivalAuthoritativeAttackSpeedLabel",
            authoritativeAttackSpeedLabel
        );
        authoritativeArmorLabel = ensureAuthoritativeStatOverlay(
            statsContainer, "SurvivalAuthoritativeArmorLabel",
            authoritativeArmorLabel
        );
        var matches = Number(selectedUnit()) === Number(officialAttackUnit);
        if (!matches || officialAttackSpeedText === "") {
            authoritativeAttackSpeedLabel.style.visibility = "collapse";
            authoritativeArmorLabel.style.visibility = "collapse";
            setNativeStatLabelsVisible(attackSpeedPanel, false);
            setNativeStatLabelsVisible(armorPanel, false);
            return;
        }
        if (!positionRelativeToStatRow(
            attackSpeedPanel, statsContainer, authoritativeAttackSpeedLabel
        )) return;
        if (!positionRelativeToStatRow(
            armorPanel, statsContainer, authoritativeArmorLabel
        )) return;
        authoritativeAttackSpeedLabel.text = officialAttackSpeedText;
        authoritativeArmorLabel.text = officialArmorText;
        authoritativeAttackSpeedLabel.style.visibility = "visible";
        authoritativeArmorLabel.style.visibility = "visible";
        setNativeStatLabelsVisible(attackSpeedPanel, false);
        setNativeStatLabelsVisible(armorPanel, false);
    }

    function ensureLogicalAttributeOverlay(statsContainer) {
        if (!statsContainer) return null;
        if (logicalAttributeOverlay
            && logicalAttributeOverlay.IsValid
            && logicalAttributeOverlay.IsValid()) return logicalAttributeOverlay;
        logicalAttributeOverlay = statsContainer.FindChildTraverse
            ? statsContainer.FindChildTraverse("SurvivalLogicalAttributes") : null;
        if (logicalAttributeOverlay) return logicalAttributeOverlay;

        logicalAttributeOverlay = $.CreatePanel(
            "Panel", statsContainer, "SurvivalLogicalAttributes"
        );
        logicalAttributeOverlay.hittest = false;
        logicalAttributeOverlay.style.width = "100%";
        logicalAttributeOverlay.style.height = "100%";
        logicalAttributeOverlay.style.horizontalAlign = "left";
        logicalAttributeOverlay.style.position = "0px 0px 0px";
        logicalAttributeOverlay.style.zIndex = "1000";
        [
            ["Strength", "strength", "icon_strength.png"],
            ["Agility", "agility", "icon_agility.png"],
            ["Intellect", "intellect", "icon_intelligence.png"]
        ].forEach(function (definition) {
            var row = $.CreatePanel(
                "Panel", logicalAttributeOverlay,
                "SurvivalLogical" + definition[0] + "Row"
            );
            row.hittest = false;
            row.style.width = "81px";
            row.style.height = "18px";
            var icon = $.CreatePanel("Image", row, "");
            icon.hittest = false;
            icon.SetImage(
                "file://{images}/custom_game/survival_native/" + definition[2]
            );
            icon.style.width = "16px";
            icon.style.height = "16px";
            icon.style.position = "65px 0px 0px";
            var value = $.CreatePanel(
                "Label", row, "SurvivalLogical" + definition[0] + "Value"
            );
            value.hittest = false;
            value.AddClass("MonoNumbersFont");
            value.style.width = "60px";
            value.style.height = "18px";
            value.style.position = "0px 0px 0px";
            value.style.color = "#cccccc";
            value.style.fontSize = "14px";
            value.style.textAlign = "right";
            value.style.verticalAlign = "center";
            value.text = "0";
        });
        return logicalAttributeOverlay;
    }

    function damageIconAnchor(damage) {
        if (!damage || !damage.GetPositionWithinWindow) return null;
        var preferredIds = [
            "DamageIcon", "AttackDamageIcon", "DamageIconContainer", "damage_icon"
        ];
        for (var index = 0; index < preferredIds.length; index++) {
            var preferred = damage.FindChildTraverse
                ? damage.FindChildTraverse(preferredIds[index]) : null;
            if (preferred && preferred.GetPositionWithinWindow) return preferred;
        }
        var candidates = [];
        function collectIcons(parent) {
            var children = parent && parent.Children ? parent.Children() : [];
            children.forEach(function (child) {
                var id = String(child.id || "").toLowerCase();
                if ((child.paneltype === "Image" || id.indexOf("icon") >= 0)
                    && child.GetPositionWithinWindow) {
                    var width = Number(child.actuallayoutwidth || 0);
                    var height = Number(child.actuallayoutheight || 0);
                    var position = child.GetPositionWithinWindow();
                    if (child.visible !== false && width >= 6 && height >= 6
                        && width <= 40 && height <= 40) {
                        candidates.push({
                            panel: child,
                            x: Number(position.x || 0),
                            area: width * height
                        });
                    }
                }
                collectIcons(child);
            });
        }
        collectIcons(damage);
        candidates.sort(function (left, right) {
            if (left.x !== right.x) return right.x - left.x;
            return left.area - right.area;
        });
        return candidates.length > 0 ? candidates[0].panel : null;
    }

    function positionLogicalAttributeOverlay(statsContainer, overlay) {
        var damage = officialPanel("Damage");
        if (!damage || !damage.GetPositionWithinWindow
            || !statsContainer.GetPositionWithinWindow) return;
        var iconAnchor = damageIconAnchor(damage);
        var anchor = iconAnchor
            ? iconAnchor.GetPositionWithinWindow()
            : damage.GetPositionWithinWindow();
        var parent = statsContainer.GetPositionWithinWindow();
        var scaleX = Number(statsContainer.actualuiscale_x || 1);
        var scaleY = Number(statsContainer.actualuiscale_y || 1);
        var iconX = (Number(anchor.x) - Number(parent.x)) / scaleX;
        if (!iconAnchor) {
            iconX += Math.max(0, Number(damage.actuallayoutwidth || 16) - 16);
        }
        var iconY = (Number(anchor.y) - Number(parent.y)) / scaleY;
        [
            ["SurvivalLogicalStrengthRow", 68],
            ["SurvivalLogicalAgilityRow", 91],
            ["SurvivalLogicalIntellectRow", 114]
        ].forEach(function (definition) {
            var row = overlay.FindChildTraverse(definition[0]);
            if (!row) return;
            // 数值宽 60px，右边缘距图标左边缘 5px；三行共享同一 X 坐标。
            row.style.position = String(iconX - 65) + "px "
                + String(iconY + definition[1]) + "px 0px";
        });
    }

    function updateLogicalAttributes(snapshot) {
        var statsContainer = officialPanel("stats_container")
            || officialPanel("StatContainer");
        var overlay = ensureLogicalAttributeOverlay(statsContainer);
        if (!overlay) return;
        positionLogicalAttributeOverlay(statsContainer, overlay);
        var strength = overlay.FindChildTraverse("SurvivalLogicalStrengthValue");
        var agility = overlay.FindChildTraverse("SurvivalLogicalAgilityValue");
        var intellect = overlay.FindChildTraverse("SurvivalLogicalIntellectValue");
        if (strength) strength.text = formatNumber(snapshot.strength);
        if (agility) agility.text = formatNumber(snapshot.agility);
        if (intellect) intellect.text = formatNumber(snapshot.intellect);
        overlay.style.visibility = "visible";
    }

    function updateOfficialStatsVisibility(unit, unitName) {
        var root = officialHudRoot();
        if (!root) return;

        // 没有权威快照时保留原生数字；快照到达后由覆盖层接管。
        setOfficialPanelVisible(root, "Damage", true);
        writeOfficialAttackText();
        setOfficialPanelVisible(root, "AttackSpeed", true);
        setOfficialPanelVisible(root, "Armor", true);
        // These panels are read-only displays. Keep their icons and
        // authoritative numbers visible, but do not let Valve or project code
        // create detailed stat tooltips from their hover tree.
        ["Damage", "AttackSpeed", "Armor"].forEach(function (id) {
            var statPanel = officialPanel(id);
            if (!statPanel) return;
            statPanel.hittest = false;
            statPanel.hittestchildren = false;
        });
        var statsContainer = officialPanel("stats_container")
            || officialPanel("StatContainer");
        if (statsContainer) {
            statsContainer.hittest = false;
            statsContainer.hittestchildren = false;
        }
        var attackSpeedPanel = officialPanel("AttackSpeed");
        var armorPanel = officialPanel("Armor");
        var statParent = attackSpeedPanel && attackSpeedPanel.GetParent
            ? attackSpeedPanel.GetParent() : null;
        if (statParent && statParent.MoveChildBefore
            && armorPanel && armorPanel.GetParent
            && armorPanel.GetParent() === statParent) {
            statParent.MoveChildBefore(attackSpeedPanel, armorPanel);
        }
        writeOfficialSecondaryStats();
        setOfficialPanelVisible(root, "MagicResist", false);
        setOfficialPanelVisible(root, "MoveSpeed", false);
        setOfficialPanelVisible(root, "Bounty", false);

        // Native attributes are deliberately zero; logical attributes use the
        // authoritative overlay and never inherit agility/strength side effects.
        setOfficialPanelVisible(root, "stragiint", false);
        var overlay = logicalAttributeOverlay;
        if (overlay) {
            overlay.style.visibility = isHeroUnit(unit, unitName)
                ? "visible" : "collapse";
        }
    }

    function portraitCacheParent(unitName) {
        return isNativeHero(unitName)
            ? panel("SurvivalHeroPortraitCache")
            : panel("SurvivalBuildingPortraitCache");
    }

    function ensurePortraitScene(unitName) {
        if (!unitName) return null;
        if (isNativeHero(unitName)) {
            var heroImage = panel("SurvivalHeroPortrait");
            if (!heroImage) return null;
            try { heroImage.SetUnit(unitName, "", false); } catch (error) {}
            return heroImage;
        }
        var cached = portraitCache[unitName];
        if (cached) return cached;
        var cache = portraitCacheParent(unitName);
        if (!cache) return null;
        var id = "SurvivalBuildingPortraitCache" + String(portraitCacheSerial++);
        var scene = $.CreatePanel("DOTAScenePanel", cache, id);
        if (!scene) return null;
        scene.AddClass("SurvivalBuildingPortrait");
        scene.hittest = false;
        scene.SetHasClass("PortraitCacheVisible", false);
        scene.SetHasClass("PortraitPrewarm", false);
        scene.SetUnit(unitName, "", false);
        portraitCache[unitName] = scene;
        $.Msg("[SURVIVAL_PORTRAIT] CACHE_CREATE name=", unitName, " id=", id);
        return scene;
    }

    function prewarmNextPortrait() {
        if (portraitPrewarmRunning || portraitPrewarmIndex >= portraitPrewarmQueue.length) return;
        var unitName = portraitPrewarmQueue[portraitPrewarmIndex++];
        if (portraitCache[unitName]) {
            $.Schedule(0.05, prewarmNextPortrait);
            return;
        }
        portraitPrewarmRunning = true;
        var scene = ensurePortraitScene(unitName);
        if (scene) {
            scene.SetHasClass("PortraitPrewarm", true);
            $.Msg("[SURVIVAL_PORTRAIT] PREWARM_BEGIN name=", unitName);
            $.Schedule(0.12, function () {
                if (scene && scene.IsValid && scene.IsValid()) {
                    scene.SetHasClass("PortraitPrewarm", false);
                    scene.SetHasClass(
                        "PortraitCacheVisible",
                        heroPanelState.unitName === unitName
                    );
                }
                portraitPrewarmRunning = false;
                $.Msg("[SURVIVAL_PORTRAIT] PREWARM_DONE name=", unitName);
                if (portraitPrewarmIndex >= portraitPrewarmQueue.length) {
                    portraitPrewarmComplete = true;
                    $.Msg("[SURVIVAL_PORTRAIT] PREWARM_ALL_DONE count=", String(portraitPrewarmQueue.length));
                }
                $.Schedule(0.04, prewarmNextPortrait);
            });
        } else {
            portraitPrewarmRunning = false;
            $.Schedule(0.04, prewarmNextPortrait);
        }
    }

    function startPortraitPrewarm() {
        prewarmNextPortrait();
    }

    function showPortrait(unitName) {
        var scene = ensurePortraitScene(unitName);
        if (!scene) return null;
        var heroImage = panel("SurvivalHeroPortrait");
        var nativeHero = isNativeHero(unitName);
        if (heroImage) heroImage.SetHasClass("PortraitCacheVisible", nativeHero);
        if (!nativeHero) scene.SetHasClass("PortraitPrewarm", false);
        for (var name in portraitCache) {
            if (portraitCache.hasOwnProperty(name)) {
                portraitCache[name].SetHasClass("PortraitCacheVisible", !nativeHero && name === unitName);
            }
        }
        if (heroPanelState.unitName !== unitName) {
            heroPanelState.unitName = unitName;
            $.Msg("[SURVIVAL_PORTRAIT] SHOW name=", unitName);
        }
        return scene;
    }

    function formatNumber(value) {
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        if (formatter && formatter.Format) return formatter.Format(value);
        return String(value === undefined ? 0 : value);
    }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return value[key]; });
    }

    function renderCombatDebug(snapshot) {
        if (!snapshot) return;
        setText("HeroCombatTotalDamage", formatNumber(snapshot.total_damage));
        setText(
            "HeroCombatLastDamage",
            "最近伤害 " + formatNumber(snapshot.last_damage)
                + " · 命中 " + formatNumber(snapshot.hit_count) + " 次"
        );
        var heroStats = snapshot.technology_stats
            && snapshot.technology_stats.final
            && snapshot.technology_stats.final.hero;
        if (heroStats) {
            var heroSummary = [];
            if (Number(heroStats.attack_flat || 0) !== 0) {
                heroSummary.push("攻击 +" + formatNumber(heroStats.attack_flat));
            }
            if (Number(heroStats.final_damage_bonus_pct || 0) !== 0) {
                heroSummary.push("最终伤害 +"
                    + formatNumber(heroStats.final_damage_bonus_pct) + "%");
            }
            if (Number(heroStats.armor_reduction_per_attack || 0) !== 0) {
                heroSummary.push("攻击减甲 -"
                    + formatNumber(heroStats.armor_reduction_per_attack));
            }
            if (heroSummary.length > 0) {
                var summary = panel("HeroCombatTechnologySummary");
                if (summary) summary.text = heroSummary.join(" · ");
            }
            var emptySummary = panel("HeroCombatTechnologySummary");
            if (emptySummary && heroSummary.length === 0) emptySummary.text = "";
        }
        var list = panel("HeroTechnologyList");
        if (!list) return;
        list.RemoveAndDeleteChildren();
        var technologies = asArray(snapshot.technologies);
        if (technologies.length === 0) {
            var empty = $.CreatePanel("Label", list, "HeroTechnologyEmpty");
            empty.text = "暂无已激活科技";
            return;
        }
        technologies.forEach(function (technology, index) {
            var row = $.CreatePanel(
                "Panel", list, "HeroTechnologyRow" + String(index)
            );
            row.AddClass("HeroTechnologyRow");
            var name = $.CreatePanel("Label", row, "");
            name.AddClass("HeroTechnologyName");
            name.text = String(technology.name || technology.group || "科技");
            var level = $.CreatePanel("Label", row, "");
            level.AddClass("HeroTechnologyLevel");
            level.text = "Lv." + String(technology.level || 0);
            var effect = $.CreatePanel("Label", row, "");
            effect.AddClass("HeroTechnologyEffect");
            effect.text = String(technology.effect || "已激活");
        });
    }

    function attackText(snapshot) {
        var minimum = Number(snapshot.attack_min || 0);
        var maximum = Number(snapshot.attack_max || minimum);
        if (Math.abs(maximum - minimum) < 0.001) {
            return formatNumber(maximum);
        }
        return formatNumber(minimum) + " - " + formatNumber(maximum);
    }

    function update(snapshot) {
        if (!snapshot) return;
        selectedUnitSnapshot = snapshot;
        updateCosmeticPortrait(snapshot);
        var attack = attackText(snapshot);
        officialAttackText = attack;
        officialAttackUnit = Number(snapshot.entindex);
        writeOfficialAttackText();
        var armor = formatNumber(snapshot.armor);
        // 攻速字段表示每秒攻击次数；缺失时固定显示默认值 0.5。
        // 不允许保留上一选中单位的显示值。
        var attackSpeedValue = snapshot.attack_speed === undefined
            || snapshot.attack_speed === null
            || snapshot.attack_speed === ""
            ? 0.5 : Number(snapshot.attack_speed);
        if (!isFinite(attackSpeedValue) || attackSpeedValue <= 0) attackSpeedValue = 0.5;
        var attackSpeed = formatNumber(attackSpeedValue);
        officialAttackSpeedText = attackSpeed;
        officialArmorText = armor;
        writeOfficialSecondaryStats();
        setText("CombatAttackValue", attack);
        setText("CombatArmorValue", armor);
        setText("CombatAttackSpeedValue", attackSpeed);
        setText("HeroTooltipAttack", attack);
        setText("HeroTooltipArmor", armor);
        setText("HeroTooltipAttackSpeed", attackSpeed);
        setText("HeroTooltipStrength", formatNumber(snapshot.strength));
        setText("HeroTooltipAgility", formatNumber(snapshot.agility));
        setText("HeroTooltipIntellect", formatNumber(snapshot.intellect));
        setText("HeroCoreStrengthValue", formatNumber(snapshot.strength));
        setText("HeroCoreAgilityValue", formatNumber(snapshot.agility));
        setText("HeroCoreIntellectValue", formatNumber(snapshot.intellect));
        setText("CombatStrengthValue", formatNumber(snapshot.strength));
        setText("CombatAgilityValue", formatNumber(snapshot.agility));
        setText("CombatIntellectValue", formatNumber(snapshot.intellect));
        if (Number(snapshot.entindex) === Number(selectedUnit())) {
            updateLogicalAttributes(snapshot);
        }
        setText(
            "CombatWeaponValue",
            snapshot.weapon_content_id
                ? ("武器 " + (snapshot.weapon_name || snapshot.weapon_content_id))
                : "未装备武器"
        );
        setText(
            "CombatGrowthValue",
            "成长攻击 +" + formatNumber(snapshot.weapon_growth_attack)
                + (Number(snapshot.damage_gain_attack || 0) > 0
                    ? (" · 每次造成伤害攻击 +"
                        + formatNumber(snapshot.damage_gain_attack)
                        + " / 全属性 +"
                        + formatNumber(snapshot.damage_gain_all_attributes))
                    : (" · 每次攻击 +" + formatNumber(snapshot.attack_gain_per_attack)))
        );
        var target = Number(snapshot.stage_attack_target || 0);
        setText(
            "CombatProgressValue",
            "攻击次数 " + formatNumber(snapshot.stage_attack_count)
                + (target > 0 ? ("/" + formatNumber(target)) : "")
        );
        setText("CombatScaleValue", "战斗缩放 1:" + String(snapshot.scale || 10));
    }

    function revealBottomHud() {
        // 官方 Reborn HUD 负责完整底栏；旧自定义克隆仅保留回滚，不再显示。
        var bottomHud = panel("SurvivalHeroBottomHUD");
        if (bottomHud) bottomHud.AddClass("HudHidden");
    }

    function selectedUnit() {
        try {
            var portrait = Players.GetLocalPlayerPortraitUnit();
            if (portrait !== undefined && portrait >= 0) return portrait;
        } catch (error) {}
        return Players.GetPlayerHeroEntityIndex(playerId);
    }

    function requestSelectedUnitStats(unit, force) {
        if (unit === undefined || unit < 0) return;
        if (!force && Number(unit) === lastRequestedUnit) return;
        lastRequestedUnit = Number(unit);
        $.Msg(force
            ? "[SURVIVAL_STATS][CLIENT] FORCE_REFRESH entindex="
            : "[SURVIVAL_STATS][CLIENT] SELECTED_UNIT_CHANGE entindex=", String(unit));
        GameEvents.SendCustomGameEventToServer("ui_selected_unit_stats_request", {
            entindex: unit,
        });
    }

    function refreshHeroVitals(unit) {
        if (unit === undefined || unit < 0) return;
        try {
            var maxHealth = Entities.GetMaxHealth(unit);
            var health = Entities.GetHealth(unit);
            var maxMana = Entities.GetMaxMana(unit);
            var mana = Entities.GetMana(unit);
            var healthText = formatNumber(health) + " / " + formatNumber(maxHealth);
            var manaText = formatNumber(mana) + " / " + formatNumber(maxMana);
            var healthWidth = (maxHealth > 0 ? (100 * health / maxHealth) : 0) + "%";
            var manaWidth = (maxMana > 0 ? (100 * mana / maxMana) : 0) + "%";
            if (heroPanelState.healthText !== healthText) {
                heroPanelState.healthText = healthText;
                setText("SurvivalHeroHealthText", healthText);
            }
            if (heroPanelState.manaText !== manaText) {
                heroPanelState.manaText = manaText;
                setText("SurvivalHeroManaText", manaText);
            }
            if (heroPanelState.healthWidth !== healthWidth) {
                heroPanelState.healthWidth = healthWidth;
                setWidth(panel("SurvivalHeroHealthFill"), healthWidth);
            }
            if (heroPanelState.manaWidth !== manaWidth) {
                heroPanelState.manaWidth = manaWidth;
                setWidth(panel("SurvivalHeroManaFill"), manaWidth);
            }
        } catch (error) {}
    }

    function refreshHeroVitalsTick() {
        refreshHeroVitals(selectedUnit());
        $.Schedule(0.25, refreshHeroVitalsTick);
    }

    function refreshHeroPanel() {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return;
        var scene = panel("SurvivalHeroPortrait");
        var unitName = "npc_dota_hero_undying";
        try {
            unitName = Entities.GetUnitName(unit) || unitName;
            var unitChanged = heroPanelState.unit !== Number(unit);
            if (unitChanged) {
                heroPanelState.unit = Number(unit);
                selectedUnitSnapshot = null;
                hideCosmeticPortrait();
                var tooltipBindings = GameUI.CustomUIConfig().SurvivalTooltipBindings;
                if (tooltipBindings && tooltipBindings.Recover) {
                    tooltipBindings.Recover();
                }
                var inventoryTooltip = GameUI.CustomUIConfig().SurvivalInventoryTooltip;
                if (inventoryTooltip && inventoryTooltip.Recover) {
                    inventoryTooltip.Recover("selected_unit_changed");
                }
                lastRequestedUnit = -1;
                heroPanelState.displayName = "";
                heroPanelState.level = null;
                heroPanelState.healthText = "";
                heroPanelState.manaText = "";
                heroPanelState.healthWidth = "";
                heroPanelState.manaWidth = "";
                updateOfficialStatsVisibility(unit, unitName);
                if (scene || panel("SurvivalHeroPortraitCache")) {
                    showPortrait(unitName);
                }
            }
            var snapshotMatches = selectedUnitSnapshot
                && Number(selectedUnitSnapshot.entindex) === Number(unit);
            var snapshotName = snapshotMatches
                ? (selectedUnitSnapshot.display_name || selectedUnitSnapshot.unit_name || "")
                : "";
            var displayName = resolveUnitDisplayName(unitName, snapshotName);
            if (heroPanelState.displayName !== displayName) {
                heroPanelState.displayName = displayName;
                setText("SurvivalHeroName", displayName);
            }
            // Valve can rewrite or recreate UnitNameLabel during selection changes.
            // Keep it suppressed and atomically reveal the project-owned label.
            setOfficialUnitName(displayName, true);
            var level = snapshotMatches && selectedUnitSnapshot.level !== undefined
                ? selectedUnitSnapshot.level : Entities.GetLevel(unit);
            if (heroPanelState.level !== level) {
                heroPanelState.level = level;
                setText("SurvivalHeroLevel", level);
            }
            setText("SurvivalHeroLevelText", "");
            refreshHeroVitals(unit);
        } catch (error) {}
        requestSelectedUnitStats(unit);
    }

    function localSelectionEvent(payload) {
        if (!payload) return true;
        var eventPlayer = payload.PlayerID;
        if (eventPlayer === undefined) eventPlayer = payload.player_id;
        if (eventPlayer === undefined) eventPlayer = payload.playerid;
        return eventPlayer === undefined || Number(eventPlayer) === Number(playerId);
    }

    function beginUnitNameTransition(reason) {
        unitNameTransitionSerial += 1;
        var serial = unitNameTransitionSerial;
        unitNameRetryDelays.forEach(function (delay, retryIndex) {
            $.Schedule(delay, function () {
                if (serial !== unitNameTransitionSerial) return;
                var currentUnit = Number(selectedUnit());
                if (currentUnit < 0) return;
                if (currentUnit !== observedSelectedUnit) {
                    observedSelectedUnit = currentUnit;
                    refreshHeroPanel();
                    $.Msg("[SURVIVAL_UNIT_NAME] selected_unit_changed reason=",
                        String(reason || "unknown"), " unit=", String(currentUnit),
                        " retry=", String(retryIndex), " serial=", String(serial));
                    return;
                }
                writeOfficialAttackText();
                writeOfficialSecondaryStats();
            });
        });
    }

    function onUnitSelectionEvent(reason, payload) {
        if (!localSelectionEvent(payload)) return;
        beginUnitNameTransition(reason);
    }

    function subscribeUnitNameSelectionEvents() {
        GameEvents.Subscribe("dota_player_update_selected_unit", function (payload) {
            onUnitSelectionEvent("selected_unit_event", payload);
        });
        GameEvents.Subscribe("dota_player_update_query_unit", function (payload) {
            onUnitSelectionEvent("query_unit_event", payload);
        });
    }

    function abilityRuntime(abilityIndex) {
        return CustomNetTables.GetTableValue(
            "survival_ability_runtime",
            String(abilityIndex)
        ) || {};
    }

    function applyAbilityRuntime(panel, abilityIndex) {
        var runtime = abilityRuntime(abilityIndex);
        var unavailable = runtime.removed === 1
            || runtime.available === 0;
        panel.SetHasClass("DOTADisabled", unavailable);
        // Affordability is advisory client data. Keep the button interactive and
        // let the authoritative server spend decide against the latest account.
        panel.hittest = true;
        panel.__survivalRuntimeStatus = runtime.status_text || "";
        panel.__survivalRuntime = runtime;
        return runtime;
    }

    function refreshOfficialAbilityRuntime(visibleAbilities) {
        var displaySlot = 0;
        visibleAbilities.forEach(function (entry) {
            if (entry.name === "ability_survival_return_home") return;
            var button = officialPanel("Ability" + String(displaySlot));
            var runtime = abilityRuntime(entry.ability);
            var managed = Number(runtime.ability_entindex) === Number(entry.ability)
                && Number(runtime.owner_entindex) === Number(selectedUnit());
            if (button && managed) applyAbilityRuntime(button, entry.ability);
            displaySlot++;
        });
    }

    function createAbilitySlot(parent, abilityIndex, slot) {
        var button = $.CreatePanel("Button", parent, "SurvivalAbility" + slot);
        button.AddClass("SurvivalAbilitySlot");
        button.hittest = true;
        button.__survivalAbilityIndex = abilityIndex;
        button.__survivalSlot = slot;
        button.SetPanelEvent("onactivate", function () {
            var current = abilityByDisplayIndex(button.__survivalSlot);
            var runtime = applyAbilityRuntime(button, current);
            $.Msg("[SURVIVAL_CAST][CLIENT] BUTTON slot=", String(button.__survivalSlot),
                " ability=", String(current), " available=", String(runtime.available),
                " can_afford=", String(runtime.can_afford),
                " status=", String(runtime.status_text || ""));
            if (current >= 0
                && runtime.removed !== 1
                && runtime.available !== 0) {
                executeAbility(current);
            }
        });
        var ability = $.CreatePanel("DOTAAbilityImage", button, "SurvivalAbilityImage" + slot);
        ability.AddClass("SurvivalAbilityIcon");
        ability.hittest = false;
        ability.abilityname = Abilities.GetAbilityName(abilityIndex);
        applyAbilityRuntime(button, abilityIndex);
        return button;
    }

    function refreshAbilities() {
        hideDeferredHudFeatures();
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) {
            refreshOfficialReturnHomeHotkey([]);
            $.Schedule(1.0, refreshAbilities);
            return;
        }
        var seen = [];
        for (var i = 0; i < 24; i++) {
            var abilityIndex = Entities.GetAbility(unit, i);
            if (abilityIndex !== undefined && abilityIndex >= 0) {
                var abilityName = Abilities.GetAbilityName(abilityIndex);
                var hidden = false;
                try { hidden = Abilities.IsHidden(abilityIndex); } catch (error) {}
                if (abilityName && !hidden) {
                    seen.push({ name: abilityName, slot: i, ability: abilityIndex });
                }
            }
        }
        var signature = seen.map(function (entry) {
            return entry.slot + ":" + entry.name;
        }).join("|");
        refreshAbilities.signature = signature;
        // Valve reuses Ability0/Ability1 panels and may restore DOTADisabled
        // after a selection change. Reapply the authoritative runtime state for
        // the currently selected unit instead of relying only on NetTable events.
        refreshOfficialAbilityRuntime(seen);
        refreshOfficialReturnHomeHotkey(seen);
        $.Schedule(1.0, refreshAbilities);
    }

    function belongsToLegacyHud(target) {
        var current = target;
        while (current && current.GetParent) {
            if (current.id === "SurvivalHeroBottomHUD") return true;
            current = current.GetParent();
        }
        return false;
    }

    function refreshOfficialReturnHomeHotkey(visibleAbilities) {
        var root = officialHudRoot();
        if (!root || !root.FindChildTraverse) return;
        var abilities = officialPanel("abilities")
            || officialPanel("AbilitiesAndStatBranch");
        if (!abilities || !abilities.FindChildTraverse) return;

        // Valve reuses Ability0/Ability1/... panels when selection changes. A
        // label left on one of those panels therefore appears on the next
        // unit's ability in that position. Hide every old marker before finding
        // the current hero's actual return-home ability.
        for (var slot = 0; slot < 24; slot++) {
            var oldPanel = abilities.FindChildTraverse("Ability" + String(slot));
            var oldLabel = oldPanel && oldPanel.FindChildTraverse
                ? oldPanel.FindChildTraverse("SurvivalReturnHomeHotkey") : null;
            if (oldLabel) oldLabel.style.visibility = "collapse";
        }

        var unit = selectedUnit();
        var unitName = unit === undefined || unit < 0
            ? "" : Entities.GetUnitName(unit);
        if (unit === undefined || unit < 0 || !isHeroUnit(unit, unitName)) return;

        var displayIndex = -1;
        for (var index = 0; index < visibleAbilities.length; index++) {
            if (visibleAbilities[index].name === "ability_survival_return_home") {
                displayIndex = index;
                break;
            }
        }
        if (displayIndex < 0) return;

        var abilityPanel = abilities.FindChildTraverse("Ability" + String(displayIndex));
        if (!abilityPanel || belongsToLegacyHud(abilityPanel)) return;
        var buttonPanel = abilityPanel.FindChildTraverse
            ? (abilityPanel.FindChildTraverse("AbilityButton")
                || abilityPanel.FindChildTraverse("ButtonWell")
                || abilityPanel.FindChildTraverse("AbilityImage"))
            : null;
        if (!buttonPanel) return;
        var label = abilityPanel.FindChildTraverse
            ? abilityPanel.FindChildTraverse("SurvivalReturnHomeHotkey") : null;
        if (!label) {
            label = $.CreatePanel("Label", buttonPanel, "SurvivalReturnHomeHotkey");
            label.hittest = false;
            label.text = "F2";
            label.style.horizontalAlign = "left";
            label.style.verticalAlign = "top";
            label.style.minWidth = "20px";
            label.style.height = "17px";
            label.style.padding = "0px 3px";
            label.style.color = "white";
            label.style.fontSize = "12px";
            label.style.fontWeight = "bold";
            label.style.textAlign = "center";
            label.style.backgroundColor = "#05080bdd";
            label.style.border = "1px solid #a4b4bf";
            label.style.zIndex = "20";
        } else if (label.GetParent && label.GetParent() !== buttonPanel
            && label.SetParent) {
            label.SetParent(buttonPanel);
        }
        label.style.visibility = "visible";
    }

    function abilityIndexForSlot(unit, slot) {
        try { return Entities.GetAbility(unit, slot); } catch (error) { return -1; }
    }

    function refreshInventory() {
        // Official Reborn HUD owns inventory rendering and interaction.
    }

    function abilityByDisplayIndex(slot) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        var visible = [];
        for (var i = 0; i < 24; i++) {
            var index = Entities.GetAbility(unit, i);
            if (index === undefined || index < 0) continue;
            var name = Abilities.GetAbilityName(index) || "";
            var hidden = false;
            try { hidden = Abilities.IsHidden(index); } catch (error) {}
            if (name && !hidden && name !== "ability_survival_return_home") {
                visible.push(index);
            }
        }
        return visible[slot] === undefined ? -1 : visible[slot];
    }

    function visibleSlotForAbility(abilityIndex) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        var visibleSlot = 0;
        for (var entitySlot = 0; entitySlot < 24; entitySlot++) {
            var current = abilityIndexForSlot(unit, entitySlot);
            if (current === undefined || current < 0) continue;
            var name = Abilities.GetAbilityName(current) || "";
            var hidden = false;
            try { hidden = Abilities.IsHidden(current); } catch (error) {}
            if (!name || hidden || name === "ability_survival_return_home") continue;
            if (Number(current) === Number(abilityIndex)) return visibleSlot;
            visibleSlot++;
        }
        return -1;
    }

    var pointTargetState = { active: false, unit: -1, ability: -1, name: "" };

    function managedBuildingAction(abilityName) {
        return /^ability_build_/.test(abilityName)
            || /^ability_upgrade_tower/.test(abilityName)
            || /^ability_tower_class_/.test(abilityName)
            || /^(ability_upgrade_(wall|city|farm|gold_mine))$/.test(abilityName)
            || /^(ability_upgrade_gold_mine_(efficiency|crit))$/.test(abilityName)
            || /^(ability_gold_mine_(auto_upgrade|stop_auto_upgrade))$/.test(abilityName);
    }

    function managedAbility(abilityIndex, abilityName, runtime) {
        return (Number(runtime && runtime.ability_entindex) === Number(abilityIndex)
            && Number(runtime && runtime.owner_entindex) === Number(selectedUnit()))
            || managedBuildingAction(abilityName);
    }

    function setPointTargetHint(active, name) {
        var hint = panel("SurvivalPointTargetHint");
        if (!hint) return;
        hint.text = active
            ? ("正在选择建造位置：" + String(name || "建筑") + " · 左键确认 · 右键取消")
            : "";
        hint.SetHasClass("PointTargetActive", !!active);
    }

    function cancelPointTarget(reason) {
        if (!pointTargetState.active) return false;
        $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_CANCEL reason=", String(reason || ""));
        setPointTargetHint(false, "");
        pointTargetState.active = false;
        pointTargetState.unit = -1;
        pointTargetState.ability = -1;
        pointTargetState.name = "";
        GameUI.CustomUIConfig().SurvivalPointTargetState = pointTargetState;
        return true;
    }

    function beginPointTarget(abilityIndex) {
        var unit = selectedUnit();
        var name = "";
        try { name = Abilities.GetAbilityName(abilityIndex) || ""; } catch (error) {}
        pointTargetState.active = true;
        pointTargetState.unit = unit;
        pointTargetState.ability = abilityIndex;
        pointTargetState.name = name;
        GameUI.CustomUIConfig().SurvivalPointTargetState = pointTargetState;
        setPointTargetHint(true, name);
        $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_MODE unit=", String(unit), " ability=", String(abilityIndex), " name=", name);
        return true;
    }

    function pointTargetMouseHandler(eventName, button) {
        if (!pointTargetState.active) return false;
        if (eventName === "pressed" && button === 1) {
            cancelPointTarget("right_click");
            return true;
        }
        if (eventName !== "pressed" || button !== 0) return false;
        var screen = GameUI.GetCursorPosition();
        var world = GameUI.GetScreenWorldPosition(screen);
        if (!world) {
            $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_NO_WORLD");
            return true;
        }
        $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_SEND unit=", String(pointTargetState.unit), " ability=", String(pointTargetState.ability), " x=", String(world[0]), " y=", String(world[1]), " z=", String(world[2]));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_position_request", {
            entindex: pointTargetState.unit,
            ability_entindex: pointTargetState.ability,
            x: world[0], y: world[1], z: world[2],
        });
        cancelPointTarget("submitted");
        return true;
    }

    var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput || {};
    pointInput.Begin = beginPointTarget;
    pointInput.Cancel = cancelPointTarget;
    GameUI.CustomUIConfig().SurvivalPointTargetInput = pointInput;
    var mouseConfig = GameUI.CustomUIConfig();
    mouseConfig.SurvivalMouseHandlers = mouseConfig.SurvivalMouseHandlers || [];
    if (!mouseConfig.SurvivalPointTargetMouseRegistered) {
        mouseConfig.SurvivalPointTargetMouseRegistered = true;
        mouseConfig.SurvivalMouseHandlers.unshift(pointTargetMouseHandler);
    }

    function executeAbility(abilityIndex) {
        if (abilityIndex === undefined || abilityIndex < 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] reject invalid ability index=", String(abilityIndex));
            return false;
        }
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] reject invalid unit=", String(unit));
            return false;
        }
        var runtime = abilityRuntime(abilityIndex);
        if (runtime.removed === 1
            || runtime.available === 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] reject unavailable ability=", String(abilityIndex),
                " available=", String(runtime.available),
                " can_afford=", String(runtime.can_afford),
                " status=", String(runtime.status_text || ""));
            return false;
        }
        if (runtime.can_afford === 0) {
            // Never hard-reject from a replicated snapshot: it can be older than
            // the server account. This log provides immediate diagnostics while
            // the request still reaches the authoritative atomic spend path.
            $.Msg("[SURVIVAL_CAST][CLIENT] LOCAL_RESOURCE_LOW request_sent=1 ability=",
                String(abilityIndex), " resource_version=",
                String(runtime.resource_version || 0), " status=",
                String(runtime.status_text || ""));
        }
        var name = "";
        var behavior = 0;
        try {
            name = Abilities.GetAbilityName(abilityIndex) || "";
            behavior = Number(Abilities.GetBehavior(abilityIndex) || 0);
        } catch (error) {}
        if (name === "ability_survival_return_home") {
            return requestReturnHome("takeover_ability");
        }
        var managed = managedAbility(abilityIndex, name, runtime);
        if ((behavior & 2) !== 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] reject passive ability=", String(abilityIndex),
                " name=", name, " behavior=", String(behavior));
            return false;
        }
        if (!managed) {
            if (!Abilities.ExecuteAbility) {
                $.Warning("[SURVIVAL_CAST][CLIENT] native ExecuteAbility unavailable");
                return false;
            }
            $.Msg("[SURVIVAL_CAST][CLIENT] EXECUTE_NATIVE unit=", String(unit),
                " ability=", String(abilityIndex), " name=", name,
                " behavior=", String(behavior));
            Abilities.ExecuteAbility(abilityIndex, unit, false);
            return true;
        }
        if ((behavior & 16) !== 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_BEGIN unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
            return beginPointTarget(abilityIndex);
        }
        if ((behavior & 4) === 0) {
            $.Warning("[SURVIVAL_CAST][CLIENT] reject unsupported behavior ability="
                + String(abilityIndex) + " name=" + name
                + " behavior=" + String(behavior));
            return false;
        }
        $.Msg("[SURVIVAL_CAST][CLIENT] SEND_NO_TARGET unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_request", {
            entindex: unit,
            ability_entindex: abilityIndex,
        });
        return true;
    }

    // ability_tooltip.js loads first and owns the hover layer. Replace its
    // temporary input implementation with this same dispatcher used by Q/W/E,
    // so managed official-button clicks and hotkeys cannot diverge.
    GameUI.CustomUIConfig().SurvivalAbilityInput = {
        ExecuteAbility: executeAbility
    };

    function castDisplaySlot(slot, source) {
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        var previous = Number(lastHotkeyCastTime[slot] || -100);
        if (now - previous < 0.08) return false;
        lastHotkeyCastTime[slot] = now;
        var abilityIndex = abilityByDisplayIndex(slot);
        $.Msg("[SURVIVAL_CAST][CLIENT] HOTKEY source=", source,
            " display_slot=", String(slot), " ability=", String(abilityIndex));
        if (abilityIndex < 0) return false;
        return executeAbility(abilityIndex);
    }

    function applyAbilityKeyBinds(keys, commandPrefix) {
        if (!Game.CreateCustomKeyBind) return;
        keys.forEach(function (key, slot) {
            Game.CreateCustomKeyBind(key, commandPrefix + String(slot));
        });
        $.Msg("[SURVIVAL_INPUT] KEYBINDS_APPLIED prefix=", commandPrefix,
            " keys=QWERTYU");
    }

    function requestReturnHome(source) {
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        if (now - lastReturnHomeTime < 0.15) return false;
        lastReturnHomeTime = now;
        $.Msg("[SURVIVAL_RETURN_HOME][CLIENT] source=", String(source || "unknown"));
        GameEvents.SendCustomGameEventToServer("ui_return_home_request", {});
        return true;
    }

    GameUI.CustomUIConfig().SurvivalReturnHomeInput = {
        Request: requestReturnHome
    };

    function bindHotkeys() {
        if (bindHotkeys.bound) return;
        bindHotkeys.bound = true;
        var customConfig = GameUI.CustomUIConfig();
        var keys = ["Q", "W", "E", "R", "T", "Y", "U"];
        var inputGeneration = Number(
            customConfig.SurvivalInputGenerationCounter || 0
        ) + 1;
        customConfig.SurvivalInputGenerationCounter = inputGeneration;
        inputGeneration = String(inputGeneration);
        var commandPrefix = "survival_cast_ability_" + inputGeneration + "_";
        var returnHomeCommand = "survival_return_home_" + inputGeneration;
        if (Game.AddCommand && Game.CreateCustomKeyBind) {
            keys.forEach(function (key, slot) {
                var command = commandPrefix + String(slot);
                Game.AddCommand(command, function () {
                    castDisplaySlot(slot, "command");
                }, "施放自定义技能 " + key, 0);
                Game.AddCommand("+" + command, function () {
                    castDisplaySlot(slot, "+command");
                }, "按下自定义技能 " + key, 0);
                Game.AddCommand("-" + command, function () {}, "松开自定义技能 " + key, 0);
            });
            applyAbilityKeyBinds(keys, commandPrefix);
            Game.AddCommand(returnHomeCommand, function () {
                requestReturnHome("command");
            }, "英雄回城", 0);
            Game.AddCommand("+" + returnHomeCommand, function () {
                requestReturnHome("+command");
            }, "按下英雄回城", 0);
            Game.AddCommand("-" + returnHomeCommand, function () {}, "松开英雄回城", 0);
            Game.CreateCustomKeyBind("F2", returnHomeCommand);
            $.Schedule(0.5, function () {
                applyAbilityKeyBinds(keys, commandPrefix);
            });
            $.Schedule(0.5, function () {
                Game.CreateCustomKeyBind("F2", returnHomeCommand);
            });
            $.Schedule(2.5, function () {
                applyAbilityKeyBinds(keys, commandPrefix);
                Game.CreateCustomKeyBind("F2", returnHomeCommand);
            });
        }
        var currentHandler = function (key, down) {
            var normalized = String(key).toUpperCase();
            $.Msg("[SURVIVAL_INPUT] KEY generation=", inputGeneration,
                " key=", normalized, " down=", String(down));
            if (!down) return false;
            if (normalized === "F2") {
                return requestReturnHome("key_dispatch");
            }
            var slot = keys.indexOf(normalized);
            if (slot < 0) return false;
            return castDisplaySlot(slot, "key_dispatch");
        };
        // CustomUIConfig survives Workshop Tools Run sessions, but callbacks
        // from the previous Panorama context do not. Replace both the handler
        // collection and the dispatcher on every HUD load.
        customConfig.SurvivalKeyHandlers = [currentHandler];
        customConfig.SurvivalKeyDispatcherGeneration = inputGeneration;
        if (GameUI.SetKeyPressedCallback) {
            GameUI.SetKeyPressedCallback(function (key, down) {
                var handlers = customConfig.SurvivalKeyHandlers || [];
                for (var index = 0; index < handlers.length; index++) {
                    if (handlers[index](key, down)) return true;
                }
                return false;
            }, this);
            $.Msg("[SURVIVAL_INPUT] BOUND generation=", inputGeneration,
                " handlers=", String(customConfig.SurvivalKeyHandlers.length),
                " command_prefix=", commandPrefix, " keys=QWERTYU,F2");
        } else {
            $.Warning("[SURVIVAL_INPUT] BIND_FAILED generation="
                + inputGeneration + " reason=SetKeyPressedCallback_unavailable");
        }
    }

    function bindHeroPortrait() {
        // 不接管官方头像的悬停事件；只清理上一版曾挂载的自定义 Tooltip 事件。
        var root = $.GetContextPanel();
        var candidates = ["HeroImage", "HeroPortrait", "Portrait", "SelectedHeroImage"];
        candidates.forEach(function (id) {
            var portrait = root.FindChildTraverse(id);
            if (!portrait) return;
            portrait.SetPanelEvent("onmouseover", function () {});
            portrait.SetPanelEvent("onmouseout", function () {});
        });
    }

    // NetTable is the single regular synchronization path. Filter by the
    // portrait unit so the player's hero never overwrites a selected monster.
    CustomNetTables.SubscribeNetTableListener(
        tableName,
        function (name, key, snapshot) {
            if (key !== tableKey) return;
            if (snapshot && Number(snapshot.entindex) === Number(selectedUnit())) {
                update(snapshot);
                refreshHeroPanel(false);
            }
        }
    );
    var initialCombatSnapshot = CustomNetTables.GetTableValue(tableName, tableKey);
    if (initialCombatSnapshot
        && Number(initialCombatSnapshot.entindex) === Number(selectedUnit())) {
        update(initialCombatSnapshot);
    }
    CustomNetTables.SubscribeNetTableListener(
        debugTableName,
        function (name, key, snapshot) {
            if (key === tableKey) renderCombatDebug(snapshot);
        }
    );
    renderCombatDebug(CustomNetTables.GetTableValue(debugTableName, tableKey));
    GameEvents.Subscribe("ui_weapon_synthesis_snapshot", function (snapshot) {
        if (snapshot && snapshot.player_id !== undefined
            && Number(snapshot.player_id) !== Number(playerId)) return;
        var unit = Number(selectedUnit());
        if (unit >= 0) requestSelectedUnitStats(unit, true);
    });
    GameEvents.Subscribe("ui_selected_unit_stats_snapshot", function (snapshot) {
        if (!snapshot || snapshot.success !== 1) return;
        if (Number(snapshot.entindex) !== Number(selectedUnit())) return;
        $.Msg("[SURVIVAL_STATS][CLIENT] SNAPSHOT unit=", String(snapshot.entindex),
            " phase=", String(snapshot.push_phase || snapshot.source || "request"),
            " sequence=", String(snapshot.refresh_sequence || 0),
            " level=", String(snapshot.level),
            " attack=", String(snapshot.attack_min), "-", String(snapshot.attack_max),
            " armor=", String(snapshot.armor));
        update(snapshot);
        refreshHeroPanel(false);
    });
    CustomNetTables.SubscribeNetTableListener(
        "survival_ability_runtime",
        function (name, key, value) {
            var runtimeAbility = Number(key);
            if (runtimeAbility < 0) return;
            var unit = selectedUnit();
            if (value && value.owner_entindex !== undefined
                && Number(value.owner_entindex) !== Number(unit)) return;
            var visibleSlot = visibleSlotForAbility(runtimeAbility);
            var button = visibleSlot >= 0
                ? officialPanel("Ability" + String(visibleSlot)) : null;
            if (button) {
                applyAbilityRuntime(button, runtimeAbility);
            }
            var runtimeName = String(value && value.ability_name || "");
            if (/^ability_upgrade_tower/.test(runtimeName)) {
                var traceSignature = [
                    visibleSlot,
                    !!button,
                    value && value.available,
                    value && value.can_afford,
                    value && value.cost_wood || 0,
                    value && value.cost_gold || 0
                ].join(":");
                if (towerRuntimeTrace[runtimeAbility] !== traceSignature) {
                    towerRuntimeTrace[runtimeAbility] = traceSignature;
                    $.Msg("[TOWER_UPGRADE_RUNTIME][CLIENT] ability=", runtimeName,
                        " ability_entindex=", String(runtimeAbility),
                        " resource_version=", String(value && value.resource_version || 0),
                        " visible_slot=", String(visibleSlot),
                        " panel_found=", String(!!button),
                        " available=", String(value && value.available),
                        " can_afford=", String(value && value.can_afford),
                        " cost_wood=", String(value && value.cost_wood || 0),
                        " cost_gold=", String(value && value.cost_gold || 0),
                        " reason=state_transition");
                }
            }
        }
    );
    GameEvents.Subscribe("ui_ability_cast_result", function (result) {
        $.Msg("[SURVIVAL_CAST][CLIENT] RESULT success=", String(result && result.success),
            " unit=", String(result && result.entindex),
            " ability=", String(result && result.ability_entindex),
            " name=", String(result && result.ability_name),
            " behavior=", String(result && result.behavior),
            " error=", String(result && result.error));
        if (!result || result.success !== 1) return;
        var abilityName = String(result.ability_name || "");
        var refreshesBuilding = /^ability_upgrade_(tower|wall|city)/.test(abilityName)
            || /^ability_tower_class_/.test(abilityName);
        if (!refreshesBuilding) return;
        var unit = Number(result.entindex);
        $.Schedule(0.10, function () {
            if (Number(selectedUnit()) === unit) requestSelectedUnitStats(unit, true);
        });
        $.Schedule(0.35, function () {
            if (Number(selectedUnit()) === unit) requestSelectedUnitStats(unit, true);
        });
    });
    bindHeroPortrait();
    bindHotkeys();
    startPortraitPrewarm();
    subscribeUnitNameSelectionEvents();
    beginUnitNameTransition("initial_load");
    $.Schedule(1.65, function () {
        if (observedSelectedUnit < 0) beginUnitNameTransition("initial_fallback");
    });
    refreshHeroVitalsTick();
    refreshAbilities();
    refreshInventory();
    $.Schedule(2.0, revealBottomHud);
    $.Msg("[CombatStats] authoritative attack overlay ready; server snapshot owns Damage text.");
})();
