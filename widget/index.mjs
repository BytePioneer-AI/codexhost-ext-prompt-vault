import {
  copyTextToClipboard,
  extractVariables,
  renderTemplate,
  shortcutHint,
} from "../shared/templates.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

const COPY = {
  en: {
    triggerLabel: "Prompts",
    searchPlaceholder: "Search prompts to insert...",
    loading: "Loading prompts...",
    emptyTitle: "No prompts saved yet",
    emptySub: "Add reusable prompts in Plugins → Prompt Vault, then press {key} anytime to insert them here.",
    noMatches: "No matching prompts",
    insertHint: "↵ Insert",
    copyHint: "Copy",
    escHint: "Esc",
    inserted: "Inserted into composer",
    copiedFallback: "Copied to clipboard (paste with ⌘V / Ctrl+V)",
    copied: "Copied to clipboard",
    copyFailed: "Could not copy",
    fillTitle: "Fill placeholders",
    fillBack: "Back",
    fillSubmit: "Insert",
    fillCopy: "Copy",
    fillPlaceholder: "Enter {name}...",
    pinnedLabel: "Pinned",
    varBadge: "{count} vars",
  },
  "zh-CN": {
    triggerLabel: "提示词",
    searchPlaceholder: "搜索提示词，回车直接填入输入框...",
    loading: "正在加载提示词...",
    emptyTitle: "还没有保存提示词",
    emptySub: "去「插件 → 本地提示词库」添加常用模板，聊天时按 {key} 即可原地呼出并直接插入。",
    noMatches: "没有找到匹配的提示词",
    insertHint: "↵ 插入",
    copyHint: "复制",
    escHint: "Esc",
    inserted: "已插入输入框",
    copiedFallback: "当前页无输入框，已复制到剪贴板",
    copied: "已复制到剪贴板",
    copyFailed: "复制失败",
    fillTitle: "填写模板变量",
    fillBack: "返回",
    fillSubmit: "插入输入框",
    fillCopy: "仅复制",
    fillPlaceholder: "请输入 {name}...",
    pinnedLabel: "置顶",
    varBadge: "{count} 个变量",
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

function makeSparkIcon(doc, size = 16) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const p1 = doc.createElementNS(SVG_NS, "path");
  p1.setAttribute("d", "M6 4h12a2 2 0 0 1 2 2v14l-8-4-8 4V6a2 2 0 0 1 2-2z");
  svg.append(p1);
  return svg;
}

function makeCopyIcon(doc, size = 13) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.9");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const rect = doc.createElementNS(SVG_NS, "rect");
  rect.setAttribute("x", "9");
  rect.setAttribute("y", "9");
  rect.setAttribute("width", "13");
  rect.setAttribute("height", "13");
  rect.setAttribute("rx", "2");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1");
  svg.append(rect, path);
  return svg;
}

function isExtensionOwnElement(node) {
  if (!node || typeof node.closest !== "function") return false;
  return Boolean(
    node.closest("[data-cx-host-widget], [data-host-extension-page], .pv-root"),
  );
}

function isVisibleEditable(node) {
  if (!node || !node.isConnected) return false;
  if (isExtensionOwnElement(node)) return false;
  const tag = node.tagName;
  if (tag === "TEXTAREA") {
    if (node.disabled || node.readOnly) return false;
  } else if (tag === "INPUT") {
    const type = (node.type || "text").toLowerCase();
    if (!["text", "search", "url"].includes(type) || node.disabled || node.readOnly) return false;
  } else if (node.isContentEditable) {
    if (node.getAttribute("aria-disabled") === "true") return false;
  } else {
    return false;
  }
  const rect = node.getBoundingClientRect();
  return rect.width > 20 && rect.height > 12;
}

function findChatComposer(doc, preferred) {
  if (isVisibleEditable(preferred)) return preferred;
  const selectors = [
    '[data-composer-card] [contenteditable="true"][role="textbox"]',
    '[data-composer-card] [contenteditable="true"]',
    '[data-composer-card] textarea',
    '.ProseMirror[contenteditable="true"]',
    '[contenteditable="true"][role="textbox"]',
    'textarea:not([readonly]):not([disabled])',
  ];
  for (const selector of selectors) {
    const candidates = doc.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (isVisibleEditable(candidate)) return candidate;
    }
  }
  return null;
}

function insertIntoComposer(doc, target, text) {
  if (!target || !target.isConnected) return false;
  try {
    target.focus();
  } catch {
    return false;
  }

  if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : target.value.length;
    const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
    const proto = target.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(target, nextValue);
    else target.value = nextValue;
    const cursor = start + text.length;
    try {
      target.setSelectionRange(cursor, cursor);
    } catch {
      // Ignore selection error.
    }
    target.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }

  if (target.isContentEditable) {
    const win = doc.defaultView;
    const sel = win?.getSelection?.();
    if (sel && (!sel.anchorNode || !target.contains(sel.anchorNode))) {
      const range = doc.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const beforeLen = (target.textContent || "").length;

    // 1. Prefer synthetic ClipboardEvent("paste") so Lexical / ProseMirror handle multi-line text cleanly.
    if (typeof DataTransfer === "function" && typeof ClipboardEvent === "function") {
      try {
        const dt = new DataTransfer();
        dt.setData("text/plain", text);
        const pasteEvt = new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        });
        target.dispatchEvent(pasteEvt);
        if ((target.textContent || "").length > beforeLen) return true;
      } catch {
        // Fall through to execCommand.
      }
    }

    // 2. Native insertText command (triggers beforeinput/input cleanly in Chromium & Electron).
    try {
      const ok = doc.execCommand("insertText", false, text);
      if (ok && (target.textContent || "").length > beforeLen) return true;
    } catch {
      // Fall through.
    }
  }

  return false;
}

export async function mount(root, api) {
  const doc = root.ownerDocument;
  const win = doc.defaultView;
  const cleanups = [];
  let disposed = false;

  let locale = api.locale;
  let colorScheme = api.colorScheme;
  let open = false;
  let loading = false;
  let items = [];
  let filtered = [];
  let query = "";
  let activeIndex = 0;
  let fillingPrompt = null;
  let fillingVars = [];
  let fillingValues = {};
  let savedComposer = null;
  let toastTimer = null;

  const shell = el(doc, "div", "pvw-shell");
  shell.dataset.scheme = colorScheme;

  const toast = el(doc, "div", "pvw-toast");
  toast.setAttribute("role", "status");
  toast.hidden = true;

  const trigger = el(doc, "button", "pvw-trigger");
  trigger.type = "button";
  trigger.setAttribute("data-pvw-trigger", "true");
  const triggerIcon = el(doc, "span", "pvw-trigger-icon");
  triggerIcon.append(makeSparkIcon(doc, 15));
  const triggerText = el(doc, "span", "pvw-trigger-label");
  const triggerKey = el(doc, "kbd", "pvw-trigger-kbd", shortcutHint());
  trigger.append(triggerIcon, triggerText, triggerKey);

  const backdrop = el(doc, "div", "pvw-backdrop");
  backdrop.hidden = true;

  const dialog = el(doc, "div", "pvw-dialog");
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("data-pvw-dialog", "true");

  // Search view
  const searchView = el(doc, "div", "pvw-view");
  const searchHeader = el(doc, "div", "pvw-search-header");
  const searchInput = el(doc, "input", "pvw-search-input");
  searchInput.type = "search";
  searchInput.setAttribute("data-pvw-search", "true");
  searchHeader.append(searchInput);

  const listEl = el(doc, "div", "pvw-list");
  listEl.setAttribute("role", "listbox");

  const footerEl = el(doc, "div", "pvw-footer");
  const footerInsert = el(doc, "span", "pvw-hint");
  const footerEsc = el(doc, "span", "pvw-hint");
  footerEl.append(footerInsert, footerEsc);

  searchView.append(searchHeader, listEl, footerEl);

  // Variable fill view
  const fillView = el(doc, "form", "pvw-fill-view");
  fillView.hidden = true;
  const fillHeader = el(doc, "div", "pvw-fill-header");
  const fillBackBtn = el(doc, "button", "pvw-link-btn");
  fillBackBtn.type = "button";
  const fillHeading = el(doc, "div", "pvw-fill-heading");
  fillHeader.append(fillBackBtn, fillHeading);

  const fillFields = el(doc, "div", "pvw-fill-fields");
  const fillActions = el(doc, "div", "pvw-fill-actions");
  const fillCopyBtn = el(doc, "button", "pvw-btn pvw-btn-ghost");
  fillCopyBtn.type = "button";
  const fillSubmitBtn = el(doc, "button", "pvw-btn pvw-btn-primary");
  fillSubmitBtn.type = "submit";
  fillActions.append(fillCopyBtn, fillSubmitBtn);
  fillView.append(fillHeader, fillFields, fillActions);

  dialog.append(searchView, fillView);
  backdrop.append(dialog);
  shell.append(toast, trigger, backdrop);
  root.replaceChildren(shell);

  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = !message;
    if (message) {
      toastTimer = setTimeout(() => {
        toast.hidden = true;
        toast.textContent = "";
      }, 2400);
    }
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    filtered = q
      ? items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.body.toLowerCase().includes(q) ||
            item.tags.some((tag) => tag.toLowerCase().includes(q)),
        )
      : items;
    if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1);
  }

  async function deliverText(text, copyOnly = false) {
    const t = getCopy(locale);
    closePalette(false);
    if (!copyOnly) {
      const target = findChatComposer(doc, savedComposer);
      if (target && insertIntoComposer(doc, target, text)) {
        showToast(t.inserted);
        return;
      }
    }
    const ok = await copyTextToClipboard(text, doc);
    if (!ok) {
      showToast(t.copyFailed);
      return;
    }
    showToast(copyOnly ? t.copied : t.copiedFallback);
  }

  function selectPrompt(item, copyOnly = false) {
    const vars = extractVariables(item.body);
    if (vars.length > 0 && !copyOnly) {
      fillingPrompt = item;
      fillingVars = vars;
      fillingValues = {};
      renderFillView();
      return;
    }
    void deliverText(item.body, copyOnly);
  }

  function renderFillView() {
    const t = getCopy(locale);
    searchView.hidden = true;
    fillView.hidden = false;
    fillBackBtn.textContent = `← ${t.fillBack}`;
    fillHeading.textContent = fillingPrompt ? fillingPrompt.title : t.fillTitle;
    fillCopyBtn.textContent = t.fillCopy;
    fillSubmitBtn.textContent = t.fillSubmit;
    fillFields.replaceChildren();

    let firstInput = null;
    for (const name of fillingVars) {
      const label = el(doc, "label", "pvw-fill-field");
      label.append(el(doc, "span", "pvw-fill-label", name));
      const input = el(doc, "input", "pvw-fill-input");
      input.type = "text";
      input.placeholder = t.fillPlaceholder.replace("{name}", name);
      input.value = fillingValues[name] || "";
      input.addEventListener("input", () => {
        fillingValues[name] = input.value;
      });
      label.append(input);
      fillFields.append(label);
      if (!firstInput) firstInput = input;
    }
    firstInput?.focus();
  }

  function renderList() {
    const t = getCopy(locale);
    listEl.replaceChildren();

    if (loading && items.length === 0) {
      listEl.append(el(doc, "div", "pvw-empty", t.loading));
      return;
    }

    if (items.length === 0) {
      const empty = el(doc, "div", "pvw-empty");
      empty.append(
        el(doc, "p", "pvw-empty-title", t.emptyTitle),
        el(doc, "p", "pvw-empty-sub", t.emptySub.replace("{key}", shortcutHint())),
      );
      listEl.append(empty);
      return;
    }

    if (filtered.length === 0) {
      listEl.append(el(doc, "div", "pvw-empty", t.noMatches));
      return;
    }

    filtered.forEach((item, index) => {
      const row = el(
        doc,
        "div",
        `pvw-row${index === activeIndex ? " pvw-row-active" : ""}`,
      );
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === activeIndex));

      const main = el(doc, "div", "pvw-row-main");
      const titleLine = el(doc, "div", "pvw-row-title-line");
      if (item.pinned) {
        const pinDot = el(doc, "span", "pvw-pin-dot");
        pinDot.title = t.pinnedLabel;
        titleLine.append(pinDot);
      }
      titleLine.append(el(doc, "span", "pvw-row-title", item.title));
      const vars = extractVariables(item.body);
      if (vars.length > 0) {
        titleLine.append(
          el(doc, "span", "pvw-var-badge", t.varBadge.replace("{count}", String(vars.length))),
        );
      }
      for (const tag of item.tags.slice(0, 3)) {
        titleLine.append(el(doc, "span", "pvw-tag", `#${tag}`));
      }

      const excerpt = el(doc, "p", "pvw-row-excerpt", item.excerpt || item.body.slice(0, 100));
      main.append(titleLine, excerpt);

      const copyBtn = el(doc, "button", "pvw-copy-icon-btn");
      copyBtn.type = "button";
      copyBtn.title = t.copyHint;
      copyBtn.setAttribute("aria-label", t.copyHint);
      copyBtn.append(makeCopyIcon(doc, 13));
      copyBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        void deliverText(item.body, true);
      });

      row.append(main, copyBtn);
      row.addEventListener("mouseenter", () => {
        if (activeIndex !== index) {
          activeIndex = index;
          for (let i = 0; i < listEl.children.length; i++) {
            listEl.children[i].classList.toggle("pvw-row-active", i === activeIndex);
            listEl.children[i].setAttribute("aria-selected", String(i === activeIndex));
          }
        }
      });
      row.addEventListener("click", () => {
        selectPrompt(item, false);
      });
      listEl.append(row);
    });
  }

  function renderCopy() {
    const t = getCopy(locale);
    triggerText.textContent = t.triggerLabel;
    trigger.title = `${t.triggerLabel} (${shortcutHint()})`;
    trigger.setAttribute("aria-label", `${t.triggerLabel} (${shortcutHint()})`);
    searchInput.placeholder = t.searchPlaceholder;
    footerInsert.textContent = t.insertHint;
    footerEsc.textContent = t.escHint;
    if (open) {
      if (fillingPrompt) renderFillView();
      else renderList();
    }
  }

  async function loadPrompts() {
    loading = true;
    renderList();
    try {
      const res = await api.backend.invoke("prompts/list", {});
      if (disposed || api.signal.aborted) return;
      items = Array.isArray(res?.items) ? res.items : [];
      applyFilter();
    } catch {
      // Keep last known list if backend temporarily busy.
    } finally {
      loading = false;
      if (!disposed && open && !fillingPrompt) renderList();
    }
  }

  function openPalette() {
    if (open) {
      searchInput.focus();
      return;
    }
    const active = doc.activeElement;
    if (isVisibleEditable(active)) {
      savedComposer = active;
    } else {
      savedComposer = findChatComposer(doc, null);
    }
    open = true;
    fillingPrompt = null;
    query = "";
    activeIndex = 0;
    searchInput.value = "";
    searchView.hidden = false;
    fillView.hidden = true;
    backdrop.hidden = false;
    renderCopy();
    void loadPrompts();
    searchInput.focus();
  }

  function closePalette(restoreFocus = true) {
    if (!open) return;
    open = false;
    fillingPrompt = null;
    backdrop.hidden = true;
    if (restoreFocus && isVisibleEditable(savedComposer)) {
      try {
        savedComposer.focus();
      } catch {
        // Ignore focus failure.
      }
    }
  }

  const onTriggerClick = () => {
    if (open) closePalette(true);
    else openPalette();
  };
  trigger.addEventListener("click", onTriggerClick);
  cleanups.push(() => trigger.removeEventListener("click", onTriggerClick));

  const onBackdropClick = (event) => {
    if (event.target === backdrop) closePalette(true);
  };
  backdrop.addEventListener("click", onBackdropClick);
  cleanups.push(() => backdrop.removeEventListener("click", onBackdropClick));

  const onSearchInput = () => {
    query = searchInput.value;
    activeIndex = 0;
    applyFilter();
    renderList();
  };
  searchInput.addEventListener("input", onSearchInput);
  cleanups.push(() => searchInput.removeEventListener("input", onSearchInput));

  const onSearchKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex + 1) % filtered.length;
        renderList();
        listEl.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (filtered.length > 0) {
        activeIndex = (activeIndex - 1 + filtered.length) % filtered.length;
        renderList();
        listEl.children[activeIndex]?.scrollIntoView?.({ block: "nearest" });
      }
      return;
    }
    if (event.key === "Enter") {
      const target = filtered[activeIndex];
      if (!target) return;
      event.preventDefault();
      selectPrompt(target, event.metaKey || event.ctrlKey);
    }
  };
  searchInput.addEventListener("keydown", onSearchKeyDown);
  cleanups.push(() => searchInput.removeEventListener("keydown", onSearchKeyDown));

  const onFillBack = () => {
    fillingPrompt = null;
    fillView.hidden = true;
    searchView.hidden = false;
    searchInput.focus();
  };
  fillBackBtn.addEventListener("click", onFillBack);
  cleanups.push(() => fillBackBtn.removeEventListener("click", onFillBack));

  const onFillSubmit = (event) => {
    event.preventDefault();
    if (!fillingPrompt) return;
    const rendered = renderTemplate(fillingPrompt.body, fillingValues);
    void deliverText(rendered, false);
  };
  fillView.addEventListener("submit", onFillSubmit);
  cleanups.push(() => fillView.removeEventListener("submit", onFillSubmit));

  const onFillCopy = () => {
    if (!fillingPrompt) return;
    const rendered = renderTemplate(fillingPrompt.body, fillingValues);
    void deliverText(rendered, true);
  };
  fillCopyBtn.addEventListener("click", onFillCopy);
  cleanups.push(() => fillCopyBtn.removeEventListener("click", onFillCopy));

  const onFillKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onFillBack();
    }
  };
  fillView.addEventListener("keydown", onFillKeyDown);
  cleanups.push(() => fillView.removeEventListener("keydown", onFillKeyDown));

  const onGlobalKeyDown = (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "KeyP") {
      event.preventDefault();
      if (open) closePalette(true);
      else openPalette();
      return;
    }
    if (open && event.key === "Escape") {
      event.preventDefault();
      closePalette(true);
    }
  };
  win?.addEventListener("keydown", onGlobalKeyDown, true);
  cleanups.push(() => win?.removeEventListener("keydown", onGlobalKeyDown, true));

  const onFocusTrack = (event) => {
    if (!open && isVisibleEditable(event.target)) {
      savedComposer = event.target;
    }
  };
  doc.addEventListener("focusin", onFocusTrack, true);
  cleanups.push(() => doc.removeEventListener("focusin", onFocusTrack, true));

  cleanups.push(
    api.onLocaleChange((nextLocale) => {
      locale = nextLocale;
      renderCopy();
    }),
  );
  cleanups.push(
    api.onColorSchemeChange((nextScheme) => {
      colorScheme = nextScheme;
      shell.dataset.scheme = nextScheme;
    }),
  );
  cleanups.push(
    api.storage.onChange(() => {
      if (open) void loadPrompts();
    }),
  );

  const onAbort = () => {
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
  };
  api.signal.addEventListener("abort", onAbort, { once: true });
  cleanups.push(() => api.signal.removeEventListener("abort", onAbort));

  renderCopy();

  return () => {
    disposed = true;
    if (toastTimer) clearTimeout(toastTimer);
    for (const fn of cleanups.splice(0)) {
      try {
        fn();
      } catch {
        // Ignore cleanup errors.
      }
    }
    root.replaceChildren();
  };
}
