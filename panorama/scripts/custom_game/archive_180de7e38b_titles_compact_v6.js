(function () {
    "use strict";
    // UI_REUSE_V1
    var cfg=GameUI.CustomUIConfig(), root=$.GetContextPanel(), U=cfg.SurvivalUI, A=cfg.ArchiveHandoff;
    // A native context root may survive while all of its layout children reload.
    var previous=cfg.SurvivalArchive;
    if(previous&&previous.Dispose)previous.Dispose();
    else if(previous&&previous.Close){try{previous.Close();}catch(e){/* Deleted legacy layout: build the replacement normally. */}}
    var disposed=false,api=null,lifetimeMarker=null,subscriptions=[],timers=[];
    var resyncQueued=false,syncRetry=null,resyncPages={};
    function valid(node){return node&&(!node.IsValid||node.IsValid());}
    function active(){return !disposed&&valid(root)&&valid(lifetimeMarker)&&(!api||cfg.SurvivalArchive===api);}
    function later(delay,callback){
        var timer=$.Schedule(delay,function(){timers=timers.filter(function(id){return id!==timer;});if(active())callback();});
        timers.push(timer);return timer;
    }
    function subscribe(name,callback){subscriptions.push(GameEvents.Subscribe(name,function(data){if(active())callback(data);}));}
    if(!valid(root)||!valid(root.FindChildTraverse("ArchiveWindow")))return;
    lifetimeMarker=$.CreatePanel("Panel",root.FindChildTraverse("ArchiveWindow"),"");
    lifetimeMarker.visible=false;lifetimeMarker.hittest=false;lifetimeMarker.hittestchildren=false;
    var current = "clear", opened = false, latest = 0, assembly = null;
    var filterMode = "all", lastData = null, fitGeneration = 0;
    var navIcons = {clear:"clear",shadow:"void",points:"points",fragment:"weapon",pet:"spell",endless:"endless",friend:"friends",ex:"ex",beast:"blessing"};
    var categories = [], tooltipVisible = false, requestGeneration = 0, tooltipGeneration = 0;
    var pageCache = {}, pageAssemblies = {}, pageVersions = {};
    var rowCards = {};
    var titleSubmitting = false;
    var renderedTabs = null, tabsSignature = "", lastPaletteKey = "";
    var latestEndlessState = null, endlessStatusPanel = null;
    var endlessStatusText = "", endlessStatusHidden = null, endlessRequestKey = "";
    var panelCache = {};
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
        panel("ArchiveContent").SetHasClass("ArchiveCollectionPage",["friend","ex","beast","fishing"].indexOf(current)>=0);
        panel("ArchiveContent").SetHasClass("ArchiveWorkPage",current==="work");
        panel("ArchiveFaith").AddClass("ArchiveHidden");
        panel("ArchiveFaith").text = "";
        var source=panel("ArchiveCurrencySource");if(source)source.visible=false;
        panel("ArchiveContent").SetHasClass("ArchiveHasCurrencySource",false);
    }
    function panel(id) { if(!valid(root))return null;var node=panelCache[id];if(!valid(node))node=panelCache[id]=root.FindChildTraverse(id);return valid(node)?node:null; }
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
        if(!active())return;
        A.Hide();
        tooltipGeneration += 1;
        tooltipVisible = false;
        panel("ArchiveTooltip").AddClass("ArchiveHidden");
    }
    function tooltip(item, card) { if(active()&&valid(card))A.Show(item, current, card); }
    function needsSync(){return !pageCache[current]||Object.keys(resyncPages).length>0;}
    function retrySync(){
        if(syncRetry)return;
        syncRetry=later(.75,function(){syncRetry=null;if(opened&&needsSync())request(true);});
    }
    function queueFullSync(category){
        resyncPages[category]=true;
        if(resyncQueued)return;
        resyncQueued=true;
        later(.2,function(){resyncQueued=false;request(true);});
    }
    function request(prefetch) {
        if(!active())return;
        GameEvents.SendCustomGameEventToServer("survival_archive_request", { category_id: current, prefetch:prefetch===true?1:0 });
        // The server silently throttles requests on game time, which can stand
        // still while paused. Keep one retry until a real baseline arrives.
        if(prefetch===true)retrySync();
    }
    var archiveFit={reference:[1920,1080]},voidView=cfg.SurvivalArchiveVoidV1;
    function renderVoid(data){return voidView&&voidView.Render(data,current,filterMode,categories,archiveFit);}
    function tabs() {
        var container = panel("ArchiveTabs"), signature = JSON.stringify([current, categories]);
        if (container === renderedTabs && signature === tabsSignature) return false;
        container.RemoveAndDeleteChildren();
        categories.forEach(function (category) {
            var toggle = $.CreatePanel("RadioButton", panel("ArchiveTabs"), "ArchiveTab_" + category.id);
            toggle.group = "ArchiveCategories";
            toggle.AddClass("ArchiveTab"); U.NavToggle.Adopt(toggle);
            toggle.checked = category.id === current;
            if (category.id === "titles") {
                var crest=$.CreatePanel("Label",toggle,"");crest.AddClass("ArchiveNavIcon");
                crest.text="冠";crest.style.fontSize="23px";crest.style.color="#d6b574";crest.hittest=false;
            } else A.NavIcon(toggle, category.id, navIcons[category.id]);
            toggle.enabled = Number(category.disabled) !== 1;
            label(toggle, category.id === "building" ? "存档神器" : category.name, "ArchiveNavLabel");
            toggle.__archiveActivate = function () {
                if(!active()||!valid(toggle))return;
                if (Number(category.disabled) === 1 || current === category.id) return;
                current = category.id; filterMode="all"; lastData=pageCache[current]||null;
                panel("ArchiveGrid").ScrollToTop();
                if(lastData){tabs();render(lastData);return;}
                hideTooltip();
                Object.keys(rowCards).forEach(function(key){rowCards[key].panel.visible=false;});
                panel("ArchiveEmpty").RemoveClass("ArchiveHidden");
                panel("ArchiveEmpty").text = "正在读取存档…";
                panel("ArchivePageTitle").text = category.name;
                panel("ArchiveSummary").text = "";
                panel("ArchiveFilterAllLabel").text = "全部";
                panel("ArchiveContext").text = "";
                panel("ArchiveHint").text = "";
                panel("ArchiveStatus").text = "正在同步档案…";
                showDrawBar();
                panel("ArchiveDraw").enabled = false;
                panel("ArchiveTickets").text = "正在读取抽奖券…";
                panel("ArchiveDrawResult").text = "";
                tabs();
                renderVoid(null);
                // Coalesce fast toggle changes and respect the server throttle.
                var generation = ++requestGeneration;
                request(true);
            };
            toggle.SetPanelEvent("onactivate", toggle.__archiveActivate);
        });
        renderedTabs = container; tabsSignature = signature;
        return true;
    }
    function icon(parent, item) { A.Icon(parent,item,current,buildingIcons); }
    function cardFrame(card) { A.Card(card); }
    function render(data) {
        // Background archive updates keep their authoritative page cache. Cards,
        // fonts and palettes are assembled only when the player opens the view.
        if(!active()||!opened)return;
        if (data.category_id !== current) return;
        lastData=data; A.Observe(data);
        var order=["clear","shadow","points","starjoy_points","gift","fragment","pet","endless","friend","ex","beast"];
        categories = array(data.categories).sort(function(a,b){var ai=a.id==="titles"?1000:order.indexOf(a.id),bi=b.id==="titles"?1000:order.indexOf(b.id);return (ai<0?100:ai)-(bi<0?100:bi);});
        var paletteDirty = tabs();
        if(renderVoid(data))return;
        hideTooltip();
        ["all","unlocked","locked"].forEach(function(mode){panel("ArchiveFilter_"+mode).checked=mode===filterMode;});
        var social = data.social, socialPage = isDrawPage();
        showDrawBar();
        if (socialPage && social) {
            panel("ArchiveTickets").text = social.currency_name + "：" + social.tickets;
            panel("ArchiveDraw").enabled = Number(social.tickets) >= Number(social.draw_cost) && Number(social.remaining) > 0 && Number(data.pending) !== 1;
            panel("ArchiveDrawResult").text = data.last_draw && data.last_draw.pool_id === current ? "获得：" + data.last_draw.name : "每次消耗 " + social.draw_cost + " 张 · 重复获得叠加效果";
            panel("ArchiveDraw").SetPanelEvent("onactivate", function () {
                if(!active())return;
                if (!panel("ArchiveDraw").enabled) return;
                panel("ArchiveDraw").enabled = false;
                panel("ArchiveDrawResult").text = "抽奖结算中…";
                GameEvents.SendCustomGameEventToServer("survival_archive_social_draw", {
                    pool_id: current, request_id: "social_" + Date.now() + "_" + (++requestGeneration)
                });
                later(0.5, request);
            });
        }
        var rows = array(data.rows), done = 0, ownedTypes = 0, visibleCount=0;
        Object.keys(rowCards).forEach(function(key){rowCards[key].panel.visible=false;});
        rows.forEach(function (item,index) {
            var unlocked = A.Unlocked(item,current);
            if (filterMode !== "all" && (unlocked === null || unlocked !== (filterMode === "unlocked"))) return;
            visibleCount++;
            var key=current+":"+index, fingerprint=JSON.stringify([item,data.pending,data.upgrade_pending]);
            var cached=rowCards[key];
            var actionable = current === "work" || current === "building" || current === "titles";
            var card = cached?cached.panel:$.CreatePanel(actionable ? "Button" : "Panel", panel("ArchiveGrid"), "");
            card.visible=true;
            card.hittest=true;
            card.AddClass("ArchiveCard");
            card.__archiveUnlocked=unlocked;
            card.SetHasClass("ArchiveContentLocked",unlocked!==true);
            // Collection/item artwork stays recognizable; text still reflects ownership.
            card.SetHasClass("ArchiveArtAlwaysBright",["fragment","friend","ex","beast","fishing","shadow","points","pet","work","building"].indexOf(current)>=0);
            // Cached rows still need current visual policy when artwork stays unchanged.
            if(cached&&cached.fingerprint===fingerprint)return;
            paletteDirty = true;
            if(cached)card.RemoveAndDeleteChildren();
            rowCards[key]={panel:card,fingerprint:fingerprint};
            card.hittestchildren = false;
            if (current === "titles") {
                card.AddClass("ArchiveTitleCard");
                card.SetHasClass("ArchiveTitleEquipped",Number(item.equipped)===1);
                var layeredArt=GameUI.CustomUIConfig().SurvivalTitleLayeredArt;
                if (item.id==="peak_perfection" && layeredArt) {
                    var titleArt=$.CreatePanel("Panel",card,"");titleArt.AddClass("ArchiveTitleArt");
                    layeredArt.Create(titleArt);
                } else if(GameUI.CustomUIConfig().SurvivalTitleSeriesArt && GameUI.CustomUIConfig().SurvivalTitleSeriesArt.Config[item.id]) {
                    var titleArt=$.CreatePanel("Panel",card,"");titleArt.AddClass("ArchiveTitleArt");
                    GameUI.CustomUIConfig().SurvivalTitleSeriesArt.Create(titleArt,item.id,false);
                } else {
                    var titleArt=$.CreatePanel("Image",card,"");titleArt.AddClass("ArchiveTitleArt");
                    titleArt.SetImage(item.icon);titleArt.hittest=false;
                }
            } else icon(card, item);
            var displayName = current === "fragment" ? String(item.name || "").replace(/^神兵[-－·]/, "") : item.name;
            // Tier requirements already have a progress badge; keep the full
            // configured name in the tooltip instead of repeating it on cards.
            if(current === "endless" || current === "boss") displayName = item.short_name || ("第 " + (index + 1) + " 阶");
            label(card, displayName, current === "titles" ? "ArchiveTitleName" : "ArchiveItemName");
            // Full status remains in the tooltip; a small shape avoids repeating
            // the same status sentence across every card in a dense collection.
            if (unlocked !== null) {
                var status=$.CreatePanel("Image",card,"");
                status.AddClass("ArchiveStateIcon");
                status.AddClass(unlocked?"Unlocked":"Locked");
                status.SetImage(GameUI.CustomUIConfig().ArchiveHandoffAssets[unlocked?"icon_check_light.png":"icon_lock_light.png"]);
                status.hittest=false;
            }
            card.SetPanelEvent("onmouseover", function () { tooltip(item, card); });
            card.SetPanelEvent("onmouseout", hideTooltip);
            if (current === "titles") {
                var equipped=Number(item.equipped)===1;
                var actionLabel=label(card,unlocked!==true?"未解锁":equipped?"已穿戴 · 卸下":Number(item.preview_only)===1?"点击试穿":"点击穿戴","ArchiveTitleAction");
                card.SetPanelEvent("onactivate",function() {
                    if(!active()||!valid(card))return;
                    if (unlocked!==true || titleSubmitting) return;
                    if (Number(data.pending)===1 && Number(data.title_preview)!==1) {
                        panel("ArchiveStatus").text="正在保存进度，请稍候再试";return;
                    }
                    titleSubmitting=true;actionLabel.text="正在切换…";
                    panel("ArchiveStatus").text="正在切换称号…";
                    rowCards[key].fingerprint=null;
                    GameEvents.SendCustomGameEventToServer("survival_archive_title_equip",{title_id:equipped?"":item.id});
                    // Server result releases rejected/unchanged actions as well.
                    later(2,function(){titleSubmitting=false;request(true);});
                });
            }
            if (current === "work" || current === "building") {
                card.AddClass("ArchiveWorkCard");
                var cardCategory = current;
                // Background boss/online rewards do not lock manual welfare purchases.
                var upgradePending = data.upgrade_pending !== undefined ? Number(data.upgrade_pending) === 1
                    : current === "work" ? false : Number(data.pending) === 1;
                var canUpgrade = Number(item.can_upgrade) === 1 && !upgradePending;
                card.SetHasClass("ArchiveWorkAvailable", canUpgrade);
                var costLabel = label(card, Number(item.completed) === 1 ? (current === "building" ? "已满级" : "已激活") : item.cost + (current === "building" ? "信仰值" : "软妹币"), "ArchiveWorkCost");
                var submitted = false;
                card.SetPanelEvent("onactivate", function () {
                    if(!active()||!valid(card))return;
                    if (submitted) return;
                    if (!canUpgrade) {
                        panel("ArchiveStatus").text = upgradePending ? "正在保存进度，请稍候…"
                            : Number(item.completed) === 1 ? (cardCategory === "building" ? "该神器已满级" : "该福利已激活")
                            : cardCategory === "building" ? "信仰值不足" : "软妹币不足";
                        return;
                    }
                    submitted = true;
                    // A rejected request may return unchanged data: rebind the
                    // cached handler after the next authoritative snapshot.
                    rowCards[key].fingerprint = null;
                    costLabel.text = cardCategory === "building" ? "正在升级…" : "正在解锁…";
                    canUpgrade = false;
                    card.RemoveClass("ArchiveWorkAvailable");
                    panel("ArchiveStatus").text = cardCategory === "building" ? "正在保存神器升级…" : "正在激活福利…";
                    hideTooltip();
                    GameEvents.SendCustomGameEventToServer(cardCategory === "building" ? "survival_archive_building_upgrade" : "survival_archive_work_upgrade", {
                        item_id: item.id, expected_level: Number(item.level) || 0
                    });
                    later(0.5, request);
                });
            }
            if (current === "fragment") {
                card.AddClass("ArchiveFragmentCard");
                if (item.promotion_target) {
                    card.hittestchildren = true;
                    var promote = $.CreatePanel("Button", card, "");
                    promote.AddClass("ArchivePromote");
                    promote.enabled = Number(item.can_promote) === 1;
                    label(promote, "晋升");
                    // ArchivePromote owns its dark enabled/disabled palette; shared ivory buttons write an inline text color.
                    promote.SetPanelEvent("onmouseover", function () {
                        if(!active()||!valid(promote))return;
                        var targetRow=rows.filter(function(row){return row.id===item.promotion_target;})[0];
                        var targetName=targetRow?String(targetRow.name||"").replace(/^神兵[-－·]/,""):"下一阶神兵";
                        A.ShowEffectOnly({name:"晋升兑换", description:"消耗" + item.promotion_cost + "片，兑换" + targetName + "碎片×1。累计获得超过200片后解锁。"}, promote);
                    });
                    promote.SetPanelEvent("onmouseout", hideTooltip);
                    promote.SetPanelEvent("onactivate", function () {
                        if(!active()||!valid(promote))return;
                        if (!promote.enabled) return;
                        promote.enabled = false;
                        panel("ArchiveStatus").text="正在兑换神兵碎片…";
                        if(GameUI.CustomUIConfig().SurvivalArchivePurple)GameUI.CustomUIConfig().SurvivalArchivePurple.Apply();
                        GameEvents.SendCustomGameEventToServer("survival_archive_promote", {
                            fragment_id:item.id, request_id:"promotion_" + Date.now() + "_" + (++requestGeneration)
                        });
                        later(0.5, request);
                    });
                }
            }
            cardFrame(card);
            if (Number(item.count) > 0) ownedTypes += 1;
            if (Number(item.completed) === 1) done += 1;
        });
        done=rows.filter(function(item){return A.Unlocked(item,current)===true;}).length;
        ownedTypes=rows.filter(function(item){return Number(item.count)>0;}).length;
        var title = categories.filter(function (category) { return category.id === current; })[0];
        panel("ArchivePageTitle").text = current === "building" ? "存档神器" : title ? title.name : "存档";
        panel("ArchiveSummary").text = current === "endless" ? "累计积分 " + (rows.length ? Number(rows[0].count) || 0 : 0) + " · 已完成 " + done + " / " + rows.length : current === "clear" ? "已完成 " + done + " / " + rows.length : "已拥有 " + ownedTypes + " 种";
        panel("ArchiveHint").text = current === "endless" ? "存档挑战2开启 · 每波5只 / 60秒 · 累计积分自动解锁奖励，下局生效" : current === "clear" ? "清空对应难度最后一波，累计达标自动获得永久效果" :
            current === "shadow" ? "虚空之影1～3按对应N级物品池独立随机2次 · 允许重复" :
            current === "fragment" ? "神兽狩猎获得碎片 · 每20片晋升1级 · 每种每日20片，通行证40片" :
            current === "pet" ? "秘法牢笼挑战掉落材料 · 每日30件，通行证90件" : "展示已拥有的积分道具";
        panel("ArchiveEmpty").SetHasClass("ArchiveHidden", visibleCount > 0);
        panel("ArchiveEmpty").text = filterMode !== "all" ? "当前筛选下暂无存档" : current === "shadow" ? "尚未获得虚空之影道具" :
            current === "pet" ? "尚未获得秘法牢笼材料" : current === "points" ? "尚未拥有积分道具" : "当前分类暂无存档";
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
            panel("ArchiveStatus").text = Number(data.pending) === 1 ? "正在保存神器升级…" : "点击激活或升级 · 每项最多5级 · 通关后新增效果于下局生效";
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
        if (current === "starjoy_points" && data.starjoy) {
            panel("ArchiveSummary").text = "星悦 LV" + data.starjoy.level + " / 24";
            panel("ArchiveHint").text = "累计积分达标自动解锁 · 各等级奖励叠加 · 兑换不降级";
            panel("ArchiveStatus").text = "累计积分达标永久解锁 · 同类属性相加 · 裁决可斩杀BOSS";
        }
        if (current === "titles") {
            var worn=rows.filter(function(item){return Number(item.equipped)===1;})[0];
            panel("ArchiveSummary").text="当前称号："+(worn?worn.name:"未穿戴");
            panel("ArchiveHint").text="点击称号穿戴 · 再次点击卸下 · 同时显示一个称号";
            panel("ArchiveStatus").text=Number(data.title_preview)===1
                ? "首发体验 · 本局试穿 · 英雄头顶即时显示"
                : Number(data.pending)===1?"正在保存称号…":"穿戴后在英雄头顶显示 · 纯外观称号";
            panel("ArchiveEmpty").text="当前筛选下暂无称号";
        }
        if (current === "gift") {
            panel("ArchiveSummary").text = "福利礼包 · 已解锁 " + done + " / " + rows.length;
            panel("ArchiveHint").text = "走向胜利 / 终结比赛：累计胜利 · 合作共赢：共同胜利 · 奖励叠加";
            panel("ArchiveStatus").text = "达标自动点亮，每档仅发一次 · 合作次数自功能启用起记录 · 新增属性下局生效";
        }
        var unlockedTotal = rows.filter(function(item){return A.Unlocked(item,current) === true;}).length;
        panel("ArchiveFilterAllLabel").text = "全部（" + unlockedTotal + "/" + rows.length + "）";
        var cooperationRows = current === "gift" ? rows.filter(function(item){return item.progress_kind === "cooperative";}) : [];
        var contextText = current === "starjoy_points" && data.starjoy ? "累计星悦积分 " + data.starjoy.earned
            : current === "gift" ? "累计胜利 " + (rows.length ? Number(rows[0].count) || 0 : 0) + " 次 · 合作 " + (cooperationRows.length ? Number(cooperationRows[0].count) || 0 : 0) + " 次"
            : current === "building" && data.buildings ? "信仰值 " + data.buildings.faith
            : current === "work" && data.online ? "软妹币 " + data.online.coins
            : socialPage && social ? "收藏 " + social.total + " 件"
            : current === "endless" ? "累计积分 " + (rows.length ? Number(rows[0].count) || 0 : 0)
            : current === "map_level" && data.online ? "等级 " + data.online.level + "/" + data.online.max_level : "";
        panel("ArchiveContext").text = contextText;
        var placeholderPage = title && title.renderer === "placeholder";
        panel("ArchiveFilters").SetHasClass("ArchiveHidden", !!placeholderPage);
        if (placeholderPage) {
            panel("ArchiveSummary").text = "";
            panel("ArchiveHint").text = "奖励内容与领取条件后续开放";
            panel("ArchiveEmpty").text = "奖励内容待补充";
            panel("ArchiveEmpty").RemoveClass("ArchiveHidden");
            panel("ArchiveStatus").text = "敬请期待";
        }
        var source = panel("ArchiveCurrencySource"), sourceText = "";
        if (current === "building" && data.buildings) {
            sourceText = "信仰值来源：通关每次 +" + data.buildings.per_clear
                + "\n每日上限 " + data.buildings.daily_cap + " · 今日已获 " + data.buildings.earned_today
                + "\n余额永久累积 · 通行证不加成";
        } else if (current === "starjoy_points" && data.starjoy) {
            sourceText = "累计星悦积分 " + data.starjoy.earned + " · 可用余额 " + data.starjoy.balance
                + "\n图标右上数字为解锁门槛 · 达标后自动点亮"
                + "\n不消耗积分 · 各等级奖励永久叠加";
        } else if (current === "work") {
            sourceText = "软妹币来源：实际在线每满 1 分钟 +1"
                + "\n不足一分钟累计计算"
                + "\n解锁消耗软妹币 · 通行证不翻倍";
        }
        if (source) {source.__archivePlainText=sourceText;source.html=true;source.text=sourceText.replace(/\d+/g,function(n){return '<font color="'+GameUI.CustomUIConfig().SurvivalArchiveColors.number+'">'+n+'</font>';}).replace(/\n/g,'<br>');source.visible=!!sourceText;}
        panel("ArchiveContent").SetHasClass("ArchiveHasCurrencySource",!!sourceText);

        // New card children, navigation and theme changes need the recursive
        // palette. Countdown/score updates do not change that structure.
        var paletteKey = JSON.stringify([current, filterMode, cfg.SurvivalArchiveColors || {},
            panel("ArchiveWindow").BHasClass("ArchivePurple"), panel("ArchiveDraw").enabled]);
        if (paletteDirty || paletteKey !== lastPaletteKey) {
            A.ApplyPalette(); lastPaletteKey = paletteKey;
        }
    }
    function onArchiveSnapshot(data) {
        var sequence = Number(data.sequence) || 0;
        var category = data.category_id;
        if(sequence <= (pageVersions[category]||0))return;
        if (!(data.ok === true || Number(data.ok) === 1)) {
            if (opened) panel("ArchiveStatus").text = "存档尚未就绪，正在等待玩家档案";
            if (opened) later(2, function () { if (opened) request(); });
            return;
        }
        var assembly=pageAssemblies[category];
        if (!assembly || sequence > Number(assembly.header.sequence)) {
            assembly = pageAssemblies[category] = { header: data, chunks: {}, count: Number(data.chunks) || 1 };
        }
        if(sequence!==Number(assembly.header.sequence))return;
        assembly.chunks[Number(data.chunk) || 1] = array(data.rows);
        if (Object.keys(assembly.chunks).length !== assembly.count) return;
        var complete = assembly.header;
        complete.rows = [];
        for (var i = 1; i <= assembly.count; i++) complete.rows = complete.rows.concat(assembly.chunks[i]);
        delete pageAssemblies[category];
        if(Number(complete.delta)===1){
            if(!pageCache[category]||pageVersions[category]!==Number(complete.base_sequence)){queueFullSync(category);return;}
            complete=GameUI.CustomUIConfig().SurvivalSnapshotCache.Apply(pageCache[category],complete.rows);
        }else delete resyncPages[category];
        pageVersions[category]=sequence;
        pageCache[category]=complete;
        // The void gallery already renders its fixed catalog artwork. Warming
        // another hidden copy on unrelated profile revisions adds native work.
        if (opened && category === current && category !== "shadow") array(complete.rows).forEach(function(item){
            if(!item)return;
            GameUI.CustomUIConfig().SurvivalSnapshotCache.Warm("archive:"+category+":"+(item.id||item.name)+":"+(item.icon||item.icon_path||""),function(host){if(active()&&valid(host))A.Icon(host,item,category,buildingIcons);});
        });
        render(complete);
    }
    subscribe("survival_archive_snapshot", function(data){onArchiveSnapshot(data);});
    subscribe("survival_archive_title_result",function(data) {
        titleSubmitting=false;
        if (!(data.ok===true || Number(data.ok)===1)) {
            panel("ArchiveStatus").text=data.error || "称号切换失败，请重试";
        }
    });
    function refreshEndlessStatus() {
        if (!latestEndlessState) return;
        var data = latestEndlessState;
        var status = valid(endlessStatusPanel) ? endlessStatusPanel : panel("EndlessStatus");
        if (!status) return;
        var hidden = data.status === "idle";
        var text = data.status === "running" ? "无尽第" + data.wave + "波 · 剩余" + data.remaining + "只 · " + data.seconds + "秒 · 本局" + data.score + "分"
            : "无尽结束 · 已通过" + (data.cleared || 0) + "波 · " + data.score + "分 · " + (data.reason || "");
        // This standalone HUD label remains live while the archive is closed.
        // It never invalidates the archive's cards, typography or palette.
        if (status !== endlessStatusPanel || hidden !== endlessStatusHidden) status.SetHasClass("ArchiveHidden", hidden);
        if (status !== endlessStatusPanel || text !== endlessStatusText) status.text = text;
        endlessStatusPanel = status; endlessStatusHidden = hidden; endlessStatusText = text;
    }
    subscribe("survival_endless_state", function (data) {
        if (!data) return;
        latestEndlessState = data;
        refreshEndlessStatus();
        if (opened && current === "endless" && Number(data.remaining) === 0) {
            var key = JSON.stringify([data.status, data.wave, data.cleared, data.score]);
            if (key !== endlessRequestKey) { endlessRequestKey = key; request(); }
        }
    });
    function close() {
        opened = false; fitGeneration++;
        if(voidView)voidView.Leave();
        if(A.HideCardText)A.HideCardText();
        if(active()){
            panel("ArchiveScrim").AddClass("ArchiveHidden");
            if(archiveShell)archiveShell.Close();
            panel("ArchiveWindow").AddClass("ArchiveHidden");
            hideTooltip();
        }
    }
    function dispose(){
        if(disposed)return;
        close();disposed=true;
        timers.forEach(function(timer){if($.CancelScheduled)$.CancelScheduled(timer);});timers=[];
        subscriptions.forEach(function(id){if(GameEvents.Unsubscribe)GameEvents.Unsubscribe(id);});subscriptions=[];
        if(archiveShell&&archiveShell.Dispose)archiveShell.Dispose();
        if(purpleShell&&purpleShell.Dispose)purpleShell.Dispose();
        if(voidView)voidView.Dispose();
        if(valid(lifetimeMarker))lifetimeMarker.DeleteAsync(0);
    }
    function registerToolsProbe(){
        if(!active()||!Game.IsInToolsMode||!Game.IsInToolsMode())return false;
        var probe=cfg.SurvivalClientCallbackProbe;
        if(!probe||!probe.RegisterModule)return false;
        var registered=probe.RegisterModule("archive",[
            {name:"snapshot",get:function(){return onArchiveSnapshot;},set:function(fn){onArchiveSnapshot=fn;}},
            {name:"render",get:function(){return render;},set:function(fn){render=fn;}},
            {name:"tabs",get:function(){return tabs;},set:function(fn){tabs=fn;}}
        ],Number(cfg.HandoffGeneration||0));
        if(voidView&&voidView.RegisterToolsProbe)voidView.RegisterToolsProbe();
        return registered;
    }
    // Re-evaluating only this controller must not retain the previous row tree.
    panel("ArchiveGrid").RemoveAndDeleteChildren();
    var archiveShell=U.ModalShell.Adopt({id:"archive",panel:panel("ArchiveWindow"),root:$.GetContextPanel(),scrim:panel("ArchiveScrim"),header:panel("ArchiveHeader"),titlePanel:panel("ArchiveTitle"),closeButton:panel("ArchiveClose"),width:1280,height:800,fit:archiveFit,onClose:close});
    U.ActionButton.Adopt(panel("ArchiveDraw"),{variant:"gold"}); U.Tooltip.Adopt(panel("ArchiveTooltip"));
    A.Init();
    var purpleShell=cfg.SurvivalPurpleShell?cfg.SurvivalPurpleShell.Adopt({id:"archive",panel:panel("ArchiveWindow"),width:1280,height:800,onClose:close}):null;
    GameUI.CustomUIConfig().SurvivalArchive = api = {
        IsOpen: function () { return active()&&opened; },
        Open: function () { if(active()&&!opened)this.Toggle(); },
        SelectCategory: function(id) {
            if(!active())return;
            var tab=panel("ArchiveTab_"+id);
            if(tab && tab.enabled && tab.__archiveActivate)tab.__archiveActivate();
        },
        Toggle: function () {
            if(!active())return;
            if (opened) { close(); return; }
            opened = true;
            panel("ArchiveScrim").RemoveClass("ArchiveHidden");
            archiveShell.Open();
            panel("ArchiveWindow").RemoveClass("ArchiveHidden");
            if(pageCache[current]){render(pageCache[current]);if(needsSync())request(true);}else {renderVoid(null);request(true);}
        },
        Filter: function(mode){if(!active()||["all","unlocked","locked"].indexOf(mode)<0)return;filterMode=mode;if(lastData)render(lastData);else renderVoid(null);},
        Close: close,
        Dispose: dispose,
        Refresh: request,
        RegisterToolsProbe: registerToolsProbe
    };
    $.RegisterEventHandler("Cancelled", panel("ArchiveWindow"), function () {
        if(!active())return true;
        var layers = GameUI.CustomUIConfig().SurvivalUILayers;
        if (layers && typeof layers.HandleEscape === "function") return layers.HandleEscape("archive");
        close();
        return true;
    });
    later(0.2,function(){if(!pageCache[current])request(true);});
    registerToolsProbe();
})();
