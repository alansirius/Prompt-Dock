# Repository Guidelines

## Project Structure & Module Organization

Prompt Dock is a small Electron desktop app. Runtime source lives in `src/`:

- `src/main.js` owns the Electron main process, tray menu, global shortcut, clipboard access, IPC handlers, and JSON persistence in Electron `userData`.
- `src/preload.js` exposes the safe renderer API bridge.
- `src/renderer.js` contains browser-side UI state, filtering, editing, saving, and keyboard behavior.
- `src/index.html` and `src/styles.css` define the app shell and presentation.

Build configuration is in `package.json`; packaged output is written to `dist/`. Do not commit `node_modules/`, `dist/`, or local Electron user data.

## Build, Test, and Development Commands

- `npm install`: install Electron and packaging dependencies from `package-lock.json`.
- `npm start` or `npm run dev`: launch the local Electron app.
- `npm run dist`: build a macOS DMG with `electron-builder` into `dist/`.
- `npm run dist -- --x64`: build an Intel macOS DMG when the x64 Electron runtime has been installed.

There is currently no automated test script. Verify changes by running the app and exercising prompt creation, editing, search, tags, favorites, copy, tray actions, and the global shortcut.

## Coding Style & Naming Conventions

Use CommonJS modules, two-space indentation, semicolons, and double quotes to match the existing JavaScript. Prefer small, direct functions with descriptive camelCase names such as `createWindow`, `scheduleSave`, and `visiblePrompts`. Keep renderer DOM selectors centralized in the `elements` object. Escape user-rendered strings with `escapeHtml` before assigning HTML.

## Testing Guidelines

When adding tests, prefer focused coverage around pure renderer helpers and persistence behavior before introducing broad UI automation. Use `*.test.js` naming near the code under test or in a future `test/` directory. Until a test framework is added, include manual verification notes in pull requests.

## Commit & Pull Request Guidelines

The current history uses a short, imperative subject, for example `Initial Prompt Dock desktop app`. Continue with concise commit messages such as `Add prompt import validation` or `Fix tray quit behavior`.

Pull requests should include a clear summary, manual test steps, linked issues when applicable, and screenshots or screen recordings for UI changes. Note any packaging impact, shortcut changes, or changes to local data storage.

## Security & Configuration Tips

Keep renderer access behind `preload.js` and IPC handlers; do not expose Node APIs directly to the browser context. Validate prompt data before writing it to disk, and avoid logging prompt contents unless debugging locally.
