import { createContext, useContext, useState, type ReactNode } from "react";
import { explainChip, type ChipExplanation } from "./chipExplain.ts";

const ChipExplainContext = createContext<(label: string) => void>(() => {});

export function useChipExplain(): (label: string) => void {
  return useContext(ChipExplainContext);
}

export function ChipExplainProvider({ children }: { children: ReactNode }) {
  const [explanation, setExplanation] = useState<ChipExplanation | null>(null);

  return (
    <ChipExplainContext.Provider value={(label) => setExplanation(explainChip(label))}>
      {children}
      {explanation ? (
        <div className="modal-backdrop" onClick={() => setExplanation(null)}>
          <div
            className="chip-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chip-explain-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="chip-explain-title">{explanation.title}</h2>
            <p>{explanation.definition}</p>
            {explanation.detail ? (
              <p className="chip-modal-detail">{explanation.detail}</p>
            ) : null}
            <button
              type="button"
              className="action-btn"
              onClick={() => setExplanation(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </ChipExplainContext.Provider>
  );
}
