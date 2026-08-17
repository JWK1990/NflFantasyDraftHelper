interface ToastProps {
  message: string;
  warning?: boolean;
  onUndo?: () => void;
}

export function Toast({ message, warning, onUndo }: ToastProps) {
  return (
    <div className={`toast${warning ? " warn" : ""}`} role="status">
      <span>{message}</span>
      {onUndo ? (
        <button type="button" onClick={onUndo}>
          Undo
        </button>
      ) : null}
    </div>
  );
}
