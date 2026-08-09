(function () {
    "use strict";
    var container = $("#GoldMineIncomeNumbers");
    var active = [];
    var nextId = 0;
    var updateScheduled = false;
    function validPanel(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function selectedUnit() {
        var selected = Players.GetSelectedEntities(Game.GetLocalPlayerID()) || [];
        return selected.length > 0 ? Number(selected[0]) : -1;
    }
    function publishSelection() {
        GameEvents.SendCustomGameEventToServer("survival_scale_selection_changed", { entindex: selectedUnit() });
    }
    function removeAt(index) {
        var entry = active[index];
        if (entry && validPanel(entry.panel)) entry.panel.DeleteAsync(0.0);
        active.splice(index, 1);
    }
    function update() {
        var now = Game.GetGameTime();
        var scaleX = Number(container && container.actualuiscale_x) || 1;
        var scaleY = Number(container && container.actualuiscale_y) || 1;
        for (var index = active.length - 1; index >= 0; index -= 1) {
            var entry = active[index];
            var elapsed = now - entry.startedAt;
            if (elapsed >= 1.0 || !Entities.IsValidEntity(entry.entindex)) { removeAt(index); continue; }
            var origin = Entities.GetAbsOrigin(entry.entindex);
            if (!origin || origin.length < 3) { removeAt(index); continue; }
            var screenX = Game.WorldToScreenX(origin[0], origin[1], Number(origin[2]) + 210);
            var screenY = Game.WorldToScreenY(origin[0], origin[1], Number(origin[2]) + 210);
            if (!isFinite(screenX) || !isFinite(screenY) || screenX < 0 || screenY < 0) {
                entry.panel.style.visibility = "collapse"; continue;
            }
            var progress = Math.max(0, Math.min(1, elapsed));
            entry.panel.style.opacity = String(1 - progress);
            entry.panel.style.transform = "translate3d(" + (screenX / scaleX - 50).toFixed(2) + "px, " + (screenY / scaleY - 36 - progress * 54).toFixed(2) + "px, 0px)";
            entry.panel.style.visibility = "visible";
        }
        if (active.length > 0) $.Schedule(0.0, update); else updateScheduled = false;
    }
    function show(payload) {
        if (!container) return;
        var entindex = Number(payload && payload.target_entindex);
        var amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
        if (entindex < 0 || amount <= 0) return;
        var panel = $.CreatePanel("Label", container, "GoldMineIncome_" + (++nextId));
        panel.AddClass("GoldMineIncomeNumber");
        if (Number(payload.critical) === 1) panel.AddClass("Critical");
        panel.text = "+" + String(amount);
        panel.hittest = false;
        active.push({ panel: panel, entindex: entindex, startedAt: Game.GetGameTime() });
        if (!updateScheduled) { updateScheduled = true; update(); }
    }
    GameEvents.Subscribe("survival_gold_mine_income_number", show);
    GameEvents.Subscribe("dota_player_update_selected_unit", publishSelection);
    GameEvents.Subscribe("dota_player_update_query_unit", publishSelection);
    publishSelection();
})();