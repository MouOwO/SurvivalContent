(function () {
    "use strict";
    var container = $("#GoldMineIncomeNumbers");
    var config = GameUI.CustomUIConfig();
    var previous = config.SurvivalGoldIncomeOwner;
    if (previous && previous.Dispose) previous.Dispose();
    var owner = {}, disposed = false, subscriptions = [], scheduled = null;
    var loadingSubscription = null, loadingIdentity = null, advertised = false;
    var animationEpoch = 0, updateRunner = null;
    config.SurvivalGoldIncomeOwner = owner;
    function live() { return !disposed && config.SurvivalGoldIncomeOwner === owner; }
    function dispose() {
        if (disposed) return;
        disposed = true;
        animationEpoch++;
        if (GameEvents.Unsubscribe) subscriptions.forEach(function (id) { GameEvents.Unsubscribe(id); });
        if (loadingSubscription !== null && CustomNetTables.UnsubscribeNetTableListener)
            CustomNetTables.UnsubscribeNetTableListener(loadingSubscription);
        if (scheduled !== null && $.CancelScheduled) $.CancelScheduled(scheduled);
        scheduled = null;
        for (var i = active.length - 1; i >= 0; i--) removeAt(i);
        if (config.SurvivalGoldIncomeOwner === owner) config.SurvivalGoldIncomeOwner = null;
    }
    owner.Dispose = dispose;
    var active = [];
    var nextId = 0;
    var updateScheduled = false;
    function validPanel(panel) { return panel && (!panel.IsValid || panel.IsValid()); }
    function selectedUnit() {
        var selected = Players.GetSelectedEntities(Game.GetLocalPlayerID()) || [];
        return selected.length > 0 ? Number(selected[0]) : -1;
    }
    function publishSelection() {
        if (!live()) return;
        GameEvents.SendCustomGameEventToServer("survival_scale_selection_changed", { entindex: selectedUnit() });
    }
    function removeAt(index) {
        var entry = active[index];
        if (entry && validPanel(entry.panel)) entry.panel.DeleteAsync(0.0);
        active.splice(index, 1);
    }
    function update() {
        scheduled = null;
        if (!live()) return;
        if (!validPanel(container)) { dispose(); return; }
        var now = Game.GetGameTime();
        var scaleX = Number(container && container.actualuiscale_x) || 1;
        var scaleY = Number(container && container.actualuiscale_y) || 1;
        var visibility=typeof GameUI!=="undefined"?GameUI.CustomUIConfig().SurvivalWorldOverlayVisibility:null;
        var occlusion=visibility?visibility.Capture():null;
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
            if(visibility&&visibility.Overlaps(occlusion,screenX-50*scaleX,screenY-(36+progress*54)*scaleY,100*scaleX,36*scaleY)){
                entry.panel.style.visibility="collapse";continue;
            }
            entry.panel.style.opacity = String(1 - progress);
            entry.panel.style.transform = "translate3d(" + (screenX / scaleX - 50).toFixed(2) + "px, " + (screenY / scaleY - 36 - progress * 54).toFixed(2) + "px, 0px)";
            entry.panel.style.visibility = "visible";
        }
        if (active.length > 0) scheduled = $.Schedule(0.0, updateRunner); else updateScheduled = false;
    }
    function show(payload) {
        if (!live() || !validPanel(container)) return;
        var entindex = Number(payload && payload.target_entindex);
        var amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
        if (!isFinite(entindex) || entindex < 0 || entindex !== Math.floor(entindex) || !isFinite(amount) || amount <= 0) return;
        var panel = $.CreatePanel("Label", container, "GoldMineIncome_" + (++nextId));
        panel.AddClass("GoldMineIncomeNumber");
        if (Number(payload.critical) === 1) panel.AddClass("Critical");
        var formatter = GameUI.CustomUIConfig().SurvivalNumberFormatter;
        panel.text = "+" + (formatter && formatter.Format ? formatter.Format(amount) : String(amount));
        panel.hittest = false;
        active.push({ panel: panel, entindex: entindex, startedAt: Game.GetGameTime() });
        if (!updateScheduled) {
            updateScheduled = true;
            var epoch = ++animationEpoch;
            updateRunner = function () { if (live() && epoch === animationEpoch) update(); };
            updateRunner();
        }
    }
    // Preserve the legacy receiver. The server sends exactly one representation.
    subscriptions.push(GameEvents.Subscribe("survival_gold_mine_income_number", show));
    subscriptions.push(GameEvents.Subscribe("gn", function (payload) {
        if (!payload || typeof payload.e !== "number" || typeof payload.a !== "number"
            || (payload.c !== 0 && payload.c !== 1)) return;
        show({target_entindex: payload.e, amount: payload.a, critical: payload.c});
    }));
    subscriptions.push(GameEvents.Subscribe("dota_player_update_selected_unit", publishSelection));
    subscriptions.push(GameEvents.Subscribe("dota_player_update_query_unit", publishSelection));
    function advertise() {
        if (!live()) return;
        var state = typeof CustomNetTables !== "undefined"
            ? CustomNetTables.GetTableValue("survival_loading", "state") : null;
        var identity = state && (state.session_id || state.match_session_id);
        var ready = !!state && (state.admission_complete === true || Number(state.admission_complete) === 1)
            && (state.profiles_ready === true || Number(state.profiles_ready) === 1)
            && typeof identity === "string" && /^[A-Za-z0-9_.:-]{8,128}$/.test(identity);
        if (!ready || identity !== loadingIdentity) {
            advertised = false;
            if (loadingIdentity !== null) {
                animationEpoch++;
                for (var i = active.length - 1; i >= 0; i--) removeAt(i);
                if (scheduled !== null && $.CancelScheduled) $.CancelScheduled(scheduled);
                scheduled = null; updateScheduled = false;
            }
        }
        loadingIdentity = ready ? identity : null;
        if (ready && !advertised) {
            advertised = true;
            GameEvents.SendCustomGameEventToServer("survival_gold_number_ready", {v: 1});
        }
    }
    // Reuse the existing ready/session edge. No click dependency or retry timer.
    if (typeof CustomNetTables !== "undefined") {
        loadingSubscription = CustomNetTables.SubscribeNetTableListener("survival_loading", function (table, key) {
            if (key === "state") advertise();
        });
        advertise();
    }
    publishSelection();
})();
