(function () {
    "use strict";

    var TABLE = "survival_hero_health_bar";
    var PREFIX = "unit_";
    var panels = {};
    var states = {};
    var seenEntities = {}, aliveSnapshotCount = 0;
    var container = $("#SurvivalHeroWorldHealthBars");
    var config = GameUI.CustomUIConfig(), context = $.GetContextPanel();
    var frame = null, frameKind = null, scheduleGeneration = 0;
    var listener = null, stopped = false, controller = null;
    var IDLE_RECOVERY_SECONDS = 1;
    var schedulerCounts = {callbacks:0, activeAttempts:0, idleChecks:0, eventWakes:0};
    var probeAllowed = typeof Game.IsInToolsMode === "function" && Game.IsInToolsMode();
    var probeStats = null, probeApi = null, probeToken = 0;
    if (config.SurvivalWorldHealthBars && config.SurvivalWorldHealthBars.Stop) {
        config.SurvivalWorldHealthBars.Stop();
    }

    function captureMetrics() {
        if (!probeAllowed) return null;
        var api = config.SurvivalClientCallbackProbe;
        var token = api && api.CaptureToken ? api.CaptureToken() : 0;
        if (!token) return null;
        if (api !== probeApi || token !== probeToken) {
            probeApi = api; probeToken = token;
            probeStats = {observed:false, captureSerial:token,
                scope:"updatePositions frame loop; NetTable style writes excluded",
                frames:0, missingContainerFrames:0, modalBlockedFrames:0,
                statesVisited:0, peakStates:0, activeSnapshots:0, deadSnapshots:0,
                invalidEntities:0, unrenderableEntities:0, activeEntities:0,
                invalidOrigins:0, projected:0, offScreen:0, invalidAnchors:0,
                occluded:0, displayed:0, errors:0,
                positionReads:0, positionWrites:0, positionUnchanged:0,
                equivalentPositionWrites:0, visibilityWrites:0, healthWidthWrites:0,
                getterSamples:[]};
        }
        return probeStats;
    }

    function samplePosition(metrics, expected, actual) {
        var a = String(actual).trim().split(/\s+/), b = expected.split(/\s+/);
        var equivalent = a.length === b.length && a.every(function (value, index) {
            return /^-?\d+(?:\.\d+)?px$/.test(value)
                && Math.abs(parseFloat(value) - parseFloat(b[index])) <= 0.001;
        });
        if (equivalent) metrics.equivalentPositionWrites += 1;
        var samples = metrics.getterSamples;
        for (var index = 0; index < samples.length; index++) {
            if (samples[index].expected === expected && samples[index].actual === String(actual)) {
                samples[index].count += 1; return;
            }
        }
        if (samples.length < 12) samples.push({expected:expected.slice(0,160),
            actual:String(actual).slice(0,160), equivalent:equivalent, count:1});
    }

    function barWidth(state) {
        var width = Number(state && state.bar_width);
        return width === 120 || width === 156 ? width : 62;
    }

    function localTeam() {
        try {
            return Number(Players.GetTeam(Game.GetLocalPlayerID()));
        } catch (error) {
            return -1;
        }
    }

    function validPanel(target) {
        return target && (!target.IsValid || target.IsValid());
    }

    function current() {
        if (stopped) return false;
        if (!validPanel(context) || config.SurvivalWorldHealthBars !== controller) {
            stop(); return false;
        }
        return true;
    }

    function ensureContainer() {
        if (!validPanel(container)) container = $("#SurvivalHeroWorldHealthBars");
        return validPanel(container);
    }

    function hasAliveSnapshot() { return aliveSnapshotCount > 0; }

    function cancelFrame() {
        scheduleGeneration += 1;
        if (frame !== null && $.CancelScheduled) $.CancelScheduled(frame);
        frame = null; frameKind = null;
    }

    function schedule(kind) {
        if (stopped) return;
        if (frame !== null) {
            if (frameKind === kind) return;
            // Panorama supports cancellation. A limited preview without that
            // API can reuse its one pending callback instead of duplicating it.
            if (!$.CancelScheduled) { frameKind = kind; return; }
            cancelFrame();
        }
        frameKind = kind;
        var generation = ++scheduleGeneration;
        frame = $.Schedule(kind === "frame" ? 0.0 : IDLE_RECOVERY_SECONDS, function () {
            if (generation !== scheduleGeneration || stopped) return;
            var wasIdle = frameKind === "idle";
            frame = null; frameKind = null;
            schedulerCounts.callbacks += 1;
            if (wasIdle) schedulerCounts.idleChecks += 1;
            updatePositions();
        });
    }

    function ensurePanel(key, hostReady) {
        if (!hostReady && !ensureContainer()) return null;
        var previous = panels[key];
        if (validPanel(previous) && previous.__healthHost === container) return previous;
        if (validPanel(previous)) previous.DeleteAsync(0.0);
        var bar = $.CreatePanel("Panel", container, "SurvivalHeroWorldHealth_" + key);
        bar.style.visibility = "collapse";
        // This module exclusively owns the bar's inline visibility. Keep the
        // exact assigned state, as with __position, instead of a native getter
        // on every frame. Ancestor/CSS hiding remains independent of this state.
        bar.__visibility = "collapse";
        bar.AddClass("SurvivalHeroWorldHealthBar");
        bar.hittest = false;
        var fill = $.CreatePanel("Panel", bar, "");
        fill.AddClass("SurvivalHeroWorldHealthFill");
        fill.hittest = false;
        bar.__fill = fill;
        bar.__healthHost = container;
        panels[key] = bar;
        return bar;
    }

    function hide(key, metrics) {
        var bar = panels[key];
        if (validPanel(bar) && bar.__visibility !== "collapse") {
            bar.style.visibility = "collapse";
            bar.__visibility = "collapse";
            if (metrics) metrics.visibilityWrites += 1;
        }
    }

    function removePanel(key) {
        var bar = panels[key];
        if (validPanel(bar)) bar.DeleteAsync(0.0);
        delete panels[key];
    }

    function stop() {
        if (stopped) return;
        stopped = true;
        cancelFrame();
        if (listener !== null) CustomNetTables.UnsubscribeNetTableListener(listener);
        listener = null;
        Object.keys(panels).forEach(removePanel);
        states = {};
        seenEntities = {};
        aliveSnapshotCount = 0;
    }

    function predictedLoss(forecasts, now) {
        var loss = 0;
        for (var i = 0; i < forecasts.length; i++) {
            var f = forecasts[i];
            loss += f.fraction * Math.max(0, Math.min(1, (now - f.start) / (f.due - f.start)));
        }
        return loss;
    }

    function setForecast(bar, value, health, maximum) {
        bar.__healthFraction = Math.min(1, health / maximum);
        bar.__forecasts = [];
        var input = value.laser_forecast || {};
        Object.keys(input).forEach(function (key) {
            var f = input[key] || {};
            var start = Number(f.start), due = Number(f.due), fraction = Number(f.fraction);
            if (isFinite(start) && isFinite(due) && due > start && isFinite(fraction) && fraction > 0) {
                bar.__forecasts.push({start:start, due:due, fraction:fraction});
            }
        });
        bar.__forecasts.sort(function (a,b) { return a.due - b.due; });
        // Cap the last predicted hit across its full remaining interval, so an
        // overkill hit empties the bar at settlement, never partway through it.
        var cumulative = 0;
        bar.__forecastScale = 1;
        for (var i = 0; i < bar.__forecasts.length; i++) {
            cumulative += bar.__forecasts[i].fraction;
            if (cumulative >= bar.__healthFraction) {
                bar.__forecastScale = bar.__healthFraction /
                    Math.max(0.000001, predictedLoss(bar.__forecasts, bar.__forecasts[i].due));
                break;
            }
        }
    }

    function renderHealth(bar, value, metrics) {
        var fraction = bar.__healthFraction;
        var forecasts = bar.__forecasts || [];
        var now = Game.GetGameTime ? Number(Game.GetGameTime()) : NaN;
        if (forecasts.length && isFinite(now)) {
            // Game time freezes during pause. Never extrapolate a missed tick
            // indefinitely; server corrections/stop notices reset the baseline.
            if (now <= forecasts[0].due + 0.15) {
                fraction -= predictedLoss(forecasts, now) * bar.__forecastScale;
            }
        }
        if (Number(value.alive) !== 1) fraction = 0;
        var width = (Math.max(0, Math.min(1, fraction)) * 100).toFixed(3) + "%";
        if (width !== bar.__width) {
            bar.__fill.style.width = width;
            bar.__width = width;
            if (metrics) metrics.healthWidthWrites += 1;
        }
    }

    function applyState(key, value) {
        var previousAlive = states[key] && Number(states[key].alive) === 1 ? 1 : 0;
        if (!value || Number(value.removed) === 1) {
            aliveSnapshotCount -= previousAlive;
            delete states[key];
            delete seenEntities[key];
            removePanel(key);
            return;
        }
        aliveSnapshotCount += (Number(value.alive) === 1 ? 1 : 0) - previousAlive;
        states[key] = value;
        var bar = ensurePanel(key);
        if (!bar) return;
        bar.style.width = barWidth(value) + "px";
        var health = Math.max(0, Number(value.health) || 0);
        var maximum = Math.max(1, Number(value.max_health) || 1);
        var unitTeam = Number(value.team);
        var playerTeam = localTeam();
        bar.SetHasClass(
            "SurvivalEnemyHealthBar",
            unitTeam >= 0 && playerTeam >= 0 && unitTeam !== playerTeam
        );
        // Forecast only the upcoming server hit, using the existing frame loop.
        // A trailing CSS tween would again leave visible health at lethal time.
        bar.__fill.style.transitionDuration = "0s";
        setForecast(bar, value, health, maximum);
        renderHealth(bar, value);
        if (Number(value.alive) !== 1 || health <= 0) hide(key);
    }

    function onTableChanged(tableName, key, value) {
        if (!stopped && tableName === TABLE && key.indexOf(PREFIX) === 0) {
            if (!current()) return;
            applyState(key, value);
            schedulerCounts.eventWakes += 1;
            schedule(hasAliveSnapshot() ? "frame" : "idle");
        }
    }

    function updatePositions() {
        if (!current()) return;
        // Removed/dead rows have no changing screen position or laser forecast.
        // Keep only one bounded recovery check for a late XML host, first-spawn
        // replication or context replacement; real alive packets wake next frame.
        if (!hasAliveSnapshot()) { schedule("idle"); return; }
        schedulerCounts.activeAttempts += 1;
        // Schedule before touching entities: a unit can disappear between an
        // IsValidEntity check and a native API call during hero replacement.
        // Such an exception must never freeze every overhead bar on screen.
        schedule("frame");
        var metrics = captureMetrics();
        if (metrics) { metrics.observed = true; metrics.frames += 1; }
        if (!ensureContainer()) {
            if (metrics) metrics.missingContainerFrames += 1;
            schedule("idle");
            return;
        }
        var visibility=config.SurvivalWorldOverlayVisibility;
        var occlusion=visibility?visibility.Capture():null;
        if (occlusion && occlusion.blocked) {
            // Skip invisible native projections while a full-screen window is open.
            if (metrics) metrics.modalBlockedFrames += 1;
            Object.keys(panels).forEach(function (key) { hide(key, metrics); });
            return;
        }
        var helper = config.SurvivalWorldHealthBarAnchor;
        var geometry = helper && helper.Capture ? helper.Capture(container) : null;
        var stateKeys = Object.keys(states), hasAliveEntity = false;
        if (metrics) {
            metrics.statesVisited += stateKeys.length;
            metrics.peakStates = Math.max(metrics.peakStates, stateKeys.length);
        }
        stateKeys.forEach(function (key) {
            try {
            var state = states[key];
            // Dead snapshots can outlive their corpse. They need no native
            // origin/projection calls until a fresh alive packet arrives.
            if (Number(state.alive) !== 1) {
                if (metrics) metrics.deadSnapshots += 1;
                hide(key, metrics); return;
            }
            if (metrics) metrics.activeSnapshots += 1;
            var entindex = Number(state.entindex);
            if (!isFinite(entindex) || entindex < 0 || !Entities.IsValidEntity(entindex)) {
                if (metrics) metrics.invalidEntities += 1;
                // Net tables can arrive before the client's spawn replication.
                // Prune only handles that were actually seen and disappeared;
                // pending first spawns must retain their stable full-HP packet.
                if (seenEntities[key] !== undefined || !isFinite(entindex) || entindex < 0) {
                    aliveSnapshotCount -= 1;
                    delete states[key];
                    delete seenEntities[key];
                }
                removePanel(key);
                return;
            }
            seenEntities[key] = entindex;
            var bar = ensurePanel(key, true);
            // A net-table update may arrive before XML creates the container.
            // Restore the saved health when the first drawable panel is made.
            if (bar && bar.__healthFraction === undefined) applyState(key, state);
            var nativeAlive = !Entities.IsAlive || Entities.IsAlive(entindex);
            // Dormant/offscreen units still need frame-rate camera/fog recovery.
            // A native-dead or not-yet-replicated unit can recover on the bounded
            // watchdog without repeatedly traversing layout while no bar can draw.
            if (bar && Number(state.alive) === 1 && nativeAlive) hasAliveEntity = true;
            if (!bar || Number(state.alive) !== 1
                || !nativeAlive
                || (Entities.IsDormant && Entities.IsDormant(entindex))
                || (state.unit_name && Entities.GetUnitName
                    && Entities.GetUnitName(entindex) !== state.unit_name)) {
                if (metrics) metrics.unrenderableEntities += 1;
                hide(key, metrics);
                return;
            }
            if (metrics) metrics.activeEntities += 1;
            var origin = Entities.GetAbsOrigin(entindex);
            if (!origin || origin.length < 3 || Number(origin[2]) < -5000) {
                if (metrics) metrics.invalidOrigins += 1;
                hide(key, metrics);
                return;
            }
            if (metrics) metrics.projected += 1;
            var anchor = helper && helper.Project(entindex, origin, container, geometry);
            if (!anchor) {
                if (metrics) metrics.offScreen += 1;
                hide(key, metrics);
                return;
            }
            var width = barWidth(state);
            var extraHalf = (width - anchor.width) / 2;
            anchor.left -= extraHalf;
            anchor.screen_left -= extraHalf * anchor.scale_x;
            anchor.width = width;
            var localX = anchor.left, localY = anchor.top;
            if (!isFinite(localX) || !isFinite(localY)) {
                if (metrics) metrics.invalidAnchors += 1;
                hide(key, metrics);
                return;
            }
            if(visibility&&visibility.Overlaps(occlusion,anchor.screen_left,anchor.screen_top,
                anchor.width*anchor.scale_x,anchor.height*anchor.scale_y)){
                if (metrics) metrics.occluded += 1;
                hide(key, metrics);return;
            }
            if (metrics) metrics.displayed += 1;
            if (bar.__forecasts && bar.__forecasts.length) renderHealth(bar, state, metrics);
            bar.__healthAnchor = anchor;
            var position = localX.toFixed(2) + "px "
                + localY.toFixed(2) + "px 0px";
            // These panels are owned by this module. Panorama normalizes an
            // assigned 836.60px to 836.599976px, so reading it back as text
            // dirties every stationary bar on every frame. Cache the exact
            // projected value, as renderHealth already does for fill width.
            if (bar.__position !== position) {
                if (metrics) {
                    var actualPosition = bar.style.position;
                    metrics.positionReads += 1;
                    metrics.positionWrites += 1;
                    samplePosition(metrics, position, actualPosition);
                }
                bar.style.position = position;
                bar.__position = position;
            } else if (metrics) metrics.positionUnchanged += 1;
            if (bar.__visibility !== "visible") {
                bar.style.visibility = "visible";
                bar.__visibility = "visible";
                if (metrics) metrics.visibilityWrites += 1;
            }
            } catch (error) {
                if (metrics) metrics.errors += 1;
                hide(key, metrics);
            }
        });
        if (!hasAliveEntity) schedule("idle");
        // Run once per Panorama frame while an alive entity can render. The previous fixed 30 Hz layout update
        // visibly lagged behind the engine's native overhead bars while units
        // or the camera were moving.
    }

    function registerToolsProbe() {
        if (stopped || !validPanel(context) || !Game.IsInToolsMode || !Game.IsInToolsMode()) return false;
        var probe=config.SurvivalClientCallbackProbe;
        if (!probe || !probe.RegisterModule) return false;
        return probe.RegisterModule("worldBars",[
            {name:"applyState",get:function(){return applyState;},set:function(fn){applyState=fn;}},
            {name:"ensurePanel",get:function(){return ensurePanel;},set:function(fn){ensurePanel=fn;}},
            {name:"setForecast",get:function(){return setForecast;},set:function(fn){setForecast=fn;}}
        ]);
    }
    controller = {Stop:stop, RegisterToolsProbe:registerToolsProbe, Refresh:function () {
        if (!current()) return;
        cancelFrame();
        updatePositions();
    }, SchedulerInspect:function () {
        return {stopped:stopped, mode:frameKind, pending:frame !== null,
            aliveSnapshots:aliveSnapshotCount, hostReady:!!validPanel(container),
            recoverySeconds:IDLE_RECOVERY_SECONDS, callbacks:schedulerCounts.callbacks,
            activeAttempts:schedulerCounts.activeAttempts, idleChecks:schedulerCounts.idleChecks,
            eventWakes:schedulerCounts.eventWakes};
    }, ProbeInspect:function () {
        captureMetrics();
        return probeStats || {observed:false, frames:0};
    }, DebugSnapshot:function () {
        return {stopped:stopped, units:Object.keys(panels).map(function (key) {
            var panel = panels[key];
            return {key:key, entindex:states[key] && states[key].entindex,
                visibility:String(panel.style.visibility), position:String(panel.style.position),
                anchor:panel.__healthAnchor};
        })};
    }};
    config.SurvivalWorldHealthBars = controller;
    registerToolsProbe();

    var initialValues = CustomNetTables.GetAllTableValues(TABLE) || {};
    Object.keys(initialValues).forEach(function (indexOrKey) {
        var entry = initialValues[indexOrKey];
        // Panorama versions have returned either an object map or an array of
        // { key, value } records. Support both shapes when restoring units.
        if (entry && entry.key !== undefined && entry.value !== undefined) {
            if (String(entry.key).indexOf(PREFIX) === 0) {
                applyState(String(entry.key), entry.value);
            }
            return;
        }
        if (String(indexOrKey).indexOf(PREFIX) === 0) {
            applyState(String(indexOrKey), entry);
        }
    });
    listener = CustomNetTables.SubscribeNetTableListener(TABLE, onTableChanged);
    updatePositions();
})();
