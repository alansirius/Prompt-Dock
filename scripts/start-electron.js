const { spawn, spawnSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");
const electronApp = path.join(root, "node_modules", "electron", "dist", "Electron.app");

if (process.platform === "darwin") {
  const result = spawnSync("open", ["-n", electronApp, "--args", root], {
    cwd: root,
    stdio: "inherit"
  });
  process.exit(result.status || 0);
}

const electronBin = require("electron");
const child = spawn(electronBin, [root], {
  cwd: root,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code || 0);
});
