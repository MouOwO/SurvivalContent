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

## 2026-08-27 Cosmetic Portrait Phase 2A 隔离尖峰
- 已在运行端仓库 `spikes/portrait_world_unit_phase2a` 建立 CSV 驱动的隔离源，并部署 sibling addon `survival_phase2a`；四阶段严格为 Base Axe → Head `22217` → Head + Weapon `22218` → 五件 ItemDef，所有 style 显式为 `0`。
- `portrait_world_unit` 字段来自本机官方 prefab 取证；Panorama 使用静态 `DOTAScenePanel map/camera` 绑定，不使用旧 `SetUnit` 第二参数，不添加 `skin_override`，也不修改 survival 生产 HUD、地图或饰品服务。
- 专项契约、PowerShell 解析、Lua 5.1、XML 与 Resource Compiler 均通过；入口地图、四张 scene VPK 和五个 Panorama 编译产物已生成。自动直启只到 Asset Browser/Idle loading，尚未进入 `phase2a_lab`，因此四阶段渲染与 wearable 行为仍待 Workshop Tools 人工冷启动，且未进入 Phase 2B。
- 用户已人工确认正式环境 Axe 的 `Phase 2A Baseline`：世界模型正常；正式左下 `Portrait` 为基础 Axe；当前未同步自定义饰品。该状态不替代隔离 Test 1 的运行证据。
- 后续只执行隔离 Test 1（Base Axe）；Test 1 PASS 后只加载 Head ItemDef `22217`，不测试其他 ItemDef，不修改正式 HUD、世界 `prop_dynamic`、Juggernaut 或 Monkey King，也不进入 Phase 2B。

## 验证清单

## 2026-10-07 Content 同步及界面回退修复
- Content 本地称号历史稿已保存于 `5109351`，合并提交为 `79b4f14`，54 个历史脚本不加入当前加载链。
- 实机发现远端来源的旧 HUD 接入覆盖了主分支后续 UI：抽奖背景、全屏样式、动画、导航与头像接入缺失。以 Game 共同祖先 `fa3b661d` 对两侧源文件重新合并，保留研究可用性、取消任务、输入路由和支付修复。
- Content 原生文件中的 `ui-resource://` 必须先经资源表转换；公共依赖样式和抽奖片段已修复为 `file://{images}/`，Game 侧原始资源映射继续保留。
- 增加 `tools/test_ui_content_contract.py` 防止再次遗漏 HUD 样式、脚本与必要面板。相关抽奖、VIP、合成、研究、头像和输入检查通过，修复的原生资源编译通过。
- 另从实际服务器只读核对到已部署结算包 `288f724bcfd79880c4fbd7d4ac77040a8636e2f8f3ef96836632001340d3b2a7`，Game 本地指纹已对齐。未改线上奖励或玩家资产；实机已读到四个奖池、119 张普通券和可用抽奖按钮。

## 2026-10-21 四账号工坊测试准备

- Game/Content 本轮已先分别检查并同步；Game 原有102处改动完整保留。
- 对外地图仅 `template_map`、4人，其他开发地图不列入玩家地图列表。
- 本次生产客户端关闭真实现金下单、付款码、外链和月卡开通；G币/积分钱包及已持有权益保留。8份Panorama脚本已配套同步和编译。
- 工坊封面原图：`publishing/workshop/gucheng_zhuxiao_cover_master.png`；提示词：同目录`cover_prompt.md`。上传JPEG在Game仓库，1254×1254、605055字节。
- 已实现四Steam账号准入和签名运行包交接；真实4个SteamID64和条目选择未提供，名单未启用，未上传。
- 新候选：`D:/Survival_发布候选/20261021_noncommercial_preflight_01`，序号2026102102，6621运行文件；全文件、签名、Lua语法和数据探针通过。候选仍不是可上传四账号包，填入名单后需重构新签名版本。
- 云端只读健康检查通过，支持4个worker；存档仍使用127.0.0.1:8765，缺工坊托管服可访问的HTTPS和可信认证。本轮未改现网/迁移数据库/重启服务。
- 未完成最终候选原生测试、工坊上传和四台电脑联机；按用户要求收到配置后先受限上传，再下载测试。
- Game详细说明：`docs/release_test_20261021.md`；后台复现：`validation/20261021/four_client_backend_preflight.json`。

## 2026-10-22 四账号 v02 与 4:3 工坊素材同步

- 实际四个 SteamID64 已纳入签名候选并启用四账号准入：76561198104787442, 76561198424163156, 76561198845461206, 76561198974301984。该限制针对账号，不等同于物理电脑识别。
- 本轮新增 4:3 封面原图 `publishing/workshop/gucheng_zhuxiao_cover_4x3_master.png`，1448×1086；`publishing/workshop/cover_prompt.md` 同步完整生成及4:3重构提示词，原字节与 Game 一致。既有方图记录保留。
- 已签名生产候选：`D:/Survival_发布候选/20261022_four_accounts_v02`；发布序号 `2026102202`，6,621个运行文件；签名清单内容 SHA256：`1c09e562ada4586ba4c046616e94317bf062c308a0c0c507e5af59d7b9024b6d`。
- 为隔离并行开发，打包工具与门禁冻结自已评审提交 `4edea828552ee522bc19bcfaa1c2a8ea14172d2b`，另独立重放本任务10处账号绑定修复；profile SHA256 为 `ad2ba8edf96c45f8730df8f1d5289414f8e4f1a3bd05cd95827c9dc690e39a86`。未把工作区 development 配置、后续难度改动混入候选。
- 流式单VPK已本地构建并由独立第二实现全量回读：`D:/Survival_工坊输出/20261022_four_accounts_v02/1.vpk`，3,766,823,010字节；SHA256：`9060dcd81a53762366c8d8598911489983da6c85b5134d64022396aa8f60ad4d`。全部6,621项CRC32、清单MD5/SHA256/大小及三个VPK MD5通过，3,007项offset跨signed32边界仍能正确工具回读。`1`为构建时占位名；获得真实ID后已无损改名为`3824360109.vpk`。
- 官方 Workshop Manager 首次本地打包崩溃；刷新本人列表及SDK查询为空后，改用流式VPK和官方Steam SDK成功上传唯一隐藏条目`3824360109`（孤城逐晓 · 封闭测试），owner `76561198845461206`、AppID570、Custom Game、visibility=2均已核对。没有修改Valve DLL，也没有代为同意协议。
- 云端四账号门禁尚未部署；Valve托管服到云存档的HTTPS及可信认证连接尚未完成，不能把本地签名/打包通过当作云端或联机验收。
- 本轮为非现金受限测试：生产候选关闭真实充值、付款码、支付外链和月卡新开通，保留G币/积分钱包消费及既有权益。
- Steam实际下载副本已全量通过：`D:/SteamLibrary/steamapps/workshop/content/570/3824360109/3824360109.vpk`，整个VPK大小/SHA256与上传包相同，6621项CRC/双哈希及三个MD5全部通过。原生地图和四台电脑联机仍未验收；本机或Valve托管开房方式已询问用户，未用超时替代选择。
- Game详细记录：`docs/release_test_20261022.md`；运行校验及恢复日志保留在忽略目录`output/four_accounts_20261022/`，不提交缓存、口令或私钥。
