const state = {
  prompts: [],
  selectedId: null,
  filter: "all",
  tag: "",
  query: "",
  saveTimer: null
};

const $ = (selector) => document.querySelector(selector);

const elements = {
  shortcutLabel: $("#shortcutLabel"),
  storePath: $("#storePath"),
  search: $("#search"),
  promptList: $("#promptList"),
  tagList: $("#tagList"),
  countLabel: $("#countLabel"),
  titleInput: $("#titleInput"),
  tagInput: $("#tagInput"),
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

function renderTags() {
  const tags = [...new Set(state.prompts.flatMap((prompt) => prompt.tags || []))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  elements.tagList.innerHTML = "";

  const all = document.createElement("button");
  all.className = `tag${state.tag ? "" : " active"}`;
  all.textContent = "全部标签";
  all.addEventListener("click", () => {
    state.tag = "";
    render();
  });
  elements.tagList.appendChild(all);

  tags.forEach((tag) => {
    const button = document.createElement("button");
    button.className = `tag${state.tag === tag ? " active" : ""}`;
    button.textContent = tag;
    button.addEventListener("click", () => {
      state.tag = state.tag === tag ? "" : tag;
      render();
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
  elements.favoriteButton.disabled = disabled;
  $("#deletePrompt").disabled = disabled;
  $("#duplicatePrompt").disabled = disabled;
  $("#copyPrompt").disabled = disabled;

  if (!prompt) {
    elements.titleInput.value = "";
    elements.tagInput.value = "";
    elements.contentInput.value = "";
    elements.favoriteButton.textContent = "☆";
    return;
  }

  elements.titleInput.value = prompt.title || "";
  elements.tagInput.value = (prompt.tags || []).join(", ");
  elements.contentInput.value = prompt.content || "";
  elements.favoriteButton.textContent = prompt.favorite ? "★" : "☆";
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

  elements.contentInput.addEventListener("input", (event) => {
    updateSelected((prompt) => {
      prompt.content = event.target.value;
    });
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
  const { prompts, storePath, shortcut } = await window.promptDock.load();
  state.prompts = Array.isArray(prompts) ? prompts : [];
  state.selectedId = state.prompts[0]?.id || null;
  elements.storePath.textContent = storePath;
  elements.shortcutLabel.textContent = `${shortcut} 唤起`;
  render();
}

init();
