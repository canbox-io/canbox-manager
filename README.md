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

**canbox-manager 不拥有任何特殊权限。** 它和其他 Canbox APP（如 imagebox、用户手动导入的 APP）完全平等——都是通过相同方式启动：

```bash
# manager 启动（和其他 APP 完全一致的启动方式）
./electron/electron -r ./canbox-core/injection.js ./canbox-manager/

# imagebox 启动（用户从 repo 下载后）
./electron/electron -r ./canbox-core/injection.js {user-data}/apps/imagebox/
```

## 职责

### 1. APP 注册管理

- 查看已安装的 APP 列表
- **导入已有 APP**：用户选择本地 APP 目录，注册到 Canbox
- **从仓库下载**：浏览 repo 中的 APP，下载安装
- 删除 APP / 清理 APP 数据
- 启动 / 停止 APP

数据存储：通过 `canbox.db.put('core', doc)` 维护 APP 注册表。

### 2. 仓库管理

- 添加 / 删除 APP 仓库（GitHub Release、自定义 URL 等）
- 浏览仓库中的 APP 列表（app.json 元数据展示）
- 下载 APP（asar 或目录形式）到 `{user-data}/apps/`

数据存储：通过 `canbox.store.get/set('manager', ...)` 维护仓库配置。

### 3. 系统设置

- 语言切换（i18n）
- 界面字体设置
- APP 默认执行模式（窗口 / 独立进程）
- 自动启动设置
- 日志级别等

数据存储：通过 `canbox.store.get/set('manager', ...)` 维护设置项。

### 4. 其他通用能力（共享 canbox-core 提供）

- **操作历史**：通过 `canbox.db.get('history', ...)` 查阅操作记录
- **快捷键管理**：通过 `canbox.shortcut.*` 注册/管理全局快捷键
- **通知**：通过 `canbox.window.notification(...)` 发送系统通知
- **日志**：自动写入 `{user-data}/logs/canbox.log`（canbox-core 隐性能力）

## 不负责的内容

- **APP 自身的能力实现**：manager 仅做"管理"，不包含任何具体 APP 功能
- **APP 进程管理**：APP 启动后是独立进程，manager 不介入其内部运行
- **APP 间通信**：APP 之间通过共享存储（canboxDb）自然协作，manager 不做中转
- **自动更新**：属于 canbox-core 或产品包层面的能力，manager 不做

## 项目结构

```
canbox-manager/
├── package.json              # 元数据 & 依赖（Vue、Element Plus 等前端栈）
├── main.js                   # Electron 主进程入口
├── preload.js                # contextBridge 暴露 canbox-core API
├── vite.config.js            # Vite 构建配置
├── index.html                # Vite 入口 HTML
├── src/                      # Vue 前端源码
│   ├── main.js               # Vue 入口
│   ├── App.vue               # 根组件
│   ├── router/               # 路由配置
│   ├── stores/               # Pinia 状态管理
│   ├── views/                # 页面视图
│   │   ├── AppsView.vue      # APP 管理（列表、导入、启动、删除）
│   │   ├── ReposView.vue     # 仓库管理（添加、浏览、下载）
│   │   └── SettingsView.vue  # 系统设置
│   ├── components/           # 公共组件
│   └── utils/                # 工具函数
├── .gitignore
└── README.md
```

## 开发

```bash
# 安装依赖
npm install

# 启动开发模式（需要先启动 canbox-core 所在的产品包环境）
# 或独立运行（此时 canbox-core API 不可用，仅调试 UI）
npm run dev

# 构建
npm run build
```

## 与其他项目的关系

| 项目 | 关系 | 说明 |
|------|------|------|
| canbox-core | 运行时依赖 | manager 通过 injection.js 获得基础设施和 API |
| canbox-core 仓库 | 无直接依赖 | manager 的 `package.json` 不声明 canbox-core 为 npm 依赖 |
| APP 仓库（imagebox 等） | 平级关系 | 同属 Canbox 生态中的普通 APP |
| 其他 APP | 无耦合 | manager 通过 canboxDb 读 APP 注册信息，不直接与 APP 通信 |
