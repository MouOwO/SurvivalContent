(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_combat_stats";
    var tableKey = "player_" + playerId;
    var lastRequestedUnit = -1;
    var selectedUnitSnapshot = null;
    var officialAttackText = "";
    var officialAttackUnit = -1;
    var authoritativeAttackLabel = null;
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

    function isHeroUnit(unit, unitName) {
        try {
            if (Entities.IsHero) return !!Entities.IsHero(unit);
        } catch (error) {}
        return isNativeHero(unitName);
    }

    function officialHudRoot() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        return root;
    }

    function setOfficialPanelVisible(root, id, visible) {
        if (!root || !root.FindChildTraverse) return false;
        var target = root.FindChildTraverse(id);
        if (!target) return false;
        target.style.visibility = visible ? "visible" : "collapse";
        return true;
    }

    function setNativeAttackLabelsVisible(damage, visible) {
        if (!damage || !damage.FindChildTraverse) return;
        ["DamageLabel", "DamageLabelBase", "DamageLabelModifier"].forEach(function (id) {
            var nativeLabel = damage.FindChildTraverse(id);
            if (nativeLabel) nativeLabel.style.visibility = visible ? "visible" : "collapse";
        });
    }

    function ensureRelativeAttackOverlay(root, statsContainer) {
        if (!root || !statsContainer) return null;
        if (authoritativeAttackLabel
            && authoritativeAttackLabel.IsValid
            && authoritativeAttackLabel.IsValid()
            && authoritativeAttackLabel.GetParent
            && authoritativeAttackLabel.GetParent() === statsContainer) {
            return authoritativeAttackLabel;
        }
        var existing = statsContainer.FindChildTraverse
            ? statsContainer.FindChildTraverse("SurvivalAuthoritativeDamageLabel")
            : null;
        authoritativeAttackLabel = existing || $.CreatePanel(
            "Label",
            statsContainer,
            "SurvivalAuthoritativeDamageLabel"
        );
        authoritativeAttackLabel.AddClass("MonoNumbersFont");
        authoritativeAttackLabel.AddClass("StatRegionLabel");
        authoritativeAttackLabel.style.visibility = "collapse";
        authoritativeAttackLabel.style.opacity = "1";
        authoritativeAttackLabel.style.position = "0px 0px 0px";
        authoritativeAttackLabel.style.width = "220px";
        authoritativeAttackLabel.style.height = "fit-children";
        authoritativeAttackLabel.style.fontSize = "14px";
        authoritativeAttackLabel.style.color = "#cccccc";
        authoritativeAttackLabel.style.textAlign = "right";
        authoritativeAttackLabel.style.zIndex = "1000";
        authoritativeAttackLabel.hittest = false;
        return authoritativeAttackLabel;
    }

    function positionRelativeToStatsContainer(damage, statsContainer, overlay) {
        if (!damage || !statsContainer || !overlay
            || !damage.GetPositionWithinWindow
            || !statsContainer.GetPositionWithinWindow) return false;
        var anchor = damage.FindChildTraverse("DamageLabel")
            || damage.FindChildTraverse("DamageLabelContainer");
        if (!anchor || !anchor.GetPositionWithinWindow) return false;

        var anchorPosition = anchor.GetPositionWithinWindow();
        var parentPosition = statsContainer.GetPositionWithinWindow();
        var parentScaleX = Number(statsContainer.actualuiscale_x || 1);
        var parentScaleY = Number(statsContainer.actualuiscale_y || 1);
        var anchorWidth = Number(anchor.actuallayoutwidth || 46);
        var anchorHeight = Number(anchor.actuallayoutheight || 20);
        var left = (Number(anchorPosition.x) - Number(parentPosition.x)) / parentScaleX;
        var top = (Number(anchorPosition.y) - Number(parentPosition.y)) / parentScaleY;

        // 右边缘与官方数字右边缘一致；宽度固定，支持十亿级文本。
        var overlayWidth = 220;
        overlay.style.position = String(left + anchorWidth - overlayWidth)
            + "px " + String(top) + "px 0px";
        overlay.style.width = String(overlayWidth) + "px";
        overlay.style.height = String(Math.max(18, anchorHeight)) + "px";
        return true;
    }

    function writeOfficialAttackText() {
        var root = officialHudRoot();
        if (!root || !root.FindChildTraverse) return;
        var damage = root.FindChildTraverse("Damage");
        var statsContainer = root.FindChildTraverse("stats_container")
            || root.FindChildTraverse("StatContainer");
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
        if (!positionRelativeToStatsContainer(damage, statsContainer, overlay)) return;
        overlay.text = officialAttackText;
        overlay.style.visibility = "visible";
        setNativeAttackLabelsVisible(damage, false);
    }

    function updateOfficialStatsVisibility(unit, unitName) {
        var root = officialHudRoot();
        if (!root) return;

        // 没有权威快照时保留原生数字；快照到达后由覆盖层接管。
        setOfficialPanelVisible(root, "Damage", true);
        writeOfficialAttackText();
        setOfficialPanelVisible(root, "AttackSpeed", true);
        setOfficialPanelVisible(root, "Armor", true);
        setOfficialPanelVisible(root, "MagicResist", false);
        setOfficialPanelVisible(root, "MoveSpeed", false);
        setOfficialPanelVisible(root, "Bounty", false);

        // 官方三围组只对真正的英雄实体显示，建筑、召唤物和怪物整组折叠。
        setOfficialPanelVisible(root, "stragiint", isHeroUnit(unit, unitName));
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
        var incomingName = snapshot.display_name || snapshot.unit_name || "";
        var oldName = selectedUnitSnapshot
            && Number(selectedUnitSnapshot.entindex) === Number(snapshot.entindex)
            ? (selectedUnitSnapshot.display_name || selectedUnitSnapshot.unit_name || "")
            : "";
        if (/^npc_dota_hero_/.test(incomingName)
            && oldName && !/^npc_dota_hero_/.test(oldName)) {
            snapshot.display_name = oldName;
            snapshot.unit_name = oldName;
        }
        selectedUnitSnapshot = snapshot;
        var attack = attackText(snapshot);
        officialAttackText = attack;
        officialAttackUnit = Number(snapshot.entindex);
        writeOfficialAttackText();
        var armor = formatNumber(snapshot.armor);
        // 攻速字段表示每秒攻击次数；缺失时固定显示默认值 0.5，
        // 不允许保留上一选中单位的显示值。
        var attackSpeedValue = snapshot.attack_speed === undefined
            || snapshot.attack_speed === null
            || snapshot.attack_speed === ""
            ? 0.5 : Number(snapshot.attack_speed);
        if (!isFinite(attackSpeedValue) || attackSpeedValue <= 0) attackSpeedValue = 0.5;
        var attackSpeed = formatNumber(attackSpeedValue);
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
        setText(
            "CombatWeaponValue",
            snapshot.weapon_content_id
                ? ("武器 " + (snapshot.weapon_name || snapshot.weapon_content_id))
                : "未装备武器"
        );
        setText(
            "CombatGrowthValue",
            "成长攻击 +" + formatNumber(snapshot.weapon_growth_attack)
                + " · 每次攻击 +" + formatNumber(snapshot.attack_gain_per_attack)
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

    function requestSelectedUnitStats(unit) {
        if (unit === undefined || unit < 0 || Number(unit) === lastRequestedUnit) return;
        lastRequestedUnit = Number(unit);
        $.Msg("[SURVIVAL_STATS][CLIENT] SELECTED_UNIT_CHANGE entindex=", String(unit));
        GameEvents.SendCustomGameEventToServer("ui_selected_unit_stats_request", {
            entindex: unit,
        });
    }

    function refreshHeroPanel() {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) {
            $.Schedule(0.5, refreshHeroPanel);
            return;
        }
        var scene = panel("SurvivalHeroPortrait");
        var unitName = "npc_dota_hero_undying";
        try {
            unitName = Entities.GetUnitName(unit) || unitName;
            updateOfficialStatsVisibility(unit, unitName);
            var unitChanged = heroPanelState.unit !== Number(unit);
            if (unitChanged) {
                heroPanelState.unit = Number(unit);
                heroPanelState.displayName = "";
                heroPanelState.level = null;
                heroPanelState.healthText = "";
                heroPanelState.manaText = "";
                heroPanelState.healthWidth = "";
                heroPanelState.manaWidth = "";
            }
            if (scene || panel("SurvivalHeroPortraitCache")) {
                showPortrait(unitName);
            }
            var snapshotMatches = selectedUnitSnapshot
                && Number(selectedUnitSnapshot.entindex) === Number(unit);
            var snapshotName = snapshotMatches
                ? (selectedUnitSnapshot.display_name || selectedUnitSnapshot.unit_name || "")
                : "";
            var configuredNames = {
                "building_main_city": "主城",
                "building_wall": "城墙",
                "building_arrow_tower": "箭塔",
                "building_gold_mine": "金矿",
                "building_hero_altar": "英雄祭坛",
                "npc_dota_hero_undying": "农民"
            };
            var localizedName = $.Localize("#" + unitName);
            var snapshotIsInternal = /^npc_dota_|^building_/.test(String(snapshotName || ""));
            var displayName = configuredNames[unitName]
                || (!snapshotIsInternal ? snapshotName : "")
                || (localizedName && localizedName !== ("#" + unitName)
                    ? localizedName : unitName);
            // 官方名称控件可能仍返回内部 token；自定义名称优先兜底，禁止裸 token 出现在 HUD。
            if (/^#?(BUILDING_|building_)/.test(String(displayName))) {
                displayName = configuredNames[unitName] || displayName.replace(/^#/, "");
            }
            if (heroPanelState.displayName !== displayName) {
                heroPanelState.displayName = displayName;
                setText("SurvivalHeroName", displayName);
            }
            // 官方 Reborn 名称控件不会可靠读取自定义 addon token；直接覆盖其内部 Label。
            // 仅对自定义/建筑单位覆盖，原生英雄名称仍交给官方控件。
            if (!isNativeHero(unitName)) {
                var hudRoot = officialHudRoot();
                var officialName = hudRoot && hudRoot.FindChildTraverse
                    ? hudRoot.FindChildTraverse("unitname") : null;
                var officialLabel = officialName && officialName.FindChildTraverse
                    ? officialName.FindChildTraverse("UnitNameLabel") : null;
                if (officialLabel) officialLabel.text = displayName;
            }
            var level = snapshotMatches && selectedUnitSnapshot.level !== undefined
                ? selectedUnitSnapshot.level : Entities.GetLevel(unit);
            if (heroPanelState.level !== level) {
                heroPanelState.level = level;
                setText("SurvivalHeroLevel", level);
            }
            setText("SurvivalHeroLevelText", "");
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
        writeOfficialAttackText();
        requestSelectedUnitStats(unit);
        $.Schedule(0.10, refreshHeroPanel);
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
            || runtime.available === 0
            || runtime.can_afford === 0;
        panel.SetHasClass("DOTADisabled", unavailable);
        // 保留 hover 命中以显示不可用原因；点击处理函数会再次校验并拒绝施放。
        panel.hittest = true;
        panel.__survivalRuntimeStatus = runtime.status_text || "";
        panel.__survivalRuntime = runtime;
        return runtime;
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
            if (current >= 0 && runtime.available !== 0 && runtime.can_afford !== 0) {
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
        var parent = panel("SurvivalHeroAbilitySlots") || panel("SurvivalHeroAbilityBar");
        var unit = selectedUnit();
        if (!parent || unit === undefined || unit < 0) {
            $.Schedule(0.5, refreshAbilities);
            return;
        }
        var seen = [];
        for (var i = 0; i < 24; i++) {
            var abilityIndex = Entities.GetAbility(unit, i);
            if (abilityIndex !== undefined && abilityIndex >= 0) {
                var abilityName = Abilities.GetAbilityName(abilityIndex);
                if (abilityName) seen.push({ name: abilityName, slot: i });
            }
        }
        var signature = seen.map(function (entry) {
            return entry.slot + ":" + entry.name;
        }).join("|");
        if (parent.__survivalAbilitySignature !== signature) {
            parent.__survivalAbilitySignature = signature;
            parent.RemoveAndDeleteChildren();
            seen.forEach(function (entry, displayIndex) {
                // DOTAAbilityImage 只是图像控件，不保证产生 onactivate。
                // 用 Button 作为真正的交互根节点，再把原生技能图像放入按钮。
                var button = $.CreatePanel("Button", parent, "Ability" + entry.slot);
                button.AddClass("SurvivalAbilitySlot");
                button.hittest = true;
                button.__survivalSlot = entry.slot;
                button.SetPanelEvent("onactivate", function () {
                    var currentUnit = selectedUnit();
                    var index = Entities.GetAbility(currentUnit, button.__survivalSlot);
                    var runtime = applyAbilityRuntime(button, index);
                    $.Msg("[SURVIVAL_CAST][CLIENT] BUTTON slot=", String(button.__survivalSlot),
                        " unit=", String(currentUnit), " ability=", String(index),
                        " available=", String(runtime.available),
                        " can_afford=", String(runtime.can_afford),
                        " status=", String(runtime.status_text || ""));
                    if (index === undefined || index < 0
                        || runtime.available === 0 || runtime.can_afford === 0) return;
                    executeAbility(index);
                });
                var ability = $.CreatePanel("DOTAAbilityImage", button, "AbilityImage" + entry.slot);
                ability.hittest = false;
                ability.abilityname = entry.name;
                applyAbilityRuntime(button, abilityIndexForSlot(unit, entry.slot));
                var hotkey = ["Q", "W", "E", "R", "T", "Y", "U"][displayIndex];
                if (hotkey) {
                    var keyLabel = $.CreatePanel("Label", button, "");
                    keyLabel.AddClass("SurvivalAbilityHotkey");
                    keyLabel.hittest = false;
                    keyLabel.text = hotkey;
                }
            });
        }
        seen.forEach(function (entry) {
            var button = panel("Ability" + entry.slot);
            if (button) applyAbilityRuntime(button, abilityIndexForSlot(unit, entry.slot));
        });
        $.Schedule(0.5, refreshAbilities);
    }

    function abilityIndexForSlot(unit, slot) {
        try { return Entities.GetAbility(unit, slot); } catch (error) { return -1; }
    }

    function refreshInventory() {
        var parent = panel("SurvivalHeroInventory");
        var unit = selectedUnit();
        if (!parent || unit === undefined || unit < 0) {
            $.Schedule(0.5, refreshInventory);
            return;
        }
        var signature = [];
        for (var i = 0; i < 6; i++) {
            var item = Entities.GetItemInSlot(unit, i);
            signature.push(item >= 0 ? Abilities.GetAbilityName(item) : "");
        }
        var key = signature.join("|");
        if (parent.__survivalInventorySignature !== key) {
            parent.__survivalInventorySignature = key;
            parent.RemoveAndDeleteChildren();
            signature.forEach(function (name, index) {
                var slot = $.CreatePanel("Panel", parent, "inventory_slot_" + index);
                slot.AddClass("SurvivalInventorySlot");
                slot.hittest = true;
                if (name) {
                    var item = $.CreatePanel("DOTAItemImage", slot, "");
                    item.hittest = true;
                    item.itemname = name;
                }
            });
        }
        $.Schedule(0.5, refreshInventory);
    }

    function abilityByDisplayIndex(slot) {
        var unit = selectedUnit();
        if (unit === undefined || unit < 0) return -1;
        var visible = [];
        for (var i = 0; i < 24; i++) {
            var index = Entities.GetAbility(unit, i);
            if (index === undefined || index < 0) continue;
            var name = Abilities.GetAbilityName(index) || "";
            if (name) visible.push(index);
        }
        return visible[slot] === undefined ? -1 : visible[slot];
    }

    var pointTargetState = { active: false, unit: -1, ability: -1, name: "" };

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
        if (runtime.removed === 1 || runtime.available === 0 || runtime.can_afford === 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] reject unavailable ability=", String(abilityIndex),
                " available=", String(runtime.available),
                " can_afford=", String(runtime.can_afford),
                " status=", String(runtime.status_text || ""));
            return false;
        }
        var name = "";
        var behavior = 0;
        try {
            name = Abilities.GetAbilityName(abilityIndex) || "";
            behavior = Number(Abilities.GetBehavior(abilityIndex) || 0);
        } catch (error) {}
        if ((behavior & 16) !== 0) {
            $.Msg("[SURVIVAL_CAST][CLIENT] POINT_TARGET_BEGIN unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
            return beginPointTarget(abilityIndex);
        }
        $.Msg("[SURVIVAL_CAST][CLIENT] SEND_NO_TARGET unit=", String(unit), " ability=", String(abilityIndex), " name=", name, " behavior=", String(behavior));
        GameEvents.SendCustomGameEventToServer("ui_ability_cast_request", {
            entindex: unit,
            ability_entindex: abilityIndex,
        });
        return true;
    }

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

    function applyAbilityKeyBinds(keys) {
        if (!Game.CreateCustomKeyBind) return;
        keys.forEach(function (key, slot) {
            Game.CreateCustomKeyBind(key, "survival_cast_ability_" + String(slot));
        });
        $.Msg("[SURVIVAL_CAST][CLIENT] KEYBINDS_APPLIED keys=QWERTYU");
    }

    function bindHotkeys() {
        if (bindHotkeys.bound) return;
        bindHotkeys.bound = true;
        var customConfig = GameUI.CustomUIConfig();
        var keys = ["Q", "W", "E", "R", "T", "Y", "U"];
        if (Game.AddCommand && Game.CreateCustomKeyBind) {
            keys.forEach(function (key, slot) {
                var command = "survival_cast_ability_" + String(slot);
                Game.AddCommand(command, function () {
                    castDisplaySlot(slot, "command");
                }, "施放自定义技能 " + key, 0);
                Game.AddCommand("+" + command, function () {
                    castDisplaySlot(slot, "+command");
                }, "按下自定义技能 " + key, 0);
                Game.AddCommand("-" + command, function () {}, "松开自定义技能 " + key, 0);
            });
            applyAbilityKeyBinds(keys);
            $.Schedule(0.5, function () { applyAbilityKeyBinds(keys); });
            $.Schedule(2.5, function () { applyAbilityKeyBinds(keys); });
        }
        customConfig.SurvivalKeyHandlers = customConfig.SurvivalKeyHandlers || [];
        customConfig.SurvivalKeyHandlers.push(function (key, down) {
            var normalized = String(key).toUpperCase();
            $.Msg("[SURVIVAL_CAST][CLIENT] KEY_DISPATCH key=", normalized, " down=", String(down));
            if (!down) return false;
            var slot = keys.indexOf(normalized);
            if (slot < 0) return false;
            return castDisplaySlot(slot, "key_dispatch");
        });
        if (GameUI.SetKeyPressedCallback && !customConfig.SurvivalKeyDispatcherBound) {
            customConfig.SurvivalKeyDispatcherBound = true;
            GameUI.SetKeyPressedCallback(function (key, down) {
                var handlers = customConfig.SurvivalKeyHandlers || [];
                for (var index = 0; index < handlers.length; index++) {
                    if (handlers[index](key, down)) return true;
                }
                return false;
            }, this);
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

    // HUD 只消费当前选中单位的数据。英雄战斗服务的实时事件仍保留，
    // 但必须先过滤 entindex，防止玩家英雄快照覆盖当前选中的怪物。
    GameEvents.Subscribe("ui_combat_stats_snapshot", function (snapshot) {
        if (snapshot && Number(snapshot.entindex) === Number(selectedUnit())) {
            update(snapshot);
        }
    });
    GameEvents.Subscribe("ui_selected_unit_stats_snapshot", function (snapshot) {
        if (!snapshot || snapshot.success !== 1) return;
        if (Number(snapshot.entindex) !== Number(selectedUnit())) return;
        update(snapshot);
    });
    CustomNetTables.SubscribeNetTableListener(
        "survival_ability_runtime",
        function (name, key, value) {
            var runtimeAbility = Number(key);
            if (runtimeAbility < 0) return;
            var unit = selectedUnit();
            for (var slot = 0; slot < 24; slot++) {
                var current = abilityIndexForSlot(unit, slot);
                if (current === runtimeAbility) {
                    var button = panel("Ability" + slot);
                    if (button) applyAbilityRuntime(button, current);
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
    });
    bindHeroPortrait();
    bindHotkeys();
    startPortraitPrewarm();
    $.Schedule(1.65, refreshHeroPanel);
    refreshAbilities();
    refreshInventory();
    $.Schedule(2.0, revealBottomHud);
    $.Msg("[CombatStats] authoritative attack overlay ready; server snapshot owns Damage text.");
})();
