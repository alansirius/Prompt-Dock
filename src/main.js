const { app, BrowserWindow, clipboard, globalShortcut, ipcMain, Menu, nativeImage, Tray } = require("electron");
const fs = require("fs/promises");
const path = require("path");

const SHORTCUT = "CommandOrControl+Shift+Space";

let mainWindow;
let tray;
let storePath;

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
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#20242c"/>
      <path d="M8 9.5h16v3H8zM8 15h13v3H8zM8 20.5h9v3H8z" fill="#f2c94c"/>
    </svg>
  `);
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
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

async function ensureStore() {
  storePath = path.join(app.getPath("userData"), "prompts.json");
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(defaultPrompts, null, 2), "utf8");
  }
}

async function readPrompts() {
  await ensureStore();
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw);
}

async function writePrompts(prompts) {
  await fs.writeFile(storePath, JSON.stringify(prompts, null, 2), "utf8");
  return prompts;
}

app.whenReady().then(async () => {
  await ensureStore();
  createWindow();

  tray = new Tray(createTrayIcon());
  tray.setToolTip("Prompt Dock");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: `显示/隐藏 (${SHORTCUT})`, click: toggleWindow },
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

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  showWindow();
});

ipcMain.handle("prompts:load", async () => ({
  prompts: await readPrompts(),
  storePath,
  shortcut: SHORTCUT
}));

ipcMain.handle("prompts:save", async (_event, prompts) => {
  await writePrompts(prompts);
  return { ok: true };
});

ipcMain.handle("clipboard:copy", async (_event, text) => {
  clipboard.writeText(text || "");
  return { ok: true };
});

ipcMain.handle("window:hide", async () => {
  if (mainWindow) mainWindow.hide();
  return { ok: true };
});
