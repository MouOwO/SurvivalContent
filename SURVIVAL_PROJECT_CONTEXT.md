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

## 验证清单
- [x] XML 结构检查
- [x] JS 静态语法检查
- [x] Panorama resourcecompiler 编译成功
- [x] game 端 `.vxml_c/.vcss_c/.vjs_c` 时间戳更新
- [ ] 完全重启 Workshop Tools
- [ ] 原版底栏开局消失
- [ ] 新底栏 2 秒后向上滑入
- [ ] 新底栏最终紧贴屏幕底边
- [ ] 六项属性均竖排且数值更新

