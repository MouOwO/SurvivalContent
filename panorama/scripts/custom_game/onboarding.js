(function () {
    "use strict";
    // This layer never owns the ordinary modal stack: production buttons must
    // remain usable through its hole. Gameplay completion is server-owned.
    function rows(value) {
        return Array.isArray(value) ? value : Object.keys(value || {}).sort(function (a, b) {
            return Number(a) - Number(b);
        }).map(function (key) { return value[key]; });
    }
    function finite(value) { return typeof value === "number" && isFinite(value) && Math.abs(value) < 1000000; }
    function yes(value) { return value === true || Number(value) === 1; }
    function inside(point, rect) {
        return !!point && !!rect && point[0] >= rect.x && point[1] >= rect.y
            && point[0] <= rect.x + rect.width && point[1] <= rect.y + rect.height;
    }
    function targetValid(t) { return !!t && [t.x, t.y, t.z, t.width, t.height].every(finite) && t.width > 0 && t.height > 0; }
    function targetContains(point, target) {
        return !!point && targetValid(target) && Math.abs(Number(point[0]) - target.x) <= target.width / 2
            && Math.abs(Number(point[1]) - target.y) <= target.height / 2;
    }
    function masks(view, hole) {
        if (!hole) return [{x:0,y:0,width:view.width,height:view.height}, null, null, null];
        var x = Math.max(0, Math.min(view.width, hole.x)), y = Math.max(0, Math.min(view.height, hole.y));
        var right = Math.max(x, Math.min(view.width, hole.x + hole.width));
        var bottom = Math.max(y, Math.min(view.height, hole.y + hole.height));
        return [{x:0,y:0,width:view.width,height:y},
            {x:0,y:bottom,width:view.width,height:view.height-bottom},
            {x:0,y:y,width:x,height:bottom-y},
            {x:right,y:y,width:view.width-right,height:bottom-y}];
    }
    var model = {Rows:rows, Inside:inside, Masks:masks, TargetContains:targetContains};
    if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

    var cfg = GameUI.CustomUIConfig(), context = $.GetContextPanel();
    if (cfg.SurvivalOnboarding && cfg.SurvivalOnboarding.Dispose) cfg.SurvivalOnboarding.Dispose();
    var life = Number(cfg.SurvivalOnboardingGeneration || 0) + 1;
    cfg.SurvivalOnboardingGeneration = life;
    var root = context.FindChildTraverse("SurvivalOnboardingRoot") || context;
    function node(id) { return context.FindChildTraverse(id); }
    var maskPanels = [node("OnboardingMaskTop"), node("OnboardingMaskBottom"), node("OnboardingMaskLeft"), node("OnboardingMaskRight")];
    var focus = node("OnboardingFocus"), card = node("OnboardingCard"), skip = node("OnboardingSkip");
    var title = node("OnboardingTitle"), description = node("OnboardingDescription"), status = node("OnboardingStatus");
    var progress = node("OnboardingProgress"), skipText = node("OnboardingSkipText"), targetHost = node("OnboardingTargets");
    var disposed = false, state = null, subscription = null, timer = null, loadingSubscription = null;
    var shown = false, actionable = false, hole = null, view = null, phase = "", phaseKey = "", phaseSince = 0;
    var boundDispatcher = null, selectKey = "", cameraKey = "", chosenTarget = -1, targetsKey = "", targetPanels = [];
    var lastRequest = -100, skipAt = -100, skipPending = false, completeUntil = 0;
    var foregroundLease = [], foregroundLayer = 150000;
    function valid(panel) { return !!panel && (!panel.IsValid || panel.IsValid()); }
    function current() { return !disposed && cfg.SurvivalOnboardingGeneration === life && valid(context) && valid(root); }
    function now() { return Date.now() / 1000; }
    function setText(panel, value) { if (valid(panel) && panel.text !== String(value || "")) panel.text = String(value || ""); }
    function style(panel, values) {
        if (!valid(panel)) return;
        var cache = panel.__onboardingStyle || (panel.__onboardingStyle = {});
        Object.keys(values).forEach(function (key) {
            if (cache[key] === values[key]) return;
            panel.style[key] = values[key]; cache[key] = values[key];
        });
    }
    function place(panel, rect) {
        if (!valid(panel)) return;
        panel.visible = !!rect && rect.width > 0 && rect.height > 0;
        if (panel.visible) style(panel, {position:rect.x.toFixed(2) + "px " + rect.y.toFixed(2) + "px 0px",
            width:rect.width.toFixed(2) + "px", height:rect.height.toFixed(2) + "px"});
    }
    function geometry() {
        var position = root.GetPositionWithinWindow ? root.GetPositionWithinWindow() : {x:0,y:0};
        var sx = Number(root.actualuiscale_x) || 1, sy = Number(root.actualuiscale_y) || 1;
        var width = Number(root.actuallayoutwidth), height = Number(root.actuallayoutheight);
        if (![position.x, position.y, sx, sy, width, height].every(finite) || sx <= 0 || sy <= 0 || width <= 0 || height <= 0) return null;
        return {x:position.x,y:position.y,sx:sx,sy:sy,width:width,height:height};
    }
    function localPoint(point) { return point && view ? [(point[0]-view.x)/view.sx,(point[1]-view.y)/view.sy] : null; }
    function screen(world) {
        if (!view || !Game.WorldToScreenX || !Game.WorldToScreenY) return null;
        var x = Number(Game.WorldToScreenX(world[0],world[1],world[2]));
        var y = Number(Game.WorldToScreenY(world[0],world[1],world[2]));
        return finite(x) && finite(y) && x >= 0 && y >= 0 ? localPoint([x,y]) : null;
    }
    function topPanel() {
        var result = context, count = 0;
        while (result.GetParent && result.GetParent() && count++ < 20) result = result.GetParent();
        return result;
    }
    function layerValue(value) {
        var text = String(value === undefined || value === null ? "" : value);
        return /^-?\d+$/.test(text) ? text : "0";
    }
    function restoreForeground() {
        foregroundLease.forEach(function (entry) {
            // Modal, loading and native-error owners may have acquired an
            // ancestor since us. Restore only the assignment we still own.
            if (valid(entry.panel) && entry.owned && Number(entry.panel.style.zIndex) === foregroundLayer)
                entry.panel.style.zIndex = entry.previous;
        });
        foregroundLease = [];
    }
    function raiseForeground() {
        var top = topPanel(), panel = root, path = [];
        for (var depth = 0; valid(panel) && panel !== top && depth < 32; depth++) {
            path.push(panel); panel = panel.GetParent ? panel.GetParent() : null;
        }
        if (panel !== top) { restoreForeground(); return; }
        if (foregroundLease.length !== path.length || foregroundLease.some(function (entry,index) { return entry.panel !== path[index]; })) {
            restoreForeground();
            foregroundLease = path.map(function (entry) { return {panel:entry,previous:layerValue(entry.style.zIndex),owned:false}; });
        }
        foregroundLease.forEach(function (entry) {
            var previous = layerValue(entry.panel.style.zIndex), value = Number(previous);
            if (entry.owned && value === foregroundLayer) return;
            // Never lower a loading cover or a native error/tooltip lease.
            // A later lower assignment is its owner's new baseline, rather
            // than the stale value captured when the guide first opened.
            if (value >= foregroundLayer) return;
            entry.previous = previous;
            entry.panel.style.zIndex = String(foregroundLayer); entry.owned = true;
        });
    }
    function closeOrdinaryModals() {
        var layers = cfg.SurvivalUILayers;
        if (!layers || !layers.Top || !layers.CloseTop) return true;
        for (var attempt = 0; attempt < 8; attempt++) {
            var top = layers.Top();
            if (!top) return true;
            layers.CloseTop();
            // Do not detach a modal behind its owner's back. A modal which
            // cannot close leaves a safe wait state with skip still available.
            if (layers.Top() === top) return false;
        }
        return !layers.Top();
    }
    function visible(panel) {
        var count = 0;
        while (valid(panel) && count++ < 20) {
            if (panel.visible === false || panel.style && panel.style.visibility === "collapse") return false;
            panel = panel.GetParent ? panel.GetParent() : null;
        }
        return true;
    }
    function panelRect(panel) {
        if (!valid(panel) || !visible(panel) || !panel.GetPositionWithinWindow || !view) return null;
        var position = panel.GetPositionWithinWindow();
        var width = Number(panel.__survivalWindowWidth) || Number(panel.actuallayoutwidth) * (Number(panel.actualuiscale_x) || 1);
        var height = Number(panel.__survivalWindowHeight) || Number(panel.actuallayoutheight) * (Number(panel.actualuiscale_y) || 1);
        if (![position.x,position.y,width,height].every(finite) || width <= 0 || height <= 0) return null;
        return {x:(position.x-view.x)/view.sx,y:(position.y-view.y)/view.sy,width:width/view.sx,height:height/view.sy};
    }
    function findButton() {
        var top = topPanel();
        if (!top.FindChildTraverse) return null;
        if (state.step === "worker") {
            var production = cfg.SurvivalProductionHUD, snapshot = production && production.Inspect ? production.Inspect() : null;
            if (!snapshot || Number(snapshot.unit) !== Number(state.main_city_entindex) || !snapshot.visible) return null;
            var index = rows(snapshot.slots).indexOf("train_lumberjack_01");
            return index < 0 ? null : top.FindChildTraverse("ProductionTrainingSlot" + index);
        }
        var host = top.FindChildTraverse("SurvivalManagedAbilityProxyLayer"), children = host && host.Children ? host.Children() : [];
        for (var index = 0; index < children.length; index++) {
            var panel = children[index];
            if (panel.__survivalAbilityName === state.ability_name && panel.hittest && visible(panel)) return panel;
        }
        return null;
    }
    function validEntity(entity) {
        return finite(Number(entity)) && Number(entity) >= 0 && Entities.IsValidEntity(Number(entity));
    }
    function selectUnit() {
        var entity = state.step === "worker" ? Number(state.main_city_entindex) : Number(state.builder_entindex);
        var key = String(state.generation) + ":" + state.step + ":" + entity;
        if (selectKey === key || !validEntity(entity)) return;
        if (GameUI.SelectUnit) GameUI.SelectUnit(entity, false);
        selectKey = key;
    }
    function pointTarget() {
        var point = cfg.SurvivalPointTargetState;
        return point && point.active && point.name === state.ability_name
            && Number(point.unit) === Number(state.builder_entindex);
    }
    function resetSelection() { selectKey = ""; cameraKey = ""; chosenTarget = -1; phaseKey = ""; targetsKey = ""; }
    function chooseTarget(targets) {
        if (chosenTarget >= 0 && chosenTarget < targets.length) return chosenTarget;
        var origin = null;
        if (validEntity(Number(state.builder_entindex)) && Entities.GetAbsOrigin) origin = Entities.GetAbsOrigin(Number(state.builder_entindex));
        var best = 0, distance = Infinity;
        targets.forEach(function (target, index) {
            var d = origin ? Math.pow(target.x-Number(origin[0]),2) + Math.pow(target.y-Number(origin[1]),2) : index;
            if (d < distance) { distance = d; best = index; }
        });
        chosenTarget = best; return best;
    }
    function quad(target, footprint) {
        if (!targetValid(target)) return null;
        var size = Number(state.build_grid_size) || 64;
        var width = footprint && finite(Number(target.footprint_x)) && Number(target.footprint_x) > 0
            ? Number(target.footprint_x) * size : target.width;
        var height = footprint && finite(Number(target.footprint_y)) && Number(target.footprint_y) > 0
            ? Number(target.footprint_y) * size : target.height;
        var x = target.x, y = target.y, z = target.z + 3, w = width / 2, h = height / 2;
        var points = [[x-w,y-h,z],[x+w,y-h,z],[x+w,y+h,z],[x-w,y+h,z]].map(screen);
        return points.some(function (point) { return !point; }) ? null : points;
    }
    function quadBounds(points) {
        if (!points) return null;
        var xs = points.map(function (p) { return p[0]; }), ys = points.map(function (p) { return p[1]; });
        var x = Math.min.apply(null,xs), y = Math.min.apply(null,ys);
        return {x:x,y:y,width:Math.max.apply(null,xs)-x,height:Math.max.apply(null,ys)-y};
    }
    function segment(panel, a, b, thickness) {
        var dx = b[0]-a[0], dy = b[1]-a[1], length = Math.sqrt(dx*dx+dy*dy);
        place(panel,{x:(a[0]+b[0]-length)/2,y:(a[1]+b[1]-thickness)/2,width:length,height:thickness});
        style(panel,{transform:"rotateZ("+(Math.atan2(dy,dx)*180/Math.PI).toFixed(3)+"deg)"});
    }
    function createTarget() {
        var panel = $.CreatePanel("Panel",targetHost,""); panel.AddClass("OnboardingTarget");
        panel.hittest = false; panel.hittestchildren = false;
        var result = {panel:panel,fills:[],edges:[]};
        for (var index = 0; index < 12; index++) {
            var fill = $.CreatePanel("Panel",panel,""); fill.AddClass("OnboardingTargetFill"); fill.hittest = false; result.fills.push(fill);
        }
        for (var edge = 0; edge < 4; edge++) {
            var line = $.CreatePanel("Panel",panel,""); line.AddClass("OnboardingTargetEdge"); line.hittest = false; result.edges.push(line);
        }
        return result;
    }
    function renderTargets(targets, enabled) {
        while (targetPanels.length < targets.length && targetPanels.length < 4) targetPanels.push(createTarget());
        targetPanels.forEach(function (entry, index) {
            // Green paint shows the building's full footprint. Its click hole
            // remains the separately authorised building-center region.
            var points = enabled && targets[index] ? quad(targets[index],true) : null;
            entry.panel.visible = !!points;
            if (!points) return;
            var dx = points[1][0]-points[0][0], dy = points[1][1]-points[0][1];
            var height = Math.abs(dx*(points[3][1]-points[0][1])-dy*(points[3][0]-points[0][0])) / Math.max(1,Math.sqrt(dx*dx+dy*dy));
            entry.fills.forEach(function (fill,i) {
                var fraction = (i+0.5)/12;
                segment(fill,[points[0][0]+(points[3][0]-points[0][0])*fraction,points[0][1]+(points[3][1]-points[0][1])*fraction],
                    [points[1][0]+(points[2][0]-points[1][0])*fraction,points[1][1]+(points[2][1]-points[1][1])*fraction],Math.max(1,height/12));
            });
            entry.edges.forEach(function (edge,i) { segment(edge,points[i],points[(i+1)%4],2); });
        });
    }
    function admitted() {
        var loading = CustomNetTables.GetTableValue("survival_loading","state");
        return !!loading && yes(loading.admission_complete === undefined ? loading.all_ready : loading.admission_complete);
    }
    function request(force) {
        if (!current() || !force && now()-lastRequest < 5) return;
        lastRequest = now(); GameEvents.SendCustomGameEventToServer("ui_onboarding_request_state",{});
    }
    function accept(payload) {
        if (!current() || !payload || payload.generation === undefined || !finite(Number(payload.revision))) return;
        if (state && payload.generation === state.generation && Number(payload.revision) <= Number(state.revision)) return;
        if (state && finite(Number(payload.generation)) && finite(Number(state.generation))
            && Number(payload.generation) < Number(state.generation)) return;
        var changing = !state || state.generation !== payload.generation || state.step !== payload.step;
        if (changing) resetSelection();
        var wasActive = state && yes(state.active);
        state = payload;
        if (!yes(state.active)) {
            skipPending = false;
            if (state.step === "complete" && wasActive) completeUntil = now()+3.5;
        }
        render();
    }
    function render() {
        if (!current()) return;
        var active = state && yes(state.active), completed = state && state.step === "complete" && now() < completeUntil;
        shown = !!(admitted() && (active || completed));
        root.visible = shown; style(root,{visibility:shown?"visible":"collapse"});
        root.hittest = false; root.hittestchildren = shown;
        actionable = false; hole = null; phase = "";
        if (!shown) { restoreForeground(); return; }
        // An independent Hud has a separate native branch. Raising only the
        // authored child cannot bring it above a raised sibling HUD/modal.
        var modalsClear = !active || closeOrdinaryModals();
        if (active) raiseForeground();
        else restoreForeground();
        view = geometry();
        if (!view) return;
        skip.visible = true; skip.hittest = true;
        setText(skipText,completed?"完成":skipPending && now()-skipAt>=1?"重试跳过":"跳过引导");
        setText(progress,completed?"新手引导已完成":"新手引导 · "+String(state.step_index || 1)+" / "+String(state.total_steps || 4));
        setText(title,completed?"准备就绪":state.title || "新手引导");
        setText(description,completed?"基础建设已完成，开始守护你的领地吧。":state.description || "请按照高亮提示完成操作。");
        var targetList = rows(state.targets).filter(targetValid).slice(0,4);
        var nextTargetKey = JSON.stringify(targetList);
        if (targetsKey !== nextTargetKey) { chosenTarget = -1; targetsKey = nextTargetKey; }
        if (active) selectUnit();
        var problem = String(state.error || ""), wait = !modalsClear || yes(state.waiting) || skipPending || Number(state.persisting) > 0;
        phase = completed ? "complete" : wait || problem ? "waiting" : state.step === "worker" ? "worker" : pointTarget() ? "placement" : "ability";
        var targetRect = null;
        if (phase === "ability" || phase === "worker") targetRect = panelRect(findButton());
        if (phase === "placement" && targetList.length) {
            var target = targetList[chooseTarget(targetList)], points = quad(target);
            targetRect = quadBounds(points);
            if (!targetRect || targetRect.x < 0 || targetRect.y < 0 || targetRect.x+targetRect.width > view.width
                || targetRect.y+targetRect.height > view.height*0.86) {
                var key = String(state.generation)+":"+state.step;
                if (cameraKey !== key && GameUI.SetCameraTargetPosition) {
                    cameraKey = key; GameUI.SetCameraTargetPosition([target.x,target.y,target.z],0.35);
                }
                targetRect = null;
            }
        }
        renderTargets(targetList,active && !completed && (phase === "ability" || phase === "placement"));
        var nextPhaseKey = String(state.generation)+":"+state.step+":"+phase+":"+(targetRect?"ready":"missing");
        if (nextPhaseKey !== phaseKey) { phaseKey = nextPhaseKey; phaseSince = now(); }
        var animation = Math.max(0,Math.min(1,(now()-phaseSince)/0.3));
        actionable = active && !wait && !problem && !!targetRect && animation >= 1;
        if (targetRect) {
            var inset = 3, expansion = (1-animation)*(1-animation)*Math.min(140,view.width*0.1);
            hole = {x:targetRect.x-inset-expansion,y:targetRect.y-inset-expansion,
                width:targetRect.width+2*(inset+expansion),height:targetRect.height+2*(inset+expansion)};
        }
        masks(view,completed?{x:0,y:0,width:view.width,height:view.height}:hole).forEach(function (rect,index) {
            maskPanels[index].hittest = !completed; place(maskPanels[index],rect);
        });
        place(focus,completed?null:hole); style(focus,{visibility:hole&&!completed?"visible":"collapse"});
        // A moving hole must not expose unrelated native UI during the close-in
        // animation. The transparent focus panel intercepts that short interval.
        focus.hittest = !!hole && !actionable && !completed;
        var cardWidth = Math.max(240,Math.min(420,view.width-32));
        var cardX = 32, cardY = Math.max(80,Math.min(view.height-270,view.height*0.16));
        if (hole && hole.x < cardWidth+56 && hole.y < cardY+260 && hole.y+hole.height > cardY) cardX = Math.max(16,view.width-cardWidth-32);
        style(card,{position:cardX.toFixed(2)+"px "+cardY.toFixed(2)+"px 0px",width:cardWidth.toFixed(2)+"px"});
        setText(status,completed?"祝你旗开得胜！":problem?problem:skipPending?"正在跳过引导…":wait?"正在确认操作，请稍候…":
            !targetRect?"正在定位高亮区域，请稍候…":phase==="placement"?"在绿色区域内左键建造 · 右键可重新选择":phase==="worker"?"点击高亮农民图标开始训练":"点击高亮技能，选择建造位置");
    }
    function skipGuide() {
        if (!current() || !shown) return;
        if (state && state.step === "complete" && !yes(state.active)) { completeUntil = 0; render(); return; }
        if (now()-skipAt < 1) return;
        skipAt = now(); skipPending = true;
        GameEvents.SendCustomGameEventToServer("ui_onboarding_skip",{}); render();
    }
    function mouse(eventName, button) {
        if (!current() || !shown || !state || !yes(state.active)) return false;
        var cursor = localPoint(GameUI.GetCursorPosition());
        if (inside(cursor,panelRect(skip))) return false;
        if (!actionable || !inside(cursor,hole)) return true;
        if (phase !== "placement") return button === 1;
        if (button === 1) return false;
        if (button !== 0) return true;
        var targetList = rows(state.targets).filter(targetValid).slice(0,4);
        var world = GameUI.GetScreenWorldPosition(GameUI.GetCursorPosition());
        return !targetContains(world,targetList[chosenTarget]);
    }
    function keyboard(key, down) {
        if (!current() || !shown || !state || !yes(state.active)) return false;
        var normalized = String(key || "").toUpperCase();
        if ((normalized === "ESC" || normalized === "ESCAPE") && phase === "placement" && actionable) return false;
        return /^(Q|W|E|R|T|Y|U|S|D|F|G|H|C|A|P|B|F[1-9]|TAB|SPACE|ESC|ESCAPE|[0-9])$/.test(normalized);
    }
    function bindInput() {
        var dispatcher = cfg.SurvivalInputDispatcher;
        if (!dispatcher || dispatcher === boundDispatcher) return;
        boundDispatcher = dispatcher;
        dispatcher.RegisterMouseHandler("onboarding",mouse,1200);
        dispatcher.RegisterKeyHandler("onboarding",keyboard,1200);
    }
    function dispose() {
        if (disposed) return;
        disposed = true; shown = false; actionable = false;
        if (timer !== null && $.CancelScheduled) $.CancelScheduled(timer);
        if (subscription !== null && GameEvents.Unsubscribe) GameEvents.Unsubscribe(subscription);
        if (loadingSubscription !== null && CustomNetTables.UnsubscribeNetTableListener) CustomNetTables.UnsubscribeNetTableListener(loadingSubscription);
        targetPanels.forEach(function (entry) {
            if (!valid(entry.panel)) return;
            entry.panel.visible = false;
            if (entry.panel.DeleteAsync) entry.panel.DeleteAsync(0);
        });
        restoreForeground();
        if (valid(root)) { root.visible = false; root.hittest = false; root.hittestchildren = false; }
        maskPanels.forEach(function (panel) { if (valid(panel)) { panel.hittest = false; panel.visible = false; } });
        if (valid(skip)) skip.hittest = false;
    }
    function loop() {
        timer = null;
        if (!current()) { dispose(); return; }
        bindInput(); render();
        if (!state || state && yes(state.active)) request(false);
        timer = $.Schedule(shown?0.03:0.25,loop);
    }
    skip.SetPanelEvent("onactivate",skipGuide);
    maskPanels.forEach(function (panel) { panel.SetPanelEvent("onactivate",function () {}); });
    subscription = GameEvents.Subscribe("survival_onboarding_state",accept);
    if (CustomNetTables.SubscribeNetTableListener) loadingSubscription = CustomNetTables.SubscribeNetTableListener("survival_loading",function () { if (current()) render(); });
    cfg.SurvivalOnboarding = {Dispose:dispose, Inspect:function () {
        return {generation:life,revision:state&&state.revision,step:state&&state.step,shown:shown,phase:phase,
            actionable:actionable,hole:hole,chosen_target:chosenTarget,skip_pending:skipPending};
    }};
    request(true); loop();
})();
