"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkDirective from "remark-directive";
import rehypeKatex from "rehype-katex";
import { visit } from "unist-util-visit";
import hljs from "highlight.js/lib/common";
// rehype-katex 7 renders with KaTeX 0.16; the CSS must use the same version.
import "katex/dist/katex.min.css";
import "highlight.js/styles/github.css";

type TreeNode = { type: string; name?: string; attributes?: Record<string, string | null>; children?: TreeNode[]; value?: string; data?: Record<string, unknown> };

function luoguDirectives() {
  return (tree: TreeNode) => {
    const top = tree.children || [];
    for (let i = 0; i < top.length - 1; i++) {
      if (top[i].type === "leafDirective" && top[i].name === "cute-table" && top[i + 1].type === "table") {
        top[i + 1].data = { ...top[i + 1].data, hProperties: { className: "cute-table" } };
        top.splice(i, 1);
      }
    }
    visit(tree as never, (node: TreeNode) => {
      if (node.type !== "containerDirective") return;
      const name = node.name || "";
      const data = node.data ||= {};
      const children = node.children ||= [];
      if (name === "align") {
        const position = node.attributes?.center !== undefined ? "center" : node.attributes?.right !== undefined ? "right" : node.attributes?.left !== undefined ? "left" : "";
        if (position) { data.hName = "div"; data.hProperties = { className: `md-align-${position}` }; }
      } else if (name === "epigraph") {
        data.hName = "blockquote"; data.hProperties = { className: "md-epigraph" };
        const label = children[0]?.data?.directiveLabel ? children.shift() : null;
        if (label?.children?.length) children.push({ type: "paragraph", children: label.children, data: { hName: "cite" } });
      } else if (["info", "success", "warning", "error", "custom"].includes(name)) {
        data.hName = "details";
        data.hProperties = { className: `md-container ${name}`, open: node.attributes?.open !== undefined };
        const label = children[0]?.data?.directiveLabel ? children[0] : null;
        if (label) label.data = { ...label.data, hName: "summary" };
        else children.unshift({ type: "paragraph", children: [{ type: "text", value: ({ info: "提示", success: "完成", warning: "注意", error: "错误", custom: "展开查看" } as Record<string, string>)[name] }], data: { hName: "summary" } });
      }
    });
  };
}

type HastNode = { type: string; tagName?: string; value?: string; properties?: Record<string, unknown>; children?: HastNode[] };
function tableMerges() {
  return (tree: HastNode) => {
    visit(tree as never, "element", (table: HastNode) => {
      if (table.tagName !== "table") return;
      const rows = (table.children || []).flatMap(section => section.children || []).filter(row => row.tagName === "tr");
      const grid: HastNode[][] = [];
      const read = (cell: HastNode): string => (cell.children || []).map(child => child.type === "text" ? child.value || "" : "").join("").trim();
      rows.forEach((row, rowIndex) => {
        const cells = (row.children || []).filter(cell => cell.tagName === "td" || cell.tagName === "th");
        grid[rowIndex] = [];
        cells.forEach((cell, col) => {
          const marker = read(cell);
          const origin = marker === "^" ? grid[rowIndex - 1]?.[col] : marker === "<" ? grid[rowIndex]?.[col - 1] : undefined;
          if (origin) {
            origin.properties ||= {};
            const key = marker === "^" ? "rowSpan" : "colSpan";
            origin.properties[key] = Number(origin.properties[key] || 1) + 1;
            row.children = row.children?.filter(item => item !== cell);
            grid[rowIndex][col] = origin;
          } else grid[rowIndex][col] = cell;
        });
      });
    });
  };
}

function CodeBlock({ children, node }: { children?: React.ReactNode; node?: { children?: Array<{ data?: { meta?: string } }> } }) {
  const child = React.Children.toArray(children)[0];
  if (!React.isValidElement(child)) return <pre>{children}</pre>;
  const props = child.props as { children?: React.ReactNode; className?: string; node?: { data?: { meta?: string } } };
  const raw = String(props.children ?? "").replace(/\n$/, "");
  const langName = props.className?.match(/language-([^\s]+)/)?.[1] || "cpp";
  const lang = langName === "c++" ? "cpp" : langName === "py" ? "python" : langName;
  const meta = node?.children?.[0]?.data?.meta || props.node?.data?.meta || "";
  const numbered = /\bline-numbers\b/.test(meta);
  const range = meta.match(/\blines=(\d+)-(\d+)\b/);
  const highlighted = new Set<number>();
  if (range) for (let i = Number(range[1]); i <= Math.min(Number(range[2]), Number(range[1]) + 999); i++) highlighted.add(i);
  const lines = raw.split("\n");
  const html = !hljs.getLanguage(lang) ? lines.map(line => escapeHtml(line)) : lines.map(line => hljs.highlight(line, { language: lang, ignoreIllegals: true }).value);
  return <div className="code-block"><div className="code-toolbar"><span>{langName === "plaintext" ? "TEXT" : langName.toUpperCase()}</span><span>{lines.length} 行</span></div><pre className="code-lines"><code>{html.map((line, i) => <span key={i} className={`code-line${numbered ? " numbered" : ""}${highlighted.has(i + 1) ? " highlighted" : ""}`} dangerouslySetInnerHTML={{ __html: line || " " }} />)}</code></pre></div>;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function Markdown({ content }: { content: string }) {
  const normalized = content.replace(/^\s*\$\$([^\n]+)\$\$\s*$/gm, (_, math: string) => `$$\n${math}\n$$`);
  return <div className="markdown-body"><ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath, remarkDirective, luoguDirectives]}
    rehypePlugins={[tableMerges, [rehypeKatex, { strict: false, trust: false }]]}
    components={{
      pre: ({ node, children }) => <CodeBlock node={node as never}>{children}</CodeBlock>,
      a: ({ href, children }) => <a href={href} target={href?.startsWith("http") ? "_blank" : undefined} rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}>{children}</a>,
    }}
  >{normalized}</ReactMarkdown></div>;
}
