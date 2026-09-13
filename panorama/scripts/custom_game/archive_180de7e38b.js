(function () {
    "use strict";
    // UI_REUSE_V1
    var U=GameUI.CustomUIConfig().SurvivalUI, A=GameUI.CustomUIConfig().ArchiveHandoff;
    var current = "clear", opened = false, latest = 0, assembly = null;
    var filterMode = "all", lastData = null, fitGeneration = 0;
    var navIcons = {clear:"clear",shadow:"void",points:"points",fragment:"weapon",pet:"spell",endless:"endless",friend:"friends",ex:"ex",beast:"blessing"};
    var categories = [], tooltipVisible = false, requestGeneration = 0, tooltipGeneration = 0;
    // Match the actual archive definitions, not the example names in the style reference.
    var buildingIcons = {
        building_01: "item_octarine_core", building_02: "item_rapier", building_03: "item_crimson_guard",
        building_04: "item_claymore", building_05: "item_abyssal_blade", building_06: "item_platemail",
        building_07: "item_arcane_boots", building_08: "item_bfury", building_09: "item_mjollnir"
    };
    function isDrawPage() { return current === "friend" || current === "ex" || current === "beast"; }
    function showDrawBar() {
        var visible = isDrawPage();
        panel("ArchiveContent").SetHasClass("ArchiveHasDraw", visible);
        panel("ArchiveDrawBar").SetHasClass("ArchiveHidden", !visible);
        panel("ArchiveDrawBar").style.visibility = visible ? "visible" : "collapse";
        panel("ArchiveContent").SetHasClass("ArchiveBuildingPage", current === "building");
        panel("ArchiveFaith").AddClass("ArchiveHidden");
        panel("ArchiveFaith").text = "";
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
        A.Hide();
        tooltipGeneration += 1;
        tooltipVisible = false;
        panel("ArchiveTooltip").AddClass("ArchiveHidden");
    }
    function tooltip(item, card) { A.Show(item, current, card); }
    function request() {
        GameEvents.SendCustomGameEventToServer("survival_archive_request", { category_id: current });
    }
    function tabs() {
        panel("ArchiveTabs").RemoveAndDeleteChildren();
        categories.forEach(function (category) {
            var toggle = $.CreatePanel("RadioButton", panel("ArchiveTabs"), "ArchiveTab_" + category.id);
            toggle.group = "ArchiveCategories";
            toggle.AddClass("ArchiveTab"); U.NavToggle.Adopt(toggle);
            toggle.checked = category.id === current;
            A.NavIcon(toggle, category.id, navIcons[category.id]);
            toggle.enabled = Number(category.disabled) !== 1;
            label(toggle, category.name);
            toggle.SetPanelEvent("onactivate", function () {
                if (Number(category.disabled) === 1 || current === category.id) return;
                current = category.id; filterMode="all"; lastData=null;
                hideTooltip();
                panel("ArchiveGrid").RemoveAndDeleteChildren();
                panel("ArchiveEmpty").RemoveClass("ArchiveHidden");
                panel("ArchiveEmpty").text = "正在读取存档…";
                panel("ArchivePageTitle").text = category.name;
                panel("ArchiveSummary").text = "";
                panel("ArchiveHint").text = "";
                panel("ArchiveStatus").text = "正在同步档案…";
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
    function icon(parent, item) { A.Icon(parent,item,current,buildingIcons); }
    function cardFrame(card) { A.Card(card); }
    function render(data) {
        if (data.category_id !== current) return;
        hideTooltip(); lastData=data; A.Observe(data);
        ["all","unlocked","locked"].forEach(function(mode){panel("ArchiveFilter_"+mode).checked=mode===filterMode;});
        var order=["clear","shadow","points","fragment","pet","endless","friend","ex","beast"];
        categories = array(data.categories).sort(function(a,b){var ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?100:ai)-(bi<0?100:bi);});
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
        var rows = array(data.rows), done = 0, ownedTypes = 0, visibleCount=0;
        panel("ArchiveGrid").RemoveAndDeleteChildren();
        rows.forEach(function (item) {
            var unlocked = A.Unlocked(item,current);
            if (filterMode !== "all" && (unlocked === null || unlocked !== (filterMode === "unlocked"))) return;
            visibleCount++;
            var card = $.CreatePanel("Panel", panel("ArchiveGrid"), "");
            card.AddClass("ArchiveCard");
            card.hittestchildren = false;
            icon(card, item);
            label(card, item.name, "ArchiveItemName");
            if (unlocked !== null) { var status=label(card,unlocked?"已解锁":"未解锁","ArchiveUnlockBadge");status.AddClass(unlocked?"Unlocked":"Locked"); }
            cardFrame(card);
            card.SetPanelEvent("onmouseover", function () { tooltip(item, card); });
            card.SetPanelEvent("onmouseout", hideTooltip);
            if (current === "work" || current === "building") {
                card.AddClass("ArchiveWorkCard");
                var canUpgrade = Number(item.can_upgrade) === 1 && Number(data.pending) !== 1;
                card.SetHasClass("ArchiveWorkAvailable", canUpgrade);
                label(card, Number(item.completed) === 1 ? (current === "building" ? "已满级" : "已激活") : item.cost + (current === "building" ? "信仰值" : "软妹币"), "ArchiveWorkCost");
                card.SetPanelEvent("onactivate", function () {
                    if (!canUpgrade) return;
                    canUpgrade = false;
                    card.RemoveClass("ArchiveWorkAvailable");
                    panel("ArchiveStatus").text = current === "building" ? "正在保存建筑升级…" : "正在激活福利…";
                    hideTooltip();
                    GameEvents.SendCustomGameEventToServer(current === "building" ? "survival_archive_building_upgrade" : "survival_archive_work_upgrade", {
                        item_id: item.id, expected_level: Number(item.level) || 0
                    });
                    $.Schedule(0.5, request);
                });
            }
            if (current === "fragment") {
                card.AddClass("ArchiveFragmentCard");
                label(card, "Lv" + (Number(item.level) || 0), "ArchiveFragmentLevel");
                if (item.promotion_target) {
                    card.hittestchildren = true;
                    var promote = $.CreatePanel("Button", card, "");
                    promote.AddClass("ArchivePromote");
                    promote.enabled = Number(item.can_promote) === 1;
                    label(promote, "晋升兑换");
                    U.ActionButton.Adopt(promote);
                    promote.SetPanelEvent("onmouseover", function () {
                        tooltip({name:"晋升兑换", description:"消耗" + item.promotion_cost + "片，兑换" + item.promotion_target + "碎片×1。累计获得超过200片后解锁。"}, promote);
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
        done=rows.filter(function(item){return Number(item.completed)===1;}).length;
        ownedTypes=rows.filter(function(item){return Number(item.count)>0;}).length;
        var title = categories.filter(function (category) { return category.id === current; })[0];
        panel("ArchivePageTitle").text = title ? title.name : "存档";
        panel("ArchiveSummary").text = current === "endless" ? "累计积分 " + (rows.length ? Number(rows[0].count) || 0 : 0) + " · 已完成 " + done + " / " + rows.length : current === "clear" ? "已完成 " + done + " / " + rows.length : "已拥有 " + ownedTypes + " 种";
        panel("ArchiveHint").text = current === "endless" ? "存档挑战2开启 · 每波5只 / 60秒 · 累计积分自动解锁奖励，下局生效" : current === "clear" ? "清空对应难度最后一波，累计达标自动获得永久效果" :
            current === "shadow" ? "虚空之影1～3按对应N级物品池独立随机2次 · 允许重复" :
            current === "fragment" ? "神兽狩猎获得碎片 · 每20片晋升1级 · 每种每日20片，通行证40片" :
            current === "pet" ? "秘法牢笼挑战掉落材料 · 每日30件，通行证90件" : "展示已拥有的积分道具";
        panel("ArchiveEmpty").SetHasClass("ArchiveHidden", visibleCount > 0);
        panel("ArchiveEmpty").text = filterMode !== "all" ? "当前筛选下暂无存档" : current === "shadow" ? "尚未获得虚空之影道具" :
            current === "pet" ? "尚未获得秘法牢笼材料" : "尚未拥有积分道具";
        panel("ArchiveStatus").text = Number(data.pending) === 1 ? "奖励正在保存…" :
            current === "shadow" ? (Number(data.has_pass) === 1 ? "通行证生效 · 每次掉落 3 件" : "每次掉落 2 件") : "效果自动生效";
        if (socialPage && social) {
            panel("ArchiveHint").text = "每次消耗" + social.draw_cost + "张" + social.currency_name + " · 剩余数量决定抽取权重 · 重复获得叠加效果";
            panel("ArchiveSummary").text = "已拥有 " + ownedTypes + " / " + rows.length + " 种 · 共 " + social.total + " 件";
            panel("ArchiveStatus").text = Number(data.pending) === 1 ? "奖励正在保存…" : current === "friend" && Number(social.unlocked) === 1 ? "已集齐100件 · 我的大基巴已解锁（入口预留）" : "挑战3获取" + social.currency_name + " · 每项挑战每日最多10张 · 奖励效果按持有数量叠加";
        }
        if (current === "building" && data.buildings) {
            var buildings = data.buildings;
            panel("ArchiveSummary").text = "信仰值：" + buildings.faith + " · 今日获取 " + buildings.earned_today + "/" + buildings.daily_cap;
            panel("ArchiveFaith").text = "信仰值：" + buildings.faith;
            panel("ArchiveFaith").RemoveClass("ArchiveHidden");
            panel("ArchiveHint").text = "每次通关+" + buildings.per_clear + "信仰值 · 每日上限" + buildings.daily_cap + " · 余额累积 · 通行证不加成";
            panel("ArchiveStatus").text = Number(data.pending) === 1 ? "正在保存建筑升级…" : "点击激活或升级 · 每项最多5级 · 通关后新增效果于下局生效";
        }
        if (current === "boss") {
            panel("ArchiveSummary").text = "波次BOSS击杀 " + (rows.length ? rows[0].count : 0) + " 次 · 已激活 " + done + " / " + rows.length;
            panel("ArchiveHint").text = "只记录主线波次BOSS · 月卡有效时门槛减半，到期恢复原门槛";
            panel("ArchiveStatus").text = "按当前门槛激活效果 · 击杀记录永久保留";
        }
        if (current === "fishing") {
            var fishing = data.fishing || {};
            panel("ArchiveSummary").text = Number(fishing.ready) === 1 ? "已拥有 " + fishing.owned + " / " + fishing.types + " 种 · 共 " + fishing.total + " 件" : "库存待同步";
            panel("ArchiveHint").text = "在线奖励获得 · 已拥有点亮，未拥有置灰 · 悬停查看单件效果";
            panel("ArchiveStatus").text = Number(fishing.ready) === 1 ? "展示服务器钓鱼记录 · 数量随档案同步" : "服务器尚未返回钓鱼库存数量";
        }
        if ((current === "map_level" || current === "work") && data.online) {
            var online = data.online;
            if (current === "map_level") {
                var minutes = Math.floor(Number(online.map_seconds) / 60);
                panel("ArchiveSummary").text = "等级 " + online.level + " / " + online.max_level;
                panel("ArchiveHint").text = "累计有效在线 " + Math.floor(minutes / 60) + "小时" + (minutes % 60) + "分钟 · " + (Number(data.has_pass) === 1 ? "通行证双倍计时" : "正常计时");
            } else {
                panel("ArchiveSummary").text = "软妹币：" + online.coins + " · 已激活 " + done + " / " + rows.length;
                panel("ArchiveHint").text = "实际在线每分钟获得1软妹币 · 点击小格消耗软妹币激活 · 同名项目独立叠加";
            }
            panel("ArchiveStatus").text = Number(data.pending) === 1 ? "正在保存进度…" : "进度每分钟保存 · 奖励永久保留；通关后新增属性于下局生效";
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
        opened = false; fitGeneration++;
        panel("ArchiveScrim").AddClass("ArchiveHidden");
        archiveShell.Close();
        panel("ArchiveWindow").AddClass("ArchiveHidden");
        hideTooltip();
    }
    var archiveShell=U.ModalShell.Adopt({id:"archive",panel:panel("ArchiveWindow"),root:$.GetContextPanel(),scrim:panel("ArchiveScrim"),header:panel("ArchiveHeader"),titlePanel:panel("ArchiveTitle"),closeButton:panel("ArchiveClose"),width:869,height:713,fit:{reference:[1672,941]},onClose:close});
    U.ActionButton.Adopt(panel("ArchiveDraw"),{variant:"gold"}); U.Tooltip.Adopt(panel("ArchiveTooltip"));
    A.Init();
    GameUI.CustomUIConfig().SurvivalArchive = {
        Toggle: function () {
            if (opened) { close(); return; }
            opened = true;
            panel("ArchiveScrim").RemoveClass("ArchiveHidden");
            archiveShell.Open();
            panel("ArchiveWindow").RemoveClass("ArchiveHidden");
            request();
        },
        Filter: function(mode){if(["all","unlocked","locked"].indexOf(mode)<0)return;filterMode=mode;if(lastData)render(lastData);},
        Close: close,
        Refresh: request
    };
    $.RegisterEventHandler("Cancelled", panel("ArchiveWindow"), close);
})();
