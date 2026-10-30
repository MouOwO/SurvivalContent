// Native background worlds reproduce the monster's actual body and components.
// Keep visible while loading: collapsed ScenePanels never finish SceneLoaded.
(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig();
    if (cfg.SurvivalMonsterPortraitRenderer) cfg.SurvivalMonsterPortraitRenderer.Shutdown();
    function create() {
        var entries = [], current = null, failed = {}, serial = 0, stopped = false;
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
        function remove(entry) {
            if (entry && valid(entry.host)) entry.host.DeleteAsync(0);
            entries = entries.filter(function (e) { return e !== entry; });
            if (current === entry) current = null;
        }
        function hide(except) {
            entries.forEach(function (e) { if (e.scene !== except && valid(e.host)) e.host.style.visibility = "collapse"; });
        }
        function prepare(parent, asset) {
            var spec = specification(String(asset || ""));
            if (stopped || !valid(parent) || !spec) { hide(); return null; }
            var key = spec.map + ":" + spec.background + ":" + JSON.stringify(spec.colors);
            if (failed[key]) { hide(); return null; }
            var entry = entries.filter(function (e) { return e.parent === parent && e.key === key && valid(e.host); })[0];
            if (!entry) {
                var host = $.CreatePanel("Panel", parent, "SurvivalMonsterPortrait" + (++serial));
                host.style.width = "100%"; host.style.height = "100%";
                host.style.position = "0px 0px 0px"; host.style.overflow = "clip";
                host.style.backgroundColor = "#071321"; host.hittest = false; host.hittestchildren = false;
                entry = {key:key, parent:parent, host:host, spec:spec, used:Date.now(), started:Date.now(), imageReady:false, ready:false};
                entries.push(entry);
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
            }
            current = entry; entry.used = Date.now();
            entries.forEach(function (e) { if (valid(e.host)) e.host.style.visibility = e === entry ? "visible" : "collapse"; });
            while (entries.length > 3) {
                var oldest = entries.filter(function (e) { return e !== entry; }).sort(function (a,b) { return a.used - b.used; })[0];
                remove(oldest);
            }
            if (!entry.ready && entry.imageReady && entry.scene.BHasClass("SceneLoaded")) {
                entry.ready = true;
                $.Msg("[SURVIVAL_MONSTER_PORTRAIT] READY asset=", asset, " map=", spec.map,
                    " sequence=", spec.sequence, " components=", spec.components);
            }
            if (!entry.ready && Date.now() - entry.started > 10000) {
                failed[key] = true;
                $.Warning("[SURVIVAL_MONSTER_PORTRAIT] LOAD_FAILED asset=" + asset + " map=" + spec.map);
                remove(entry); hide(); return null;
            }
            return {scene:entry.scene, ready:entry.ready, key:key};
        }
        return {HasAsset:function (asset) { return !!specification(String(asset || "")); }, Prepare:prepare, Hide:hide,
            Shutdown:function () { stopped = true; entries.slice().forEach(remove); },
            Inspect:function () { return {cached:entries.length, ready:!!(current && current.ready), map:current && current.spec.map || ""}; }};
    }
    var renderer = create(); renderer.Create = create;
    cfg.SurvivalMonsterPortraitRenderer = renderer;
})();
