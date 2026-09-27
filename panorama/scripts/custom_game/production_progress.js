(function () {
    "use strict";
    function rows(value) {
        if (Array.isArray(value)) return value;
        return Object.keys(value || {}).sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (key) { return value[key]; });
    }
    function completed(option) {
        return Number(option.max_count) > 0 && Number(option.count) >= Number(option.max_count);
    }
    // The visible entry list follows completed counts, never queued reservations.
    // Completing a capped level immediately exposes the next level in order.
    function trainingSlots(options) {
        return rows(options).filter(function (entry) {
            return entry && entry.training_id && !completed(entry);
        }).sort(function (a, b) { return Number(a.level) - Number(b.level); })
            .slice(0, 4).map(function (entry) { return entry.training_id; });
    }
    function progress(job, now) {
        var until = Number(job && job.finish_at), duration = Number(job && job.duration);
        if (!isFinite(until) || !(duration > 0)) return { remaining: 0, fraction: 0 };
        var remaining = Math.max(0, until - Number(now));
        return { remaining: remaining, fraction: Math.max(0, Math.min(1, 1 - remaining / duration)) };
    }
    var model = { Rows: rows, TrainingSlots: trainingSlots, Progress: progress };
    if (typeof module !== "undefined" && module.exports) { module.exports = model; return; }

    var cfg = GameUI.CustomUIConfig(), ctx = $.GetContextPanel();
    var generation = Number(cfg.SurvivalProductionGeneration || 0) + 1;
    cfg.SurvivalProductionGeneration = generation;
    var panel = ctx.FindChildTraverse("SurvivalProductionPanel");
    var markers = ctx.FindChildTraverse("SurvivalResearchAutoMarkers");
    var snapshots = {}, citySlots = {}, currentUnit = -1;
    var buttons = [], queueSlots = [], autoMarkers = [], nodes = {}, serial = 0, lastGeometry = null;
    var lastReady = false, lastEntries = [], status = "", statusUntil = 0;
    function valid(value) { return value && (!value.IsValid || value.IsValid()); }
    function active() { return valid(ctx) && cfg.SurvivalProductionGeneration === generation; }
    function blocked() { return cfg.SurvivalUILayers && cfg.SurvivalUILayers.Top && cfg.SurvivalUILayers.Top(); }
    function gameTime() { return Number(Game.GetGameTime ? Game.GetGameTime() : 0); }
    function selectedUnit() {
        var selection = cfg.SurvivalSelectionResolver;
        return Number(selection && selection.ResolveDisplayUnit ? selection.ResolveDisplayUnit()
            : selection && selection.Resolve ? selection.Resolve() : Players.GetLocalPlayerPortraitUnit());
    }
    function unitType(unit) {
        try { return Entities.GetUnitName(unit) || ""; } catch (error) { return ""; }
    }
    function relevant(unit) {
        var name = unitType(unit);
        return name === "building_main_city" || name === "building_research_lab"
            || name === "building_advanced_research_lab";
    }
    function style(target, values) {
        if (!valid(target)) return;
        Object.keys(values).forEach(function (key) {
            if (String(target.style[key]) !== String(values[key])) target.style[key] = values[key];
        });
    }
    function place(target, x, y, width, height) {
        style(target, { position: x + "px " + y + "px 0px", width: width + "px", height: height + "px" });
    }
    function create(type, parent, id, className) {
        var result = $.CreatePanel(type, parent, id || "");
        result.hittest = type === "Button"; result.hittestchildren = false;
        if (className) result.AddClass(className);
        if (id) nodes[id] = result;
        return result;
    }
    function label(parent, id, className) { return create("Label", parent, id, className || ""); }
    function text(target, value) { if (target.text !== String(value)) target.text = String(value); }
    function formatResource(value) {
        var formatter = cfg.SurvivalNumberFormatter;
        return formatter && formatter.Format ? formatter.Format(value) : String(Number(value || 0));
    }
    function fullTextTooltip(target) {
        target.hittest = true;
        target.SetPanelEvent("onmouseover", function () {
            if (active() && target.text) $.DispatchEvent("DOTAShowTextTooltip", target, escape(target.text));
        });
        target.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip"); });
    }
    function requestId(kind) { serial += 1; return "production_" + kind + "_" + generation + "_" + serial; }
    function notify(message) { status = reason({reason: message || "操作未完成"}); statusUntil = gameTime() + 4; }
    function escape(value) {
        return String(value === undefined ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    function reason(option) {
        var raw = String(option.reason || "");
        var reasons = { city_level_too_low: "需要主城 LV" + option.requires_city_level,
            city_level_required: "需要主城 LV" + option.requires_city_level,
            insufficient_resources: "资源不足", insufficient_gold: "金币不足", insufficient_wood: "木材不足",
            population_limit: "人口不足", population_limit_reached: "人口不足",
            training_limit_reached: "训练名额已满", training_reserved_limit: "剩余名额已在队列中",
            training_queue_full: "训练队列已满", training_max_count_reached: "本级训练名额已满",
            training_not_available: "后续训练尚未开放", training_city_level_required: option.requires_city_level ? "需要主城 LV" + option.requires_city_level : "主城等级不足",
            training_building_missing: "主城不可用", training_owner_mismatch: "不是自己的主城",
            player_defeated: "本局已结束", wood_not_enough: "木材不足", gold_not_enough: "金币不足",
            population_not_enough: "人口不足", not_enough_wood: "木材不足", not_enough_gold: "金币不足",
            not_enough_population: "人口不足", player_id_invalid: "玩家信息尚未就绪",
            invalid_city: "主城不可用", not_main_city: "请选择自己的主城", post_clear_frozen: "结算阶段无法训练",
            resource_error: "资源信息尚未就绪", research_queue_full: "研究队列已满",
            technology_queue_full: "研究队列已满", technology_max_level: "该科技已达到上限",
            research_max_level: "该科技已达到上限", prerequisite_not_met: "等待前置科技完成",
            research_prerequisite_not_met: "等待前置科技完成", insufficient_reincarnation_level: "转生等级不足" };
        return reasons[raw] || (raw && (/^[a-z][a-z0-9_: .-]*$/i.test(raw) ? "暂时无法执行，请稍后重试" : raw)) || (Number(option.available) === 1 ? "点击加入训练队列" : "当前无法训练");
    }
    function optionTooltip(option) {
        if (!option) return "";
        return escape(workerName(option))
            + "<br>金币 " + Number(option.cost_gold || 0) + " · 木材 " + Number(option.cost_wood || 0)
            + " · 人口 " + Number(option.population || 0)
            + "<br>训练时间 " + Number(option.train_duration || 0) + " 秒"
            + "<br>已训练 " + Number(option.count || 0) + " / " + (Number(option.max_count) > 0 ? option.max_count : "不限")
            + " · 队列中 " + Number(option.queued_count || 0)
            + "<br>" + escape(reason(option));
    }
    if (!valid(panel) || !valid(markers)) return;
    panel.RemoveAndDeleteChildren(); markers.RemoveAndDeleteChildren();
    panel.visible = false;
    var title = label(panel, "ProductionTitle", "ProductionTitle");
    var badge = label(panel, "ProductionMode", "ProductionMode");
    function workerName(job) {
        var name = String(job && (job.display_name || job.name) || "伐木工");
        return name.replace(/\s*LV\.?\s*\d+$/i, "") + "LV" + Number(job && job.level || 1);
    }
    function workerIcon(job) {
        var level = Math.max(1, Math.min(8, Number(job && job.level || 1)));
        var id = String(job && job.training_id || ("train_lumberjack_0" + level));
        return "file://{images}/spellicons/survival/native/" + id + ".png";
    }
    var currentWorkerIcon = create("Image", panel, "ProductionCurrentWorkerIcon", "ProductionCurrentIcon");
    var currentIcon = create("DOTAAbilityImage", panel, "ProductionCurrentIcon", "ProductionCurrentIcon");
    currentIcon.abilityname = "ability_train_lumberjack";
    var jobName = label(panel, "ProductionJobName", "ProductionJobName");
    var remaining = label(panel, "ProductionRemaining", "ProductionRemaining");
    var track = create("Panel", panel, "ProductionProgressTrack", "ProductionProgressTrack");
    var fill = create("Panel", track, "ProductionProgressFill", "ProductionProgressFill");
    var queue = label(panel, "ProductionQueue", "ProductionQueue");
    var footer = label(panel, "ProductionFooter", "ProductionFooter");
    fullTextTooltip(jobName); fullTextTooltip(footer);
    for (var queueIndex = 0; queueIndex < 6; queueIndex++) {
        var queueCell = create("Panel", panel, "ProductionQueueSlot" + queueIndex, "ProductionQueueSlot");
        queueCell.icon = create("DOTAAbilityImage", queueCell, "", "ProductionQueueIcon");
        queueCell.workerIcon = create("Image", queueCell, "", "ProductionQueueIcon");
        queueCell.level = label(queueCell, "", "ProductionQueueLevel");
        queueCell.hittest = true;
        (function (cell) {
            cell.SetPanelEvent("onmouseover", function () {
                if (!cell.job) return;
                var task = cell.job;
                $.DispatchEvent("DOTAShowTextTooltip", cell,
                    escape(cell.research ? (task.display_name || task.name || "科技") + " LV" + Number(task.target_level || task.level || 1) : workerName(task))
                    + (cell.research ? "<br>等待研究 · 开始时扣费" : "<br>等待训练"));
            });
            cell.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip"); });
        })(queueCell);
        queueSlots.push(queueCell);
    }
    for (var index = 0; index < 4; index++) (function (slot) {
        var button = create("Button", panel, "ProductionTrainingSlot" + slot, "ProductionTrainingSlot");
        var icon = create("Image", button, "", "ProductionTrainingIcon");
        var level = label(button, "", "ProductionTrainingLevel");
        var count = label(button, "", "ProductionTrainingCount");
        var cost = label(button, "", "ProductionTrainingCost");
        var lock = label(button, "", "ProductionTrainingLock");
        var entry = { panel: button, icon: icon, level: level, count: count, cost: cost, lock: lock, option: null };
        button.SetPanelEvent("onactivate", function () {
            if (!active() || blocked() || !entry.option || selectedUnit() !== currentUnit) return;
            if (Number(entry.option.available) !== 1) { notify(reason(entry.option)); return; }
            GameEvents.SendCustomGameEventToServer("ui_worker_train_request", {
                request_id: requestId("train"), source_entindex: currentUnit, training_id: entry.option.training_id
            });
        });
        button.SetPanelEvent("onmouseover", function () {
            if (entry.option) $.DispatchEvent("DOTAShowTextTooltip", button, optionTooltip(entry.option));
        });
        button.SetPanelEvent("onmouseout", function () { $.DispatchEvent("DOTAHideTextTooltip"); });
        buttons.push(entry);
    })(index);
    function getResearchRuntime(ability, unit, publicRuntime) {
        var original = publicRuntime || {}, name = String(original.ability_name || "");
        try { if (!name && typeof Abilities !== "undefined") name = Abilities.GetAbilityName(Number(ability)) || ""; } catch (error) {}
        unit = Number(unit);
        if (!/^ability_research_/.test(name) || unit !== selectedUnit()
            || !/^building_(advanced_)?research_lab$/.test(unitType(unit))) return publicRuntime;
        var snapshot = snapshots[unit], research = snapshot && snapshot.research;
        var personal = research && research.abilities_by_name && research.abilities_by_name[name];
        var result = { ability_name: name, owner_entindex: unit,
            technology_group: original.technology_group, research_building_id: original.research_building_id,
            research_slot_order: original.research_slot_order };
        if (personal) Object.keys(personal).forEach(function (key) { result[key] = personal[key]; });
        else {
            result.research_upgrade = 1; result.available = 0; result.can_afford = 0;
            result.current_level = "—"; result.cost_gold = 0; result.cost_wood = 0;
            result.research_status_code = "syncing"; result.status_text = "正在同步科技信息";
            result.upgrade_description = "正在同步科技信息"; result.fields = [];
        }
        return result;
    }
    function toggleResearch(ability, unit) {
        if (!active() || blocked()) return false;
        var runtime = CustomNetTables.GetTableValue("survival_ability_runtime", String(ability)) || {};
        unit = Number(unit);
        // The runtime row belongs to the building owner. A shared advanced lab
        // may be used by another player whose level/auto state differs; group
        // metadata identifies the technology, and the server validates access.
        if (runtime.removed === 1 || !runtime.technology_group
            || unit !== selectedUnit() || !/^building_(advanced_)?research_lab$/.test(unitType(unit))) return false;
        if (runtime.owner_entindex !== undefined && Number(runtime.owner_entindex) !== unit) return false;
        GameEvents.SendCustomGameEventToServer("ui_shop_auto_research_toggle_request", {
            request_id: requestId("auto"), technology_group: runtime.technology_group, source_entindex: unit
        });
        return true;
    }
    function queueResearch(ability, unit) {
        if (!active() || blocked()) return false;
        var runtime = CustomNetTables.GetTableValue("survival_ability_runtime", String(ability)) || {};
        unit = Number(unit);
        if (runtime.removed === 1 || !runtime.technology_group || unit !== selectedUnit()
            || !/^building_(advanced_)?research_lab$/.test(unitType(unit))) return false;
        if (runtime.owner_entindex !== undefined && Number(runtime.owner_entindex) !== unit) return false;
        // Availability on an owner runtime may mean "already researching" or a
        // different player's max level. Queue admission is checked by the server.
        GameEvents.SendCustomGameEventToServer("ui_research_queue_request", {
            request_id: requestId("research"), technology_group: runtime.technology_group, source_entindex: unit
        });
        return true;
    }
    function researchAbility(job, research) {
        if (job && job.ability_name) return String(job.ability_name);
        var group = job && (job.technology_group || job.research_group || job.group);
        var byName = research && research.abilities_by_name || {};
        var names = Object.keys(byName);
        for (var index = 0; index < names.length; index++) {
            if (String(byName[names[index]].technology_group || "") === String(group || "")) return names[index];
        }
        return String(job && job.icon_name || "");
    }
    function renderQueue(pending, capacity, research) {
        place(queue, 16, 172, 122, 36);
        text(queue, "等待 " + pending.length + "/" + Math.max(0, Number(capacity || 7) - 1));
        queueSlots.forEach(function (cell, index) {
            // Six waiting cells fit the minimum panel width without shrinking their labels.
            cell.visible = true; place(cell, 146 + 64 * index, 160, 58, 58);
            var entry = pending[index];
            cell.job = entry || null; cell.research = !!research;
            cell.SetHasClass("Empty", !entry); cell.icon.visible = !!entry && !!research;
            cell.workerIcon.visible = !!entry && !research;
            if (entry && research) cell.icon.abilityname = researchAbility(entry, research);
            if (entry && !research) cell.workerIcon.SetImage(workerIcon(entry));
            text(cell.level, entry ? "LV" + Number(entry.target_level || entry.level || 1) : "·");
        });
    }
    function updateMarkers(g, entries, visible) {
        var total = entries.length;
        for (var index = 0; index < Math.max(total, autoMarkers.length); index++) {
            var entry = entries[index], runtime = entry && visible
                ? CustomNetTables.GetTableValue("survival_ability_runtime", String(entry.ability)) || {} : {};
            var ownResearch = snapshots[currentUnit] && snapshots[currentUnit].research;
            var ownAuto = ownResearch && ownResearch.auto_research || {};
            var enabled = !!(entry && visible && /^ability_research_/.test(entry.name || "")
                && Number(ownAuto[runtime.technology_group]) === 1);
            var marker = autoMarkers[index];
            if (enabled && !valid(marker)) {
                marker = create("Panel", markers, "ProductionResearchAuto" + index, "ProductionResearchAuto");
                marker.tag = label(marker, "", "ProductionResearchAutoLabel"); marker.tag.text = "自动";
                autoMarkers[index] = marker;
            }
            if (!valid(marker)) continue;
            marker.visible = enabled;
            if (!enabled) continue;
            place(marker, g.x + (g.heroWidth + 10 + 120 * index) * g.scale,
                g.y + 61 * g.scale, 116 * g.scale, 116 * g.scale);
            style(marker.tag, { fontSize: Math.max(10, Math.round(23 * g.scale)) + "px" });
        }
    }
    function refresh(g, unit, ready, entries) {
        if (!active()) return 0;
        lastGeometry = g; lastReady = !!ready; lastEntries = entries || [];
        unit = Number(unit);
        if (unit !== currentUnit) {
            currentUnit = unit; status = "";
            $.DispatchEvent("DOTAHideTextTooltip");
            if (relevant(unit)) GameEvents.SendCustomGameEventToServer("ui_selected_unit_stats_request", { entindex: unit });
        }
        var snapshot = snapshots[unit] || {}, training = snapshot.training, research = snapshot.research;
        var showTraining = unitType(unit) === "building_main_city" && training && training.options;
        var showResearch = /^building_(advanced_)?research_lab$/.test(unitType(unit)) && research;
        var show = !!(ready && g && (showTraining || showResearch));
        panel.visible = show;
        updateMarkers(g, lastEntries, !!(ready && g && showResearch));
        if (!show) return 0;
        // Dense research ability rows shrink the native HUD. Keep production
        // text legible while aligning this attachment's right edge to that row.
        var panelScale = Math.max(g.scale, 0.5) * 1.15;
        var width = Math.max(600, Math.min(800, (g.centerWidth - 20) * g.scale / panelScale));
        var height = showTraining ? 426 : 270;
        var rightEdge = g.x + (g.heroWidth + g.centerWidth - 10) * g.scale;
        place(panel, rightEdge - width * panelScale,
            g.y - height * panelScale - 8, width, height);
        style(panel, { transform: "scale3d(" + panelScale + "," + panelScale + ",1)", transformOrigin: "0% 0%" });
        // Layout measurements omit our CSS transform. World-overlay occlusion
        // consumes physical window pixels, matching GetPositionWithinWindow().
        panel.__survivalWindowWidth = width * panelScale * (Number(ctx.actualuiscale_x) || 1);
        panel.__survivalWindowHeight = height * panelScale * (Number(ctx.actualuiscale_y) || 1);
        place(title, 16, 8, width - 182, 44); place(badge, width - 166, 13, 150, 36);
        currentIcon.visible = false;
        currentWorkerIcon.visible = !!showTraining;
        place(currentWorkerIcon, 16, 66, 50, 50);
        place(currentIcon, 16, 66, 50, 50);
        place(jobName, 76, 52, width - 192, 82);
        place(remaining, width - 108, 67, 92, 44);
        place(track, 16, 139, width - 32, 13);
        place(footer, 16, height - 42, width - 32, 36);
        text(title, showTraining ? "伐木工训练" : unitType(unit) === "building_advanced_research_lab" ? "高级科技研究" : "科技研究");
        var now = gameTime(), job, blockedJob = null, waitUntil = 0, autoEnabled = false;
        if (showTraining) {
            var options = rows(training.options), byId = {};
            options.forEach(function (option) { byId[option.training_id] = option; });
            citySlots[unit] = trainingSlots(options);
            job = training.active_job && training.active_job.training_id ? training.active_job : null;
            currentWorkerIcon.SetImage(workerIcon(job || byId[citySlots[unit][0]]));
            renderQueue(rows(training.queued), training.queue_capacity, null);
            var cellWidth = (width - 56) / 4;
            buttons.forEach(function (button, slot) {
                var option = byId[citySlots[unit][slot]];
                button.option = option || null; button.panel.visible = !!option;
                if (!option) return;
                button.icon.SetImage(workerIcon(option));
                place(button.panel, 16 + slot * (cellWidth + 8), 228, cellWidth, 150);
                place(button.count, 8, 54, cellWidth - 16, 32);
                place(button.cost, 8, 86, cellWidth - 16, 32);
                place(button.lock, 8, 118, cellWidth - 16, 30);
                button.panel.SetHasClass("Unavailable", Number(option.available) !== 1);
                text(button.level, "LV" + Number(option.level || 1));
                text(button.count, Number(option.count || 0) + "/" + (Number(option.max_count) > 0 ? option.max_count : "∞")
                    + (Number(option.queued_count) > 0 ? " +" + option.queued_count : ""));
                text(button.cost, "木 " + formatResource(option.cost_wood));
                text(button.lock, Number(option.available) === 1 ? "训练"
                    : option.reason === "training_city_level_required" ? "锁定" : "未就绪");
            });
            text(badge, job ? "训练中" : "空闲");
            text(footer, status && now < statusUntil ? status : "点击训练 · 满额后自动显示后续等级");
        } else {
            buttons.forEach(function (button) { button.panel.visible = false; button.option = null; });
            job = Number(research.researching) === 1 ? research : null;
            blockedJob = !job && research.blocked_head && research.blocked_head.technology_group ? research.blocked_head : null;
            renderQueue(rows(research.queued), research.queue_capacity || research.capacity, research);
            currentIcon.visible = !!(job || blockedJob);
            if (job || blockedJob) currentIcon.abilityname = researchAbility(job || blockedJob, research);
            waitUntil = Number(research.next_start_at || 0);
            autoEnabled = Number(research.auto_enabled) === 1 || Object.keys(research.auto_research || {}).some(function (key) {
                return Number(research.auto_research[key]) === 1;
            });
            text(badge, autoEnabled ? "自动研究" : "手动研究");
            var blockedText = blockedJob ? reason({reason: research.blocked_reason || "等待资源或前置条件"}) : "";
            if (blockedText && blockedText.indexOf("扣费") < 0) blockedText += " · 开始时扣费";
            text(footer, status && now < statusUntil ? status
                : blockedJob ? blockedText
                : autoEnabled ? "自动：完成后间隔 1 秒 · 右键关闭" : "左键加入队列 · 右键自动研究");
        }
        badge.SetHasClass("Automatic", autoEnabled);
        if (job) {
            var clock = progress(job, now);
            text(jobName, (showTraining ? "正在训练：伐木工" : "正在研究：" + (job.display_name || job.name || "科技"))
                + " LV" + Number(job.level || job.target_level || 1));
            text(remaining, clock.remaining > 0 ? Math.ceil(clock.remaining) + "s" : "完成中");
            style(fill, { width: (clock.fraction * 100).toFixed(1) + "%" });
        } else if (blockedJob) {
            text(jobName, "等待研究：" + (blockedJob.display_name || "科技") + " LV" + Number(blockedJob.target_level || 1));
            text(remaining, "等待"); style(fill, { width: "0%" });
        } else if (autoEnabled && waitUntil > now) {
            text(jobName, "下一次自动研究"); text(remaining, Math.ceil(waitUntil - now) + "s");
            style(fill, { width: "0%" });
        } else {
            text(jobName, showTraining ? "选择伐木工等级加入队列" : autoEnabled ? "自动待命 · 等待资源或前置条件" : "请选择要研究的科技");
            text(remaining, ""); style(fill, { width: "0%" });
        }
        return height * panelScale / g.scale + 8 / g.scale;
    }
    function repaint() { refresh(lastGeometry, selectedUnit(), lastReady, lastEntries); }
    GameEvents.Subscribe("ui_selected_unit_stats_snapshot", function (snapshot) {
        if (!active() || !snapshot || Number(snapshot.success) !== 1) return;
        if (snapshot.player_id !== undefined && Number(snapshot.player_id) !== Number(Game.GetLocalPlayerID())) return;
        var unit = Number(snapshot.entindex);
        if (!isFinite(unit) || unit < 0) return;
        // Ignore an older coalesced response without discarding the new snapshot.
        var prior = snapshots[unit];
        if (prior && Number(snapshot.refresh_sequence) > 0 && Number(prior.refresh_sequence) > Number(snapshot.refresh_sequence)) return;
        // Combat-stat-only pushes share this event. They must not erase the
        // independent production snapshot between authoritative queue updates.
        if (prior) {
            if (snapshot.training === undefined) snapshot.training = prior.training;
            if (snapshot.research === undefined) snapshot.research = prior.research;
        }
        snapshots[unit] = snapshot;
        if (unit === selectedUnit()) repaint();
    });
    GameEvents.Subscribe("dota_player_update_selected_unit", function (payload) {
        if (!active()) return;
        var pid = payload && (payload.PlayerID !== undefined ? payload.PlayerID : payload.player_id !== undefined ? payload.player_id : payload.playerid);
        if (pid !== undefined && Number(pid) !== Number(Game.GetLocalPlayerID())) return;
        $.Schedule(0, function () {
            if (!active()) return;
            repaint();
        });
    });
    GameEvents.Subscribe("ui_operation_result", function (result) {
        if (!active() || !result || (result.operation !== "worker_train" && result.operation !== "shop_auto_research_toggle" && result.operation !== "research_queue")) return;
        if (String(result.request_id || "").indexOf("production_") !== 0) return;
        if (Number(result.success) !== 1) notify(result.error || result.message || "操作未完成");
        repaint();
    });
    cfg.SurvivalProductionHUD = {
        Refresh: refresh, QueueResearch: queueResearch, ToggleResearch: toggleResearch, GetResearchRuntime: getResearchRuntime,
        Inspect: function () { return { unit: currentUnit, visible: panel.visible, slots: citySlots[currentUnit] || [], snapshot: snapshots[currentUnit] || {} }; }
    };
})();