import React, { useState } from "react";
import { api } from "../api.js";
import { useToast } from "./ToastHost.jsx";

export function ImportDrawer({ friendId, target, onClose, onApplied }) {
  const toast = useToast();
  const [list, setList] = useState(target === "wishlist" ? "wishlist" : "collection");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function runPreview() {
    setBusy(true);
    try {
      const data = await api.previewImport({ list: text, target: list, friendId });
      setPreview(data);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  async function loadFromUrl() {
    if (!url.trim()) return;
    setBusy(true);
    try {
      const data = await api.importDeckFromUrl(url.trim());
      const lines = (data.cards || []).map((c) => `${c.qty} ${c.cardName}`).join("\n");
      setText(lines);
      const next = await api.previewImport({ list: lines, target: list, friendId });
      setPreview(next);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  async function apply() {
    if (!preview) return;
    setBusy(true);
    try {
      const result = await api.applyImport({ rows: preview.rows, target: list, friendId });
      const n = preview.rows.filter((r) => r.kind !== "unk").length;
      toast(`${n} cards imported into ${list}`, "var(--green)", async () => {
        const replace = list === "wishlist" ? api.replaceWishlist : api.replaceCollection;
        const cards = await replace(friendId, result.previous);
        onApplied?.(list, cards);
      });
      onApplied?.(list, result.cards);
      onClose();
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  const applyN = preview ? preview.rows.filter((r) => r.kind !== "unk").length : 0;

  return (
    <>
      <div className="be-drawer-scrim" onClick={onClose} />
      <aside className="be-drawer be-drawer--import" role="dialog" aria-label="Import list">
        <div className="be-drawer__head">
          <div className="be-drawer__title">Import list</div>
          <button type="button" className="be-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="be-drawer__body">
          <div className="be-seg">
            <button type="button" className={list === "collection" ? "is-on" : ""} onClick={() => setList("collection")}>
              Into collection
            </button>
            <button type="button" className={list === "wishlist" ? "is-on" : ""} onClick={() => setList("wishlist")}>
              Into wishlist
            </button>
          </div>
          <p className="be-copy">
            Paste any decklist or export: Archidekt, Moxfield, ManaBox, Deckbox CSV. One card per line, quantity first.
            Nothing is saved until you confirm the preview.
          </p>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setPreview(null);
            }}
            placeholder={"4 Lightning Bolt\n1 Sol Ring (CMM) 464\n2 Rhystic Study"}
          />
          <button type="button" className="be-btn be-btn--outline" onClick={runPreview} disabled={busy || !text.trim()}>
            {busy ? "Working…" : "Preview changes"}
          </button>
          <div className="be-archidekt">
            <label>Archidekt or Moxfield URL</label>
            <div className="be-archidekt__row">
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="archidekt.com/decks/… or moxfield.com/decks/…"
              />
              <button type="button" className="be-btn be-btn--outline" onClick={loadFromUrl} disabled={busy || !url.trim()}>
                Load
              </button>
            </div>
          </div>
          {preview && (
            <>
              <div className="be-import-preview">
                <div className="be-import-preview__sum">
                  <span style={{ color: "var(--green)" }}>+{preview.summary.new} new</span>
                  <span style={{ color: "var(--gold)" }}>↑{preview.summary.updated} updated</span>
                  <span style={{ color: "var(--red)" }}>?{preview.summary.unknown} unknown</span>
                </div>
                {preview.rows.map((r, i) => (
                  <div key={i} className="be-import-preview__row">
                    <span style={{ color: r.color, width: 14 }}>{r.sym}</span>
                    <span style={{ flex: 1 }}>
                      {r.qty}× {r.name}
                    </span>
                    <span className="be-muted">{r.note}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="be-btn be-btn--gold" onClick={apply} disabled={!applyN || busy}>
                Apply {applyN} changes
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
