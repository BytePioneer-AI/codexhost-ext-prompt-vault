const COPY = {
  en: {
    searchPlaceholder: "Search prompts, tags, or body...",
    allTags: "All tags",
    newPrompt: "New Prompt",
    settings: "Vault Settings",
    backendPid: "Host PID",
    vaultDirLabel: "Vault Directory (absolute path, empty = default)",
    defaultTagLabel: "Default Tag",
    saveSettings: "Save Settings",
    settingsSaved: "Settings saved",
    titleLabel: "Title",
    titlePlaceholder: "e.g. PR Security Review Prompt",
    slugLabel: "Filename slug (.md)",
    slugPlaceholder: "auto-generated-from-title",
    tagsLabel: "Tags (comma-separated)",
    tagsPlaceholder: "review, engineering",
    bodyLabel: "Markdown Content",
    bodyPlaceholder: "Write your reusable Markdown prompt here...",
    copy: "Copy Prompt",
    copied: "Copied!",
    save: "Save .md",
    saved: "Saved to disk",
    delete: "Delete",
    confirmDelete: "Confirm Delete",
    deleted: "Prompt deleted",
    emptyList: "No prompts match your filter.",
    createFirst: "Create a new prompt to write a Markdown file to disk.",
    fileLabel: "File:",
    newDraft: "Unsaved draft",
    countUnit: "prompts",
    errorPrefix: "Error:",
  },
  "zh-CN": {
    searchPlaceholder: "搜索提示词标题、标签或正文...",
    allTags: "全部标签",
    newPrompt: "新建提示词",
    settings: "仓库设置",
    backendPid: "共享后台 PID",
    vaultDirLabel: "提示词目录（本机绝对路径，留空使用默认目录）",
    defaultTagLabel: "默认标签",
    saveSettings: "保存设置",
    settingsSaved: "设置已保存",
    titleLabel: "标题",
    titlePlaceholder: "例如：代码审查与风险排查提示词",
    slugLabel: "文件名标识（.md）",
    slugPlaceholder: "留空将按标题自动生成",
    tagsLabel: "标签（逗号分隔）",
    tagsPlaceholder: "review, engineering",
    bodyLabel: "Markdown 正文",
    bodyPlaceholder: "在此编写可复用的 Markdown 提示词内容...",
    copy: "一键复制",
    copied: "已复制",
    save: "保存 .md",
    saved: "已写入磁盘",
    delete: "删除",
    confirmDelete: "确认删除",
    deleted: "已删除提示词",
    emptyList: "没有匹配的提示词。",
    createFirst: "点击「新建提示词」即可向本地目录写入真实 .md 文件。",
    fileLabel: "文件：",
    newDraft: "未保存草稿",
    countUnit: "条提示词",
    errorPrefix: "错误：",
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
  let allTags = [];
  let query = "";
  let selectedTag = "";
  let selectedSlug = null;
  let isDraft = false;
  let confirmDelete = false;
  let settingsOpen = false;
  let toastText = "";
  let toastTone = "info";
  let toastTimer = null;

  let draftTitle = "";
  let draftSlug = "";
  let draftTags = "";
  let draftBody = "";
  let draftFilePath = "";

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
      }, 3200);
    }
  }

  const topbar = el(doc, "div", "pv-topbar");
  const searchWrap = el(doc, "div", "pv-search-wrap");
  const searchInput = el(doc, "input", "pv-input pv-search");
  searchInput.type = "search";
  searchInput.setAttribute("data-pv-search", "true");

  const tagSelect = el(doc, "select", "pv-select");
  tagSelect.setAttribute("data-pv-tag-filter", "true");

  const newBtn = el(doc, "button", "pv-btn pv-btn-primary");
  newBtn.type = "button";
  newBtn.setAttribute("data-pv-new", "true");

  const settingsBtn = el(doc, "button", "pv-btn pv-btn-ghost");
  settingsBtn.type = "button";
  settingsBtn.setAttribute("data-pv-settings-toggle", "true");

  searchWrap.append(searchInput, tagSelect, newBtn, settingsBtn);

  const statusBadge = el(doc, "div", "pv-status-badge");
  statusBadge.setAttribute("data-pv-status", "true");
  const statusDot = el(doc, "span", "pv-status-dot");
  const pidLabel = el(doc, "span", "pv-status-pid");
  pidLabel.setAttribute("data-pv-pid", "true");
  const dirLabel = el(doc, "code", "pv-status-dir");
  dirLabel.setAttribute("data-pv-vault-dir", "true");
  statusBadge.append(statusDot, pidLabel, dirLabel);

  topbar.append(searchWrap, statusBadge);

  const settingsPanel = el(doc, "form", "pv-settings-panel");
  settingsPanel.setAttribute("data-pv-settings-panel", "true");
  settingsPanel.hidden = true;

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

  settingsPanel.append(vaultDirField, defaultTagField, saveSettingsBtn);

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
  const titleInput = el(doc, "input", "pv-input");
  titleInput.type = "text";
  titleInput.setAttribute("data-pv-title", "true");
  titleField.append(titleLabelEl, titleInput);

  const slugField = el(doc, "label", "pv-field");
  const slugLabelEl = el(doc, "span", "pv-field-label");
  const slugInput = el(doc, "input", "pv-input pv-mono");
  slugInput.type = "text";
  slugInput.setAttribute("data-pv-slug", "true");
  slugField.append(slugLabelEl, slugInput);

  const tagsField = el(doc, "label", "pv-field pv-field-full");
  const tagsLabelEl = el(doc, "span", "pv-field-label");
  const tagsInput = el(doc, "input", "pv-input");
  tagsInput.type = "text";
  tagsInput.setAttribute("data-pv-tags-input", "true");
  tagsField.append(tagsLabelEl, tagsInput);

  metaGrid.append(titleField, slugField, tagsField);

  const bodyField = el(doc, "label", "pv-field pv-body-field");
  const bodyLabelEl = el(doc, "span", "pv-field-label");
  const bodyTextarea = el(doc, "textarea", "pv-textarea");
  bodyTextarea.rows = 11;
  bodyTextarea.setAttribute("data-pv-body", "true");
  bodyField.append(bodyLabelEl, bodyTextarea);

  const editorFooter = el(doc, "div", "pv-editor-footer");
  const filePathEl = el(doc, "div", "pv-file-path");
  filePathEl.setAttribute("data-pv-filepath", "true");

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
  editorFooter.append(filePathEl, actionsRow);

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

  function loadSelectionIntoEditor(item) {
    confirmDelete = false;
    if (!item) {
      isDraft = true;
      selectedSlug = null;
      draftTitle = "";
      draftSlug = "";
      draftTags =
        typeof settings.defaultTag === "string" && settings.defaultTag.trim()
          ? settings.defaultTag.trim()
          : info?.defaultTag || "general";
      draftBody = "";
      draftFilePath = "";
    } else {
      isDraft = false;
      selectedSlug = item.slug;
      draftTitle = item.title;
      draftSlug = item.slug;
      draftTags = item.tags.join(", ");
      draftBody = item.body;
      draftFilePath = item.filePath;
    }
    syncEditorFields();
    renderList();
    renderLabels();
  }

  function syncEditorFields() {
    titleInput.value = draftTitle;
    slugInput.value = draftSlug;
    tagsInput.value = draftTags;
    bodyTextarea.value = draftBody;
    const t = getCopy(locale);
    filePathEl.textContent = draftFilePath
      ? `${t.fileLabel} ${draftFilePath}`
      : t.newDraft;
    deleteBtn.hidden = isDraft || !selectedSlug;
  }

  function renderStatus() {
    const t = getCopy(locale);
    if (info) {
      pidLabel.textContent = `${t.backendPid} #${info.pid}`;
      pidLabel.dataset.pidValue = String(info.pid);
      dirLabel.textContent = info.vaultDir;
      dirLabel.title = info.vaultDir;
      statusBadge.dataset.ready = "true";
    } else {
      pidLabel.textContent = `${t.backendPid} ...`;
      dirLabel.textContent = "";
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
      opt.value = tag;
      tagSelect.append(opt);
    }
    tagSelect.value = allTags.includes(current) ? current : "";
  }

  function renderList() {
    const t = getCopy(locale);
    listCount.textContent = `${items.length} ${t.countUnit}`;
    listContainer.replaceChildren();

    if (items.length === 0) {
      const empty = el(doc, "div", "pv-empty");
      empty.append(
        el(doc, "p", "pv-empty-title", t.emptyList),
        el(doc, "p", "pv-empty-sub", t.createFirst),
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

      const excerpt = el(doc, "p", "pv-item-excerpt", item.excerpt || item.fileName);
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
    defaultTagLabelEl.textContent = t.defaultTagLabel;
    saveSettingsBtn.textContent = t.saveSettings;
    titleLabelEl.textContent = t.titleLabel;
    titleInput.placeholder = t.titlePlaceholder;
    slugLabelEl.textContent = t.slugLabel;
    slugInput.placeholder = t.slugPlaceholder;
    tagsLabelEl.textContent = t.tagsLabel;
    tagsInput.placeholder = t.tagsPlaceholder;
    bodyLabelEl.textContent = t.bodyLabel;
    bodyTextarea.placeholder = t.bodyPlaceholder;
    copyBtn.textContent = t.copy;
    saveBtn.textContent = t.save;
    deleteBtn.textContent = confirmDelete ? t.confirmDelete : t.delete;
    filePathEl.textContent = draftFilePath
      ? `${t.fileLabel} ${draftFilePath}`
      : t.newDraft;
    renderStatus();
    renderTagOptions();
    renderList();
  }

  function syncSettingsInputs() {
    vaultDirInput.value = typeof settings.vaultDir === "string" ? settings.vaultDir : "";
    defaultTagInput.value =
      typeof settings.defaultTag === "string" ? settings.defaultTag : "general";
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
      allTags = Array.isArray(listResult?.tags) ? listResult.tags : [];

      const targetSlug = preferSlug ?? selectedSlug;
      if (targetSlug) {
        const match = items.find((it) => it.slug === targetSlug);
        if (match) {
          loadSelectionIntoEditor(match);
        } else if (!isDraft) {
          loadSelectionIntoEditor(items[0] ?? null);
        }
      } else if (!isDraft && items.length > 0) {
        loadSelectionIntoEditor(items[0]);
      } else {
        renderLabels();
      }
      renderStatus();
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
        defaultTag: defaultTagInput.value.trim() || "general",
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

  const onTitleInput = () => {
    draftTitle = titleInput.value;
  };
  const onSlugInput = () => {
    draftSlug = slugInput.value;
  };
  const onTagsInput = () => {
    draftTags = tagsInput.value;
  };
  const onBodyInput = () => {
    draftBody = bodyTextarea.value;
  };
  titleInput.addEventListener("input", onTitleInput);
  slugInput.addEventListener("input", onSlugInput);
  tagsInput.addEventListener("input", onTagsInput);
  bodyTextarea.addEventListener("input", onBodyInput);
  cleanups.push(() => {
    titleInput.removeEventListener("input", onTitleInput);
    slugInput.removeEventListener("input", onSlugInput);
    tagsInput.removeEventListener("input", onTagsInput);
    bodyTextarea.removeEventListener("input", onBodyInput);
  });

  const onSaveClick = async () => {
    const t = getCopy(locale);
    const payload = {
      title: titleInput.value.trim(),
      tags: tagsInput.value,
      body: bodyTextarea.value,
      ...(slugInput.value.trim() ? { slug: slugInput.value.trim() } : {}),
      ...(!isDraft && selectedSlug ? { originalSlug: selectedSlug } : {}),
    };
    try {
      const saved = await api.backend.invoke("prompts/save", payload);
      if (disposed || api.signal.aborted) return;
      isDraft = false;
      selectedSlug = saved.slug;
      draftFilePath = saved.filePath;
      setToast(`${t.saved}: ${saved.fileName}`, "success");
      await refreshData(saved.slug);
    } catch (error) {
      setToast(`${t.errorPrefix} ${error instanceof Error ? error.message : String(error)}`, "danger");
    }
  };
  saveBtn.addEventListener("click", onSaveClick);
  cleanups.push(() => saveBtn.removeEventListener("click", onSaveClick));

  const onCopyClick = async () => {
    const t = getCopy(locale);
    const ok = await copyTextToClipboard(bodyTextarea.value, doc);
    setToast(ok ? t.copied : `${t.errorPrefix} clipboard unavailable`, ok ? "success" : "danger");
  };
  copyBtn.addEventListener("click", onCopyClick);
  cleanups.push(() => copyBtn.removeEventListener("click", onCopyClick));

  const onDeleteClick = async () => {
    if (isDraft || !selectedSlug) return;
    const t = getCopy(locale);
    if (!confirmDelete) {
      confirmDelete = true;
      deleteBtn.textContent = t.confirmDelete;
      return;
    }
    try {
      const target = selectedSlug;
      await api.backend.invoke("prompts/delete", { slug: target });
      if (disposed || api.signal.aborted) return;
      selectedSlug = null;
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
