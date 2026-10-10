(function () {
    var cfg = GameUI.CustomUIConfig(), context = $.GetContextPanel();
    var previous = cfg.SurvivalLumberjackFusionQueue;
    var generation = previous ? previous.generation + 1 : 1;
    var members = [], pending = null, rewriting = false, revision = 0, serial = 0, appliedOrder = "";
    var completedAbilities = {};
    var api = {generation: generation, Cast: cast, Decorate: decorate, ResolveFocus: resolveFocus};
    cfg.SurvivalLumberjackFusionQueue = api;
    function active() { return cfg.SurvivalLumberjackFusionQueue === api && context.IsValid(); }
    function ids(value) {
        var result = [];
        Object.keys(value || {}).forEach(function (key) {
            var id = Number(value[key]);
            if (id >= 0 && result.indexOf(id) < 0) result.push(id);
        });
        return result;
    }
    function selected() { return ids(Players.GetSelectedEntities(Game.GetLocalPlayerID())); }
    function valid(id) { return Entities.IsValidEntity(id) && Entities.IsAlive(id); }
    function worker(id) {
        var snapshot = CustomNetTables.GetTableValue('survival_combat_stats', String(id)) || {};
        var owner = snapshot.player_id !== undefined ? Number(snapshot.player_id) : Entities.GetPlayerOwnerID(id);
        return valid(id) && owner === Game.GetLocalPlayerID()
            && /^npc_survival_(?:super_)?lumberjack(?:_\d+)?$/.test(Entities.GetUnitName(id));
    }
    function info(id) {
        if (!worker(id)) return null;
        // GetAbilityCount is a count, not the last occupied slot. Fusion can
        // live in slot 1 after slot 0 has been removed. Probe the bounded
        // engine slots just as the HUD does, including holes.
        for (var i = 0; i < 32; i++) {
            var ability = Entities.GetAbility(id, i);
            if (ability === undefined || ability === null || ability < 0) continue;
            // The success event can arrive before ability removal replicates.
            if (Number(completedAbilities[id]) === Number(ability)) continue;
            var match = /^ability_fuse_lumberjack_(\d+)$/.exec(Abilities.GetAbilityName(ability));
            if (!match) continue;
            var runtime = CustomNetTables.GetTableValue('survival_ability_runtime', String(ability)) || {};
            return {id:id, ability:ability, level:Number(match[1]), count:Number(runtime.fusion_required_count) || 0, cityReady:runtime.fusion_city_ready !== 0};
        }
        return null;
    }
    function ordered(list) {
        var rows = [], counts = {};
        list.forEach(function (id) {
            var row = info(id);
            if (row) { rows.push(row); counts[row.level] = (counts[row.level] || 0) + 1; }
        });
        rows.forEach(function (row) { row.ready = row.count > 0 && counts[row.level] >= row.count && row.cityReady; });
        rows.sort(function (a,b) { return Number(b.ready)-Number(a.ready) || a.level-b.level || a.id-b.id; });
        return rows;
    }
    function decorate(ability, runtime) {
        if (!active() || !/^ability_fuse_lumberjack_\d+$/.test(Abilities.GetAbilityName(ability))) return runtime;
        var current = selected(), scope = current.length > 1 && current.every(worker);
        if (!scope && members.length && current.length && current.every(function(id){return members.indexOf(id)>=0;})) scope = true;
        if (!scope) return runtime;
        var row = info(Number(runtime.owner_entindex));
        if (!row) return runtime;
        var count = current.filter(function(id){var item=info(id);return item && item.level===row.level;}).length;
        var result = {};Object.keys(runtime).forEach(function(key){result[key]=runtime[key];});
        result.fusion_count = count;
        if (count < row.count || row.count <= 0) {
            result.available = 0;
            result.status_text = "所选同级普通伐木工不足：" + count + "/" + row.count;
        }
        result.fields = [
            {label:"所选合体材料",value:count+"/"+row.count+" 个普通LV"+row.level+"伐木工"},
            {label:"主城等级",value:(runtime.fusion_city_level||0)+"/"+(runtime.fusion_required_city_level||0)}
        ];
        return result;
    }
    function resolveFocus(list) {
        if (!active() || !members.length || !list.length || !list.every(worker)) return -1;
        if (!list.every(function(id){return members.indexOf(id)>=0;})) return -1;
        for(var i=0;i<members.length;i++) if(list.indexOf(members[i])>=0 && info(members[i])) return members[i];
        return -1;
    }
    function apply(list) {
        if (!list.length || !active()) return;
        var current = selected();
        var signature = list.join(',');
        if (current.join(',') === signature) { appliedOrder=signature; return; }
        // Native multiselect may impose its own portrait order. Do not keep
        // rewriting the same set; the resolver exposes the queue's first unit.
        if (appliedOrder===signature && current.length===list.length
            && current.every(function(id){return list.indexOf(id)>=0;})) return;
        appliedOrder=signature;
        rewriting = true;
        if (cfg.SurvivalSelectionResolver) cfg.SurvivalSelectionResolver.SetDisplayIdentityMode('selection');
        list.forEach(function (id,index) { GameUI.SelectUnit(id,index > 0); });
        rewriting = false;
    }
    function sync() {
        if (!active() || rewriting || pending) return;
        var raw = selected(), current = raw.filter(valid);
        if (!current.length || !current.every(worker)) { members = []; return; }
        // Keep a final incomplete group scoped after the preceding successful merge.
        var continuing = members.length && current.every(function (id) { return members.indexOf(id) >= 0; });
        if (raw.length < 2 && !continuing) { members = []; return; }
        var rows = ordered(current);
        members = rows.map(function (row) { return row.id; });
        apply(members);
    }
    function changed() {
        if (!active() || rewriting) return;
        var ticket = ++revision;
        $.Schedule(0.05,function () {
            if (!active() || ticket !== revision) return;
            if (pending) {
                var current = selected();
                // Native deaths may shrink the selection. A deliberate selection of
                // another unit must never be replaced when the response arrives.
                if (!current.length || current.some(function (id) { return pending.members.indexOf(id) < 0; })) {
                    pending.cancelled = true;
                    members = [];
                }
                return;
            }
            sync();
        });
    }
    function cast(ability, unit) {
        if (!active() || !/^ability_fuse_lumberjack_\d+$/.test(Abilities.GetAbilityName(ability))) return false;
        if (pending) return true;
        sync();
        if (!members.length) {
            // Never fall back to an unscoped cast for a selected worker group
            // while its recipe/ability metadata is still arriving.
            var current = selected();
            return current.length > 1 && current.every(worker);
        }
        var rows = ordered(members), focus = rows[0];
        if (!focus) return true;
        // Wait for authoritative recipe metadata before choosing a level.
        if (!focus.ready) return true;
        members = rows.map(function (row) { return row.id; });
        apply(members);
        var request = {id:'fusion:' + generation + ':' + (++serial), members:members.slice(), unit:focus.id, ability:focus.ability};
        pending = request;
        GameEvents.SendCustomGameEventToServer('ui_ability_cast_request', {
            entindex:focus.id, ability_entindex:focus.ability,
            selected_entindexes:members.slice(), fusion_queue_request_id:request.id
        });
        $.Schedule(8,function () {
            if (!active() || pending !== request) return;
            pending = null;
            sync();
        });
        return true;
    }
    function result(payload) {
        if (!active()) return;
        var request = pending;
        if (!request) {
            // Also repair the actual selection for a successful ordinary UI
            // cast (e.g. an input path which did not attach a queue token).
            // A late response must not steal a different selection.
            var current = selected(), target = Number(payload.fusion_target_entindex);
            if (payload.fusion_queue_request_id || Number(payload.success) !== 1
                || !/^ability_fuse_lumberjack_\d+$/.test(payload.ability_name || "")
                || current.length < 2 || current.indexOf(target) < 0
                || !current.filter(valid).every(worker)) return;
            request = {members:current, unit:Number(payload.entindex), ability:Number(payload.ability_entindex)};
        }
        if (payload.fusion_queue_request_id !== request.id) {
            if (payload.fusion_queue_request_id || Number(payload.entindex) !== request.unit
                || Number(payload.ability_entindex) !== request.ability) return;
        }
        pending = null;
        ++revision;
        var consumed = ids(payload.fusion_consumed_entindexes);
        if(Number(payload.success)===1 && consumed.length){
            completedAbilities[Number(payload.fusion_target_entindex)]=Number(payload.ability_entindex);
        }
        var current=selected();
        // Missing materials are normal even when the engine has not replicated
        // IsAlive yet. Missing surviving workers indicate a deliberate subset selection.
        var removedSurvivor=request.members.some(function(id){return consumed.indexOf(id)<0 && info(id) && current.indexOf(id)<0;});
        if (request.cancelled || removedSurvivor || current.some(function (id) { return request.members.indexOf(id) < 0; })) { members = []; sync(); return; }
        if (Number(payload.success) !== 1) { members = request.members; apply(members.filter(valid)); return; }
        if (!consumed.length) { members = []; sync(); return; }
        completedAbilities[Number(payload.fusion_target_entindex)] = Number(payload.ability_entindex);
        members = request.members.filter(function (id) { return consumed.indexOf(id) < 0 && valid(id); });
        members = ordered(members).map(function (row) { return row.id; });
        if (members.length) apply(members);
        else {
            var target = Number(payload.fusion_target_entindex);
            if (valid(target)) apply([target]);
        }
    }
    function committed(payload){
        if(!active())return;
        var target=Number(payload.target_entindex),consumed=ids(payload.consumed_entindexes);
        if(target<0 || consumed.indexOf(target)<0)return;
        var oldRecipe=info(target);
        if(oldRecipe)completedAbilities[target]=oldRecipe.ability;
        if(pending && pending.unit===target){
            result({success:1,entindex:target,ability_entindex:pending.ability,
                fusion_queue_request_id:pending.id,fusion_consumed_entindexes:consumed,fusion_target_entindex:target});
            return;
        }
        var current=selected();
        if(current.length<2 || current.indexOf(target)<0 || !current.filter(valid).every(worker))return;
        members=ordered(current.filter(function(id){return consumed.indexOf(id)<0 && valid(id);})).map(function(row){return row.id;});
        ++revision;
        if(members.length)apply(members);
        else if(valid(target))apply([target]);
    }
    GameEvents.Subscribe('survival_lumberjack_fused', committed);
    GameEvents.Subscribe('dota_player_update_selected_unit', changed);
    GameEvents.Subscribe('ui_ability_cast_result', result);
    CustomNetTables.SubscribeNetTableListener('survival_ability_runtime', function () { if (!pending) changed(); });
    changed();
})();
