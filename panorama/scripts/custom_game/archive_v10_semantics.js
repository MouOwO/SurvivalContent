(function () {
    "use strict";
    // Presentation only. Values come from the existing authoritative snapshots
    // and the generated project catalog; this module never edits a save.
    var cfg = GameUI.CustomUIConfig();
    var achievements = ["clear", "endless", "boss", "map_level", "gift", "starjoy_points"];
    function list(value) {
        if (Array.isArray(value)) return value;
        return Object.keys(value || {}).sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (key) { return value[key]; });
    }
    function number(value) {
        if (value === undefined || value === null || typeof value === "boolean" || String(value).trim() === "") return null;
        var result = Number(value);
        return isFinite(result) && result >= 0 ? result : null;
    }
    function known(item, field) {
        field = field || "count";
        if (field === "count" && item.count_known !== undefined && Number(item.count_known) !== 1) return false;
        if (field === "count" && Number(item.quantity_unknown) === 1) return false;
        return number(item[field]) !== null;
    }
    function count(item) { return known(item) ? String(item.count) : "—"; }
    function cap(item) {
        var value = item.max_owned !== undefined ? item.max_owned : item.target;
        return number(value) !== null && Number(value) > 0 ? String(value) : null;
    }
    function isUnlockItem(item, category) { return category === "points"; }
    function level(item) {
        if (item.level !== undefined) return number(item.level);
        return known(item) ? number(item.count) : null;
    }
    function state(item, category) {
        item = item || {};
        // Holding an item activates it at one, independent of its holding cap.
        // Unknown inventory is never presented as a locked zero.
        if (category === "shadow" || category === "commerce_goods") return known(item) ? Number(item.count) > 0 : null;
        if (achievements.indexOf(category) >= 0) {
            if (item.unlocked !== undefined) return Number(item.unlocked) === 1;
            if (item.completed !== undefined) return Number(item.completed) === 1;
            return null;
        }
        if (category === "building" || category === "work" || category === "fragment") {
            if (item.unlocked !== undefined) return Number(item.unlocked) === 1;
            if (item.activated !== undefined) return Number(item.activated) === 1;
            var current = level(item);
            return current === null ? null : current > 0;
        }
        if (category === "titles" && item.unlocked !== undefined) return Number(item.unlocked) === 1;
        if (!known(item)) return null;
        if (item.unlocked !== undefined) return Number(item.unlocked) === 1;
        return Number(item.count) > 0;
    }
    function quantity(item, category) {
        item = item || {};
        if (isUnlockItem(item, category)) {
            var unlocked = state(item, category);
            return unlocked === null ? "状态待同步" : unlocked ? "已解锁" : "未解锁";
        }
        if (category === "titles") return "";
        if (category === "map_level") {
            var current = number(item.__v10CurrentLevel), target = number(item.__v10TargetLevel);
            return "LV" + (current === null ? "—" : current) + (target !== null && target > 0 ? "/" + target : "");
        }
        if (category === "work" || category === "building") {
            var currentLevel = level(item), maximum = number(item.target);
            // Existing one-time welfare stays a 0/1 activation, not an invented
            // multi-level upgrade. The independent State still handles activation.
            var prefix = category === "work" && maximum === 1 ? "" : "LV";
            return prefix + (currentLevel === null ? "—" : currentLevel)
                + (maximum !== null && maximum > 0 ? "/" + maximum : "");
        }
        var denominator = cap(item);
        return count(item) + (denominator === null ? "" : "/" + denominator);
    }
    function progress(item, category) {
        item = item || {};
        if (isUnlockItem(item, category)) return { known: state(item, category) !== null,
            ratio: null, current: null, target: null, text: quantity(item, category) };
        if (category === "titles") {
            var titleState = state(item, category);
            return { known: titleState !== null, ratio: null, current: null, target: null,
                text: titleState === null ? "状态待同步" : titleState
                    ? (Number(item.equipped) === 1 ? "已穿戴" : "已解锁") : "未解锁" };
        }
        var current, target, text = quantity(item, category);
        if (category === "map_level") {
            current = number(item.__v10CurrentLevel);
            target = number(item.__v10TargetLevel);
        } else if (category === "work" || category === "building") {
            current = level(item);
            target = number(item.target);
        } else {
            current = known(item) ? number(item.count) : null;
            target = category === "fragment" ? number(item.target) : number(cap(item));
            if (category === "fragment") text = count(item) + (target !== null && target > 0 ? "/" + target : "");
        }
        // A known current value need not have a cap. Only a real positive target
        // permits a fill; keeping null distinct from zero prevents invented goals.
        if (target === null || target <= 0) target = null;
        return { known: current !== null,
            ratio: current !== null && target !== null ? Math.max(0, Math.min(1, current / target)) : null,
            current: current, target: target, text: text };
    }
    function metric(item, category) {
        item = item || {};
        if (isUnlockItem(item, category)) return "解锁状态";
        if (category === "clear") return "累计通关次数";
        if (category === "boss") return "进攻BOSS击杀次数";
        if (category === "endless") return item.progress_kind === "wave" ? "历史最高通关层数" : "累计无尽积分";
        if (category === "map_level") return "地图等级";
        if (category === "gift") return item.progress_kind === "cooperative" ? "组队累计胜利次数" : "累计胜利次数";
        if (category === "starjoy_points") return "累计获得星悦积分";
        if (category === "building") return "建筑等级";
        if (category === "work") return "福利等级";
        if (category === "fragment") return "持有碎片";
        if (category === "titles") return "称号状态";
        return "拥有数量";
    }
    function normalize(data, category) {
        var rows = list(data && data.rows).filter(function (row) { return !!row; })
            .map(function (row) { return Object.assign({}, row); });
        if (category === "map_level") {
            var currentLevel = number(data && data.online && data.online.level);
            rows.forEach(function (row) {
                row.__v10CurrentLevel = currentLevel;
                // Server rune is the formally configured milestone level. Its
                // count/target are minutes and stay intact for the existing detail.
                row.__v10TargetLevel = number(row.milestone_level !== undefined ? row.milestone_level : row.rune);
            });
        }
        if (category === "commerce_goods") {
            rows.forEach(function (item) {
                item.count_known=known(item)?1:0;
                if (item.count_known===1) { item.count=Number(item.count); item.unlocked=item.count>0?1:0; }
                else { delete item.count; delete item.unlocked; delete item.completed; }
            });
            return rows;
        }
        if (category === "points") {
            rows.forEach(function (item) {
                var unlocked = state(item, category);
                // Every points entry, including older daily reward snapshots,
                // is one unlock. Normalize a view copy without editing the save.
                item.max_owned = 1; item.target = 1;
                item.count_known = unlocked === null ? 0 : 1;
                if (unlocked !== null) { item.count = unlocked ? 1 : 0; item.unlocked = unlocked ? 1 : 0; }
                else { delete item.count; delete item.unlocked; delete item.completed; }
            });
            return rows;
        }
        if (category !== "shadow") return rows;
        var dataConfig = cfg.ArchiveV10Data || {}, catalog = list(dataConfig.catalog || data && data.catalog);
        var live = {}, ordered = [], complete = !!data && (data.ok === true || Number(data.ok) === 1)
            && data.rows !== undefined && data.rows !== null && Number(data.delta) !== 1;
        rows.forEach(function (row) { if (row.id) live[row.id] = row; });
        catalog.forEach(function (entry) {
            if (!entry || !entry.id) return;
            var item = Object.assign({}, entry), row = live[entry.id];
            if (row) {
                Object.keys(row).forEach(function (key) { item[key] = row[key]; });
                if (row.target !== undefined && row.max_owned === undefined) item.max_owned = row.target;
                delete live[entry.id];
            } else if (complete) {
                item.count = 0; item.count_known = 1;
            } else {
                delete item.count; item.count_known = 0;
            }
            ordered.push(item);
        });
        // No package item count is a category capacity. Newly configured server
        // items survive even when they have no V10 icon mapping yet.
        rows.forEach(function (row) { if (row.id && live[row.id]) { ordered.push(row); delete live[row.id]; } });
        if (!catalog.length) ordered = rows;
        ordered.forEach(function (item) {
            var isKnown = known(item);
            item.count_known = isKnown ? 1 : 0;
            if (isKnown) { item.count = Number(item.count); item.unlocked = item.count > 0 ? 1 : 0; }
            else { delete item.count; delete item.unlocked; }
            if (item.max_owned !== undefined) item.target = item.max_owned;
        });
        return ordered;
    }
    cfg.ArchiveV10Semantics = { Normalize: normalize, Quantity: quantity, Progress: progress, Metric: metric, State: state, Known: known, IsUnlockItem: isUnlockItem };
})();
