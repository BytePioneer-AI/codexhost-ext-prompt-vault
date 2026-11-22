import {
  copyTextToClipboard,
  extractVariables,
  formatShortDate,
  shortcutHint,
} from "../shared/templates.mjs";

const COPY = {
  en: {
    searchPlaceholder: "Search prompts...",
    allTags: "All",
    newPrompt: "New",
    settings: "Preferences",
    vaultDirLabel: "Storage Folder (optional)",
    vaultDirPlaceholder: "Leave empty to use default local folder",
    currentFolderPrefix: "Currently saved in:",
    defaultTagLabel: "Default Tag (optional)",
    defaultTagPlaceholder: "e.g. writing",
    saveSettings: "Save",
    settingsSaved: "Preferences saved",
    titlePlaceholder: "Untitled prompt",
    tagsPlaceholder: "Add tags (comma separated)",
    bodyPlaceholder: "Write your reusable prompt here...\n\nTip: Use {{variable}} placeholders to fill values on the fly when inserting in chat.",
    copy: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy",
    pin: "Pin",
    pinned: "Pinned",
    delete: "Delete",
    confirmDelete: "Confirm delete",
    deleted: "Deleted",
    saving: "Saving...",
    savedAt: "Saved",
    newDraft: "Start typing a title to auto-save",
    unsaved: "Unsaved changes",
    emptyTitle: "No prompts yet",
    emptySub: "Save reusable prompts here, then press {key} in any chat to insert them directly.",
    emptyFilterTitle: "No matching prompts",
    emptyFilterSub: "Try another keyword or clear the tag filter.",
    shortcutBanner: "Tip: Press {key} or click the floating button on any chat page to search & insert directly.",
    varHint: "Template variables: {vars}",
    noExcerpt: "Empty prompt",
    errorPrefix: "Error:",
  },
  "zh-CN": {
    searchPlaceholder: "搜索提示词...",
    allTags: "全部",
    newPrompt: "新建",
    settings: "偏好设置",
    vaultDirLabel: "保存位置（可选）",
    vaultDirPlaceholder: "留空则自动保存在本机默认位置",
    currentFolderPrefix: "当前保存位置：",
    defaultTagLabel: "新建默认标签（可选）",
    defaultTagPlaceholder: "例如：常用",
    saveSettings: "保存设置",
    settingsSaved: "设置已保存",
    titlePlaceholder: "输入提示词标题",
    tagsPlaceholder: "添加标签，用逗号分隔（选填）",
    bodyPlaceholder: "在这里写下常用的提问模板...\n\n小技巧：用 {{变量名}} 占位（如 {{风格}}、{{内容}}），在聊天页呼出时会自动弹出填空框。",
    copy: "复制",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败",
    pin: "置顶",
    pinned: "已置顶",
    delete: "删除",
    confirmDelete: "再次点击删除",
    deleted: "已删除",
    saving: "保存中...",
    savedAt: "已自动保存",
    newDraft: "输入标题后将自动保存",
    unsaved: "待保存...",
    emptyTitle: "还没有提示词",
    emptySub: "记下常用的提问模板，聊天时按 {key} 即可原地搜索并直接插入输入框。",
    emptyFilterTitle: "没有找到匹配的提示词",
    emptyFilterSub: "试试换个关键词，或者点「全部」查看所有提示词。",
    shortcutBanner: "快捷用法：在聊天页按 {key} 或点击右下角悬浮按钮，不用切页即可直接插入输入框。",
    varHint: "包含可填空变量：{vars}",
    noExcerpt: "暂无内容",
    errorPrefix: "操作失败：",
  },
};

function getCopy(locale) {
  return String(locale || "").toLowerCase().startsWith("zh") ? COPY["zh-CN"] : COPY.en;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export async function mount(root, api) {
  const doc = root.ownerDocument;
  const cleanups = [];
  let disposed = false;

  let locale = api.locale;
  let colorScheme = api.colorScheme;
  let settings = {};
  let info = null;
  let items = [];
  let allTags = [];
  let query = "";
  let selectedTag = "";
  let selectedSlug = null;
  let isDraft = true;
  let pinned = false;
  let dirty = false;
  let saving = false;
  let confirmDelete = false;
  let settingsOpen = false;
  let draftUpdatedAt = "";
  let autoSaveTimer = null;
  let toastTimer = null;

  const container = el(doc, "div", "pv-root");
  container.dataset.scheme = colorScheme;
  root.replaceChildren(container);

  const toastEl = el(doc, "div", "pv-toast");
  toastEl.setAttribute("role", "status");
  toastEl.hidden = true;

  const settingsPanel = el(doc, "form", "pv-settings-panel");
  settingsPanel.hidden = true;
  const settingsRow = el(doc, "div", "pv-settings-row");

  const vaultDirField = el(doc, "label", "pv-setting-field");
  const vaultDirLabel = el(doc, "span", "pv-setting-label");
  const vaultDirInput = el(doc, "input", "pv-setting-input");
  vaultDirInput.type = "text";
  vaultDirField.append(vaultDirLabel, vaultDirInput);

  const defaultTagField = el(doc, "label", "pv-setting-field pv-setting-narrow");
  const defaultTagLabel = el(doc, "span", "pv-setting-label");
  const defaultTagInput = el(doc, "input", "pv-setting-input");
  defaultTagInput.type = "text";
  defaultTagField.append(defaultTagLabel, defaultTagInput);

  const saveSettingsBtn = el(doc, "button", "pv-pill-btn pv-pill-primary");
  saveSettingsBtn.type = "submit";
  settingsRow.append(vaultDirField, defaultTagField, saveSettingsBtn);

  const currentFolderNote = el(doc, "p", "pv-settings-note");
  currentFolderNote.hidden = true;
  settingsPanel.append(settingsRow, currentFolderNote);

  const split = el(doc, "div", "pv-split");

  // Left Sidebar
  const sidebar = el(doc, "aside", "pv-sidebar");
  const sideTop = el(doc, "div", "pv-side-top");
  const searchInput = el(doc, "input", "pv-search");
  searchInput.type = "search";
  const newBtn = el(doc, "button", "pv-pill-btn pv-pill-primary");
  newBtn.type = "button";
  sideTop.append(searchInput, newBtn);

  const tagBar = el(doc, "div", "pv-tag-bar");
  tagBar.hidden = true;

  const listEl = el(doc, "div", "pv-list");
  sidebar.append(sideTop, tagBar, listEl);

  // Right Canvas
  const canvas = el(doc, "section", "pv-canvas");

  const canvasToolbar = el(doc, "div", "pv-canvas-toolbar");
  const statusEl = el(doc, "span", "pv-status");
  const toolbarActions = el(doc, "div", "pv-toolbar-actions");

  const pinBtn = el(doc, "button", "pv-ghost-btn");
  pinBtn.type = "button";
  const copyBtn = el(doc, "button", "pv-ghost-btn");
  copyBtn.type = "button";
  const settingsBtn = el(doc, "button", "pv-ghost-btn");
  settingsBtn.type = "button";
  const deleteBtn = el(doc, "button", "pv-ghost-btn pv-ghost-danger");
  deleteBtn.type = "button";
  toolbarActions.append(pinBtn, copyBtn, settingsBtn, deleteBtn);
  canvasToolbar.append(statusEl, toolbarActions);

  const titleInput = el(doc, "input", "pv-title");
  titleInput.type = "text";

  const tagsInput = el(doc, "input", "pv-tags");
  tagsInput.type = "text";

  const varPreviewEl = el(doc, "div", "pv-var-preview");
  varPreviewEl.hidden = true;

  const bodyTextarea = el(doc, "textarea", "pv-body");

  const tipFooter = el(doc, "div", "pv-tip-footer");

  canvas.append(canvasToolbar, titleInput, tagsInput, varPreviewEl, bodyTextarea, tipFooter);
  split.append(sidebar, canvas);
  container.append(settingsPanel, toastEl, split);

  function setToast(text, tone = "info") {
    if (toastTimer) clearTimeout(toastTimer);
    if (!text) {
      toastEl.hidden = true;
      toastEl.textContent = "";
      return;
    }
    toastEl.hidden = false;
    toastEl.dataset.tone = tone;
    toastEl.textContent = text;
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
      toastEl.textContent = "";
    }, 2400);
  }

  function renderVarsHint() {
    const t = getCopy(locale);
    const vars = extractVariables(bodyTextarea.value);
    if (vars.length === 0) {
      varPreviewEl.hidden = true;
      varPreviewEl.textContent = "";
      return;
    }
    varPreviewEl.hidden = false;
    varPreviewEl.textContent = t.varHint.replace("{vars}", vars.map((v) => `{{${v}}}`).join(" · "));
  }

  function renderStatus() {
    const t = getCopy(locale);
    if (saving) {
      statusEl.textContent = t.saving;
      statusEl.dataset.state = "saving";
    } else if (isDraft) {
      statusEl.textContent = titleInput.value.trim() ? t.unsaved : t.newDraft;
      statusEl.dataset.state = "draft";
    } else if (dirty) {
      statusEl.textContent = t.unsaved;
      statusEl.dataset.state = "dirty";
    } else if (draftUpdatedAt) {
      statusEl.textContent = `${t.savedAt} · ${formatShortDate(draftUpdatedAt)}`;
      statusEl.dataset.state = "saved";
    } else {
      statusEl.textContent = "";
      statusEl.dataset.state = "idle";
    }
    pinBtn.textContent = pinned ? t.pinned : t.pin;
    pinBtn.dataset.active = pinned ? "true" : "false";
    deleteBtn.hidden = isDraft || !selectedSlug;
    deleteBtn.textContent = confirmDelete ? t.confirmDelete : t.delete;
  }

  function loadItem(item) {
    if (autoSaveTimer) {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    confirmDelete = false;
    dirty = false;
    if (!item) {
      isDraft = true;
      selectedSlug = null;
      pinned = false;
      titleInput.value = "";
      tagsInput.value =
        typeof settings.defaultTag === "string" && settings.defaultTag.trim()
          ? settings.defaultTag.trim()
          : info?.defaultTag || "";
      bodyTextarea.value = "";
      draftUpdatedAt = "";
    } else {
      isDraft = false;
      selectedSlug = item.slug;
      pinned = Boolean(item.pinned);
      titleInput.value = item.title;
      tagsInput.value = item.tags.join(", ");
      bodyTextarea.value = item.body;
      draftUpdatedAt = item.updatedAt || "";
    }
    renderVarsHint();
    renderStatus();
    renderList();
  }

  function renderTagBar() {
    const t = getCopy(locale);
    tagBar.replaceChildren();
    if (allTags.length === 0 && !selectedTag) {
      tagBar.hidden = true;
      return;
    }
    tagBar.hidden = false;

    const addChip = (label, value) => {
      const chip = el(
        doc,
        "button",
        `pv-tag-filter${selectedTag === value ? " pv-tag-filter-active" : ""}`,
        label,
      );
      chip.type = "button";
      chip.addEventListener("click", () => {
        selectedTag = value;
        void refreshData();
      });
      tagBar.append(chip);
    };

    addChip(t.allTags, "");
    for (const tag of allTags) {
      addChip(`#${tag}`, tag.toLowerCase());
    }
  }

  function renderList() {
    const t = getCopy(locale);
    listEl.replaceChildren();

    if (items.length === 0) {
      const isFiltered = Boolean(query.trim() || selectedTag);
      const empty = el(doc, "div", "pv-empty");
      empty.append(
        el(doc, "p", "pv-empty-title", isFiltered ? t.emptyFilterTitle : t.emptyTitle),
        el(
          doc,
          "p",
          "pv-empty-sub",
          (isFiltered ? t.emptyFilterSub : t.emptySub).replace("{key}", shortcutHint()),
        ),
      );
      listEl.append(empty);
      return;
    }

    for (const item of items) {
      const row = el(
        doc,
        "div",
        `pv-item${!isDraft && selectedSlug === item.slug ? " pv-item-active" : ""}`,
      );
      row.setAttribute("role", "button");
      row.tabIndex = 0;

      const head = el(doc, "div", "pv-item-head");
      const titleWrap = el(doc, "div", "pv-item-title-wrap");
      if (item.pinned) {
        titleWrap.append(el(doc, "span", "pv-pin-dot"));
      }
      titleWrap.append(el(doc, "span", "pv-item-title", item.title));

      const quickCopy = el(doc, "button", "pv-item-copy", t.copy);
      quickCopy.type = "button";
      quickCopy.addEventListener("click", async (event) => {
        event.stopPropagation();
        const ok = await copyTextToClipboard(item.body, doc);
        setToast(ok ? t.copied : t.copyFailed, ok ? "success" : "danger");
      });

      head.append(titleWrap, quickCopy);
      row.append(head, el(doc, "p", "pv-item-excerpt", item.excerpt || t.noExcerpt));

      if (item.tags.length > 0) {
        const tagRow = el(doc, "div", "pv-item-tags");
        for (const tag of item.tags.slice(0, 3)) {
          tagRow.append(el(doc, "span", "pv-tag-chip", `#${tag}`));
        }
        row.append(tagRow);
      }

      row.addEventListener("click", () => loadItem(item));
      row.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          loadItem(item);
        }
      });
      listEl.append(row);
    }
  }

  function renderLabels() {
    const t = getCopy(locale);
    searchInput.placeholder = t.searchPlaceholder;
    newBtn.textContent = `+ ${t.newPrompt}`;
    settingsBtn.textContent = t.settings;
    vaultDirLabel.textContent = t.vaultDirLabel;
    vaultDirInput.placeholder = t.vaultDirPlaceholder;
    defaultTagLabel.textContent = t.defaultTagLabel;
    defaultTagInput.placeholder = t.defaultTagPlaceholder;
    saveSettingsBtn.textContent = t.saveSettings;
    titleInput.placeholder = t.titlePlaceholder;
    tagsInput.placeholder = t.tagsPlaceholder;
    bodyTextarea.placeholder = t.bodyPlaceholder;
    copyBtn.textContent = t.copy;
    tipFooter.textContent = t.shortcutBanner.replace("{key}", shortcutHint());
    if (info?.vaultDir) {
      currentFolderNote.hidden = false;
      currentFolderNote.textContent = `${t.currentFolderPrefix} ${info.vaultDir}`;
    } else {
      currentFolderNote.hidden = true;
    }
    renderVarsHint();
    renderStatus();
    renderTagBar();
    renderList();
  }

  async function saveCurrent(silent = true) {
    const title = titleInput.value.trim();
    if (!title || saving || disposed || api.signal.aborted) return;
    saving = true;
    renderStatus();
    const payload = {
      title,
      tags: tagsInput.value,
      body: bodyTextarea.value,
      pinned,
      ...(!isDraft && selectedSlug ? { slug: selectedSlug, originalSlug: selectedSlug } : {}),
    };
    try {
      const saved = await api.backend.invoke("prompts/save", payload);
      if (disposed || api.signal.aborted) return;
      isDraft = false;
      dirty = false;
      selectedSlug = saved.slug;
      draftUpdatedAt = saved.updatedAt || "";
      if (!silent) setToast(getCopy(locale).savedAt, "success");
      await refreshData(saved.slug, true);
    } catch (error) {
      const t = getCopy(locale);
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    } finally {
      saving = false;
      if (!disposed) renderStatus();
    }
  }

  function scheduleAutoSave() {
    dirty = true;
    renderStatus();
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (!titleInput.value.trim()) return;
    autoSaveTimer = setTimeout(() => {
      autoSaveTimer = null;
      void saveCurrent(true);
    }, 650);
  }

  async function refreshData(preferSlug = null, preserveEditor = false) {
    if (disposed || api.signal.aborted) return;
    try {
      const [nextInfo, listResult] = await Promise.all([
        api.backend.invoke("vault/info"),
        api.backend.invoke("prompts/list", { query, tag: selectedTag }),
      ]);
      if (disposed || api.signal.aborted) return;
      info = nextInfo;
      items = Array.isArray(listResult?.items) ? listResult.items : [];
      allTags = Array.isArray(listResult?.tags) ? listResult.tags : [];

      if (!preserveEditor) {
        const targetSlug = preferSlug ?? selectedSlug;
        if (targetSlug) {
          const match = items.find((it) => it.slug === targetSlug);
          if (match) loadItem(match);
          else if (!isDraft) loadItem(items[0] ?? null);
        } else if (items.length > 0 && !dirty) {
          loadItem(items[0]);
        } else if (items.length === 0 && !dirty) {
          loadItem(null);
        }
      }
      renderLabels();
    } catch (error) {
      if (disposed || api.signal.aborted) return;
      const t = getCopy(locale);
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  }

  let searchDebounce = null;
  const onSearch = () => {
    query = searchInput.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => void refreshData(null, true), 120);
  };
  searchInput.addEventListener("input", onSearch);
  cleanups.push(() => {
    searchInput.removeEventListener("input", onSearch);
    if (searchDebounce) clearTimeout(searchDebounce);
  });

  const onNew = () => {
    loadItem(null);
    titleInput.focus();
  };
  newBtn.addEventListener("click", onNew);
  cleanups.push(() => newBtn.removeEventListener("click", onNew));

  const onPin = () => {
    pinned = !pinned;
    renderStatus();
    if (titleInput.value.trim()) void saveCurrent(true);
  };
  pinBtn.addEventListener("click", onPin);
  cleanups.push(() => pinBtn.removeEventListener("click", onPin));

  const onCopy = async () => {
    const t = getCopy(locale);
    const ok = await copyTextToClipboard(bodyTextarea.value, doc);
    setToast(ok ? t.copied : t.copyFailed, ok ? "success" : "danger");
  };
  copyBtn.addEventListener("click", onCopy);
  cleanups.push(() => copyBtn.removeEventListener("click", onCopy));

  const onSettingsToggle = () => {
    settingsOpen = !settingsOpen;
    settingsPanel.hidden = !settingsOpen;
    settingsBtn.dataset.active = settingsOpen ? "true" : "false";
  };
  settingsBtn.addEventListener("click", onSettingsToggle);
  cleanups.push(() => settingsBtn.removeEventListener("click", onSettingsToggle));

  const onSettingsSubmit = async (event) => {
    event.preventDefault();
    const t = getCopy(locale);
    try {
      settings = await api.storage.set({
        ...settings,
        vaultDir: vaultDirInput.value.trim(),
        defaultTag: defaultTagInput.value.trim(),
      });
      setToast(t.settingsSaved, "success");
      await refreshData();
    } catch (error) {
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  };
  settingsPanel.addEventListener("submit", onSettingsSubmit);
  cleanups.push(() => settingsPanel.removeEventListener("submit", onSettingsSubmit));

  const onDelete = async () => {
    if (isDraft || !selectedSlug) return;
    const t = getCopy(locale);
    if (!confirmDelete) {
      confirmDelete = true;
      renderStatus();
      return;
    }
    try {
      await api.backend.invoke("prompts/delete", { slug: selectedSlug });
      if (disposed || api.signal.aborted) return;
      selectedSlug = null;
      dirty = false;
      confirmDelete = false;
      setToast(t.deleted, "success");
      await refreshData();
    } catch (error) {
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  };
  deleteBtn.addEventListener("click", onDelete);
  cleanups.push(() => deleteBtn.removeEventListener("click", onDelete));

  const onEditorInput = () => {
    renderVarsHint();
    scheduleAutoSave();
  };
  titleInput.addEventListener("input", onEditorInput);
  tagsInput.addEventListener("input", onEditorInput);
  bodyTextarea.addEventListener("input", onEditorInput);
  cleanups.push(() => {
    titleInput.removeEventListener("input", onEditorInput);
    tagsInput.removeEventListener("input", onEditorInput);
    bodyTextarea.removeEventListener("input", onEditorInput);
  });

  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }
      void saveCurrent(false);
    }
  };
  canvas.addEventListener("keydown", onKeyDown);
  cleanups.push(() => canvas.removeEventListener("keydown", onKeyDown));

  cleanups.push(
    api.onLocaleChange((nextLocale) => {
      locale = nextLocale;
      renderLabels();
    }),
  );
  cleanups.push(
    api.onColorSchemeChange((nextScheme) => {
      colorScheme = nextScheme;
      container.dataset.scheme = nextScheme;
    }),
  );
  cleanups.push(
    api.storage.onChange((nextValues) => {
      settings = nextValues && typeof nextValues === "object" ? nextValues : {};
      vaultDirInput.value = typeof settings.vaultDir === "string" ? settings.vaultDir : "";
      defaultTagInput.value = typeof settings.defaultTag === "string" ? settings.defaultTag : "";
      void refreshData();
    }),
  );

  const onAbort = () => {
    disposed = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (toastTimer) clearTimeout(toastTimer);
  };
  api.signal.addEventListener("abort", onAbort, { once: true });
  cleanups.push(() => api.signal.removeEventListener("abort", onAbort));

  renderLabels();
  try {
    const loaded = await api.storage.get();
    if (!disposed && !api.signal.aborted && loaded && typeof loaded === "object") {
      settings = loaded;
      vaultDirInput.value = typeof settings.vaultDir === "string" ? settings.vaultDir : "";
      defaultTagInput.value = typeof settings.defaultTag === "string" ? settings.defaultTag : "";
    }
  } catch {
    // Keep defaults.
  }
  await refreshData();

  return () => {
    disposed = true;
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    if (toastTimer) clearTimeout(toastTimer);
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        // Ignore teardown errors.
      }
    }
    root.replaceChildren();
  };
}
