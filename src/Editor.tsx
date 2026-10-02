import { memo, startTransition, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Save, Send, Trash2 } from "lucide-react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, lineNumbers } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo, undoDepth, redoDepth } from "@codemirror/commands";
import { Markdown } from "./Markdown";
import { EditorToolbar } from "./EditorTools";
import type { EditorView as EditorLayoutView } from "./EditorTools";
import { deletePost, publishPost } from "./github";
import { readDrafts, removeDraft, saveDraft } from "./drafts";
import type { Post } from "./types";

const MemoMarkdown = memo(Markdown);
function splitPreviewSections(content: string): string[] {
  // Markdown references and footnotes can cross sections, so keep those documents whole.
  if (/^\s{0,3}\[(?:\^[^\]]+|[^\]]+)\]:/m.test(content)) return [content];
  const sections: string[] = [];
  let current: string[] = [];
  let fence = "";
  let math = false;
  let directives = 0;
  for (const line of content.split("\n")) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      if (!fence) fence = fenceMatch[1];
      else if (fenceMatch[1][0] === fence[0] && fenceMatch[1].length >= fence.length) fence = "";
    }
    if (!fence && !math && !directives && /^#{1,6}[ \t]+/.test(line) && current.length) {
      sections.push(current.join("\n"));
      current = [];
    }
    current.push(line);
    if (fence) continue;
    const mathMarkers = line.match(/\$\$/g)?.length || 0;
    if (mathMarkers % 2) math = !math;
    if (!math) {
      if (/^\s{0,3}:{3,}\w/.test(line)) directives++;
      else if (/^\s{0,3}:{3,}\s*$/.test(line)) directives = Math.max(0, directives - 1);
    }
  }
  sections.push(current.join("\n"));
  return sections;
}
const MarkdownPreview = memo(function MarkdownPreview({ content }: { content: string }) {
  const sections = useMemo(() => splitPreviewSections(content), [content]);
  return <div className="markdown-body">{sections.map((section, index) => <MemoMarkdown key={index} content={section} bare />)}</div>;
});
export function Editor({ id, posts, token, onPosts, previewOnly = false }: { id: string; posts: Post[]; token: string; onPosts: (posts: Post[]) => void; previewOnly?: boolean }) {
  const published = posts.find(post => post.id === id);
  const draft = useMemo(() => readDrafts().find(item => item.id === id), [id]);
  const source = draft || published;
  const [postId] = useState(id || crypto.randomUUID());
  const [title, setTitle] = useState(source?.title || "");
  const [body, setBody] = useState(source?.body || "");
  const [previewBody, setPreviewBody] = useState(source?.body || "");
  const bodyRef = useRef(source?.body || "");
  const editorMount = useRef<HTMLDivElement>(null);
  const editorView = useRef<EditorView | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);
  const updateActions = useRef<{ commit: () => void; insert: (before: string, after?: string, placeholder?: string) => void; save: () => void }>({ commit: () => {}, insert: () => {}, save: () => {} });
  const heldDeletion = useRef(false);
  const autoSaveTimer = useRef<number | undefined>(undefined);
  const [historyState, setHistoryState] = useState({ undo: false, redo: false });
  const historyAvailability = useRef({ undo: false, redo: false });
  const [category, setCategory] = useState(source?.category || "");
  const [pinned, setPinned] = useState(Boolean(source?.pinned));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [autoSaved, setAutoSaved] = useState("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState<EditorLayoutView>("split");
  const [split, setSplit] = useState(50);
  const [fullscreen, setFullscreen] = useState(false);
  const lineCount = useMemo(() => 1 + (body.match(/\n/g)?.length || 0), [body]);
  const formulaCount = useMemo(() => (previewBody.match(/\$\$[\s\S]*?\$\$|\$[^$\n]+\$/g) || []).length, [previewBody]);

  useEffect(() => {
    if (!fullscreen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const exitOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setFullscreen(false); };
    document.addEventListener("keydown", exitOnEscape);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener("keydown", exitOnEscape); };
  }, [fullscreen]);
  const fileInput = useRef<HTMLInputElement>(null);
  const panels = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const categories = useMemo(() => [...new Set(posts.map(post => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN")), [posts]);

  function currentBody() {
    return editorView.current?.state.doc.toString() ?? bodyRef.current;
  }

  function commitEditor() {
    window.clearTimeout(idleTimer.current);
    const view = editorView.current;
    if (!view) return;
    const next = view.state.doc.toString();
    if (next === bodyRef.current) return;
    bodyRef.current = next;
    setMessage(""); setAutoSaved(""); setDirty(true);
    startTransition(() => {
      setBody(next);
      setPreviewBody(next);
      setHistoryState({ undo: undoDepth(view.state) > 0, redo: redoDepth(view.state) > 0 });
    });
  }
  updateActions.current = { commit: commitEditor, insert, save: saveLocal };

  useEffect(() => {
    const mount = editorMount.current, container = panels.current;
    if (!mount || !container) return;
    const schedule = (delay: number) => {
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => updateActions.current.commit(), delay);
    };
    const view = new EditorView({
      state: EditorState.create({
        doc: bodyRef.current,
        extensions: [
          EditorView.lineWrapping,
          lineNumbers(),
          history(),
          keymap.of([
            { key: "Mod-b", run: () => { updateActions.current.insert("**", "**"); return true; } },
            { key: "Mod-i", run: () => { updateActions.current.insert("*", "*"); return true; } },
            { key: "Mod-d", run: () => { updateActions.current.insert("~~", "~~"); return true; } },
            { key: "Mod-m", run: () => { updateActions.current.insert("$", "$", "a_i"); return true; } },
            { key: "Mod-Shift-m", run: () => { updateActions.current.insert("\n$$\n", "\n$$\n", "\\sum_{i=1}^{n}a_i"); return true; } },
            { key: "Mod-s", run: () => { updateActions.current.commit(); updateActions.current.save(); return true; } },
            { key: "Tab", run: () => { updateActions.current.insert("  ", "", ""); return true; } },
            ...historyKeymap,
            ...defaultKeymap,
          ]),
          EditorView.updateListener.of(update => {
            if (!update.docChanged) return;
            const available = { undo: undoDepth(update.state) > 0, redo: redoDepth(update.state) > 0 };
            if (available.undo !== historyAvailability.current.undo || available.redo !== historyAvailability.current.redo) {
              historyAvailability.current = available;
              setHistoryState(available);
            }
            window.clearTimeout(autoSaveTimer.current);
            if (!heldDeletion.current) schedule(update.state.doc.length > 15000 ? 500 : 220);
          }),
          EditorView.domEventHandlers({
            keydown: event => {
              if (event.key === "Backspace" || event.key === "Delete") {
                heldDeletion.current = true;
                window.clearTimeout(idleTimer.current);
                window.clearTimeout(autoSaveTimer.current);
              }
            },
            keyup: event => {
              if (event.key === "Backspace" || event.key === "Delete") {
                heldDeletion.current = false;
                schedule(400);
              }
            },
            blur: () => { if (heldDeletion.current) { heldDeletion.current = false; schedule(100); } },
          }),
        ],
      }),
      parent: mount,
    });
    editorView.current = view;
    const updateSpace = () => {
      const value = `${Math.round((container.clientHeight - 32) / 2)}px`;
      if (container.style.getPropertyValue("--writing-space") !== value) container.style.setProperty("--writing-space", value);
      view.requestMeasure();
    };
    const observer = new ResizeObserver(updateSpace);
    observer.observe(container);
    updateSpace();
    return () => {
      observer.disconnect();
      window.clearTimeout(idleTimer.current);
      window.clearTimeout(autoSaveTimer.current);
      view.destroy();
      editorView.current = null;
    };
  }, []);

  function insert(before: string, after = "", placeholder = "内容") {
    const view = editorView.current;
    if (!view) return;
    const { from, to } = view.state.selection.main;
    const selection = view.state.sliceDoc(from, to) || placeholder;
    view.dispatch({
      changes: { from, to, insert: before + selection + after },
      selection: { anchor: from + before.length, head: from + before.length + selection.length },
      scrollIntoView: true,
    });
    view.focus();
  }

  function moveDivider(x: number) {
    const rect = panels.current?.getBoundingClientRect();
    if (rect) setSplit(Math.max(18, Math.min(82, Math.round((x - rect.left) / rect.width * 100))));
  }

  function makePost(): Post {
    return {
      id: postId,
      title: title.trim(),
      category: category.trim(),
      body: currentBody(),
      pinned,
      publishedAt: source?.publishedAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  useEffect(() => {
    if (!dirty || (!title.trim() && !body.trim())) return;
    autoSaveTimer.current = window.setTimeout(() => {
      try {
        saveDraft({ ...makePost(), draft: true });
        if (!id) window.history.replaceState(null, "", `#/editor/${encodeURIComponent(postId)}`);
        setAutoSaved(`已自动保存到本机 (${new Date().toLocaleTimeString("zh-CN", { hour12: false })})`);
        setDirty(false);
      } catch { setAutoSaved("本机自动保存失败"); }
    }, 1500);
    return () => window.clearTimeout(autoSaveTimer.current);
  }, [title, body, category, pinned, dirty, postId]);

  function saveLocal() {
    commitEditor();
    if (!title.trim()) { setError("请先填写标题"); return; }
    saveDraft({ ...makePost(), draft: true });
    setError(""); setMessage("草稿已保存到当前设备"); setDirty(false);
    if (!id) location.hash = `#/editor/${encodeURIComponent(postId)}`;
  }

  async function publish() {
    commitEditor();
    if (!title.trim()) { setError("请先填写标题"); return; }
    if (!category.trim() || category.trim().length > 40) { setError("请输入 1–40 字的分类"); return; }
    const current = currentBody();
    if (!current.trim()) { setError("发布前请填写正文"); return; }
    if (current.length > 500000) { setError("正文不能超过 500 KB"); return; }
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
    if (currentBody() && !window.confirm("导入文件会替换当前正文，继续吗？")) { event.target.value = ""; return; }
    const value = await file.text();
    const view = editorView.current;
    if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value }, selection: { anchor: 0 } });
    commitEditor(); setError(""); event.target.value = "";
  }

  function exportMarkdown() {
    const url = URL.createObjectURL(new Blob([currentBody()], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${(title.trim() || "文章").replace(/[\\/:*?"<>|]/g, "-")}.md`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <main className="site-shell editor-shell">
    {!previewOnly && <a href={published ? `#/post/${encodeURIComponent(postId)}` : "#/"} className="back-link"><ArrowLeft size={16} />返回博客</a>}
    <div className="editor-head"><div><span className="section-kicker">WRITE / {source ? "EDIT" : "NEW"}</span><h1>{source ? "编辑" : "写新文章"}</h1></div>
      <div className="editor-actions"><span className="editor-save-state" aria-live="polite">{message && <><Check size={14} /> {message}</>}</span>
        <button className="action-button" type="button" disabled={busy} onClick={saveLocal}><Save size={16} />保存本机草稿</button>
        {!previewOnly && <button className="action-button primary" type="button" disabled={busy} onClick={() => void publish()}><Send size={16} />{busy ? "发布中…" : published ? "更新发布" : "发布文章"}</button>}</div></div>
    <div className="editor-settings"><label className="editor-label editor-title">标题<input value={title} onChange={event => { setTitle(event.target.value); setMessage(""); setAutoSaved(""); setDirty(true); }} placeholder="给文章起个标题" maxLength={180} /></label>
      <label className="editor-label editor-category">分类<input list="blog-categories" value={category} onChange={event => { setCategory(event.target.value); setMessage(""); setAutoSaved(""); setDirty(true); }} placeholder="输入或选择分类" maxLength={40} /><datalist id="blog-categories">{categories.map(item => <option value={item} key={item} />)}</datalist></label>
      <label className="pin-control"><input type="checkbox" checked={pinned} onChange={event => { setPinned(event.target.checked); setAutoSaved(""); setDirty(true); }} />置顶文章</label></div>
    <div className={`editor-workspace${fullscreen ? " is-fullscreen" : ""}`}>
      <EditorToolbar insert={insert} undo={() => { const v = editorView.current; if (v) undo(v); }} redo={() => { const v = editorView.current; if (v) redo(v); }} canUndo={historyState.undo} canRedo={historyState.redo} onImport={() => fileInput.current?.click()} onExport={exportMarkdown} view={view} onView={next => { if (next === "preview") commitEditor(); setView(next); }} fullscreen={fullscreen} onFullscreen={() => setFullscreen(value => !value)} />
      <input ref={fileInput} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={event => void importMarkdown(event)} aria-label="导入 Markdown 文件" />
      <div className="mobile-tabbar" role="group" aria-label="编辑区视图"><button type="button" className={view !== "preview" ? "active" : ""} onClick={() => setView("source")}>编辑</button><button type="button" className={view === "preview" ? "active" : ""} onClick={() => { commitEditor(); setView("preview"); }}>预览</button></div>
      <div className={`editor-panels mode-${view}`} ref={panels} style={{ "--split": `${split}%` } as React.CSSProperties}>
        <div className="editor-source"><div className="panel-label">MARKDOWN 源代码 <span>支持洛谷扩展语法与 KaTeX</span></div><div className="editor-cm" ref={editorMount} aria-label="Markdown 正文" /></div>
        <div className="editor-divider" role="separator" aria-label="调整 Markdown 与预览宽度" aria-orientation="vertical" aria-valuemin={18} aria-valuemax={82} aria-valuenow={split} tabIndex={view === "split" ? 0 : -1} onPointerDown={event => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); dragging.current = true; moveDivider(event.clientX); }} onPointerMove={event => { if (dragging.current) moveDivider(event.clientX); }} onPointerUp={event => { dragging.current = false; if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { dragging.current = false; }} onKeyDown={event => { if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); setSplit(value => Math.max(18, Math.min(82, value + (event.key === "ArrowRight" ? 5 : -5)))); } else if (event.key === "Home" || event.key === "End") { event.preventDefault(); setSplit(event.key === "Home" ? 18 : 82); } }} />
        <div className="editor-preview"><div className="panel-label">实时预览</div><div className="preview-scroll">{view !== "source" && previewBody.trim() ? <MarkdownPreview content={previewBody} /> : view !== "source" && <p className="preview-placeholder">写下正文后，这里会显示排版效果。</p>}</div></div>
      </div>
      <div className="editor-status"><span>{message || autoSaved || "编辑中"}</span><span>{lineCount} 行 | {body.length} 字符 | {formulaCount} 公式 | 预计阅读 {Math.max(1, Math.ceil(body.length / 300))} 分钟</span></div>
    </div>
    {error && <p className="editor-error" role="alert">{error}</p>}
    {source && !previewOnly && <div className="delete-row"><button type="button" className="action-button danger" disabled={busy} onClick={() => void remove()}><Trash2 size={15} />删除文章</button></div>}
  </main>;
}
