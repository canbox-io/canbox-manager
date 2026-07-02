import { createRouter, createWebHashHistory } from 'vue-router';

const routes = [
    {
        path: '/',
        name: 'Apps',
        component: () => import('@/views/AppsView.vue')
    },
    {
        path: '/repos',
        name: 'Repos',
        component: () => import('@/views/ReposView.vue')
    },
    {
        path: '/settings',
        name: 'Settings',
        component: () => import('@/views/SettingsView.vue')
    },
    {
        path: '/about',
        name: 'About',
        component: () => import('@/views/AboutView.vue')
    }
];

const router = createRouter({
    history: createWebHashHistory(),
    routes
});

export default router;
