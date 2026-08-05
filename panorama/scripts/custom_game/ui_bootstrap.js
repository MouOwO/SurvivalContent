(function () {
    "use strict";

    var LOG_PREFIX = "[SurvivalUIBootstrap]";
    $.Msg("[SURVIVAL_INPUT] BOOTSTRAP_ENTER version=20260804_camera_target_position_v3");
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

    function resolveDisplayUnit() {
        var portrait = -1;
        try { portrait = Number(Players.GetLocalPlayerPortraitUnit()); } catch (error) {}
        var portraitName = validUnit(portrait) ? (Entities.GetUnitName(portrait) || "") : "";
        if (validUnit(portrait) && portraitName !== "npc_dota_hero_undying") return portrait;
        return resolveSelectedUnit();
    }

    inputConfig.SurvivalSelectionResolver = {
        BuilderEntity: function () { return builderEntity(Game.GetLocalPlayerID()); },
        Resolve: resolveSelectedUnit,
        ResolveDisplayUnit: resolveDisplayUnit,
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

    function selectPlayableUnitOnSpace(key, down) {
        if (String(key).toUpperCase() !== "SPACE" || down === false) return false;
        var playerId = Game.GetLocalPlayerID();
        var hero = Number(Players.GetPlayerHeroEntityIndex(playerId));
        var heroName = validUnit(hero) ? (Entities.GetUnitName(hero) || "") : "";
        var builder = builderEntity(playerId);
        var target = heroName === "npc_dota_hero_undying" ? builder : hero;
        var targetOrigin = validUnit(target) ? Entities.GetAbsOrigin(target) : null;
        var cameraResult = "target_unavailable";
        if (validUnit(target)) {
            GameUI.SelectUnit(target, false);
            cameraResult = focusCameraOnUnit(target, targetOrigin);
        }
        sendClientDiagnostic("space_select", {
            hero: hero,
            hero_name: heroName,
            builder: builder,
            target: target,
            result: validUnit(target) ? "select_playable" : "block_placeholder",
            move_camera_api: typeof GameUI.MoveCameraToEntity,
            camera_api: typeof GameUI.SetCameraTargetPosition,
            camera_result: cameraResult
        });
        $.Msg("[SURVIVAL_SELECTION] SPACE_SELECT player=", String(playerId),
            " hero=", String(hero), " hero_name=", heroName,
            " builder=", String(builder), " target=", String(target),
            " camera=", cameraResult,
            " action=", validUnit(target) ? "select_playable" : "block_placeholder");
        return true;
    }

    registerHandler(keyHandlers, keyHandlerOrder,
        "placeholder_space_guard", selectPlayableUnitOnSpace, 120);
    // CustomUIConfig survives Workshop Tools Run, callbacks do not. Always
    // replace both dispatchers for this fresh HUD context.
    if (GameUI.SetKeyPressedCallback) {
        GameUI.SetKeyPressedCallback(function (key, down) {
            return dispatch(keyHandlers, keyHandlerOrder, [key, down]);
        }, this);
    }
    GameUI.SetMouseCallback(function (eventName, button, gameTime) {
        return dispatch(mouseHandlers, mouseHandlerOrder, [eventName, button, gameTime]);
    });
    if (Game.AddCommand && Game.CreateCustomKeyBind) {
        var fallbackKeys = ["Q", "W", "E", "R", "T", "Y", "U", "D", "F", "F2", "TAB", "SPACE"];
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

    function formatLogicalNumber(value) {
        var number = Number(value || 0);
        var sign = number < 0 ? "-" : "";
        var absolute = Math.abs(number);
        if (absolute >= 100000000) {
            return sign + trimmedNumber(absolute / 100000000) + "亿";
        }
        if (absolute >= 10000) {
            return sign + trimmedNumber(absolute / 10000) + "万";
        }
        if (Math.abs(absolute - Math.round(absolute)) < 0.001) {
            return sign + String(Math.round(absolute));
        }
        return sign + trimmedNumber(absolute);
    }

    GameUI.CustomUIConfig().SurvivalNumberFormatter = {
        Format: formatLogicalNumber
    };

    $.Msg("[SURVIVAL_CRASH_ISOLATION] crash_isolation_v3_alt_ability_takeover_disabled abilities=false ability_tooltips=true native_ability_tree=true builder_tooltip_proxy=true");
    $.Msg(LOG_PREFIX + " loaded.");
    applyDefaultUIProfile();
    $.Schedule(0.10, applyDefaultUIProfile);
    $.Schedule(1.00, applyDefaultUIProfile);
    $.Schedule(3.00, applyDefaultUIProfile);
})();
