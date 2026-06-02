import React from "react";

/* ============================================================
   Markdown — a small, safe, dependency-free renderer.
   Returns React nodes (never dangerouslySetInnerHTML).
   Supports: # headings, - / * / 1. lists (one nesting level),
   > blockquotes, ``` fences, --- rules, paragraphs, and inline
   **bold**, *italic*, `code`, ~~strike~~, [text](url), bare URLs.
   Tuned for the talking-head reaction-prep notes format.
   ============================================================ */

let keySeed = 0;
const k = () => `md-${keySeed++}`;

// ---- inline ---------------------------------------------------------------

const URL_RE = /(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/g;

function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;

  // Ordered scan for the earliest inline token.
  const patterns: { re: RegExp; render: (m: RegExpExecArray) => React.ReactNode }[] = [
    { re: /\*\*([^*]+)\*\*/, render: (m) => <strong key={k()}>{inline(m[1])}</strong> },
    { re: /__([^_]+)__/, render: (m) => <strong key={k()}>{inline(m[1])}</strong> },
    { re: /~~([^~]+)~~/, render: (m) => <s key={k()}>{inline(m[1])}</s> },
    { re: /`([^`]+)`/, render: (m) => <code key={k()} className="md-code">{m[1]}</code> },
    { re: /\*([^*\n]+)\*/, render: (m) => <em key={k()}>{inline(m[1])}</em> },
    { re: /(?<![\w])_([^_\n]+)_(?![\w])/, render: (m) => <em key={k()}>{inline(m[1])}</em> },
    {
      re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/,
      render: (m) => (
        <a key={k()} href={m[2]} target="_blank" rel="noopener noreferrer" className="md-link">
          {inline(m[1])}
        </a>
      ),
    },
  ];

  while (rest.length > 0) {
    let best: { idx: number; len: number; node: React.ReactNode } | null = null;

    for (const { re, render } of patterns) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.idx)) {
        best = { idx: m.index, len: m[0].length, node: render(m) };
      }
    }

    // Bare URLs compete for earliest position too.
    URL_RE.lastIndex = 0;
    const u = URL_RE.exec(rest);
    if (u && (best === null || u.index < best.idx)) {
      const url = u[0];
      let label = url.replace(/^https?:\/\/(www\.)?/, "");
      if (label.length > 48) label = label.slice(0, 46) + "…";
      best = {
        idx: u.index,
        len: url.length,
        node: (
          <a key={k()} href={url} target="_blank" rel="noopener noreferrer" className="md-link md-link--url">
            {label}
          </a>
        ),
      };
    }

    if (best === null) {
      nodes.push(rest);
      break;
    }
    if (best.idx > 0) nodes.push(rest.slice(0, best.idx));
    nodes.push(best.node);
    rest = rest.slice(best.idx + best.len);
  }

  return nodes;
}

// ---- blocks ---------------------------------------------------------------

type ListItem = { text: string; indented: boolean };

function renderList(items: ListItem[], ordered: boolean): React.ReactNode {
  // Group into top-level items, attaching indented lines as nested sub-lists.
  const top: { text: string; children: string[] }[] = [];
  for (const it of items) {
    if (it.indented && top.length > 0) {
      top[top.length - 1].children.push(it.text);
    } else {
      top.push({ text: it.text, children: [] });
    }
  }

  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag key={k()} className={ordered ? "md-ol" : "md-ul"}>
      {top.map((item) => (
        <li key={k()} className="md-li">
          <span>{inline(item.text)}</span>
          {item.children.length > 0 && (
            <ul className="md-ul md-ul--nested">
              {item.children.map((c) => (
                <li key={k()} className="md-li">
                  {inline(c)}
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </Tag>
  );
}

export function Markdown({ text }: { text: string }) {
  keySeed = 0;
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: React.ReactNode[] = [];

  let i = 0;
  let para: string[] = [];

  const flushPara = () => {
    if (para.length === 0) return;
    out.push(
      <p key={k()} className="md-p">
        {inline(para.join(" "))}
      </p>,
    );
    para = [];
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, "");

    // blank line
    if (line.trim() === "") {
      flushPara();
      i++;
      continue;
    }

    // fenced code
    const fence = line.match(/^```(.*)$/);
    if (fence) {
      flushPara();
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) {
        buf.push(lines[i]);
        i++;
      }
      i++; // closing fence
      out.push(
        <pre key={k()} className="md-pre">
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    // horizontal rule
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushPara();
      out.push(<hr key={k()} className="md-hr" />);
      i++;
      continue;
    }

    // heading
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara();
      const level = Math.min(h[1].length, 4);
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4";
      out.push(
        <Tag key={k()} className={`md-h md-h${level}`}>
          {inline(h[2])}
        </Tag>,
      );
      i++;
      continue;
    }

    // blockquote (consume consecutive)
    if (/^\s*>\s?/.test(line)) {
      flushPara();
      const buf: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(
        <blockquote key={k()} className="md-quote">
          {inline(buf.join(" "))}
        </blockquote>,
      );
      continue;
    }

    // unordered list (consume consecutive list lines)
    if (/^(\s*)[-*+]\s+/.test(line)) {
      flushPara();
      const items: ListItem[] = [];
      while (i < lines.length && /^(\s*)[-*+]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)[-*+]\s+(.*)$/)!;
        items.push({ text: m[2], indented: m[1].length >= 2 });
        i++;
      }
      out.push(renderList(items, false));
      continue;
    }

    // ordered list
    if (/^(\s*)\d+[.)]\s+/.test(line)) {
      flushPara();
      const items: ListItem[] = [];
      while (i < lines.length && /^(\s*)\d+[.)]\s+/.test(lines[i])) {
        const m = lines[i].match(/^(\s*)\d+[.)]\s+(.*)$/)!;
        items.push({ text: m[2], indented: m[1].length >= 3 });
        i++;
      }
      out.push(renderList(items, true));
      continue;
    }

    // paragraph accumulation
    para.push(line.trim());
    i++;
  }
  flushPara();

  return <div className="md">{out}</div>;
}

export default Markdown;
