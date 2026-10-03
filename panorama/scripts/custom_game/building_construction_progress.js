(function () {
    "use strict";
    var table = "survival_ui_state", prefix = "construction_";
    var container = $("#SurvivalConstructionBars"), states = {}, bars = {}, running = false;
    function remove(key) {
        if (bars[key] && bars[key].IsValid()) bars[key].DeleteAsync(0);
        delete bars[key]; delete states[key];
    }
    function tick() {
        running = false;
        if (!container || !container.IsValid()) return;
        var now = Number(Game.GetGameTime()), team = Players.GetTeam(Game.GetLocalPlayerID());
        var sx = Number(container.actualuiscale_x) || 1, sy = Number(container.actualuiscale_y) || 1;
        var offset = container.GetPositionWithinWindow ? container.GetPositionWithinWindow() : {x:0,y:0};
        var visibility = GameUI.CustomUIConfig().SurvivalWorldOverlayVisibility;
        var occlusion = visibility ? visibility.Capture() : null;
        Object.keys(states).forEach(function (key) {
            var state = states[key], bar = bars[key], entity = Number(state.entindex);
            try {
                if (!Entities.IsValidEntity(entity) || !Entities.IsAlive(entity)
                    || Number(state.team) !== Number(team)
                    || (Entities.IsDormant && Entities.IsDormant(entity))) {
                    bar.style.visibility = "collapse"; return;
                }
                var x = Game.WorldToScreenX(Number(state.x),Number(state.y),Number(state.z)+150);
                var y = Game.WorldToScreenY(Number(state.x),Number(state.y),Number(state.z)+150);
                if (!isFinite(x) || !isFinite(y) || x < 0 || y < 0
                    || (visibility && visibility.Overlaps(occlusion,x-60*sx,y-16*sy,120*sx,32*sy))) {
                    bar.style.visibility = "collapse"; return;
                }
                var progress = Math.max(0,Math.min(1,(now-Number(state.start))/Math.max(0.1,Number(state.duration)||3)));
                var width = (100*progress).toFixed(2)+"%";
                if (bar.lastWidth !== width) { bar.fill.style.width=width; bar.lastWidth=width; }
                bar.style.position = ((x-offset.x)/sx-60).toFixed(2)+"px "+((y-offset.y)/sy-16).toFixed(2)+"px 0px";
                bar.style.visibility="visible";
            } catch (error) { bar.style.visibility="collapse"; }
        });
        if (Object.keys(states).length) { running=true; $.Schedule(0.03,tick); }
    }
    function changed(name,key,state) {
        if (name !== table || key.indexOf(prefix) !== 0) return;
        if (!state || Number(state.removed) === 1) { remove(key); return; }
        states[key]=state;
        if (!bars[key] || !bars[key].IsValid()) {
            var bar=$.CreatePanel("Panel",container,""); bar.AddClass("ConstructionBar");
            bar.hittest=false; bar.hittestchildren=false;
            var track=$.CreatePanel("Panel",bar,""); track.AddClass("ConstructionTrack");
            bar.fill=$.CreatePanel("Panel",track,""); bar.fill.AddClass("ConstructionFill");
            var label=$.CreatePanel("Label",bar,""); label.AddClass("ConstructionText"); label.text="建造中";
            bars[key]=bar;
        }
        if (!running) tick();
    }
    CustomNetTables.SubscribeNetTableListener(table,changed);
    var initial=CustomNetTables.GetAllTableValues(table)||{};
    Object.keys(initial).forEach(function (key) {
        var entry=initial[key];
        if (entry && entry.key !== undefined) changed(table,String(entry.key),entry.value);
        else changed(table,key,entry);
    });
})();
