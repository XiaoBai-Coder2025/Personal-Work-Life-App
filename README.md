# 个人工作生活 App

一个只在本机运行的个人工作生活管理工具：把"当天要做的事"和"长期推进的事"放在同一套数据里，数据全部保存在本机，不登录、不上云。

功能与范围见 [PRD.md](PRD.md)，产品介绍见 [docs/产品说明.md](docs/产品说明.md)。

## 需要什么

- Node.js 20 或更高（验证过 24）
- Windows 10/11 64 位（打包脚本只支持 Windows）
- 可选：高德地图 Key、一个 OpenAI 兼容的 AI 服务（不填也能用，只是地图和 AI 助手不可用）

## 快速开始

```
npm install          # 安装依赖，第一次会下载 Electron，约 150MB
npm start            # 启动本地服务，浏览器打开 http://localhost:4317
```

Windows 上也可以直接双击 `启动.bat`，它会起服务并打开窗口。

## 打包成 exe

双击 `打包exe.bat`，产物在 `dist\个人工作生活-win32-x64\个人工作生活.exe`。
打包脚本会优先使用本机已下载的 Electron 缓存，离线也能打包。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm start` | 启动开发版（浏览器窗口） |
| `npm run app` | 用 Electron 直接运行桌面版 |
| `npm test` | 跑全部测试（111 条，不需要联网） |
| `npm run check-ui` | 用 Electron 真跑一遍界面，抓控制台报错、溢出、布局问题 |
| `node tools/probe-map.mjs` | 地图排障：打印配置来源、画布状态与高德报错 |
| `node tools/check-amap.mjs` | 高德 Key 排障：直连与经代理各请求一次，输出高德原文 |
| `node tools/verify-package.mjs` | 校验打包产物里是不是最新代码 |

## 数据存在哪

- 开发版（`npm start`）：项目目录下的 `data/`
- 打包版：`%APPDATA%\个人工作生活\data`
- 备份：设置页导出，落到 `backups/` 目录，同时下载一份

`data/` 与 `backups/` 不会进版本库。

## 配置 Key

在「数据与设置 → 接口 Key」里填，保存后点「检测地图与接口」查看结果：

- **高德 JS Key** + **安全密钥**：地图显示。Key 类型必须是「Web端(JS API)」
- **高德 Web服务 Key**：路线、周边、地点搜索、天气。类型必须是「Web服务」
- **AI Key**：AI 助手与文件导入，按 OpenAI 兼容接口填服务地址与模型名

地图若加载不出来，把「地图密钥方式」从"代理转发"改成"明文"再试。

## 目录结构

```
server.js      本地服务入口（静态页面、数据接口、高德与 AI 代理）
main.js        Electron 主进程
src/           服务端：路径常量、数据读写、备份、AI 转发、文件正文提取
web/           前端：外壳、七个模块、排布引擎等
test/          测试
tools/         排障与打包校验脚本
build/         图标（由 tools/make-icon.mjs 生成）
```

## 已知限制

- 地图与 AI 需要联网；其余功能离线可用
- 打包产物约 180MB（Electron 运行时）
- 文件导入支持 txt、md、csv、pdf、docx；扫描件读不出文字会明确报错
- `npm test` 里的 PDF/Word 用例只验证"坏文件不会瞎猜"，不验证真实文件解析（那需要真实样本）
