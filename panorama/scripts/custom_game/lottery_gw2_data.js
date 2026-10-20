// Current lottery assets; retired window and button skins are not registered.
(function(){GameUI.CustomUIConfig().LotteryGW2Data={"version":2,"canvas":[1672,941],"assets":{"final_header_rule":{"file":"file://{images}/custom_game/lottery_final_v1/header_rule.png","size":[1608,6]},"final_sidebar_rule":{"file":"file://{images}/custom_game/lottery_final_v1/sidebar_rule.png","size":[5,746]},"final_footer_rule":{"file":"file://{images}/custom_game/lottery_final_v1/footer_rule.png","size":[1309,5]},"final_window_frame":{"file":"file://{images}/custom_game/lottery_final_v1/window_frame.png","size":[1620,838]},"final_header_back_divider":{"file":"file://{images}/custom_game/lottery_final_v1/header_back_divider.png","size":[5,46]},"final_back_arrow":{"file":"file://{images}/custom_game/lottery_final_v1/back_arrow.png","size":[17,31]},"final_close_frame":{"file":"file://{images}/custom_game/lottery_final_v1/close_frame.png","size":[51,53]},"final_close_cross":{"file":"file://{images}/custom_game/lottery_final_v1/close_cross.png","size":[37,37]},"final_footer_divider_1":{"file":"file://{images}/custom_game/lottery_final_v1/footer_divider_1.png","size":[10,27]},"final_footer_divider_2":{"file":"file://{images}/custom_game/lottery_final_v1/footer_divider_2.png","size":[11,27]},"final_skip_checkbox_frame":{"file":"file://{images}/custom_game/lottery_final_v1/skip_checkbox_frame.png","size":[38,38]}}};})();

// Display-only projection of the server's selected-pool snapshot.
// Percentages come exclusively from the published notice, never private weights.
(function () {
    "use strict";
    var data = GameUI.CustomUIConfig().LotteryGW2Data;
    var order = ["n","r","sr","ssr","ur"];
    function rows(value) {
        return Array.isArray(value) ? value : Object.keys(value || {}).sort(function (a,b) { return Number(a)-Number(b); }).map(function (key) { return value[key]; });
    }
    function quality(value) {
        var id = typeof value === "string" ? value.toLowerCase() : "";
        return order.indexOf(id) >= 0 ? id : "unknown";
    }
    function publishedPercents(pool) {
        var source = pool && pool.update_notice && pool.update_notice.single_draw_probabilities;
        if (typeof source !== "string" || !source.trim()) return {};
        var result = {}, token = /(SSR|SR|UR|N|R)\s*[:：]\s*(0|[1-9]\d*)(?:\.(\d+))?\s*%/g;
        var match, cursor = 0, found = false;
        while ((match = token.exec(source))) {
            // Reject partial matches, duplicate qualities and prose/weight data.
            if (source.slice(cursor,match.index).trim()) return {};
            var id = match[1].toLowerCase(), percent = Number(match[2] + (match[3] ? "." + match[3] : ""));
            if (Object.prototype.hasOwnProperty.call(result,id) || !isFinite(percent) || percent < 0 || percent > 100) return {};
            result[id] = percent;
            cursor = token.lastIndex;
            found = true;
        }
        return found && !source.slice(cursor).trim() ? result : {};
    }
    function groups(items,pool) {
        var probabilities = publishedPercents(pool), all = {};
        order.concat(["unknown"]).forEach(function (id) {
            all[id] = {id:id,quality:id,label:id === "unknown" ? "其他品质" : id.toUpperCase(),count:0,items:[]};
            if (Object.prototype.hasOwnProperty.call(probabilities,id)) all[id].percent = probabilities[id];
        });
        rows(items).forEach(function (item) {
            if (!item || typeof item !== "object") return;
            var group = all[quality(item.quality)];
            group.items.push(item);
            group.count++;
        });
        return order.concat(["unknown"]).filter(function (id) { return all[id].count > 0; }).map(function (id) { return all[id]; });
    }
    function integer(raw,positive) {
        if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !raw.trim())) return null;
        var value = Number(raw);
        return isFinite(value) && Math.floor(value) === value && value >= (positive ? 1 : 0) ? value : null;
    }
    function quantity(item) {
        var owned = integer(item && item.owned_count,false);
        if (owned === null) return "—";
        var maximum = integer(item && item.max_owned,true);
        return String(owned) + (maximum === null ? "" : "/" + maximum);
    }
    function ruleText(pool) {
        if (!pool || pool.pity === undefined || pool.pity === null) return "保底规则待同步";
        var labels = [], ten = false;
        rows(pool.pity).forEach(function (rule) {
            if (!rule || rule.trigger_mode !== "batch_only") return;
            var size = integer(rule.batch_size,true), id = quality(rule.quality);
            if (size === null || id === "unknown") return;
            ten = ten || size === 10;
            var label = (size === 10 ? "十连" : size + "连") + "保底 " + id.toUpperCase();
            if (labels.indexOf(label) < 0) labels.push(label);
        });
        if (!labels.length) return "当前奖池无已公布的批量保底";
        return labels.join("；") + (ten ? "；仅直接十连触发，连续十次单抽不触发。" : "；仅一次对应连抽触发，连续单抽不触发。");
    }
    data.preview = {Groups:groups,Quantity:quantity,RuleText:ruleText};
}());
