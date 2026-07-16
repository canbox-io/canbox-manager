# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
