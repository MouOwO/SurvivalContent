(function () {
    "use strict";
    var current = "clear", opened = false, latest = 0, assembly = null;
    var categories = [], tooltipVisible = false, requestGeneration = 0, tooltipGeneration = 0;
    function isDrawPage() { return current === "friend" || current === "ex" || current === "beast"; }
    function showDrawBar() {
        var visible = isDrawPage();
        panel("ArchiveContent").SetHasClass("ArchiveHasDraw", visible);
        panel("ArchiveDrawBar").SetHasClass("ArchiveHidden", !visible);
        panel("ArchiveDrawBar").style.visibility = visible ? "visible" : "collapse";
    }
    function panel(id) { return $("#" + id); }
    function array(value) {
        if (!value) return [];
        if (Array.isArray(value)) return value;
        return Object.keys(value).sort(function (a, b) { return Number(a) - Number(b); })
            .map(function (key) { return value[key]; });
    }
    function label(parent, text, className) {
        var result = $.CreatePanel("Label", parent, "");
        result.text = String(text || "");
        if (className) result.AddClass(className);
        result.hittest = false;
        return result;
    }
    function hideTooltip() {
        tooltipGeneration += 1;
        tooltipVisible = false;
        panel("ArchiveTooltip").AddClass("ArchiveHidden");
    }
    function positionTooltip(generation) {
        if (!tooltipVisible || !opened || generation !== tooltipGeneration) return;
        var root = $.GetContextPanel(), cursor = GameUI.GetCursorPosition();
        var width = root.actuallayoutwidth || 1920, height = root.actuallayoutheight || 1080;
        var scaleX = Math.max(0.001, root.actualuiscale_x || 1);
        var scaleY = Math.max(0.001, root.actualuiscale_y || 1);
        var tip = panel("ArchiveTooltip");
        var tipWidth = tip.actuallayoutwidth || 330 * scaleX;
        var tipHeight = tip.actuallayoutheight || 120 * scaleY;
        var x = Math.max(12 * scaleX, Math.min(cursor[0] + 20 * scaleX, width - tipWidth - 12 * scaleX));
        var y = Math.max(12 * scaleY, Math.min(cursor[1] + 16 * scaleY, height - tipHeight - 12 * scaleY));
        tip.style.position = Math.round(x / scaleX) + "px " + Math.round(y / scaleY) + "px 0px";
        $.Schedule(0.03, function () { positionTooltip(generation); });
    }
    function tooltip(item) {
        hideTooltip();
        panel("ArchiveTooltipName").text = item.name || "";
        panel("ArchiveTooltipName").style.color = GameUI.CustomUIConfig().SurvivalRewardPresentation.NameColor(item.quality);
        panel("ArchiveTooltipEffect").text = item.description || "暂无效果说明";
        panel("ArchiveTooltip").RemoveClass("ArchiveHidden");
        tooltipVisible = true;
        positionTooltip(tooltipGeneration);
    }
    function request() {
        GameEvents.SendCustomGameEventToServer("survival_archive_request", { category_id: current });
    }
    function tabs() {
        panel("ArchiveTabs").RemoveAndDeleteChildren();
        categories.forEach(function (category) {
            var toggle = $.CreatePanel("RadioButton", panel("ArchiveTabs"), "ArchiveTab_" + category.id);
            toggle.group = "ArchiveCategories";
            toggle.AddClass("ArchiveTab");
            toggle.checked = category.id === current;
            label(toggle, category.name);
            toggle.SetPanelEvent("onactivate", function () {
                if (current === category.id) return;
                current = category.id;
                hideTooltip();
                panel("ArchiveGrid").RemoveAndDeleteChildren();
                panel("ArchiveEmpty").RemoveClass("ArchiveHidden");
                panel("ArchiveEmpty").text = "正在读取存档…";
                panel("ArchivePageTitle").text = category.name;
                panel("ArchiveSummary").text = "";
                showDrawBar();
                panel("ArchiveDraw").enabled = false;
                panel("ArchiveTickets").text = "正在读取抽奖券…";
                panel("ArchiveDrawResult").text = "";
                tabs();
                // Coalesce fast toggle changes and respect the server throttle.
                var generation = ++requestGeneration;
                $.Schedule(0.18, function () { if (generation === requestGeneration) request(); });
            });
        });
    }
    function icon(parent, item) {
        var art = $.CreatePanel("Panel", parent, "");
        art.AddClass("ArchiveArt");
        art.AddClass("ArchiveArt_" + (item.icon_style || "seal"));
        art.AddClass("ArchiveQuality_" + (item.quality || "gold"));
        art.hittest = false;
        if (current === "points" && item.icon_type !== "custom") {
            GameUI.CustomUIConfig().SurvivalRewardPresentation.CreateIcon(art, item, "ArchiveRewardIcon");
        } else {
        var shape = $.CreatePanel("Panel", art, "");
        shape.AddClass("ArchiveGlyph");
        shape.hittest = false;
        label(art, item.rune || String(item.name || "印").substring(0, 1), "ArchiveRune");
        }
        if (Number(item.completed) === 1) art.AddClass("ArchiveCompleted");
        if (isDrawPage() && !(Number(item.count) > 0)) art.AddClass("ArchiveCompleted");
        var count = Math.max(0, Number(item.count) || 0), target = Number(item.target) || 1;
        label(art, (current === "clear" || current === "endless" || current === "boss" ? Math.min(count, target) : count) + "/" + target, "ArchiveCount");
    }
    function render(data) {
        if (data.category_id !== current) return;
        hideTooltip();
        categories = array(data.categories);
        tabs();
        var social = data.social, socialPage = isDrawPage();
        showDrawBar();
        if (socialPage && social) {
            panel("ArchiveTickets").text = social.currency_name + "：" + social.tickets;
            panel("ArchiveDraw").enabled = Number(social.tickets) >= Number(social.draw_cost) && Number(social.remaining) > 0 && Number(data.pending) !== 1;
            panel("ArchiveDrawResult").text = data.last_draw && data.last_draw.pool_id === current ? "获得：" + data.last_draw.name : "";
            panel("ArchiveDraw").SetPanelEvent("onactivate", function () {
                if (!panel("ArchiveDraw").enabled) return;
                panel("ArchiveDraw").enabled = false;
                panel("ArchiveDrawResult").text = "抽奖结算中…";
                GameEvents.SendCustomGameEventToServer("survival_archive_social_draw", {
                    pool_id: current, request_id: "social_" + Date.now() + "_" + (++requestGeneration)
                });
                $.Schedule(0.5, request);
            });
        }
        var rows = array(data.rows), done = 0, ownedTypes = 0;
        panel("ArchiveGrid").RemoveAndDeleteChildren();
        rows.forEach(function (item) {
            var card = $.CreatePanel("Panel", panel("ArchiveGrid"), "");
            card.AddClass("ArchiveCard");
            card.hittestchildren = false;
            icon(card, item);
            label(card, item.name, "ArchiveItemName");
            card.SetPanelEvent("onmouseover", function () { tooltip(item); });
            card.SetPanelEvent("onmouseout", hideTooltip);
            if (current === "fragment") {
                card.AddClass("ArchiveFragmentCard");
                label(card, "Lv" + (Number(item.level) || 0), "ArchiveFragmentLevel");
                if (item.promotion_target) {
                    card.hittestchildren = true;
                    var promote = $.CreatePanel("Button", card, "");
                    promote.AddClass("ArchivePromote");
                    promote.enabled = Number(item.can_promote) === 1;
                    label(promote, "晋升兑换");
                    promote.SetPanelEvent("onmouseover", function () {
                        tooltip({name:"晋升兑换", description:"消耗" + item.promotion_cost + "片，兑换" + item.promotion_target + "碎片×1。累计获得超过200片后解锁。"});
                    });
                    promote.SetPanelEvent("onmouseout", hideTooltip);
                    promote.SetPanelEvent("onactivate", function () {
                        if (!promote.enabled) return;
                        promote.enabled = false;
                        GameEvents.SendCustomGameEventToServer("survival_archive_promote", {
                            fragment_id:item.id, request_id:"promotion_" + Date.now() + "_" + (++requestGeneration)
                        });
                        $.Schedule(0.5, request);
                    });
                }
            }
            if (Number(item.count) > 0) ownedTypes += 1;
            if (Number(item.completed) === 1) done += 1;
        });
        var title = categories.filter(function (category) { return category.id === current; })[0];
        panel("ArchivePageTitle").text = title ? title.name : "存档";
        panel("ArchiveSummary").text = current === "endless" ? "累计积分 " + (rows.length ? Number(rows[0].count) || 0 : 0) + " · 已完成 " + done + " / " + rows.length : current === "clear" ? "已完成 " + done + " / " + rows.length : "已拥有 " + ownedTypes + " 种";
        panel("ArchiveHint").text = current === "endless" ? "存档挑战2开启 · 每波5只 / 60秒 · 累计积分自动解锁奖励，下局生效" : current === "clear" ? "清空对应难度最后一波，累计达标自动获得永久效果" :
            current === "shadow" ? "虚空之影1～3按对应N级物品池独立随机2次 · 允许重复" :
            current === "fragment" ? "神兽狩猎获得碎片 · 每20片晋升1级 · 每种每日20片，通行证40片" :
            current === "pet" ? "秘法牢笼挑战掉落材料 · 每日30件，通行证90件" : "展示已拥有的积分道具";
        panel("ArchiveEmpty").SetHasClass("ArchiveHidden", rows.length > 0);
        panel("ArchiveEmpty").text = current === "shadow" ? "尚未获得虚空之影道具" :
            current === "pet" ? "尚未获得秘法牢笼材料" : "尚未拥有积分道具";
        panel("ArchiveStatus").text = Number(data.pending) === 1 ? "奖励正在保存…" :
            current === "shadow" ? (Number(data.has_pass) === 1 ? "通行证生效 · 每次掉落 3 件" : "每次掉落 2 件") : "效果自动生效";
        if (socialPage && social) {
            panel("ArchiveHint").text = "每次消耗" + social.draw_cost + "张" + social.currency_name + " · 剩余数量决定抽取权重 · 重复获得叠加效果";
            panel("ArchiveSummary").text = "已拥有 " + ownedTypes + " / " + rows.length + " 种 · 共 " + social.total + " 件";
            panel("ArchiveStatus").text = Number(data.pending) === 1 ? "奖励正在保存…" : current === "friend" && Number(social.unlocked) === 1 ? "已集齐100件 · 我的大基巴已解锁（入口预留）" : "挑战3获取" + social.currency_name + " · 每项挑战每日最多10张 · 奖励效果按持有数量叠加";
        }
        if (current === "boss") {
            panel("ArchiveSummary").text = "波次BOSS击杀 " + (rows.length ? rows[0].count : 0) + " 次 · 已激活 " + done + " / " + rows.length;
            panel("ArchiveHint").text = "只记录主线波次BOSS · 月卡有效时门槛减半，到期恢复原门槛";
            panel("ArchiveStatus").text = "按当前门槛激活效果 · 击杀记录永久保留";
        }
    }
    GameEvents.Subscribe("survival_archive_snapshot", function (data) {
        var sequence = Number(data.sequence) || 0;
        if (sequence < latest) return;
        if (!(data.ok === true || Number(data.ok) === 1)) {
            panel("ArchiveStatus").text = "存档尚未就绪，正在等待玩家档案";
            if (opened) $.Schedule(2, function () { if (opened) request(); });
            return;
        }
        if (!assembly || sequence > latest) {
            latest = sequence;
            assembly = { header: data, chunks: {}, count: Number(data.chunks) || 1 };
        }
        assembly.chunks[Number(data.chunk) || 1] = array(data.rows);
        if (Object.keys(assembly.chunks).length !== assembly.count) return;
        var complete = assembly.header;
        complete.rows = [];
        for (var i = 1; i <= assembly.count; i++) complete.rows = complete.rows.concat(assembly.chunks[i]);
        assembly = null;
        render(complete);
    });
    GameEvents.Subscribe("survival_endless_state", function (data) {
        var status = panel("EndlessStatus");
        status.SetHasClass("ArchiveHidden", data.status === "idle");
        status.text = data.status === "running" ? "无尽第" + data.wave + "波 · 剩余" + data.remaining + "只 · " + data.seconds + "秒 · 本局" + data.score + "分"
            : "无尽结束 · 已通过" + (data.cleared || 0) + "波 · " + data.score + "分 · " + (data.reason || "");
        if (opened && current === "endless" && data.remaining === 0) request();
    });
    function close() {
        opened = false;
        panel("ArchiveWindow").AddClass("ArchiveHidden");
        hideTooltip();
    }
    GameUI.CustomUIConfig().SurvivalArchive = {
        Toggle: function () {
            if (opened) { close(); return; }
            opened = true;
            panel("ArchiveWindow").RemoveClass("ArchiveHidden");
            request();
        },
        Close: close,
        Refresh: request
    };
    $.RegisterEventHandler("Cancelled", panel("ArchiveWindow"), close);
})();
