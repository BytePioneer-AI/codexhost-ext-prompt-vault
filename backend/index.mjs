import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/u;
const MAX_PROMPT_BYTES = 512 * 1024;

const SEED_PROMPTS = [
  {
    slug: "code-review-checklist",
    title: "Code Review Checklist",
    tags: ["review", "engineering"],
    body: [
      "Review the diff focusing on correctness, edge cases, and maintainability:",
      "",
      "1. **Correctness & Invariants**: Check null/undefined handling, boundary values, race conditions, and error recovery.",
      "2. **Security & Trust Boundaries**: Validate untrusted inputs, prevent path traversal, and avoid leaking secrets.",
      "3. **API & Compatibility**: Verify public contracts, backwards compatibility, and clear error semantics.",
      "4. **Tests**: Confirm new behavior and regressions are covered by focused, observable assertions.",
      "",
      "Group findings by severity (Blocker / Major / Minor) and suggest concise fixes.",
    ].join("\n"),
  },
  {
    slug: "conventional-commit-guide",
    title: "Conventional Commit Helper",
    tags: ["git", "workflow"],
    body: [
      "Draft a concise Conventional Commit message for the staged changes:",
      "",
      "- Format: `<type>(<optional-scope>): <imperative summary>` (<= 72 chars)",
      "- Allowed types: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`",
      "- Body: Explain *why* the change is needed and any notable trade-offs or verification commands run.",
      "- Avoid repeating file lists that are already obvious from `git diff --stat`.",
    ].join("\n"),
  },
];

function isValidAbsoluteDir(raw) {
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes("\0")) return false;
  if (!path.isAbsolute(trimmed)) return false;
  const segments = trimmed.split(/[/\\]/u);
  return !segments.some((seg) => seg === "..");
}

function assertSafeSlug(raw) {
  if (typeof raw !== "string") {
    throw new Error("Prompt slug must be a string");
  }
  const slug = raw.trim().toLowerCase();
  if (
    !slug ||
    slug.includes("/") ||
    slug.includes("\\") ||
    slug.includes("..") ||
    slug.includes("\0") ||
    !SLUG_RE.test(slug)
  ) {
    throw new Error(
      "Invalid prompt slug: use 1-80 lowercase letters, digits, hyphens, or underscores (no path separators)",
    );
  }
  return slug;
}

function slugifyTitle(title) {
  const ascii = String(title ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 64);
  return ascii && SLUG_RE.test(ascii) ? ascii : `prompt-${Date.now().toString(36)}`;
}

function normalizeTags(raw) {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  const seen = new Set();
  const result = [];
  for (const entry of list) {
    const clean = String(entry ?? "")
      .trim()
      .toLowerCase()
      .replace(/[\r\n]/gu, "");
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      result.push(clean.slice(0, 40));
    }
  }
  return result;
}

function serializePrompt({ title, tags, updatedAt, body }) {
  const safeTitle = JSON.stringify(String(title ?? "").trim());
  const safeTags = JSON.stringify(normalizeTags(tags));
  const safeUpdatedAt = JSON.stringify(String(updatedAt));
  const normalizedBody = String(body ?? "").replace(/\r\n/gu, "\n").trimEnd();
  return [
    "---",
    `title: ${safeTitle}`,
    `tags: ${safeTags}`,
    `updatedAt: ${safeUpdatedAt}`,
    "---",
    "",
    normalizedBody,
    "",
  ].join("\n");
}

function unquoteYamlString(raw) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through to stripping quotes.
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/gu, "'");
  }
  return trimmed;
}

function parseFrontmatter(content, fallbackTitle, fallbackUpdatedAt) {
  const normalized = content.replace(/\r\n/gu, "\n");
  let title = fallbackTitle;
  let tags = [];
  let updatedAt = fallbackUpdatedAt;
  let body = normalized;

  if (normalized.startsWith("---\n")) {
    const endIdx = normalized.indexOf("\n---", 4);
    if (endIdx !== -1) {
      const header = normalized.slice(4, endIdx);
      const rest = normalized.slice(endIdx + 4);
      body = rest.replace(/^\n+/u, "");
      const lines = header.split("\n");
      let inTagList = false;
      for (const line of lines) {
        if (inTagList) {
          const itemMatch = /^\s*-\s+(.+)$/u.exec(line);
          if (itemMatch) {
            tags.push(unquoteYamlString(itemMatch[1]));
            continue;
          }
          inTagList = false;
        }
        const match = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/u.exec(line);
        if (!match) continue;
        const key = match[1].toLowerCase();
        const rawVal = match[2].trim();
        if (key === "title") {
          const parsed = unquoteYamlString(rawVal);
          if (parsed) title = parsed;
        } else if (key === "updatedat" || key === "updated_at") {
          const parsed = unquoteYamlString(rawVal);
          if (parsed) updatedAt = parsed;
        } else if (key === "tags") {
          if (!rawVal) {
            inTagList = true;
          } else if (rawVal.startsWith("[") && rawVal.endsWith("]")) {
            try {
              const parsed = JSON.parse(rawVal);
              if (Array.isArray(parsed)) {
                tags = parsed.map((v) => String(v));
              }
            } catch {
              tags = rawVal
                .slice(1, -1)
                .split(",")
                .map((part) => unquoteYamlString(part));
            }
          } else {
            tags = rawVal.split(",").map((part) => unquoteYamlString(part));
          }
        }
      }
    }
  }

  return {
    title: title || fallbackTitle,
    tags: normalizeTags(tags),
    updatedAt: updatedAt || fallbackUpdatedAt,
    body: body.trimEnd(),
  };
}

function makeExcerpt(body) {
  const flat = String(body ?? "")
    .replace(/^#+\s*/gmu, "")
    .replace(/[`*_>#-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return flat.length > 140 ? `${flat.slice(0, 139)}…` : flat;
}

function resolvePromptPath(vaultDir, slug) {
  const safeSlug = assertSafeSlug(slug);
  const resolvedRoot = path.resolve(vaultDir);
  const target = path.resolve(resolvedRoot, `${safeSlug}.md`);
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Resolved prompt path escapes vault directory");
  }
  return { slug: safeSlug, fileName: `${safeSlug}.md`, filePath: target };
}

async function atomicWriteMarkdown(vaultDir, slug, content) {
  const { fileName, filePath } = resolvePromptPath(vaultDir, slug);
  const bytes = Buffer.from(content, "utf8");
  if (bytes.length > MAX_PROMPT_BYTES) {
    throw new Error("Prompt content exceeds 512 KiB limit");
  }
  const tempPath = path.join(vaultDir, `.tmp-${slug}-${randomUUID()}.md`);
  try {
    await writeFile(tempPath, bytes, { flag: "wx", mode: 0o600 });
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
  return { fileName, filePath };
}

export async function activate(ctx) {
  const startedAt = new Date().toISOString();
  const seededDirs = new Set();
  let disposed = false;

  async function resolveVaultConfig() {
    let settings = {};
    try {
      const loaded = await ctx.readSettings();
      if (loaded && typeof loaded === "object") settings = loaded;
    } catch {
      settings = {};
    }
    const rawDir = typeof settings.vaultDir === "string" ? settings.vaultDir.trim() : "";
    const isCustom = isValidAbsoluteDir(rawDir);
    const vaultDir = isCustom ? path.resolve(rawDir) : path.join(ctx.dataDir, "prompts");
    const defaultTag =
      typeof settings.defaultTag === "string" && settings.defaultTag.trim()
        ? settings.defaultTag.trim().toLowerCase().slice(0, 40)
        : "general";
    await mkdir(vaultDir, { recursive: true });
    if (!seededDirs.has(vaultDir)) {
      seededDirs.add(vaultDir);
      await ensureSeeded(vaultDir);
    }
    return { vaultDir, isCustom, defaultTag };
  }

  async function ensureSeeded(vaultDir) {
    const entries = await readdir(vaultDir, { withFileTypes: true });
    const hasMarkdown = entries.some(
      (entry) => entry.isFile() && entry.name.endsWith(".md") && !entry.name.startsWith("."),
    );
    if (hasMarkdown) return;
    const now = new Date().toISOString();
    for (const seed of SEED_PROMPTS) {
      const content = serializePrompt({
        title: seed.title,
        tags: seed.tags,
        updatedAt: now,
        body: seed.body,
      });
      await atomicWriteMarkdown(vaultDir, seed.slug, content);
    }
  }

  async function readAllPrompts(vaultDir) {
    const entries = await readdir(vaultDir, { withFileTypes: true });
    const items = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name.startsWith(".")) continue;
      const slug = entry.name.slice(0, -3).toLowerCase();
      if (!SLUG_RE.test(slug)) continue;
      const filePath = path.join(vaultDir, entry.name);
      try {
        const info = await stat(filePath);
        if (!info.isFile() || info.size > MAX_PROMPT_BYTES) continue;
        const raw = await readFile(filePath, "utf8");
        const parsed = parseFrontmatter(raw, slug, info.mtime.toISOString());
        items.push({
          slug,
          fileName: entry.name,
          filePath,
          title: parsed.title,
          tags: parsed.tags,
          updatedAt: parsed.updatedAt,
          excerpt: makeExcerpt(parsed.body),
          body: parsed.body,
        });
      } catch {
        // Skip unreadable files.
      }
    }
    items.sort((a, b) => {
      if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
      return a.title.localeCompare(b.title);
    });
    return items;
  }

  await resolveVaultConfig();

  ctx.handle("vault/info", async () => {
    if (disposed) throw new Error("Backend is disposed");
    const { vaultDir, isCustom, defaultTag } = await resolveVaultConfig();
    const items = await readAllPrompts(vaultDir);
    return {
      pid: process.pid,
      startedAt,
      vaultDir,
      isCustom,
      defaultTag,
      count: items.length,
    };
  });

  ctx.handle("prompts/list", async (params) => {
    if (disposed) throw new Error("Backend is disposed");
    const { vaultDir } = await resolveVaultConfig();
    const allItems = await readAllPrompts(vaultDir);
    const tagSet = new Set();
    for (const item of allItems) {
      for (const tag of item.tags) tagSet.add(tag);
    }
    const query =
      params && typeof params === "object" && typeof params.query === "string"
        ? params.query.trim().toLowerCase()
        : "";
    const tagFilter =
      params && typeof params === "object" && typeof params.tag === "string"
        ? params.tag.trim().toLowerCase()
        : "";

    const filtered = allItems.filter((item) => {
      if (tagFilter && !item.tags.includes(tagFilter)) return false;
      if (!query) return true;
      return (
        item.title.toLowerCase().includes(query) ||
        item.slug.toLowerCase().includes(query) ||
        item.body.toLowerCase().includes(query) ||
        item.tags.some((tag) => tag.includes(query))
      );
    });

    return {
      vaultDir,
      totalCount: allItems.length,
      tags: [...tagSet].sort(),
      items: filtered,
    };
  });

  ctx.handle("prompts/save", async (params) => {
    if (disposed) throw new Error("Backend is disposed");
    if (!params || typeof params !== "object") {
      throw new Error("Expected prompt payload object");
    }
    const title = typeof params.title === "string" ? params.title.trim() : "";
    if (!title) throw new Error("Prompt title is required");
    const rawSlug =
      typeof params.slug === "string" && params.slug.trim()
        ? params.slug.trim()
        : slugifyTitle(title);
    const slug = assertSafeSlug(rawSlug);
    const body = typeof params.body === "string" ? params.body : "";
    const tags = normalizeTags(params.tags);
    const updatedAt = new Date().toISOString();
    const { vaultDir } = await resolveVaultConfig();

    const markdown = serializePrompt({ title, tags, updatedAt, body });
    const { fileName, filePath } = await atomicWriteMarkdown(vaultDir, slug, markdown);

    if (typeof params.originalSlug === "string" && params.originalSlug.trim()) {
      const oldSlug = assertSafeSlug(params.originalSlug);
      if (oldSlug !== slug) {
        const oldTarget = resolvePromptPath(vaultDir, oldSlug);
        await unlink(oldTarget.filePath).catch(() => undefined);
      }
    }

    return {
      slug,
      fileName,
      filePath,
      title,
      tags,
      updatedAt,
      excerpt: makeExcerpt(body),
      body: body.replace(/\r\n/gu, "\n").trimEnd(),
    };
  });

  ctx.handle("prompts/delete", async (params) => {
    if (disposed) throw new Error("Backend is disposed");
    const rawSlug = params && typeof params === "object" ? params.slug : undefined;
    const slug = assertSafeSlug(rawSlug);
    const { vaultDir } = await resolveVaultConfig();
    const { filePath } = resolvePromptPath(vaultDir, slug);
    try {
      await unlink(filePath);
      return { slug, deleted: true };
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ENOENT") {
        return { slug, deleted: false };
      }
      throw error;
    }
  });

  return () => {
    disposed = true;
    seededDirs.clear();
  };
}
