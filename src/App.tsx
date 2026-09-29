import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Moon, PenLine, Pin, Plus, Settings2, Sun } from "lucide-react";
import { Markdown } from "./Markdown";
import { Editor } from "./Editor";
import { connectGitHub, loadPublicData, repoConfigured, repoName, repoOwner, saveSettings } from "./github";
import { readDrafts } from "./drafts";
import type { Post, SiteSettings } from "./types";

const initialSettings: SiteSettings = { heroTitle: "解题，\n也写生活。", heroSubtitle: "把思路写清楚，把日子记下来。" };

function routeFromHash() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(part => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  return { name: parts[0] || "home", id: parts[1] || "" };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
}

function excerpt(markdown: string) {
  return markdown.replace(/```[\s\S]*?```/g, " ").replace(/\$\$[\s\S]*?\$\$/g, " ").replace(/\$[^$\n]+\$/g, "公式").replace(/[#*`>_\[\]()!~|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 110);
}

function Header() {
  const [dark, setDark] = useState(document.documentElement.classList.contains("dark"));
  function toggle() {
    document.documentElement.classList.toggle("dark", !dark);
    localStorage.setItem("blog-theme", !dark ? "dark" : "light");
    setDark(!dark);
  }
  return <header className="site-header"><div className="site-shell header-inner">
    <a href="#/" className="brand" aria-label="时雨のblog，返回首页">时雨のblog</a>
    <nav aria-label="主导航" className="header-actions">
      <a href="#/manage" className="nav-link manage-link" aria-label="管理博客"><Settings2 size={17} /></a>
      <a href="#/editor" className="write-link icon-only" aria-label="写文章" title="写文章"><PenLine size={17} /></a>
      <button type="button" className="theme-button" onClick={toggle} aria-label={dark ? "切换浅色模式" : "切换深色模式"}>{dark ? <Sun size={19} /> : <Moon size={19} />}</button>
    </nav>
  </div></header>;
}

function Home({ posts, settings, initialCategory }: { posts: Post[]; settings: SiteSettings; initialCategory: string }) {
  const categories = [...new Set(posts.map(post => post.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const [category, setCategory] = useState(categories.includes(initialCategory) ? initialCategory : "全部");
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("blog-list-position") || "null") as { category?: string; y?: number } | null;
      sessionStorage.removeItem("blog-list-position");
      if (saved?.category === category && Number.isFinite(saved.y)) {
        requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved.y || 0)));
      }
    } catch {}
  }, []);
  function selectCategory(next: string) {
    setCategory(next);
    const hash = next === "全部" ? "#/" : `#/category/${encodeURIComponent(next)}`;
    window.history.replaceState(null, "", hash);
  }
  function rememberPosition() {
    try { sessionStorage.setItem("blog-list-position", JSON.stringify({ category, y: window.scrollY })); } catch {}
  }
  const sorted = [...posts].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt.localeCompare(a.updatedAt));
  const visible = sorted.filter(post => category === "全部" || post.category === category);
  return <main className="site-shell home-layout"><aside className="home-aside">
    <h1>{settings.heroTitle}<span className="accent-dot">.</span></h1>
    <p>{settings.heroSubtitle}</p>
  </aside><section className="index-main" aria-label="文章列表">
    <div className="section-heading"><div><span className="section-kicker">01 / POSTS</span><h2>所有文章</h2></div><span className="post-total">{posts.length.toString().padStart(2, "0")}</span></div>
    {categories.length > 0 && <div className="category-row" role="group" aria-label="按分类筛选">{["全部", ...categories].map(item => <button key={item} type="button" className={`category-pill ${category === item ? "selected" : ""}`} aria-pressed={category === item} onClick={() => selectCategory(item)}>{item}<span>{item === "全部" ? posts.length : posts.filter(post => post.category === item).length}</span></button>)}</div>}
    {visible.length ? <div className="post-list">{visible.map(post => <a className="post-card" href={`#/post/${encodeURIComponent(post.id)}`} onClick={rememberPosition} key={post.id}>
      <div className="post-meta"><span className="meta-category">{post.category}</span><span className="meta-separator">/</span><time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time></div>
      <div className="post-title-row"><h3>{post.title}</h3><ArrowUpRight size={20} /></div><p>{excerpt(post.body) || "点击阅读文章"}</p>
      {post.pinned && <span className="pin-tag"><Pin size={12} />置顶</span>}
    </a>)}</div> : <div className="empty-state"><div className="empty-symbol">✳</div><h3>{posts.length ? "这一类还没有文章" : "从第一篇开始"}</h3><p>{posts.length ? "试试其他分类。" : "留一篇题解，或者记下今天。"}</p>{!posts.length && <a href="#/editor" className="empty-create"><Plus size={16} />写第一篇</a>}</div>}
  </section></main>;
}

function Article({ post, connected }: { post?: Post; connected: boolean }) {
  if (!post) return <main className="site-shell error-panel"><h1>文章不存在</h1><a href="#/" className="back-link">返回首页</a></main>;
  return <main className="site-shell article-shell"><nav className="breadcrumbs" aria-label="当前位置"><ol><li><a href="#/">主页</a></li><li><a href={`#/category/${encodeURIComponent(post.category)}`}>{post.category}</a></li><li aria-current="page" title={post.title}>{post.title}</li></ol></nav>
    <article><header className="article-head">{post.pinned ? <div className="article-topline"><Pin size={13} aria-hidden="true" />置顶</div> : null}<h1>{post.title}</h1>
      <div className="article-meta"><time dateTime={post.updatedAt}>{formatDate(post.updatedAt)}</time>{connected && <a href={`#/editor/${encodeURIComponent(post.id)}`}>编辑</a>}</div></header>
      <Markdown content={post.body} /></article>
  </main>;
}

function Connect({ onConnect }: { onConnect: (token: string, login: string) => void }) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const login = await connectGitHub(token.trim()); onConnect(token.trim(), login); setToken(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "连接失败"); }
    finally { setBusy(false); }
  }
  return <main className="site-shell connect-shell"><a href="#/" className="back-link"><ArrowLeft size={16} />返回博客</a><div className="connect-card">
    <span className="section-kicker">AUTHOR ACCESS</span><h1>连接 GitHub 后写作</h1>
    <p>文章和首页文字保存在仓库里。使用仅授权 <strong>{repoConfigured ? `${repoOwner}/${repoName}` : "博客仓库"}</strong>、具有 Contents 读写权限的 GitHub 精细权限令牌。令牌只保留在当前打开的页面内，关闭或刷新后需要重新输入。</p>
    {!repoConfigured ? <p className="editor-error">尚未绑定 GitHub 仓库，发布站点后即可连接。</p> : <form onSubmit={event => void submit(event)}><label className="editor-label">GitHub 令牌<input type="password" autoComplete="off" value={token} onChange={event => setToken(event.target.value)} placeholder="github_pat_…" required /></label><button type="submit" className="action-button primary" disabled={busy}>{busy ? "连接中…" : "连接仓库"}</button></form>}
    {error && <p className="editor-error" role="alert">{error}</p>}
    <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer" className="token-help">创建精细权限令牌 ↗</a>
  </div></main>;
}

function Manage({ posts, settings, token, login, onSettings }: { posts: Post[]; settings: SiteSettings; token: string; login: string; onSettings: (settings: SiteSettings) => void }) {
  const [form, setForm] = useState(settings);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const drafts = readDrafts();
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await saveSettings(form, token); onSettings(form); setMessage("首页文字已保存，GitHub Pages 更新后所有读者都能看到。 "); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "保存失败"); }
    finally { setBusy(false); }
  }
  return <main className="site-shell manage-shell"><a href="#/" className="back-link"><ArrowLeft size={16} />返回博客</a>
    <div className="manage-heading"><div><span className="section-kicker">MANAGE / {login.toUpperCase()}</span><h1>管理博客</h1></div><a className="write-link" href="#/editor"><Plus size={16} />写文章</a></div>
    <form className="settings-form" onSubmit={event => void submit(event)}><div><span className="section-kicker">HOMEPAGE</span><h2>首页文字</h2></div>
      <label className="editor-label">左侧标题<textarea rows={3} maxLength={90} value={form.heroTitle} onChange={event => setForm({ ...form, heroTitle: event.target.value })} required /></label>
      <label className="editor-label">副标题<textarea rows={2} maxLength={160} value={form.heroSubtitle} onChange={event => setForm({ ...form, heroSubtitle: event.target.value })} required /></label>
      <div className="settings-footer"><button type="submit" className="action-button primary" disabled={busy}>{busy ? "保存中…" : "保存首页文字"}</button><span aria-live="polite">{message}</span></div>
    </form>
    <div className="manage-section"><h2>本机草稿 <span>{drafts.length}</span></h2>{drafts.length ? drafts.map(draft => <a key={draft.id} href={`#/editor/${encodeURIComponent(draft.id)}`} className="manage-post"><span>{draft.title || "未命名草稿"}</span><span>继续编辑 ↗</span></a>) : <p>当前设备没有草稿。</p>}</div>
    <div className="manage-section"><h2>已发布 <span>{posts.length}</span></h2>{posts.map(post => <a key={post.id} href={`#/editor/${encodeURIComponent(post.id)}`} className="manage-post"><span>{post.title}</span><span>编辑 ↗</span></a>)}</div>
  </main>;
}

export function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [posts, setPosts] = useState<Post[]>([]);
  const [settings, setSettings] = useState<SiteSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [token, setToken] = useState("");
  const [login, setLogin] = useState("");
  useEffect(() => {
    const update = () => {
      const next = routeFromHash();
      setRoute(next);
      if (next.name === "home" || next.name === "category") {
        let restore = false;
        try {
          const saved = JSON.parse(sessionStorage.getItem("blog-list-position") || "null") as { category?: string } | null;
          restore = saved?.category === (next.name === "category" ? next.id : "全部");
        } catch {}
        if (!restore) window.scrollTo(0, 0);
      } else window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    loadPublicData().then(data => { setPosts(data.posts); setSettings(data.settings); setLoading(false); }).catch(error => { setLoadError(error.message); setLoading(false); });
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return <><Header />{loading ? <main className="site-shell error-panel"><p>正在读取文章…</p></main> : loadError ? <main className="site-shell error-panel"><h1>暂时无法读取博客</h1><p>{loadError}</p><button className="action-button" onClick={() => location.reload()}>重试</button></main> : route.name === "post" ? <Article post={posts.find(post => post.id === route.id)} connected={Boolean(token)} /> : route.name === "editor" || route.name === "manage" ? !token ? <Connect onConnect={(value, name) => { setToken(value); setLogin(name); }} /> : route.name === "manage" ? <Manage posts={posts} settings={settings} token={token} login={login} onSettings={setSettings} /> : <Editor key={route.id || "new"} id={route.id} posts={posts} token={token} onPosts={setPosts} /> : <Home key={route.name === "category" ? route.id : "home"} posts={posts} settings={settings} initialCategory={route.name === "category" ? route.id : "全部"} />}</>;
}
