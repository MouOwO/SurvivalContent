# 存档物品图标 · 首批试用

生成方式：内置 imagegen。四张独立生成，无文字、无卡框、真实 RGBA Alpha；保留 1254×1254 原始母图。显示区域统一 93×74 设计像素，`stretch-to-fit-preserve-aspect` 等比显示，不拉伸物品。

| 文件 | 对应物品 ID | 名称 | 项目原效果 |
| --- | --- | --- | --- |
| shadow_01_v1.png | shadow_01 | 幻象树枝 | 木材+10 |
| shadow_02_v1.png | shadow_02 | 贪婪金币 | 金币+1 |
| shadow_03_v1.png | shadow_03 | 虚无模块 | 墙生命+100 |
| shadow_04_v1.png | shadow_04 | 粘稠之泥 | 墙每秒生命+1 |

效果来自 `data/csv/存档系统/archive_shadow_items.csv`，本批未修改奖励或持有数量。

替换入口：`data/csv/存档系统/archive_item_icons.csv`。

- 新图放入 `panorama/src/images/`，建议新版本文件名，保留旧版本。
- 修改 `icon_path`（相对于 images 目录）、`display_width`、`display_height`。一般保持显示尺寸，调整原图内容留白即可。
- `category_id + item_id` 关联真实条目；不要为了换图修改物品 ID、名称或属性表。
- `enabled=0` 暂停该条图标覆盖；该物品使用原有绘制逻辑。
- `art_status=trial` 表示等待本批美术验收。
- `tools/read_archive_icons.py` 校验 ID、名称、路径、显示尺寸、真实 Alpha，并从来源表读取描述。

重建与测试：`node spikes/remaining_ui_handoff_v1/prepare.cjs`，然后 `node spikes/remaining_ui_handoff_v1/verify.cjs`，最后用该目录的 `deploy_test.ps1` 部署隔离测试地图。Python 路径可用 `SURVIVAL_PYTHON` 指定，需要 Pillow。

游戏内查看：隔离测试地图 `survival_ui_handoff_v1` → 存档 → 右上角「图标试览」。试览不表示已获得；实际「虚空之影」已拥有列表中的相同物品 ID 也使用这四张图标。

完整生成提示词：`spikes/remaining_ui_handoff_v1/archive_icon_prompts.json`。图标尺寸/Alpha/哈希记录：同目录 `archive_icon_manifest.json`。
