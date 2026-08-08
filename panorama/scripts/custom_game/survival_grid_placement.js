(function () {
    "use strict";

    var root = $("#GridPlacementRoot");
    var cellHost = $("#GridPlacementCells");
    var title = $("#GridPlacementTitle");
    var status = $("#GridPlacementStatus");
    var cells = [];
    var profiles = {};
    var profileCount = 0;
    var activeProfile = null;
    var activeAbility = -1;
    var activeUnit = -1;
    var inputMode = "";
    var lastAnchorKey = "";
    var lastRequestAt = -100;
    var requestSequence = 0;
    var newestResponse = 0;
    var lastValidation = null;
    var cursorWorldAvailable = null;
    var previewSessionSequence = Math.max(
        0,
        Math.floor((Game.GetGameTime ? Number(Game.GetGameTime()) : 0) * 1000)
    );
    var activePreviewSession = 0;
    var gridCellSize = 128;
    var previewVisual = {
        grid_z_offset: 6,
        edge_thickness: 2,
        fill_strip_count: 6
    };

    function normalizeLuaArray(source) {
        if (!source) return [];
        var result = [];
        var keys = [];
        for (var key in source) {
            if (!source.hasOwnProperty(key)) continue;
            var numeric = Number(key);
            if (!isNaN(numeric)) keys.push({ key: key, order: numeric });
        }
        keys.sort(function (left, right) { return left.order - right.order; });
        for (var index = 0; index < keys.length; index += 1) {
            result.push(source[keys[index].key]);
        }
        return result;
    }

    function topPanel() {
        var panel = $.GetContextPanel();
        while (panel && panel.GetParent()) panel = panel.GetParent();
        return panel;
    }

    function findHudPanel(id) {
        var panel = topPanel();
        return panel && panel.FindChildTraverse ? panel.FindChildTraverse(id) : null;
    }

    function selectedUnit() {
        var resolver = GameUI.CustomUIConfig().SurvivalSelectionResolver;
        if (resolver && resolver.Resolve) return Number(resolver.Resolve());
        return -1;
    }

    function abilityByName(unit, name) {
        if (unit < 0 || !name) return -1;
        for (var slot = 0; slot < 24; slot += 1) {
            var ability = Entities.GetAbility(unit, slot);
            if (ability === undefined || ability < 0) continue;
            if (String(Abilities.GetAbilityName(ability) || "") === name) return ability;
        }
        return -1;
    }

    function nativeActiveAbility() {
        if (!Abilities.GetLocalPlayerActiveAbility) return -1;
        return Number(Abilities.GetLocalPlayerActiveAbility());
    }

    function abilityName(index) {
        if (index < 0 || !Abilities.GetAbilityName) return "";
        return String(Abilities.GetAbilityName(index) || "");
    }

    function customPointTargetName() {
        var shared = GameUI.CustomUIConfig().SurvivalPointTargetState;
        if (shared && shared.active && shared.name) return String(shared.name);
        var hint = findHudPanel("SurvivalPointTargetHint");
        if (!hint || !hint.BHasClass || !hint.BHasClass("PointTargetActive")) return "";
        var text = String(hint.text || "");
        for (var name in profiles) {
            if (profiles.hasOwnProperty(name) && text.indexOf(name) >= 0) return name;
        }
        return "";
    }

    function customPointTargetState() {
        var shared = GameUI.CustomUIConfig().SurvivalPointTargetState;
        return shared && shared.active ? shared : null;
    }

    function screenPoint(world) {
        if (!world || !Game.WorldToScreenX || !Game.WorldToScreenY) return null;
        if (!isFinite(Number(world[0]))
            || !isFinite(Number(world[1]))
            || !isFinite(Number(world[2]))) return null;
        var screenX = Number(Game.WorldToScreenX(world[0], world[1], world[2]));
        var screenY = Number(Game.WorldToScreenY(world[0], world[1], world[2]));
        if (!isFinite(screenX) || !isFinite(screenY) || screenX < 0 || screenY < 0) {
            return null;
        }
        var scaleX = Number(root && root.actualuiscale_x) || 1;
        var scaleY = Number(root && root.actualuiscale_y) || 1;
        return [screenX / scaleX, screenY / scaleY];
    }

    function hideProjectedVisuals() {
        for (var index = 0; index < cells.length; index += 1) {
            if (cells[index]) cells[index].visible = false;
        }
    }

    function ensureCellPanels(count) {
        while (cells.length < count) {
            var panel = $.CreatePanel("Panel", cellHost, "GridPlacementCell" + cells.length);
            panel.AddClass("GridPlacementCell");
            panel.hittest = false;
            panel.__edges = [];
            panel.__fills = [];
            for (var edgeIndex = 0; edgeIndex < 4; edgeIndex += 1) {
                var edge = $.CreatePanel(
                    "Panel",
                    panel,
                    "GridPlacementCell" + cells.length + "Edge" + edgeIndex
                );
                edge.AddClass("GridPlacementCellEdge");
                edge.hittest = false;
                panel.__edges.push(edge);
            }
            var fillCount = Math.max(1, Math.round(Number(previewVisual.fill_strip_count) || 12));
            for (var fillIndex = 0; fillIndex < fillCount; fillIndex += 1) {
                var fill = $.CreatePanel(
                    "Panel",
                    panel,
                    "GridPlacementCell" + cells.length + "Fill" + fillIndex
                );
                fill.AddClass("GridPlacementCellFill");
                fill.hittest = false;
                panel.__fills.push(fill);
            }
            cells.push(panel);
        }
        for (var index = 0; index < cells.length; index += 1) {
            cells[index].visible = index < count;
        }
    }

    function setVisualValid(valid, message) {
        if (root && root.SetHasClass) {
            root.SetHasClass("PlacementValid", valid === true);
            root.SetHasClass("PlacementInvalid", valid !== true);
        }
        if (!status) return;
        if (message) {
            status.text = message;
        } else {
            status.text = valid
                ? "占地全部合法：左键确认建造 · 右键或 Esc 取消"
                : "当前位置不可建造：地形、建筑、树木、单位或禁建区阻挡";
        }
    }

    function showProfile(profile, abilityIndex, unit, mode) {
        previewSessionSequence += 1;
        activePreviewSession = previewSessionSequence;
        activeProfile = profile;
        activeAbility = abilityIndex;
        activeUnit = unit;
        inputMode = mode;
        lastAnchorKey = "";
        lastRequestAt = -100;
        lastValidation = null;
        newestResponse = requestSequence;
        root.RemoveClass("Hidden");
        if (title) title.text = "预建造 · " + String(profile.display_name || profile.building_id);
        ensureCellPanels(
            Number(profile.grid_footprint_x || profile.footprint_x)
                * Number(profile.grid_footprint_y || profile.footprint_y)
        );
        hideProjectedVisuals();
        setVisualValid(false);
        $.Msg("[GridPlacement][CLIENT] BEGIN session=" + String(activePreviewSession)
            + " ability_name=" + String(profile.ability_name)
            + " ability=" + String(abilityIndex)
            + " unit=" + String(unit)
            + " unit_name=" + String(unit >= 0 ? Entities.GetUnitName(unit) : "invalid")
            + " mode=" + String(mode));
    }

    function hidePreview(notifyServer) {
        if (!activeProfile) return;
        var closingSession = activePreviewSession;
        if (notifyServer !== false) {
            GameEvents.SendCustomGameEventToServer(
                "ui_grid_placement_preview_end",
                {
                    ability_name: String(activeProfile.ability_name || ""),
                    session_id: String(closingSession)
                }
            );
        }
        activeProfile = null;
        activeAbility = -1;
        activeUnit = -1;
        inputMode = "";
        activePreviewSession = 0;
        lastAnchorKey = "";
        lastRequestAt = -100;
        lastValidation = null;
        hideProjectedVisuals();
        root.AddClass("Hidden");
        $.Msg("[GridPlacement] preview end");
    }

    function cancelCustomPointTarget(reason) {
        var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput;
        if (pointInput && pointInput.Cancel) pointInput.Cancel(reason || "grid_cancel");
    }

    function cancelPreview(reason) {
        if (inputMode === "custom") cancelCustomPointTarget(reason);
        hidePreview();
    }

    function cursorWorld() {
        var cursor = GameUI.GetCursorPosition();
        var world = cursor ? GameUI.GetScreenWorldPosition(cursor) : null;
        var available = !!world;
        if (available !== cursorWorldAvailable) {
            cursorWorldAvailable = available;
            $.Msg("[GridPlacement][CLIENT] CURSOR_WORLD available=" + String(available)
                + " cursor=" + String(cursor));
        }
        return world;
    }

    function approximateAnchor(world) {
        return [
            Math.floor(Number(world[0]) / gridCellSize + 0.5),
            Math.floor(Number(world[1]) / gridCellSize + 0.5)
        ];
    }

    function requestValidation(world) {
        var anchor = approximateAnchor(world);
        var key = String(anchor[0]) + ":" + String(anchor[1]) + ":" + activeProfile.ability_name;
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        var anchorChanged = key !== lastAnchorKey;
        if (!anchorChanged && now - lastRequestAt < 0.12) return;
        lastAnchorKey = key;
        lastRequestAt = now;
        requestSequence += 1;
        if (anchorChanged) {
            lastValidation = null;
            hideProjectedVisuals();
            setVisualValid(false, "正在验证建筑占地……");
        }
        $.Msg("[GridPlacement][CLIENT] VALIDATE_SEND session="
            + String(activePreviewSession) + " request=" + String(requestSequence)
            + " ability_name=" + String(activeProfile.ability_name)
            + " ability=" + String(activeAbility) + " unit=" + String(activeUnit)
            + " world=" + Number(world[0]).toFixed(1) + ","
            + Number(world[1]).toFixed(1) + "," + Number(world[2]).toFixed(1)
            + " anchor=" + String(anchor[0]) + ":" + String(anchor[1])
            + " changed=" + String(anchorChanged));
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_validate", {
            session_id: String(activePreviewSession),
            request_id: String(requestSequence),
            entindex: activeUnit,
            ability_entindex: activeAbility,
            ability_name: activeProfile.ability_name,
            x: Number(world[0]),
            y: Number(world[1]),
            z: Number(world[2])
        });
    }

    function fallbackCellCorners(cell) {
        var centerX = Number(cell.x);
        var centerY = Number(cell.y);
        var centerZ = Number(cell.z);
        var halfCell = gridCellSize * 0.5;
        return [
            { x: centerX - halfCell, y: centerY - halfCell, z: centerZ },
            { x: centerX + halfCell, y: centerY - halfCell, z: centerZ },
            { x: centerX + halfCell, y: centerY + halfCell, z: centerZ },
            { x: centerX - halfCell, y: centerY + halfCell, z: centerZ }
        ];
    }

    function projectCellCorners(cell, customZOffset) {
        var worldCorners = normalizeLuaArray(cell && cell.corners);
        if (worldCorners.length !== 4) worldCorners = fallbackCellCorners(cell);
        var points = [];
        var zOffset = customZOffset === undefined
            ? (Number(previewVisual.grid_z_offset) || 0)
            : Number(customZOffset);
        for (var index = 0; index < worldCorners.length; index += 1) {
            var corner = worldCorners[index];
            var point = screenPoint([
                Number(corner.x),
                Number(corner.y),
                Number(corner.z) + zOffset
            ]);
            if (!point) return null;
            points.push(point);
        }
        return points;
    }

    function positionSegment(edge, start, finish, customThickness) {
        var dx = finish[0] - start[0];
        var dy = finish[1] - start[1];
        var length = Math.sqrt(dx * dx + dy * dy);
        if (!edge || !isFinite(length) || length < 0.5) return false;
        var thickness = Math.max(
            1,
            Number(customThickness) || Number(previewVisual.edge_thickness) || 3
        );
        var left = (start[0] + finish[0] - length) * 0.5;
        var top = (start[1] + finish[1] - thickness) * 0.5;
        var angle = Math.atan2(dy, dx) * 180 / Math.PI;
        edge.style.position = left.toFixed(2) + "px " + top.toFixed(2) + "px 0px";
        edge.style.width = length.toFixed(2) + "px";
        edge.style.height = thickness.toFixed(2) + "px";
        edge.style.transform = "rotateZ(" + angle.toFixed(3) + "deg)";
        return true;
    }

    function renderCell(panel, cell) {
        var points = projectCellCorners(cell);
        if (!panel || !points || !panel.__edges || panel.__edges.length !== 4) {
            if (panel) panel.visible = false;
            return;
        }
        panel.visible = true;
        var valid = cell.ok === true || Number(cell.ok) === 1;
        panel.SetHasClass("Valid", valid);
        panel.SetHasClass("Invalid", !valid);
        var fillCount = panel.__fills ? panel.__fills.length : 0;
        var sideOne = Math.sqrt(
            Math.pow(points[3][0] - points[0][0], 2)
                + Math.pow(points[3][1] - points[0][1], 2)
        );
        var sideTwo = Math.sqrt(
            Math.pow(points[2][0] - points[1][0], 2)
                + Math.pow(points[2][1] - points[1][1], 2)
        );
        var fillThickness = fillCount > 0
            ? Math.max(1, (sideOne + sideTwo) * 0.5 / fillCount + 0.75)
            : 1;
        for (var fillIndex = 0; fillIndex < fillCount; fillIndex += 1) {
            var ratio = (fillIndex + 0.5) / fillCount;
            var fillStart = [
                points[0][0] + (points[3][0] - points[0][0]) * ratio,
                points[0][1] + (points[3][1] - points[0][1]) * ratio
            ];
            var fillFinish = [
                points[1][0] + (points[2][0] - points[1][0]) * ratio,
                points[1][1] + (points[2][1] - points[1][1]) * ratio
            ];
            positionSegment(panel.__fills[fillIndex], fillStart, fillFinish, fillThickness);
        }
        for (var edgeIndex = 0; edgeIndex < 4; edgeIndex += 1) {
            positionSegment(
                panel.__edges[edgeIndex],
                points[edgeIndex],
                points[(edgeIndex + 1) % 4]
            );
        }
    }

    function renderValidation(data) {
        if (!activeProfile || !data) return;
        var responseCells = normalizeLuaArray(data.cells);
        ensureCellPanels(responseCells.length);
        for (var index = 0; index < cells.length; index += 1) {
            var panel = cells[index];
            var cell = responseCells[index];
            if (!panel || !cell) {
                if (panel) panel.visible = false;
                continue;
            }
            renderCell(panel, cell);
        }
        setVisualValid(Number(data.success) === 1);
    }

    function validationKey(data) {
        if (!data || !activeProfile) return "";
        return String(Number(data.anchor_x)) + ":" + String(Number(data.anchor_y))
            + ":" + activeProfile.ability_name;
    }

    function validationIsCurrentAndLegal() {
        return lastValidation
            && validationKey(lastValidation) === lastAnchorKey
            && Number(lastValidation.success) === 1;
    }

    function submitCustomPlacement() {
        if (!validationIsCurrentAndLegal()) {
            setVisualValid(false, "位置尚未通过服务端占地校验");
            return true;
        }
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_commit", {
            session_id: String(activePreviewSession),
            entindex: activeUnit,
            ability_entindex: activeAbility,
            ability_name: activeProfile.ability_name,
            x: Number(lastValidation.world_x),
            y: Number(lastValidation.world_y),
            z: Number(lastValidation.world_z)
        });
        cancelCustomPointTarget("grid_submitted");
        // 提交事件在服务端负责关闭会话；这里只隐藏本地 UI，避免紧随其后的
        // preview_end 抢先到达并把合法提交判成过期会话。
        hidePreview(false);
        return true;
    }

    function updateLoop() {
        var customName = customPointTargetName();
        var customProfile = profiles[customName];
        var nativeIndex = nativeActiveAbility();
        var nativeName = abilityName(nativeIndex);
        var nativeProfile = profiles[nativeName];
        if (customProfile) {
            var customState = customPointTargetState();
            var unit = Number(customState && customState.unit);
            var ability = Number(customState && customState.ability);
            if (!activeProfile || activeAbility !== ability || inputMode !== "custom") {
                showProfile(customProfile, ability, unit, "custom");
            }
        } else if (nativeProfile) {
            var nativeUnit = selectedUnit();
            if (!activeProfile || activeAbility !== nativeIndex || inputMode !== "native") {
                showProfile(nativeProfile, nativeIndex, nativeUnit, "native");
            }
        } else if (activeProfile) {
            hidePreview();
        }
        if (activeProfile) {
            var world = cursorWorld();
            if (world) requestValidation(world);
            if (lastValidation) renderValidation(lastValidation);
        }
        $.Schedule(0.035, updateLoop);
    }

    function onProfiles(data) {
        profiles = {};
        profileCount = 0;
        gridCellSize = Math.max(1, Number(data && data.cell_size) || 128);
        var visual = data && data.preview_visual ? data.preview_visual : {};
        for (var visualKey in previewVisual) {
            if (previewVisual.hasOwnProperty(visualKey)
                && visual.hasOwnProperty(visualKey)
                && isFinite(Number(visual[visualKey]))) {
                previewVisual[visualKey] = Number(visual[visualKey]);
            }
        }
        var list = normalizeLuaArray(data && data.profiles);
        for (var index = 0; index < list.length; index += 1) {
            profiles[String(list[index].ability_name)] = list[index];
            profileCount += 1;
        }
        $.Msg("[GridPlacement] profiles loaded=" + String(list.length)
            + " cell_size=" + String(gridCellSize));
    }

    function onValidation(data) {
        var sequence = Number(data && data.request_id);
        var responseSession = Number(data && data.session_id);
        var responseAbility = String(data && data.ability_name || "");
        var responseAnchorKey = String(data && data.request_anchor_x) + ":"
            + String(data && data.request_anchor_y) + ":" + responseAbility;
        $.Msg("[GridPlacement][CLIENT] VALIDATE_RECV session=" + String(responseSession)
            + " request=" + String(sequence) + " ability_name=" + responseAbility
            + " success=" + String(data && data.success)
            + " error=" + String(data && data.error || "")
            + " request_anchor=" + responseAnchorKey
            + " current_anchor=" + String(lastAnchorKey));
        if (responseSession !== activePreviewSession) {
            $.Msg("[GridPlacement][CLIENT] RESPONSE_REJECTED reason=session_mismatch");
            return;
        }
        if (isNaN(sequence) || sequence < newestResponse) {
            $.Msg("[GridPlacement][CLIENT] RESPONSE_REJECTED reason=request_stale newest="
                + String(newestResponse));
            return;
        }
        newestResponse = sequence;
        if (!activeProfile || responseAbility !== activeProfile.ability_name) {
            $.Msg("[GridPlacement][CLIENT] RESPONSE_REJECTED reason=ability_mismatch");
            return;
        }
        if (responseAnchorKey !== lastAnchorKey) {
            $.Msg("[GridPlacement][CLIENT] RESPONSE_REJECTED reason=anchor_mismatch");
            return;
        }
        lastValidation = data;
        renderValidation(data);
    }

    function onCommitResult(data) {
        if (data && Number(data.success) !== 1) {
            $.Msg("[GridPlacement] commit rejected: " + String(data.error || "unknown"));
        }
    }

    function activateCustomPreviewImmediately() {
        if (activeProfile) return true;
        var name = customPointTargetName();
        var profile = profiles[name];
        if (!profile) return false;
        var customState = customPointTargetState();
        var unit = Number(customState && customState.unit);
        var ability = Number(customState && customState.ability);
        if (ability < 0) return false;
        showProfile(profile, ability, unit, "custom");
        var world = cursorWorld();
        if (world) requestValidation(world);
        return true;
    }

    function mouseHandler(eventName, button) {
        if (!activeProfile) activateCustomPreviewImmediately();
        if (!activeProfile || eventName !== "pressed") return false;
        if (button === 1) {
            var consumeRightClick = inputMode === "custom";
            cancelPreview("right_click");
            return consumeRightClick;
        }
        if (button !== 0) return false;
        if (!validationIsCurrentAndLegal()) {
            setVisualValid(false, "当前位置不可建造或仍在等待校验");
            return true;
        }
        if (inputMode === "custom") return submitCustomPlacement();
        return false;
    }

    function keyHandler(key, down) {
        if (!activeProfile) activateCustomPreviewImmediately();
        var normalized = String(key || "").toUpperCase();
        if (!activeProfile || !down || (normalized !== "ESC" && normalized !== "ESCAPE")) {
            return false;
        }
        var consumeEscape = inputMode === "custom";
        cancelPreview("escape");
        return consumeEscape;
    }

    function promoteHandler(handlers, handler) {
        for (var index = handlers.length - 1; index >= 0; index -= 1) {
            if (handlers[index] === handler) handlers.splice(index, 1);
        }
        handlers.unshift(handler);
    }

    function bindInputHandlers() {
        var customConfig = GameUI.CustomUIConfig();
        var dispatcher = customConfig.SurvivalInputDispatcher;
        if (dispatcher && dispatcher.RegisterMouseHandler) {
            dispatcher.RegisterMouseHandler("grid_placement", mouseHandler, 100);
        }
        if (dispatcher && dispatcher.RegisterKeyHandler) {
            dispatcher.RegisterKeyHandler("grid_placement", keyHandler, 100);
        }
    }

    GameEvents.Subscribe("ui_grid_placement_profiles", onProfiles);
    GameEvents.Subscribe("ui_grid_placement_validation", onValidation);
    GameEvents.Subscribe("ui_grid_placement_commit_result", onCommitResult);
    bindInputHandlers();
    $.Msg("[GridPlacement] client preview initialized");

    function requestProfilesUntilReady() {
        if (profileCount > 0) return;
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_profiles_request", {});
        $.Schedule(1.0, requestProfilesUntilReady);
    }

    function maintainInputPriority() {
        bindInputHandlers();
        $.Schedule(0.5, maintainInputPriority);
    }

    requestProfilesUntilReady();
    $.Schedule(0.1, updateLoop);
    $.Schedule(0.5, maintainInputPriority);
})();
