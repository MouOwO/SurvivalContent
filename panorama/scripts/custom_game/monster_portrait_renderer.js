// Complete world appearances rendered with native background maps/cameras.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    if (cfg.SurvivalMonsterPortraitRenderer) cfg.SurvivalMonsterPortraitRenderer.Shutdown();
    function create() {
        var entries = [], current = null, failed = {}, serial = 0, stopped = false;
        var stage = null, warming = null, timer = false, created = 0, loaded = 0;
        var visibleEntries = [];
        var entriesByKey = Object.create(null), specsByAsset = Object.create(null), keysByAsset = Object.create(null);
        var models = Object.create(null), aliases = Object.create(null), unitNames = Object.create(null), owner = {};
        var queueHead = null, queueTail = null, queued = 0, queuedByKey = Object.create(null);
        var backgroundNotBefore = 0, motion = null, movementPauses = 0, cooldownPauses = 0;
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
        function unqueue(node) {
            if (!node) return;
            if (node.previous) node.previous.next = node.next; else queueHead = node.next;
            if (node.next) node.next.previous = node.previous; else queueTail = node.previous;
            delete queuedByKey[node.key]; queued--;
        }
        function enqueue(asset, first, priority) {
            var key = keysByAsset[asset];
            if (!key) return;
            var node = queuedByKey[key];
            if (node) unqueue(node); else node = {key:key};
            node.asset = asset; node.priority = !!priority; node.previous = null; node.next = null;
            if (first) {
                node.next = queueHead;
                if (queueHead) queueHead.previous = node; else queueTail = node;
                queueHead = node;
            } else {
                node.previous = queueTail;
                if (queueTail) queueTail.next = node; else queueHead = node;
                queueTail = node;
            }
            queuedByKey[key] = node; queued++;
        }
        function idleForBackground() {
            var now = Date.now(), resolver = cfg.SurvivalSelectionResolver;
            try {
                var unit = resolver && resolver.Resolve ? Number(resolver.Resolve()) : -1;
                if (unit >= 0 && typeof Entities !== "undefined" && Entities.GetAbsOrigin) {
                    var p = Entities.GetAbsOrigin(unit);
                    if (p && p.length >= 3 && isFinite(Number(p[0])) && isFinite(Number(p[1]))) {
                        if (!motion || motion.unit !== unit || Math.abs(p[0]-motion.x) + Math.abs(p[1]-motion.y) > 0.01)
                            motion = {unit:unit, x:Number(p[0]), y:Number(p[1]), since:now};
                        if (now-motion.since < 250) { movementPauses++; return false; }
                    }
                }
            } catch (_) { motion = null; }
            if (now < backgroundNotBefore) { cooldownPauses++; return false; }
            return true;
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
                $.Msg("[SURVIVAL_MONSTER_PORTRAIT] READY asset=", entry.asset, " map=", entry.spec.map,
                    " ms=", Date.now() - entry.started, " components=", entry.spec.components);
            }
            if (!entry.ready && (entry === warming || entry === current || !valid(stage))
                && Date.now() - entry.started > 10000) {
                failed[entry.key] = true;
                $.Warning("[SURVIVAL_MONSTER_PORTRAIT] LOAD_FAILED asset=" + entry.asset);
                remove(entry); return false;
            }
            return true;
        }
        function ensure(parent, asset) {
            var spec = specification(asset);
            if (stopped || !valid(parent) || !spec) return null;
            var key = keysByAsset[asset];
            if (failed[key]) return null;
            var entry = entriesByKey[key];
            if (entry) return check(entry) ? entry : null;
            // The catalog bounds this cache. Selection must not evict warmed maps.
            if (entries.length >= 256) return null;
            var host = $.CreatePanel("Panel", parent, "SurvivalMonsterPortrait" + (++serial));
            host.style.width = "100%"; host.style.height = "100%";
            host.style.position = "0px 0px 0px"; host.style.overflow = "clip";
            host.style.backgroundColor = "#071321"; host.hittest = false; host.hittestchildren = false;
            entry = {key:key, asset:asset, host:host, spec:spec, started:Date.now(), imageReady:false, ready:false, index:entries.length, owner:owner};
            entriesByKey[key] = entry;
            entries.push(entry); created++;
            show(entry, true);
            var background = $.CreatePanel("Image", host, "Background");
            background.style.width = "100%"; background.style.height = "100%";
            background.style.position = "0px 0px 0px"; background.style.washColor = "#ffffff";
            background.hittest = false;
            $.RegisterEventHandler("ImageLoaded", background, function () { entry.imageReady = true; });
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
        function tickWarm() {
            timer = false;
            if (stopped || !valid(stage)) return;
            if (warming && (!check(warming) || warming.ready)) {
                if (warming && warming !== current) show(warming, false);
                warming = null;
                backgroundNotBefore = Date.now() + 500;
            }
            while (!warming && queueHead) {
                var queuedEntry = entriesByKey[queueHead.key];
                if ((!queuedEntry || !queuedEntry.ready) && !queueHead.priority && !idleForBackground()) break;
                var node = queueHead; unqueue(node);
                var entry = ensure(stage, node.asset);
                if (entry && !entry.ready) {
                    warming = entry;
                    entry.started = Date.now();
                    if (entry !== current) entry.host.SetParent(stage);
                    show(entry, true);
                }
            }
            if (warming || queued) { timer = true; $.Schedule(0.05, tickWarm); }
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
                Object.keys(specsByAsset).sort(function (a,b) {
                    return specification(a).priority - specification(b).priority || (a < b ? -1 : 1);
                }).forEach(function (asset) { enqueue(asset, false, false); });
            } else if (stage.GetParent() !== parent) stage.SetParent(parent);
            var key = keysByAsset[priorityAsset], priorityEntry = key && entriesByKey[key];
            if (key && (!priorityEntry || !priorityEntry.ready) && (!warming || warming.key !== key)) {
                enqueue(priorityAsset, true, true);
            }
            if (!timer && (warming || queued)) { timer = true; $.Schedule(0.05, tickWarm); }
        }
        function prepare(parent, asset) {
            asset = String(asset || "");
            var entry = ensure(valid(stage) ? stage : parent, asset);
            if (!entry || !valid(parent)) { hide(); return null; }
            if (!entry.ready && valid(stage) && warming !== entry) {
                // The selected outfit must render now, rather than waiting in
                // the background queue while Hide collapses its loading host.
                if (warming && valid(warming.host)) {
                    if (warming !== current) show(warming, false);
                    enqueue(warming.asset, true, false);
                }
                warming = entry; entry.started = Date.now();
                unqueue(queuedByKey[entry.key]);
                if (entry.host.GetParent() !== stage) entry.host.SetParent(stage);
                show(entry, true);
                if (!timer) { timer = true; $.Schedule(0.05, tickWarm); }
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
            // Disposal is the sole full cache walk after initialization.
            Shutdown:function () {
                stopped = true; entries.slice().forEach(remove);
                queueHead = null; queueTail = null; queuedByKey = Object.create(null); queued = 0; motion = null;
                if (valid(stage)) stage.DeleteAsync(0);
                stage = null;
            },
            Inspect:function () { return {cached:entries.length, loaded:loaded,
                created:created, queued:queued, warming:warming && warming.asset || "", ready:!!(current && current.ready), map:current && current.spec.map || "",
                visible:visibleEntries.length, movementPauses:movementPauses, cooldownPauses:cooldownPauses}; }};
    }
    var renderer = create(); renderer.Create = create;
    cfg.SurvivalMonsterPortraitRenderer = renderer;
})();
