const RECENT_KEY = "codexhost.prompt-vault.recent.v1";
const MAX_RECENT = 80;

export function readLocal(win, key) {
  try {
    return JSON.parse(win.localStorage.getItem(key));
  } catch {
    return null;
  }
}

export function writeLocal(win, key, value) {
  try {
    win.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be unavailable in a restricted renderer.
  }
}

export function readRecent(win) {
  const value = readLocal(win, RECENT_KEY);
  return Array.isArray(value)
    ? [...new Set(value.slice(0, MAX_RECENT).filter((slug) => typeof slug === "string"))]
    : [];
}

export function recordRecent(win, slug, previous = []) {
  if (!slug) return previous;
  const recent = [slug, ...new Set([...readRecent(win), ...previous].filter((entry) => entry !== slug))]
    .slice(0, MAX_RECENT);
  writeLocal(win, RECENT_KEY, recent);
  return recent;
}
