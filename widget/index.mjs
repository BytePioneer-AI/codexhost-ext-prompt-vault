import {
  copyTextToClipboard,
  extractVariables,
  isMacPlatform,
  renderTemplate,
  shortcutHint,
} from "../shared/templates.mjs";
import { readRecent, recordRecent } from "../shared/history.mjs";
import { positionWidget } from "./position.mjs";

const SVG_NS = "http://www.w3.org/2000/svg";

const COPY = {
  en: {
    triggerLabel: "Prompts",
    searchPlaceholder: "Search prompts to insert...",
    loading: "Loading prompts...",
    emptyTitle: "No prompts saved yet",
    emptySub: "Choose + Save to keep a prompt here, then press {key} anytime to find it again.",
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
    quickSave: "+ Save",
    saveTitle: "Save a prompt",
    titleLabel: "Title",
    bodyLabel: "Prompt",
    tagsLabel: "Tags (optional, comma separated)",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    saveFailed: "Couldn’t save. Try again.",
    saveRequired: "Enter a title and prompt.",
    copyShortcut: "Copy",
  },
  "zh-CN": {
    triggerLabel: "提示词",
    searchPlaceholder: "搜索提示词，回车直接填入输入框...",
    loading: "正在加载提示词...",
    emptyTitle: "还没有保存提示词",
    emptySub: "点击「+ 存」收录提示词，之后随时按 {key} 原地找回。",
    quickSave: "+ 存",
    saveTitle: "快速保存提示词",
    titleLabel: "标题",
    bodyLabel: "正文",
    tagsLabel: "标签（选填，用逗号分隔）",
    save: "保存",
    saving: "正在保存…",
    saved: "已保存",
    saveFailed: "未能保存，请重试。",
    saveRequired: "请填写标题和正文。",
    copyShortcut: "复制",
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
  } else if (node.isContentEditable) {
    if (node.getAttribute("aria-disabled") === "true") return false;
  } else {
    return false;
  }
  const rect = node.getBoundingClientRect();
  return rect.width > 20 && rect.height > 12 && node.ownerDocument.defaultView.getComputedStyle(node).visibility === "visible";
}

function findChatComposer(doc, preferred) {
  const selectors = [
    '[data-composer-card] [contenteditable="true"][role="textbox"]',
    '[data-composer-card] [contenteditable="true"]',
    '[data-composer-card] textarea',
    '.ProseMirror[contenteditable="true"]',
  ];
  const focused = preferred?.closest?.(selectors.join(","));
  if (isVisibleEditable(focused)) return focused;
  for (const selector of [...selectors, 'textarea:not([readonly]):not([disabled])']) {
    if (preferred?.matches?.(selector) && isVisibleEditable(preferred)) return preferred;
    const candidates = doc.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (isVisibleEditable(candidate)) return candidate;
    }
  }
  return null;
}

function insertIntoComposer(doc, target, text, savedRange) {
  if (!target || !target.isConnected) return false;
  try {
    target.focus({ preventScroll: true });
  } catch {
    return false;
  }

  if (target.tagName === "TEXTAREA") {
    const start = typeof target.selectionStart === "number" ? target.selectionStart : target.value.length;
    const end = typeof target.selectionEnd === "number" ? target.selectionEnd : target.value.length;
    const nextValue = `${target.value.slice(0, start)}${text}${target.value.slice(end)}`;
    const proto = doc.defaultView.HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(target, nextValue);
    else target.value = nextValue;
    const cursor = start + text.length;
    try {
      target.setSelectionRange(cursor, cursor);
    } catch {
      // Ignore selection error.
    }
    target.dispatchEvent(new doc.defaultView.InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: text }));
    return true;
  }

  if (target.isContentEditable) {
    const win = doc.defaultView;
    const sel = win?.getSelection?.();
    const rangeIsInside = (range) => range && target.contains(range.commonAncestorContainer);
    if (sel && (rangeIsInside(savedRange) || !rangeIsInside(sel.rangeCount ? sel.getRangeAt(0) : null))) {
      const range = rangeIsInside(savedRange) ? savedRange : doc.createRange();
      if (range !== savedRange) {
        range.selectNodeContents(target);
        range.collapse(false);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }
    const before = target.textContent;

    // Let Lexical and ProseMirror handle their own document updates first.
    if (typeof win.DataTransfer === "function" && typeof win.ClipboardEvent === "function") {
      try {
        const dt = new win.DataTransfer();
        dt.setData("text/plain", text);
        const pasteEvt = new win.ClipboardEvent("paste", {
          bubbles: true,
          composed: true,
          cancelable: true,
          clipboardData: dt,
        });
        if (!target.dispatchEvent(pasteEvt) || target.textContent !== before) return true;
      } catch {
        // Fall through to execCommand.
      }
    }

    // 2. Native insertText command (triggers beforeinput/input cleanly in Chromium & Electron).
    try {
      const ok = doc.execCommand("insertText", false, text);
      if (ok || target.textContent !== before) return true;
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
  let listRequest = 0;
  let items = [];
  let recent = readRecent(win);
  let view = "search";
  let saveSession = 0;
  let saving = false;
  let saveError = "";
  let defaultTag = "";
  let settingsChanged = false;
  let filtered = [];
  let query = "";
  let activeIndex = 0;
  let fillingPrompt = null;
  let fillingVars = [];
  let fillingValues = Object.create(null);
  let context = null;
  let pointerContext = null;
  let toastTimer = null;

  const shell = el(doc, "div", "pvw-shell");
  shell.dataset.scheme = colorScheme;

  const toast = el(doc, "div", "pvw-toast");
  toast.setAttribute("role", "status");
  toast.hidden = true;

  const trigger = el(doc, "button", "pvw-trigger");
  trigger.type = "button";
  trigger.setAttribute("data-pvw-trigger", "true");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-controls", "pvw-dialog");
  const triggerIcon = el(doc, "span", "pvw-trigger-icon");
  triggerIcon.append(makeSparkIcon(doc, 15));
  const triggerText = el(doc, "span", "pvw-trigger-label");
  const triggerKey = el(doc, "kbd", "pvw-trigger-kbd", shortcutHint());
  trigger.append(triggerIcon, triggerText, triggerKey);

  const dialog = el(doc, "div", "pvw-dialog");
  dialog.id = "pvw-dialog";
  dialog.inert = true;
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("data-pvw-dialog", "true");

  // Search view
  const searchView = el(doc, "div", "pvw-view");
  const searchHeader = el(doc, "div", "pvw-search-header");
  const searchInput = el(doc, "input", "pvw-search-input");
  searchInput.type = "search";
  searchInput.setAttribute("data-pvw-search", "true");
  searchInput.setAttribute("role", "combobox");
  searchInput.setAttribute("aria-autocomplete", "list");
  searchInput.setAttribute("aria-controls", "pvw-results");
  const quickSaveBtn = el(doc, "button", "pvw-btn pvw-quick-save");
  quickSaveBtn.type = "button";
  searchHeader.append(searchInput, quickSaveBtn);

  const listEl = el(doc, "div", "pvw-list");
  listEl.id = "pvw-results";
  listEl.setAttribute("role", "listbox");

  const footerEl = el(doc, "div", "pvw-footer");
  const footerInsert = el(doc, "span", "pvw-hint");
  const footerEsc = el(doc, "span", "pvw-hint");
  const footerCopy = el(doc, "span", "pvw-hint");
  footerEl.append(footerInsert, footerCopy, footerEsc);

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

  const saveView = el(doc, "form", "pvw-fill-view");
  saveView.hidden = true;
  const saveHeader = el(doc, "div", "pvw-fill-header");
  const saveBackBtn = el(doc, "button", "pvw-link-btn");
  saveBackBtn.type = "button";
  const saveHeading = el(doc, "div", "pvw-fill-heading");
  saveHeader.append(saveBackBtn, saveHeading);
  const saveFields = el(doc, "div", "pvw-fill-fields");
  function makeSaveField(tag) {
    const field = el(doc, "label", "pvw-fill-field");
    const label = el(doc, "span", "pvw-fill-label");
    const input = el(doc, tag, "pvw-fill-input");
    field.append(label, input);
    saveFields.append(field);
    return [label, input];
  }
  const [titleLabel, saveTitle] = makeSaveField("input");
  const [bodyLabel, saveBody] = makeSaveField("textarea");
  saveBody.rows = 4;
  const [tagsLabel, saveTags] = makeSaveField("input");
  const saveActions = el(doc, "div", "pvw-fill-actions");
  const saveFeedback = el(doc, "span", "pvw-save-feedback");
  saveFeedback.setAttribute("role", "alert");
  const saveSubmitBtn = el(doc, "button", "pvw-btn pvw-btn-primary");
  saveSubmitBtn.type = "submit";
  saveActions.append(saveFeedback, saveSubmitBtn);
  saveView.append(saveHeader, saveFields, saveActions);

  dialog.append(searchView, fillView, saveView);
  shell.append(trigger, dialog, toast);
  root.replaceChildren(shell);

  function captureContext() {
    const active = doc.activeElement;
    const composer = findChatComposer(doc, active);
    const selection = win.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    return {
      active, composer,
      selectedText: selection?.toString() ?? "",
      range: range && composer?.contains(range.commonAncestorContainer) ? range.cloneRange() : null,
    };
  }

  const placement = positionWidget({
    doc, shell, trigger, dialog, toast,
    beforePress: () => { pointerContext = open ? null : captureContext(); },
  });
  cleanups.push(placement.dispose);

  function setView(next) {
    view = next;
    searchView.hidden = next !== "search";
    fillView.hidden = next !== "fill";
    saveView.hidden = next !== "save";
    placement.layout();
  }

  function showToast(message) {
    if (toastTimer) clearTimeout(toastTimer);
    toast.textContent = message;
    toast.hidden = !message;
    if (message) {
      placement.layout();
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
      : [...items];
    const persisted = readRecent(win);
    const ranks = new Map([...new Set([...persisted, ...recent])].map((slug, index) => [slug, index]));
    filtered.sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) ||
      (ranks.get(a.slug) ?? ranks.size) - (ranks.get(b.slug) ?? ranks.size) ||
      (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    if (activeIndex >= filtered.length) activeIndex = Math.max(0, filtered.length - 1);
  }

  async function deliverText(item, text, copyOnly = false) {
    const t = getCopy(locale);
    const source = context;
    closePalette(false);
    if (!copyOnly) {
      const target = findChatComposer(doc, source?.composer);
      if (target && insertIntoComposer(doc, target, text, source?.range)) {
        recent = recordRecent(win, item.slug, recent);
        showToast(t.inserted);
        return;
      }
    }
    const ok = await copyTextToClipboard(text, doc);
    if (disposed) return;
    if (!ok) {
      showToast(t.copyFailed);
      return;
    }
    recent = recordRecent(win, item.slug, recent);
    showToast(copyOnly ? t.copied : t.copiedFallback);
  }

  function selectPrompt(item, copyOnly = false) {
    const vars = extractVariables(item.body);
    if (vars.length > 0 && !copyOnly) {
      fillingPrompt = item;
      fillingVars = vars;
      fillingValues = Object.create(null);
      renderFillView();
      setView("fill");
      fillFields.firstElementChild?.lastElementChild?.focus({ preventScroll: true });
      return;
    }
    void deliverText(item, item.body, copyOnly);
  }

  function renderFillView() {
    const t = getCopy(locale);
    renderFillLabels(t);
    fillFields.replaceChildren();
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
    }
  }

  function renderFillLabels(t) {
    fillBackBtn.textContent = `← ${t.fillBack}`;
    fillHeading.textContent = fillingPrompt ? fillingPrompt.title : t.fillTitle;
    fillCopyBtn.textContent = t.fillCopy;
    fillSubmitBtn.textContent = t.fillSubmit;
    [...fillFields.querySelectorAll("input")].forEach((input, index) => {
      input.placeholder = t.fillPlaceholder.replace("{name}", fillingVars[index]);
    });
  }

  function renderSaveLabels(t) {
    saveBackBtn.textContent = `← ${t.fillBack}`;
    saveHeading.textContent = t.saveTitle;
    titleLabel.textContent = t.titleLabel;
    bodyLabel.textContent = t.bodyLabel;
    tagsLabel.textContent = t.tagsLabel;
    saveSubmitBtn.textContent = saving ? t.saving : t.save;
    saveSubmitBtn.disabled = saving;
    saveFeedback.textContent = saveError ? t[saveError] : "";
  }

  function openSave() {
    const composer = context?.composer;
    const draft = composer?.tagName === "TEXTAREA" ? composer.value : composer?.innerText ?? "";
    const body = draft.trim() ? draft : context?.selectedText ?? "";
    saveSession++;
    saveError = "";
    saveBody.value = body;
    saveTitle.value = [...(body.trimStart().split(/\r?\n/u, 1)[0] || "").trim()].slice(0, 24).join("");
    saveTags.value = defaultTag;
    renderSaveLabels(getCopy(locale));
    setView("save");
    (saveTitle.value ? saveTitle : saveBody).focus({ preventScroll: true });
  }

  function backToSearch() {
    fillingPrompt = null;
    setView("search");
    searchInput.focus({ preventScroll: true });
  }

  async function saveQuickPrompt(event) {
    event.preventDefault();
    if (saving) return;
    const title = saveTitle.value.trim();
    const body = saveBody.value;
    const tags = saveTags.value;
    if (!title || !body.trim()) {
      saveError = "saveRequired";
      renderSaveLabels(getCopy(locale));
      (!title ? saveTitle : saveBody).focus();
      return;
    }
    const session = saveSession;
    saving = true;
    saveError = "";
    renderSaveLabels(getCopy(locale));
    try {
      const saved = await api.backend.invoke("prompts/save", { title, body, tags });
      if (disposed || api.signal.aborted) return;
      if (open && view === "save" && session === saveSession) {
        query = searchInput.value = "";
        activeIndex = 0;
        if (saved?.slug) items = [saved, ...items.filter((item) => item.slug !== saved.slug)];
        applyFilter();
        renderList();
        backToSearch();
      }
      showToast(getCopy(locale).saved);
      if (open) void loadPrompts();
    } catch {
      if (!disposed && open && view === "save" && session === saveSession) saveError = "saveFailed";
    } finally {
      saving = false;
      if (!disposed) renderSaveLabels(getCopy(locale));
    }
  }

  function renderList() {
    const t = getCopy(locale);
    listEl.replaceChildren();
    searchInput.setAttribute("aria-expanded", String(open && filtered.length > 0));
    searchInput.removeAttribute("aria-activedescendant");

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
      row.id = `pvw-option-${index}`;
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
        void deliverText(item, item.body, true);
      });

      row.append(main, copyBtn);
      row.addEventListener("mouseenter", () => {
        if (activeIndex !== index) {
          setActive(index);
        }
      });
      row.addEventListener("click", () => {
        selectPrompt(item, false);
      });
      listEl.append(row);
    });
    setActive(activeIndex);
  }

  function setActive(index, scroll = false) {
    activeIndex = index;
    for (const [i, row] of [...listEl.children].entries()) {
      row.classList.toggle("pvw-row-active", i === index);
      row.setAttribute("aria-selected", String(i === index));
    }
    const row = listEl.children[index];
    if (!row?.id) return;
    searchInput.setAttribute("aria-activedescendant", row.id);
    if (scroll) row.scrollIntoView({ block: "nearest" });
  }

  function renderCopy() {
    const t = getCopy(locale);
    triggerText.textContent = t.triggerLabel;
    trigger.title = `${t.triggerLabel} (${shortcutHint()})`;
    trigger.setAttribute("aria-label", `${t.triggerLabel} (${shortcutHint()})`);
    dialog.setAttribute("aria-label", t.triggerLabel);
    searchInput.placeholder = t.searchPlaceholder;
    searchInput.setAttribute("aria-label", t.searchPlaceholder);
    quickSaveBtn.textContent = t.quickSave;
    quickSaveBtn.setAttribute("aria-label", t.saveTitle);
    footerInsert.textContent = t.insertHint;
    footerCopy.textContent = `${isMacPlatform() ? "⌘↵" : "Ctrl+↵"} ${t.copyShortcut}`;
    footerEsc.textContent = t.escHint;
    renderFillLabels(t);
    renderSaveLabels(t);
    if (open && view === "search") renderList();
  }

  async function loadPrompts() {
    const request = ++listRequest;
    loading = true;
    if (view === "search") renderList();
    try {
      const res = await api.backend.invoke("prompts/list", {});
      if (disposed || api.signal.aborted || request !== listRequest) return;
      items = Array.isArray(res?.items) ? res.items : [];
      applyFilter();
    } catch {
      // Keep last known list if backend temporarily busy.
    } finally {
      if (request === listRequest) {
        loading = false;
        if (!disposed && open && view === "search") renderList();
      }
    }
  }

  function openPalette(source = captureContext()) {
    context = source;
    open = true;
    fillingPrompt = null;
    query = searchInput.value = "";
    activeIndex = 0;
    applyFilter();
    setView("search");
    dialog.inert = false;
    trigger.setAttribute("aria-expanded", "true");
    placement.setOpen(true);
    void loadPrompts();
    searchInput.focus({ preventScroll: true });
  }

  function closePalette(restoreFocus = true) {
    if (!open) return;
    open = false;
    saveSession++;
    fillingPrompt = null;
    trigger.setAttribute("aria-expanded", "false");
    searchInput.setAttribute("aria-expanded", "false");
    dialog.inert = true;
    placement.setOpen(false);
    if (restoreFocus) {
      const prior = context?.active;
      const target = prior?.isConnected && prior !== doc.body && prior !== shadow.host ? prior : trigger;
      target.focus?.({ preventScroll: true });
    }
    context = null;
  }

  const onTriggerClick = (event) => {
    const source = event.detail ? pointerContext : null;
    pointerContext = null;
    if (placement.draggedClick(event)) return;
    if (open) closePalette(!event.detail || Boolean(context?.active && context.active !== doc.body));
    else openPalette(source || undefined);
  };
  trigger.addEventListener("click", onTriggerClick);
  cleanups.push(() => trigger.removeEventListener("click", onTriggerClick));

  const shadow = root.getRootNode();
  const onOutsidePress = (event) => {
    if (!open) return;
    const path = event.composedPath();
    const retained = path.includes(trigger) || path.includes(dialog) ||
      (shadow.mode === "closed" && path.includes(shadow.host));
    if (!retained) closePalette(false);
  };
  doc.addEventListener("pointerdown", onOutsidePress, true);
  cleanups.push(() => doc.removeEventListener("pointerdown", onOutsidePress, true));

  const onSearchInput = () => {
    query = searchInput.value;
    activeIndex = 0;
    applyFilter();
    renderList();
  };
  searchInput.addEventListener("input", onSearchInput);
  cleanups.push(() => searchInput.removeEventListener("input", onSearchInput));

  const onSearchKeyDown = (event) => {
    if (event.isComposing) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const delta = event.key === "ArrowDown" ? 1 : -1;
      if (filtered.length) setActive((activeIndex + delta + filtered.length) % filtered.length, true);
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

  fillBackBtn.addEventListener("click", backToSearch);
  quickSaveBtn.addEventListener("click", openSave);
  saveBackBtn.addEventListener("click", backToSearch);
  saveView.addEventListener("submit", saveQuickPrompt);
  cleanups.push(() => {
    fillBackBtn.removeEventListener("click", backToSearch);
    quickSaveBtn.removeEventListener("click", openSave);
    saveBackBtn.removeEventListener("click", backToSearch);
    saveView.removeEventListener("submit", saveQuickPrompt);
  });

  const onFillSubmit = (event) => {
    event.preventDefault();
    if (!fillingPrompt) return;
    const rendered = renderTemplate(fillingPrompt.body, fillingValues);
    void deliverText(fillingPrompt, rendered, false);
  };
  fillView.addEventListener("submit", onFillSubmit);
  cleanups.push(() => fillView.removeEventListener("submit", onFillSubmit));

  const onFillCopy = () => {
    if (!fillingPrompt) return;
    const rendered = renderTemplate(fillingPrompt.body, fillingValues);
    void deliverText(fillingPrompt, rendered, true);
  };
  fillCopyBtn.addEventListener("click", onFillCopy);
  cleanups.push(() => fillCopyBtn.removeEventListener("click", onFillCopy));

  const onDialogKeyDown = (event) => {
    if (event.isComposing || event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    if (view === "fill") {
      event.preventDefault();
      onFillCopy();
    } else if (view === "save") {
      event.preventDefault();
      saveView.requestSubmit();
    }
  };
  dialog.addEventListener("keydown", onDialogKeyDown);
  cleanups.push(() => dialog.removeEventListener("keydown", onDialogKeyDown));

  const onGlobalKeyDown = (event) => {
    if (event.isComposing || event.defaultPrevented) return;
    if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.code === "KeyP") {
      event.preventDefault();
      if (event.repeat) return;
      if (open) closePalette();
      else openPalette();
      return;
    }
    if (open && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closePalette(event.composedPath().includes(dialog) || doc.activeElement === shadow.host);
    }
  };
  win?.addEventListener("keydown", onGlobalKeyDown, true);
  cleanups.push(() => win?.removeEventListener("keydown", onGlobalKeyDown, true));

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
    api.storage.onChange((settings) => {
      settingsChanged = true;
      defaultTag = typeof settings?.defaultTag === "string" ? settings.defaultTag.trim() : "";
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
  void (async () => {
    try {
      const settings = await api.storage.get();
      if (!disposed && !settingsChanged && typeof settings?.defaultTag === "string") {
        defaultTag = settings.defaultTag.trim();
      }
    } catch {
      // Quick save remains available without a default tag.
    }
  })();

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
