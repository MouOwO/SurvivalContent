(function () {
    "use strict";
    var controllerConfig=GameUI.CustomUIConfig();
    var controllerEpoch=(Number(controllerConfig.SurvivalGridControllerEpoch)||0)+1;
    controllerConfig.SurvivalGridControllerEpoch=controllerEpoch;
    var framePerformance={frames:0,max_total_ms:0,max_camera_ms:0,max_range_ms:0,max_state_ms:0};
    controllerConfig.SurvivalGridFramePerformance=framePerformance;
    function currentController(){return controllerConfig.SurvivalGridControllerEpoch===controllerEpoch;}

    var root = $("#GridPlacementRoot");
    var cellHost = $("#GridPlacementCells");
    var footprintHost = $("#GridPlacementFootprint");
    var title = $("#GridPlacementTitle");
    var status = $("#GridPlacementStatus");
    var cells = [];
    var rangeParticle = null;
    var rangeParticleRadius = 0;
    var rangeWorldKey = "";
    var nextParticleAttempt = -100;
    var RANGE_PARTICLE = "particles/ui_mouseactions/range_display.vpcf";
    var cursorIcon = $("#GridPlacementCursorIcon");
    var nativeRangeBounds = null;
    function renderCursorIcon() {
        var cursor=GameUI.GetCursorPosition();
        if(!cursorIcon) return;
        cursorIcon.visible=!!cursor && !(activeProfile && Number(activeProfile.preview_model)===1);
        if(!cursorIcon.visible) return;
        if(cursor) setStyle(cursorIcon,"position",
            (cursor[0]/(Number(root.actualuiscale_x)||1)-24).toFixed(2)+"px "+
            (cursor[1]/(Number(root.actualuiscale_y)||1)-24).toFixed(2)+"px 0px");
    }
    var suppressedHint = null;
    var previousHintOpacity = "1.0000";
    var profiles = {};
    var profileCount = 0;
    var activeProfile = null;
    var activeAbility = -1;
    var activeUnit = -1;
    var inputMode = "";
    var lastAnchorKey = "";
    var lastRequestAt = -100;
    var lastSentAnchorKey = "";
    var overviewSlots = {};
    var requestSequence = 0;
    var poseSequence = 0, lastPoseKey = "", lastPoseAt = -10000;
    var newestResponse = 0;
    var lastValidation = null;
    var pendingRelocation = null;
    var pendingRelocationStart = null;
    var lastAreaValidation = null;
    var cursorWorldAvailable = null;
    var lastOverviewKey = "";
    var lastOverviewDataKey = "";
    var lastOverviewAt = -100;
    var lastOverviewCells = [];
    var projectionCache = {};
    var projectionViewKey = "";
    var projectionCacheSize = 0;
    var projectionProbeWorld = null;
    var overviewDrawPending = false;
    var areaTilesSource = null;
    var areaTiles = [];
    var lastPerfLogAt = -100;
    var motionSample = null;
    var fastMotion = false;
    var fastUntil = -100;
    var completedArea = "";
    var staticGrid = null;
    var gridState = null;
    var buildPlaneHeight = null;
    var warmFootprintReady = false;
    var previewSessionSequence = Math.max(
        0,
        Math.floor((Game.GetGameTime ? Number(Game.GetGameTime()) : 0) * 1000)
    );
    var activePreviewSession = 0;
    var gridCellSize = 128;
    var previewVisual = {
        grid_z_offset: 6,
        edge_thickness: 1,
        fill_strip_count: 8,
        radius: 1280,
        edge_fade_start: 0.40,
        edge_fade_end: 0.94,
        warm_pool_size: 640,
        warm_batch_size: 8,
        fast_move_speed: 2400,
        slow_move_speed: 1200,
        motion_settle_seconds: 0.12,
        debug_requests: 0
    };

    function opacityValue(value) {
        value = Number(value);
        return (isFinite(value) ? Math.max(0, Math.min(1, value)) : 1).toFixed(4);
    }

    function setStyle(panel, name, value) {
        var cached = panel.__styleCache || (panel.__styleCache = {});
        if (cached[name] === value) return;
        panel.style[name] = value;
        cached[name] = value;
    }

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

    function unitAbilityCount(unit) {
        var runtime = CustomNetTables.GetTableValue(
            "survival_ability_runtime", "unit:" + String(unit)
        ) || {};
        if (runtime.removed === 1
            || Number(runtime.owner_entindex) !== Number(unit)) return 0;
        return Math.max(0, Number(runtime.ability_count) || 0);
    }

    function abilityByName(unit, name) {
        if (unit < 0 || !name) return -1;
        for (var slot = 0; slot < unitAbilityCount(unit); slot += 1) {
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

    var blockedCooldownAbility = -1;
    var blockedNativeCooldownAbility = -1;
    function rejectRelocationCooldown(ability, force) {
        if (!force && !(Abilities.GetCooldownTimeRemaining(ability) > 0)) {
            blockedCooldownAbility = -1;
            return false;
        }
        if (force && inputMode === "native") blockedNativeCooldownAbility = ability;
        cancelCustomPointTarget("move_ability_cooldown");
        cancelPreview("move_ability_cooldown");
        // Native targeting can remain active over many preview frames.
        if (blockedCooldownAbility !== ability) {
            blockedCooldownAbility = ability;
            GameEvents.SendEventClientSide("dota_hud_error_message", {reason: 80, message: "移动防御塔CD中"});
        }
        return true;
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

    function screenPoint(world, fresh) {
        if (!world || !Game.WorldToScreenX || !Game.WorldToScreenY) return null;
        if (!isFinite(Number(world[0]))
            || !isFinite(Number(world[1]))
            || !isFinite(Number(world[2]))) return null;
        var key = world.join(",");
        if (!fresh && projectionCache.hasOwnProperty(key)) return projectionCache[key];
        if (!fresh && staticGrid && staticGrid.enabled()) {
            var retained=staticGrid.project(world);
            if (retained) {projectionCache[key]=retained;projectionCacheSize++;return retained;}
        }
        var screenX = Number(Game.WorldToScreenX(world[0], world[1], world[2]));
        var screenY = Number(Game.WorldToScreenY(world[0], world[1], world[2]));
        if (!isFinite(screenX) || !isFinite(screenY) || (screenX === -1 && screenY === -1)) {
            return null;
        }
        var scaleX = Number(root && root.actualuiscale_x) || 1;
        var scaleY = Number(root && root.actualuiscale_y) || 1;
        var point = [screenX / scaleX, screenY / scaleY];
        if (!fresh) {
            projectionCache[key] = point;
            projectionCacheSize++;
        }
        return point;
    }

    function destroyRangeParticle() {
        if (rangeParticle === null) return;
        var particle = rangeParticle;
        rangeParticle = null;
        rangeWorldKey = "";
        Particles.DestroyParticleEffect(particle, true);
        Particles.ReleaseParticleIndex(particle);
    }

    // Dispose a live local particle when Panorama reloads this script.
    var sharedConfig = GameUI.CustomUIConfig();
    if (sharedConfig.SurvivalStaticGrid) {
        staticGrid=sharedConfig.SurvivalStaticGrid.create({
            mask:$("#GridPlacementStaticMask"),host:$("#GridPlacementStaticMesh"),outline:$("#GridPlacementPlaneRange"),
            setStyle:setStyle,positionSegment:positionSegment,
            project:function(world){return screenPoint(world,true);},
            referenceWorld:function(){
                var parent=topPanel();
                var width=Number(root.actuallayoutwidth || parent.actuallayoutwidth);
                var height=Number(root.actuallayoutheight || parent.actuallayoutheight);
                return GameUI.GetScreenWorldPosition([width*0.5,height*0.5]);
            },
            viewport:function(){
                var parent=topPanel();
                return [Number(root.actuallayoutwidth || parent.actuallayoutwidth)/(Number(root.actualuiscale_x)||1),
                    Number(root.actuallayoutheight || parent.actuallayoutheight)/(Number(root.actualuiscale_y)||1)];
            }
        });
        sharedConfig.SurvivalStaticGridPerformance=staticGrid.stats;
    }
    if(staticGrid && sharedConfig.SurvivalGridState) {
        gridState=sharedConfig.SurvivalGridState.create({
            visibleBounds:function(){return staticGrid.visibleBounds ? staticGrid.visibleBounds() : null;},
            terrainHost:$("#GridPlacementTerrain"),dynamicHost:cellHost,footHost:$("#GridPlacementFootprintTiles"),
            // Behind-camera/offscreen plane geometry must never fall back to
            // thousands of engine WorldToScreen calls while the camera pans.
            project:function(world){return staticGrid.enabled() ? staticGrid.project(world) : screenPoint(world);},setStyle:setStyle,
            cameraKey:function(){return staticGrid.cameraKey();},
            cellSize:function(){return gridCellSize;},zOffset:function(){return previewVisual.grid_z_offset;},
            viewport:function(){
                var parent=topPanel();
                return [Number(root.actuallayoutwidth || parent.actuallayoutwidth)/(Number(root.actualuiscale_x)||1),
                    Number(root.actuallayoutheight || parent.actuallayoutheight)/(Number(root.actualuiscale_y)||1)];
            }
        });
        sharedConfig.SurvivalGridStatePerformance=gridState.stats;
    }
    function warmStaticGrid() {
        if(!currentController()) return;
        if (staticGrid && !activeProfile) staticGrid.warm();
        if (gridState && !activeProfile) {projectionCache={};projectionCacheSize=0;gridState.warm();}
        $.Schedule(profileCount ? 0.10 : 0.25,warmStaticGrid);
    }
    $.Schedule(0.1,warmStaticGrid);
    if (sharedConfig.SurvivalGridRangeCleanup) sharedConfig.SurvivalGridRangeCleanup();
    sharedConfig.SurvivalGridRangeCleanup = destroyRangeParticle;

    function hideProjectedVisuals() {
        if(gridState) gridState.hideFoot();
        if (staticGrid) staticGrid.hide();
        lastOverviewKey = "";
        lastOverviewDataKey = "";
        overviewDrawPending = true;
        for (var index = 0; index < cells.length; index += 1) {
            if (cells[index]) cells[index].visible = false;
        }
        destroyRangeParticle();
        if (cursorIcon) cursorIcon.visible = false;
    }

    function ensureCellPanels(count) {
        // Bound allocations per frame; show the footprint first while the
        // read-only surrounding overlay warms up over subsequent frames.
        var target = Math.min(count, cells.length + 24);
        while (cells.length < target) {
            var panel = $.CreatePanel("Panel", cells.length === 0 ? footprintHost : cellHost,
                "GridPlacementCell" + cells.length);
            panel.AddClass("GridPlacementCell");
            panel.hittest = false;
            panel.visible = false;
            panel.__edges = [];
            panel.__fills = [];
            panel.__marks = [];
            panel.__colorOnly=cells.length>0 && staticGrid && staticGrid.enabled();
            var staticCorners=cells.length===0 && staticGrid && staticGrid.enabled();
            for (var markIndex = 0; markIndex < (panel.__colorOnly?0:(staticCorners?4:2)); markIndex += 1) {
                var mark = $.CreatePanel("Panel", panel, "");
                mark.AddClass(staticCorners?"StaticGridMark":"GridPlacementCellMark");
                mark.hittest = false;
                panel.__marks.push(mark);
            }
            for (var edgeIndex = 0; edgeIndex < (panel.__colorOnly?0:4); edgeIndex += 1) {
                var edge = $.CreatePanel(
                    "Panel",
                    panel,
                    "GridPlacementCell" + cells.length + "Edge" + edgeIndex
                );
                edge.AddClass("GridPlacementCellEdge");
                edge.hittest = false;
                panel.__edges.push(edge);
            }
            // Only the selected footprint needs dense fill strips. Overview
            // tiles use two faint strips instead of eight full sets of styles.
            var fillCount = 2;
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
    }

    function warmPreviewPool() {
        if(!currentController()) return;
        if(gridState) return; // Terrain runs and per-cell quads replace the old 640-cell strip pool.
        // Allocate hidden UI only. Never validate terrain or spawn particles.
        // Active placement has priority and can use the already-warmed pool.
        if (profileCount === 0 || activeProfile) {
            $.Schedule(0.25, warmPreviewPool);
            return;
        }
        var target = Math.max(1, Math.min(960, Math.round(previewVisual.warm_pool_size)));
        var batch = Math.max(1, Math.min(12, Math.round(previewVisual.warm_batch_size)));
        ensureCellPanels(Math.min(target, cells.length + batch));
        if (!warmFootprintReady && cells.length) {
            var dividers = 0;
            for (var name in profiles) {
                if (!profiles.hasOwnProperty(name)) continue;
                dividers = Math.max(dividers, Number(profiles[name].grid_footprint_x || 2)
                    + Number(profiles[name].grid_footprint_y || 2) - 2);
            }
            var panel = cells[0];
            var decorations = [["__fills", Math.max(2, previewVisual.fill_strip_count), "GridPlacementCellFill"],
                ["__marks", staticGrid && staticGrid.enabled()?4:8,
                    staticGrid && staticGrid.enabled()?"StaticGridMark":"GridPlacementCellMark"],
                ["__dividers", dividers, "GridPlacementCellEdge"]];
            for (var d = 0; d < decorations.length; d += 1) {
                var spec = decorations[d];
                if (!panel[spec[0]]) panel[spec[0]] = [];
                while (panel[spec[0]].length < spec[1]) {
                    var child = $.CreatePanel("Panel", panel, "");
                    child.AddClass(spec[2]);
                    child.hittest = false;
                    child.visible = false;
                    panel[spec[0]].push(child);
                }
            }
            warmFootprintReady = true;
        }
        if (cells.length < target) $.Schedule(0.05, warmPreviewPool);
        else $.Msg("[GridPlacement] UI pool warmed=" + String(cells.length));
    }

    function setVisualValid(valid, message, pending) {
        var stateKey=String(!!pending)+":"+String(valid===true);
        if (root && root.SetHasClass && root.__placementStateKey!==stateKey) {
            root.SetHasClass("PlacementValid", !pending && valid === true);
            root.SetHasClass("PlacementInvalid", !pending && valid !== true);
            root.SetHasClass("PlacementPending", pending === true);
            root.__placementStateKey=stateKey;
        }
        if (!status) return;
        var relocate = activeProfile && activeProfile.placement_action === "relocate";
        var text=message || (valid ? (relocate ? "左键移动 · 右键取消" : "左键建造 · 右键取消")
            : (relocate ? "无法移动 · 请换个位置" : "无法建造 · 请换个位置"));
        if (status.text!==text) status.text=text;
    }

    function showProfile(profile, abilityIndex, unit, mode, session) {
        if (mode === "native" && blockedNativeCooldownAbility === abilityIndex) return false;
        if (profile.placement_action === "relocate" && rejectRelocationCooldown(abilityIndex)) return false;
        activePreviewSession = session || ++previewSessionSequence;
        activeProfile = profile;
        pendingRelocation = null;
        lastPoseKey=""; lastPoseAt=-10000;
        activeAbility = abilityIndex;
        activeUnit = unit;
        inputMode = mode;
        if (cursorIcon) cursorIcon.abilityname = String(profile.ability_name);
        lastAnchorKey = "";
        lastRequestAt = -100;
        lastSentAnchorKey = "";
        motionSample=null; fastMotion=false; fastUntil=-100; completedArea="";
        setStyle(cellHost,"opacity","0.0000");
        overviewSlots = {};
        overviewDrawPending = false;
        lastOverviewCells = [];
        projectionCache = {}; projectionCacheSize = 0; projectionViewKey = "";
        projectionProbeWorld = null;
        lastValidation = null;
        lastAreaValidation = null;
        lastOverviewKey = "";
        lastOverviewDataKey = "";
        lastOverviewAt = -100;
        newestResponse = requestSequence;
        root.RemoveClass("Hidden");
        if (!suppressedHint) {
            suppressedHint = findHudPanel("SurvivalPointTargetHint");
            if (suppressedHint) {
                previousHintOpacity = opacityValue(suppressedHint.style.opacity || 1);
                suppressedHint.style.opacity = "0";
            }
        }
        if (title) title.text = (profile.placement_action === "relocate" ? "网格移动 · " : "预建造 · ")
            + String(profile.display_name || profile.building_id);
        if(!gridState) ensureCellPanels(1);
        hideProjectedVisuals();
        setVisualValid(false);
        return true;
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
        pendingRelocation = null;
        activeAbility = -1;
        activeUnit = -1;
        inputMode = "";
        activePreviewSession = 0;
        lastAnchorKey = "";
        lastRequestAt = -100;
        lastValidation = null;
        hideProjectedVisuals();
        root.AddClass("Hidden");
        if (suppressedHint) suppressedHint.style.opacity = previousHintOpacity;
        suppressedHint = null;
        $.Msg("[GridPlacement] preview end");
    }

    function cancelCustomPointTarget(reason) {
        var pointInput = GameUI.CustomUIConfig().SurvivalPointTargetInput;
        if (pointInput && pointInput.Cancel) pointInput.Cancel(reason || "grid_cancel");
    }

    function cancelPreview(reason) {
        if (pendingRelocationStart) {
            GameEvents.SendCustomGameEventToServer("ui_grid_placement_preview_end", {
                ability_name: "ability_building_blink", session_id: String(pendingRelocationStart.session)
            });
            pendingRelocationStart = null;
            cancelCustomPointTarget(reason);
        } else if (inputMode === "custom") cancelCustomPointTarget(reason);
        hidePreview();
    }

    function cursorWorld(refreshCamera) {
        if(refreshCamera && staticGrid && staticGrid.enabled()) staticGrid.refreshView();
        var cursor = GameUI.GetCursorPosition();
        // Intersect the pointer with the displayed construction plane. Taking a
        // terrain hit's X/Y then replacing only Z shifts the preview on slopes.
        var world = cursor && staticGrid && staticGrid.enabled()
            ? staticGrid.worldAtScreen([cursor[0]/(Number(root.actualuiscale_x)||1),
                cursor[1]/(Number(root.actualuiscale_y)||1)])
            : (cursor ? GameUI.GetScreenWorldPosition(cursor) : null);
        var available = !!world;
        if (available !== cursorWorldAvailable) {
            cursorWorldAvailable = available;
            $.Msg("[GridPlacement][CLIENT] CURSOR_WORLD available=" + String(available)
                + " cursor=" + String(cursor));
        }
        return world;
    }

    function approximateAnchor(world) {
        function axis(value, footprint) {
            return Math.floor(value / gridCellSize + 0.5 - (footprint % 2) * 0.5);
        }
        return [
            axis(Number(world[0]), Number(activeProfile.grid_footprint_x || 2)),
            axis(Number(world[1]), Number(activeProfile.grid_footprint_y || 2))
        ];
    }

    function requestValidation(world, force) {
        var anchor = approximateAnchor(world);
        var key = String(anchor[0]) + ":" + String(anchor[1]) + ":" + activeProfile.ability_name;
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        var anchorChanged = key !== lastAnchorKey;
        lastAnchorKey = key;
        if (anchorChanged) {
            lastValidation = null;
            if (cells[0]) cells[0].visible=false;
            if (!fastMotion) setVisualValid(false, "正在验证建筑占地……", true);
        }
        // Crossed cells get a new request; same-cell motion gets none. A slow
        // heartbeat still catches units/buildings that enter a stationary cell.
        if (fastMotion && !force) return;
        if (!force && now - lastRequestAt < (key !== lastSentAnchorKey ? 0.10 : 0.75)) return;
        lastRequestAt = now;
        lastSentAnchorKey = key;
        requestSequence += 1;
        if (previewVisual.debug_requests) $.Msg("[GridPlacement][CLIENT] VALIDATE_SEND session="
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
            x: (anchor[0] + (Number(activeProfile.grid_footprint_x || 2) % 2) * 0.5) * gridCellSize,
            y: (anchor[1] + (Number(activeProfile.grid_footprint_y || 2) % 2) * 0.5) * gridCellSize,
            z: Number(world[2])
        });
    }

    function fallbackCellCorners(cell) {
        var centerX = Number(cell.x);
        var centerY = Number(cell.y);
        var centerZ = Number(cell.z);
        var halfCell = Number(cell.size || gridCellSize) * 0.5;
        return [
            { x: centerX - halfCell, y: centerY - halfCell, z: centerZ },
            { x: centerX + halfCell, y: centerY - halfCell, z: centerZ },
            { x: centerX + halfCell, y: centerY + halfCell, z: centerZ },
            { x: centerX - halfCell, y: centerY + halfCell, z: centerZ }
        ];
    }

    function projectCellCorners(cell, customZOffset) {
        var worldCorners = cell && cell.corners;
        if (!Array.isArray(worldCorners)) worldCorners = normalizeLuaArray(worldCorners);
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
        setStyle(edge, "position", left.toFixed(2) + "px " + top.toFixed(2) + "px 0px");
        setStyle(edge, "width", length.toFixed(2) + "px");
        setStyle(edge, "height", thickness.toFixed(2) + "px");
        setStyle(edge, "transform", "rotateZ(" + angle.toFixed(3) + "deg)");
        return true;
    }

    function cellWorldKey(cell) {
        return cell.corners.map(function(p){return p.x+","+p.y+","+p.z;}).join(";")
            + ":" + String(cell.footprint) + (staticGrid && staticGrid.enabled() && !cell.footprint
                ? "" : ":" + String(cell.edges) + ":" + String(cell.hideMark));
    }

    function renderCell(panel, cell, worldKey) {
        if (!panel || !panel.__edges || (!panel.__colorOnly && panel.__edges.length !== 4)) {
            if (panel) panel.visible = false;
            return;
        }
        panel.visible = true;
        panel.__footprint = cell.footprint === true;
        var valid = cell.ok === true || Number(cell.ok) === 1;
        var classKey = String(valid) + ":" + String(cell.footprint === true);
        if (panel.__classKey !== classKey) {
            panel.SetHasClass("Valid", valid);
            panel.SetHasClass("Invalid", !valid);
            panel.SetHasClass("Footprint", cell.footprint === true);
            panel.__classKey = classKey;
        }
        worldKey = worldKey || cellWorldKey(cell);
        if (panel.__worldKey === worldKey && panel.__viewKey === projectionViewKey) return;
        var points = projectCellCorners(cell);
        if (!points) { panel.visible = false; return; }
        panel.__worldKey = worldKey;
        panel.__viewKey = projectionViewKey;
        // Cache geometry and bound each panel to its own quad instead of
        // compositing hundreds of translucent full-screen containers.
        var geometryKey = points.map(function(p) { return p[0].toFixed(2) + "," + p[1].toFixed(2); }).join(";")
            + ":" + String(cell.footprint) + ":" + String(cell.edges) + ":" + String(cell.hideMark);
        if (panel.__geometryKey === geometryKey) return;
        panel.__geometryKey = geometryKey;
        var minX = Math.min(points[0][0], points[1][0], points[2][0], points[3][0]) - 8;
        var minY = Math.min(points[0][1], points[1][1], points[2][1], points[3][1]) - 8;
        var maxX = Math.max(points[0][0], points[1][0], points[2][0], points[3][0]) + 8;
        var maxY = Math.max(points[0][1], points[1][1], points[2][1], points[3][1]) + 8;
        setStyle(panel, "position", minX.toFixed(2) + "px " + minY.toFixed(2) + "px 0px");
        setStyle(panel, "width", (maxX - minX).toFixed(2) + "px");
        setStyle(panel, "height", (maxY - minY).toFixed(2) + "px");
        for (var pointIndex = 0; pointIndex < 4; pointIndex += 1) {
            points[pointIndex] = [points[pointIndex][0] - minX, points[pointIndex][1] - minY];
        }
        var fillCount = cell.footprint ? Math.max(1, Math.round(Number(previewVisual.fill_strip_count) || 8)) : 2;
        while (panel.__fills.length < fillCount) {
            var fill = $.CreatePanel("Panel", panel, "");
            fill.AddClass("GridPlacementCellFill");
            fill.hittest = false;
            panel.__fills.push(fill);
        }
        for (var fi = 0; fi < panel.__fills.length; fi += 1) panel.__fills[fi].visible = fi < fillCount;
        var axisX = points[1][0] - points[0][0];
        var axisY = points[1][1] - points[0][1];
        // Perpendicular distance, not the slanted edge length: no overlapping
        // translucent scanlines (the bright horizontal stripes in the old UI).
        var height = Math.abs(axisX * (points[3][1] - points[0][1])
            - axisY * (points[3][0] - points[0][0])) / Math.max(1, Math.sqrt(axisX * axisX + axisY * axisY));
        var fillThickness = Math.max(1, height / fillCount);
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
        for (var edgeIndex = 0; edgeIndex < panel.__edges.length; edgeIndex += 1) {
            panel.__edges[edgeIndex].visible = (cell.footprint || !staticGrid || !staticGrid.enabled())
                && (!cell.edges || cell.edges[edgeIndex]);
            if (!panel.__edges[edgeIndex].visible) continue;
            positionSegment(
                panel.__edges[edgeIndex],
                points[edgeIndex],
                points[(edgeIndex + 1) % 4],
                cell.footprint ? 1.5 : 1
            );
        }
        if (cell.footprint) {
            if (!panel.__dividers) panel.__dividers = [];
            var counts = [Math.round((cell.corners[1].x-cell.corners[0].x)/gridCellSize),
                Math.round((cell.corners[3].y-cell.corners[0].y)/gridCellSize)];
            var dividerCount = Math.max(0,counts[0]-1) + Math.max(0,counts[1]-1);
            while (panel.__dividers.length < dividerCount) {
                    var divider = $.CreatePanel("Panel", panel, "");
                    divider.AddClass("GridPlacementCellEdge");
                    divider.hittest = false;
                    panel.__dividers.push(divider);
            }
            var dividerIndex = 0;
            for (var axis = 0; axis < 2; axis += 1) {
                var a = points[axis], b = points[axis + 1];
                var c = points[(axis + 3) % 4], d = points[(axis + 2) % 4];
                for (var step = 1; step < counts[axis]; step += 1) {
                    var fraction = step / counts[axis];
                    var line = panel.__dividers[dividerIndex++];
                    line.visible = true;
                    positionSegment(line, [a[0]+(b[0]-a[0])*fraction,a[1]+(b[1]-a[1])*fraction],
                        [c[0]+(d[0]-c[0])*fraction,c[1]+(d[1]-c[1])*fraction], 1);
                }
            }
            for (var di = dividerCount; di < panel.__dividers.length; di++) panel.__dividers[di].visible = false;
        } else if (panel.__dividers) {
            for (var di = 0; di < panel.__dividers.length; di += 1) panel.__dividers[di].visible = false;
        }
        if (cell.footprint && staticGrid && staticGrid.enabled()) {
            // Exactly the same shared vector corner glyph as the white mesh.
            while (panel.__marks.length<4) {
                var marker=$.CreatePanel("Panel",panel,"");
                marker.AddClass("StaticGridMark");marker.hittest=false;panel.__marks.push(marker);
            }
            for (var mi=0;mi<panel.__marks.length;mi++) {
                var marker=panel.__marks[mi];marker.visible=mi<4;
                if(mi>=4) continue;
                marker.RemoveClass("GridPlacementCellMark");marker.AddClass("StaticGridMark");
                setStyle(marker,"position",(points[mi][0]-4).toFixed(2)+"px "+(points[mi][1]-4).toFixed(2)+"px 0px");
            }
            return;
        }
        // Same small cross at all four footprint corners; lazy allocation keeps
        // the surrounding overview at two strokes per shared grid intersection.
        var markCount = cell.footprint ? 8 : (cell.hideMark || (staticGrid && staticGrid.enabled()) ? 0 : 2);
        while (panel.__marks.length < markCount) {
            var mark = $.CreatePanel("Panel", panel, "");
            mark.AddClass("GridPlacementCellMark");
            mark.hittest = false;
            panel.__marks.push(mark);
        }
        var worldCorners = cell.corners || fallbackCellCorners(cell);
        for (var m = 0; m < panel.__marks.length; m += 1) {
            panel.__marks[m].visible = m < markCount;
            if (m >= markCount) continue;
            var cornerIndex = Math.floor(m / 2);
            var neighborIndex = (cornerIndex + (m % 2 === 0 ? 1 : 3)) % 4;
            var corner = points[cornerIndex], neighbor = points[neighborIndex];
            var worldDx = worldCorners[neighborIndex].x - worldCorners[cornerIndex].x;
            var worldDy = worldCorners[neighborIndex].y - worldCorners[cornerIndex].y;
            var ratio = Number(cell.mark_size || cell.size * 0.10 || gridCellSize * 0.20)
                / Math.max(1, Math.sqrt(worldDx * worldDx + worldDy * worldDy));
            var dx = (neighbor[0] - corner[0]) * ratio;
            var dy = (neighbor[1] - corner[1]) * ratio;
            var shrink = Math.min(1, 6 / Math.max(1, Math.sqrt(dx * dx + dy * dy)));
            dx *= shrink; dy *= shrink;
            positionSegment(panel.__marks[m], [corner[0] - dx, corner[1] - dy],
                [corner[0] + dx, corner[1] + dy], 1.5);
        }
    }

    function snappedCursorWorld(world) {
        if (world === undefined) world = cursorWorld();
        if (!world || !activeProfile) return world;
        var anchor = approximateAnchor(world);
        return [(anchor[0] + (Number(activeProfile.grid_footprint_x || 2) % 2) * 0.5) * gridCellSize,
            (anchor[1] + (Number(activeProfile.grid_footprint_y || 2) % 2) * 0.5) * gridCellSize,
            buildPlaneHeight!==null ? buildPlaneHeight : (lastValidation ? Number(lastValidation.world_z) : Number(world[2]))];
    }

    function updateMotion(world) {
        var now=Number(Game.GetGameTime());
        if (!world) { motionSample=null; return; }
        if (motionSample && now>motionSample.time) {
            var dx=world[0]-motionSample.x,dy=world[1]-motionSample.y;
            var distance=Math.sqrt(dx*dx+dy*dy);
            var speed=distance/Math.max(0.001,now-motionSample.time);
            if (speed>=previewVisual.fast_move_speed || distance>=gridCellSize*6) {
                if (!fastMotion) {
                    fastMotion=true;
                    fastUntil=now+previewVisual.motion_settle_seconds;
                    // Discard in-flight colors even if the cursor returns to
                    // the same anchor before the old response arrives.
                    lastValidation=null;
                    newestResponse=requestSequence+1;
                    GameEvents.SendCustomGameEventToServer("ui_grid_placement_pause_area",{
                        session_id:String(activePreviewSession),request_id:String(requestSequence)
                    });
                }
            }
            if (fastMotion && speed>=previewVisual.slow_move_speed) {
                fastUntil=now+previewVisual.motion_settle_seconds;
            }
            if (fastMotion && now+0.0001>=fastUntil) {
                fastMotion=false;
                lastRequestAt=-100; lastSentAnchorKey="";
                lastOverviewKey="";
            }
        }
        motionSample={x:world[0],y:world[1],time:now};
    }

    function assignOverviewSlots(list) {
        var wanted = {}, slots = [], nextSlots = {}, used = {0:true};
        function key(cell) {
            return cell.corners.map(function(p){return p.x+","+p.y+","+p.z;}).join(";");
        }
        for (var i=0;i<list.length;i++) {
            if (list[i].footprint) { slots[0]=list[i]; continue; }
            var id=key(list[i]); wanted[id]=list[i];
            if (overviewSlots.hasOwnProperty(id)) {
                var index=overviewSlots[id]; nextSlots[id]=index; used[index]=true; slots[index]=list[i];
            }
        }
        var free=1;
        for (var id in wanted) {
            if (!wanted.hasOwnProperty(id) || nextSlots.hasOwnProperty(id)) continue;
            while (used[free]) free++;
            nextSlots[id]=free; slots[free]=wanted[id]; used[free]=true;
        }
        overviewSlots=nextSlots;
        return slots;
    }

    function subtractFootprint(tile, minX, minY, maxX, maxY) {
        var half = tile.size / 2;
        var left = tile.x - half, right = tile.x + half;
        var bottom = tile.y - half, top = tile.y + half;
        var cutLeft = Math.max(left, minX), cutRight = Math.min(right, maxX);
        var cutBottom = Math.max(bottom, minY), cutTop = Math.min(top, maxY);
        if (cutLeft >= cutRight || cutBottom >= cutTop) return [tile];
        var pieces = [];
        function add(x0, y0, x1, y1) {
            if (x0 >= x1 || y0 >= y1) return;
            pieces.push({x:(x0+x1)/2, y:(y0+y1)/2, z:tile.z, size:tile.size, ok:tile.ok,
                hideMark: x0 !== left || y0 !== bottom,
                edges: [y0 === bottom && tile.edges[0], x1 === right && tile.edges[1],
                    y1 === top && tile.edges[2], x0 === left && tile.edges[3]],
                corners: [{x:x0,y:y0,z:tile.z},{x:x1,y:y0,z:tile.z},
                    {x:x1,y:y1,z:tile.z},{x:x0,y:y1,z:tile.z}]});
        }
        add(left, bottom, cutLeft, top);
        add(cutRight, bottom, right, top);
        add(cutLeft, bottom, cutRight, cutBottom);
        add(cutLeft, cutTop, cutRight, top);
        return pieces;
    }

    function decodeArea(data) {
        var footprint = normalizeLuaArray(data.cells);
        var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (var i = 0; i < footprint.length; i += 1) {
            minX = Math.min(minX, Number(footprint[i].x) - gridCellSize / 2);
            minY = Math.min(minY, Number(footprint[i].y) - gridCellSize / 2);
            maxX = Math.max(maxX, Number(footprint[i].x) + gridCellSize / 2);
            maxY = Math.max(maxY, Number(footprint[i].y) + gridCellSize / 2);
        }
        var area = String(data.area || "");
        var source = area.split("|");
        var packed = source[0] === "3" && source.length === 8;
        var modern = source[0] === "2" && source.length === 3;
        var size = packed || modern ? Number(source[1]) : gridCellSize;
        if (areaTilesSource !== area) {
            var tileMap = {};
            areaTiles = [];
            function addTile(x,y,z,ok,heights) {
                var cell = {x:(x+0.5)*size,y:(y+0.5)*size,z:z,ok:ok,size:size,grid_x:x,grid_y:y};
                cell.corners = fallbackCellCorners(cell);
                if (heights) for (var c=0;c<4;c++) cell.corners[c].z=heights[c+4];
                areaTiles.push(cell); tileMap[x+":"+y]=true;
            }
            if (packed) {
                var width=Number(source[4]), height=Number(source[5]);
                var originX=Number(source[2]), originY=Number(source[3]), z=Number(source[6]);
                // Decode directly into cells; avoid thousands of temporary
                // CSV strings, splits and Number-array allocations per reply.
                for (var i=0;i<width*height;i++) {
                    var bits=parseInt(source[7].charAt(Math.floor(i/2)),16);
                    var state=(bits >> ((i%2)*2)) & 3;
                    if (state) addTile(originX+Math.floor(i/height),originY+i%height,z,state===2?1:0);
                }
            } else {
                var rows=(modern?source[2]:source[0]).split(";");
                for (var r=0;r<rows.length;r++) {
                    var v=rows[r].split(",").map(Number);
                    if (v.length===(modern?4:8)) addTile(v[0],v[1],v[2],v[3],modern?null:v);
                }
            }
            for (var t=0;t<areaTiles.length;t++) {
                var tile=areaTiles[t];
                tile.edges=[true,!tileMap[(tile.grid_x+1)+":"+tile.grid_y],
                    !tileMap[tile.grid_x+":"+(tile.grid_y+1)],true];
            }
            areaTilesSource=area;
        }
        var result=areaTiles;
        if (footprint.length) {
            // Cut out the exact 64-unit construction footprint, even when it
            // only overlaps half of a 128-unit overview tile. No white lines or
            // red fills remain under the selected green footprint.
            var clipped = [];
            for (var clipIndex = 0; clipIndex < result.length; clipIndex += 1) {
                var pieces=subtractFootprint(result[clipIndex], minX, minY, maxX, maxY);
                for (var piece=0;piece<pieces.length;piece++) clipped.push(pieces[piece]);
            }
            result = clipped;
            var z = Number(data.world_z) || Number(footprint[0].z) || 0;
            var centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
            result.sort(function(a, b) {
                return Math.pow(a.x - centerX, 2) + Math.pow(a.y - centerY, 2)
                    - Math.pow(b.x - centerX, 2) - Math.pow(b.y - centerY, 2);
            });
            result.unshift({ x: centerX, y: centerY, z: z,
                footprint: true, mark_size: size * 0.10, ok: Number(data.success), corners: [
                    {x:minX,y:minY,z:z}, {x:maxX,y:minY,z:z},
                    {x:maxX,y:maxY,z:z}, {x:minX,y:maxY,z:z}
                ] });
        }
        return result;
    }

    function renderCursorRange(world) {
        if (!world) return;
        var b=nativeRangeBounds;
        var usePlane=!!(b && (world[0]<b.min_x || world[0]>b.max_x || world[1]<b.min_y || world[1]>b.max_y));
        var planeReady=staticGrid && staticGrid.setPlaneRange && staticGrid.setPlaneRange(usePlane);
        if(usePlane && planeReady) {destroyRangeParticle();return;}
        // Valve range_display: CP0 = center, CP1.x = radius, CP2 = HSL
        // adjustment (zero preserves native green), CP3.x = quickcast fade switch.
        // Its native children provide the ground-following edge/fill/shadow.
        if (rangeParticle !== null && rangeParticleRadius !== previewVisual.radius) {
            destroyRangeParticle();
        }
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        if (rangeParticle === null && now >= nextParticleAttempt) {
            nextParticleAttempt = now + 1;
            try {
                var created = Particles.CreateParticle(RANGE_PARTICLE,
                    ParticleAttachment_t.PATTACH_WORLDORIGIN, -1);
                if (created !== undefined && created !== null && created >= 0) {
                    rangeParticle = created;
                    rangeParticleRadius = previewVisual.radius;
                    Particles.SetParticleControl(created, 0, world);
                    Particles.SetParticleControl(created, 1, [previewVisual.radius, 0, 0]);
                    Particles.SetParticleControl(created, 2, [0, 0, 0]);
                    Particles.SetParticleControl(created, 3, [0, 0, 0]);
                    nextParticleAttempt = -100;
                }
            } catch (error) {
                destroyRangeParticle();
                $.Msg("[GridPlacement] native range particle unavailable: " + String(error));
            }
        }
        if (rangeParticle !== null && rangeWorldKey !== world.join(",")) {
            Particles.SetParticleControl(rangeParticle, 0, world);
            rangeWorldKey = world.join(",");
        }
    }

    function renderValidation(data, pending) {
        if (!activeProfile || !data) return;
        if(gridState) {
            setVisualValid(!pending && Number(data.success)===1,pending?"正在验证建筑占地……":"",!!pending);
            setStyle(cellHost,"opacity","1.0000");return;
        }
        var renderStarted = Date.now();
        var responseCells = data.__decodedCells || (data.__decodedCells = decodeArea(data));
        var currentWorld = snappedCursorWorld();
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : 0;
        // Three fixed world points capture camera pan/rotation/zoom without
        // reprojecting hundreds of tiles when the camera and cursor are still.
        if (!projectionProbeWorld) projectionProbeWorld = [Number(data.world_x)||0,
            Number(data.world_y)||0,Number(data.world_z)||0];
        var probeX=projectionProbeWorld[0],probeY=projectionProbeWorld[1],probeZ=projectionProbeWorld[2];
        var viewKey = staticGrid && staticGrid.enabled() ? staticGrid.cameraKey() : [screenPoint([probeX, probeY, probeZ],true),
            screenPoint([probeX + 128, probeY, probeZ],true),
            screenPoint([probeX, probeY + 128, probeZ],true)].map(function(p) {
                return p ? p[0].toFixed(2) + "," + p[1].toFixed(2) : "off";
            }).join(":") + ":" + root.actuallayoutwidth + ":" + root.actuallayoutheight;
        if (viewKey !== projectionViewKey || projectionCacheSize > 8192) {
            projectionCache={}; projectionCacheSize=0; projectionViewKey=viewKey;
        }
        var dataKey = String(data.area) + ":" + validationKey(data) + ":" + data.success + ":" + data.world_z;
        var overviewKey = dataKey + ":" + viewKey
            + ":" + (currentWorld ? Math.round(currentWorld[0] / 8) + "," + Math.round(currentWorld[1] / 8) : "none");
        var updateOverview = cells.length < lastOverviewCells.length
            || dataKey !== lastOverviewDataKey
            || (overviewKey !== lastOverviewKey && now - lastOverviewAt >= 0.10);
        if (updateOverview) {
            lastOverviewKey = overviewKey; lastOverviewDataKey = dataKey; lastOverviewAt = now;
            var viewportWidth = Number(root.actuallayoutwidth) / (Number(root.actualuiscale_x) || 1);
            var viewportHeight = Number(root.actuallayoutheight) / (Number(root.actualuiscale_y) || 1);
            lastOverviewCells = assignOverviewSlots(responseCells.filter(function(cell) {
                if (cell.footprint || !viewportWidth || !viewportHeight) return true;
                // Zero-alpha outer cells and offscreen tiles never allocate panels.
                var dx = currentWorld ? cell.x-currentWorld[0] : 0;
                var dy = currentWorld ? cell.y-currentWorld[1] : 0;
                if (dx*dx+dy*dy > Math.pow(previewVisual.radius * 0.86,2)) return false;
                var corners = projectCellCorners(cell);
                if (!corners) return false;
                var xs = corners.map(function(p){return p[0];}), ys = corners.map(function(p){return p[1];});
                return Math.max.apply(Math,xs)>=0 && Math.min.apply(Math,xs)<=viewportWidth
                    && Math.max.apply(Math,ys)>=0 && Math.min.apply(Math,ys)<=viewportHeight;
            }));
        }
        responseCells = lastOverviewCells;
        ensureCellPanels(responseCells.length);
        var drawOverview=updateOverview || overviewDrawPending;
        overviewDrawPending=cells.length<responseCells.length;
        var newGeometry=0;
        for (var index = 0; index < cells.length; index += 1) {
            var panel = cells[index];
            var cell = responseCells[index];
            if (!panel || !cell) {
                if (panel && panel.visible) panel.visible = false;
                continue;
            }
            if (pending && cell.footprint) {
                panel.visible = false;
                continue;
            }
            if (!cell.footprint && !drawOverview) continue;
            if (!cell.footprint && currentWorld
                && Math.pow(cell.x - currentWorld[0], 2) + Math.pow(cell.y - currentWorld[1], 2)
                    > previewVisual.radius * previewVisual.radius) {
                panel.visible = false;
                continue;
            }
            var distance = 0;
            if (!cell.footprint && currentWorld && (!staticGrid || !staticGrid.enabled())) {
                // Fade using the farthest corner, so the entire tile disappears
                // inside the native ring, including its corner markers.
                var fadeCorners = cell.corners || fallbackCellCorners(cell);
                for (var fc = 0; fc < fadeCorners.length; fc += 1) {
                    distance = Math.max(distance, Math.sqrt(
                        Math.pow(fadeCorners[fc].x - currentWorld[0], 2)
                        + Math.pow(fadeCorners[fc].y - currentWorld[1], 2)) / previewVisual.radius);
                }
            }
            var fadeEnd = Math.max(0.1, Math.min(1, previewVisual.edge_fade_end));
            var fadeStart = Math.max(0, Math.min(fadeEnd - 0.01, previewVisual.edge_fade_start));
            var fade = Math.max(0, Math.min(1, (fadeEnd - distance) / (fadeEnd - fadeStart)));
            var opacity = cell.footprint ? 1 : Math.pow(fade * fade * (3 - 2 * fade), 2);
            setStyle(panel, "opacity", opacityValue(opacity));
            if (!cell.footprint && opacity < 0.01) {
                panel.visible = false;
                continue;
            }
            var worldKey=cellWorldKey(cell);
            // New/reassigned tiles are the expensive path (dozens of layout
            // writes each). Spread these out; retained tiles only change alpha
            // or color, and the exact footprint is always drawn immediately.
            if (!cell.footprint && panel.__worldKey !== worldKey) {
                if (newGeometry >= 48) {
                    panel.visible=false; overviewDrawPending=true; continue;
                }
                newGeometry++;
            }
            renderCell(panel, cell, worldKey);
        }
        setVisualValid(!pending && Number(data.success) === 1,
            pending ? "正在验证建筑占地……" : "",!!pending);
        setStyle(footprintHost,"opacity","1.0000");
        // Warm/layout batches stay hidden and are revealed together. This is
        // a hard visibility switch, not a radial reveal or opacity animation.
        setStyle(cellHost,"opacity",overviewDrawPending || Number(data.area_complete)===0
            ? "0.0000" : "1.0000");
        var renderMs=Date.now()-renderStarted;
        sharedConfig.SurvivalGridPerformance={render_ms:renderMs,new_tiles:newGeometry,
            pending:overviewDrawPending,visible_slots:responseCells.length,projection_cache:projectionCacheSize};
        if (renderMs>=8 && now-lastPerfLogAt>=5) {
            lastPerfLogAt=now;
            $.Msg("[GridPlacement][PERF] render_ms="+renderMs+" new_tiles="+newGeometry
                +" slots="+responseCells.length+" pending="+overviewDrawPending);
        }
    }

    function validationKey(data) {
        if (!data || !activeProfile) return "";
        return String(Number(data.anchor_x)) + ":" + String(Number(data.anchor_y))
            + ":" + activeProfile.ability_name;
    }

    function validationIsCurrentAndLegal() {
        return !fastMotion && lastValidation
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

    function submitRelocation(world) {
        if (pendingRelocation) return true;
        if (rejectRelocationCooldown(activeAbility)) return true;
        var destination = snappedCursorWorld(world);
        if (!destination || !isFinite(destination[0]) || !isFinite(destination[1])
            || !isFinite(destination[2])) return true;
        // A click is an intent at this cell, never authorization from an old
        // green reply. The server checks ownership/range/occupancy again.
        pendingRelocation = activePreviewSession;
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_commit", {
            session_id: String(activePreviewSession), entindex: activeUnit,
            ability_entindex: activeAbility, ability_name: activeProfile.ability_name,
            x: destination[0], y: destination[1], z: destination[2]
        });
        setVisualValid(false, "正在确认移动位置……", true);
        return true;
    }

    function resumeRelocationStart() {
        if (!currentController()) return;
        var pending = pendingRelocationStart;
        if (!pending) return;
        if (rejectRelocationCooldown(pending.ability)) return;
        if (selectedUnit() !== pending.unit) { cancelPreview("selection_changed"); return; }
        var profile = profiles.ability_building_blink;
        var pointInput = controllerConfig.SurvivalPointTargetInput;
        if (!profile || !pointInput || !pointInput.Begin) return;
        if (!pointInput.Begin(pending.ability, pending.unit)) { cancelPreview("ability_unavailable"); return; }
        pendingRelocationStart = null;
        if (!showProfile(profile, pending.ability, pending.unit, "custom", pending.session)) return;
        // Cold profiles must not eat the first click or use a later cursor.
        if (pending.world) submitRelocation(pending.world);
        else {
            var world = cursorWorld(true);
            if (world) requestValidation(world, true);
        }
    }

    function updatePreviewModel(world) {
        if(!activeProfile || Number(activeProfile.preview_model)!==1) return;
        var now=Date.now(), key=world[0]+":"+world[1]+":"+world[2];
        if(now-lastPoseAt<50 || (key===lastPoseKey && now-lastPoseAt<500)) return;
        lastPoseAt=now; lastPoseKey=key; poseSequence++;
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_pose", {
            session_id:String(activePreviewSession), request_id:String(poseSequence),
            ability_name:activeProfile.ability_name, entindex:activeUnit,
            ability_entindex:activeAbility, x:world[0], y:world[1], z:world[2]
        });
    }

    function updateLoop() {
        if(!currentController()) return;
        // Keep input/validation alive even if a visual API rejects a frame.
        $.Schedule(0.035, updateLoop);
        if (pendingRelocationStart) {
            resumeRelocationStart();
            if (pendingRelocationStart) return;
        }
        var customName = customPointTargetName();
        var customProfile = profiles[customName];
        var nativeIndex = nativeActiveAbility();
        var nativeName = abilityName(nativeIndex);
        var nativeProfile = profiles[nativeName];
        if (nativeIndex !== blockedNativeCooldownAbility) blockedNativeCooldownAbility = -1;
        if (!customProfile && !nativeProfile && !activeProfile) blockedCooldownAbility = -1;
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
        if (activeProfile && activeProfile.placement_action === "relocate"
            && selectedUnit() !== activeUnit) cancelPreview("selection_changed");
        if (activeProfile && activeProfile.placement_action === "relocate"
            && !pendingRelocation && rejectRelocationCooldown(activeAbility)) return;
        if (activeProfile) {
            var frameStarted=Date.now();
            renderCursorIcon();
            if(staticGrid && staticGrid.enabled()) staticGrid.refreshView();
            var cameraFinished=Date.now();
            var rawWorld=cursorWorld();
            updateMotion(rawWorld);
            var world = snappedCursorWorld(rawWorld);
            if (world) {
                if (!pendingRelocation) {
                    updatePreviewModel(world);
                    requestValidation(world);
                }
                renderCursorRange(world);
                if (staticGrid) staticGrid.update(world,true);
                var rangeFinished=Date.now();
                if(gridState) {
                    var camera=staticGrid.cameraKey();
                    if(camera!==projectionViewKey || projectionCacheSize>8192) {
                        projectionCache={};projectionCacheSize=0;projectionViewKey=camera;
                    }
                    gridState.update(world,activeProfile,lastValidation);
                    setStyle(cellHost,"opacity","1.0000");
                }
                var statesFinished=Date.now();
                framePerformance.frames++;
                framePerformance.max_total_ms=Math.max(framePerformance.max_total_ms,statesFinished-frameStarted);
                framePerformance.max_camera_ms=Math.max(framePerformance.max_camera_ms,cameraFinished-frameStarted);
                framePerformance.max_range_ms=Math.max(framePerformance.max_range_ms,rangeFinished-cameraFinished);
                framePerformance.max_state_ms=Math.max(framePerformance.max_state_ms,statesFinished-rangeFinished);
                if (fastMotion) {
                    if(!gridState) setStyle(cellHost,"opacity","0.0000");
                    setStyle(footprintHost,"opacity","0.0000");
                    setVisualValid(false,gridState
                        ? (activeProfile.placement_action === "relocate" ? "左键移动 · 右键取消" : "左键建造 · 右键取消")
                        : "移动中 · 停稳后显示可放置区域",true);
                } else if (lastValidation) renderValidation(lastValidation);
                else if (lastAreaValidation) renderValidation(lastAreaValidation, true);
            } else {
                lastValidation = null;
                lastAreaValidation = null;
                hideProjectedVisuals();
                renderCursorIcon();
            }
        }
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
        buildPlaneHeight=data.static_grid && isFinite(Number(data.static_grid.height)) ? Number(data.static_grid.height) : null;
        nativeRangeBounds=data.static_grid && data.static_grid.build_bounds || null;
        if (staticGrid) staticGrid.configure(data.static_grid,gridCellSize,previewVisual);
        // Panorama may hot-reload the controller before its shared helper.
        // Older retained instances must not abort profile registration.
        if (gridState && gridState.configureLayout) gridState.configureLayout(data.static_grid);
        for (var index = 0; index < list.length; index += 1) {
            profiles[String(list[index].ability_name)] = list[index];
            profileCount += 1;
        }
        $.Msg("[GridPlacement] profiles loaded=" + String(list.length)
            + " cell_size=" + String(gridCellSize));
        resumeRelocationStart();
    }

    function onValidation(data) {
        var sequence = Number(data && data.request_id);
        var responseSession = Number(data && data.session_id);
        var responseAbility = String(data && data.ability_name || "");
        var responseAnchorKey = String(data && data.request_anchor_x) + ":"
            + String(data && data.request_anchor_y) + ":" + responseAbility;
        if (previewVisual.debug_requests) $.Msg("[GridPlacement][CLIENT] VALIDATE_RECV session=" + String(responseSession)
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
        if (activeProfile.placement_action === "relocate" && data.error === "move_ability_cooldown") {
            rejectRelocationCooldown(activeAbility, true);
            return;
        }
        if (fastMotion) return;
        if (Number(data.area_complete)===0 && completedArea) {
            data.area=completedArea; data.area_complete=1;
        } else if (Number(data.area_complete)!==0) completedArea=String(data.area||"");
        lastValidation = data;
        if(gridState && Number(data.area_complete)!==0) gridState.ingestDynamic(data.area);
        if (lastAreaValidation && data.area === lastAreaValidation.area
            && data.success === lastAreaValidation.success
            && validationKey(data) === validationKey(lastAreaValidation)
            && data.world_z === lastAreaValidation.world_z) {
            data.__decodedCells = lastAreaValidation.__decodedCells;
        }
        lastAreaValidation = data;
    }

    function onCommitResult(data) {
        if (!currentController()) return;
        if (pendingRelocation && data && Number(data.session_id) === pendingRelocation
            && activeProfile && activeProfile.placement_action === "relocate") {
            if (Number(data.success) === 1) {
                cancelCustomPointTarget("grid_submitted");
                hidePreview(false);
            } else {
                if (data.error === "move_ability_cooldown") {
                    rejectRelocationCooldown(activeAbility, true);
                    return;
                }
                // Rejection closes the server session; preserve placement in
                // a fresh one so the next cell can be clicked without another D.
                if (!showProfile(activeProfile, activeAbility, activeUnit, inputMode)) return;
                var world = cursorWorld(true);
                if (world) requestValidation(world, true);
                setVisualValid(false, "无法移动 · 请换个位置");
            }
        }
        if (data && Number(data.success) !== 1) {
            $.Msg("[GridPlacement] commit rejected: " + String(data.error || "unknown"));
        }
    }

    function onArea(data) {
        if (!activeProfile || Number(data.session_id) !== activePreviewSession
            || data.ability_name !== activeProfile.ability_name || fastMotion) return;
        var complete=Number(data.complete)!==0;
        if(gridState && complete) gridState.ingestDynamic(data.area);
        if (!complete && completedArea) return;
        if (complete) completedArea=String(data.area||"");
        if (lastValidation && lastValidation.area !== data.area) {
            lastValidation.area = data.area; lastValidation.__decodedCells = null;
        }
        if (lastAreaValidation && lastAreaValidation.area !== data.area) {
            lastAreaValidation.area = data.area; lastAreaValidation.__decodedCells = null;
        }
        if (lastValidation) lastValidation.area_complete=complete?1:0;
        if (lastAreaValidation) lastAreaValidation.area_complete=complete?1:0;
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
        if (!showProfile(profile, ability, unit, "custom")) return false;
        var world = cursorWorld(true);
        if (world) requestValidation(world);
        return true;
    }

    function mouseHandler(eventName, button) {
        if (pendingRelocationStart && eventName === "pressed") {
            if (button === 1) { cancelPreview("right_click"); return true; }
            if (button === 0) {
                var waitingWorld = cursorWorld(true);
                if (waitingWorld && !pendingRelocationStart.world) {
                    pendingRelocationStart.world = [Number(waitingWorld[0]), Number(waitingWorld[1]), Number(waitingWorld[2])];
                }
                resumeRelocationStart();
                return true;
            }
        }
        if (!activeProfile) activateCustomPreviewImmediately();
        if (!activeProfile || eventName !== "pressed") return false;
        if (button === 1) {
            var consumeRightClick = inputMode === "custom";
            cancelPreview("right_click");
            return consumeRightClick;
        }
        if (button !== 0) return false;
        var world = cursorWorld(true);
        if (!world) return true;
        if (inputMode === "custom" && activeProfile.placement_action === "relocate") {
            if (selectedUnit() !== activeUnit) { cancelPreview("selection_changed"); return true; }
            return submitRelocation(world);
        }
        if (fastMotion) {
            fastMotion=false; fastUntil=-100;
            motionSample={x:world[0],y:world[1],time:Number(Game.GetGameTime())};
            requestValidation(world,true);
        } else requestValidation(world);
        if (!validationIsCurrentAndLegal()) {
            setVisualValid(false, "当前位置不可放置或仍在等待校验", !lastValidation);
            return true;
        }
        if (inputMode === "custom") return submitCustomPlacement();
        return false;
    }

    function keyHandler(key, down) {
        if (!activeProfile) activateCustomPreviewImmediately();
        var normalized = String(key || "").toUpperCase();
        if (pendingRelocationStart && down && (normalized === "ESC" || normalized === "ESCAPE")) {
            cancelPreview("escape"); return true;
        }
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

    controllerConfig.SurvivalGridPlacement = {
        BeginRelocation: function (ability, unit) {
            if (!currentController()) return false;
            blockedCooldownAbility = -1;
            if (rejectRelocationCooldown(Number(ability))) return false;
            cancelPreview("relocation_restart");
            pendingRelocationStart = {session: ++previewSessionSequence, ability: Number(ability), unit: Number(unit)};
            if (!profiles.ability_building_blink) {
                GameEvents.SendCustomGameEventToServer("ui_grid_placement_profiles_request", {});
            }
            resumeRelocationStart();
            return !!pendingRelocationStart || !!activeProfile;
        },
        IsRelocating: function (unit) {
            return currentController() && ((!!pendingRelocationStart && pendingRelocationStart.unit === Number(unit))
                || (!!activeProfile && activeProfile.placement_action === "relocate" && activeUnit === Number(unit)));
        },
        CancelRelocation: function () {
            if (pendingRelocationStart || (activeProfile && activeProfile.placement_action === "relocate")) cancelPreview("relocation_cancel");
        }
    };

    if(controllerConfig.SurvivalGridUnsubscribe) controllerConfig.SurvivalGridUnsubscribe();
    var subscriptions=[];
    function subscribe(name,fn) {
        subscriptions.push(GameEvents.Subscribe(name,function(data){if(currentController()) fn(data);}));
    }
    controllerConfig.SurvivalGridUnsubscribe=function(){
        if(GameEvents.Unsubscribe) for(var i=0;i<subscriptions.length;i++) GameEvents.Unsubscribe(subscriptions[i]);
    };
    subscribe("ui_grid_placement_profiles", onProfiles);
    subscribe("ui_grid_placement_static_area",function(data){
        if(gridState && gridState.configure(data.area)) $.Msg("[GridPlacement] static terrain atlas received");
    });
    subscribe("ui_grid_placement_validation", onValidation);
    subscribe("ui_grid_placement_area", onArea);
    subscribe("ui_grid_placement_commit_result", onCommitResult);
    bindInputHandlers();
    $.Msg("[GridPlacement] client preview initialized");

    function requestProfilesUntilReady() {
        if(!currentController()) return;
        if (profileCount > 0) return;
        GameEvents.SendCustomGameEventToServer("ui_grid_placement_profiles_request", {});
        $.Schedule(1.0, requestProfilesUntilReady);
    }

    function maintainInputPriority() {
        if(!currentController()) return;
        bindInputHandlers();
        $.Schedule(0.5, maintainInputPriority);
    }

    function updateCursorIconLoop() {
        if(!currentController()) return;
        if(activeProfile) renderCursorIcon();
        $.Schedule(activeProfile?1/60:0.1,updateCursorIconLoop);
    }
    requestProfilesUntilReady();
    $.Schedule(0.1,updateCursorIconLoop);
    $.Schedule(0.1, updateLoop);
    $.Schedule(0.5, maintainInputPriority);
    $.Schedule(0.5, warmPreviewPool);
})();
