import React, { useRef, useState } from "react";
import { api } from "../api.js";
import { useToast } from "./ToastHost.jsx";

export function ImportDrawer({ friendId, target, onClose, onApplied }) {
  const toast = useToast();
  const fileRef = useRef(null);
  const [list, setList] = useState(target === "wishlist" ? "wishlist" : "collection");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [format, setFormat] = useState("archidekt");
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  async function previewList(listText, csvFormat = format) {
    const data = await api.previewImport({ list: listText, target: list, friendId, format: csvFormat });
    setPreview(data);
  }

  async function runPreview() {
    if (!text.trim()) return;
    setBusy(true);
    try {
      await previewList(text);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  async function loadFile(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast("That file is too large (max 5 MB).", "var(--red)");
      return;
    }
    setBusy(true);
    try {
      const content = await file.text();
      setFileName(file.name);
      setText(content);
      await previewList(content);
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
      setFileName("");
      await previewList(lines);
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
      const n = preview.rows.filter((r) => r.kind !== "unk" && r.kind !== "del").length;
      toast(`Replaced ${list} with ${n} cards`, "var(--green)", async () => {
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

  const applyN = preview ? preview.rows.filter((r) => r.kind !== "unk" && r.kind !== "del").length : 0;
  const previewRows = preview
    ? preview.rows.filter((r) => r.kind !== "keep")
    : [];
  const kept = preview?.summary?.kept || 0;

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
            <button
              type="button"
              className={list === "collection" ? "is-on" : ""}
              onClick={() => {
                setList("collection");
                setPreview(null);
              }}
            >
              Into collection
            </button>
            <button
              type="button"
              className={list === "wishlist" ? "is-on" : ""}
              onClick={() => {
                setList("wishlist");
                setPreview(null);
              }}
            >
              Into wishlist
            </button>
          </div>
          <p className="be-copy">
            Paste a decklist, or load a CSV. Pick the program that exported the file so Quantity and Name land in
            the right columns. This replaces the whole {list === "wishlist" ? "wishlist" : "collection"} — cards not
            in the file are removed. Use Add cards to append. Nothing is saved until you confirm the preview.
          </p>
          <div className="be-archidekt">
            <label htmlFor="csv-format">CSV export format</label>
            <select
              id="csv-format"
              className="be-select"
              value={format}
              onChange={(e) => {
                const next = e.target.value;
                setFormat(next);
                setPreview(null);
                if (text.trim()) {
                  setBusy(true);
                  previewList(text, next)
                    .catch((err) => toast(err.message, "var(--red)"))
                    .finally(() => setBusy(false));
                }
              }}
            >
              <option value="auto">Auto-detect</option>
              <option value="archidekt">Archidekt</option>
              <option value="moxfield">Moxfield</option>
              <option value="manabox">ManaBox</option>
              <option value="deckbox">Deckbox</option>
              <option value="names">Names only</option>
            </select>
          </div>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFileName("");
              setPreview(null);
            }}
            placeholder={"4 Lightning Bolt\n1 Sol Ring (CMM) 464\n2 Rhystic Study"}
          />
          <div className="be-archidekt__row">
            <button type="button" className="be-btn be-btn--outline" onClick={runPreview} disabled={busy || !text.trim()}>
              {busy ? "Working…" : "Preview changes"}
            </button>
            <input ref={fileRef} type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={loadFile} />
            <button type="button" className="be-btn be-btn--outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              Load CSV
            </button>
          </div>
          {fileName && <p className="be-muted">{fileName}</p>}
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
                  <span style={{ color: "var(--gold)" }}>↑{preview.summary.updated} qty</span>
                  <span style={{ color: "var(--red)" }}>−{preview.summary.removed || 0} removed</span>
                  <span style={{ color: "var(--red)" }}>?{preview.summary.unknown} unknown</span>
                </div>
                {kept > 0 && <div className="be-import-preview__row be-muted">{kept} unchanged</div>}
                {previewRows.map((r, i) => (
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
                Replace {list} with {applyN} cards
              </button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
