/**
 * 侧边栏导航项配置
 * App.vue 菜单渲染、alt+数字快捷键与设置页快捷键说明共用此数据源
 */
export const navItems = [
    { path: '/', emoji: '⊞', label: 'nav.apps', shortcut: 'Alt+1' },
    { path: '/repos', emoji: '📁', label: 'nav.repos', shortcut: 'Alt+2' },
    { path: '/settings', emoji: '⚙', label: 'nav.settings', shortcut: 'Alt+3' },
    { path: '/electron-versions', emoji: '⚡', label: 'nav.electron', shortcut: 'Alt+4' },
    { path: '/about', emoji: 'ℹ', label: 'nav.about', shortcut: 'Alt+5' }
];
