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

### 2. 仓库管理

- 添加 / 删除 APP 仓库
- 浏览仓库中的 APP 列表
- 下载 APP（按当前平台匹配 zip）

### 3. 系统设置

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
