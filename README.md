# Prompt Dock

Prompt Dock 是一个本地桌面提示词管理工具，用来集中保存、检索、编辑和复制常用提示词。它适合需要频繁在不同工作场景中复用提示词的人，例如产品、研发、运营、写作和日常 AI 辅助工作。

应用以本地 JSON 文件作为数据源，提示词内容保存在本机，支持切换仓库，方便把不同项目或工作域的提示词分开管理。

## 核心功能

- 快捷键唤起：通过 `CommandOrControl+Shift+Space` 快速打开 Prompt Dock。
- 快速搜索：按标题、标签或内容检索提示词。
- 标签管理：为提示词添加标签，并通过标签筛选不同类型的内容。
- 收藏与最近复制：快速定位高频使用和最近使用过的提示词。
- 本地仓库：点击当前仓库即可选择本地 JSON 数据源。
- 提示词编辑：支持标题、标签和正文内容的直接编辑。
- 一键复制：将当前提示词内容复制到剪贴板。
- 复制为新提示词：基于已有提示词快速创建变体。
- 多版本编辑器：保存提示词版本，并在编辑器中查看版本内容。
- 双列对比：插入比较列后，可以对两个版本或当前内容进行 diff 对比。
- 版本删除：在版本列表中删除不再需要的历史版本。

## 使用方式

打开应用后，左侧用于筛选和切换仓库，中间是提示词列表，右侧是当前提示词的编辑区。

在中间列表顶部输入关键词可以搜索提示词。选择列表中的提示词后，可以在右侧修改标题、标签和正文内容。点击复制内容即可将提示词放入剪贴板。

需要处理长文本或版本对比时，点击使用编辑器。编辑器左侧显示版本列表，右侧显示当前内容或版本内容。点击插入比较列后，可以对两列内容进行差异对比。

## 快捷操作

- `CommandOrControl+Shift+Space`：唤起或隐藏窗口。
- `CommandOrControl+Enter`：复制当前提示词内容。
- `Escape`：隐藏窗口或关闭编辑器。

## 数据说明

Prompt Dock 使用本地 JSON 文件保存提示词数据。你可以通过当前仓库入口选择不同的数据文件，以便按项目、团队或用途管理提示词集合。

## macOS 签名与公证发布

要让下载的 DMG 不被 Gatekeeper 直接拦截，需要使用 Apple Developer Program 的 `Developer ID Application` 证书签名，并提交 Apple notarization。完成后，用户首次打开时仍可能看到“此应用来自互联网”的正常提醒，但不会出现“Apple 无法检查是否包含恶意软件”这类阻断。

构建前准备：

1. 在钥匙串中安装 `Developer ID Application: ...` 证书。
2. 配置 Apple 公证凭据，推荐使用 App Store Connect API Key：

```bash
export APPLE_API_KEY="/absolute/path/AuthKey_XXXXXXXXXX.p8"
export APPLE_API_KEY_ID="XXXXXXXXXX"
export APPLE_API_ISSUER="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

也可以使用 Apple ID app-specific password：

```bash
export APPLE_ID="developer@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="TEAMID1234"
```

发布构建：

```bash
npm run build
```

构建完成后，可以检查签名和公证票据：

```bash
codesign --verify --deep --strict --verbose=2 "dist/mac/Prompt Dock.app"
spctl --assess --type execute --verbose=4 "dist/mac/Prompt Dock.app"
```
