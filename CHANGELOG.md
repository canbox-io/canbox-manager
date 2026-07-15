# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
