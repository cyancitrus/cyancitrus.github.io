"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlignLeft, Bold, Box, ChevronDown, Code2, Download, FileCode2, FileInput, Heading, Image, Italic, Link2, List, ListChecks, ListOrdered, Maximize2, Minimize2, Minus, PanelLeft, PanelRight, Quote, Redo2, Strikethrough, Table2, Undo2, Columns2 } from "lucide-react";

export type EditorView = "split" | "source" | "preview";

type MenuItem = { label: string; action: () => void; swatch?: string };
function ToolbarMenu({ label, icon, items }: { label: string; icon: React.ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !popup.current?.contains(target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    const closeOnScroll = () => setOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); window.removeEventListener("scroll", closeOnScroll, true); };
  }, [open]);
  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect) setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 262)), top: rect.bottom + 5 });
    setOpen(value => !value);
  };
  return <>
    <button ref={trigger} type="button" className="tool-button icon-tool menu-trigger" title={label} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>{icon}<ChevronDown size={12} /></button>
    {open && createPortal(<div ref={popup} className="tool-popup" role="menu" aria-label={label} style={position}>
      {items.map(item => <button key={item.label} type="button" role="menuitem" onClick={() => { setOpen(false); item.action(); }}>
        {item.swatch && <span className={`menu-swatch ${item.swatch}`} aria-hidden="true" />}{item.label}
      </button>)}
    </div>, document.body)}
  </>;
}

export function useMarkdownHistory(initialBody: string, applyBody: (next: string, typing: boolean) => void, onDirty: () => void) {
  const current = useRef(initialBody);
  const history = useRef({ past: [] as string[], future: [] as string[], lastInput: 0, typing: false });
  const [available, setAvailable] = useState({ undo: false, redo: false });
  const update = (next: string, typing = false) => {
    const body = current.current;
    if (next === body) return;
    const h = history.current;
    const now = Date.now();
    if (!typing || !h.typing || now - h.lastInput > 700) {
      h.past.push(body);
      if (h.past.length > 60) h.past.shift();
    }
    h.future = [];
    h.lastInput = now;
    h.typing = typing;
    current.current = next;
    applyBody(next, typing);
    onDirty();
    setAvailable(current => current.undo === (h.past.length > 0) && !current.redo ? current : { undo: h.past.length > 0, redo: false });
  };
  const undo = () => {
    const h = history.current;
    const previous = h.past.pop();
    if (previous === undefined) return;
    h.future.push(current.current); h.typing = false;
    current.current = previous;
    applyBody(previous, false); onDirty();
    setAvailable({ undo: h.past.length > 0, redo: true });
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(current.current); h.typing = false;
    current.current = next;
    applyBody(next, false); onDirty();
    setAvailable({ undo: true, redo: h.future.length > 0 });
  };
  return { update, undo, redo, canUndo: available.undo, canRedo: available.redo };
}

type ToolbarProps = {
  insert: (before: string, after?: string, placeholder?: string) => void;
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  onImport: () => void; onExport: () => void;
  view: EditorView; onView: (view: EditorView) => void;
  fullscreen: boolean; onFullscreen: () => void;
};

export function EditorToolbar({ insert, undo, redo, canUndo, canRedo, onImport, onExport, view, onView, fullscreen, onFullscreen }: ToolbarProps) {
  const button = (name: string, icon: React.ReactNode, action: () => void, extra?: { disabled?: boolean; pressed?: boolean }) =>
    <button type="button" className="tool-button icon-tool" key={name} title={name} aria-label={name} aria-pressed={extra?.pressed} disabled={extra?.disabled} onClick={action}>{icon}</button>;
  return <div className="editor-toolbar" aria-label="Markdown 工具栏">
    <span className="tool-group">{button("撤销", <Undo2 size={17} />, undo, { disabled: !canUndo })}{button("重做", <Redo2 size={17} />, redo, { disabled: !canRedo })}</span>
    <span className="tool-group"><label className="tool-heading" title="标题"><Heading size={17} /><select aria-label="标题级别" defaultValue="" onChange={event => { if (event.target.value) insert(`\n${"#".repeat(Number(event.target.value))} `, "\n", "标题"); event.target.value = ""; }}><option value="">标题</option>{[1, 2, 3, 4, 5, 6].map(level => <option value={level} key={level}>H{level}</option>)}</select></label>{button("加粗", <Bold size={17} />, () => insert("**", "**"))}{button("斜体", <Italic size={17} />, () => insert("*", "*"))}{button("删除线", <Strikethrough size={17} />, () => insert("~~", "~~"))}</span>
    <span className="tool-group">{button("行内代码", <Code2 size={17} />, () => insert("`", "`", "代码"))}{button("C++ 代码块", <FileCode2 size={17} />, () => insert("\n```cpp\n", "\n```\n", "// C++ 代码"))}{button("引用", <Quote size={17} />, () => insert("\n> ", "\n", "引用内容"))}</span>
    <span className="tool-group">{button("行内公式", <span className="tool-math">$</span>, () => insert("$", "$", "a_i"))}{button("行间公式", <span className="tool-math">$$</span>, () => insert("\n$$\n", "\n$$\n", "\\sum_{i=1}^{n}a_i"))}</span>
    <span className="tool-group"><ToolbarMenu label="折叠提示框" icon={<Box size={17} />} items={[
      { label: "info 提示框", swatch: "info", action: () => insert("\n::::info[提示信息]\n", "\n::::\n", "提示内容") },
      { label: "info 提示框（展开）", swatch: "info", action: () => insert("\n::::info[提示信息]{open}\n", "\n::::\n", "提示内容") },
      { label: "success 成功框", swatch: "success", action: () => insert("\n::::success[解题成功]\n", "\n::::\n", "成功内容") },
      { label: "warning 警告框", swatch: "warning", action: () => insert("\n::::warning[警告注意]\n", "\n::::\n", "注意事项") },
      { label: "error 错误框", swatch: "error", action: () => insert("\n::::error[常见错误]\n", "\n::::\n", "错误说明") },
      { label: "自定义折叠框", swatch: "custom", action: () => insert("\n::::custom[自定义标题 $x_i$]\n", "\n::::\n", "正文可包含公式与其他折叠框") },
    ]} />{button("表格", <Table2 size={17} />, () => insert("\n| 项目 | 说明 |\n|:---|:---|\n| ", " | 内容 |\n", "数据"))}{button("题记", <Quote size={17} />, () => insert("\n:::epigraph\n", "\n:::\n", "千里之行，始于足下。"))}<ToolbarMenu label="文字对齐" icon={<AlignLeft size={17} />} items={[
      { label: "左对齐", action: () => insert("\n:::align{left}\n", "\n:::\n", "文字内容") },
      { label: "居中对齐", action: () => insert("\n:::align{center}\n", "\n:::\n", "文字内容") },
      { label: "右对齐", action: () => insert("\n:::align{right}\n", "\n:::\n", "文字内容") },
    ]} /></span>
    <span className="tool-group">{button("链接", <Link2 size={17} />, () => insert("[", "](https://example.com)", "链接文字"))}{button("图片", <Image size={17} />, () => insert("![", "](https://example.com/image.png)", "图片描述"))}</span>
    <span className="tool-group">{button("无序列表", <List size={17} />, () => insert("\n- ", "\n", "列表项"))}{button("有序列表", <ListOrdered size={17} />, () => insert("\n1. ", "\n", "列表项"))}{button("任务列表", <ListChecks size={17} />, () => insert("\n- [ ] ", "\n", "待办事项"))}{button("分隔线", <Minus size={17} />, () => insert("\n\n---\n\n", "", ""))}</span>
    <span className="tool-group">{button("导入 Markdown 文件", <FileInput size={17} />, onImport)}{button("下载 Markdown 文件", <Download size={17} />, onExport)}</span>
    <span className="tool-group tool-layout">{button("双栏", <Columns2 size={17} />, () => onView("split"), { pressed: view === "split" })}{button("只看 Markdown", <PanelLeft size={17} />, () => onView("source"), { pressed: view === "source" })}{button("只看预览", <PanelRight size={17} />, () => onView("preview"), { pressed: view === "preview" })}</span>
    <button type="button" className="tool-button tool-fullscreen" aria-label={fullscreen ? "退出全屏编辑" : "全屏编辑"} aria-pressed={fullscreen} title={fullscreen ? "退出全屏（Esc）" : "全屏编辑"} onClick={onFullscreen}>{fullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}{fullscreen ? "退出全屏" : "全屏"}</button>
  </div>;
}
