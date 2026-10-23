# 四账号本机独立测试启动器

双击项目根目录的 `launch_ws4_local_test.cmd`。先退出已有 Dota 2，保留 Steam 运行；不用先打开游廊或选择服务器地区。启动器会校验冻结测试副本、连接独立测试服务，然后打开游戏。

保留启动器窗口。游戏载入后按界面正常开始加载、选择模式和难度。退出游戏后，本机连接助手自动停止。关闭助手窗口会中断这局的后端连接，因此测试时不要提前关闭它。

启动器发现已有 Dota 进程时会提示先退出，保留原对局。不会自动杀进程、替换正在运行的地图或修改已有存档。

## 版本与数据范围

- 使用单独的 `game/dota_addons/survival_ws4_local` 和对应的独立内容目录；原 `survival` 两个仓库保留原样。
- 基于签名冻结候选 `20261023_ws4_auth_v03`，内容ID `a8ad3b474799bbc07821b568120ec442a2c25a74826fe2e0e92696a09ca36335`。校验清单先重算固定内容ID，再核对所有文件双哈希。除Tools本机路由及新增助手模块外，冻结玩法和资源不变。
- 本机转发只监听 `127.0.0.1:18766`，固定接入 `https://pay.xiaofengnet.com/ws4`。独立库仍为 `goufayu_ws4`；原数据库、存档、支付服务及旧本机隧道不迁移。
- 四个测试账号由游戏和API继续检查。启动器可指定预计人数1至4，但多机联机仍需单独验证，不把四账号API测试当成四机联机验收。
- 本机主机属于作者信任的测试环境。新增的是独立本机助手凭据，不能把它标记为Valve服务器凭据；普通游廊的Valve认证没有被绕过。

## 凭据与连接

云端助手凭据仅保存在当前Windows用户的 `%LOCALAPPDATA%/SurvivalWS4/local-host.json`，文件ACL限制当前用户、管理员和SYSTEM。游戏包、源码、命令行和日志不含该凭据。云端只登记摘要，不从待配对列表自动选择请求。

每次运行另生成本机短期凭据，游戏只用它访问回环转发。通过受限临时KV文件注入，确认应用后即删除；退出或失败清理时也删除。转发助手才持有云端凭据，且不跟随携带凭据的HTTP重定向。不转发支付路径。

Tools控制台使用独立端口29003，避免旧Hammer助手使用的29000端口。连接助手只读取限定状态和调用正常认证/加载接口，不伪造认证、跳过入场屏障或覆盖已加载档案。

## 检查与维护

状态文件：`output/ws4_local/status.json`。只记录阶段、人数、认证计数和固定错误码，不记录凭据或存档正文。

```powershell
# 默认单人主机。预计人数需与实际加入人数一致。
tools/workshop_test/launch_local.ps1 -ExpectedPlayers 1

# 标准库Python即可运行；不通过py启动器隐式安装运行时。
python -B tools/workshop_test/local_host.py status
python -B tools/workshop_test/local_host.py preflight
python -B tools/workshop_test/local_host.py install

# 仅当助手脚本更新后使用：先验证原副本未被修改，再更新已知助手覆盖项。
python -B tools/workshop_test/local_host.py install --refresh
```

首次安装需要本机已有的固定冻结候选、Python 3.10+、Node.js、Steam与Dota 2 Workshop Tools。本机私有凭据首次登记通过项目固定SSH主机校验和既有专用密钥执行；不会把这些本机密钥加入提交。此启动器当前面向本机，不是已验证的其他电脑分发包。

`preflight`验证真实四账号认证、本机HTTP转发、标准模式登录与读档、第五账号拒绝、错误本机凭据拒绝和支付路径拒绝。完整游戏入场需要另外观察实际游戏状态；仅检查通过或进程启动都不等同于已经进入对局。
