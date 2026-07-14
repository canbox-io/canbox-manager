/**
 * canbox-manager — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core API 给渲染进程。
 * 同时注册 manager 专用 IPC 通道。
 *
 * canbox-core API 签名（黑盒式，APP 不传 appId，由 core 自动路由）：
 *   store: get(name, key) / set(name, key, value) / delete(name, key) / clear(name)
 *   db: put(doc) / get(docId) / allDocs(options) / bulkDocs(docs) / remove(doc) / find(query) / createIndex(index)
 *   misc: hello / getUserData / getCoreVersion / getCorePath / getPlatformInfo
 *
 * 说明：dialog / window / shortcut / sudo / shell 等能力 canbox-core 不再提供，
 * manager 作为普通 APP 在自身 main.js 注册所需 IPC（见 manager.* 通道）。
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
    // === canbox-core 公共服务（仅数据隔离与环境信息）===
    store: {
        get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
        set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
        delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
        clear: (name) => ipcRenderer.invoke('canbox.store.clear', name)
    },
    db: {
        put: (doc) => ipcRenderer.invoke('canbox.db.put', doc),
        get: (docId) => ipcRenderer.invoke('canbox.db.get', docId),
        allDocs: (options) => ipcRenderer.invoke('canbox.db.allDocs', options),
        bulkDocs: (docs) => ipcRenderer.invoke('canbox.db.bulkDocs', docs),
        remove: (doc) => ipcRenderer.invoke('canbox.db.remove', doc),
        find: (query) => ipcRenderer.invoke('canbox.db.find', query),
        createIndex: (index) => ipcRenderer.invoke('canbox.db.createIndex', index)
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
        getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath'),
        getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo')
    },

    // === Manager 专用 API ===
    manager: {
        // APP 管理
        appsList: () => ipcRenderer.invoke('manager.apps.list'),
        appsImport: (appPath) => ipcRenderer.invoke('manager.apps.import', appPath),
        appsRemove: (appId) => ipcRenderer.invoke('manager.apps.remove', appId),
        appsLaunch: (appId) => ipcRenderer.invoke('manager.apps.launch', appId),
        appsClearData: (appId) => ipcRenderer.invoke('manager.apps.clearData', appId),

        // 仓库管理
        reposList: () => ipcRenderer.invoke('manager.repos.list'),
        reposAdd: (url) => ipcRenderer.invoke('manager.repos.add', url),
        reposRemove: (repoId) => ipcRenderer.invoke('manager.repos.remove', repoId),
        reposSync: (repoId) => ipcRenderer.invoke('manager.repos.sync', repoId),
        reposInstall: (repoId) => ipcRenderer.invoke('manager.repos.install', repoId),
        reposGetReadme: (repoId) => ipcRenderer.invoke('manager.repos.getReadme', repoId),
        onInstallProgress: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('manager.repos.installProgress', handler);
            return () => ipcRenderer.removeListener('manager.repos.installProgress', handler);
        },

        // 设置
        settingsGet: (key) => ipcRenderer.invoke('manager.settings.get', key),
        settingsSet: (key, value) => ipcRenderer.invoke('manager.settings.set', key, value),
        settingsGetAll: () => ipcRenderer.invoke('manager.settings.getAll'),

        // 文件任务（下载/安装 APP）
        fileTaskCreate: (task) => ipcRenderer.invoke('manager.fileTask.create', task),
        fileTaskCancel: (taskId) => ipcRenderer.invoke('manager.fileTask.cancel', taskId),
        fileTaskList: () => ipcRenderer.invoke('manager.fileTask.list'),

        // 缩放
        zoomGet: () => ipcRenderer.invoke('manager.zoom.get'),
        zoomSet: (factor) => ipcRenderer.invoke('manager.zoom.set', factor),
        zoomReset: () => ipcRenderer.invoke('manager.zoom.reset'),
        onZoomChanged: (callback) => {
            ipcRenderer.on('manager:zoomChanged', (_e, factor) => callback(factor));
        },

        // 自动更新
        updateCheck: () => ipcRenderer.invoke('manager.update.check'),
        updateDownload: (downloadUrl) => ipcRenderer.invoke('manager.update.download', downloadUrl),
        updateInstall: (installerPath) => ipcRenderer.invoke('manager.update.install', installerPath),
        onUpdateAvailable: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('manager.update.available', handler);
            return () => ipcRenderer.removeListener('manager.update.available', handler);
        },
        onUpdateDownloadProgress: (callback) => {
            const handler = (_e, data) => callback(data);
            ipcRenderer.on('manager.update.downloadProgress', handler);
            return () => ipcRenderer.removeListener('manager.update.downloadProgress', handler);
        },

        // 原生能力（APP 自有，非 canbox-core 提供）
        showOpenDialog: (options) => ipcRenderer.invoke('manager.dialog.showOpenDialog', options),
        openUrl: (url) => ipcRenderer.invoke('manager.shell.openUrl', url),

        // 事件监听
        appReady: () => ipcRenderer.invoke('manager.appReady')
    }
};

contextBridge.exposeInMainWorld('api', api);
