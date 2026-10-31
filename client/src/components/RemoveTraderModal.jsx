import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useData } from "../context.jsx";
import { useToast } from "./ToastHost.jsx";

export function RemoveTraderModal({ friend, onClose, onRemoved }) {
  const { refreshAll } = useData();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function remove() {
    setBusy(true);
    try {
      await api.deleteFriend(friend.id);
      toast(`${friend.name} removed from the roster`, "var(--green)");
      await refreshAll();
      onRemoved?.();
      onClose();
    } catch (err) {
      toast(err.message, "var(--red)");
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} data-testid="remove-trader-modal">
        <h2 className="panel__title" style={{ marginBottom: 10 }}>
          Remove {friend.name} from the roster?
        </h2>
        <div className="be-danger-note">
          Admin warning: this deletes {friend.name}’s account, their collection ({friend.collection_count ?? 0} cards),
          wishlist ({friend.wishlist_count ?? 0} cards), and any trades they’re part of. This cannot be undone.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="be-btn be-btn--outline" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="be-btn be-btn--danger" onClick={remove} disabled={busy} data-testid="remove-trader-confirm">
            {busy ? "Removing…" : "Remove trader"}
          </button>
        </div>
      </div>
    </div>
  );
}
