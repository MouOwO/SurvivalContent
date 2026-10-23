# 四账号游廊独立测试接入

用户于 2026-10-23 选择独立测试存档。现有存档、数据库和支付进程不迁移、不重启。

## 连接与隔离

- 对外测试入口：`https://pay.xiaofengnet.com/ws4`；仅开放列明的游戏 POST 路由，健康检查不对外代理。
- 独立 API：`goufayu-ws4.service`，`127.0.0.1:18765`，系统账号 `goufayu-ws4`。
- 独立数据库：`goufayu-ws4-db.service` / Podman `goufayu-ws4-db`，`127.0.0.1:15432`，数据库 `goufayu_ws4`，新卷 `goufayu-ws4-data`。
- 程序、私有配置和状态目录分别为 `/opt/goufayu-ws4`、`/etc/goufayu-ws4`、`/var/lib/goufayu-ws4`。密码、账号映射pepper和内部令牌均新生成且只保留在云端私有配置中。
- 后端基于已核验的 `20261021-benefits-47accd81d922`，完整源清单 711 文件。原库只导出结构，未复制玩家、订单、余额或支付记录；测试接口没有支付路由。
- 四个账号名单同时在游戏与 API 的原始账号到数据库账号边界检查。未配对的服务端即使提交名单内账号也无权读取档案。
- 开发工作区 `config/workshop_connection.lua` 保持禁用；冻结签名游廊候选显式启用。Tools继续使用原有本地隧道/私有ConVar流程。

## 首次可信配对

游戏仅在 Valve 专用服上调用 `GetDedicatedServerKeyV3`，实际密钥只经 HTTPS 请求头发送给测试API，不写源码、Panorama、公开网络表或日志。

API未授权时只记录密钥的SHA256，向游戏返回16位不可逆认证指纹，并保持入场关闭。既不自动信任首次请求，也不把账号名单当成身份认证。

1. 作者从原隐藏条目 `3824360109` 创建真实游廊对局。
2. 加载提示会显示“测试服务器首次接入”及16位认证指纹；作者通过当前可信会话确认该指纹。
3. 运维只在确认后运行下列命令，绑定最近30分钟内唯一匹配的待配对记录；不从待配对列表自行挑选首次请求。

```powershell
& 'D:/Survival_安全工具/venv/Scripts/python.exe' -B tools/workshop_test/deploy.py pending
& 'D:/Survival_安全工具/venv/Scripts/python.exe' -B tools/workshop_test/deploy.py approve --fingerprint 作者确认的16位指纹
```

批准后API实时读取私有pin文件，正常重试即可继续认证，不需要重启现役服务。配对界面只显示SHA256前缀，不能凭该指纹直接调用API。

## 构建与验收

`tools/workshop_test/build_candidate.py` 从前一签名v02候选保存全部资源、玩法和180份保护模块，仅加入两个连接模块并修改HTTP传输、入场错误映射和两个编译UI脚本。两个UI以原评审提交的源码加指纹提示定向编译，随后恢复开发工作区源码和编译产物。候选使用新签名序号 `2026102301`，不把后续开发改动混入冻结版本。

部署步骤分别记录在 `output/workshop_auth_20261023/`。独立API验证必须覆盖匿名拒绝、未配对拒绝、四个合法账号认证、第五账号拒绝以及临时测试pin清除。上线后仍须完成真实Valve服首次配对和入场验证，不能把准备或健康检查当成游戏已经可进入。
