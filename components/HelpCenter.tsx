"use client";

import { useEffect, useRef, useState } from "react";
import type { HelpContent } from "@/lib/help-content";

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function clearMarks(el: Element) {
  el.querySelectorAll("mark").forEach((m) => {
    m.replaceWith(document.createTextNode(m.textContent ?? ""));
  });
  (el as HTMLElement).normalize();
}

function highlight(el: Element | null, term: string) {
  if (!el || !term) return;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const nterm = normalize(term);
  nodes.forEach((node) => {
    const text = node.nodeValue ?? "";
    const ntext = normalize(text);
    let idx = ntext.indexOf(nterm);
    if (idx === -1) return;
    const frag = document.createDocumentFragment();
    let last = 0;
    while (idx !== -1) {
      frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(idx, idx + term.length);
      frag.appendChild(mark);
      last = idx + term.length;
      idx = ntext.indexOf(nterm, last);
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode?.replaceChild(frag, node);
  });
}

function run(root: HTMLElement, q: string) {
  const topics = Array.from(root.querySelectorAll<HTMLDetailsElement>(".topic"));
  const sections = Array.from(root.querySelectorAll<HTMLElement>("[data-section]"));
  const noresults = root.querySelector<HTMLElement>("#noresults");
  const query = normalize(q.trim());
  let anyVisible = false;

  topics.forEach((t) => {
    const summaryText = normalize(t.querySelector("summary")?.textContent ?? "");
    const bodyText = normalize(t.querySelector(".topic-body")?.textContent ?? "");
    const keywords = normalize(t.dataset.keywords ?? "");
    const match = !query || summaryText.includes(query) || bodyText.includes(query) || keywords.includes(query);

    const summary = t.querySelector("summary");
    const body = t.querySelector(".topic-body");
    if (summary) clearMarks(summary);
    if (body) clearMarks(body);

    if (match) {
      t.classList.remove("hidden");
      anyVisible = true;
      if (query) {
        t.open = true;
        highlight(t.querySelector("summary .summary-left span:last-child"), q.trim());
        highlight(body, q.trim());
      } else {
        t.open = false;
      }
    } else {
      t.classList.add("hidden");
      t.open = false;
    }
  });

  sections.forEach((sec) => {
    const visible = sec.querySelectorAll(".topic:not(.hidden)").length;
    sec.classList.toggle("hidden", visible === 0);
  });

  if (noresults) noresults.style.display = anyVisible ? "none" : "block";
}

export default function HelpCenter({ content }: { content: HelpContent }) {
  const ref = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (ref.current) run(ref.current, q);
  }, [q]);

  return (
    <div className="help-center">
      <div className="help-search">
        <svg className="search-icon" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={content.placeholder}
          autoComplete="off"
          aria-label="Buscar en la ayuda"
        />
      </div>
      <div className="chips">
        {content.chips.map((c) => (
          <button
            key={c}
            type="button"
            className="chip"
            onClick={() => {
              setQ(c);
              ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            {c}
          </button>
        ))}
      </div>
      <div ref={ref} dangerouslySetInnerHTML={{ __html: content.html }} />
    </div>
  );
}
