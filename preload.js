/**
 * canbox-manager — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core API 给渲染进程。
 * APP 不调用 canbox API 时，可省略此文件或仅暴露部分 API。
 */

const { contextBridge, ipcRenderer } = require('electron');

const canboxAPI = {
    store: {
        get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
        set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
        delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
        has: (name, key) => ipcRenderer.invoke('canbox.store.has', name, key)
    },
    db: {
        put: (dbName, doc) => ipcRenderer.invoke('canbox.db.put', dbName, doc),
        get: (dbName, docId) => ipcRenderer.invoke('canbox.db.get', dbName, docId),
        allDocs: (dbName, options) => ipcRenderer.invoke('canbox.db.allDocs', dbName, options),
        bulkDocs: (dbName, docs) => ipcRenderer.invoke('canbox.db.bulkDocs', dbName, docs),
        remove: (dbName, doc) => ipcRenderer.invoke('canbox.db.remove', dbName, doc),
        find: (dbName, query) => ipcRenderer.invoke('canbox.db.find', dbName, query),
        createIndex: (dbName, index) => ipcRenderer.invoke('canbox.db.createIndex', dbName, index)
    },
    dialog: {
        showMessageBox: (options) => ipcRenderer.invoke('canbox.dialog.showMessageBox', options),
        showOpenDialog: (options) => ipcRenderer.invoke('canbox.dialog.showOpenDialog', options),
        showSaveDialog: (options) => ipcRenderer.invoke('canbox.dialog.showSaveDialog', options)
    },
    window: {
        createWindow: (options) => ipcRenderer.invoke('canbox.window.createWindow', options),
        notification: (options) => ipcRenderer.invoke('canbox.window.notification', options)
    },
    lifecycle: {
        registerCloseCallback: () => ipcRenderer.invoke('canbox.lifecycle.registerCloseCallback')
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        openUrl: (url) => ipcRenderer.invoke('canbox.misc.openUrl', url),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion')
    }
};

contextBridge.exposeInMainWorld('canboxAPI', canboxAPI);
