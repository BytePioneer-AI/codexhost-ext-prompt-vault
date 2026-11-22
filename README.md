# Prompt Vault / 本地提示词库

Prompt Vault is a local prompt library for Codex Desktop and CH Web. Open a compact picker beside its floating button to find, insert, or save a prompt without leaving your chat.

面向 Codex Desktop 与 CH Web 的本机提示词库。悬浮按钮旁的小窗能原地搜索、插入和保存提示词，不遮挡整页。

## Quick picker / 快速小窗

- **Move it where you work.** Drag the button with a mouse or touch. At either side it snaps halfway out of view; hover, focus, or open the picker to bring it back. The position is remembered in the current browser or renderer.
- **Search and insert.** Click the button or press `⌥P` / `Alt+P`. Use `↑` / `↓` to choose and `Enter` to insert into chat. Without a composer, the picker copies instead. Press `⌘Enter` / `Ctrl+Enter` to copy directly, or fill `{{variable}}` placeholders inline before inserting. Press `Esc` or click outside to close.
- **Save in place.** Choose **+ Save**. The picker starts with your chat draft or, if it’s empty, the text you selected on the page. Edit the suggested title and optional tags, then click **Save** or press `⌘Enter` / `Ctrl+Enter`.
- **Find what you use.** Results are sorted by pin, then most recently inserted or copied, then last updated.

- **拖动与贴边**：鼠标和触屏均可拖动；靠左或靠右松手后自动半收起，悬停、聚焦或打开小窗时完整展开。刷新后保留位置。
- **搜索与插入**：点悬浮按钮或按 `⌥P` / `Alt+P`，用 `↑` / `↓` 选择，回车插入输入框。没有输入框时自动复制；按 `⌘Enter` / `Ctrl+Enter` 可直接复制，也可先填写 `{{变量}}` 再插入。按 `Esc` 或点击外部关闭。
- **原地保存**：点 **+ 存**，预填聊天草稿；没有草稿时使用页面划选文字。可修改建议标题和选填标签，点 **保存** 或按 `⌘Enter` / `Ctrl+Enter` 落盘。
- **常用优先**：先显示置顶提示词，其次按最近插入或复制排序，再按更新时间排序。

## Library and settings / 词库与设置

Open **Plugins → Prompt Vault** for the auto-saving editor, tag filters, and pin, copy, and delete actions. Edit the storage folder or default tag in the host’s plugin settings. Prompt text is stored locally as Markdown; picker position and recently used IDs are kept separately in local browser storage.

在 **插件 → 本地提示词库** 中编辑和自动保存、按标签筛选，以及置顶、复制和删除。保存位置和默认标签在宿主的插件设置中配置。提示词以 Markdown 存在本机；悬浮按钮位置与最近使用的提示词 ID 单独保存在浏览器本地存储中。
