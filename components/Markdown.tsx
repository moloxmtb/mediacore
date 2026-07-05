"use client";

import ReactMarkdown from "react-markdown";

/** Renderiza Markdown (negritas, listas, títulos, enlaces) en un bloque
 *  con la tipografía del panel. Enlaces se abren en pestaña nueva. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
