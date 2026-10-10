(function () {
    "use strict";

    var LOG_PREFIX = "[SurvivalUIBootstrap]";
    $.Msg("[SURVIVAL_INPUT] BOOTSTRAP_ENTER version=20260928_hero_portrait_single_jump");
    // Phase 0 rollback boundary. Keep inventory native until the separate item
    // interaction controller (use/drag/swap/drop/sell) is complete.
    GameUI.CustomUIConfig().SurvivalHudTakeover = {
        // Crash isolation v3: pressing Alt still crashes after every configurable
        // native Alt overlay was disabled. Keep Valve's ability tree completely
        // native so Alt detail refresh cannot observe suppressed AbilityN children.
        abilities: false,
        // Keep Valve's ability bar, but selectively proxy upgrade tooltips so
        // dynamic resources and property deltas can use real Panorama images.
        abilityTooltips: true,
        // Keep the completed survey available through SurvivalAbilityTakeover,
        // but run the evidence-based adaptive proxy implementation by default.
        abilitySurvey: false,
        // Character numbers remain authoritative, but detailed stat hover
        // tooltips are intentionally disabled.
        stats: false,
        inventory: false
    };
    var inputConfig = GameUI.CustomUIConfig();
    var inputGeneration = Number(inputConfig.SurvivalInputLifecycleGeneration || 0) + 1;
    var inputContextId = String(Date.now()) + "_" + String(inputGeneration);
    var keyHandlers = {};
    var keyHandlerOrder = [];
    var mouseHandlers = {};
    var mouseHandlerOrder = [];
    inputConfig.SurvivalInputLifecycleGeneration = inputGeneration;

    function registerHandler(handlers, order, id, handler, priority) {
        id = String(id || "");
        if (!id || typeof handler !== "function") return false;
        handlers[id] = {
            callback: handler,
            priority: Number(priority || 0)
        };
        if (order.indexOf(id) < 0) order.push(id);
        order.sort(function (left, right) {
            return handlers[right].priority - handlers[left].priority;
        });
        return true;
    }

    function dispatch(handlers, order, args) {
        for (var index = 0; index < order.length; index++) {
            var entry = handlers[order[index]];
            if (entry && entry.callback.apply(null, args)) return true;
        }
        return false;
    }

    inputConfig.SurvivalInputDispatcher = {
        generation: inputGeneration,
        context_id: inputContextId,
        RegisterKeyHandler: function (id, handler, priority) {
            return registerHandler(keyHandlers, keyHandlerOrder, id, handler, priority);
        },
        RegisterMouseHandler: function (id, handler, priority) {
            return registerHandler(mouseHandlers, mouseHandlerOrder, id, handler, priority);
        },
        DispatchKey: function (key, down) {
            return dispatch(keyHandlers, keyHandlerOrder, [key, down]);
        }
    };
    if (inputConfig.SurvivalUILayers && inputConfig.SurvivalUILayers.BindInput) {
        inputConfig.SurvivalUILayers.BindInput(inputConfig.SurvivalInputDispatcher);
    }

    function validUnit(unit) {
        return isFinite(Number(unit)) && Number(unit) >= 0
            && Entities.IsValidEntity(Number(unit));
    }

    function selectedEntities(playerId) {
        var selected = [];
        try { selected = Players.GetSelectedEntities(playerId) || []; } catch (error) {}
        if (Array.isArray(selected)) return selected.map(Number);
        return Object.keys(selected).sort(function (left, right) {
            return Number(left) - Number(right);
        }).map(function (key) { return Number(selected[key]); });
    }

    function builderEntity(playerId) {
        var identity = CustomNetTables.GetTableValue(
            "survival_builder_identity", "player_" + String(playerId)
        ) || {};
        if (identity.entindex === undefined || identity.entindex === null) return -1;
        var builder = Number(identity.entindex);
        return validUnit(builder) ? builder : -1;
    }

    function sendClientDiagnostic(stage, payload) {
        var data = payload || {};
        data.stage = stage;
        GameEvents.SendCustomGameEventToServer("ui_client_diagnostic", data);
    }

    function focusCameraOnUnit(target, position) {
        if (typeof GameUI.MoveCameraToEntity === "function") {
            try {
                GameUI.MoveCameraToEntity(target);
                return "move_to_entity";
            } catch (error) {}
        }
        if (!position || typeof GameUI.SetCameraTargetPosition !== "function") {
            return "api_unavailable";
        }
        try {
            GameUI.SetCameraTargetPosition(position, 0.0);
            return "target_position_fallback";
        } catch (error) {
            return "api_error:" + String(error);
        }
    }

    function resolveSelectedUnit() {
        var playerId = Game.GetLocalPlayerID();
        var portrait = -1;
        try { portrait = Number(Players.GetLocalPlayerPortraitUnit()); } catch (error) {}
        var selected = selectedEntities(playerId).filter(validUnit);
        var fusionQueue = inputConfig.SurvivalLumberjackFusionQueue;
        var fusionFocus = fusionQueue && fusionQueue.ResolveFocus ? fusionQueue.ResolveFocus(selected) : -1;
        if (fusionFocus >= 0) return fusionFocus;
        var builder = builderEntity(playerId);
        var portraitName = validUnit(portrait) ? (Entities.GetUnitName(portrait) || "") : "";
        if (validUnit(portrait) && portraitName !== "npc_dota_hero_undying"
            && selected.indexOf(portrait) >= 0) return portrait;
        if (builder >= 0 && selected.indexOf(builder) >= 0) return builder;
        if (selected.length > 0) return selected[0];
        if (validUnit(portrait) && portraitName !== "npc_dota_hero_undying") return portrait;
        if (builder >= 0) return builder;
        var hero = Number(Players.GetPlayerHeroEntityIndex(playerId));
        return validUnit(hero) ? hero : -1;
    }

    var displayIdentityMode = "selection";
    var selectionIdentityLockUntil = 0;

    function resolveDisplayUnit() {
        var playerId = Game.GetLocalPlayerID();
        var portrait = -1;
        try { portrait = Number(Players.GetLocalPlayerPortraitUnit()); } catch (error) {}
        var portraitName = validUnit(portrait) ? (Entities.GetUnitName(portrait) || "") : "";
        if (displayIdentityMode === "query" && validUnit(portrait)
            && portraitName !== "npc_dota_hero_undying") return portrait;
        var selected = selectedEntities(playerId).filter(validUnit);
        var fusionQueue = inputConfig.SurvivalLumberjackFusionQueue;
        var fusionFocus = fusionQueue && fusionQueue.ResolveFocus ? fusionQueue.ResolveFocus(selected) : -1;
        if (fusionFocus >= 0) return fusionFocus;
        if (selected.length > 0) return selected[0];
        if (validUnit(portrait) && portraitName !== "npc_dota_hero_undying") return portrait;
        return resolveSelectedUnit();
    }

    inputConfig.SurvivalSelectionResolver = {
        BuilderEntity: function () { return builderEntity(Game.GetLocalPlayerID()); },
        Resolve: resolveSelectedUnit,
        ResolveDisplayUnit: resolveDisplayUnit,
        SetDisplayIdentityMode: function (mode) {
            var now = Date.now();
            if (mode === "query" && now < selectionIdentityLockUntil) return false;
            displayIdentityMode = mode === "query" ? "query" : "selection";
            if (displayIdentityMode === "selection") {
                selectionIdentityLockUntil = now + 250;
            }
            return true;
        },
        Snapshot: function () {
            var playerId = Game.GetLocalPlayerID();
            var portrait = -1;
            try { portrait = Number(Players.GetLocalPlayerPortraitUnit()); } catch (error) {}
            var resolved = resolveSelectedUnit();
            return {
                selected: selectedEntities(playerId).join(","),
                portrait: portrait,
                resolved: resolved,
                resolved_name: validUnit(resolved) ? (Entities.GetUnitName(resolved) || "") : "",
                builder: builderEntity(playerId)
            };
        }
    };

    // Native chat lives above the custom HUD. Follow only the focused branch;
    // never assume that a visible chat history means the user is typing.
    function textInputActive() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        function focusedText(panel) {
            if (!panel || (panel.IsValid && !panel.IsValid())) return false;
            var selfFocus = panel.BHasKeyFocus && panel.BHasKeyFocus();
            var childFocus = panel.BHasDescendantKeyFocus && panel.BHasDescendantKeyFocus();
            if (!selfFocus && !childFocus) return false;
            if (/textentry/i.test(String(panel.paneltype || ""))
                || panel.id === "ChatInput" || panel.id === "HudChat") return true;
            var count = panel.GetChildCount ? panel.GetChildCount() : 0;
            for (var index = 0; index < count; index++) {
                if (focusedText(panel.GetChild(index))) return true;
            }
            return false;
        }
        return focusedText(root);
    }

    function shortcutsBlocked() {
        if (Number(inputConfig.SurvivalInputLifecycleGeneration) !== inputGeneration) return true;
        if (textInputActive()) return true;
        var layers = inputConfig.SurvivalUILayers;
        if (layers && layers.Top && layers.Top()) return true;
        // Legacy destroy confirmation has no UILayers lease yet.
        var context = $.GetContextPanel();
        var destroy = context && context.FindChildTraverse("ArrowTowerDestroyConfirm");
        if (destroy && (!destroy.IsValid || destroy.IsValid()) && destroy.visible !== false
            && destroy.BHasClass && !destroy.BHasClass("Hidden")) return true;
        var loading = CustomNetTables.GetTableValue("survival_loading", "state");
        if (loading) {
            var ready = loading.admission_complete;
            if (ready === undefined) ready = loading.all_ready;
            if (ready !== undefined && ready !== true && Number(ready) !== 1) return true;
        }
        var playerId = Game.GetLocalPlayerID();
        if (playerId < 0) return true;
        var snapshot = CustomNetTables.GetTableValue("survival_ui_state", "player_" + String(playerId));
        var defeated = snapshot && snapshot.wave && snapshot.wave.player_defeated;
        return defeated === true || Number(defeated) === 1;
    }

    inputConfig.SurvivalShortcutGuard = {
        IsBlocked: shortcutsBlocked,
        IsTextInputActive: textInputActive
    };

    function canSelectBuilder() {
        if (shortcutsBlocked()) return false;
        var playerId = Game.GetLocalPlayerID(), builder = builderEntity(playerId);
        // The server's per-player identity is authoritative. Creature owner
        // getters can disagree after native hero replacement.
        return validUnit(builder) && Entities.IsAlive(builder);
    }

    var lastBuilderSelectTime = -1000;
    function selectBuilder(source) {
        if (!canSelectBuilder()) return false;
        var now = Date.now();
        // A native callback and its fallback command can fire for the same key.
        if (now - lastBuilderSelectTime < 100) return false;
        lastBuilderSelectTime = now;
        var builder = builderEntity(Game.GetLocalPlayerID());
        inputConfig.SurvivalSelectionResolver.SetDisplayIdentityMode("selection");
        GameUI.SelectUnit(builder, false);
        var cameraResult = focusCameraOnUnit(builder, Entities.GetAbsOrigin(builder));
        sendClientDiagnostic("space_select", {
            builder: builder, target: builder, source: String(source || "unknown"),
            result: "select_builder", camera_result: cameraResult
        });
        return true;
    }

    inputConfig.SurvivalBuilderSelection = {
        Select: selectBuilder,
        CanSelect: canSelectBuilder
    };

    function selectBuilderOnSpace(key, down) {
        if (String(key).toUpperCase() !== "SPACE" || down === false) return false;
        if (textInputActive()) return false;
        selectBuilder("key_dispatch");
        // Consume unavailable/modal actions too, so native Space cannot select
        // the hidden placeholder hero or act behind an open window.
        return true;
    }

    registerHandler(keyHandlers, keyHandlerOrder,
        "placeholder_space_guard", selectBuilderOnSpace, 120);
    function canSelectHero() {
        if (shortcutsBlocked()) return false;
        var playerId = Game.GetLocalPlayerID();
        var hero = Number(Players.GetPlayerHeroEntityIndex(playerId));
        if (!validUnit(hero) || Entities.GetPlayerOwnerID(hero) !== playerId) return false;
        // A failed engine replacement can retain a real hero name while hidden
        // as the placeholder. Accept only the server's successful summon identity.
        var identity = CustomNetTables.GetTableValue("survival_hero_skills", "player_" + String(playerId));
        if (!identity || Number(identity.hero_ready) !== 1
            || Number(identity.unit_entindex) !== hero || !identity.hero_id) return false;
        var name = Entities.GetUnitName(hero);
        return name !== "npc_dota_hero_undying" && name !== "npc_survival_builder_proxy";
    }

    var lastHeroSelectTime = -1000;
    function selectHero(source) {
        if (!canSelectHero()) return false;
        var now = Date.now();
        if (now - lastHeroSelectTime < 100) return false;
        lastHeroSelectTime = now;
        var hero = Number(Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID()));
        inputConfig.SurvivalSelectionResolver.SetDisplayIdentityMode("selection");
        GameUI.SelectUnit(hero, false);
        // A dead hero may still be selected to inspect it; do not move the
        // camera to its hidden/death location while awaiting respawn.
        var cameraResult = Entities.IsAlive(hero)
            ? focusCameraOnUnit(hero, Entities.GetAbsOrigin(hero)) : "hero_dead";
        sendClientDiagnostic("f1_select", {
            target: hero, source: String(source || "unknown"),
            result: "select_hero", camera_result: cameraResult
        });
        return true;
    }

    inputConfig.SurvivalHeroSelection = { Select: selectHero, CanSelect: canSelectHero,
        // A cached portrait callback can survive a HUD reload. Its old entry
        // point also performs exactly one jump; no camera timer is created.
        SelectAndFollow:selectHero, IsFollowing:function () { return false; } };
    registerHandler(keyHandlers,keyHandlerOrder,"commerce_blink",function(key,down){
        return String(key).toUpperCase()==="D" && down!==false && !textInputActive()
            && inputConfig.SurvivalCommerceBlink && inputConfig.SurvivalCommerceBlink();
    },130);
    registerHandler(mouseHandlers,mouseHandlerOrder,"commerce_aim",function(eventName,button){
        return inputConfig.SurvivalCommerceAim && inputConfig.SurvivalCommerceAim(eventName,button);
    },130);
    registerHandler(keyHandlers, keyHandlerOrder, "hero_f1_selection", function (key, down) {
        if (String(key).toUpperCase() !== "F1" || down === false) return false;
        if (textInputActive()) return false;
        selectHero("key_dispatch");
        return true;
    }, 120);

    // BEGIN shared box-selection filter
﻿    function installBoxSelectionFilter() {
    "use strict";
    var cfg=GameUI.CustomUIConfig(),dispatcher=cfg.SurvivalInputDispatcher,context=$.GetContextPanel();
    if(!dispatcher)return;
    var generation=dispatcher.generation,gesture=null,pending=null,serial=0,rewriting=false;
    var trace=[],lastFilter=null;
    var installId=String(Date.now())+":"+String(generation);
    var api={ObserveMouse:observeMouse,generation:generation,installId:installId};
    cfg.SurvivalBoxSelectionFilter=api;
    function active(){return cfg.SurvivalBoxSelectionFilter && cfg.SurvivalBoxSelectionFilter.installId===installId && Number(cfg.SurvivalInputLifecycleGeneration)===Number(generation) && (!context.IsValid || context.IsValid());}
    function valid(unit){return isFinite(Number(unit)) && Number(unit)>=0 && Entities.IsValidEntity(Number(unit));}
    function selected(){
        var raw=Players.GetSelectedEntities(Game.GetLocalPlayerID())||[];
        var values=Array.isArray(raw)?raw:Object.keys(raw).sort(function(a,b){return Number(a)-Number(b);}).map(function(k){return raw[k];});
        return values.map(Number).filter(function(unit,index,all){return valid(unit)&&all.indexOf(unit)===index;});
    }
    function fixedTarget(unit){
        if(!valid(unit))return false;
        var name=String(Entities.GetUnitName(unit)||"");
        if(/^(building_|npc_dota_unit_building_|asset_proxy_(tower_|wall_))/.test(name) || name==="npc_dota_unit_ultimate_tower" || /^npc_archive_challenge_[123]$/.test(name) || name==="enemy_tree" || name==="npc_dota_unit_enemy_tree")return true;
        return !!(Entities.IsBuilding && Entities.IsBuilding(unit));
    }
    function cancel(){serial++;gesture=null;pending=null;}
    function worldPoint(point){
        if(!point || !isFinite(point[0]) || !isFinite(point[1]))return false;
        var layers=cfg.SurvivalUILayers;
        if(layers && layers.Top && layers.Top())return false;
        var blocked=(cfg.HandoffWorldOcclusion||[]).some(function(r){return point[0]>=r.x && point[0]<=r.x+r.width && point[1]>=r.y && point[1]<=r.y+r.height;});
        if(blocked)return false;
        return !GameUI.GetScreenWorldPosition || !!GameUI.GetScreenWorldPosition(point);
    }
    function replaceSelection(units){
        if(!units.length)return;
        rewriting=true;
        try {
            var resolver=cfg.SurvivalSelectionResolver;
            if(resolver && resolver.SetDisplayIdentityMode)resolver.SetDisplayIdentityMode("selection");
            units.forEach(function(unit,index){GameUI.SelectUnit(unit,index>0);});
        } finally {rewriting=false;}
    }
    function finish(token){
        if(!active() || !pending || pending.token!==token || rewriting)return;
        if(Date.now()>pending.until){pending=null;return;}
        var state=pending,current=selected();
        var boxed=state.shift?current.filter(function(unit){return state.before.indexOf(unit)<0;}):current;
        if(boxed.length===1 && fixedTarget(boxed[0]) && Entities.GetUnitName(boxed[0])!=="enemy_tree")return;
        var keep=current.filter(function(unit){return !fixedTarget(unit) || (state.shift && state.before.indexOf(unit)>=0);});
        if(keep.length===current.length)return;
        if(!keep.length)keep=state.before.filter(valid);
        if(!keep.length){
            var resolver=cfg.SurvivalSelectionResolver,builder=resolver && resolver.BuilderEntity ? resolver.BuilderEntity():-1;
            if(valid(builder))keep=[builder];
            else {var hero=Players.GetPlayerHeroEntityIndex(Game.GetLocalPlayerID());if(valid(hero)&&!fixedTarget(hero)&&Entities.GetUnitName(hero)!=="npc_dota_hero_undying")keep=[hero];}
        }
        if(keep.length===current.length && keep.every(function(unit,index){return unit===current[index];}))return;
        // The engine can publish another rectangle update after SelectUnit.
        // Keep the short gesture window active; a deliberate new input cancels it.
        lastFilter={before:current.slice(),after:keep.slice(),source:state.source};
        replaceSelection(keep);
    }
    function endGesture(state,source){
        if(!active() || gesture!==state)return;
        gesture=null;
        var end=GameUI.GetCursorPosition(),dx=end[0]-state.start[0],dy=end[1]-state.start[1];
        if(dx*dx+dy*dy<64)return;
        pending={token:state.token,before:state.before,shift:state.shift,source:source,until:Date.now()+650};
        [0,0.03,0.10,0.21,0.40,0.66].forEach(function(delay){$.Schedule(delay,function(){finish(state.token);});});
    }
    function watchGesture(state){
        if(!active() || gesture!==state)return;
        // Source 2 consumes the release of native rectangle selection, so the
        // mouse callback can receive only pressed. Poll only while a gesture exists.
        if(!GameUI.IsMouseDown(0)){endGesture(state,"mouse_state");return;}
        $.Schedule(0.016,function(){watchGesture(state);});
    }
    function observeMouse(eventName,button,consumed,clickMode){
        if(Game.IsInToolsMode && Game.IsInToolsMode()) {
            trace.push({event:eventName,button:button,consumed:consumed,mode:clickMode,active:active(),point:GameUI.GetCursorPosition(),before:selected()});
            if(trace.length>12)trace.shift();
        }
        if(!active())return;
        if(eventName==="pressed" || eventName==="doublepressed"){
            cancel();
            var none=typeof CLICK_BEHAVIORS!=="undefined" ? CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE:0;
            if(eventName!=="pressed" || button!==0 || consumed || clickMode!==none)return;
            var point=GameUI.GetCursorPosition();if(!worldPoint(point))return;
            gesture={start:[point[0],point[1]],before:selected(),shift:!!(GameUI.IsShiftDown&&GameUI.IsShiftDown()),token:serial};
            if(typeof GameUI.IsMouseDown==="function"){
                var started=gesture;$.Schedule(0.016,function(){watchGesture(started);});
            }
            return;
        }
        if(eventName!=="released" || button!==0 || !gesture)return;
        if(consumed){cancel();return;}
        endGesture(gesture,"mouse_callback");
    }
    dispatcher.RegisterKeyHandler("box_selection_cancel",function(key,down){
        if(down!==false && !/^(SHIFT|LSHIFT|RSHIFT|CTRL|CONTROL|ALT)$/.test(String(key).toUpperCase()))cancel();
        return false;
    },1000);
    api.Inspect=function(){return {active:active(),generation:generation,currentGeneration:cfg.SurvivalInputLifecycleGeneration,mode:GameUI.GetClickBehaviors(),none:typeof CLICK_BEHAVIORS!=="undefined"?CLICK_BEHAVIORS.DOTA_CLICK_BEHAVIOR_NONE:"missing",gesture:gesture,pending:pending,lastFilter:lastFilter,mouseDown:typeof GameUI.IsMouseDown==="function"?GameUI.IsMouseDown(0):null,trace:trace,selected:selected().map(function(id){return {id:id,name:Entities.GetUnitName(id),fixed:fixedTarget(id)};})};};
    if(Game.IsInToolsMode && Game.IsInToolsMode() && Game.AddCommand){
        $.Msg("[BOX_SELECTION_READY] build=mouse_state_v3 generation=",generation);
        var command="survival_box_selection_inspect_"+Date.now();
        Game.AddCommand(command,function(){$.Msg("[BOX_SELECTION_INSPECT] ",JSON.stringify(api.Inspect()));},"Inspect drag selection filter",0);
    }
    GameEvents.Subscribe("dota_player_update_selected_unit",function(){
        if(!active() || !pending || rewriting)return;
        var token=pending.token;$.Schedule(0,function(){finish(token);});
    });
    }
    installBoxSelectionFilter();
    // END shared box-selection filter

    // CustomUIConfig survives Workshop Tools Run, callbacks do not. Always
    // replace both dispatchers for this fresh HUD context.
    if (GameUI.SetKeyPressedCallback) {
        GameUI.SetKeyPressedCallback(function (key, down) {
            return dispatch(keyHandlers, keyHandlerOrder, [key, down]);
        }, this);
    }
    GameUI.SetMouseCallback(function (eventName, button, gameTime) {
        var clickMode = GameUI.GetClickBehaviors ? GameUI.GetClickBehaviors() : null;
        var consumed = dispatch(mouseHandlers, mouseHandlerOrder, [eventName, button, gameTime]);
        var selectionFilter = inputConfig.SurvivalBoxSelectionFilter;
        if (selectionFilter && selectionFilter.ObserveMouse) {
            selectionFilter.ObserveMouse(eventName, button, consumed, clickMode);
        }
        return consumed;
    });
    if (Game.AddCommand && Game.CreateCustomKeyBind) {
        var fallbackKeys = ["Q", "W", "E", "R", "T", "Y", "U", "S", "D", "F", "G", "H", "C", "F1", "F2", "TAB", "SPACE"];
        var fallbackCommands = {};
        fallbackKeys.forEach(function (key) {
            var command = "survival_input_" + inputContextId + "_"
                + String(key).toLowerCase();
            fallbackCommands[key] = command;
            try {
                Game.AddCommand(command, function () {
                    var currentConfig = GameUI.CustomUIConfig();
                    var dispatcher = currentConfig.SurvivalInputDispatcher;
                    $.Msg("[SURVIVAL_INPUT] FALLBACK_TRIGGER callback_generation=",
                        String(inputGeneration), " dispatcher_generation=",
                        String(dispatcher && dispatcher.generation), " key=", key,
                        " command=", command);
                    if (!dispatcher || !dispatcher.DispatchKey) return false;
                    return dispatcher.DispatchKey(key, true);
                }, "Survival input " + key, 0);
                $.Msg("[SURVIVAL_INPUT] FALLBACK_COMMAND generation=",
                    String(inputGeneration), " key=", key, " command=", command);
            } catch (error) {
                $.Warning("[SURVIVAL_INPUT] FALLBACK_COMMAND_FAILED generation="
                    + String(inputGeneration) + " key=" + key + " command="
                    + command + " error=" + String(error));
            }
        });
        var applyFallbackBinds = function () {
            var activeDispatcher = GameUI.CustomUIConfig().SurvivalInputDispatcher;
            if (!activeDispatcher || activeDispatcher.context_id !== inputContextId) {
                $.Msg("[SURVIVAL_INPUT] FALLBACK_BINDS_SKIPPED stale_context=",
                    inputContextId, " active_context=",
                    String(activeDispatcher && activeDispatcher.context_id));
                return;
            }
            fallbackKeys.forEach(function (key) {
                try {
                    Game.CreateCustomKeyBind(key, fallbackCommands[key]);
                } catch (error) {
                    $.Warning("[SURVIVAL_INPUT] FALLBACK_BIND_FAILED generation="
                        + String(inputGeneration) + " key=" + key + " command="
                        + fallbackCommands[key] + " error=" + String(error));
                }
            });
            $.Msg("[SURVIVAL_INPUT] FALLBACK_BINDS_APPLIED generation=",
                String(inputGeneration), " keys=", fallbackKeys.join(""));
        };
        applyFallbackBinds();
        $.Schedule(0.5, applyFallbackBinds);
        $.Schedule(2.5, applyFallbackBinds);
    }
    $.Msg("[SURVIVAL_INPUT] LIFECYCLE_BOUND generation=", String(inputGeneration),
        " context=", inputContextId);
    var hiddenElements = [
        "DOTA_DEFAULT_UI_TOP_BAR",
        "DOTA_DEFAULT_UI_TOP_BAR_BACKGROUND",
        "DOTA_DEFAULT_UI_TOP_HEROES",
        "DOTA_DEFAULT_UI_TOP_TIMEOFDAY",
        "DOTA_DEFAULT_UI_FLYOUT_SCOREBOARD",
        "DOTA_DEFAULT_UI_INVENTORY_SHOP",
        "DOTA_DEFAULT_UI_INVENTORY_QUICKBUY",
        "DOTA_DEFAULT_UI_INVENTORY_COURIER",
        "DOTA_DEFAULT_UI_INVENTORY_PROTECT",
        "DOTA_DEFAULT_UI_INVENTORY_GOLD",
        "DOTA_DEFAULT_UI_SHOP_SUGGESTEDITEMS",
        "DOTA_DEFAULT_UI_SHOP_COMMONITEMS"
    ];

    // 官方 Reborn 底栏本身已经存在于 hud_reborn.xml 中。
    // 直接恢复引擎管理的角色窗口、技能和物品，而不是复制一套失去绑定的 DOTA* 控件。
    var enabledElements = [
        "DOTA_DEFAULT_UI_ACTION_PANEL",
        "DOTA_DEFAULT_UI_INVENTORY_PANEL",
        "DOTA_DEFAULT_UI_INVENTORY_ITEMS"
    ];

    // 通过 DotaDefaultUIElement_t 隐藏原生底栏；不再猜测原生 HUD 内部节点名，避免误伤头像/三围。
    function setDefaultUIEnabledSafe(elementName, enabled) {
        if (typeof DotaDefaultUIElement_t === "undefined") return false;
        var element = DotaDefaultUIElement_t[elementName];
        if (element === undefined) {
            $.Warning(LOG_PREFIX + " missing default UI enum: " + elementName);
            return false;
        }
        GameUI.SetDefaultUIEnabled(element, enabled);
        return true;
    }

    function hideOfficialTopLeftPanels() {
        var root = $.GetContextPanel();
        while (root && root.GetParent && root.GetParent()) root = root.GetParent();
        if (!root || !root.FindChildTraverse) return;
        ["MenuButtons", "quickstats", "spectator_quickstats"].forEach(function (id) {
            var target = root.FindChildTraverse(id);
            if (!target) return;
            target.style.visibility = "collapse";
            target.hittest = false;
            target.hittestchildren = false;
        });
    }

    function applyDefaultUIProfile() {
        if (!GameUI || !GameUI.SetDefaultUIEnabled) {
            $.Warning(LOG_PREFIX + " GameUI.SetDefaultUIEnabled is unavailable.");
            return;
        }
        hiddenElements.forEach(function (name) {
            setDefaultUIEnabledSafe(name, false);
        });
        enabledElements.forEach(function (name) {
            setDefaultUIEnabledSafe(name, true);
        });
        hideOfficialTopLeftPanels();
        $.Msg(LOG_PREFIX + " official Reborn action panel restored; custom shop profile applied.");
    }


    function trimmedNumber(value) {
        return value.toFixed(1).replace(/\.0$/, "");
    }

    // Chinese large-number units advance by four decimal places. Keep this
    // table shared by health, combat stats, resources and production costs.
    var numberUnits = [
        [1, ""], [1e4, "万"], [1e8, "亿"], [1e12, "兆"],
        [1e16, "京"], [1e20, "垓"], [1e24, "秭"], [1e28, "穰"],
        [1e32, "沟"], [1e36, "涧"], [1e40, "正"], [1e44, "载"]
    ];

    function formatLogicalNumber(value) {
        var number = Number(value || 0);
        if (!isFinite(number)) return "—";
        var sign = number < 0 ? "-" : "";
        var absolute = Math.abs(number);
        var index = 0;
        while (index + 1 < numberUnits.length && absolute >= numberUnits[index + 1][0]) index += 1;
        var scaled = absolute / numberUnits[index][0];
        var text = index === 0 && Math.abs(scaled - Math.round(scaled)) < 0.001
            ? String(Math.round(scaled)) : trimmedNumber(scaled);
        // Promote after rounding too: 9999.96亿 is displayed as 1兆.
        if (Number(text) >= 10000) {
            index += 1;
            if (index < numberUnits.length) {
                text = trimmedNumber(absolute / numberUnits[index][0]);
            } else {
                // Endless progression can exceed the named units. Bound the
                // label length instead of leaving hundreds of digits before 载.
                return sign + absolute.toExponential(1).replace(/\.0e/, "e").replace("e+", "e");
            }
        }
        return (text === "0" ? "" : sign) + text + numberUnits[index][1];
    }

    GameUI.CustomUIConfig().SurvivalNumberFormatter = {
        Format: formatLogicalNumber,
        Compact: formatLogicalNumber
    };

    $.Msg("[SURVIVAL_CRASH_ISOLATION] crash_isolation_v3_alt_ability_takeover_disabled abilities=false research_lab_native=true ability_tooltips=true native_ability_tree=true builder_tooltip_proxy=true");
    $.Msg(LOG_PREFIX + " loaded.");
    applyDefaultUIProfile();
    $.Schedule(0.10, applyDefaultUIProfile);
    $.Schedule(1.00, applyDefaultUIProfile);
    $.Schedule(3.00, applyDefaultUIProfile);
})();

// BEGIN hero summon initial availability
(function(){
    var cfg=GameUI.CustomUIConfig();
    cfg.SurvivalHeroSummonAvailability=function(ability, runtime){
        runtime=runtime||{};
        var name='';
        try{name=Abilities.GetAbilityName(Number(ability))||runtime.ability_name||'';}catch(e){name=runtime.ability_name||'';}
        if(name!=='ability_summon_monkey_king' && name!=='ability_summon_blademaster')return runtime;
        if(runtime.hero_summon===1 && Number(runtime.summon_player_id)===Game.GetLocalPlayerID())return runtime;
        // Absence of an explicit per-player decision never grants paid access.
        var locked={};Object.keys(runtime).forEach(function(key){locked[key]=runtime[key];});
        locked.ability_name=name;locked.available=0;locked.prerequisite_met=0;locked.status_text='英雄权限同步中';
        return locked;
    };
})();
// END hero summon initial availability
