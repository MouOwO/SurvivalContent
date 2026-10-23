# 2026-10-23 工坊工具启动 Failed to read 16 bytes

## 证据

- 用户在打开 Dota 2 创意工坊工具时反复看到该错误。
- 当天 `dota2_2026_1023_073335_0_error.mdmp` 和 `073831` 两份记录均挂载测试条目 `3824360109`，包含 `Unknown read error 87`、`MarkContentCorrupt` 和 `Failed to read 16 bytes`。
- 下载包 3,766,823,010 字节，SHA256 `9060dcd81a53762366c8d8598911489983da6c85b5134d64022396aa8f60ad4d`，与前日上传记录一致。全部 6,621 文件的 CRC32、签名清单 MD5/SHA256，以及 VPK 三个摘要均通过。
- Valve `resourceinfo.exe -game <game/dota> -i <旧包>` 独立复现相同错误。不是根据截图猜测，也没有将重下同一包当成修复。
- 仅转换 VPK v1 可列出目录，但大偏移资源仍读失败，已排除该方案。当前证据定位到原生单大包偏移读取兼容问题，未声称已经定位 Valve 源码中的具体缺陷。

## 修复

- 保留发布序号 `2026102202`、签名内容 `1c09e562ada4586ba4c046616e94317bf062c308a0c0c507e5af59d7b9024b6d` 与全部运行字节。
- 新目录 VPK `3824360109.vpk` 为 272,936 字节，SHA256 `1d3b7aba3c5d0b0015b4fd33027dac0c077ac41170367179cdb7aafc22110276`。
- 四个资源卷依次为 1,073,317,940 / 1,068,730,788 / 1,072,379,183 / 552,122,163 字节，均小于 1 GiB。总包大小保持不变。
- 可复核新包：`D:/Survival_工坊输出/20261023_read16_split/`。
- 本机下载目录：`D:/SteamLibrary/steamapps/workshop/content/570/3824360109/`。
- 本机原包完整备份：`D:/Survival_工坊备份/20261023_read16/3824360109.vpk`。恢复时先关闭 Dota，将分卷五文件移出下载目录，再放回备份；不能混放不同版本。
- 新增 `tools/repair_workshop_vpk.py`，修复前要求固定签名和已发布整包 SHA256；普通打包自动分卷，上传和下载验证覆盖所有卷。没有修改地图、美术、Lua或Panorama源码。

## 验证边界

- 分卷后前部资源、原先超过 2 GiB 的城墙贴图、末尾 `teal_png.vtex_c` 均经 Valve 原生读取 EXIT=0；原来对应位置读取失败。
- 完整 6,621 项签名清单、CRC和双哈希，以及目录VPK三个摘要通过。运行证据位于 Game 忽略目录 `output/arcade_read16_20261023/`。
- 本机分卷安装后，以 `-tools -steam -addon survival -condebug` 实际启动 Workshop Tools，进程持续响应，资源扫描完成，未再出现该 fatal，也无新增崩溃 dump。启动日志与存活时间记录在 `tools_startup_console.log`、`tools_startup_result.json`；47项打包、修复和发布保护回归通过。
- 编辑器会扫描插件内被Git忽略的诊断VPK；本次测试副本已移出插件扫描范围，后续大包诊断文件一律放在安装目录之外。
- 最初本机修复完成时远端仍为旧单包；随后收到用户明确“更新”授权，已按下节更新原条目。
- 资源读取通过不等于完整地图加载或四台电脑联机验收；工坊分发结果见下节。

## 原隐藏条目更新与正式下载验收

- 用户明确授权后，于北京时间 2026-10-23 08:02 成功更新原条目 `3824360109`；没有创建新条目。本人 Steam SDK 查询仍为 `visibility=2`、`Custom Game`，标题与封面保持原样。
- 新远端 manifest 为 `3082359956653095025`，替代原 `8755349131273026539`。Steam日志确认上传 `OK`，随后检测到远端 manifest 变更并正式完成更新下载。
- 正式下载目录内恰好为目录VPK加四个资源卷，五文件大小与SHA256均与上传包一致；6,621项CRC32、固定签名清单MD5/SHA256及目录VPK三个摘要全部通过。
- 对正式下载副本分别读取四个卷中的贴图，以及包末尾 `teal_png.vtex_c`，Valve原生 `resourceinfo.exe` 五次均为 `EXIT=0`。
- 正式下载后再次启动 Survival Workshop Tools，资源依赖图已创建、进程持续响应，未出现相关fatal或新增崩溃dump；证据为 `remote_tools_result.json` 和 `remote_tools_console.log`。
- 发布序号仍为 `2026102202`，全部运行内容字节与四账号名单保持原样，真实现金支付仍关闭。
- 上传、正式下载和原生读取证据：Game忽略目录 `output/arcade_read16_20261023/steam_update.log`、`remote_download_verified.json`、`remote_native_result.json`。发布恢复journal仍使用原条目ID，没有另建条目。
- 工坊多文件分发已通过本机正式下载验收；完整地图加载、四台电脑联机与远端存档连接仍不属于本次启动修复的验收结论。
