# SURVIVAL_PROJECT_CONTEXT.md

> 本文件是 QClaw 跨会话项目上下文。每次处理本项目时先阅读，并在完成操作后更新。仅记录已确认事实、已执行操作、验证结果和待办，不保存密码或密钥。

## 项目路径
- Panorama/Lua 源资源：`D:\steam\steamapps\common\dota 2 beta\content\dota_addons\survival`
- 游戏运行/编译资源：`D:\steam\steamapps\common\dota 2 beta\game\dota_addons\survival`
- Git 仓库当前确认位于运行端：`game\dota_addons\survival`
- Panorama 编译器：`D:\steam\steamapps\common\dota 2 beta\game\bin\win64\resourcecompiler.exe`

## 长期目标关键词
- Dota 2 survival addon
- Panorama UI / 原生 HUD 隐藏
- 自定义英雄底栏 / 2 秒延迟滑入 / 贴合屏幕底边
- 剑、护甲、攻速、力量、敏捷、智力竖排
- 商店左上角 / 右侧抽屉 / shop.css 冲突
- Zeus 无箭矢 / 即时闪电 / 单次伤害
- content 源端与 game 编译端同步

## 当前 UI 目标
1. 游戏开始立即隐藏原版下方 HUD。
2. 自定义英雄底栏初始位于屏幕下方不可见，开始后 2 秒向上滑入。
3. 滑入完成后，自定义底栏最下端与显示区域最下端贴合，无底部间隙。
4. 新底栏常驻竖排显示：攻击、护甲、攻速、力量、敏捷、智力。
5. 后续将英雄头像/血蓝状态接入真实数据和图像。

## 2026-07-20 16:35 本轮修改
- 备份：`.qclaw_backup\bottom_hud_slide_20260720_163548`
- 修改 `panorama/layout/custom_game/survival_hud.xml`：新增 `SurvivalHeroBottomHUD`，含头像占位、血蓝条和六项竖排属性。
- 修改 `panorama/styles/custom_game/survival_hud.css`：底栏固定 `left + bottom`；`HudHidden` 使用 `translateY(132px)`；过渡 0.45 秒，结束后底边贴底。
- 修改 `panorama/scripts/custom_game/combat_stats.js`：加载 2 秒后移除 `HudHidden`，触发向上滑入。
- 原生 HUD 隐藏仍由 `ui_bootstrap.js` 中 `DotaDefaultUIElement_t` 配置负责。
- 已完成：`survival_hud.css`、`combat_stats.js`、`survival_hud.xml` 已通过 resourcecompiler 编译到 game 端（`PANORAMA_COMPILE_PASS`）。
- 尚未完成：Workshop Tools 重启、实机截图验证、真实英雄头像与血蓝数据绑定。

## 商店已知问题
- `survival_hud.css` 与后加载的 `shop.css` 对 `#CustomShopButton`/`#CustomShopWindow` 存在样式覆盖冲突。
- `shop_ui.js` 首次点击需要按 `ShopOpen`/`Closed` 判断，不能只判断 `Hidden`。

## Zeus 已知问题
- 基础单位 `building_arrow_tower` 仍配置 Drow 箭投射物。
- `modifier_tower_attack_effects.lua` 监听 `ON_ATTACK_LANDED`，因此闪电发生在弹道命中后。
- 目标是攻击触发时即时闪电、无箭矢、主目标只结算一次伤害；连锁目标单独结算，避免重复伤害。

## 2026-07-22 01:59 研究所效果接入续做
- 修复并复核 `shop_system.lua` 的科技状态查询、玩家 ID 校验和快照上下文，移除此前残留的重复函数片段。
- `shop_grant_service.lua` 现在按 `technology_group` 严格逐级发放科技，并发送 `TECHNOLOGY_CHANGED`；新增一次性 `technology_service` 解锁处理。
- 伐木工科技已接入现有 worker/modifier/tree 链路：效率、攻速、暴击率会作用于现有及新训练单位；暴击本次采集木材翻倍，并携带玩家 ID。
- 防御塔攻击和城墙生命已接入建筑升级系统的科技刷新；路线/转职塔保存路线基础攻击，避免等级 6+ 被基础箭塔表覆盖。
- 静态检查通过：Lua 词法级括号检查、`git diff --check`、`shop_ui.js node --check`、`shop.css` 结构检查。
- resourcecompiler 使用 `-game D:\steam\steamapps\common\dota 2 beta\game\dota -f -nop4` 成功编译 `shop_ui.js` 与 `shop.css`：`OK: 2 compiled, 0 failed, 0 skipped`。
- 未完成：完全重启 Workshop Tools 后实测研究所解锁/逐级购买、玩家隔离与持久化、伐木工效果、塔攻击、城墙生命和失败退款语义；未执行全量配置重建。

## 2026-07-22 02:39 普通科技两段式续升级
- 将五种普通科技拆为两层：第一层 Lv.1–10，第二层使用独立 `technology_id` 生成 Lv.11–20，但共享原 `technology_group`，因此服务端等级和运行效果连续。
- 第一层标记 `technology_phase=1`；第二层标记 `technology_phase=2`，在当前普通科技低于 Lv.10 时不进入快照，达到 Lv.10 后才显示 Lv.11。
- 高级科技标记为阶段 `0`，不参与普通科技切层过滤，仍在对应普通科技达到 Lv.10 后解锁，并可与普通科技 Lv.11–20 并行升级。
- Lua 文本结构检查与 `git diff --check` 通过；本轮只有 Lua 配置/快照逻辑变化，无需 Panorama 编译。需完全重启 Workshop Tools/地图会话验证切层。

## 2026-07-22 02:24 修复普通科技 Lv.10 后 UI 消失
- 根因：`shop_catalog.build_snapshot()` 原先先用 `purchasable == 1` 过滤，再按“当前等级 + 1”筛科技；普通科技达到 Lv.10 后，其对应高级科技仍因锁定而被提前过滤，导致整组科技 UI 消失。
- 修复：科技条目只要是当前下一等级就保留在快照中；`purchasable` 和 `disabled_reason` 继续由条件评估器控制。这样伐木效率可继续显示 Lv.11–Lv.20，其他普通科技达到 Lv.10 后仍显示对应高级科技锁定卡片。
- 已确认等级规则：伐木工速度/防御塔强化/墙强化/伐木工暴击普通科技最高 Lv.10；伐木效率普通科技最高 Lv.20；高级科技从对应普通科技 Lv.10 解锁。
- Lua 词法级结构检查与 `git diff --check` 通过。需完全重启 Workshop Tools/地图会话加载运行端 Lua 后实测。

## 验证清单

