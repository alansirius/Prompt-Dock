const state = {
  prompts: [],
  selectedId: null,
  filter: "all",
  tag: "",
  query: "",
  storePath: "",
  saveTimer: null,
  versionSidebarCollapsed: false,
  editorColumns: [],
  activeEditorColumnId: "",
  columnDiffEnabled: false
};

const $ = (selector) => document.querySelector(selector);
const MAX_EDITOR_COLUMNS = 2;

const elements = {
  shell: $(".shell"),
  brandMark: $("#brandMark"),
  sidebarToggle: $("#sidebarToggle"),
  sidebarResize: $("#sidebarResize"),
  listResize: $("#listResize"),
  shortcutLabel: $("#shortcutLabel"),
  currentStore: $("#currentStore"),
  currentStorePath: $("#currentStorePath"),
  storeHistory: $("#storeHistory"),
  search: $("#search"),
  promptList: $("#promptList"),
  tagList: $("#tagList"),
  countLabel: $("#countLabel"),
  titleInput: $("#titleInput"),
  tagInput: $("#tagInput"),
  openTextEditor: $("#openTextEditor"),
  editorDialog: $("#editorDialog"),
  editorDialogBody: $(".editorDialogBody"),
  closeTextEditor: $("#closeTextEditor"),
  versionSidebar: $("#versionSidebar"),
  toggleVersionSidebar: $("#toggleVersionSidebar"),
  versionList: $("#versionList"),
  editorColumns: $("#editorColumns"),
  versionNameInput: $("#versionNameInput"),
  saveVersion: $("#saveVersion"),
  addEditorColumn: $("#addEditorColumn"),
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
}

function escapeText(value) {
  return escapeHtml(value || "");
}

function splitDiffLines(value) {
  const text = String(value ?? "");
  return text ? text.split("\n") : [];
}

function tokenizeDiffText(value) {
  return String(value).match(/(\s+|[A-Za-z0-9_]+|[\u4e00-\u9fff]|[^\sA-Za-z0-9_\u4e00-\u9fff])/g) || [];
}

function buildSequenceDiff(base, target, includeMarkers = true) {
  let prefixLength = 0;
  while (
    prefixLength < base.length &&
    prefixLength < target.length &&
    base[prefixLength] === target[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < base.length - prefixLength &&
    suffixLength < target.length - prefixLength &&
    base[base.length - 1 - suffixLength] === target[target.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const baseMiddle = base.slice(prefixLength, base.length - suffixLength);
  const targetMiddle = target.slice(prefixLength, target.length - suffixLength);
  const table = Array.from({ length: baseMiddle.length + 1 }, () => Array(targetMiddle.length + 1).fill(0));

  for (let i = baseMiddle.length - 1; i >= 0; i -= 1) {
    for (let j = targetMiddle.length - 1; j >= 0; j -= 1) {
      table[i][j] = baseMiddle[i] === targetMiddle[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const rows = base.slice(0, prefixLength).map((text) => ({ text, type: "same" }));
  let i = 0;
  let j = 0;
  while (i < baseMiddle.length || j < targetMiddle.length) {
    if (i < baseMiddle.length && j < targetMiddle.length && baseMiddle[i] === targetMiddle[j]) {
      rows.push({ text: targetMiddle[j], type: "same" });
      i += 1;
      j += 1;
    } else if (i >= baseMiddle.length || (j < targetMiddle.length && table[i][j + 1] > table[i + 1][j])) {
      rows.push({ text: includeMarkers ? `+ ${targetMiddle[j]}` : targetMiddle[j], type: "added" });
      j += 1;
    } else {
      rows.push({ text: includeMarkers ? `- ${baseMiddle[i]}` : baseMiddle[i], type: "removed" });
      i += 1;
    }
  }

  base.slice(base.length - suffixLength).forEach((text) => {
    rows.push({ text, type: "same" });
  });

  return rows;
}

function renderInlineChange(prefix, text, highlightType, counterpart) {
  const tokens = tokenizeDiffText(text);
  const otherTokens = tokenizeDiffText(counterpart);
  const parts = highlightType === "added"
    ? buildSequenceDiff(otherTokens, tokens, false)
    : buildSequenceDiff(tokens, otherTokens, false);
  const html = parts
    .filter((part) => part.type === "same" || part.type === highlightType)
    .map((part) => {
      const value = escapeText(part.text);
      if (part.type === "same") return value;
      return `<mark>${value || " "}</mark>`;
    })
    .join("");

  return `${prefix} ${html || " "}`;
}

function renderDiffRows(rows) {
  const htmlRows = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];

    if (row.type === "removed" || row.type === "added") {
      const removedRows = [];
      const addedRows = [];
      while (index < rows.length && (rows[index].type === "removed" || rows[index].type === "added")) {
        if (rows[index].type === "removed") {
          removedRows.push(rows[index].text.slice(2));
        } else {
          addedRows.push(rows[index].text.slice(2));
        }
        index += 1;
      }
      index -= 1;

      const pairs = Math.max(removedRows.length, addedRows.length);
      for (let pairIndex = 0; pairIndex < pairs; pairIndex += 1) {
        const removedText = removedRows[pairIndex];
        const addedText = addedRows[pairIndex];
        if (removedText !== undefined && addedText !== undefined) {
          htmlRows.push(`<span class="removed">${renderInlineChange("-", removedText, "removed", addedText)}</span>`);
          htmlRows.push(`<span class="added">${renderInlineChange("+", addedText, "added", removedText)}</span>`);
        } else if (removedText !== undefined) {
          htmlRows.push(`<span class="removed">${escapeText(`- ${removedText}`) || " "}</span>`);
        } else {
          htmlRows.push(`<span class="added">${escapeText(`+ ${addedText}`) || " "}</span>`);
        }
      }
      continue;
    }

    htmlRows.push(`<span class="${row.type}">${escapeText(row.text) || " "}</span>`);
  }

  return htmlRows.join("\n");
}

function buildInlineDiff(baseText, targetText) {
  const base = splitDiffLines(baseText);
  const target = splitDiffLines(targetText);

  if (!base.length && !target.length) return "";

  return renderDiffRows(buildSequenceDiff(base, target));
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
  elements.currentStorePath.textContent = state.storePath || "点击选择提示词 JSON 数据源";
  elements.currentStore.title = state.storePath ? `当前仓库：${state.storePath}` : "选择仓库";

  history.filter((filePath) => filePath !== state.storePath).forEach((filePath) => {
    const button = document.createElement("button");
    button.className = "storeHistoryItem";
    button.type = "button";
    button.innerHTML = `
      <span>${escapeHtml(fileNameFromPath(filePath))}</span>
      <small>最近使用</small>
    `;
    button.addEventListener("click", () => {
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
  state.editorColumns = [];
  state.activeEditorColumnId = "";
  state.columnDiffEnabled = false;
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
  elements.contentInput.disabled = disabled;
  elements.openTextEditor.disabled = disabled;
  elements.favoriteButton.disabled = disabled;
  elements.versionNameInput.disabled = disabled;
  elements.saveVersion.disabled = disabled;
  elements.addEditorColumn.disabled = disabled;
  $("#deletePrompt").disabled = disabled;
  $("#duplicatePrompt").disabled = disabled;
  $("#copyPrompt").disabled = disabled;

  if (!prompt) {
    elements.titleInput.value = "";
    elements.tagInput.value = "";
    elements.versionNameInput.value = "";
    elements.versionList.innerHTML = "";
    elements.editorColumns.innerHTML = "";
    elements.editorDialogBody.classList.remove("versionSidebarCollapsed");
    state.editorColumns = [];
    state.activeEditorColumnId = "";
    elements.contentInput.value = "";
    elements.favoriteButton.textContent = "☆";
    closeTextEditor();
    return;
  }

  elements.titleInput.value = prompt.title || "";
  elements.tagInput.value = (prompt.tags || []).join(", ");
  renderVersionPanel(prompt);
  elements.contentInput.value = prompt.content || "";
  elements.favoriteButton.textContent = prompt.favorite ? "★" : "☆";
}

function renderVersionPanel(prompt) {
  ensureVersions(prompt);
  elements.editorDialogBody.classList.toggle("versionSidebarCollapsed", state.versionSidebarCollapsed);
  elements.versionSidebar.classList.toggle("collapsed", state.versionSidebarCollapsed);
  elements.toggleVersionSidebar.title = state.versionSidebarCollapsed ? "展开版本侧边栏" : "收缩版本侧边栏";
  elements.toggleVersionSidebar.setAttribute("aria-label", state.versionSidebarCollapsed ? "展开版本侧边栏" : "收缩版本侧边栏");
  elements.toggleVersionSidebar.setAttribute("aria-expanded", String(!state.versionSidebarCollapsed));

  if (!state.editorColumns.length) {
    const id = uid();
    state.editorColumns = [{ id, versionId: "current" }];
    state.activeEditorColumnId = id;
  }

  state.editorColumns = state.editorColumns.slice(0, MAX_EDITOR_COLUMNS).map((column) => {
    const exists = column.versionId === "current" || prompt.versions.some((version) => version.id === column.versionId);
    return exists ? column : { ...column, versionId: "current" };
  });
  if (!state.editorColumns.some((column) => column.id === state.activeEditorColumnId)) {
    state.activeEditorColumnId = state.editorColumns[0]?.id || "";
  }
  if (state.editorColumns.length !== 2) state.columnDiffEnabled = false;

  renderVersionList(prompt);
  renderEditorColumns(prompt);
}

function versionContent(prompt, versionId) {
  if (versionId === "current") return prompt.content || "";
  return prompt.versions.find((version) => version.id === versionId)?.content || "";
}

function renderVersionList(prompt) {
  const items = [
    {
      id: "current",
      title: "当前内容",
      meta: `${prompt.versions.length} 个历史版本`
    },
    ...prompt.versions.map((version, index) => ({
      id: version.id,
      title: versionLabel(version, index),
      meta: new Date(version.createdAt || Date.now()).toLocaleString("zh-CN", { hour12: false })
    }))
  ];

  const activeColumn = state.editorColumns.find((column) => column.id === state.activeEditorColumnId) || state.editorColumns[0];
  elements.versionList.innerHTML = items.map((item) => `
    <button class="versionListItem${activeColumn?.versionId === item.id ? " active" : ""}" type="button" data-version-id="${escapeHtml(item.id)}">
      <span class="versionItemTitle">${escapeHtml(item.title)}</span>
      <small class="versionItemMeta">${escapeHtml(item.meta)}</small>
      ${item.id === "current" ? "" : `<span class="versionDelete" role="button" tabindex="0" data-version-id="${escapeHtml(item.id)}" title="删除版本" aria-label="删除版本">×</span>`}
    </button>
  `).join("");
}

function renderEditorColumns(prompt) {
  const versionOptions = [
    `<option value="current">当前内容</option>`,
    ...prompt.versions.map((version, index) => `<option value="${version.id}">${escapeHtml(versionLabel(version, index))}</option>`)
  ].join("");

  elements.editorColumns.style.setProperty("--editor-column-count", String(state.editorColumns.length || 1));
  elements.addEditorColumn.disabled = state.editorColumns.length >= MAX_EDITOR_COLUMNS && state.columnDiffEnabled;
  elements.addEditorColumn.title = state.editorColumns.length >= MAX_EDITOR_COLUMNS ? "已插入比较列" : "插入比较列";
  elements.addEditorColumn.textContent = state.editorColumns.length >= MAX_EDITOR_COLUMNS ? "已插入比较列" : "插入比较列";

  elements.editorColumns.innerHTML = state.editorColumns.map((column, index) => {
    const content = versionContent(prompt, column.versionId);
    const previousColumn = state.editorColumns[index - 1];
    const isCurrent = column.versionId === "current";
    const isActive = column.id === state.activeEditorColumnId;
    const stateText = state.columnDiffEnabled && previousColumn ? "对比左列" : isCurrent ? "可编辑" : "只读";
    const removeButton = state.editorColumns.length > 1
      ? `<button class="iconButton smallIconButton removeColumn" type="button" data-column-id="${column.id}" title="移除列">×</button>`
      : "";
    const body = state.columnDiffEnabled && previousColumn
      ? `<pre class="editorColumnDiff">${buildInlineDiff(versionContent(prompt, previousColumn.versionId), content)}</pre>`
      : `<textarea class="editorColumnTextarea" spellcheck="false" data-column-id="${column.id}" ${isCurrent ? "" : "readonly"}>${escapeText(content)}</textarea>`;

    return `
      <article class="editorColumn${isActive ? " active" : ""}" data-column-id="${column.id}">
        <div class="editorColumnHeader">
          <select class="editorColumnSelect" data-column-id="${column.id}" title="选择此列呈现的版本">
            ${versionOptions}
          </select>
          <span class="editorColumnState">${stateText}</span>
          ${removeButton}
        </div>
        ${body}
      </article>
    `;
  }).join("");

  elements.editorColumns.querySelectorAll(".editorColumnSelect").forEach((select) => {
    const column = state.editorColumns.find((item) => item.id === select.dataset.columnId);
    select.value = column?.versionId || "current";
  });
}

function deleteVersion(versionId) {
  const prompt = selectedPrompt();
  if (!prompt || versionId === "current") return;
  const version = prompt.versions.find((item) => item.id === versionId);
  if (!version) return;

  const confirmed = confirm(`删除版本「${version.name || "未命名版本"}」？`);
  if (!confirmed) return;

  prompt.versions = prompt.versions.filter((item) => item.id !== versionId);
  state.editorColumns = state.editorColumns.map((column) => (
    column.versionId === versionId ? { ...column, versionId: "current" } : column
  ));
  prompt.updatedAt = Date.now();
  scheduleSave();
  renderVersionPanel(prompt);
  elements.status.textContent = "已删除版本";
}

function setActiveColumnVersion(versionId) {
  const prompt = selectedPrompt();
  if (!prompt) return;
  const column = state.editorColumns.find((item) => item.id === state.activeEditorColumnId) || state.editorColumns[0];
  if (!column) return;
  column.versionId = versionId;
  state.activeEditorColumnId = column.id;
  renderVersionPanel(prompt);
}

function addEditorColumn() {
  const prompt = selectedPrompt();
  if (!prompt) return;

  if (state.editorColumns.length < MAX_EDITOR_COLUMNS) {
    const latestVersion = prompt.versions[prompt.versions.length - 1];
    const column = { id: uid(), versionId: latestVersion?.id || "current" };
    state.editorColumns.push(column);
    state.activeEditorColumnId = column.id;
  }
  if (state.editorColumns.length === MAX_EDITOR_COLUMNS) {
    state.columnDiffEnabled = true;
  }
  renderVersionPanel(prompt);
}

function removeEditorColumn(columnId) {
  const prompt = selectedPrompt();
  if (!prompt || state.editorColumns.length <= 1) return;
  state.editorColumns = state.editorColumns.filter((column) => column.id !== columnId);
  if (!state.editorColumns.some((column) => column.id === state.activeEditorColumnId)) {
    state.activeEditorColumnId = state.editorColumns[0]?.id || "";
  }
  if (state.editorColumns.length !== 2) state.columnDiffEnabled = false;
  renderVersionPanel(prompt);
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
  if (state.editorColumns.length) {
    const column = state.editorColumns.find((item) => item.id === state.activeEditorColumnId) || state.editorColumns[state.editorColumns.length - 1];
    column.versionId = version.id;
    state.activeEditorColumnId = column.id;
  }
  renderVersionPanel(prompt);
  elements.status.textContent = `已保存版本「${version.name}」`;
}

function openTextEditor() {
  const prompt = selectedPrompt();
  if (!prompt) return;
  if (!state.editorColumns.length) {
    const id = uid();
    state.editorColumns = [{ id, versionId: "current" }];
    state.activeEditorColumnId = id;
  }
  renderVersionPanel(prompt);
  elements.editorDialog.hidden = false;
  elements.editorColumns.querySelector(".editorColumnTextarea:not([readonly])")?.focus();
}

function closeTextEditor() {
  elements.editorDialog.hidden = true;
}

function toggleSidebar() {
  const collapsed = elements.shell.classList.toggle("sidebarCollapsed");
  elements.sidebarToggle.title = collapsed ? "展开侧边栏" : "收缩侧边栏";
  elements.sidebarToggle.setAttribute("aria-label", collapsed ? "展开侧边栏" : "收缩侧边栏");
  elements.sidebarToggle.setAttribute("aria-expanded", String(!collapsed));
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
  elements.brandMark.addEventListener("click", () => {
    if (elements.shell.classList.contains("sidebarCollapsed")) toggleSidebar();
  });
  bindResizableColumns();
  elements.currentStore.addEventListener("click", () => {
    switchStore(() => window.promptDock.chooseStore(), "已切换数据源");
  });
  elements.openTextEditor.addEventListener("click", openTextEditor);
  elements.closeTextEditor.addEventListener("click", closeTextEditor);
  elements.editorDialog.addEventListener("click", (event) => {
    if (event.target === elements.editorDialog) closeTextEditor();
  });
  $("#newPrompt").addEventListener("click", () => createPrompt());
  $("#duplicatePrompt").addEventListener("click", () => createPrompt(selectedPrompt()));
  $("#copyPrompt").addEventListener("click", copySelected);
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

  elements.saveVersion.addEventListener("click", saveCurrentVersion);
  elements.toggleVersionSidebar.addEventListener("click", () => {
    state.versionSidebarCollapsed = !state.versionSidebarCollapsed;
    const prompt = selectedPrompt();
    if (prompt) renderVersionPanel(prompt);
  });
  elements.addEditorColumn.addEventListener("click", addEditorColumn);
  elements.versionList.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".versionDelete");
    if (deleteButton) {
      event.preventDefault();
      event.stopPropagation();
      deleteVersion(deleteButton.dataset.versionId);
      return;
    }
    const button = event.target.closest(".versionListItem");
    if (!button) return;
    setActiveColumnVersion(button.dataset.versionId);
  });
  elements.versionList.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const deleteButton = event.target.closest(".versionDelete");
    if (!deleteButton) return;
    event.preventDefault();
    deleteVersion(deleteButton.dataset.versionId);
  });

  elements.contentInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.content = event.target.value;
    });
    const prompt = selectedPrompt();
    if (prompt && !elements.editorDialog.hidden && state.editorColumns.some((column) => column.versionId === "current")) {
      renderEditorColumns(prompt);
    }
  });

  elements.editorColumns.addEventListener("click", (event) => {
    const removeButton = event.target.closest(".removeColumn");
    if (removeButton) {
      event.stopPropagation();
      removeEditorColumn(removeButton.dataset.columnId);
      return;
    }
    if (event.target.closest("select, button, textarea")) return;
    const column = event.target.closest(".editorColumn");
    if (!column) return;
    state.activeEditorColumnId = column.dataset.columnId;
    const prompt = selectedPrompt();
    if (prompt) renderVersionPanel(prompt);
  });

  elements.editorColumns.addEventListener("change", (event) => {
    if (!event.target.matches(".editorColumnSelect")) return;
    const column = state.editorColumns.find((item) => item.id === event.target.dataset.columnId);
    const prompt = selectedPrompt();
    if (!column || !prompt) return;
    column.versionId = event.target.value;
    state.activeEditorColumnId = column.id;
    renderVersionPanel(prompt);
  });

  elements.editorColumns.addEventListener("input", (event) => {
    if (!event.target.matches(".editorColumnTextarea")) return;
    const column = state.editorColumns.find((item) => item.id === event.target.dataset.columnId);
    if (!column || column.versionId !== "current") return;
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
