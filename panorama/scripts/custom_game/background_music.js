// Native music voices loop and fade in the engine. The existing personal HUD
// stream supplies phase changes: O(1) selection, no polling or new messages.
(function (factory) {
    "use strict";
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (typeof GameUI === "undefined" || !GameUI.CustomUIConfig) return;
    var cfg = GameUI.CustomUIConfig(), source = cfg.SurvivalCompactHUDSource;
    var root = $.GetContextPanel(), old = cfg.SurvivalBackgroundMusic;
    if (old && old.Source === source && old.Root === root && old.IsAlive()) return;
    if (old) old.Dispose();
    if (!source) return;
    var instance = api.Create({
        source: source,
        play: function (name) { return Game.EmitSound(name); },
        stop: function (handle) { Game.StopSound(handle); },
        schedule: function (delay, callback) { return $.Schedule(delay, callback); },
        cancel: function (handle) { $.CancelScheduled(handle); },
        ended: function () {
            return typeof DOTA_GameState !== "undefined" &&
                Game.GameStateIs(DOTA_GameState.DOTA_GAMERULES_STATE_POST_GAME);
        },
        valid: function () { return (!root.IsValid || root.IsValid()) &&
            cfg.SurvivalCompactHUDSource === source; },
        report: function (error) { $.Msg("[BackgroundMusic] ", String(error)); }
    });
    instance.Source = source;
    instance.Root = root;
    cfg.SurvivalBackgroundMusic = instance;
    instance.EngineSubscription = instance.IsAlive() ? GameEvents.Subscribe("game_rules_state_change", function () {
        if (Game.GameStateIs(DOTA_GameState.DOTA_GAMERULES_STATE_POST_GAME)) instance.Dispose();
    }) : null;
    var dispose = instance.Dispose;
    instance.Dispose = function () {
        if (instance.EngineSubscription !== null) {
            GameEvents.Unsubscribe(instance.EngineSubscription);
            instance.EngineSubscription = null;
        }
        dispose();
    };
}(function () {
    "use strict";
    function flag(value) { return value === true || value === 1; }
    function select(wave) {
        if (!wave || !wave.status || flag(wave.player_defeated) ||
            flag(wave.defeat_settled) || wave.status === "defeat") return null;
        var mood = flag(wave.boss_alive) ? "Boss" :
            (Number(wave.alive) > 0 || Number(wave.pending) > 0 ||
                wave.status === "spawning" || wave.status === "dev_spawn") ? "Battle" : "Economy";
        var pack = wave.game_mode === "cold" ? "North" : mood === "Economy" ? "Default" : "TI10";
        return pack + "." + mood;
    }
    function create(options) {
        var active = true, voice = null, current = null, desired = null;
        var job = null, revision = 0, token = null, turns = Object.create(null);
        var report = options.report || function () {};
        function stop() {
            if (voice === null) return;
            var handle = voice; voice = null;
            try { options.stop(handle); } catch (error) { report(error); }
        }
        function cancel() {
            revision++;
            if (job !== null) { options.cancel(job); job = null; }
        }
        function apply(key) {
            stop(); current = key;
            if (!key) return;
            var count = key.indexOf(".Boss") >= 0 ? 1 : 3;
            var index = (turns[key] || 0) % count + 1;
            turns[key] = index;
            try {
                var handle = options.play("Survival.Music." + key + "." + index);
                // Native sound GUIDs use a signed high bit. Negative handles
                // are valid and must be passed back unchanged when stopping.
                if (handle !== null && handle !== undefined && handle !== "" &&
                    (typeof handle !== "number" || isFinite(handle) && handle !== -1)) voice = handle;
            } catch (error) { report(error); }
        }
        function dispose() {
            if (!active) return;
            active = false; cancel(); stop(); current = desired = null;
            if (token !== null) { options.source.Unsubscribe(token); token = null; }
        }
        function update(snapshot) {
            if (!active) return;
            if (options.valid && !options.valid() || options.ended && options.ended()) {
                dispose(); return;
            }
            var key = select(snapshot && snapshot.wave);
            if (key === desired) return;
            desired = key; cancel();
            if (key === current) return;
            // Stop immediately on defeat. Coalesce real phase transitions so
            // a burst of spawn/death snapshots cannot create stacked voices.
            if (!key || current === null) { apply(key); return; }
            var ticket = revision;
            job = options.schedule(1.25, function () {
                if (!active || ticket !== revision) return;
                job = null;
                if (options.valid && !options.valid() || options.ended && options.ended()) {
                    dispose(); return;
                }
                apply(desired);
            });
        }
        token = options.source.Subscribe("background_music", ["wave", "wave_setup"], update);
        if (!active && token !== null) { options.source.Unsubscribe(token); token = null; }
        return { Update: update, Dispose: dispose, IsAlive: function () { return active; },
            Inspect: function () { return { current: current, desired: desired, playing: voice !== null }; } };
    }
    return { Create: create, Select: select };
}));
