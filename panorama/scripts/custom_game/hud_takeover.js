(function () {
    "use strict";

    var config = GameUI.CustomUIConfig();
    var takeover = config.SurvivalHudTakeover || {};
    var playerId = Game.GetLocalPlayerID();
    var hotkeys = ["Q", "W", "E", "R", "T", "Y", "U"];
    var slots = [];
    var officialStates = {};
    var signature = "";
    var activeAbility = -1;
    var activePanel = null;
    var refreshSerial = 0;
    var anchorDiagnostic = "";
    var geometryDiagnostic = "";
    var takeoverMapDiagnostic = "";
    var surveySignature = "";
    var surveyPending = false;
    var surveySerial = 0;
    var groundItemLocalizationDiagnostic = "";
    var disabledIsolationLogged = false;
    var fixedCellSize = 52;
    var fixedCellGap = 4;
    var takeoverBuild = "grid52_preset_v6";
    var calibrationPreset = {
        version: 1,
        alignment: "middle_left",
        offsetX: 5,
        offsetY: 35
    };
    var calibrationAlignments = {
        top_left: { x: 0.0, y: 0.0, label: "左上" },
        top_center: { x: 0.5, y: 0.0, label: "中上" },
        top_right: { x: 1.0, y: 0.0, label: "右上" },
        middle_left: { x: 0.0, y: 0.5, label: "左中" },
        center: { x: 0.5, y: 0.5, label: "中心" },
        middle_right: { x: 1.0, y: 0.5, label: "右中" },
        bottom_left: { x: 0.0, y: 1.0, label: "左下" },
        bottom_center: { x: 0.5, y: 1.0, label: "中下" },
        bottom_right: { x: 1.0, y: 1.0, label: "右下" }
    };
    var storedCalibration = config.SurvivalAbilityCalibrationState;
    var calibration = storedCalibration || { visible: false, last: null };

    function applyCalibrationPreset(source, visible) {
        calibration.presetVersion = calibrationPreset.version;
        calibration.alignment = calibrationPreset.alignment;
        calibration.offsetX = calibrationPreset.offsetX;
        calibration.offsetY = calibrationPreset.offsetY;
        calibration.source = String(source || "preset_default");
        calibration.visible = !!visible;
    }

    if (Number(calibration.presetVersion) !== calibrationPreset.version) {
        applyCalibrationPreset(storedCalibration ? "preset_migration" : "preset_default",
            calibration.visible);
    }
    if (!calibrationAlignments[calibration.alignment]
        || !isFinite(Number(calibration.offsetX))
        || !isFinite(Number(calibration.offsetY))) {
        applyCalibrationPreset("preset_recovery", calibration.visible);
    }
    calibration.visible = !!calibration.visible;
    calibration.offsetX = Number(calibration.offsetX);
    calibration.offsetY = Number(calibration.offsetY);
    calibration.source = String(calibration.source || "runtime_state");
    config.SurvivalAbilityCalibrationState = calibration;
    var observedSelectedUnit = -1;
    var selectionTransition = null;
    var selectionTransitionSerial = 0;
    var transitionContainerState = null;
    var selectionRetryDelays = [0.0, 0.016, 0.05, 0.10, 0.20];
    var selectionTransitionUnit = -1;

    function byId(id) { return $("#" + id); }

    function rootPanel() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        return root;
    }

    function officialAbilitiesRowAnchor() {
        var root = rootPanel();
        if (!root || !root.FindChildTraverse) return null;
        var branch = root.FindChildTraverse("AbilitiesAndStatBranch");
        var abilities = branch && branch.FindChildTraverse
            ? branch.FindChildTraverse("abilities") : null;
        return abilities || root.FindChildTraverse("abilities") || null;
    }

    function officialAbilitiesContainer() {
        var abilities = officialAbilitiesRowAnchor();
        if (abilities) return abilities;
        var root = rootPanel();
        return root && root.FindChildTraverse
            ? root.FindChildTraverse("AbilitiesAndStatBranch") : null;
    }

    function officialAbility(displayIndex) {
        var abilities = officialAbilitiesContainer();
        if (!abilities || !abilities.FindChildTraverse) return null;
        return abilities.FindChildTraverse("Ability" + String(displayIndex));
    }

    function officialAbilityAnchor(panel) {
        if (!panel || !panel.FindChildTraverse) return panel;
        return panel.FindChildTraverse("AbilityButton")
            || panel.FindChildTraverse("ButtonWell")
            || panel;
    }

    function officialAbilityVisual(panel) {
        if (!panel || !panel.FindChildTraverse) return null;
        return panel.FindChildTraverse("ButtonWell")
            || panel.FindChildTraverse("AbilityButton")
            || null;
    }

    function diagnoseAnchors(entries, missingIndex, detail) {
        var next = !officialAbilitiesContainer()
            ? "missing_container"
            : (detail || (missingIndex >= 0
                ? "missing_Ability" + String(missingIndex)
                : "ready_" + String(entries.length)));
        if (next === anchorDiagnostic) return;
        anchorDiagnostic = next;
        $.Msg("[SURVIVAL_TAKEOVER] anchor_state=", next,
            " visible_abilities=", String(entries.length));
    }

    function selectedUnit() {
        try {
            var portrait = Players.GetLocalPlayerPortraitUnit();
            if (portrait !== undefined && portrait >= 0) return portrait;
        } catch (error) {}
        return Players.GetPlayerHeroEntityIndex(playerId);
    }

    function runtimeFor(abilityIndex) {
        return CustomNetTables.GetTableValue(
            "survival_ability_runtime", String(abilityIndex)
        ) || {};
    }

    function asArray(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return value[key]; });
    }

    function setText(id, value) {
        var target = byId(id);
        if (target) target.text = String(value === undefined ? "" : value);
    }

    function localize(key, fallback) {
        var value = "";
        try { value = $.Localize("#" + key); } catch (error) {}
        return !value || value === "#" + key ? (fallback || "") : value;
    }

    function localizedName(abilityName) {
        return localize("DOTA_Tooltip_ability_" + abilityName, abilityName);
    }

    function localizedDescription(abilityName) {
        return localize(
            "DOTA_Tooltip_ability_" + abilityName + "_Description", ""
        );
    }

    function diagnoseGroundItemLocalization() {
        var controlRows = [
            "addon_game_name",
            "DOTA_Tooltip_ability_item_survival_challenge_reward"
        ].map(function (key) {
            return "control:" + key + "=" + String($.Localize("#" + key) || "");
        });
        var itemNames = [
            "item_survival_synthesis_gem_shell",
            "item_survival_molten_core_01_shell",
            "item_survival_molten_core_02_shell",
            "item_survival_molten_core_03_shell",
            "item_survival_molten_core_04_shell",
            "item_survival_ice_soul_ember_shell"
        ];
        var rows = itemNames.map(function (itemName) {
            var nameKey = "DOTA_Tooltip_ability_" + itemName;
            var descriptionKey = nameKey + "_Description";
            var name = $.Localize("#" + nameKey);
            var description = $.Localize("#" + descriptionKey);
            return itemName + ":name=" + String(name || "")
                + ":description=" + String(description || "");
        });
        var next = "build=" + takeoverBuild
            + "|cell=" + String(fixedCellSize)
            + "|gap=" + String(fixedCellGap)
            + "|" + controlRows.concat(rows).join("|");
        if (next === groundItemLocalizationDiagnostic) return;
        groundItemLocalizationDiagnostic = next;
        $.Msg("[SURVIVAL_GROUND_ITEM_LOCALIZATION] ", next);
    }

    function addField(container, label, value) {
        if (!container || value === undefined || value === null || value === "") return;
        var row = $.CreatePanel("Panel", container, "");
        row.AddClass("AbilityFieldRow");
        var left = $.CreatePanel("Label", row, "");
        left.AddClass("AbilityFieldLabel");
        left.text = String(label || "");
        var right = $.CreatePanel("Label", row, "");
        right.AddClass("AbilityFieldValue");
        right.text = String(value);
    }

    function behaviorText(behavior) {
        if ((behavior & 2) !== 0) return "被动技能";
        if ((behavior & 16) !== 0) return "点目标技能";
        if ((behavior & 8) !== 0) return "单位目标技能（暂未接管）";
        if ((behavior & 512) !== 0) return "切换技能（暂未接管）";
        if ((behavior & 4) !== 0) return "无目标技能";
        return "技能";
    }

    function visibleAbilities() {
        var unit = selectedUnit();
        var result = [];
        if (unit === undefined || unit < 0) return result;
        for (var entitySlot = 0; entitySlot < 24; entitySlot++) {
            var ability = -1;
            try { ability = Entities.GetAbility(unit, entitySlot); } catch (error) {}
            if (ability === undefined || ability < 0) continue;
            var name = "";
            var hidden = false;
            try {
                name = Abilities.GetAbilityName(ability) || "";
                hidden = !!Abilities.IsHidden(ability);
            } catch (error) {}
            if (!name || hidden || name.indexOf("special_bonus_") === 0) continue;
            result.push({ ability: ability, name: name, entitySlot: entitySlot });
        }
        return result;
    }

    function rememberOfficial(displayIndex, panel) {
        if (!panel) return;
        var states = officialStates[displayIndex] || [];
        for (var index = 0; index < states.length; index++) {
            if (states[index].panel === panel) return;
        }
        states.push({
            panel: panel,
            opacity: panel.style.opacity,
            hittest: panel.hittest,
            hittestchildren: panel.hittestchildren
        });
        officialStates[displayIndex] = states;
    }

    function suppressOfficial(displayIndex, panel) {
        if (!panel) return;
        var ids = [
            "HotkeyContainer", "AbilityCharges", "AbilityLevelContainer"
        ];
        var visual = officialAbilityVisual(panel);
        if (visual) {
            rememberOfficial(displayIndex, visual);
            visual.style.opacity = "0";
            visual.hittest = false;
            visual.hittestchildren = false;
        }
        ids.forEach(function (id) {
            var target = panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
            if (!target || target === visual) return;
            rememberOfficial(displayIndex, target);
            target.style.opacity = "0";
            target.hittest = false;
            target.hittestchildren = false;
        });
    }

    function restoreOfficial() {
        Object.keys(officialStates).forEach(function (key) {
            officialStates[key].forEach(function (state) {
                var panel = state.panel;
                if (!panel || (panel.IsValid && !panel.IsValid())) return;
                panel.style.opacity = state.opacity;
                panel.hittest = state.hittest;
                panel.hittestchildren = state.hittestchildren;
            });
        });
        officialStates = {};
    }

    function suppressOfficialContainerForTransition() {
        var container = officialAbilitiesContainer();
        if (!container) return;
        if (!transitionContainerState || transitionContainerState.panel !== container) {
            restoreOfficialContainerAfterTransition();
            transitionContainerState = {
                panel: container,
                opacity: container.style.opacity,
                hittest: container.hittest,
                hittestchildren: container.hittestchildren
            };
        }
        container.style.opacity = "0";
        container.hittest = false;
        container.hittestchildren = false;
    }

    function restoreOfficialContainerAfterTransition() {
        if (!transitionContainerState) return;
        var state = transitionContainerState;
        var panel = state.panel;
        if (panel && (!panel.IsValid || panel.IsValid())) {
            panel.style.opacity = state.opacity;
            panel.hittest = state.hittest;
            panel.hittestchildren = state.hittestchildren;
        }
        transitionContainerState = null;
    }

    function forceOfficialSurveyVisible(panel) {
        if (!panel) return;
        panel.style.opacity = "1";
        panel.style.visibility = "visible";
        panel.hittest = true;
        panel.hittestchildren = true;
    }

    function hideTakeoverSlotsForSurvey() {
        var row = byId("SurvivalAbilityTakeoverRow");
        if (row) row.style.visibility = "collapse";
    }

    function panelId(panel) {
        if (!panel) return "";
        try { return String(panel.id || ""); } catch (error) { return ""; }
    }

    function positionOf(panel) {
        if (!panel || !panel.GetPositionWithinWindow) return { x: 0, y: 0 };
        var position = panel.GetPositionWithinWindow();
        return { x: Number(position.x || 0), y: Number(position.y || 0) };
    }

    function panelType(panel) {
        if (!panel) return "";
        try {
            if (panel.paneltype !== undefined) return String(panel.paneltype);
            if (panel.GetPanelType) return String(panel.GetPanelType());
        } catch (error) {}
        return "unknown";
    }

    function panelClasses(panel) {
        if (!panel) return "";
        try {
            if (panel.GetClasses) {
                var classes = panel.GetClasses();
                return Array.isArray(classes) ? classes.join(",") : String(classes || "");
            }
        } catch (error) {}
        return "";
    }

    function styleValue(panel, name) {
        if (!panel || !panel.style) return "";
        try { return String(panel.style[name] || ""); } catch (error) { return ""; }
    }

    function collectOfficialAbilityVisuals() {
        var abilities = officialAbilitiesContainer();
        var result = [];
        var seen = [];
        if (!abilities || !abilities.FindChildTraverse) return result;
        for (var nodeIndex = 0; nodeIndex < 24; nodeIndex++) {
            var panel = abilities.FindChildTraverse("Ability" + String(nodeIndex));
            if (!panel || seen.indexOf(panel) >= 0) continue;
            seen.push(panel);
            if (panel.IsValid && !panel.IsValid()) continue;
            var anchor = officialAbilityAnchor(panel);
            var visual = officialAbilityVisual(panel);
            if (!anchor || !visual || !anchor.GetPositionWithinWindow) continue;
            if (panel.visible === false || anchor.visible === false) continue;
            if (styleValue(panel, "visibility") === "collapse"
                || styleValue(anchor, "visibility") === "collapse") continue;
            var width = Number(anchor.actuallayoutwidth || 0);
            var height = Number(anchor.actuallayoutheight || 0);
            if (!isFinite(width) || !isFinite(height) || width <= 0 || height <= 0) continue;
            var position = positionOf(anchor);
            result.push({
                nodeIndex: nodeIndex,
                id: panelId(panel) || ("Ability" + String(nodeIndex)),
                panel: panel,
                anchor: anchor,
                visual: visual,
                x: position.x,
                y: position.y,
                width: width,
                height: height
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

    function logTakeoverMap(entries, officialVisuals, mappings, mode, detail, reason) {
        var officialIds = officialVisuals.map(function (candidate) {
            return candidate.id;
        }).join("|");
        var anchors = officialVisuals.map(function (candidate) {
            return panelId(candidate.anchor) + ":"
                + String(Math.round(candidate.width * 1000) / 1000) + "x"
                + String(Math.round(candidate.height * 1000) / 1000) + "@"
                + String(Math.round(candidate.x * 1000) / 1000) + ","
                + String(Math.round(candidate.y * 1000) / 1000);
        }).join("|");
        var visualOrder = mappings && mappings.length > 0
            ? mappings.map(function (mapping, displayIndex) {
                return String(displayIndex) + ":" + mapping.official.id
                    + "->" + mapping.entry.name;
            }).join("|")
            : entries.map(function (entry, displayIndex) {
                return String(displayIndex) + ":unmapped->" + entry.name;
            }).join("|");
        var next = [
            String(selectedUnit()), mode, detail, entries.length,
            officialIds, anchors, visualOrder
        ].join("||");
        if (next === takeoverMapDiagnostic) return;
        takeoverMapDiagnostic = next;
        $.Msg("[SURVIVAL_TAKEOVER_MAP] unit=", String(selectedUnit()),
            " mode=", String(mode),
            " entries=", String(entries.length),
            " official_count=", String(officialVisuals.length),
            " official_ids=", officialIds || "<none>",
            " anchors=", anchors || "<none>",
            " visual_order=", visualOrder || "<none>",
            " detail=", String(detail || ""),
            " reason=", String(reason || ""));
    }

    function surveyNodeData(panel, depth, path) {
        var position = positionOf(panel);
        return {
            panel: panel,
            depth: depth,
            path: path,
            id: panelId(panel),
            type: panelType(panel),
            classes: panelClasses(panel),
            x: position.x,
            y: position.y,
            width: Number(panel.actuallayoutwidth || 0),
            height: Number(panel.actuallayoutheight || 0),
            scaleX: Number(panel.actualuiscale_x || 0),
            scaleY: Number(panel.actualuiscale_y || 0),
            offsetX: Number(panel.actualxoffset || 0),
            offsetY: Number(panel.actualyoffset || 0),
            visible: panel.visible,
            hittest: panel.hittest,
            hittestchildren: panel.hittestchildren,
            visibility: styleValue(panel, "visibility"),
            opacity: styleValue(panel, "opacity"),
            positionStyle: styleValue(panel, "position"),
            widthStyle: styleValue(panel, "width"),
            heightStyle: styleValue(panel, "height"),
            childCount: panel.GetChildCount ? panel.GetChildCount() : 0
        };
    }

    function collectSurveyTree(panel, depth, path, output) {
        if (!panel) return;
        var id = panelId(panel) || ("<anonymous_" + String(depth) + ">");
        var currentPath = path ? path + "/" + id : id;
        output.push(surveyNodeData(panel, depth, currentPath));
        var count = panel.GetChildCount ? panel.GetChildCount() : 0;
        for (var index = 0; index < count; index++) {
            collectSurveyTree(panel.GetChild(index), depth + 1, currentPath, output);
        }
    }

    function surveySignatureFor(entries, tree, candidates) {
        var parts = [String(selectedUnit()), entries.map(function (entry) {
            return entry.ability + ":" + entry.name;
        }).join("|")];
        tree.forEach(function (node) {
            parts.push([
                node.path, node.type, node.childCount, node.visible,
                node.visibility, node.x, node.y, node.width, node.height
            ].join(":"));
        });
        candidates.forEach(function (candidate) {
            parts.push([
                candidate.slot, candidate.name, candidate.found,
                candidate.data ? candidate.data.x : 0,
                candidate.data ? candidate.data.y : 0,
                candidate.data ? candidate.data.width : 0,
                candidate.data ? candidate.data.height : 0
            ].join(":"));
        });
        return parts.join("||");
    }

    function logSurveyNode(prefix, node, extra) {
        $.Msg(prefix,
            extra || "",
            " depth=", String(node.depth),
            " path=", node.path,
            " id=", node.id,
            " type=", node.type,
            " classes=", node.classes,
            " window=", String(node.x), ",", String(node.y),
            " layout=", String(node.width), "x", String(node.height),
            " scale=", String(node.scaleX), ",", String(node.scaleY),
            " offset=", String(node.offsetX), ",", String(node.offsetY),
            " visible=", String(node.visible),
            " css_visibility=", node.visibility,
            " css_opacity=", node.opacity,
            " hittest=", String(node.hittest),
            " hittestchildren=", String(node.hittestchildren),
            " css_position=", node.positionStyle,
            " css_size=", node.widthStyle, "x", node.heightStyle,
            " children=", String(node.childCount));
    }

    function dumpOfficialAbilitySurvey(entries, reason, force) {
        var first = officialAbility(0);
        if (!first) {
            var missingSignature = "missing|" + String(selectedUnit()) + "|"
                + entries.map(function (entry) {
                    return entry.ability + ":" + entry.name;
                }).join("|");
            if (!force && missingSignature === surveySignature) return;
            surveySignature = missingSignature;
            $.Msg("[SURVIVAL_ABILITY_SURVEY_BEGIN] missing=Ability0 reason=",
                String(reason || ""));
            return;
        }
        var tree = [];
        collectSurveyTree(first, 0, "", tree);
        var candidates = [];
        entries.forEach(function (entry, displayIndex) {
            var slot = officialAbility(displayIndex);
            ["AbilityButton", "ButtonWell", "AbilityImage"].forEach(function (name) {
                var candidate = slot && slot.FindChildTraverse
                    ? slot.FindChildTraverse(name) : null;
                candidates.push({
                    slot: displayIndex,
                    ability: entry.ability,
                    abilityName: entry.name,
                    name: name,
                    found: !!candidate,
                    data: candidate ? surveyNodeData(candidate, 0, "Ability"
                        + String(displayIndex) + "/" + name) : null
                });
            });
        });
        var nextSignature = surveySignatureFor(entries, tree, candidates);
        if (!force && nextSignature === surveySignature) return;
        surveySignature = nextSignature;
        surveySerial += 1;
        $.Msg("[SURVIVAL_ABILITY_SURVEY_BEGIN] dump=", String(surveySerial),
            " reason=", String(reason || ""),
            " unit=", String(selectedUnit()),
            " abilities=", String(entries.length),
            " tree_nodes=", String(tree.length));
        entries.forEach(function (entry, displayIndex) {
            var slot = officialAbility(displayIndex);
            if (!slot) {
                $.Msg("[SURVIVAL_ABILITY_SLOT] dump=", String(surveySerial),
                    " slot=", String(displayIndex), " missing=true ability=",
                    String(entry.ability), " name=", entry.name);
                return;
            }
            logSurveyNode("[SURVIVAL_ABILITY_SLOT]", surveyNodeData(
                slot, 0, "Ability" + String(displayIndex)
            ), " dump=" + String(surveySerial) + " slot=" + String(displayIndex)
                + " ability=" + String(entry.ability) + " name=" + entry.name);
        });
        candidates.forEach(function (candidate) {
            if (!candidate.found) {
                $.Msg("[SURVIVAL_ABILITY_CANDIDATE] dump=", String(surveySerial),
                    " slot=", String(candidate.slot),
                    " ability=", String(candidate.ability),
                    " name=", candidate.abilityName,
                    " candidate=", candidate.name, " found=false");
                return;
            }
            logSurveyNode("[SURVIVAL_ABILITY_CANDIDATE]", candidate.data,
                " dump=" + String(surveySerial) + " slot=" + String(candidate.slot)
                    + " ability=" + String(candidate.ability) + " name="
                    + candidate.abilityName + " candidate=" + candidate.name
                    + " found=true");
        });
        tree.forEach(function (node) {
            logSurveyNode("[SURVIVAL_ABILITY_TREE]", node,
                " dump=" + String(surveySerial));
        });
        $.Msg("[SURVIVAL_ABILITY_SURVEY_END] dump=", String(surveySerial),
            " unit=", String(selectedUnit()),
            " candidates=", String(candidates.length),
            " tree_nodes=", String(tree.length));
    }

    function requestOfficialAbilitySurvey(entries, reason, force) {
        if (surveyPending) return;
        surveyPending = true;
        $.Schedule(0.0, function () {
            surveyPending = false;
            dumpOfficialAbilitySurvey(entries, reason, force);
        });
    }

    function diagnoseGeometry(customPanel, officialPanel, layer, calculated, displayIndex) {
        if (displayIndex !== 0) return;
        var source = positionOf(officialPanel);
        var parent = positionOf(layer);
        var signature = [
            source.x, source.y, officialPanel.actuallayoutwidth,
            officialPanel.actuallayoutheight, officialPanel.actualuiscale_x,
            officialPanel.actualuiscale_y, parent.x, parent.y,
            layer.actuallayoutwidth, layer.actuallayoutheight,
            layer.actualuiscale_x, layer.actualuiscale_y,
            calculated.x, calculated.y, calculated.width, calculated.height
        ].join("|");
        if (signature === geometryDiagnostic) return;
        geometryDiagnostic = signature;
        $.Schedule(0.0, function () {
            if (!customPanel || !customPanel.IsValid || !customPanel.IsValid()) return;
            var actual = positionOf(customPanel);
            $.Msg("[SURVIVAL_GEOMETRY] official=", panelId(officialPanel),
                " official_parent=", panelId(officialPanel.GetParent ? officialPanel.GetParent() : null),
                " source=", String(source.x), ",", String(source.y),
                " source_size=", String(officialPanel.actuallayoutwidth), "x",
                String(officialPanel.actuallayoutheight),
                " source_scale=", String(officialPanel.actualuiscale_x), ",",
                String(officialPanel.actualuiscale_y),
                " layer=", panelId(layer),
                " layer_parent=", panelId(layer.GetParent ? layer.GetParent() : null),
                " layer_pos=", String(parent.x), ",", String(parent.y),
                " layer_size=", String(layer.actuallayoutwidth), "x",
                String(layer.actuallayoutheight),
                " layer_scale=", String(layer.actualuiscale_x), ",",
                String(layer.actualuiscale_y),
                " calculated=", String(calculated.x), ",", String(calculated.y),
                " ", String(calculated.width), "x", String(calculated.height),
                " custom_actual=", String(actual.x), ",", String(actual.y),
                " custom_size=", String(customPanel.actuallayoutwidth), "x",
                String(customPanel.actuallayoutheight),
                " custom_scale=", String(customPanel.actualuiscale_x), ",",
                String(customPanel.actualuiscale_y));
        });
    }

    function measureOfficialGeometry(anchor, layer) {
        if (!anchor || !layer
            || !anchor.GetPositionWithinWindow
            || !layer.GetPositionWithinWindow) return null;
        var source = anchor.GetPositionWithinWindow();
        var parent = layer.GetPositionWithinWindow();
        var parentScaleX = Number(layer.actualuiscale_x || 1);
        var parentScaleY = Number(layer.actualuiscale_y || 1);
        if (!isFinite(parentScaleX) || !isFinite(parentScaleY)
            || parentScaleX <= 0 || parentScaleY <= 0) return null;
        var sourceWidth = Number(anchor.actuallayoutwidth || 0);
        var sourceHeight = Number(anchor.actuallayoutheight || 0);
        if (!isFinite(sourceWidth) || !isFinite(sourceHeight)
            || sourceWidth <= 0 || sourceHeight <= 0) return null;
        var x = (Number(source.x) - Number(parent.x)) / parentScaleX;
        var y = (Number(source.y) - Number(parent.y)) / parentScaleY;
        var width = sourceWidth / parentScaleX;
        var height = sourceHeight / parentScaleY;
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || !isFinite(height)
            || width <= 0 || height <= 0) return null;
        var localX = Math.round(x * 1000) / 1000;
        var localY = Math.round(y * 1000) / 1000;
        var localWidth = Math.round(width * 1000) / 1000;
        var localHeight = Math.round(height * 1000) / 1000;
        return {
            x: localX, y: localY,
            width: localWidth, height: localHeight
        };
    }

    function measureFixedRowGeometry(mappings, rowAnchorGeometry) {
        if (!mappings || mappings.length === 0 || !rowAnchorGeometry) return null;
        var width = mappings.length * fixedCellSize
            + Math.max(0, mappings.length - 1) * fixedCellGap;
        var alignment = calibrationAlignments[calibration.alignment]
            || calibrationAlignments.top_left;
        // Align the same normalized point on the fixed row and Valve's stable
        // abilities container. Runtime calibration can compare all nine points
        // without changing the fixed cell size or recompiling between trials.
        var anchorX = rowAnchorGeometry.x + rowAnchorGeometry.width * alignment.x;
        var anchorY = rowAnchorGeometry.y + rowAnchorGeometry.height * alignment.y;
        var x = anchorX - width * alignment.x + calibration.offsetX;
        var y = anchorY - fixedCellSize * alignment.y + calibration.offsetY;
        if (!isFinite(x) || !isFinite(y) || !isFinite(width) || width <= 0) return null;
        return {
            x: Math.round(x * 1000) / 1000,
            y: Math.round(y * 1000) / 1000,
            width: width,
            height: fixedCellSize,
            anchorX: Math.round(anchorX * 1000) / 1000,
            anchorY: Math.round(anchorY * 1000) / 1000,
            count: mappings.length
        };
    }

    function measureMappingBounds(mappings) {
        if (!mappings || mappings.length === 0) return null;
        var left = Infinity;
        var top = Infinity;
        var right = -Infinity;
        var bottom = -Infinity;
        mappings.forEach(function (mapping) {
            var geometry = mapping && mapping.geometry;
            if (!geometry) return;
            left = Math.min(left, geometry.x);
            top = Math.min(top, geometry.y);
            right = Math.max(right, geometry.x + geometry.width);
            bottom = Math.max(bottom, geometry.y + geometry.height);
        });
        if (!isFinite(left) || !isFinite(top) || !isFinite(right) || !isFinite(bottom)
            || right <= left || bottom <= top) return null;
        return {
            x: Math.round(left * 1000) / 1000,
            y: Math.round(top * 1000) / 1000,
            width: Math.round((right - left) * 1000) / 1000,
            height: Math.round((bottom - top) * 1000) / 1000
        };
    }

    function rounded(value) {
        return String(Math.round(Number(value || 0) * 1000) / 1000);
    }

    function rectText(rect) {
        if (!rect) return "none";
        return rounded(rect.x) + "," + rounded(rect.y) + ","
            + rounded(rect.width) + "x" + rounded(rect.height);
    }

    function setCalibrationRect(id, rect, visible) {
        var panel = byId(id);
        if (!panel) return;
        if (!visible || !rect) {
            panel.style.visibility = "collapse";
            return;
        }
        panel.style.position = rounded(rect.x) + "px " + rounded(rect.y) + "px 0px";
        panel.style.width = rounded(rect.width) + "px";
        panel.style.height = rounded(rect.height) + "px";
        panel.style.visibility = "visible";
    }

    function updateCalibrationButtons() {
        Object.keys(calibrationAlignments).forEach(function (name) {
            var button = byId("AbilityCalibration_" + name);
            if (button) button.SetHasClass("Selected", name === calibration.alignment);
        });
    }

    function updateCalibrationPanel(rowAnchorGeometry, visualBounds, rowGeometry) {
        var panel = byId("SurvivalAbilityCalibrationPanel");
        if (panel) panel.SetHasClass("Hidden", !calibration.visible);
        updateCalibrationButtons();
        var status = byId("AbilityCalibrationStatus");
        var details = byId("AbilityCalibrationDetails");
        var alignment = calibrationAlignments[calibration.alignment]
            || calibrationAlignments.top_left;
        if (status) {
            status.text = "锚点：" + alignment.label + " (" + calibration.alignment + ")"
                + "    偏移：X=" + rounded(calibration.offsetX)
                + "  Y=" + rounded(calibration.offsetY);
        }
        if (details) {
            details.text = rowGeometry
                ? "技能数：" + String(rowGeometry.count)
                    + "    容器：" + rectText(rowAnchorGeometry)
                    + "\n原生技能：" + rectText(visualBounds)
                    + "    项目行：" + rectText(rowGeometry)
                : "等待完整技能映射；当前没有可校准的项目技能行。";
        }
    }

    function hideCalibrationGeometry() {
        [
            "AbilityCalibrationContainerBounds",
            "AbilityCalibrationVisualBounds",
            "AbilityCalibrationRowBounds",
            "AbilityCalibrationAnchor"
        ].forEach(function (id) {
            var panel = byId(id);
            if (panel) panel.style.visibility = "collapse";
        });
        calibration.last = null;
        updateCalibrationPanel(null, null, null);
    }

    function applyCalibrationGeometry(rowAnchorGeometry, visualBounds, rowGeometry) {
        updateCalibrationPanel(rowAnchorGeometry, visualBounds, rowGeometry);
        if (!calibration.visible) {
            hideCalibrationGeometry();
            return;
        }
        setCalibrationRect(
            "AbilityCalibrationContainerBounds", rowAnchorGeometry, true
        );
        setCalibrationRect("AbilityCalibrationVisualBounds", visualBounds, true);
        setCalibrationRect("AbilityCalibrationRowBounds", rowGeometry, true);
        setCalibrationRect("AbilityCalibrationAnchor", {
            x: rowGeometry.anchorX - 7,
            y: rowGeometry.anchorY - 7,
            width: 14,
            height: 14
        }, true);
        calibration.last = {
            alignment: calibration.alignment,
            offsetX: calibration.offsetX,
            offsetY: calibration.offsetY,
            count: rowGeometry.count,
            container: rowAnchorGeometry,
            visual: visualBounds,
            row: rowGeometry,
            anchorX: rowGeometry.anchorX,
            anchorY: rowGeometry.anchorY
        };
    }

    function applyFixedRowGeometry(
        row, rowAnchor, layer, geometry, rowAnchorGeometry, visualBounds
    ) {
        if (!row) return;
        row.style.position = String(geometry.x) + "px " + String(geometry.y) + "px 0px";
        row.style.width = String(geometry.width) + "px";
        row.style.height = String(geometry.height) + "px";
        row.style.visibility = "visible";
        applyCalibrationGeometry(rowAnchorGeometry, visualBounds, geometry);
        diagnoseGeometry(row, rowAnchor, layer, geometry, 0);
    }

    function prepareTakeover(entries, officialVisuals) {
        var layer = byId("SurvivalAbilityTakeoverLayer");
        if (!layer) return { ok: false, detail: "missing_takeover_layer" };
        if (officialVisuals.length !== entries.length) {
            return {
                ok: false,
                detail: "count_mismatch_" + String(entries.length) + "_"
                    + String(officialVisuals.length)
            };
        }
        var row = byId("SurvivalAbilityTakeoverRow");
        if (!row) return { ok: false, detail: "missing_takeover_row" };
        var rowAnchor = officialAbilitiesRowAnchor();
        var rowAnchorGeometry = measureOfficialGeometry(rowAnchor, layer);
        if (!rowAnchorGeometry) {
            return { ok: false, detail: "invalid_abilities_row_anchor" };
        }
        var mappings = [];
        for (var displayIndex = 0; displayIndex < entries.length; displayIndex++) {
            var slot = ensureSlot(displayIndex);
            var official = officialVisuals[displayIndex];
            if (!slot || !official || !official.visual) {
                return {
                    ok: false,
                    detail: "missing_mapping_" + String(displayIndex)
                };
            }
            var geometry = measureOfficialGeometry(official.anchor, layer);
            if (!geometry) {
                return {
                    ok: false,
                    detail: "invalid_geometry_" + official.id
                };
            }
            mappings.push({
                entry: entries[displayIndex],
                slot: slot,
                official: official,
                geometry: geometry
            });
        }
        var rowGeometry = measureFixedRowGeometry(mappings, rowAnchorGeometry);
        if (!rowGeometry) return { ok: false, detail: "invalid_fixed_row_geometry" };
        var visualBounds = measureMappingBounds(mappings);
        if (!visualBounds) return { ok: false, detail: "invalid_visual_bounds" };
        return {
            ok: true, layer: layer, row: row, rowAnchor: rowAnchor,
            mappings: mappings, rowGeometry: rowGeometry,
            rowAnchorGeometry: rowAnchorGeometry, visualBounds: visualBounds,
            detail: "ready_calibration_" + calibration.alignment + "_"
                + String(mappings.length)
        };
    }

    function hideTooltip() {
        activeAbility = -1;
        activePanel = null;
        var tooltip = byId("CustomAbilityTooltip");
        if (tooltip) tooltip.AddClass("Hidden");
    }

    function showTooltip(entry, panel) {
        activeAbility = entry.ability;
        activePanel = panel;
        var definition = CustomNetTables.GetTableValue(
            "survival_ability_data", entry.name
        ) || {};
        var tooltipDefinition = CustomNetTables.GetTableValue(
            "survival_tooltips",
            definition.tooltip_id || ("ability:" + entry.name)
        ) || {};
        var runtime = runtimeFor(entry.ability);
        var tooltip = byId("CustomAbilityTooltip");
        var fields = byId("CustomAbilityFields");
        if (!tooltip || !fields) return;
        var behavior = 0;
        try { behavior = Number(Abilities.GetBehavior(entry.ability) || 0); } catch (error) {}
        setText("CustomAbilityExtensionLabel", "生存防守 · 自定义技能详情");
        setText("CustomAbilityTitle", runtime.display_name || tooltipDefinition.name
            || definition.abilityname || localizedName(entry.name));
        var currentLevel = runtime.current_level;
        if (currentLevel === undefined) currentLevel = abilityLevel(entry.ability);
        setText("CustomAbilityLevel", Number(currentLevel || 0) > 0
            ? "【等级】 " + String(currentLevel) : "");
        var description = runtime.upgrade_description || tooltipDefinition.desc
            || definition.abilitydesc || localizedDescription(entry.name)
            || "该技能由项目控制，具体效果与消耗以当前实时状态为准。";
        setText("CustomAbilityDescription", description);
        var goldCost = runtime.cost_gold !== undefined
            ? runtime.cost_gold : Number(tooltipDefinition.needgold || 0);
        var woodCost = runtime.cost_wood !== undefined
            ? runtime.cost_wood : Number(tooltipDefinition.needwood || 0);
        var costRow = byId("CustomAbilityCostRow");
        if (costRow) costRow.SetHasClass("Hidden",
            Number(goldCost || 0) <= 0 && Number(woodCost || 0) <= 0);
        setText("CustomAbilityGoldCost", goldCost);
        setText("CustomAbilityWoodCost", woodCost);
        fields.RemoveAndDeleteChildren();
        addField(fields, "施法类型", behaviorText(behavior));
        var mana = manaCost(entry.ability);
        if (mana > 0) addField(fields, "魔法消耗", Math.round(mana));
        var cooldown = cooldownLength(entry.ability);
        if (cooldown > 0) addField(fields, "冷却时间", cooldown + " 秒");
        asArray(runtime.fields).forEach(function (field) {
            if (field) addField(fields, field.label, field.value);
        });
        var unavailable = runtime.removed === 1 || runtime.available === 0;
        var lacksResources = !unavailable && runtime.can_afford === 0;
        var passive = (behavior & 2) !== 0;
        setText("CustomAbilityType", unavailable ? "不可施法技能"
            : (passive ? "被动技能"
                : (lacksResources ? "可点击技能（资源不足）" : behaviorText(behavior))));
        setText("CustomAbilityStatus", runtime.status_text
            || (unavailable ? "不可施法 · 前置条件未满足"
                : (passive ? "被动生效"
                    : (lacksResources ? "当前资源不足 · 由服务器最终校验" : "可施法"))));
        tooltip.SetHasClass("Unavailable", unavailable);
        tooltip.RemoveClass("Hidden");
        $.Schedule(0.0, function () {
            if (Number(activeAbility) !== Number(entry.ability) || activePanel !== panel) return;
            var positioner = config.SurvivalTooltipPosition;
            if (positioner) positioner.PlaceAbove(tooltip, panel, 337, 220);
        });
    }

    function activate(entry) {
        if (entry.name === "ability_survival_return_home") {
            var returnHome = config.SurvivalReturnHomeInput;
            if (returnHome && returnHome.Request) returnHome.Request("takeover_button");
            return;
        }
        var behavior = 0;
        try { behavior = Number(Abilities.GetBehavior(entry.ability) || 0); } catch (error) {}
        if ((behavior & 2) !== 0) return; // PASSIVE
        var runtime = runtimeFor(entry.ability);
        if (runtime.removed === 1 || runtime.available === 0) return;
        var input = config.SurvivalAbilityInput;
        if (input && input.ExecuteAbility) input.ExecuteAbility(entry.ability);
    }

    function ensureSlot(displayIndex) {
        var slot = slots[displayIndex];
        if (slot && slot.panel && slot.panel.IsValid && slot.panel.IsValid()) return slot;
        var row = byId("SurvivalAbilityTakeoverRow");
        if (!row) return null;
        var panel = $.CreatePanel(
            "Button", row, "SurvivalTakeoverAbility" + String(displayIndex)
        );
        panel.AddClass("SurvivalTakeoverAbilitySlot");
        panel.style.visibility = "collapse";
        panel.hittest = true;
        panel.hittestchildren = false;
        var image = $.CreatePanel("DOTAAbilityImage", panel, "");
        image.AddClass("SurvivalTakeoverAbilityImage");
        image.hittest = false;
        var shade = $.CreatePanel("Panel", panel, "");
        shade.AddClass("SurvivalTakeoverAbilityShade");
        shade.hittest = false;
        var cooldown = $.CreatePanel("Label", panel, "");
        cooldown.AddClass("SurvivalTakeoverAbilityCooldown");
        cooldown.hittest = false;
        var hotkey = $.CreatePanel("Label", panel, "");
        hotkey.AddClass("SurvivalTakeoverAbilityHotkey");
        hotkey.hittest = false;
        var mana = $.CreatePanel("Label", panel, "");
        mana.AddClass("SurvivalTakeoverAbilityMana");
        mana.hittest = false;
        var level = $.CreatePanel("Label", panel, "");
        level.AddClass("SurvivalTakeoverAbilityLevel");
        level.hittest = false;
        slot = {
            panel: panel, image: image, shade: shade, cooldown: cooldown,
            hotkey: hotkey, mana: mana, level: level, entry: null
        };
        panel.SetPanelEvent("onmouseover", function () {
            if (slot.entry) showTooltip(slot.entry, panel);
        });
        panel.SetPanelEvent("onmouseout", hideTooltip);
        panel.SetPanelEvent("onactivate", function () {
            if (slot.entry) activate(slot.entry);
        });
        slots[displayIndex] = slot;
        return slot;
    }

    function abilityLevel(ability) {
        try { return Number(Abilities.GetLevel(ability) || 0); } catch (error) { return 0; }
    }

    function manaCost(ability) {
        try { return Number(Abilities.GetManaCost(ability) || 0); } catch (error) { return 0; }
    }

    function cooldownRemaining(ability) {
        try {
            return Math.max(0, Number(Abilities.GetCooldownTimeRemaining(ability) || 0));
        } catch (error) { return 0; }
    }

    function cooldownLength(ability) {
        try { return Math.max(0, Number(Abilities.GetCooldown(ability) || 0)); }
        catch (error) { return 0; }
    }

    function updateSlot(slot, entry, displayIndex) {
        slot.entry = entry;
        slot.panel.__survivalAbilityIndex = entry.ability;
        slot.panel.__survivalAbilityName = entry.name;
        slot.image.abilityname = entry.name;
        slot.hotkey.text = entry.name === "ability_survival_return_home"
            ? "F2" : (hotkeys[displayIndex] || "");
        var level = abilityLevel(entry.ability);
        slot.level.text = level > 0 ? "Lv." + String(level) : "";
        var mana = manaCost(entry.ability);
        slot.mana.text = mana > 0 ? String(Math.round(mana)) : "";
        var behavior = 0;
        try { behavior = Number(Abilities.GetBehavior(entry.ability) || 0); } catch (error) {}
        var passive = (behavior & 2) !== 0;
        var runtime = runtimeFor(entry.ability);
        var unavailable = runtime.removed === 1 || runtime.available === 0;
        slot.panel.SetHasClass("Passive", passive);
        slot.panel.SetHasClass("Unavailable", unavailable);
        slot.panel.SetHasClass("ResourceLow", runtime.can_afford === 0 && !unavailable);
        // Keep every slot enabled for hover, including passive/unavailable
        // abilities. onactivate performs the guarded rejection instead.
        slot.panel.enabled = true;
        var remaining = cooldownRemaining(entry.ability);
        var total = cooldownLength(entry.ability);
        slot.cooldown.text = remaining > 0 ? String(Math.ceil(remaining)) : "";
        var percent = total > 0 ? Math.min(1, remaining / total) : 0;
        slot.shade.style.height = String(Math.round(percent * 100)) + "%";
    }

    function hideUnused(fromIndex) {
        var row = byId("SurvivalAbilityTakeoverRow");
        if (row && fromIndex === 0) row.style.visibility = "collapse";
        for (var index = fromIndex; index < slots.length; index++) {
            if (!slots[index]) continue;
            slots[index].entry = null;
            slots[index].panel.style.visibility = "collapse";
        }
    }

    function refresh(reason) {
        refreshSerial += 1;
        if (takeover.abilitySurvey) {
            hideTooltip();
            hideUnused(0);
            hideCalibrationGeometry();
            restoreOfficial();
            restoreOfficialContainerAfterTransition();
            hideTakeoverSlotsForSurvey();
            var surveyEntries = visibleAbilities();
            surveyEntries.forEach(function (entry, displayIndex) {
                forceOfficialSurveyVisible(officialAbility(displayIndex));
            });
            requestOfficialAbilitySurvey(surveyEntries, reason, false);
            return true;
        }
        if (!takeover.abilities) {
            hideTooltip();
            hideUnused(0);
            hideCalibrationGeometry();
            restoreOfficial();
            restoreOfficialContainerAfterTransition();
            if (!disabledIsolationLogged) {
                disabledIsolationLogged = true;
                $.Msg("[SURVIVAL_TAKEOVER] DISABLED crash_isolation_v3_alt_ability_takeover_disabled native_ability_tree_restored=true custom_slots_hidden=true");
            }
            return true;
        }
        var entries = visibleAbilities();
        var nextSignature = String(selectedUnit()) + "|" + entries.map(function (entry) {
            return entry.ability + ":" + entry.name;
        }).join("|");
        if (signature !== nextSignature) {
            signature = nextSignature;
            hideTooltip();
            $.Msg("[SURVIVAL_TAKEOVER] abilities changed reason=", String(reason || ""),
                " signature=", signature);
        }
        // Valve can rebuild or reuse AbilityN nodes after abilities are removed
        // and added. Restore the previous generation before discovering the
        // current visual order, then commit only after every mapping validates.
        restoreOfficial();
        var officialVisuals = collectOfficialAbilityVisuals();
        if (entries.length === 0) {
            hideTooltip();
            hideUnused(0);
            hideCalibrationGeometry();
            logTakeoverMap(entries, officialVisuals, [], "official", "no_entries", reason);
            diagnoseAnchors(entries, -1);
            if (selectionTransition) suppressOfficialContainerForTransition();
            else restoreOfficialContainerAfterTransition();
            return true;
        }
        var plan = prepareTakeover(entries, officialVisuals);
        if (!plan.ok) {
            hideTooltip();
            hideUnused(0);
            hideCalibrationGeometry();
            // The official state was already restored above. Leave it intact
            // until Valve exposes a complete, stable set of visual anchors.
            logTakeoverMap(entries, officialVisuals, [], "official_fallback",
                plan.detail, reason);
            diagnoseAnchors(entries, -1, plan.detail);
            if (selectionTransition) suppressOfficialContainerForTransition();
            else restoreOfficialContainerAfterTransition();
            return false;
        }
        hideUnused(0);
        applyFixedRowGeometry(
            plan.row, plan.rowAnchor, plan.layer, plan.rowGeometry,
            plan.rowAnchorGeometry, plan.visualBounds
        );
        plan.mappings.forEach(function (mapping, displayIndex) {
            mapping.slot.panel.SetHasClass(
                "LastInRow", displayIndex === plan.mappings.length - 1
            );
            mapping.slot.panel.style.visibility = "visible";
            suppressOfficial(displayIndex, mapping.official.panel);
            updateSlot(mapping.slot, mapping.entry, displayIndex);
        });
        hideUnused(plan.mappings.length);
        if (!selectionTransition) restoreOfficialContainerAfterTransition();
        logTakeoverMap(entries, officialVisuals, plan.mappings,
            "custom", plan.detail, reason);
        diagnoseAnchors(entries, -1);
        return true;
    }

    function refreshTooltip() {
        if (activeAbility < 0 || !activePanel) return;
        for (var index = 0; index < slots.length; index++) {
            if (slots[index] && slots[index].entry
                && Number(slots[index].entry.ability) === Number(activeAbility)) {
                showTooltip(slots[index].entry, activePanel);
                return;
            }
        }
        hideTooltip();
    }

    function beginSelectionTransition(reason) {
        if (!takeover.abilities || takeover.abilitySurvey) return;
        var transitionUnit = Number(selectedUnit());
        if (selectionTransition
            && isFinite(transitionUnit)
            && transitionUnit >= 0
            && transitionUnit === Number(selectionTransitionUnit)) return;
        selectionTransitionSerial += 1;
        var serial = selectionTransitionSerial;
        selectionTransitionUnit = transitionUnit;
        selectionTransition = {
            serial: serial,
            reason: String(reason || "unknown")
        };
        signature = "";
        hideTooltip();
        hideUnused(0);
        hideCalibrationGeometry();
        suppressOfficialContainerForTransition();
        $.Msg("[SURVIVAL_TAKEOVER_SELECTION] begin reason=", selectionTransition.reason,
            " serial=", String(serial), " unit=", String(selectedUnit()));
        selectionRetryDelays.forEach(function (delay, retryIndex) {
            $.Schedule(delay, function () {
                if (!selectionTransition || selectionTransition.serial !== serial) return;
                var currentUnit = Number(selectedUnit());
                if (isFinite(currentUnit) && currentUnit >= 0) {
                    observedSelectedUnit = currentUnit;
                }
                // Valve can replace the abilities container between frames.
                // Reacquire and suppress the current generation before mapping.
                suppressOfficialContainerForTransition();
                var finalRetry = retryIndex === selectionRetryDelays.length - 1;
                if (finalRetry) {
                    selectionTransition = null;
                    var committed = refresh("selection_commit_" + String(reason || "unknown"));
                    $.Msg("[SURVIVAL_TAKEOVER_SELECTION] end reason=", String(reason || "unknown"),
                        " serial=", String(serial), " committed=", String(!!committed),
                        " unit=", String(selectedUnit()));
                    selectionTransitionUnit = -1;
                    return;
                }
                refresh("selection_retry_" + String(retryIndex));
            });
        });
    }

    function localSelectionEvent(payload) {
        if (!payload) return true;
        var eventPlayer = payload.PlayerID;
        if (eventPlayer === undefined) eventPlayer = payload.player_id;
        if (eventPlayer === undefined) eventPlayer = payload.playerid;
        return eventPlayer === undefined || Number(eventPlayer) === Number(playerId);
    }

    function onSelectionEvent(reason, payload) {
        if (!localSelectionEvent(payload)) return;
        beginSelectionTransition(reason);
    }

    function selectedUnitSentinel() {
        var currentUnit = Number(selectedUnit());
        if (isFinite(currentUnit) && currentUnit >= 0
            && currentUnit !== Number(observedSelectedUnit)) {
            observedSelectedUnit = currentUnit;
            beginSelectionTransition("portrait_unit_sentinel");
        }
        $.Schedule(0.10, selectedUnitSentinel);
    }

    function subscribeSelectionEvents() {
        GameEvents.Subscribe("dota_player_update_selected_unit", function (payload) {
            onSelectionEvent("selected_unit_event", payload);
        });
        GameEvents.Subscribe("dota_player_update_query_unit", function (payload) {
            onSelectionEvent("query_unit_event", payload);
        });
    }

    function runtimeTick() {
        if (takeover.abilities && !takeover.abilitySurvey) {
            slots.forEach(function (slot, displayIndex) {
                if (slot && slot.entry) updateSlot(slot, slot.entry, displayIndex);
            });
        }
        $.Schedule(0.10, runtimeTick);
    }

    function geometryTick() {
        refresh("geometry_tick");
        $.Schedule(0.50, geometryTick);
    }

    function setCalibrationAlignment(alignment) {
        var name = String(alignment || "");
        if (!calibrationAlignments[name]) {
            $.Warning("[SURVIVAL_ABILITY_CALIBRATION] invalid_alignment=", name);
            return false;
        }
        calibration.alignment = name;
        calibration.source = "runtime_adjustment";
        calibration.visible = true;
        refresh("calibration_alignment");
        return true;
    }

    function nudgeCalibration(deltaX, deltaY) {
        var x = Number(deltaX || 0);
        var y = Number(deltaY || 0);
        if (!isFinite(x) || !isFinite(y)) return false;
        calibration.offsetX = Math.round((calibration.offsetX + x) * 1000) / 1000;
        calibration.offsetY = Math.round((calibration.offsetY + y) * 1000) / 1000;
        calibration.source = "runtime_adjustment";
        calibration.visible = true;
        refresh("calibration_nudge");
        return true;
    }

    function resetCalibration() {
        applyCalibrationPreset("preset_reset", true);
        refresh("calibration_reset");
    }

    function setCalibrationVisible(visible) {
        calibration.visible = !!visible;
        refresh("calibration_visibility");
    }

    function dumpCalibration() {
        var last = calibration.last;
        $.Msg("[SURVIVAL_ABILITY_CALIBRATION] build=", takeoverBuild,
            " preset_version=", String(calibration.presetVersion),
            " source=", calibration.source,
            " alignment=", calibration.alignment,
            " offset_x=", rounded(calibration.offsetX),
            " offset_y=", rounded(calibration.offsetY),
            " ability_count=", String(last ? last.count : 0),
            " anchor=", last
                ? rounded(last.anchorX) + "," + rounded(last.anchorY) : "none",
            " container_rect=", last ? rectText(last.container) : "none",
            " visual_rect=", last ? rectText(last.visual) : "none",
            " row_rect=", last ? rectText(last.row) : "none");
    }

    function registerCalibrationCommands() {
        if (!Game.AddCommand) return;
        try {
            Game.AddCommand("survival_ability_calibration", function () {
                setCalibrationVisible(!calibration.visible);
            }, "显示或隐藏技能行锚点校准器", 0);
            Game.AddCommand("survival_ability_calibration_dump", function () {
                dumpCalibration();
            }, "输出当前技能行锚点校准参数", 0);
        } catch (error) {
            $.Warning("[SURVIVAL_ABILITY_CALIBRATION] command_registration_failed=", error);
        }
    }

    config.SurvivalAbilityTakeover = {
        Refresh: refresh,
        RefreshTooltip: refreshTooltip,
        SetEnabled: function (enabled) {
            takeover.abilities = !!enabled;
            takeoverMapDiagnostic = "";
            refresh("set_enabled");
        },
        IsEnabled: function () { return !!takeover.abilities; },
        DumpSurvey: function () {
            var entries = visibleAbilities();
            requestOfficialAbilitySurvey(entries, "manual", true);
        },
        SetSurveyEnabled: function (enabled) {
            takeover.abilitySurvey = !!enabled;
            surveySignature = "";
            takeoverMapDiagnostic = "";
            refresh("set_survey_enabled");
        },
        IsSurveyEnabled: function () { return !!takeover.abilitySurvey; },
        SetCalibrationAlignment: setCalibrationAlignment,
        NudgeCalibration: nudgeCalibration,
        ResetCalibration: resetCalibration,
        SetCalibrationVisible: setCalibrationVisible,
        ToggleCalibration: function () {
            setCalibrationVisible(!calibration.visible);
        },
        IsCalibrationVisible: function () { return !!calibration.visible; },
        DumpCalibration: dumpCalibration,
        GetCalibration: function () {
            return {
                presetVersion: calibration.presetVersion,
                source: calibration.source,
                alignment: calibration.alignment,
                offsetX: calibration.offsetX,
                offsetY: calibration.offsetY,
                visible: calibration.visible
            };
        }
    };

    CustomNetTables.SubscribeNetTableListener(
        "survival_ability_runtime",
        function (tableName, key) {
            if (takeover.abilitySurvey) return;
            var ability = Number(key);
            slots.forEach(function (slot, displayIndex) {
                if (slot && slot.entry && Number(slot.entry.ability) === ability) {
                    updateSlot(slot, slot.entry, displayIndex);
                }
            });
            if (Number(activeAbility) === ability) refreshTooltip();
        }
    );

    [0.0, 0.1, 0.35, 1.0].forEach(function (delay) {
        $.Schedule(delay, function () { refresh("initial_" + String(delay)); });
    });
    diagnoseGroundItemLocalization();
    registerCalibrationCommands();
    updateCalibrationPanel(null, null, null);
    observedSelectedUnit = Number(selectedUnit());
    subscribeSelectionEvents();
    selectedUnitSentinel();
    runtimeTick();
    geometryTick();
})();