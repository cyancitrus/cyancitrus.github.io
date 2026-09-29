import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Save, Send, Trash2 } from "lucide-react";
import { Markdown } from "./Markdown";
import { EditorToolbar, useMarkdownHistory } from "./EditorTools";
import type { EditorView } from "./EditorTools";
import { deletePost, publishPost } from "./github";
import { readDrafts, removeDraft, saveDraft } from "./drafts";
import type { Post } from "./types";

export function Editor({ id, posts, token, onPosts }: { id: string; posts: Post[]; token: string; onPosts: (posts: Post[]) => void }) {
  const published = posts.find(post => post.id === id);
  const draft = readDrafts().find(item => item.id === id);
  const source = draft || published;
  const [postId] = useState(id || crypto.randomUUID());
  const [title, setTitle] = useState(source?.title || "");
  const [body, setBody] = useState(source?.body || "");
  const [category, setCategory] = useState(source?.category || "");
  const [pinned, setPinned] = useState(Boolean(source?.pinned));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [autoSaved, setAutoSaved] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<EditorView>("split");
  const [split, setSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);
  const history = useMarkdownHistory(body, setBody, () => { setMessage(""); setAutoSaved(""); setDirty(true); });
  const sourceLines = useMemo(() => body.split("\n"), [body]);
  const lineCount = sourceLines.length;
  const formulaCount = useMemo(() => (body.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) || []).length, [body]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const exitOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", exitOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", exitOnEscape); };
  }, [fullscreen]);
  const input = useRef<HTMLTextAreaElement>(null);
  const gutter = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const categories = [...new Set(posts.map(post => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));

  useEffect(() => {
    if (!input.current || !panels.current) return;
    const container = panels.current;
    let frame = 0;
    const updateSpace = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const value = `${Math.round((container.clientHeight - 32) / 2)}px`;
        if (container.style.getPropertyValue("--writing-space") !== value) container.style.setProperty("--writing-space", value);
        const area = input.current;
        if (area && gutter.current) {
          const style = getComputedStyle(area);
          const width = `${Math.max(1, area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight))}px`;
          if (gutter.current.style.getPropertyValue("--mirror-width") !== width) gutter.current.style.setProperty("--mirror-width", width);
        }
      });
    };
    const observer = new ResizeObserver(updateSpace);
    observer.observe(container);
    observer.observe(input.current);
    updateSpace();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, []);

  function insert(before: string, after = "", placeholder = "内容") {
    const area = input.current;
    if (!area) return;
    const start = area.selectionStart, end = area.selectionEnd;
    const selection = body.slice(start, end) || placeholder;
    history.update(body.slice(0, start) + before + selection + after + body.slice(end));
    requestAnimationFrame(() => { area.focus(); area.setSelectionRange(start + before.length, start + before.length + selection.length); });
  }

  function moveDivider(x: number) {
    const rect = panels.current?.getBoundingClientRect();
    if (rect) setSplit(Math.max(18, Math.min(82, Math.round((x - rect.left) / rect.width * 100))));
  }

  function keyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    const cmd = event.ctrlKey || event.metaKey;
    if (cmd && event.key.toLowerCase() === "b") { event.preventDefault(); insert("**", "**"); }
    else if (cmd && event.key.toLowerCase() === "i") { event.preventDefault(); insert("*", "*"); }
    else if (cmd && event.key.toLowerCase() === "d") { event.preventDefault(); insert("~~", "~~"); }
    else if (cmd && event.key.toLowerCase() === "m") { event.preventDefault(); event.shiftKey ? insert("\n$$\n", "\n$$\n", "\\sum_{i=1}^{n}a_i") : insert("$", "$", "a_i"); }
    else if (cmd && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? history.redo() : history.undo(); }
    else if (cmd && event.key.toLowerCase() === "y") { event.preventDefault(); history.redo(); }
    else if (cmd && event.key.toLowerCase() === "s") { event.preventDefault(); saveLocal(); }
    else if (event.key === "Tab") { event.preventDefault(); insert("  ", "", ""); }
  }

  function makePost(): Post {
    return {
      id: postId,
      title: title.trim(),
      category: category.trim(),
      body,
      pinned,
      publishedAt: source?.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  useEffect(() => {
    if (!dirty || (!title.trim() && !body.trim())) return;
    const timer = window.setTimeout(() => {
      try {
        saveDraft({ ...makePost(), draft: true });
        if (!id) window.history.replaceState(null, "", `#/editor/${encodeURIComponent(postId)}`);
        setAutoSaved(`已自动保存到本机 (${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`);
        setDirty(false);
      } catch { setAutoSaved("本机自动保存失败"); }
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [title, body, category, pinned, dirty, postId]);

  function saveLocal() {
    if (!title.trim()) { setError("请先填写标题"); return; }
    saveDraft({ ...makePost(), draft: true });
    setError(""); setMessage("草稿已保存到当前设备"); setDirty(false);
    if (!id) location.hash = `#/editor/${encodeURIComponent(postId)}`;
  }

  async function publish() {
    if (!title.trim()) { setError("请先填写标题"); return; }
    if (!category.trim() || category.trim().length > 40) { setError("请输入 1–40 字的分类"); return; }
    if (!body.trim()) { setError("发布前请填写正文"); return; }
    if (body.length > 500000) { setError("正文不能超过 500 KB"); return; }
    setBusy(true); setError(""); setMessage("");
    try {
      const next = await publishPost(makePost(), token);
      onPosts(next);
      removeDraft(postId);
      setDirty(false); setAutoSaved("");
      location.hash = `#/post/${encodeURIComponent(postId)}`;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "发布失败"); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!window.confirm("确定删除这篇文章？删除后无法恢复。")) return;
    setBusy(true); setError("");
    try {
      if (published) onPosts(await deletePost(postId, token));
      removeDraft(postId);
      location.hash = "#/";
    } catch (reason) { setError(reason instanceof Error ? reason.message : "删除失败"); }
    finally { setBusy(false); }
  }

  async function importMarkdown(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 500000) { setError("请选择小于 500 KB 的 Markdown 文件"); return; }
    if (body && !window.confirm("导入文件会替换当前正文，继续吗？")) { event.target.value = ""; return; }
    history.update(await file.text()); setError(""); event.target.value = "";
  }

  function exportMarkdown() {
    const url = URL.createObjectURL(new Blob([body], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(title.trim() || "文章").replace(/[\\/:*?"<>|]/g, "-")}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="site-shell editor-shell">
    <a href={published ? `#/post/${encodeURIComponent(postId)}` : "#/"} className="back-link"><ArrowLeft size={16} />返回博客</a>
    <div className="editor-head"><div><span className="section-kicker">WRITE / {source ? "EDIT" : "NEW"}</span><h1>{source ? "编辑" : "写新文章"}</h1></div>
      <div className="editor-actions"><span className="editor-save-state" aria-live="polite">{message && <><Check size={14} /> {message}</>}</span>
        <button className="action-button" type="button" disabled={busy} onClick={saveLocal}><Save size={16} />保存本机草稿</button>
        <button className="action-button primary" type="button" disabled={busy} onClick={() => void publish()}><Send size={16} />{busy ? "发布中…" : published ? "更新发布" : "发布文章"}</button></div></div>
    <div className="editor-settings"><label className="editor-label editor-title">标题<input value={title} onChange={event => { setTitle(event.target.value); setMessage(""); setAutoSaved(""); setDirty(true); }} placeholder="给文章起个标题" maxLength={180} /></label>
      <label className="editor-label editor-category">分类<input list="blog-categories" value={category} onChange={event => { setCategory(event.target.value); setMessage(""); setAutoSaved(""); setDirty(true); }} placeholder="输入或选择分类" maxLength={40} /><datalist id="blog-categories">{categories.map(item => <option value={item} key={item} />)}</datalist></label>
      <label className="pin-control"><input type="checkbox" checked={pinned} onChange={event => { setPinned(event.target.checked); setAutoSaved(""); setDirty(true); }} />置顶文章</label></div>
    <div className={`editor-workspace${fullscreen ? " is-fullscreen" : ""}`}>
      <EditorToolbar insert={insert} undo={history.undo} redo={history.redo} canUndo={history.canUndo} canRedo={history.canRedo} onImport={() => fileInput.current?.click()} onExport={exportMarkdown} view={view} onView={setView} fullscreen={fullscreen} onFullscreen={() => setFullscreen(value => !value)} />
      <input ref={fileInput} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={event => void importMarkdown(event)} aria-label="导入 Markdown 文件" />
      <div className="mobile-tabbar" role="group" aria-label="编辑区视图"><button type="button" className={view !== "preview" ? "active" : ""} onClick={() => setView("source")}>编辑</button><button type="button" className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}>预览</button></div>
      <div className={`editor-panels mode-${view}`} ref={panels} style={{ "--split": `${split}%` } as React.CSSProperties}>
        <div className="editor-source"><div className="panel-label">MARKDOWN 源代码 <span>支持洛谷扩展语法与 KaTeX</span></div><div className="editor-input-wrap"><div className="editor-gutter" ref={gutter} aria-hidden="true">{sourceLines.map((line, index) => <div className="gutter-row" key={index}><span className="gutter-number">{index + 1}</span><span className="gutter-mirror">{line || "\u200b"}</span></div>)}</div><textarea className="editor-textarea" ref={input} value={body} onChange={event => history.update(event.target.value, true)} onScroll={event => { if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop; }} onKeyDown={keyDown} wrap="soft" spellCheck={false} aria-label="Markdown 正文" placeholder={"在这里写 Markdown…\n\n支持 $公式$、$$块级公式$$、表格和 ```cpp 代码块。"} /></div></div>
        <div className="editor-divider" role="separator" aria-label="调整 Markdown 与预览宽度" aria-orientation="vertical" aria-valuemin={18} aria-valuemax={82} aria-valuenow={split} tabIndex={view === "split" ? 0 : -1} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; moveDivider(event.clientX); }} onPointerMove={event => { if (dragging.current) moveDivider(event.clientX); }} onPointerUp={event => { dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit(value => Math.max(18, Math.min(82, value + (event.key === "ArrowRight" ? 5 : -5)))); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setSplit(event.key === "Home" ? 18 : 82); } }} />
        <div className="editor-preview"><div className="panel-label">实时预览</div><div className="preview-scroll">{body.trim() ? <Markdown content={body} /> : <p className="preview-placeholder">写下正文后，这里会显示排版效果。</p>}</div></div>
      </div>
      <div className="editor-status"><span>{message || autoSaved || "编辑中"}</span><span>{lineCount} 行 | {body.length} 字符 | {formulaCount} 公式 | 预计阅读 {Math.max(1, Math.ceil(body.length / 300))} 分钟</span></div>
    </div>
    {error && <p className="editor-error" role="alert">{error}</p>}
    {source && <div className="delete-row"><button type="button" className="action-button danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />删除文章</button></div>}
  </main>;
}
