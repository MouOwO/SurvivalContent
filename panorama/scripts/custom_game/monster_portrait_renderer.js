// Complete world appearances rendered with native background maps/cameras.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    if (cfg.SurvivalMonsterPortraitRenderer) cfg.SurvivalMonsterPortraitRenderer.Shutdown();
    function create() {
        var entries = [], current = null, failed = Object.create(null), serial = 0, stopped = false;
        var stage = null, warming = null, timer = false, warmTimer = null, created = 0, loaded = 0;
        var visibleEntries = [];
        var entriesByKey = Object.create(null), specsByAsset = Object.create(null), keysByAsset = Object.create(null);
        var models = Object.create(null), aliases = Object.create(null), unitNames = Object.create(null), owner = {};
        var pendingAsset = "";
        // A cold map creates a native render world. Admit only the latest
        // identity after a short quiet window; a warm cache hit never waits.
        // One pending task, O(1) replacement, <=1 native world per admission.
        // This bounds work count, not the engine's synchronous load duration.
        var COLD_SETTLE_MS = 100, admission = null, deferred = 0, superseded = 0;
        // Catalog coverage is independent of native world residency. Cold
        // appearances remain addressable without constructing 188 render worlds.
        var MAX_RESIDENT = 4, lruHead = null, lruTail = null, evictions = 0;
        var selectionEpoch = 0, lastRequestKey = "", manualRequests = Object.create(null);
        var subscriptions = [], retries = 0, failures = 0;
        function valid(p) {
            try { return !!p && (!p.IsValid || p.IsValid()); }
            catch (_) { return false; }
        }
        function accepted(s) {
            return s && /^portraits\/monster_[0-9a-f]{20}_v1$/.test(s.map)
                && s.camera === "monster_portrait_camera" && s.light === "monster_portrait_light"
                && /^s2r:\/\/panorama\/images\/custom_game\/monster_portrait_backgrounds\/[a-z0-9_]+\.vtex$/.test(s.background);
        }
        // One catalog pass per controller. All selection/model lookups below
        // are indexed; no polling callback rescans the complete appearance set.
        Object.keys(cfg.SurvivalMonsterPortraitScenes || {}).forEach(function (asset) {
            var spec = cfg.SurvivalMonsterPortraitScenes[asset];
            if (!accepted(spec)) return;
            specsByAsset[asset] = spec;
            if (spec.unit) unitNames[String(spec.unit)] = true;
            keysByAsset[asset] = spec.map + ":" + spec.background + ":" + JSON.stringify(spec.colors);
            if (spec.modelFallback) models[spec.model] = Object.prototype.hasOwnProperty.call(models, spec.model) ? "" : asset;
        });
        Object.keys(cfg.SurvivalMonsterPortraitUnitAssets || {}).forEach(function (unit) {
            var asset = cfg.SurvivalMonsterPortraitUnitAssets[unit];
            if (specsByAsset[asset]) aliases[unit] = asset;
        });
        function specification(asset) { return specsByAsset[asset] || null; }
        function requestStamp(key) { return selectionEpoch + ":" + (manualRequests[key] || 0); }
        function mayAttempt(key) {
            var failure = failed[key];
            return !failure || (failure.stamp !== requestStamp(key) && Date.now() >= failure.retryAt);
        }
        function selectionChanged(payload) {
            if (stopped) return;
            var id = payload && (payload.PlayerID !== undefined ? payload.PlayerID : payload.player_id);
            if (id !== undefined && typeof Game !== "undefined" && Game.GetLocalPlayerID
                && Number(id) !== Number(Game.GetLocalPlayerID())) return;
            selectionEpoch++; cancelAdmission();
        }
        if (typeof GameEvents !== "undefined" && GameEvents.Subscribe) {
            ["dota_player_update_selected_unit", "dota_player_update_query_unit"].forEach(function (event) {
                subscriptions.push(GameEvents.Subscribe(event, selectionChanged));
            });
        }
        function unlink(entry) {
            if (entry.previous) entry.previous.next = entry.next; else lruHead = entry.next;
            if (entry.next) entry.next.previous = entry.previous; else lruTail = entry.previous;
            entry.previous = null; entry.next = null;
        }
        function touch(entry) {
            if (lruHead === entry) return;
            if (entry.previous || entry.next || lruTail === entry) unlink(entry);
            entry.previous = null; entry.next = lruHead;
            if (lruHead) lruHead.previous = entry; else lruTail = entry;
            lruHead = entry;
        }
        function show(entry, visible) {
            if (!entry || entry.visible === visible) return;
            if (valid(entry.host)) entry.host.style.visibility = visible ? "visible" : "collapse";
            entry.visible = visible;
            var index = visibleEntries.indexOf(entry);
            if (visible && index < 0) visibleEntries.push(entry);
            else if (!visible && index >= 0) visibleEntries.splice(index, 1);
        }
        function remove(entry) {
            if (entry && valid(entry.host)) entry.host.DeleteAsync(0);
            if (entry && entriesByKey[entry.key] === entry) {
                delete entriesByKey[entry.key];
                unlink(entry);
                var last = entries.pop();
                if (last !== entry) { entries[entry.index] = last; last.index = entry.index; }
                if (entry.ready) loaded--;
                entry.owner = null;
            }
            visibleEntries = visibleEntries.filter(function (e) { return e !== entry; });
            if (current === entry) current = null;
            if (warming === entry) warming = null;
        }
        function hide(except) {
            // Only our selected and loading hosts can be visible. In particular,
            // a steady selected unit must not rewrite all 188 cached worlds.
            var selected = except && except.__survivalMonsterPortraitEntry;
            if (!selected || selected.owner !== owner) selected = null;
            if (selected) show(selected, true);
            if (warming && !warming.ready) show(warming, true);
            visibleEntries.slice().forEach(function (e) {
                if (e !== selected && !(e === warming && !e.ready)) show(e, false);
            });
            if (!except) current = null;
        }
        function check(entry) {
            if (!valid(entry.host) || !valid(entry.scene)) { remove(entry); return false; }
            if (!entry.ready && entry.imageReady && entry.scene.BHasClass("SceneLoaded")) {
                entry.ready = true;
                loaded++;
                delete failed[entry.key];
                $.Msg("[SURVIVAL_MONSTER_PORTRAIT] READY asset=", entry.asset, " map=", entry.spec.map,
                    " ms=", Date.now() - entry.started, " components=", entry.spec.components);
            }
            if (!entry.ready && (entry === warming || entry === current || !valid(stage))
                && Date.now() - entry.started > 10000) {
                var previous = failed[entry.key], attempts = Math.min(3, (previous ? previous.attempts : 0) + 1);
                failed[entry.key] = {attempts:attempts, stamp:entry.requestStamp,
                    retryAt:Date.now() + [0, 2000, 10000, 30000][attempts]};
                failures++;
                $.Warning("[SURVIVAL_MONSTER_PORTRAIT] LOAD_FAILED asset=" + entry.asset);
                remove(entry); return false;
            }
            return true;
        }
        function ensure(parent, asset) {
            var spec = specification(asset);
            if (stopped || !valid(parent) || !spec) return null;
            var key = keysByAsset[asset];
            var entry = entriesByKey[key];
            if (entry) return check(entry) ? entry : null;
            var failure = failed[key];
            // A scheduler tick cannot admit a retry. The request must originate
            // from a new local selection epoch or the explicit Retry API, and
            // its bounded cooldown must have elapsed. No permanent blacklist.
            if (!mayAttempt(key)) return null;
            if (entries.length >= MAX_RESIDENT) {
                var victim = lruTail, skipped = 0;
                // At most current and warming are protected: <=2 pointer hops,
                // independent of the 197-identity catalog and cache population.
                while (victim && (victim === current || victim === warming) && skipped < 2) {
                    victim = victim.previous; skipped++;
                }
                if (!victim || victim === current || victim === warming) return null;
                remove(victim); evictions++;
            }
            var host = $.CreatePanel("Panel", parent, "SurvivalMonsterPortrait" + (++serial));
            host.style.width = "100%"; host.style.height = "100%";
            host.style.position = "0px 0px 0px"; host.style.overflow = "clip";
            host.style.backgroundColor = "#071321"; host.hittest = false; host.hittestchildren = false;
            entry = {key:key, asset:asset, host:host, spec:spec, started:Date.now(), imageReady:false, ready:false,
                index:entries.length, owner:owner, requestStamp:requestStamp(key), previous:null, next:null};
            entriesByKey[key] = entry;
            entries.push(entry); created++;
            touch(entry);
            if (failure) retries++;
            show(entry, true);
            var background = $.CreatePanel("Image", host, "Background");
            background.style.width = "100%"; background.style.height = "100%";
            background.style.position = "0px 0px 0px"; background.style.washColor = "#ffffff";
            background.hittest = false;
            $.RegisterEventHandler("ImageLoaded", background, function () {
                if (!stopped && entry.owner === owner) entry.imageReady = true;
            });
            background.SetImage(spec.background);
            var scene = $.CreatePanel("DOTAScenePanel", host, "Scene", {
                map:spec.map, camera:spec.camera, light:spec.light, drawbackground:"true",
                particleonly:"false", antialias:"true", "animate-during-pause":"true"
            });
            scene.style.width = "100%"; scene.style.height = "100%";
            scene.style.position = "0px 0px 0px"; scene.style.overflow = "clip";
            scene.hittest = false; scene.hittestchildren = false;
            entry.scene = scene;
            scene.__survivalMonsterPortraitEntry = entry;
            return entry;
        }
        function cancelAdmission() {
            var old = admission;
            admission = null; pendingAsset = "";
            if (!old) return;
            superseded++;
            if (old.timer !== null && typeof $.CancelScheduled === "function") {
                try { $.CancelScheduled(old.timer); } catch (_) {}
            }
        }
        function armWarm() {
            if (!timer && warming) { timer = true; warmTimer = $.Schedule(0.05, tickWarm); }
        }
        function queueCold(parent, asset, selected) {
            var key = keysByAsset[asset];
            if (stopped || !key || !valid(parent) || !mayAttempt(key)) return false;
            if (admission && admission.key === key) {
                if (selected) admission.parent = parent;
                return true;
            }
            cancelAdmission();
            var ticket = {key:key, asset:asset, parent:parent, timer:null};
            admission = ticket; pendingAsset = asset; deferred++;
            ticket.timer = $.Schedule(COLD_SETTLE_MS / 1000, function () {
                if (stopped || admission !== ticket) return;
                admission = null; pendingAsset = "";
                // Do not transfer a destroyed overlay's request to a later
                // HUD. An explicit fresh Prepare owns the replacement.
                if (!valid(ticket.parent)) return;
                var entry = ensure(valid(stage) ? stage : ticket.parent, ticket.asset);
                if (!entry || entry.ready) return;
                if (warming && warming !== entry && warming !== current) show(warming, false);
                warming = entry;
                show(entry, true);
                armWarm();
            });
            return true;
        }
        function tickWarm() {
            timer = false; warmTimer = null;
            if (stopped) return;
            if (warming && (!check(warming) || warming.ready)) {
                if (warming && warming !== current) show(warming, false);
                warming = null;
            }
            armWarm();
        }
        function prewarm(parent, priorityAsset) {
            if (stopped || !valid(parent)) return;
            // Never reparent a stage beneath one of its own scene children,
            // even if a caller mistakes a warming scene for the native anchor.
            for (var ancestor=parent, depth=0; valid(ancestor)&&depth<32; depth++) {
                if (ancestor === stage) return;
                ancestor=ancestor.GetParent ? ancestor.GetParent() : null;
            }
            if (!valid(stage)) {
                stage = $.CreatePanel("Panel", parent, "SurvivalPortraitPrewarm");
                stage.style.width = "128px"; stage.style.height = "128px";
                stage.style.position = "0px 0px 0px"; stage.style.zIndex = "-100";
                stage.style.overflow = "clip"; stage.hittest = false; stage.hittestchildren = false;
                // Behind the native opaque portrait, but still laid out/rendered.
                // Collapsing or zero opacity stalls SceneLoaded in the engine.
                // A bare Prewarm call only establishes the rendering anchor.
                // It must not turn catalog size into startup native work.
            } else if (stage.GetParent() !== parent) stage.SetParent(parent);
            var key = keysByAsset[priorityAsset], priorityEntry = key && entriesByKey[key];
            if (key && admission && admission.key !== key) cancelAdmission();
            if (key && !priorityEntry) queueCold(stage, priorityAsset);
        }
        function prepare(parent, asset) {
            asset = String(asset || "");
            var key = keysByAsset[asset] || "";
            if (key && key !== lastRequestKey) { lastRequestKey = key; selectionEpoch++; }
            if (admission && admission.key !== key) cancelAdmission();
            if (stopped || !key || !valid(parent)) return null;
            var entry = entriesByKey[key];
            if (!entry) {
                if (!queueCold(parent, asset, true)) return null;
                // Combat's existing !ready branch keeps its transition cover;
                // it must not treat pending as a missing map or use SetUnit.
                return {scene:null, ready:false, key:key, presentable:false, pending:true};
            }
            if (!check(entry)) return null;
            if (!entry || !valid(parent)) { hide(); return null; }
            touch(entry);
            // The explicit prewarm may start before Prepare observes this
            // selection. A later failure belongs to the latest requesting
            // epoch, otherwise that same sentinel could gain a spurious retry.
            if (!entry.ready) entry.requestStamp = requestStamp(key);
            if (!entry.ready && valid(stage) && warming !== entry) {
                // The selected outfit must render now, rather than waiting in
                // the background queue while Hide collapses its loading host.
                if (warming && valid(warming.host)) {
                    if (warming !== current) show(warming, false);
                }
                warming = entry; entry.started = Date.now();
                if (admission && admission.key === entry.key) cancelAdmission();
                if (entry.host.GetParent() !== stage) entry.host.SetParent(stage);
                show(entry, true);
                armWarm();
            }
            if (entry.ready || !valid(stage)) {
                if (current !== entry || entry.host.GetParent() !== parent) entry.mountedAt = Date.now();
                if (entry.host.GetParent() !== parent) entry.host.SetParent(parent);
                current = entry; hide(entry.scene);
            }
            // Resuming/reparenting a cached scene reallocates its render target.
            // SceneLoaded stays set while the first target frames can be white.
            return {scene:entry.scene, ready:entry.ready, key:entry.key,
                presentable:entry.ready && Date.now() - entry.mountedAt >= 100};
        }
        return {HasAsset:function (asset) { return !!specification(String(asset || "")); },
            HasUnitName:function (unit) { return unitNames[String(unit || "")] === true; },
            ResolveAsset:function(asset, model, unitName) {
                if (specification(String(asset || ""))) return String(asset);
                model=String(model || "").replace(/\\/g,"/").replace(/\.vmdl_c$/i,".vmdl");
                if (models[model]) return models[model];
                var alias=aliases[String(unitName || "")], spec=specification(alias);
                return !asset && spec && (!model || spec.model===model) ? alias : "";
            }, Prepare:prepare, Hide:hide, Prewarm:prewarm,
            Retry:function(asset) {
                var key = keysByAsset[String(asset || "")];
                if (stopped || !key || !failed[key]) return false;
                manualRequests[key] = (manualRequests[key] || 0) + 1;
                return true;
            },
            // Disposal walks only the four resident worlds, never the catalog.
            Shutdown:function () {
                stopped = true; cancelAdmission();
                if (warmTimer !== null && typeof $.CancelScheduled === "function") {
                    try { $.CancelScheduled(warmTimer); } catch (_) {}
                }
                timer = false; warmTimer = null; entries.slice().forEach(remove);
                subscriptions.forEach(function(handle) {
                    try { if (typeof GameEvents !== "undefined" && GameEvents.Unsubscribe) GameEvents.Unsubscribe(handle); }
                    catch (_) {}
                });
                subscriptions = []; pendingAsset = ""; lruHead = null; lruTail = null;
                if (valid(stage)) stage.DeleteAsync(0);
                stage = null;
            },
            Inspect:function () { return {cached:entries.length, loaded:loaded,
                created:created, queued:pendingAsset ? 1 : 0, warming:warming && warming.asset || "", ready:!!(current && current.ready), map:current && current.spec.map || "",
                visible:visibleEntries.length, residentLimit:MAX_RESIDENT, evictions:evictions, retries:retries, failures:failures,
                selectionEpoch:selectionEpoch, coldSettleMs:COLD_SETTLE_MS, deferred:deferred, superseded:superseded,
                movementPauses:0, cooldownPauses:0}; }};
    }
    var renderer = create(); renderer.Create = create;
    cfg.SurvivalMonsterPortraitRenderer = renderer;
})();
