(function () {
    "use strict";
    var cfg = GameUI.CustomUIConfig(), ui = cfg.SurvivalUI || (cfg.SurvivalUI = {});
    if (ui.RewardFX && ui.RewardFX.version === "1.2.2") return;
    var layout = "file://{resources}/layout/custom_game/common/reward_feedback.xml";
    var duration = 1.6, historyLimit = 64, nextId = 0;

    function valid(panel) { return !!panel && (!panel.IsValid || panel.IsValid()); }
    function number(value, fallback) { value = Number(value); return isFinite(value) && value > 0 ? value : fallback; }
    // GetPositionWithinWindow includes Fit's transform, but native layout sizes
    // only include UI scale. Account for the scale3d used by our modal shells.
    function fitScale(panel, axis) {
        var scale = 1, count = 0;
        while (valid(panel) && count++ < 32) {
            var transform = panel.style ? String(panel.style.transform || "") : "";
            var match = /scale3d\(\s*([\d.eE+-]+)\s*,\s*([\d.eE+-]+)/.exec(transform);
            if (match) scale *= number(match[axis === "x" ? 1 : 2], 1);
            panel = panel.GetParent ? panel.GetParent() : null;
        }
        return scale;
    }
    function place(host, root, anchor, options) {
        var width = number(root.actuallayoutwidth, 1672) / number(root.actualuiscale_x, 1);
        var height = number(root.actuallayoutheight, 941) / number(root.actualuiscale_y, 1);
        var x = width / 2, y = height / 2, w = Math.min(220, width), h = Math.min(152, height);
        if (valid(anchor) && anchor.GetPositionWithinWindow && root.GetPositionWithinWindow
                && anchor.actuallayoutwidth > 0 && anchor.actuallayoutheight > 0) {
            var origin = root.GetPositionWithinWindow(), at = anchor.GetPositionWithinWindow();
            // An explicit modal Fit scale excludes native UI scale and replaces
            // ancestor inspection; never multiply the same Fit transform twice.
            var explicit = options.getScale ? number(options.getScale(), 0) : 0;
            var sx = number(root.actualuiscale_x, 1) * (explicit || fitScale(root, "x"));
            var sy = number(root.actualuiscale_y, 1) * (explicit || fitScale(root, "y"));
            x = (at.x - origin.x + anchor.actuallayoutwidth * (explicit || fitScale(anchor, "x")) / 2) / sx;
            y = (at.y - origin.y + anchor.actuallayoutheight * (explicit || fitScale(anchor, "y")) / 2) / sy;
        }
        x = Math.max(0, Math.min(width - w, x - w / 2));
        y = Math.max(0, Math.min(height - h, y - h / 2));
        host.style.position = Math.round(x) + "px " + Math.round(y) + "px 0px";
        host.style.width = w + "px";
        host.style.height = h + "px";
    }
    function createGlass(root, options) {
        var host = null, sweep = null, anchor = null, surface = null, job = null, serial = 0, dead = false, alternate = false;
        var seen = Object.create(null), order = [], id = ++nextId;
        function clear() {
            serial++;
            if (job !== null && $.CancelScheduled) $.CancelScheduled(job);
            job = null;
            if (valid(anchor)) anchor.RemoveClass("RewardGlassActive");
            if (valid(host)) { host.visible = false; host.DeleteAsync(0); }
            host = sweep = anchor = surface = null;
        }
        return {
            Play: function (event) {
                if (dead || !valid(root)) { clear(); return false; }
                event = event || {};
                var key = event.key === undefined || event.key === null ? "" : String(event.key);
                var target = event.surface === undefined ? event.anchor : event.surface;
                if (!key || key.length > 256 || seen[key] || !valid(event.anchor) || !valid(target)) return false;
                serial++;
                if (job !== null && $.CancelScheduled) $.CancelScheduled(job);
                job = null;
                try {
                    if (!valid(host) || !valid(sweep) || anchor !== event.anchor || surface !== target) {
                        clear();
                        anchor = event.anchor;
                        surface = target;
                        // Daily render replaces the just-claimed card before
                        // its first layout. Attach the glass to the reward's
                        // icon surface, while keeping claim state on its card.
                        // Percentage sizing follows the icon's native bounds,
                        // layout, Fit, scrolling and UI scale natively.
                        host = $.CreatePanel("Panel", surface, "SurvivalRewardGlass" + id);
                        host.AddClass("RewardGlassSurface");
                        host.style.position = "0px 0px 0px";
                        host.style.width = host.style.height = "100%";
                        host.hittest = host.hittestchildren = false;
                        sweep = $.CreatePanel("Panel", host, "");
                        sweep.AddClass("RewardGlassSweep");
                        sweep.hittest = sweep.hittestchildren = false;
                    }
                    var stamp = serial;
                    alternate = !alternate;
                    host.SetHasClass("RewardGlassPlayA", alternate);
                    host.SetHasClass("RewardGlassPlayB", !alternate);
                    anchor.AddClass("RewardGlassActive");
                    host.visible = true;
                    // One CSS reflection and one cleanup timer. There is no
                    // zero-size layout race or per-frame geometry polling.
                    job = $.Schedule(0.65, function () {
                        if (stamp !== serial) return;
                        job = null;
                        clear();
                    });
                    seen[key] = true; order.push(key);
                    if (order.length > historyLimit) delete seen[order.shift()];
                    return true;
                } catch (error) { clear(); return false; }
            },
            Clear: clear,
            Dispose: function () {
                if (dead) return;
                dead = true; clear(); root = null; seen = Object.create(null); order = [];
            }
        };
    }
    function create(root, options) {
        options = options || {};
        if (options.channel === "daily") return createGlass(root, options);
        var host = null, particle = null, title = null, detail = null;
        var job = null, serial = 0, dead = false, alternate = false, pendingKey = null;
        var seen = Object.create(null), order = [], id = ++nextId;
        var channel = options.channel === "daily" ? "Daily" : options.channel === "lottery" ? "Lottery" : "Collection";
        function stop() {
            if (valid(particle) && particle.StopParticlesImmediately) {
                try { particle.StopParticlesImmediately(true); } catch (ignore) {}
            }
        }
        function cancel() {
            serial++;
            if (job !== null && $.CancelScheduled) $.CancelScheduled(job);
            job = null;
        }
        function clear() {
            cancel();
            stop();
            if (valid(host)) {
                host.visible = false;
                host.DeleteAsync(0);
            }
            host = particle = title = detail = null;
            pendingKey = null;
        }
        function build() {
            host = $.CreatePanel("Panel", root, "SurvivalRewardFX" + channel + id);
            host.hittest = false;
            host.hittestchildren = false;
            if (!host.BLoadLayout(layout, false, false)) throw new Error("Reward feedback layout failed to load");
            particle = host.FindChildTraverse("RewardFXParticle");
            title = host.FindChildTraverse("RewardFXTitle");
            detail = host.FindChildTraverse("RewardFXDetail");
            if (!valid(particle) || !particle.StartParticles || !valid(title) || !valid(detail)) {
                throw new Error("Reward feedback layout is incomplete");
            }
        }
        function remember(key) {
            seen[key] = true;
            order.push(key);
            if (order.length > historyLimit) delete seen[order.shift()];
        }
        return {
            Play: function (event) {
                if (dead || !valid(root)) { clear(); return false; }
                event = event || {};
                var key = event.key === undefined || event.key === null ? "" : String(event.key);
                if (!key || key.length > 256 || seen[key] || pendingKey === key) return false;
                cancel();
                stop();
                try {
                    // A rapid second success reuses the scene; it never adds a
                    // second active particle panel or an animation polling loop.
                    if (!valid(host) || !valid(particle)) { clear(); build(); }
                    host.visible = false;
                    title.text = String(event.title || "领取成功");
                    detail.text = event.text === undefined || event.text === null ? "" : String(event.text);
                    detail.visible = !!detail.text;
                    var stamp = serial;
                    pendingKey = key;
                    // Reward rendering may just have replaced its cards. Wait
                    // one layout turn before reading their native geometry;
                    // keep the effect hidden and inactive until then.
                    job = $.Schedule(0, function () {
                        if (stamp !== serial) return;
                        job = null;
                        if (dead || !valid(root) || !valid(host) || !valid(particle)) { clear(); return; }
                        try {
                            place(host, root, event.anchor, options);
                            host.visible = true;
                            alternate = !alternate;
                            host.SetHasClass("RewardFXPlayA", alternate);
                            host.SetHasClass("RewardFXPlayB", !alternate);
                            particle.StartParticles();
                            job = $.Schedule(duration, function () {
                                if (stamp !== serial) return;
                                job = null;
                                clear();
                            });
                            remember(key);
                            pendingKey = null;
                        } catch (error) { clear(); }
                    });
                    return true;
                } catch (error) {
                    clear();
                    return false;
                }
            },
            Clear: clear,
            Dispose: function () {
                if (dead) return;
                dead = true;
                clear();
                root = null;
                seen = Object.create(null);
                order = [];
            }
        };
    }
    ui.RewardFX = { version: "1.2.2", Create: create };
})();
