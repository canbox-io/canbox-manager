# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
