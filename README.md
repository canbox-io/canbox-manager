# canbox-manager

The Canbox manager app. It is the **only preinstalled app** in the Canbox product bundle, and the entry point into the Canbox ecosystem.

[简体中文](./README_zh-CN.md)

## Place in the architecture

```
canbox-{version}-{platform}/
├── electron/                        # Electron runtime
├── canbox-core/                     # core injection module
│   └── injection.js                 # provides the shared environment + services
├── canbox-manager/                  # ← this repository (the only preinstalled app)
│   ├── package.json
│   ├── main.js
│   ├── preload.js
│   └── build/                       # Vue build output
└── canbox-manager.desktop
```

**canbox-manager has no special privileges.** It is fully equal to every other Canbox app — all of them are launched the same way:

```bash
electron -r canbox-core/injection.js canbox-manager/ --app-id=canbox-manager --no-sandbox
```

## Responsibilities

### 1. App management

- List installed apps (reads metadata from `apps/{appId}/package.json` + `logo.png`)
- **Import an app**: the user picks a standard canbox zip → extract to `apps/{appId}/` → generate a random appId → record the id→appId mapping
- **Download from a repository**: browse apps in a repo and install by downloading the zip
- Delete an app (`rm -rf apps/{appId}/`)
- Clear app data (`rm -rf data/{appId}/`)
- Launch an app (`electron -r injection.js apps/{appId}/app.asar --app-id={appId} --no-sandbox`)

### 2. Web apps / PWA apps

Wrap any URL as a desktop app — no canbox-core injection, its own userData, fully isolated from the rest of the platform.

**Creation flow**:
1. The user enters a URL → the `https://` prefix is added automatically
2. Clicking "Auto fetch" → the backend fetches the page HTML → parses `<link rel="manifest">` → fetches manifest.json → picks the largest PNG icon → prefills name/icon/theme color
3. The user can adjust the name, window width/height, and whether to show the menu bar
4. On submit, an `apps/{appId}/` directory is generated: the source files (`main.js` / `tabbar.html` / `preload.js` / `package.json`) are packed into `app.asar`, while `package.json` / `.canbox-app` / `logo.png` stay outside — the same storage layout as a regular app
5. A system launcher is generated as well (identical to regular apps)

**App type self-description** (`package.json` extension fields):
```json
{
    "canbox": {
        "type": "web",
        "webApp": {
            "url": "https://chat.baidu.com/",
            "isPwa": true,
            "manifestUrl": "https://chat.baidu.com/manifest.json",
            "themeColor": "#...",
            "backgroundColor": "#...",
            "menuBar": true,
            "width": 1280,
            "height": 800
        }
    }
}
```

**App list badges**: when `type === 'web'` a badge is shown — green `PWA` for PWAs, gray `WEB` for ordinary web pages; the edit button only appears for web apps.

**Features of the generated main.js**:
- Chrome User-Agent spoofing (avoids sites limiting functionality for non-standard browsers)
- Loads the page with `BrowserWindow.loadURL()`
- `nodeIntegration: false` + `contextIsolation: true` (secure isolation, no preload)
- Optional menu bar (configured at creation time, editable later):
  - File: Quit / Reload
  - History: Back / Forward (Alt+Left / Alt+Right)
  - View: Reset Zoom / Zoom In / Zoom Out / Full Screen / Developer Tools (F12)
  - Window: Minimize
- Shortcuts keep working when the menu is hidden: intercepted in the main process via `webContents.on('before-input-event')`
  - Ctrl+= / Ctrl+- / Ctrl+0: zoom control
  - F12: developer tools
- PWA features such as Service Worker / offline cache are natively supported by Chromium — no extra code needed

**Launching**:
```bash
# Web app: no canbox-core injection, uses its own userData path
electron apps/{appId}/app.asar --no-sandbox

# Regular app: canbox-core injected, shares the platform userData
electron -r canbox-core/injection.js apps/{appId}/app.asar --app-id={appId} --no-sandbox
```

Web apps use their own default userData path (`~/.config/<package.json name>/`) to avoid the pollution and initialization latency caused by sharing Chromium data with `~/.config/canbox/`.

**Editing**: only apps with `canbox.type === 'web'` are editable — name, URL, icon, window size and menu bar toggle can be changed; on save the source is regenerated and `app.asar` repacked (while removing leftover loose source files from the old format), and `package.json` / `.canbox-app` / `logo.png` are rewritten outside and the launcher is force-updated.

### 3. Repository management

- Add / remove app repositories
- Browse the app list in a repository
- Download apps (matching the zip for the current platform)

### 4. System settings

- Zoom level
- Language switching
- Other settings

The manager's own data is stored via the canbox-core store under `data/canbox-manager/store/` (black-box routing, appId=canbox-manager).

## App distribution format

The zip packages imported by canbox-manager use the standard canbox format (produced by canbox-developer on publish):

```
{id}-{version}[-{platform}-{arch}].zip
├── app.asar                  # app code + JS dependencies
├── app.asar.unpacked/        # native modules (optional)
├── package.json              # app metadata
└── logo.png                  # app icon
```

Import simply extracts to `apps/{appId}/` (appId is a randomly generated 8-character string) — no need to guess the directory layout.

## Concepts

| Field   | Description                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------- |
| `id`    | Optional package.json field: the app's globally unique identifier (reverse-domain format); defaults to `name` |
| `name`  | Standard package.json field: the npm package name                                                        |
| `appId` | Random 8-character string generated by canbox at install time, used as the filesystem directory name and for data isolation routing |

## Project structure

```
canbox-manager/
├── package.json              # metadata & dependencies
├── main.js                   # Electron main process entry + manager-specific IPC
├── preload.js                # contextBridge (core API black box + manager API)
├── vite.config.mjs           # Vite build config
├── index.html                # HTML entry
├── src/                      # Vue frontend source
│   ├── main.js               # Vue entry
│   ├── App.vue               # main layout (left navigation + right content)
│   ├── router/               # route config
│   ├── stores/               # Pinia state management
│   ├── views/                # page views
│   └── utils/                # utilities
├── LICENSE
└── README.md
```

## Development

```bash
npm install
npm run dev      # Vite dev server (port 5101)
npm run start    # electron -r canbox-core/injection.js . --app-id=canbox-manager --no-sandbox
npm run build    # Vite build
```
