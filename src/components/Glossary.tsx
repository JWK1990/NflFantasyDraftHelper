import type { ReactNode } from "react";
import { GLOSSARY_SECTIONS } from "./glossaryContent.ts";

export function GlossaryMenu({ children }: { children?: ReactNode }) {
  return (
    <details className="menu glossary-menu">
      <summary
        className="icon-btn"
        style={{ listStyle: "none", display: "grid", placeItems: "center" }}
      >
        Glossary
      </summary>
      <div className="menu-panel glossary-panel">
        <p className="glossary-lead">
          Quick reference for chips and terms. Tap a chip on the board for a
          short definition and extra detail. Tags are scouting notes only —
          they do not change the ranking.
        </p>
        {GLOSSARY_SECTIONS.map((section) => (
          <section key={section.title} className="glossary-section">
            <h3>{section.title}</h3>
            <dl>
              {section.entries.map((entry) => (
                <div key={entry.term} className="glossary-item">
                  <dt>{entry.term}</dt>
                  <dd>{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        {children}
      </div>
    </details>
  );
}
