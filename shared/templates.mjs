const VARIABLE_RE = /\{\{\s*([^{}\r\n]+?)\s*\}\}/gu;

export function extractVariables(body) {
  const seen = new Set();
  const names = [];
  const source = String(body ?? "");
  VARIABLE_RE.lastIndex = 0;
  let match;
  while ((match = VARIABLE_RE.exec(source)) !== null) {
    const name = match[1].trim();
    if (name && !seen.has(name)) {
      seen.add(name);
      names.push(name);
    }
  }
  return names;
}

export function renderTemplate(body, values) {
  const map = values && typeof values === "object" ? values : {};
  VARIABLE_RE.lastIndex = 0;
  return String(body ?? "").replace(VARIABLE_RE, (full, rawName) => {
    const name = String(rawName ?? "").trim();
    const replacement = map[name];
    return typeof replacement === "string" && replacement.length > 0 ? replacement : full;
  });
}

export function isMacPlatform() {
  try {
    const p = typeof navigator !== "undefined" ? navigator.platform || navigator.userAgent || "" : "";
    return /mac|iphone|ipad/iu.test(p);
  } catch {
    return false;
  }
}

export function shortcutHint() {
  return isMacPlatform() ? "⌥P" : "Alt+P";
}

export function formatShortDate(iso) {
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

export async function copyTextToClipboard(text, doc) {
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
