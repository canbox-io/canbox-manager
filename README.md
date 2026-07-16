# canbox-manager

Canbox 管理器 APP。Canbox 产品包中**唯一的预装 APP**，是用户进入 Canbox 生态的入口。

## 在架构中的位置

```
canbox-{version}-{platform}/
├── electron/                        # Electron 运行时
├── canbox-core/                     # 核心注入模块
│   └── injection.js                 # 提供统一环境 + 公共服务
├── canbox-manager/                  # ← 本仓库（唯一预装 APP）
│   ├── package.json
│   ├── main.js
│   ├── preload.js
│   └── build/                       # Vue 构建产物
└── canbox-manager.desktop
```

**canbox-manager 不拥有任何特殊权限。** 它和其他 Canbox APP 完全平等——都是通过相同方式启动：

```bash
electron -r canbox-core/injection.js canbox-manager/ --app-id=canbox-manager --no-sandbox
```

## 职责

### 1. APP 管理

- 查看已安装的 APP 列表（读 `apps/{appId}/package.json` + `logo.png` 获取元数据）
- **导入 APP**：用户选择 canbox 标准 zip 包 → 解压到 `apps/{appId}/` → 生成随机 appId → 记录 id→appId 映射
- **从仓库下载**：浏览 repo 中的 APP，下载 zip 安装
- 删除 APP（`rm -rf apps/{appId}/`）
- 清理 APP 数据（`rm -rf data/{appId}/`）
- 启动 APP（`electron -r injection.js apps/{appId}/app.asar --app-id={appId} --no-sandbox`）

### 2. 网页应用 / PWA 应用

将任意网址封装为桌面应用，无需 canbox-core 注入，独立 userData，与平台其他 APP 完全隔离。

**创建流程**：
1. 用户输入网址 → 自动补全 `https://` 前缀
2. 点击"自动抓取" → 后端 fetch 网页 HTML → 解析 `<link rel="manifest">` → fetch manifest.json → 选最大尺寸 PNG 图标 → 预填名称/图标/主题色
3. 用户可调整名称、窗口宽高、是否显示菜单栏
4. 提交后生成 `apps/{appId}/` 目录，含 `package.json` / `main.js` / `logo.png`
5. 同时生成系统 launcher（与普通 APP 一致）

**应用类型自描述**（`package.json` 扩展字段）：
```json
{
    "canbox": {
        "type": "web",
        "webApp": {
            "url": "https://chat.baidu.com/",
            "isPwa": true,
            "manifestUrl": "https://chat.baidu.com/manifest.json",
            "themeColor": "#...",
            "backgroundColor": "#...",
            "menuBar": true,
            "width": 1280,
            "height": 800
        }
    }
}
```

**APP 列表角标**：`type === 'web'` 显示角标，PWA 显示绿色 `PWA`，普通网页显示灰色 `WEB`；仅网页应用显示编辑按钮。

**生成的 main.js 特性**：
- Chrome User-Agent 伪装（避免网站对非标准浏览器的功能限制）
- `BrowserWindow.loadURL()` 加载网页
- `nodeIntegration: false` + `contextIsolation: true`（安全隔离，无 preload）
- 菜单栏可选（创建时配置，可在编辑中修改）：
  - 文件：退出 / 刷新
  - 历史：上一步 / 下一步（Alt+Left / Alt+Right）
  - 视图：重置缩放 / 放大 / 缩小 / 全屏 / 开发者工具（F12）
  - 窗口：最小化
- 菜单关闭时快捷键依然生效：通过 `webContents.on('before-input-event')` 在主进程拦截
  - Ctrl+= / Ctrl+- / Ctrl+0：缩放控制
  - F12：开发者工具
- PWA 的 Service Worker / 离线缓存等能力由 Chromium 内核原生支持，无需额外代码

**启动方式**：
```bash
# 网页应用：不注入 canbox-core，使用独立 userData 路径
electron apps/{appId}/ --no-sandbox

# 普通 APP：注入 canbox-core，共享平台 userData
electron -r canbox-core/injection.js apps/{appId}/app.asar --app-id={appId} --no-sandbox
```

网页应用使用独立的默认 userData 路径（`~/.config/<package.json name>/`），避免与 `~/.config/canbox/` 共享 Chromium 数据导致的污染和初始化延迟。

**编辑**：仅 `canbox.type === 'web'` 的应用可编辑，可修改名称、网址、图标、窗口尺寸、菜单栏开关；保存后重新生成 `main.js` / `package.json` / `logo.png` 并强制更新 launcher。

### 3. 仓库管理

- 添加 / 删除 APP 仓库
- 浏览仓库中的 APP 列表
- 下载 APP（按当前平台匹配 zip）

### 4. 系统设置

- 缩放比例
- 语言切换
- 其他设置项

manager 自己的数据通过 canbox-core store 存到 `data/canbox-manager/store/`（黑盒路由，appId=canbox-manager）。

## APP 分发格式

canbox-manager 导入的 zip 包是 canbox 标准格式（由 canbox-developer 发布时生成）：

```
{id}-{version}[-{platform}-{arch}].zip
├── app.asar                  # APP 代码 + JS 依赖
├── app.asar.unpacked/        # 原生模块（可选）
├── package.json              # APP 元数据
└── logo.png                  # APP 图标
```

导入时直接解压到 `apps/{appId}/`（appId 是随机生成的 8 位串），不需要猜目录结构。

## 概念说明

| 字段 | 说明 |
|------|------|
| `id` | package.json 中的可选字段，APP 全局唯一标识（反向域名格式），无则用 `name` |
| `name` | package.json 标准字段，npm 包名 |
| `appId` | canbox 安装时生成的随机 8 位串，用于文件系统目录名和数据隔离路由 |

## 项目结构

```
canbox-manager/
├── package.json              # 元数据 & 依赖
├── main.js                   # Electron 主进程入口 + manager 专用 IPC
├── preload.js                # contextBridge（core API 黑盒 + manager API）
├── vite.config.mjs           # Vite 构建配置
├── index.html                # HTML 入口
├── src/                      # Vue 前端源码
│   ├── main.js               # Vue 入口
│   ├── App.vue               # 主布局（左侧导航 + 右侧内容）
│   ├── router/               # 路由配置
│   ├── stores/               # Pinia 状态管理
│   ├── views/                # 页面视图
│   └── utils/                # 工具函数
├── LICENSE
└── README.md
```

## 开发

```bash
npm install
npm run dev      # Vite dev server (port 5101)
npm run start    # electron -r canbox-core/injection.js . --app-id=canbox-manager --no-sandbox
npm run build    # Vite 构建
```
