const { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } = require("electron");
const fs = require("fs/promises");
const https = require("https");
const path = require("path");

const SHORTCUT = "Command+Shift+Space";
const SHORTCUT_LABEL = "Shift+Cmd+Space";
const UPDATE_REPOSITORY = "alansirius/Prompt-Dock";
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;
const UPDATE_API_BASE = `https://api.github.com/repos/${UPDATE_REPOSITORY}`;
const TRAY_ICON_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAACQAAAAkCAYAAADhAJiYAAAAZ0lEQVR4nO3TwQ0AIQwDQfpvGio4AU5MHJ1X4mvNI4zh3M+b4JNAUHDZmBCKhYFQbMw1qgUoGrxJ+R2R3TagsjsyCAWhGVQGkrshg3ag09JBX6MMUGhUDlRyPy9RUFIYFio1CYRzrVrJjxILrXl4EgAAAABJRU5ErkJggg==";

let mainWindow;
let tray;
let storePath;
let configPath;
let storeHistory = [];
let dismissedUpdateVersion = "";
let latestUpdateInfo = null;

const defaultPrompts = [
  {
    id: "prd-review",
    title: "PRD 评审助手",
    tags: ["产品", "评审"],
    favorite: true,
    content:
      "你是一名资深产品经理。请从目标清晰度、用户场景、业务规则、边界条件、数据口径、验收标准和风险依赖七个角度审查下面的 PRD，并按严重程度输出问题清单。"
  },
  {
    id: "meeting-summary",
    title: "会议纪要整理",
    tags: ["办公", "总结"],
    favorite: false,
    content:
      "请将下面的会议记录整理为：1. 会议结论；2. 待办事项，包含负责人和截止时间；3. 未决问题；4. 需要同步给其他团队的信息。保持表述简洁、可执行。"
  },
  {
    id: "code-review",
    title: "代码审查",
    tags: ["研发", "质量"],
    favorite: false,
    content:
      "请以代码审查的方式检查下面的变更，优先指出可能导致 bug、回归、性能问题、安全问题或测试缺口的地方。每个问题请包含文件位置、影响和建议修改方式。"
  }
];

function createTrayIcon() {
  const icon = nativeImage
    .createFromBuffer(Buffer.from(TRAY_ICON_PNG, "base64"))
    .resize({ width: 18, height: 18 });
  icon.setTemplateImage(true);
  return icon;
}

function normalizeVersion(value) {
  return String(value || "")
    .trim()
    .replace(/^v/i, "")
    .split(/[+-]/)[0];
}

function compareVersions(a, b) {
  const left = normalizeVersion(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = normalizeVersion(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] || 0) - (right[index] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `Prompt-Dock/${app.getVersion()}`
      },
      timeout: 8000
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const error = new Error(`GitHub API returned ${response.statusCode}`);
          error.statusCode = response.statusCode;
          error.body = body;
          reject(error);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("timeout", () => {
      request.destroy(new Error("检查更新超时。"));
    });
    request.on("error", reject);
  });
}

function normalizeReleaseUpdate(release) {
  const latestVersion = normalizeVersion(release.tag_name || release.name);
  return {
    currentVersion: app.getVersion(),
    latestVersion,
    releaseName: release.name || `v${latestVersion}`,
    notes: release.body || "",
    url: release.html_url || UPDATE_RELEASES_URL,
    publishedAt: release.published_at || ""
  };
}

async function fetchLatestUpdateInfo() {
  try {
    const release = await requestJson(`${UPDATE_API_BASE}/releases/latest`);
    return normalizeReleaseUpdate(release);
  } catch (error) {
    if (error.statusCode !== 404) throw error;
    const tags = await requestJson(`${UPDATE_API_BASE}/tags?per_page=1`);
    const latestTag = Array.isArray(tags) ? tags[0] : null;
    if (!latestTag?.name) return null;
    const latestVersion = normalizeVersion(latestTag.name);
    return {
      currentVersion: app.getVersion(),
      latestVersion,
      releaseName: latestTag.name,
      notes: "",
      url: UPDATE_RELEASES_URL,
      publishedAt: ""
    };
  }
}

async function checkForUpdates({ notifyRenderer = true, manual = false } = {}) {
  try {
    const updateInfo = await fetchLatestUpdateInfo();
    const hasUpdate = Boolean(updateInfo?.latestVersion && compareVersions(updateInfo.latestVersion, app.getVersion()) > 0);
    latestUpdateInfo = hasUpdate ? { ...updateInfo, dismissed: updateInfo.latestVersion === dismissedUpdateVersion } : null;
    const result = {
      ok: true,
      hasUpdate,
      update: latestUpdateInfo,
      currentVersion: app.getVersion()
    };

    if (notifyRenderer && mainWindow && latestUpdateInfo && !latestUpdateInfo.dismissed) {
      mainWindow.webContents.send("update:available", latestUpdateInfo);
    }

    return result;
  } catch (error) {
    const result = {
      ok: false,
      hasUpdate: false,
      currentVersion: app.getVersion(),
      error: manual ? `检查更新失败：${error.message}` : "检查更新失败。"
    };
    if (manual && mainWindow) mainWindow.webContents.send("update:error", result.error);
    return result;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    title: "Prompt Dock",
    show: false,
    backgroundColor: "#f6f4ef",
    webPreferences: {
      preload: path.join(__dirname, "preload.js")
    }
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));

  mainWindow.on("close", (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    checkForUpdates();
  });
}

function showWindow() {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("window:summoned");
}

function toggleWindow() {
  if (!mainWindow) return;
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function defaultStorePath() {
  return path.join(app.getPath("userData"), "prompts.json");
}

async function ensureConfig() {
  configPath = path.join(app.getPath("userData"), "config.json");
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(raw);
    storePath = config.storePath || defaultStorePath();
    storeHistory = Array.isArray(config.storeHistory) ? config.storeHistory : [];
    dismissedUpdateVersion = config.dismissedUpdateVersion || "";
    if (!storeHistory.includes(storePath)) storeHistory.unshift(storePath);
  } catch {
    storePath = defaultStorePath();
    storeHistory = [storePath];
    dismissedUpdateVersion = "";
    await writeConfig();
  }
}

async function writeConfig() {
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ storePath, storeHistory, dismissedUpdateVersion }, null, 2), "utf8");
}

async function rememberStore(filePath) {
  storeHistory = [filePath, ...storeHistory.filter((item) => item !== filePath)].slice(0, 8);
  await writeConfig();
}

function normalizePrompts(value) {
  if (!Array.isArray(value)) throw new Error("数据源文件必须是提示词数组 JSON。");
  return value;
}

async function loadStoreFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return normalizePrompts(JSON.parse(raw));
}

async function ensureStore() {
  if (!storePath) await ensureConfig();
  try {
    await fs.access(storePath);
  } catch {
    await fs.mkdir(path.dirname(storePath), { recursive: true });
    await fs.writeFile(storePath, JSON.stringify(defaultPrompts, null, 2), "utf8");
  }
}

async function readPrompts() {
  await ensureStore();
  return loadStoreFile(storePath);
}

async function writePrompts(prompts) {
  await fs.writeFile(storePath, JSON.stringify(prompts, null, 2), "utf8");
  return prompts;
}

app.whenReady().then(async () => {
  await ensureConfig();
  await ensureStore();
  createWindow();

  const trayIcon = createTrayIcon();
  tray = new Tray(trayIcon);
  if (trayIcon.isEmpty()) tray.setTitle("PD");
  tray.setToolTip("Prompt Dock");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `显示/隐藏 (${SHORTCUT_LABEL})`, click: toggleWindow },
      { label: "检查更新", click: () => {
        showWindow();
        checkForUpdates({ manual: true });
      } },
      { label: "退出", click: () => {
        app.isQuiting = true;
        app.quit();
      } }
    ])
  );
  tray.on("click", toggleWindow);

  globalShortcut.register(SHORTCUT, toggleWindow);
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("before-quit", () => {
  app.isQuiting = true;
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  showWindow();
});

ipcMain.handle("prompts:load", async () => ({
  prompts: await readPrompts(),
  storePath,
  storeHistory,
  shortcut: SHORTCUT_LABEL
}));

ipcMain.handle("prompts:save", async (_event, prompts) => {
  await writePrompts(prompts);
  return { ok: true };
});

ipcMain.handle("store:choose", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择提示词数据源",
    defaultPath: path.dirname(storePath || defaultStorePath()),
    filters: [{ name: "JSON 文件", extensions: ["json"] }],
    properties: ["openFile"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const nextPath = result.filePaths[0];
  const prompts = await loadStoreFile(nextPath);
  storePath = nextPath;
  await rememberStore(storePath);
  return { prompts, storePath, storeHistory };
});

ipcMain.handle("store:open", async (_event, filePath) => {
  const prompts = await loadStoreFile(filePath);
  storePath = filePath;
  await rememberStore(storePath);
  return {
    prompts,
    storePath,
    storeHistory
  };
});

ipcMain.handle("clipboard:copy", async (_event, text) => {
  clipboard.writeText(text || "");
  return { ok: true };
});

ipcMain.handle("window:hide", async () => {
  if (mainWindow) mainWindow.hide();
  return { ok: true };
});

ipcMain.handle("updates:check", async () => checkForUpdates({ manual: true }));

ipcMain.handle("updates:dismiss", async (_event, version) => {
  dismissedUpdateVersion = normalizeVersion(version);
  await writeConfig();
  if (latestUpdateInfo?.latestVersion === dismissedUpdateVersion) {
    latestUpdateInfo = { ...latestUpdateInfo, dismissed: true };
  }
  return { ok: true };
});

ipcMain.handle("updates:open", async (_event, url) => {
  await shell.openExternal(url || latestUpdateInfo?.url || UPDATE_RELEASES_URL);
  return { ok: true };
});
