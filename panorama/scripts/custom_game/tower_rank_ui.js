(function () {
    "use strict";
    var TABLE = "survival_tower_rank", PREFIX = "unit_";
    var context = $.GetContextPanel(), container = $("#SurvivalTowerRanks");
    var config = GameUI.CustomUIConfig(), states = {}, panels = {};
    var session = "", listener = null, frame = null, stopped = false;
    var debugListener = null, reasons = {};
    var diagnostics = { frames: 0, lastError: "", lastApiWarning: "", lastRejected: null, viewport: null, occlusion: null };
    if (config.SurvivalTowerRanks && config.SurvivalTowerRanks.Stop) {
        config.SurvivalTowerRanks.Stop();
    }
    function valid(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function setRowVisibility(panel, value) {
        if (valid(panel) && panel.__rankVisibility !== value) {
            panel.style.visibility = value;
            panel.__rankVisibility = value;
        }
    }
    function hide(key, reason) {
        reasons[key] = reason || "hidden";
        setRowVisibility(panels[key], "collapse");
    }
    function remove(key) {
        if (valid(panels[key])) {
            setRowVisibility(panels[key], "collapse");
            panels[key].DeleteAsync(0);
        }
        delete panels[key];
    }
    function clear() {
        Object.keys(panels).forEach(remove);
        states = {};
        reasons = {};
    }
    function stop() {
        if (stopped) return;
        stopped = true;
        if (frame !== null) $.CancelScheduled(frame);
        if (listener !== null) CustomNetTables.UnsubscribeNetTableListener(listener);
        if (debugListener !== null && GameEvents.Unsubscribe) GameEvents.Unsubscribe(debugListener);
        clear();
    }
    function apply(key, value) {
        if (key === "_session") {
            var nextSession = String(value && value.id || "");
            if (session !== nextSession) { clear(); session = nextSession; }
            return;
        }
        if (key.indexOf(PREFIX) !== 0) return;
        if (!value || Number(value.removed) === 1 || !session
            || String(value.session) !== session) {
            diagnostics.lastRejected = { key: key, reason: !value ? "missing_value"
                : Number(value.removed) === 1 ? "removed" : !session ? "missing_session" : "session_mismatch" };
            delete states[key]; remove(key); return;
        }
        if (["N", "R", "SR", "SSR", "UR"].indexOf(value.rarity) < 0) {
            diagnostics.lastRejected = { key: key, reason: "invalid_rarity" }; return;
        }
        states[key] = value;
        // Do not instantiate anything until the world position is drawable.
        if (valid(panels[key])) paint(panels[key], value);
    }
    function paint(panel, state) {
        ["N", "R", "SR", "SSR", "UR"].forEach(function (rarity) {
            panel.SetHasClass("Rank" + rarity, state.rarity === rarity);
        });
        // The native label starts collapsed. Set its visibility explicitly on
        // the first valid rank update instead of relying on parent-class restyle.
        panel.__ultimate.style.visibility = state.rarity === "UR" ? "visible" : "collapse";
        var count = Math.max(1, Math.min(5, Number(state.stars) || 1));
        var red = Math.max(0, Math.min(count, Number(state.red_stars) || 0));
        panel.__stars.forEach(function (star, index) {
            star.SetHasClass("ActiveStar", index < count);
            star.SetHasClass("RedStar", index < red);
        });
    }
    function ensure(key, state) {
        if (valid(panels[key])) return panels[key];
        var panel = $.CreatePanel("Panel", container, "TowerRank_" + key);
        setRowVisibility(panel, "collapse");
        panel.AddClass("TowerRank"); panel.hittest = false; panel.hittestchildren = false;
        var letter = $.CreatePanel("Panel", panel, "");
        letter.AddClass("TowerRankLetter"); letter.hittest = false;
        var ultimate = $.CreatePanel("Label", letter, "");
        ultimate.AddClass("TowerRankUltimate"); ultimate.text = "UR"; ultimate.hittest = false;
        panel.__ultimate = ultimate;
        var stars = $.CreatePanel("Panel", panel, "");
        stars.AddClass("TowerRankStars"); stars.hittest = false;
        panel.__stars = [];
        for (var i = 0; i < 5; i++) {
            var star = $.CreatePanel("Panel", stars, "");
            star.AddClass("TowerRankStar"); star.hittest = false;
            panel.__stars.push(star);
        }
        panels[key] = panel; paint(panel, state);
        return panel;
    }
    function restore() {
        apply("_session", CustomNetTables.GetTableValue(TABLE, "_session"));
        var values = CustomNetTables.GetAllTableValues(TABLE) || {};
        Object.keys(values).forEach(function (key) {
            var entry = values[key];
            if (entry && entry.key !== undefined && entry.value !== undefined) {
                if (entry.key !== "_session") apply(String(entry.key), entry.value);
            } else if (key !== "_session") apply(key, entry);
        });
    }
    function positions() {
        if (stopped) return;
        if (!valid(context)) { stop(); return; }
        // XML hot reload can run a script before its child panel is available.
        // Keep the empty layout safe and retry instead of permanently stopping.
        if (!valid(container)) container = $("#SurvivalTowerRanks");
        frame = $.Schedule(0, positions);
        diagnostics.frames++;
        if (!valid(container)) { diagnostics.lastError = "container_missing"; return; }
        var stateKeys = Object.keys(states);
        // Empty sessions have no world labels to project or HUD bounds to read.
        if (!stateKeys.length) { diagnostics.occlusion = null; return; }
        try {
        var visibility = config.SurvivalWorldOverlayVisibility;
        var occlusion = visibility && visibility.Capture ? visibility.Capture() : null;
        diagnostics.occlusion = occlusion ? { blocked: !!occlusion.blocked, rects: occlusion.rects || [] } : null;
        // A full-screen UI covers every row. Hide existing panels before
        // skipping entity calls; closing it resumes the normal next-frame path.
        if (occlusion && occlusion.blocked) {
            stateKeys.forEach(function (key) { hide(key, "hud_occlusion"); });
            return;
        }
        var sx = Number(container.actualuiscale_x) || 1;
        var sy = Number(container.actualuiscale_y) || 1;
        var width = Number(container.actuallayoutwidth) || 0;
        var height = Number(container.actuallayoutheight) || 0;
        var offset = container.GetPositionWithinWindow ? container.GetPositionWithinWindow() : { x: 0, y: 0 };
        diagnostics.viewport = { width: width, height: height, scale_x: sx, scale_y: sy,
            x: Number(offset.x || 0), y: Number(offset.y || 0) };
        stateKeys.forEach(function (key) {
            try {
                var state = states[key], entindex = Number(state.entindex);
                if (!Entities.IsValidEntity(entindex)) { remove(key); reasons[key] = "invalid_entity"; return; }
                if (!Entities.IsAlive(entindex)) { hide(key, "dead"); return; }
                // IsDormant is absent in some Dota Panorama API builds. Calling
                // it unconditionally used to throw and hide every tower.
                if (Entities.IsDormant && Entities.IsDormant(entindex)) { hide(key, "dormant"); return; }
                if (Entities.GetUnitName(entindex) !== state.unit_name) { hide(key, "unit_name_mismatch"); return; }
                var origin = Entities.GetAbsOrigin(entindex);
                if (!origin || origin.length < 3 || Number(origin[2]) < -5000) { hide(key, "invalid_origin"); return; }
                var heightOffset = 180;
                try {
                    if (Entities.GetHealthBarOffset) {
                        var configuredHeight = Number(Entities.GetHealthBarOffset(entindex));
                        if (isFinite(configuredHeight) && configuredHeight > 0) heightOffset = configuredHeight;
                    }
                } catch (offsetError) { diagnostics.lastApiWarning = "health_bar_offset: " + String(offsetError); }
                var x = Number(Game.WorldToScreenX(origin[0], origin[1], Number(origin[2]) + heightOffset));
                var y = Number(Game.WorldToScreenY(origin[0], origin[1], Number(origin[2]) + heightOffset));
                var lx = (x - Number(offset.x || 0)) / sx - 51;
                var ly = (y - Number(offset.y || 0)) / sy - 47;
                if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0) { hide(key, "invalid_projection"); return; }
                if (width <= 0 || height <= 0) { hide(key, "zero_layout_size"); return; }
                if (lx < 0 || ly < 0 || lx + 102 > width / sx || ly + 30 > height / sy) {
                    hide(key, "outside_viewport"); return;
                }
                if (visibility && visibility.Overlaps && visibility.Overlaps(occlusion,
                    x - 51 * sx, y - 47 * sy, 102 * sx, 30 * sy)) {
                    hide(key, "hud_occlusion"); return;
                }
                var panel = ensure(key, state);
                var position = lx.toFixed(2) + "px " + ly.toFixed(2) + "px 0px";
                if (panel.__rankPosition !== position) {
                    panel.style.position = position;
                    panel.__rankPosition = position;
                }
                setRowVisibility(panel, "visible");
                reasons[key] = "visible";
            } catch (error) { diagnostics.lastError = String(error); hide(key, "entity_exception"); }
        });
        } catch (frameError) {
            diagnostics.lastError = "frame: " + String(frameError);
            Object.keys(states).forEach(function (key) { hide(key, "frame_exception"); });
        }
    }
    function debugSnapshot() {
        var counts = {}, rows = [], visible = 0;
        Object.keys(states).forEach(function (key) {
            var reason = reasons[key] || "awaiting_frame";
            counts[reason] = (counts[reason] || 0) + 1;
            if (reason === "visible") visible++;
            if (rows.length >= 64) return;
            rows.push({ key: key, entindex: states[key].entindex,
                rarity: states[key].rarity, stars: states[key].stars, reason: reason,
                panel: valid(panels[key]), position: valid(panels[key]) ? String(panels[key].style.position) : "" });
            if (states[key].rarity === "UR" && valid(panels[key])) {
                var label = panels[key].__ultimate;
                rows[rows.length - 1].ultimate_label = valid(label) ? {
                    text: String(label.text), visibility: String(label.style.visibility),
                    width: Number(label.actuallayoutwidth), height: Number(label.actuallayoutheight)
                } : null;
            }
        });
        return { session: session, stopped: stopped, frames: diagnostics.frames,
            context_valid: !!valid(context), container_valid: !!valid(container),
            state_count: Object.keys(states).length, panel_count: Object.keys(panels).length,
            visible_count: visible, hidden_reasons: counts, units: rows,
            api: { is_dormant: typeof Entities.IsDormant === "function",
                health_bar_offset: typeof Entities.GetHealthBarOffset === "function" },
            viewport: diagnostics.viewport, occlusion: diagnostics.occlusion,
            lastError: diagnostics.lastError, lastApiWarning: diagnostics.lastApiWarning,
            lastRejected: diagnostics.lastRejected };
    }
    config.SurvivalTowerRanks = { Stop: stop, DebugSnapshot: debugSnapshot };
    // Read-only server-triggered Tools diagnosis, useful without a JS console.
    // No client->server listener, permissions, inventory or gameplay mutation.
    if (typeof GameEvents !== "undefined" && GameEvents.Subscribe) {
        debugListener = GameEvents.Subscribe("survival_tower_rank_debug_request", function () {
            if (!stopped) $.Msg("[TowerRankDebug] " + JSON.stringify(debugSnapshot()));
        });
    }
    listener = CustomNetTables.SubscribeNetTableListener(TABLE, function (table, key, value) {
        if (stopped || table !== TABLE) return;
        apply(key, value);
        if (key === "_session") restore();
    });
    restore();
    positions();
})();
