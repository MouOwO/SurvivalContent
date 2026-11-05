// Display adapter over the existing authoritative personal HUD resource stream.
// Build price indexes only for a new structural snapshot: O(E log E), O(E) RAM.
// A wallet update visits O(log E + K) threshold crossings; idle does no work.
(function (factory) {
    "use strict";
    var api = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = api;
    if (typeof GameUI !== "undefined" && GameUI.CustomUIConfig) {
        GameUI.CustomUIConfig().SurvivalShopWalletModel = api;
    }
}(function () {
    "use strict";
    var MAX = 9007199254740991;
    function amount(value) {
        return typeof value === "number" && isFinite(value) && value >= 0 && value <= MAX;
    }
    function create() {
        var entries = Object.create(null), keys = Object.create(null), wood = [], gold = [], funds = null;
        var metrics = {builds:0,indexed_entries:0,patches:0,patched_entries:0,index_edits:0,updates:0,stable:0,binary_steps:0,candidates:0,entry_checks:0,entry_changes:0};
        function order(a,b) { return a.cost-b.cost || (a.id<b.id?-1:a.id>b.id?1:0); }
        function priceKey(entry) {
            return {wood:Number(entry.wood_cost||0),gold:Number(entry.gold_cost||0),check:entry.resource_check_on_cast!==1};
        }
        function indexEdit(index,row,remove) {
            var low=0,high=index.length;
            while(low<high){var middle=Math.floor((low+high)/2);if(order(index[middle],row)<0)low=middle+1;else high=middle;}
            if(remove){if(low<index.length&&order(index[low],row)===0)index.splice(low,1);}
            else index.splice(low,0,row);
            metrics.index_edits++;
        }
        function validEntry(entry) {
            return entry&&typeof entry.entry_id==="string"&&(entry.wallet_purchasable===0||entry.wallet_purchasable===1);
        }
        function upperBound(index, value) {
            var low = 0, high = index.length;
            while (low < high) {
                metrics.binary_steps++;
                var middle = Math.floor((low + high) / 2);
                if (index[middle].cost <= value) low = middle + 1; else high = middle;
            }
            return low;
        }
        function project(entry) {
            metrics.entry_checks++;
            var available = entry.wallet_purchasable === 1, reason = entry.wallet_disabled_reason || "";
            var code = entry.wallet_disabled_reason_code || "";
            // Queued research intentionally validates its charge when the job
            // starts. This adapter preserves that existing presentation rule.
            if (available && entry.resource_check_on_cast !== 1 && funds) {
                if (funds.wood < Number(entry.wood_cost || 0)) {
                    available = false; reason = "木材不足"; code = "insufficient_wood";
                } else if (funds.gold < Number(entry.gold_cost || 0)) {
                    available = false; reason = "金币不足"; code = "insufficient_gold";
                }
            } else if (available && entry.resource_check_on_cast !== 1 && !funds) {
                available = false; reason = "资源信息尚未就绪"; code = "resources_unknown";
            }
            var value = available ? 1 : 0;
            var changed = entry.purchasable !== value || entry.disabled_reason !== reason || entry.disabled_reason_code !== code;
            if (changed) {
                entry.purchasable = value; entry.disabled_reason = reason; entry.disabled_reason_code = code;
                metrics.entry_changes++;
            }
            return changed;
        }
        function rebuild(rows) {
            entries = Object.create(null); keys = Object.create(null); wood = []; gold = []; metrics.builds++;
            var changed = [];
            rows.forEach(function (entry) {
                if (!validEntry(entry)) return;
                if (!amount(Number(entry.wood_cost || 0)) || !amount(Number(entry.gold_cost || 0))) {
                    throw new Error("shop_wallet_price_invalid");
                }
                entries[entry.entry_id] = entry; metrics.indexed_entries++;
                keys[entry.entry_id] = priceKey(entry);
                if (project(entry)) changed.push(entry);
                // Eligibility can change without changing index membership.
                if (entry.resource_check_on_cast !== 1) {
                    wood.push({cost:Number(entry.wood_cost || 0),id:entry.entry_id});
                    gold.push({cost:Number(entry.gold_cost || 0),id:entry.entry_id});
                }
            });
            wood.sort(order); gold.sort(order);
            return changed;
        }
        function patch(rows,removed) {
            metrics.patches++;var changed=[];
            function remove(id){var old=keys[id];if(!old)return;
                if(old.check){indexEdit(wood,{id:id,cost:old.wood},true);indexEdit(gold,{id:id,cost:old.gold},true);}
                delete entries[id];delete keys[id];}
            (removed||[]).forEach(remove);
            rows.forEach(function(entry){
                if(!validEntry(entry)){if(entry&&entry.entry_id)remove(entry.entry_id);return;}
                var id=entry.entry_id,next=priceKey(entry),old=keys[id];metrics.patched_entries++;
                if(!amount(next.wood)||!amount(next.gold))throw new Error("shop_wallet_price_invalid");
                // Old keys are independent scalars: callers may mutate the row
                // in place before notifying us. Same-key deltas touch only K
                // refs. Actual price/member changes use O(E) array splices,
                // never a full re-sort; immutable full snapshots build once.
                if(!old||old.wood!==next.wood||old.gold!==next.gold||old.check!==next.check){
                    remove(id);
                    if(next.check){indexEdit(wood,{id:id,cost:next.wood},false);indexEdit(gold,{id:id,cost:next.gold},false);}
                }
                entries[id]=entry;keys[id]=next;if(project(entry))changed.push(entry);
            });
            return changed;
        }
        function update(resources) {
            metrics.updates++;
            if (!resources || !amount(resources.wood) || !amount(resources.gold)) {
                return {known:false,resource_changed:false,entries:[]};
            }
            if (funds && funds.wood === resources.wood && funds.gold === resources.gold) {
                metrics.stable++; return {known:true,resource_changed:false,entries:[]};
            }
            var previous = funds, changed = [], candidates = Object.create(null), ids = [];
            funds = {wood:resources.wood,gold:resources.gold};
            function visit(index, before, after) {
                if (before === after) return;
                var start = upperBound(index, Math.min(before, after)), end = upperBound(index, Math.max(before, after));
                for (var n=start;n<end;n++) {
                    metrics.candidates++;
                    var id=index[n].id;
                    if (!candidates[id]) { candidates[id]=true; ids.push(id); }
                }
            }
            if (!previous) {
                // Only the first known wallet can initialize all pending rows.
                ids = Object.keys(entries);
            } else {
                visit(wood, previous.wood, funds.wood); visit(gold, previous.gold, funds.gold);
            }
            ids.forEach(function (id) { if (project(entries[id])) changed.push(entries[id]); });
            return {known:true,resource_changed:true,entries:changed};
        }
        function reset() { entries=Object.create(null); keys=Object.create(null); wood=[]; gold=[]; funds=null; }
        function inspect() {
            var result={};Object.keys(metrics).forEach(function(k){result[k]=metrics[k];});
            return result;
        }
        return {Rebuild:rebuild,Patch:patch,Update:update,Reset:reset,Inspect:inspect};
    }
// UI lifetime/handshake adapter. No timers, HTTP or business intents.
    function connect(options) {
        var cfg=options.config, model=create(), source=null, subscription=null;
        var generation=0, current=null, resources=null, initialized=false;
        function close() {
            generation++;
            if(source&&subscription!==null)source.Unsubscribe(subscription);
            subscription=null;source=null;current=null;resources=null;initialized=false;model.Reset();
        }
        function requestFlag() {
            var next=cfg.SurvivalCompactHUDSource, runtime=cfg.SurvivalCompactRuntime;
            var scope=runtime&&runtime.ScopeIdentity&&runtime.ScopeIdentity();
            if(!next||!next.IsAlive||!next.IsAlive()||next.Runtime!==runtime
                ||!scope||!scope.active||!scope.ready) { close(); return 0; }
            if(source===next&&subscription!==null)return 1;
            close();source=next;var own=++generation;
            subscription=source.Subscribe(options.owner,["resources"],function(snapshot){
                if(own!==generation||source!==next||cfg.SurvivalCompactHUDSource!==next||!next.IsAlive())return;
                var value=snapshot&&snapshot.resources, result=model.Update(value);
                if(!result.known)return;
                resources=value;
                if(current&&current.hud_wallet===1&&result.resource_changed){
                    current.resources=value;options.onChange(current,result.entries);
                }
            });
            return 1;
        }
        function apply(snapshot,rows,delta) {
            current=snapshot;
            if(!snapshot||snapshot.hud_wallet!==1){model.Reset();initialized=false;return;}
            if(resources)model.Update(resources);else model.Update(snapshot.resources);
            if(delta&&initialized)model.Patch(delta.changed,delta.removed);
            else{model.Rebuild(rows);initialized=true;}
            if(resources)snapshot.resources=resources;
        }
        return {RequestFlag:requestFlag,Apply:apply,Close:close,Inspect:model.Inspect};
    }
    return {Create:create,Connect:connect};
}));
