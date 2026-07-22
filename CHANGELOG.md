# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
