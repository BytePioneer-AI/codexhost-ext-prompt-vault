const COPY = {
  en: {
    searchPlaceholder: "Search prompts, tags, or content...",
    allTags: "All tags",
    newPrompt: "New Prompt",
    settings: "Preferences",
    vaultDirLabel: "Storage Folder (optional)",
    vaultDirPlaceholder: "Leave empty to use default local folder",
    currentFolderPrefix: "Currently saved in:",
    defaultTagLabel: "Default Tag (optional)",
    defaultTagPlaceholder: "e.g. writing",
    saveSettings: "Save",
    settingsSaved: "Preferences saved",
    titleLabel: "Title",
    titlePlaceholder: "Give this prompt a short name",
    tagsLabel: "Tags",
    tagsPlaceholder: "Separate with commas, e.g. writing, review",
    bodyLabel: "Prompt Content",
    bodyPlaceholder: "Write a reusable prompt template here so you can copy it anytime...",
    copy: "Copy",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy to clipboard",
    save: "Save",
    saving: "Saving...",
    saved: "Saved",
    titleRequired: "Please enter a title first",
    delete: "Delete",
    confirmDelete: "Click again to delete",
    deleted: "Prompt deleted",
    emptyTitle: "No prompts yet",
    emptySub: "Save your go-to prompts here so you can find and copy them with one click.",
    emptyFilterTitle: "No matching prompts",
    emptyFilterSub: "Try a different keyword or switch back to all tags.",
    newDraft: "New prompt · Not saved yet",
    unsavedChanges: "Unsaved changes",
    lastSaved: "Last saved",
    countUnit: "prompts",
    errorPrefix: "Something went wrong:",
    noExcerpt: "No content yet",
  },
  "zh-CN": {
    searchPlaceholder: "搜索提示词标题、标签或内容...",
    allTags: "全部标签",
    newPrompt: "新建提示词",
    settings: "偏好设置",
    vaultDirLabel: "保存位置（可选）",
    vaultDirPlaceholder: "留空则自动保存在本机默认位置",
    currentFolderPrefix: "当前保存位置：",
    defaultTagLabel: "新建默认标签（可选）",
    defaultTagPlaceholder: "例如：常用",
    saveSettings: "保存设置",
    settingsSaved: "设置已保存",
    titleLabel: "标题",
    titlePlaceholder: "给这条提示词起个名字，例如：周报润色助手",
    tagsLabel: "标签",
    tagsPlaceholder: "多个标签用逗号隔开，例如：写作, 工作",
    bodyLabel: "提示词内容",
    bodyPlaceholder: "在这里写下常用的提问模板，之后随时搜索、一键复制使用...",
    copy: "一键复制",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败，请手动选中内容复制",
    save: "保存",
    saving: "保存中...",
    saved: "已保存",
    titleRequired: "请先输入标题",
    delete: "删除",
    confirmDelete: "再次点击确认删除",
    deleted: "已删除",
    emptyTitle: "还没有提示词",
    emptySub: "把常用的提问模板记在这里，桌面端与网页端随时一键复制复用。",
    emptyFilterTitle: "没有找到匹配的提示词",
    emptyFilterSub: "试试换个关键词，或者切回「全部标签」。",
    newDraft: "新提示词 · 尚未保存",
    unsavedChanges: "有未保存的修改",
    lastSaved: "上次保存",
    countUnit: "条提示词",
    errorPrefix: "操作失败：",
    noExcerpt: "暂无内容",
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

function formatDate(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

async function copyTextToClipboard(text, doc) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fallback below.
    }
  }
  try {
    const area = doc.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    doc.body.append(area);
    area.select();
    const ok = doc.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
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
  let totalCount = 0;
  let allTags = [];
  let query = "";
  let selectedTag = "";
  let selectedSlug = null;
  let isDraft = true;
  let dirty = false;
  let saving = false;
  let confirmDelete = false;
  let settingsOpen = false;
  let toastText = "";
  let toastTone = "info";
  let toastTimer = null;

  let draftTitle = "";
  let draftTags = "";
  let draftBody = "";
  let draftUpdatedAt = "";

  const container = el(doc, "div", "pv-root");
  container.dataset.pvHost = api.hostTarget;
  container.dataset.scheme = colorScheme;
  root.replaceChildren(container);

  function setToast(text, tone = "info") {
    toastText = text;
    toastTone = tone;
    if (toastTimer) clearTimeout(toastTimer);
    renderToast();
    if (text) {
      toastTimer = setTimeout(() => {
        toastText = "";
        renderToast();
      }, 2800);
    }
  }

  const topbar = el(doc, "div", "pv-topbar");
  const searchWrap = el(doc, "div", "pv-search-wrap");
  const searchInput = el(doc, "input", "pv-input pv-search");
  searchInput.type = "search";
  searchInput.setAttribute("data-pv-search", "true");

  const tagSelect = el(doc, "select", "pv-select");
  tagSelect.setAttribute("data-pv-tag-filter", "true");

  const topActions = el(doc, "div", "pv-top-actions");
  const newBtn = el(doc, "button", "pv-btn pv-btn-primary");
  newBtn.type = "button";
  newBtn.setAttribute("data-pv-new", "true");

  const settingsBtn = el(doc, "button", "pv-btn pv-btn-ghost");
  settingsBtn.type = "button";
  settingsBtn.setAttribute("data-pv-settings-toggle", "true");

  searchWrap.append(searchInput, tagSelect);
  topActions.append(newBtn, settingsBtn);
  topbar.append(searchWrap, topActions);

  const settingsPanel = el(doc, "form", "pv-settings-panel");
  settingsPanel.setAttribute("data-pv-settings-panel", "true");
  settingsPanel.hidden = true;

  const settingsRow = el(doc, "div", "pv-settings-row");

  const vaultDirField = el(doc, "label", "pv-field");
  const vaultDirLabelEl = el(doc, "span", "pv-field-label");
  const vaultDirInput = el(doc, "input", "pv-input");
  vaultDirInput.type = "text";
  vaultDirInput.setAttribute("data-pv-setting-dir", "true");
  vaultDirField.append(vaultDirLabelEl, vaultDirInput);

  const defaultTagField = el(doc, "label", "pv-field pv-field-narrow");
  const defaultTagLabelEl = el(doc, "span", "pv-field-label");
  const defaultTagInput = el(doc, "input", "pv-input");
  defaultTagInput.type = "text";
  defaultTagInput.setAttribute("data-pv-setting-tag", "true");
  defaultTagField.append(defaultTagLabelEl, defaultTagInput);

  const saveSettingsBtn = el(doc, "button", "pv-btn pv-btn-primary pv-settings-save");
  saveSettingsBtn.type = "submit";
  saveSettingsBtn.setAttribute("data-pv-save-settings", "true");

  settingsRow.append(vaultDirField, defaultTagField, saveSettingsBtn);

  const currentFolderNote = el(doc, "p", "pv-settings-note");
  currentFolderNote.hidden = true;
  settingsPanel.append(settingsRow, currentFolderNote);

  const toastEl = el(doc, "div", "pv-toast");
  toastEl.setAttribute("role", "status");
  toastEl.hidden = true;

  const workspace = el(doc, "div", "pv-workspace");

  const listPane = el(doc, "aside", "pv-list-pane");
  const listHeader = el(doc, "div", "pv-list-header");
  const listCount = el(doc, "span", "pv-list-count");
  listHeader.append(listCount);
  const listContainer = el(doc, "div", "pv-list");
  listContainer.setAttribute("data-pv-list", "true");
  listPane.append(listHeader, listContainer);

  const editorPane = el(doc, "section", "pv-editor-pane");
  editorPane.setAttribute("data-pv-editor", "true");

  const metaGrid = el(doc, "div", "pv-meta-grid");
  const titleField = el(doc, "label", "pv-field");
  const titleLabelEl = el(doc, "span", "pv-field-label");
  const titleInput = el(doc, "input", "pv-input pv-title-input");
  titleInput.type = "text";
  titleInput.setAttribute("data-pv-title", "true");
  titleField.append(titleLabelEl, titleInput);

  const tagsField = el(doc, "label", "pv-field");
  const tagsLabelEl = el(doc, "span", "pv-field-label");
  const tagsInput = el(doc, "input", "pv-input");
  tagsInput.type = "text";
  tagsInput.setAttribute("data-pv-tags-input", "true");
  tagsField.append(tagsLabelEl, tagsInput);

  metaGrid.append(titleField, tagsField);

  const bodyField = el(doc, "label", "pv-field pv-body-field");
  const bodyLabelEl = el(doc, "span", "pv-field-label");
  const bodyTextarea = el(doc, "textarea", "pv-textarea");
  bodyTextarea.rows = 12;
  bodyTextarea.setAttribute("data-pv-body", "true");
  bodyField.append(bodyLabelEl, bodyTextarea);

  const editorFooter = el(doc, "div", "pv-editor-footer");
  const metaStatusEl = el(doc, "span", "pv-meta-status");

  const actionsRow = el(doc, "div", "pv-actions");
  const copyBtn = el(doc, "button", "pv-btn pv-btn-ghost");
  copyBtn.type = "button";
  copyBtn.setAttribute("data-pv-copy", "true");

  const deleteBtn = el(doc, "button", "pv-btn pv-btn-danger");
  deleteBtn.type = "button";
  deleteBtn.setAttribute("data-pv-delete", "true");

  const saveBtn = el(doc, "button", "pv-btn pv-btn-primary");
  saveBtn.type = "button";
  saveBtn.setAttribute("data-pv-save", "true");

  actionsRow.append(copyBtn, deleteBtn, saveBtn);
  editorFooter.append(metaStatusEl, actionsRow);

  editorPane.append(metaGrid, bodyField, editorFooter);
  workspace.append(listPane, editorPane);

  container.append(topbar, settingsPanel, toastEl, workspace);

  function renderToast() {
    if (!toastText) {
      toastEl.hidden = true;
      toastEl.textContent = "";
      return;
    }
    toastEl.hidden = false;
    toastEl.dataset.tone = toastTone;
    toastEl.textContent = toastText;
  }

  function renderEditorStatus() {
    const t = getCopy(locale);
    if (isDraft) {
      metaStatusEl.textContent = t.newDraft;
      metaStatusEl.dataset.dirty = dirty ? "true" : "false";
    } else if (dirty) {
      metaStatusEl.textContent = t.unsavedChanges;
      metaStatusEl.dataset.dirty = "true";
    } else if (draftUpdatedAt) {
      metaStatusEl.textContent = `${t.lastSaved} · ${formatDate(draftUpdatedAt)}`;
      metaStatusEl.dataset.dirty = "false";
    } else {
      metaStatusEl.textContent = "";
      metaStatusEl.dataset.dirty = "false";
    }
    saveBtn.disabled = saving;
    saveBtn.textContent = saving ? t.saving : t.save;
    deleteBtn.hidden = isDraft || !selectedSlug;
    deleteBtn.textContent = confirmDelete ? t.confirmDelete : t.delete;
  }

  function loadSelectionIntoEditor(item) {
    confirmDelete = false;
    dirty = false;
    if (!item) {
      isDraft = true;
      selectedSlug = null;
      draftTitle = "";
      const fallbackTag =
        typeof settings.defaultTag === "string" && settings.defaultTag.trim()
          ? settings.defaultTag.trim()
          : info?.defaultTag || "";
      draftTags = fallbackTag;
      draftBody = "";
      draftUpdatedAt = "";
    } else {
      isDraft = false;
      selectedSlug = item.slug;
      draftTitle = item.title;
      draftTags = item.tags.join(", ");
      draftBody = item.body;
      draftUpdatedAt = item.updatedAt || "";
    }
    titleInput.value = draftTitle;
    tagsInput.value = draftTags;
    bodyTextarea.value = draftBody;
    renderEditorStatus();
    renderList();
  }

  function renderSettingsNote() {
    const t = getCopy(locale);
    if (info?.vaultDir) {
      currentFolderNote.hidden = false;
      currentFolderNote.textContent = `${t.currentFolderPrefix} ${info.vaultDir}`;
    } else {
      currentFolderNote.hidden = true;
      currentFolderNote.textContent = "";
    }
  }

  function renderTagOptions() {
    const t = getCopy(locale);
    const current = selectedTag;
    tagSelect.replaceChildren();
    const allOpt = el(doc, "option", "", t.allTags);
    allOpt.value = "";
    tagSelect.append(allOpt);
    for (const tag of allTags) {
      const opt = el(doc, "option", "", `#${tag}`);
      opt.value = tag.toLowerCase();
      tagSelect.append(opt);
    }
    tagSelect.hidden = allTags.length === 0 && !current;
    tagSelect.value = allTags.some((tag) => tag.toLowerCase() === current) ? current : "";
  }

  function renderList() {
    const t = getCopy(locale);
    listCount.textContent = `${items.length} ${t.countUnit}`;
    listContainer.replaceChildren();

    if (items.length === 0) {
      const isFiltered = Boolean(query.trim() || selectedTag);
      const empty = el(doc, "div", "pv-empty");
      empty.append(
        el(doc, "p", "pv-empty-title", isFiltered ? t.emptyFilterTitle : t.emptyTitle),
        el(doc, "p", "pv-empty-sub", isFiltered ? t.emptyFilterSub : t.emptySub),
      );
      listContainer.append(empty);
      return;
    }

    for (const item of items) {
      const btn = el(
        doc,
        "button",
        `pv-item${!isDraft && selectedSlug === item.slug ? " pv-item-active" : ""}`,
      );
      btn.type = "button";
      btn.dataset.pvItem = item.slug;

      const head = el(doc, "div", "pv-item-head");
      head.append(
        el(doc, "span", "pv-item-title", item.title),
        el(doc, "span", "pv-item-time", formatDate(item.updatedAt)),
      );

      const excerpt = el(doc, "p", "pv-item-excerpt", item.excerpt || t.noExcerpt);
      btn.append(head, excerpt);

      if (item.tags.length > 0) {
        const tagRow = el(doc, "div", "pv-item-tags");
        for (const tag of item.tags.slice(0, 4)) {
          tagRow.append(el(doc, "span", "pv-tag-chip", `#${tag}`));
        }
        btn.append(tagRow);
      }

      btn.addEventListener("click", () => {
        loadSelectionIntoEditor(item);
      });
      listContainer.append(btn);
    }
  }

  function renderLabels() {
    const t = getCopy(locale);
    searchInput.placeholder = t.searchPlaceholder;
    newBtn.textContent = `+ ${t.newPrompt}`;
    settingsBtn.textContent = t.settings;
    vaultDirLabelEl.textContent = t.vaultDirLabel;
    vaultDirInput.placeholder = t.vaultDirPlaceholder;
    defaultTagLabelEl.textContent = t.defaultTagLabel;
    defaultTagInput.placeholder = t.defaultTagPlaceholder;
    saveSettingsBtn.textContent = t.saveSettings;
    titleLabelEl.textContent = t.titleLabel;
    titleInput.placeholder = t.titlePlaceholder;
    tagsLabelEl.textContent = t.tagsLabel;
    tagsInput.placeholder = t.tagsPlaceholder;
    bodyLabelEl.textContent = t.bodyLabel;
    bodyTextarea.placeholder = t.bodyPlaceholder;
    copyBtn.textContent = t.copy;
    renderEditorStatus();
    renderSettingsNote();
    renderTagOptions();
    renderList();
  }

  function syncSettingsInputs() {
    vaultDirInput.value = typeof settings.vaultDir === "string" ? settings.vaultDir : "";
    defaultTagInput.value = typeof settings.defaultTag === "string" ? settings.defaultTag : "";
  }

  async function refreshData(preferSlug = null) {
    if (disposed || api.signal.aborted) return;
    try {
      const [nextInfo, listResult] = await Promise.all([
        api.backend.invoke("vault/info"),
        api.backend.invoke("prompts/list", { query, tag: selectedTag }),
      ]);
      if (disposed || api.signal.aborted) return;
      info = nextInfo;
      items = Array.isArray(listResult?.items) ? listResult.items : [];
      totalCount = typeof listResult?.totalCount === "number" ? listResult.totalCount : items.length;
      allTags = Array.isArray(listResult?.tags) ? listResult.tags : [];

      const targetSlug = preferSlug ?? selectedSlug;
      if (targetSlug) {
        const match = items.find((it) => it.slug === targetSlug);
        if (match) {
          loadSelectionIntoEditor(match);
        } else if (!isDraft) {
          loadSelectionIntoEditor(items[0] ?? null);
        }
      } else if (items.length > 0 && !dirty) {
        loadSelectionIntoEditor(items[0]);
      } else if (totalCount === 0 && !dirty) {
        loadSelectionIntoEditor(null);
      } else {
        renderLabels();
      }
      renderSettingsNote();
      renderTagOptions();
      renderList();
    } catch (error) {
      if (disposed || api.signal.aborted) return;
      const t = getCopy(locale);
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  }

  let searchDebounce = null;
  const onSearchInput = () => {
    query = searchInput.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      void refreshData();
    }, 120);
  };
  searchInput.addEventListener("input", onSearchInput);
  cleanups.push(() => {
    searchInput.removeEventListener("input", onSearchInput);
    if (searchDebounce) clearTimeout(searchDebounce);
  });

  const onTagChange = () => {
    selectedTag = tagSelect.value;
    void refreshData();
  };
  tagSelect.addEventListener("change", onTagChange);
  cleanups.push(() => tagSelect.removeEventListener("change", onTagChange));

  const onNewClick = () => {
    loadSelectionIntoEditor(null);
    titleInput.focus();
  };
  newBtn.addEventListener("click", onNewClick);
  cleanups.push(() => newBtn.removeEventListener("click", onNewClick));

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
      const next = {
        ...settings,
        vaultDir: vaultDirInput.value.trim(),
        defaultTag: defaultTagInput.value.trim(),
      };
      settings = await api.storage.set(next);
      syncSettingsInputs();
      setToast(t.settingsSaved, "success");
      await refreshData();
    } catch (error) {
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  };
  settingsPanel.addEventListener("submit", onSettingsSubmit);
  cleanups.push(() => settingsPanel.removeEventListener("submit", onSettingsSubmit));

  const markDirty = () => {
    if (!dirty) {
      dirty = true;
      renderEditorStatus();
    }
  };
  const onTitleInput = () => {
    draftTitle = titleInput.value;
    markDirty();
  };
  const onTagsInput = () => {
    draftTags = tagsInput.value;
    markDirty();
  };
  const onBodyInput = () => {
    draftBody = bodyTextarea.value;
    markDirty();
  };
  titleInput.addEventListener("input", onTitleInput);
  tagsInput.addEventListener("input", onTagsInput);
  bodyTextarea.addEventListener("input", onBodyInput);
  cleanups.push(() => {
    titleInput.removeEventListener("input", onTitleInput);
    tagsInput.removeEventListener("input", onTagsInput);
    bodyTextarea.removeEventListener("input", onBodyInput);
  });

  const onSaveClick = async () => {
    if (saving) return;
    const t = getCopy(locale);
    const title = titleInput.value.trim();
    if (!title) {
      setToast(t.titleRequired, "danger");
      titleInput.focus();
      return;
    }
    saving = true;
    renderEditorStatus();
    const payload = {
      title,
      tags: tagsInput.value,
      body: bodyTextarea.value,
      ...(!isDraft && selectedSlug ? { slug: selectedSlug, originalSlug: selectedSlug } : {}),
    };
    try {
      const saved = await api.backend.invoke("prompts/save", payload);
      if (disposed || api.signal.aborted) return;
      isDraft = false;
      dirty = false;
      selectedSlug = saved.slug;
      draftUpdatedAt = saved.updatedAt || "";
      setToast(t.saved, "success");
      await refreshData(saved.slug);
    } catch (error) {
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    } finally {
      saving = false;
      if (!disposed) renderEditorStatus();
    }
  };
  saveBtn.addEventListener("click", onSaveClick);
  cleanups.push(() => saveBtn.removeEventListener("click", onSaveClick));

  const onKeyDown = (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      void onSaveClick();
    }
  };
  editorPane.addEventListener("keydown", onKeyDown);
  cleanups.push(() => editorPane.removeEventListener("keydown", onKeyDown));

  const onCopyClick = async () => {
    const t = getCopy(locale);
    const ok = await copyTextToClipboard(bodyTextarea.value, doc);
    setToast(ok ? t.copied : t.copyFailed, ok ? "success" : "danger");
  };
  copyBtn.addEventListener("click", onCopyClick);
  cleanups.push(() => copyBtn.removeEventListener("click", onCopyClick));

  const onDeleteClick = async () => {
    if (isDraft || !selectedSlug) return;
    const t = getCopy(locale);
    if (!confirmDelete) {
      confirmDelete = true;
      renderEditorStatus();
      return;
    }
    try {
      const target = selectedSlug;
      await api.backend.invoke("prompts/delete", { slug: target });
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
  deleteBtn.addEventListener("click", onDeleteClick);
  cleanups.push(() => deleteBtn.removeEventListener("click", onDeleteClick));

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
      syncSettingsInputs();
      void refreshData();
    }),
  );

  const onAbort = () => {
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
  };
  api.signal.addEventListener("abort", onAbort, { once: true });
  cleanups.push(() => api.signal.removeEventListener("abort", onAbort));

  renderLabels();
  try {
    const loaded = await api.storage.get();
    if (!disposed && !api.signal.aborted && loaded && typeof loaded === "object") {
      settings = loaded;
      syncSettingsInputs();
    }
  } catch {
    // Keep defaults.
  }
  await refreshData();

  return () => {
    disposed = true;
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
