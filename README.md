# Prompt Dock

本地桌面提示词管理工具，适合用快捷键随时唤起、搜索提示词并复制到剪贴板。

## 功能

- 全局快捷键 `CommandOrControl+Shift+Space` 显示或隐藏窗口
- macOS 托盘菜单显示、隐藏和退出
- 本地 JSON 存储，数据默认保存在 Electron `userData` 目录
- 标题、标签、内容全文搜索
- 收藏、最近复制、标签筛选
- 新建、编辑、删除、复制为新提示词
- 一键复制提示词内容到剪贴板

## 运行

```bash
cd prompt-dock
npm start
```

## 生成 DMG 安装包

```bash
cd prompt-dock
npm run dist
```

安装包会生成在 `dist/` 目录。默认会使用当前 Mac 的架构生成 DMG；这台机器是 Apple Silicon，因此默认产物是 arm64。

如果需要在 Apple Silicon 机器上生成 Intel Mac 版本，先安装 x64 Electron 运行时，再指定 x64：

```bash
rm -rf node_modules/electron
env npm_config_arch=x64 npm_config_platform=darwin npm install electron@39.8.10 --save-dev
npm run dist -- --x64
```

## 快捷操作

- `CommandOrControl+Shift+Space`：唤起或隐藏窗口
- `CommandOrControl+Enter`：复制当前提示词内容
- `Escape`：隐藏窗口
