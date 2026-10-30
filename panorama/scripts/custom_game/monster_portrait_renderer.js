// Complete world appearances rendered with native background maps/cameras.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    if (cfg.SurvivalMonsterPortraitRenderer) cfg.SurvivalMonsterPortraitRenderer.Shutdown();
    function create() {
        var entries = [], current = null, failed = {}, serial = 0, stopped = false;
        var stage = null, warming = null, queued = [], timer = false, created = 0;
        function valid(p) {
            try { return !!p && (!p.IsValid || p.IsValid()); }
            catch (_) { return false; }
        }
        function specification(asset) {
            var specs = cfg.SurvivalMonsterPortraitScenes || {};
            if (!Object.prototype.hasOwnProperty.call(specs, asset)) return null;
            var s = specs[asset];
            return s && /^portraits\/monster_[0-9a-f]{20}_v1$/.test(s.map)
                && s.camera === "monster_portrait_camera" && s.light === "monster_portrait_light"
                && /^s2r:\/\/panorama\/images\/custom_game\/monster_portrait_backgrounds\/[a-z0-9_]+\.vtex$/.test(s.background) ? s : null;
        }
        function keyFor(s) { return s.map + ":" + s.background + ":" + JSON.stringify(s.colors); }
        function remove(entry) {
            if (entry && valid(entry.host)) entry.host.DeleteAsync(0);
            entries = entries.filter(function (e) { return e !== entry; });
            if (current === entry) current = null;
            if (warming === entry) warming = null;
        }
        function hide(except) {
            entries.forEach(function (e) {
                if (valid(e.host)) e.host.style.visibility = e.scene === except || (e === warming && !e.ready) ? "visible" : "collapse";
            });
            if (!except) current = null;
        }
        function check(entry) {
            if (!valid(entry.host) || !valid(entry.scene)) { remove(entry); return false; }
            if (!entry.ready && entry.imageReady && entry.scene.BHasClass("SceneLoaded")) {
                entry.ready = true;
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
            var key = keyFor(spec);
            if (failed[key]) return null;
            var entry = entries.filter(function (e) { return e.key === key && valid(e.host); })[0];
            if (entry) return check(entry) ? entry : null;
            // The catalog bounds this cache. Selection must not evict warmed maps.
            if (entries.length >= 256) return null;
            var host = $.CreatePanel("Panel", parent, "SurvivalMonsterPortrait" + (++serial));
            host.style.width = "100%"; host.style.height = "100%";
            host.style.position = "0px 0px 0px"; host.style.overflow = "clip";
            host.style.backgroundColor = "#071321"; host.hittest = false; host.hittestchildren = false;
            entry = {key:key, asset:asset, host:host, spec:spec, started:Date.now(), imageReady:false, ready:false};
            entries.push(entry); created++;
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
            return entry;
        }
        function tickWarm() {
            timer = false;
            if (stopped || !valid(stage)) return;
            if (warming && (!check(warming) || warming.ready)) {
                if (warming && warming !== current) warming.host.style.visibility = "collapse";
                warming = null;
            }
            while (!warming && queued.length) {
                var entry = ensure(stage, queued.shift());
                if (entry && !entry.ready) {
                    warming = entry;
                    entry.started = Date.now();
                    if (entry !== current) entry.host.SetParent(stage);
                    entry.host.style.visibility = "visible";
                }
            }
            if (warming || queued.length) { timer = true; $.Schedule(0.05, tickWarm); }
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
                queued = Object.keys(cfg.SurvivalMonsterPortraitScenes || {}).filter(function (a) { return !!specification(a); })
                    .sort(function (a,b) { return specification(a).priority - specification(b).priority || (a < b ? -1 : 1); });
            } else if (stage.GetParent() !== parent) stage.SetParent(parent);
            if (specification(priorityAsset) && !entries.some(function(e){return e.key === keyFor(specification(priorityAsset)) && e.ready;})) {
                queued = queued.filter(function (a) { return a !== priorityAsset; });
                queued.unshift(priorityAsset);
            }
            if (!timer && (warming || queued.length)) { timer = true; $.Schedule(0.05, tickWarm); }
        }
        function prepare(parent, asset) {
            asset = String(asset || "");
            var entry = ensure(valid(stage) ? stage : parent, asset);
            if (!entry || !valid(parent)) { hide(); return null; }
            if (!entry.ready && valid(stage) && warming !== entry) {
                // The selected outfit must render now, rather than waiting in
                // the background queue while Hide collapses its loading host.
                if (warming && valid(warming.host)) {
                    if (warming !== current) warming.host.style.visibility = "collapse";
                    queued.unshift(warming.asset);
                }
                warming = entry; entry.started = Date.now();
                queued = queued.filter(function (a) { return keyFor(specification(a)) !== entry.key; });
                if (entry.host.GetParent() !== stage) entry.host.SetParent(stage);
                entry.host.style.visibility = "visible";
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
            ResolveAsset:function(asset, model) {
                if (specification(String(asset || ""))) return String(asset);
                var specs=cfg.SurvivalMonsterPortraitScenes || {}, matches=Object.keys(specs).filter(function(a){
                    return specification(a) && specs[a].modelFallback && specs[a].model === model;
                });
                return matches.length === 1 ? matches[0] : "";
            }, Prepare:prepare, Hide:hide, Prewarm:prewarm,
            Shutdown:function () { stopped = true; entries.slice().forEach(remove); if (valid(stage)) stage.DeleteAsync(0); },
            Inspect:function () { return {cached:entries.length, loaded:entries.filter(function(e){return e.ready;}).length,
                created:created, queued:queued.length, warming:warming && warming.asset || "", ready:!!(current && current.ready), map:current && current.spec.map || ""}; }};
    }
    var renderer = create(); renderer.Create = create;
    cfg.SurvivalMonsterPortraitRenderer = renderer;
})();
