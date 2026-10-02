import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

const ToastContext = createContext(null);
const LIFE_MS = 4200;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const n = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((text, color = "var(--gold)", undo) => {
    const id = ++n.current;
    setToasts((list) => [...list, { id, text, color, undo }]);
    window.setTimeout(() => dismiss(id), LIFE_MS);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="be-toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="be-toast" style={{ borderLeftColor: t.color }}>
            {t.text}
            {t.undo && (
              <button
                type="button"
                className="be-toast__undo"
                onClick={() => {
                  t.undo();
                  dismiss(t.id);
                }}
              >
                Undo
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider.");
  return ctx;
}
