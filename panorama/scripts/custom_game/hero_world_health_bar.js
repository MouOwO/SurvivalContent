(function () {
    "use strict";

    var TABLE = "survival_hero_health_bar";
    var PREFIX = "unit_";
    var panels = {};
    var states = {};
    var container = $("#SurvivalHeroWorldHealthBars");


    function localTeam() {
        try {
            return Number(Players.GetTeam(Game.GetLocalPlayerID()));
        } catch (error) {
            return -1;
        }
    }

    function windowPosition(panel) {
        if (!panel || !panel.GetPositionWithinWindow) return { x: 0, y: 0 };
        var position = panel.GetPositionWithinWindow();
        return {
            x: Number(position && position.x) || 0,
            y: Number(position && position.y) || 0
        };
    }

    function validPanel(target) {
        return target && (!target.IsValid || target.IsValid());
    }

    function ensurePanel(key) {
        if (validPanel(panels[key])) return panels[key];
        if (!container) return null;
        var bar = $.CreatePanel("Panel", container, "SurvivalHeroWorldHealth_" + key);
        bar.AddClass("SurvivalHeroWorldHealthBar");
        bar.hittest = false;
        var fill = $.CreatePanel("Panel", bar, "");
        fill.AddClass("SurvivalHeroWorldHealthFill");
        fill.hittest = false;
        for (var index = 1; index < 10; index++) {
            var divider = $.CreatePanel("Panel", bar, "");
            divider.AddClass("SurvivalHeroWorldHealthTick");
            divider.AddClass("SurvivalHeroWorldHealthTick" + (index * 10));
            divider.hittest = false;
        }
        bar.__fill = fill;
        panels[key] = bar;
        return bar;
    }

    function hide(key) {
        var bar = panels[key];
        if (validPanel(bar)) bar.style.visibility = "collapse";
    }

    function removePanel(key) {
        var bar = panels[key];
        if (validPanel(bar)) bar.DeleteAsync(0.0);
        delete panels[key];
    }

    function applyState(key, value) {
        if (!value || Number(value.removed) === 1) {
            delete states[key];
            removePanel(key);
            return;
        }
        states[key] = value;
        var bar = ensurePanel(key);
        if (!bar) return;
        var health = Math.max(0, Number(value.health) || 0);
        var maximum = Math.max(1, Number(value.max_health) || 1);
        var percent = Math.max(0, Math.min(100, 100 * health / maximum));
        var unitTeam = Number(value.team);
        var playerTeam = localTeam();
        bar.SetHasClass(
            "SurvivalEnemyHealthBar",
            unitTeam >= 0 && playerTeam >= 0 && unitTeam !== playerTeam
        );
        bar.__fill.style.width = percent.toFixed(3) + "%";
    }

    function onTableChanged(tableName, key, value) {
        if (tableName === TABLE && key.indexOf(PREFIX) === 0) {
            applyState(key, value);
        }
    }

    function updatePositions() {
        if (!container) return;
        var scaleX = Number(container.actualuiscale_x) || 1;
        var scaleY = Number(container.actualuiscale_y) || 1;
        var containerPosition = windowPosition(container);
        Object.keys(states).forEach(function (key) {
            var state = states[key];
            var bar = ensurePanel(key);
            var entindex = Number(state.entindex);
            if (!bar || Number(state.alive) !== 1 || entindex < 0
                || !Entities.IsValidEntity(entindex)) {
                hide(key);
                return;
            }
            var origin = Entities.GetAbsOrigin(entindex);
            if (!origin || origin.length < 3) {
                hide(key);
                return;
            }
            var height = 190;
            try {
                if (Entities.GetHealthBarOffset) {
                    var configuredHeight = Number(Entities.GetHealthBarOffset(entindex));
                    // A KV offset of -1 hides the native bar and is not a usable
                    // world height for this custom continuous health bar.
                    if (isFinite(configuredHeight) && configuredHeight > 0) {
                        height = configuredHeight;
                    }
                }
            } catch (error) {}
            var screenX = Game.WorldToScreenX(
                origin[0], origin[1], Number(origin[2]) + height
            );
            var screenY = Game.WorldToScreenY(
                origin[0], origin[1], Number(origin[2]) + height
            );
            if (!isFinite(screenX) || !isFinite(screenY)
                || screenX < 0 || screenY < 0) {
                hide(key);
                return;
            }
            var localX = (screenX - containerPosition.x) / scaleX - 31;
            var localY = (screenY - containerPosition.y) / scaleY - 26;
            if (!isFinite(localX) || !isFinite(localY)) {
                hide(key);
                return;
            }
            bar.style.position = localX.toFixed(2) + "px "
                + localY.toFixed(2) + "px 0px";
            bar.style.visibility = "visible";
        });
        // Run once per Panorama frame. The previous fixed 30 Hz layout update
        // visibly lagged behind the engine's native overhead bars while units
        // or the camera were moving.
        $.Schedule(0.0, updatePositions);
    }

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
    CustomNetTables.SubscribeNetTableListener(TABLE, onTableChanged);
    updatePositions();
})();