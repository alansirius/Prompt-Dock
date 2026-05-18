const state = {
  prompts: [],
  selectedId: null,
  filter: "all",
  tag: "",
  query: "",
  storePath: "",
  saveTimer: null
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  shell: $(".shell"),
  sidebarToggle: $("#sidebarToggle"),
  sidebarResize: $("#sidebarResize"),
  listResize: $("#listResize"),
  shortcutLabel: $("#shortcutLabel"),
  storeHistory: $("#storeHistory"),
  search: $("#search"),
  promptList: $("#promptList"),
  tagList: $("#tagList"),
  countLabel: $("#countLabel"),
  titleInput: $("#titleInput"),
  tagInput: $("#tagInput"),
  openTextEditor: $("#openTextEditor"),
  editorDialog: $("#editorDialog"),
  closeTextEditor: $("#closeTextEditor"),
  editorContentInput: $("#editorContentInput"),
  versioningInput: $("#versioningInput"),
  versionPanel: $("#versionPanel"),
  versionCompare: $("#versionCompare"),
  versionNameInput: $("#versionNameInput"),
  saveVersion: $("#saveVersion"),
  leftVersionSelect: $("#leftVersionSelect"),
  rightVersionSelect: $("#rightVersionSelect"),
  leftDiff: $("#leftDiff"),
  rightDiff: $("#rightDiff"),
  contentInput: $("#contentInput"),
  favoriteButton: $("#favoriteButton"),
  status: $("#status")
};

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function selectedPrompt() {
  return state.prompts.find((prompt) => prompt.id === state.selectedId) || null;
}

function normalizeTags(value) {
  return value
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function versionLabel(version, index) {
  return version.name || `版本 ${index + 1}`;
}

function ensureVersions(prompt) {
  if (!Array.isArray(prompt.versions)) prompt.versions = [];
  if (!prompt.versions.length) {
    prompt.versions.push({
      id: uid(),
      name: "初始版本",
      content: prompt.content || "",
      createdAt: Date.now()
    });
  }
}

function escapeText(value) {
  return escapeHtml(value || "");
}

function buildSideBySideDiff(leftText, rightText) {
  const left = String(leftText || "").split("\n");
  const right = String(rightText || "").split("\n");
  const table = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows = [];
  let i = 0;
  let j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ left: left[i], right: right[j], type: "same" });
      i += 1;
      j += 1;
    } else if (j >= right.length || (i < left.length && table[i + 1][j] >= table[i][j + 1])) {
      rows.push({ left: left[i], right: "", type: "removed" });
      i += 1;
    } else {
      rows.push({ left: "", right: right[j], type: "added" });
      j += 1;
    }
  }

  return {
    left: rows.map((row) => `<span class="${row.type}">${escapeText(row.left) || " "}</span>`).join("\n"),
    right: rows.map((row) => `<span class="${row.type}">${escapeText(row.right) || " "}</span>`).join("\n")
  };
}

function promptMatches(prompt) {
  const haystack = `${prompt.title} ${(prompt.tags || []).join(" ")} ${prompt.content}`.toLowerCase();
  const queryOk = !state.query || haystack.includes(state.query.toLowerCase());
  const tagOk = !state.tag || (prompt.tags || []).includes(state.tag);
  const filterOk =
    state.filter === "all" ||
    (state.filter === "favorite" && prompt.favorite) ||
    (state.filter === "recent" && prompt.lastCopiedAt);

  return queryOk && tagOk && filterOk;
}

function visiblePrompts() {
  return state.prompts
    .filter(promptMatches)
    .sort((a, b) => {
      if (state.filter === "recent") {
        return (b.lastCopiedAt || 0) - (a.lastCopiedAt || 0);
      }
      return Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || a.title.localeCompare(b.title, "zh-CN");
    });
}

function scheduleSave() {
  clearTimeout(state.saveTimer);
  elements.status.textContent = "正在保存...";
  state.saveTimer = setTimeout(async () => {
    await window.promptDock.save(state.prompts);
    elements.status.textContent = "已保存";
  }, 250);
}

async function saveNow() {
  clearTimeout(state.saveTimer);
  await window.promptDock.save(state.prompts);
  elements.status.textContent = "已保存";
}

function fileNameFromPath(filePath) {
  return String(filePath || "").split(/[\\/]/).filter(Boolean).pop() || "未命名数据源";
}

function renderStoreHistory(history = []) {
  elements.storeHistory.innerHTML = "";

  const openButton = document.createElement("button");
  openButton.className = "storeHistoryItem storeOpenItem";
  openButton.type = "button";
  openButton.innerHTML = `
    <span>打开仓库</span>
    <small>选择一个提示词 JSON 数据源</small>
  `;
  openButton.addEventListener("click", () => {
    switchStore(() => window.promptDock.chooseStore(), "已切换数据源");
  });
  elements.storeHistory.appendChild(openButton);

  history.forEach((filePath) => {
    const button = document.createElement("button");
    button.className = `storeHistoryItem${filePath === state.storePath ? " active" : ""}`;
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(fileNameFromPath(filePath))}</span>
      <small>${filePath === state.storePath ? "当前仓库" : "最近使用"}</small>
    `;
    button.addEventListener("click", () => {
      if (filePath === state.storePath) return;
      switchStore(() => window.promptDock.openStore(filePath), "已切换数据源");
    });
    elements.storeHistory.appendChild(button);
  });
}

function applyLoadedStore(result, message) {
  if (!result || result.canceled) return;
  state.prompts = Array.isArray(result.prompts) ? result.prompts : [];
  state.selectedId = state.prompts[0]?.id || null;
  state.tag = "";
  state.storePath = result.storePath || "";
  renderStoreHistory(result.storeHistory || []);
  elements.status.textContent = message;
  render();
}

async function switchStore(action, message) {
  try {
    await saveNow();
    const result = await action();
    applyLoadedStore(result, message);
  } catch (error) {
    elements.status.textContent = error.message || "数据源切换失败";
  }
}

function closeTagMenu() {
  document.querySelector(".tagContextMenu")?.remove();
}

function deleteTag(tag) {
  const confirmed = confirm(`删除标签「${tag}」？该标签会从所有提示词中移除。`);
  if (!confirmed) return;

  state.prompts.forEach((prompt) => {
    const tags = prompt.tags || [];
    if (!tags.includes(tag)) return;
    prompt.tags = tags.filter((item) => item !== tag);
    prompt.updatedAt = Date.now();
  });

  if (state.tag === tag) state.tag = "";
  elements.status.textContent = `已删除标签「${tag}」`;
  scheduleSave();
  render();
}

function showTagMenu(tag, x, y) {
  closeTagMenu();

  const menu = document.createElement("div");
  menu.className = "tagContextMenu";
  menu.innerHTML = `<button type="button">删除标签</button>`;
  document.body.appendChild(menu);

  const { width, height } = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - height - 8)}px`;

  menu.querySelector("button").addEventListener("click", () => {
    closeTagMenu();
    deleteTag(tag);
  });
}

function renderTags() {
  const tags = [...new Set(state.prompts.flatMap((prompt) => prompt.tags || []))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  if (state.tag && !tags.includes(state.tag)) state.tag = "";
  elements.tagList.innerHTML = "";

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.className = `tag${state.tag === tag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.tag = state.tag === tag ? "" : tag;
      render();
    });
    button.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      showTagMenu(tag, event.clientX, event.clientY);
    });
    elements.tagList.appendChild(button);
  });
}

function renderList() {
  const prompts = visiblePrompts();
  elements.countLabel.textContent = `${prompts.length} 条`;
  elements.promptList.innerHTML = "";

  prompts.forEach((prompt) => {
    const card = document.createElement("button");
    card.className = `promptCard${prompt.id === state.selectedId ? " active" : ""}`;
    card.innerHTML = `
      <h2>${prompt.favorite ? "★ " : ""}${escapeHtml(prompt.title || "未命名提示词")}</h2>
      <p>${escapeHtml(prompt.content || "")}</p>
      <div class="cardTags">${(prompt.tags || []).map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    `;
    card.addEventListener("click", () => {
      state.selectedId = prompt.id;
      render();
    });
    elements.promptList.appendChild(card);
  });
}

function renderEditor() {
  const prompt = selectedPrompt();
  const disabled = !prompt;

  elements.titleInput.disabled = disabled;
  elements.tagInput.disabled = disabled;
  elements.versioningInput.disabled = disabled;
  elements.contentInput.disabled = disabled;
  elements.openTextEditor.disabled = disabled;
  elements.editorContentInput.disabled = disabled;
  elements.favoriteButton.disabled = disabled;
  elements.versionNameInput.disabled = disabled;
  elements.saveVersion.disabled = disabled;
  elements.leftVersionSelect.disabled = disabled || !prompt?.versioningEnabled;
  elements.rightVersionSelect.disabled = disabled || !prompt?.versioningEnabled;
  $("#deletePrompt").disabled = disabled;
  $("#duplicatePrompt").disabled = disabled;
  $("#copyPrompt").disabled = disabled;

  if (!prompt) {
    elements.titleInput.value = "";
    elements.tagInput.value = "";
    elements.versioningInput.checked = false;
    elements.versionPanel.hidden = true;
    elements.versionCompare.hidden = true;
    elements.versionNameInput.value = "";
    elements.leftDiff.textContent = "";
    elements.rightDiff.textContent = "";
    elements.contentInput.value = "";
    elements.editorContentInput.value = "";
    elements.favoriteButton.textContent = "☆";
    closeTextEditor();
    return;
  }

  elements.titleInput.value = prompt.title || "";
  elements.tagInput.value = (prompt.tags || []).join(", ");
  elements.versioningInput.checked = Boolean(prompt.versioningEnabled);
  elements.versionPanel.hidden = false;
  renderVersionPanel(prompt);
  elements.contentInput.value = prompt.content || "";
  elements.editorContentInput.value = prompt.content || "";
  elements.favoriteButton.textContent = prompt.favorite ? "★" : "☆";
}

function renderVersionPanel(prompt) {
  elements.versionCompare.hidden = !prompt.versioningEnabled;
  if (!Array.isArray(prompt.versions)) prompt.versions = [];
  if (prompt.versioningEnabled) ensureVersions(prompt);

  const options = prompt.versions
    .map((version, index) => `<option value="${version.id}">${escapeHtml(versionLabel(version, index))}</option>`)
    .join("");
  const previousLeft = elements.leftVersionSelect.value;
  const previousRight = elements.rightVersionSelect.value;

  elements.leftVersionSelect.innerHTML = options;
  elements.rightVersionSelect.innerHTML = options;

  elements.leftVersionSelect.value = prompt.versions.some((version) => version.id === previousLeft)
    ? previousLeft
    : prompt.versions[0]?.id || "";
  elements.rightVersionSelect.value = prompt.versions.some((version) => version.id === previousRight)
    ? previousRight
    : prompt.versions[prompt.versions.length - 1]?.id || "";

  if (prompt.versioningEnabled) {
    renderDiff(prompt);
  } else {
    elements.leftDiff.textContent = "";
    elements.rightDiff.textContent = "";
  }
}

function renderDiff(prompt) {
  const left = prompt.versions?.find((version) => version.id === elements.leftVersionSelect.value);
  const right = prompt.versions?.find((version) => version.id === elements.rightVersionSelect.value);

  if (!left || !right) {
    elements.leftDiff.textContent = "暂无可比较版本";
    elements.rightDiff.textContent = "暂无可比较版本";
    return;
  }

  const diff = buildSideBySideDiff(left.content, right.content);
  elements.leftDiff.innerHTML = diff.left;
  elements.rightDiff.innerHTML = diff.right;
}

function saveCurrentVersion() {
  const prompt = selectedPrompt();
  if (!prompt) return;
  if (!Array.isArray(prompt.versions)) prompt.versions = [];

  const version = {
    id: uid(),
    name: elements.versionNameInput.value.trim() || `版本 ${prompt.versions.length + 1}`,
    content: prompt.content || "",
    createdAt: Date.now()
  };
  prompt.versions.push(version);
  prompt.updatedAt = Date.now();
  elements.versionNameInput.value = "";
  scheduleSave();
  renderVersionPanel(prompt);
  if (prompt.versioningEnabled) {
    elements.rightVersionSelect.value = version.id;
    renderDiff(prompt);
  }
  elements.status.textContent = `已保存版本「${version.name}」`;
}

function openTextEditor() {
  const prompt = selectedPrompt();
  if (!prompt) return;
  elements.editorContentInput.value = prompt.content || "";
  renderVersionPanel(prompt);
  elements.editorDialog.hidden = false;
  elements.editorContentInput.focus();
}

function closeTextEditor() {
  elements.editorDialog.hidden = true;
}

function toggleSidebar() {
  const collapsed = elements.shell.classList.toggle("sidebarCollapsed");
  elements.sidebarToggle.textContent = collapsed ? "›" : "‹";
  elements.sidebarToggle.title = collapsed ? "展开侧边栏" : "收缩侧边栏";
  elements.sidebarToggle.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收缩侧边栏");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function bindColumnResize(handle, onDragStart) {
  handle.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const drag = onDragStart(event);
    if (!drag) return;

    event.preventDefault();
    handle.classList.add("dragging");
    document.body.classList.add("resizingColumns");
    handle.setPointerCapture(event.pointerId);

    const move = (moveEvent) => {
      drag.move(moveEvent);
    };
    const stop = () => {
      handle.classList.remove("dragging");
      document.body.classList.remove("resizingColumns");
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", stop);
      handle.removeEventListener("pointercancel", stop);
    };

    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", stop);
    handle.addEventListener("pointercancel", stop);
  });
}

function bindResizableColumns() {
  bindColumnResize(elements.sidebarResize, (event) => {
    if (elements.shell.classList.contains("sidebarCollapsed")) return null;
    const startX = event.clientX;
    const startWidth = elements.shell.getBoundingClientRect().left + parseFloat(getComputedStyle(elements.shell).getPropertyValue("--sidebar-width"));
    return {
      move(moveEvent) {
        const width = clamp(startWidth + moveEvent.clientX - startX - elements.shell.getBoundingClientRect().left, 220, 360);
        elements.shell.style.setProperty("--sidebar-width", `${width}px`);
      }
    };
  });

  bindColumnResize(elements.listResize, (event) => {
    const workspace = $(".workspace");
    const rect = workspace.getBoundingClientRect();
    const startX = event.clientX;
    const startWidth = parseFloat(getComputedStyle(workspace).getPropertyValue("--list-width"));
    return {
      move(moveEvent) {
        const max = Math.max(300, rect.width - 420);
        const width = clamp(startWidth + moveEvent.clientX - startX, 280, max);
        workspace.style.setProperty("--list-width", `${width}px`);
      }
    };
  });
}

function render() {
  if (!selectedPrompt() && state.prompts.length) {
    const firstVisible = visiblePrompts()[0] || state.prompts[0];
    state.selectedId = firstVisible.id;
  }
  renderTags();
  renderList();
  renderEditor();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function updateSelected(mutator) {
  const prompt = selectedPrompt();
  if (!prompt) return;
  mutator(prompt);
  prompt.updatedAt = Date.now();
  scheduleSave();
  renderTags();
  renderList();
}

function createPrompt(source) {
  const prompt = {
    id: uid(),
    title: source?.title ? `${source.title} 副本` : "未命名提示词",
    tags: source?.tags ? [...source.tags] : [],
    favorite: false,
    versioningEnabled: false,
    versions: [],
    content: source?.content || "",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  state.prompts.unshift(prompt);
  state.selectedId = prompt.id;
  scheduleSave();
  render();
  elements.titleInput.focus();
  elements.titleInput.select();
}

async function copySelected() {
  const prompt = selectedPrompt();
  if (!prompt) return;
  await window.promptDock.copy(prompt.content || "");
  prompt.lastCopiedAt = Date.now();
  elements.status.textContent = "已复制";
  scheduleSave();
  renderList();
}

function bindEvents() {
  document.addEventListener("click", closeTagMenu);
  document.addEventListener("contextmenu", (event) => {
    if (!event.target.closest(".tag")) closeTagMenu();
  });

  elements.sidebarToggle.addEventListener("click", toggleSidebar);
  bindResizableColumns();
  elements.openTextEditor.addEventListener("click", openTextEditor);
  elements.closeTextEditor.addEventListener("click", closeTextEditor);
  elements.editorDialog.addEventListener("click", (event) => {
    if (event.target === elements.editorDialog) closeTextEditor();
  });
  $("#newPrompt").addEventListener("click", () => createPrompt());
  $("#duplicatePrompt").addEventListener("click", () => createPrompt(selectedPrompt()));
  $("#copyPrompt").addEventListener("click", copySelected);
  $("#hideWindow").addEventListener("click", () => window.promptDock.hide());
  $("#clearSearch").addEventListener("click", () => {
    state.query = "";
    elements.search.value = "";
    render();
  });

  elements.search.addEventListener("input", (event) => {
    state.query = event.target.value;
    render();
  });

  elements.titleInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.title = event.target.value;
    });
  });

  elements.tagInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.tags = normalizeTags(event.target.value);
    });
  });

  elements.versioningInput.addEventListener("change", (event) => {
    updateSelected((prompt) => {
      prompt.versioningEnabled = event.target.checked;
      if (prompt.versioningEnabled) ensureVersions(prompt);
    });
    renderEditor();
  });

  elements.saveVersion.addEventListener("click", saveCurrentVersion);
  elements.leftVersionSelect.addEventListener("change", () => {
    const prompt = selectedPrompt();
    if (prompt) renderDiff(prompt);
  });
  elements.rightVersionSelect.addEventListener("change", () => {
    const prompt = selectedPrompt();
    if (prompt) renderDiff(prompt);
  });

  elements.contentInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.content = event.target.value;
    });
    elements.editorContentInput.value = event.target.value;
  });

  elements.editorContentInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.content = event.target.value;
    });
    elements.contentInput.value = event.target.value;
  });

  elements.favoriteButton.addEventListener("click", () => {
    updateSelected((prompt) => {
      prompt.favorite = !prompt.favorite;
    });
    renderEditor();
  });

  $("#deletePrompt").addEventListener("click", () => {
    const prompt = selectedPrompt();
    if (!prompt) return;
    const confirmed = confirm(`删除「${prompt.title || "未命名提示词"}」？`);
    if (!confirmed) return;
    state.prompts = state.prompts.filter((item) => item.id !== prompt.id);
    state.selectedId = state.prompts[0]?.id || null;
    scheduleSave();
    render();
  });

  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      render();
    });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector(".tagContextMenu")) {
      closeTagMenu();
      return;
    }
    if (event.key === "Escape" && !elements.editorDialog.hidden) {
      closeTextEditor();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      copySelected();
    }
    if (event.key === "Escape") {
      window.promptDock.hide();
    }
  });

  window.promptDock.onSummoned(() => {
    elements.search.focus();
    elements.search.select();
  });
}

async function init() {
  bindEvents();
  const { prompts, storePath, storeHistory, shortcut } = await window.promptDock.load();
  state.prompts = Array.isArray(prompts) ? prompts : [];
  state.selectedId = state.prompts[0]?.id || null;
  state.storePath = storePath || "";
  renderStoreHistory(storeHistory || []);
  elements.shortcutLabel.textContent = `${shortcut} 唤起`;
  render();
}

init();
