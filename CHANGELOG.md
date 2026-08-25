# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.2.2] - 2026-08-25

### feat | 新功能 / Features

新增 cross-env 依赖，修复 Windows 下 npm run start 的 NODE_ENV 环境变量问题
新增安装状态缓存与批量查询接口（manager.catalog.getInstallState/getInstallStates）
仓库源组 APP Card 显示版本号

Add cross-env dependency to fix NODE_ENV issue with npm run start on Windows
Add install state cache and batch query API (manager.catalog.getInstallState/getInstallStates)
Display version number on catalog source APP cards

### fix | 问题修复 / Bug Fixes

修复 Electron 环境下文件操作锁死问题（EPERM），统一使用 original-fs 避免 asar 补丁干扰
修复 APP 卸载后安装状态不同步问题
修复下载失败提示不明确问题，区分网络超时/DNS失败/HTTP状态码错误
修复已安装 APP 仍显示下载按钮的问题

Fix EPERM file operation lock issue in Electron by using original-fs to avoid asar patch interference
Fix install state not syncing after APP uninstall
Fix unclear download failure messages, distinguish network timeout/DNS failure/HTTP status errors
Fix download button still showing for already-installed apps

### refactor | 重构 / Refactoring

重构仓库下载逻辑，引入统一下载追踪表 catalog-repos.json，以 repoUrl 为主键统一三组数据源下载入口
将仓库操作按钮替换为图标按钮，优化布局与样式
移除"应用仓库"卡片启动按钮，明确应用仓库与我的应用职责边界
缓存提示从页面顶部移到底部页脚

Refactor repo download logic, introduce unified download tracking table catalog-repos.json with repoUrl as primary key
Replace repo action buttons with icon buttons, optimize layout and styling
Remove launch button from app repo cards, clarify responsibility boundary between App Repos and My Apps
Move cache notice from page top to footer

### style | 样式 / Styling

更新多语言文案"添加到我的仓库"为"下载"

Update i18n text from "Add to My Repos" to "Download"

### chore | 维护 / Maintenance

将版本号从 0.2.1 升级至 0.2.2

Bump version from 0.2.1 to 0.2.2

## [0.2.1] - 2026-08-09

### feat | 新功能 / Features

新增应用目录（Catalog）功能，支持数据源管理与目录拉取
拦截新窗口打开，http/https 链接交由系统默认浏览器处理
完成 Windows 11 平台适配（本版本重点），并在 Windows 下使用 Node SEA 技术作为程序启动器，优化安装与图标处理

Add Catalog feature with data source management and catalog fetching
Intercept new window opens, open http/https links via system default browser
Complete Windows 11 platform adaptation (key focus of this release), use Node SEA as Windows program launcher, optimize installation and icon handling

### fix | 问题修复 / Bug Fixes

禁用窗口拼写检查功能

Disable window spell check

### ci | CI / CI

新增 Windows 构建与发布工作流

Add Windows build and release workflow

### chore | 维护 / Maintenance

升级版本至 0.2.1 并添加 Node.js 引擎版本要求

Bump version to 0.2.1 and add Node.js engine version requirement

## [0.2.0] - 2026-07-23

### feat | 新功能 / Features

网页应用全中文名自动追加 URL 英文标识到显示名，支持在创建弹层中实时预览与编辑，确保系统快速启动工具可通过英文名搜索到

Auto-append URL domain keyword to display name for Chinese-only web apps with real-time preview and editing in creation dialog, ensuring system launcher tools can search by English name

### refactor | 重构 / Refactoring

将 useSavedBounds 变量声明移至 app ready 回调内，优化窗口状态持久化初始化时机

Move useSavedBounds variable declaration into app ready callback, optimize window state persistence initialization timing

### chore | 维护 / Maintenance

更新关于页面的作者信息为 canbox-io

Update author info in About page to canbox-io

### release | 发布 / Release

将版本号从 0.1.9 升级至 0.2.0

Bump version from 0.1.9 to 0.2.0

## [0.1.9] - 2026-07-22

### feat | 新功能 / Features

添加首屏加载动画并在 Vue 挂载后自动移除

Add splash screen loading animation, auto-removed after Vue mount

### fix | 问题修复 / Bug Fixes

修复启动时多个 Electron 应用共享 userData 目录导致的锁竞争，造成 5 秒 UI 加载延迟问题

修复 BrowserWindow 渲染进程共享 partition 导致的 leveldb LOCK 竞争问题

Fix 5-second UI loading delay caused by userData directory lock contention between multiple Electron apps

Fix leveldb LOCK contention caused by shared BrowserWindow partition in renderer processes

### refactor | 重构 / Refactoring

重构 Windows 启动脚本的 Electron 版本选择逻辑

Refactor Electron version selection logic in Windows startup script

### ci | CI / CI

优化 GitHub 发布流程，增加镜像源测速自动选择逻辑

Optimize GitHub release workflow with mirror speed detection and auto-selection

### release | 发布 / Release

将版本号从 0.1.8 升级至 0.1.9

Bump version from 0.1.8 to 0.1.9

## [0.1.8] - 2026-07-21

### feat | 新功能 / Features

更新器增加并发任务检测，安装更新前提示有待重启的挂起任务

Updater adds concurrent task detection and pending restart prompt before update install

### fix | 问题修复 / Bug Fixes

修复 Linux 安装脚本在 `set -e` 模式下 `grep`/`sed` 无匹配时退出码导致脚本中断的问题，添加 `|| true` 处理

Fix Linux installer script crashing due to grep/sed non-zero exit codes in `set -e` mode, add `|| true` handling

## [0.1.7] - 2026-07-18

### fix | 问题修复 / Bug Fixes

锁定 electron 版本为 42.5.1，避免 `^` 范围解析到最新版本时镜像同步延迟导致 CI 构建失败
锁定 web app 创建时的 electron range 为精确版本（去掉 `^`），与当前 builtin 一致，避免范围漂移到未在白名单中的版本

Lock electron version to 42.5.1 to prevent CI build failures caused by mirror sync delay when `^` range resolves to latest version
Lock web app electron range to exact version (drop `^`), aligned with current builtin to avoid range drift to versions not in whitelist

## [0.1.6] - 2026-07-18

### feat | 新功能 / Features

新增 Electron 版本管理功能，支持多版本下载与切换
优化 Electron 运行时下载交互与 launcher 生命周期管理，缺运行时的 APP 不生成 launcher
Electron 版本管理界面完成国际化（中英双语）
持久化窗口状态，重启后恢复窗口位置和大小

Add Electron version management with multi-version download and switching
Improve Electron runtime download UX and launcher lifecycle: skip launcher generation when runtime missing
Localize Electron versions management UI (Chinese/English)
Persist window state across sessions, restore position and size on restart

### fix | 问题修复 / Bug Fixes

修复下载完成后版本表格状态未即时更新的问题
修复应用 logo 读取回退及编辑后旧启动器残留问题

Fix version table status not updating immediately after download
Fix app logo fallback read and stale launcher residue after editing

## [0.1.5] - 2026-07-16

### feat | 新功能 / Features

新增创建网页应用功能，将任意网址封装为桌面应用，自动抓取 PWA manifest 预填名称与图标
网页应用支持 Chrome UA 伪装、菜单栏定制、导航快捷键（Alt+Left/Right）、缩放控制（Ctrl+=/-/0）与开发者工具（F12）
网页应用使用独立 userData 路径，不注入 canbox-core，与平台数据完全隔离
APP 列表显示网页/PWA 应用角标（WEB 灰色 / PWA 绿色），仅网页应用显示编辑按钮
支持编辑网页应用，可修改名称、网址、图标、窗口尺寸与菜单栏开关
网页应用启动命令同步 launcher，普通 APP 与网页应用分别走注入/非注入启动流程

Add web app creation feature, wrap any URL as a desktop app with auto PWA manifest scraping for name and icon
Web apps support Chrome UA spoofing, customizable menu bar, navigation shortcuts (Alt+Left/Right), zoom controls (Ctrl+=/-/0) and DevTools (F12)
Web apps use isolated userData path, no canbox-core injection, fully separated from platform data
Display WEB/PWA badges on app list (WEB gray / PWA green), edit button shown only for web apps
Support editing web apps, modify name, URL, icon, window size and menu bar toggle
Sync web app launch command in launcher, native and web apps use injection/non-injection launch paths respectively

### fix | 问题修复 / Bug Fixes

修复 zoom 放大快捷键需要 Ctrl+Shift++ 才能触发的问题，改为 Ctrl+= 直接触发
修复关于页面切换路由后更新下载进度丢失的问题，将更新状态迁移至 Pinia store 跨视图保持

Fix zoom-in shortcut requiring Ctrl+Shift++ to trigger, now works directly with Ctrl+=
Fix update download progress lost when switching routes in About view, migrate update state to Pinia store for cross-view persistence

## [0.1.4] - 2026-07-16

### feat | 新功能 / Features

添加仓库 URL 重复添加检查与提示，避免重复发起 HTTP 请求
APP 更新前检查并关闭正在运行的实例，确保更新顺利

Add duplicate repo URL check with prompt, avoid redundant HTTP requests
Check and close running app instance before update

### fix | 问题修复 / Bug Fixes

修复 installingDeveloper 状态未持久化的问题

Fix installingDeveloper state not persisted in store

## [0.1.3] - 2026-07-15

### feat | 新功能 / Features

新增 APP 更新检查功能，启动后自动检测已安装 APP 的新版本
APP 卡片显示更新徽章和更新按钮，支持一键更新
修正仓库更新判断逻辑，基于已安装版本对比而非仓库记录版本

Add APP update checking, auto-detect new versions of installed apps on startup
Show update badge and update button on app cards, support one-click update
Fix repo update detection logic, compare against installed version instead of repo record

### fix | 问题修复 / Bug Fixes

修复启动时 ipcMain.invoke 调用导致的异常

Fix startup crash caused by ipcMain.invoke call

### chore | 维护 / Maintenance

Release workflow 提取 CHANGELOG 内容作为 GitHub Release 说明

Extract CHANGELOG content as GitHub Release notes in CI workflow

## [0.1.2] - 2026-07-15

### feat | 新功能 / Features

新增修复快捷方式功能，支持强制重新生成 APP 启动器
增加数据目录迁移功能，支持自定义路径和恢复默认位置
优化 Windows 启动器分组与命名，开始菜单显示为 Canbox 文件夹下的纯应用名

Add repair shortcut feature to force regenerate APP launchers
Add data directory migration with custom path support and reset to default
Optimize Windows launcher grouping and naming, apps shown under Canbox folder with plain names

### refactor | 重构 / Refactoring

关于页面版本号改为构建时从 package.json 注入，无需手动同步 i18n 文件

Inject app version from package.json at build time, no need to sync i18n files manually

## [0.1.1] - 2026-07-15

### feat | 新功能 / Features

在「我的 APP」页面添加开发者工具横幅及一键安装功能
当 developer 应用已安装时自动隐藏开发者工具横幅

Add developer tools banner and one-click install in 'My Apps' page
Auto-hide developer tools banner when developer app is installed

### fix | 问题修复 / Bug Fixes

修复重启后语言设置回退为默认中文的问题

Fix language settings reverting to default Chinese after restart
