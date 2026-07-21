(function () {
    "use strict";

    var playerId = Game.GetLocalPlayerID();
    var tableName = "survival_combat_stats";
    var tableKey = "player_" + playerId;
    var lastRequestedUnit = -1;
    var selectedUnitSnapshot = null;

    function panel(id) { return $("#" + id); }
    function setText(id, value) {
        var target = panel(id);
        if (target) target.text = String(value === undefined ? "" : value);
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
        var bottomHud = panel("SurvivalHeroBottomHUD");
        if (bottomHud) bottomHud.RemoveClass("HudHidden");
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
        var unitName = "npc_dota_hero_axe";
        try {
            unitName = Entities.GetUnitName(unit) || unitName;
            if (scene && scene.__survivalUnitName !== unitName) {
                scene.__survivalUnitName = unitName;
                scene.SetUnit(unitName, "", false);
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
            var displayName = snapshotName
                || configuredNames[unitName]
                || (localizedName && localizedName !== ("#" + unitName)
                    ? localizedName : unitName);
            setText("SurvivalHeroName", displayName);
            setText("SurvivalHeroLevel", snapshotMatches && selectedUnitSnapshot.level !== undefined
                ? selectedUnitSnapshot.level : Entities.GetLevel(unit));
            // 等级已由需求明确隐藏；保留数据刷新但不显示 Lv.1。
            setText("SurvivalHeroLevelText", "");
            var maxHealth = Entities.GetMaxHealth(unit);
            var health = Entities.GetHealth(unit);
            var maxMana = Entities.GetMaxMana(unit);
            var mana = Entities.GetMana(unit);
            setText("SurvivalHeroHealthText", formatNumber(health) + " / " + formatNumber(maxHealth));
            setText("SurvivalHeroManaText", formatNumber(mana) + " / " + formatNumber(maxMana));
            var healthFill = panel("SurvivalHeroHealthFill");
            var manaFill = panel("SurvivalHeroManaFill");
            if (healthFill) healthFill.style.width = (maxHealth > 0 ? (100 * health / maxHealth) : 0) + "%";
            if (manaFill) manaFill.style.width = (maxMana > 0 ? (100 * mana / maxMana) : 0) + "%";
        } catch (error) {}
        requestSelectedUnitStats(unit);
        $.Schedule(0.25, refreshHeroPanel);
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
        var parent = panel("SurvivalHeroAbilityBar");
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

    function bindHotkeys() {
        if (bindHotkeys.bound) return;
        bindHotkeys.bound = true;
        var customConfig = GameUI.CustomUIConfig();
        var keys = ["Q", "W", "E", "R", "T", "Y", "U"];
        if (Game.AddCommand && Game.CreateCustomKeyBind) {
            keys.forEach(function (key, slot) {
                var command = "survival_cast_ability_" + String(slot);
                Game.AddCommand(command, function () {
                    var abilityIndex = abilityByDisplayIndex(slot);
                    $.Msg("[SURVIVAL_CAST][CLIENT] HOTKEY_DOWN key=", key, " display_slot=", String(slot), " ability=", String(abilityIndex));
                    if (abilityIndex >= 0) executeAbility(abilityIndex);
                }, "施放自定义技能 " + key, 0);
                // 当前 Panorama 的 CreateCustomKeyBind 绑定普通命令；
                // 绑定 +command 会导致 Q 不再进入回调。
                Game.CreateCustomKeyBind(key, command);
            });
        }
        customConfig.SurvivalKeyHandlers = customConfig.SurvivalKeyHandlers || [];
        customConfig.SurvivalKeyHandlers.push(function (key, down) {
            if (!down) return false;
            var slot = keys.indexOf(String(key).toUpperCase());
            if (slot < 0) return false;
            var abilityIndex = abilityByDisplayIndex(slot);
            if (abilityIndex < 0) return false;
            return executeAbility(abilityIndex);
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
        var root = $.GetContextPanel();
        var candidates = ["HeroImage", "HeroPortrait", "Portrait", "SelectedHeroImage"];
        var portrait = null;
        candidates.some(function (id) {
            portrait = root.FindChildTraverse(id);
            return !!portrait;
        });
        var scenePortrait = panel("SurvivalHeroPortrait");
        if (scenePortrait && !scenePortrait.__survivalCameraBound) {
            scenePortrait.__survivalCameraBound = true;
            scenePortrait.hittest = true;
            scenePortrait.SetPanelEvent("onactivate", function () {
                var unit = selectedUnit();
                if (unit === undefined || unit < 0) return;
                try { if (GameUI.SelectUnit) GameUI.SelectUnit(unit, false); } catch (error) {}
            });
            scenePortrait.SetPanelEvent("onmousedown", function () {
                var unit = selectedUnit();
                if (unit === undefined || unit < 0) return;
                try { if (GameUI.SetCameraTarget) GameUI.SetCameraTarget(unit); } catch (error) {}
            });
            scenePortrait.SetPanelEvent("onmouseup", function () {
                try { if (GameUI.SetCameraTarget) GameUI.SetCameraTarget(-1); } catch (error) {}
            });
            scenePortrait.SetPanelEvent("oncancelfocus", function () {
                try { if (GameUI.SetCameraTarget) GameUI.SetCameraTarget(-1); } catch (error) {}
            });
        }
        if (portrait && !portrait.__survivalStatsBound) {
            portrait.__survivalStatsBound = true;
            portrait.SetPanelEvent("onmouseover", function () {
                var tip = panel("HeroStatsTooltip");
                if (tip) tip.RemoveClass("Hidden");
            });
            portrait.SetPanelEvent("onmouseout", function () {
                var tip = panel("HeroStatsTooltip");
                if (tip) tip.AddClass("Hidden");
            });
        }
        $.Schedule(0.5, bindHeroPortrait);
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
    refreshHeroPanel();
    refreshAbilities();
    refreshInventory();
    $.Schedule(2.0, revealBottomHud);
    $.Msg("[CombatStats] logical combat panel ready; bottom HUD reveals after 2 seconds.");
})();
