import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'path';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
    plugins: [vue()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version)
    },
    base: './',
    resolve: {
        alias: {
            '@': resolve(__dirname, 'src')
        }
    },
    optimizeDeps: {
        include: [
            'vue',
            'vue-router',
            'pinia',
            'vue-i18n',
            'element-plus'
        ],
        exclude: []
    },
    build: {
        outDir: 'build',
        emptyOutDir: true,
        rollupOptions: {
            input: resolve(__dirname, 'index.html')
        }
    },
    server: {
        port: 5101,
        strictPort: true,
        warmup: {
            clientFiles: [
                './src/main.js',
                './src/App.vue',
                './src/views/AppsView.vue',
                './src/views/ReposView.vue',
                './src/views/SettingsView.vue',
                './src/views/AboutView.vue'
            ]
        }
    }
});
