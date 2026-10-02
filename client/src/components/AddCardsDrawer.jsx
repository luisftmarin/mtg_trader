import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { formatEur, matchKey } from "../lib/format.js";
import { useCardData } from "./CardPreview.jsx";
import { LangSelect, QtyStepper } from "./QtyStepper.jsx";
import { useToast } from "./ToastHost.jsx";

export function AddCardsDrawer({ friendId, target, onClose, onAdded }) {
  const toast = useToast();
  const [list, setList] = useState(target === "wishlist" ? "wishlist" : "collection");
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [sugIdx, setSugIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [pick, setPick] = useState(null);
  const [qty, setQty] = useState(1);
  const [lang, setLang] = useState("EN");
  const [recent, setRecent] = useState([]);
  const seq = useRef(0);
  const timer = useRef(null);
  const cards = useCardData(pick ? [pick] : []);
  const meta = pick ? cards[matchKey(pick)] : null;

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (query.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const n = ++seq.current;
    timer.current = setTimeout(async () => {
      try {
        const { data } = await api.autocompleteCards(query.trim());
        if (n === seq.current) setSuggestions((data || []).slice(0, 8));
      } catch {
        if (n === seq.current) setSuggestions([]);
      }
      if (n === seq.current) setLoading(false);
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query]);

  function choose(name) {
    setPick(name);
    setQuery(name);
    setSuggestions([]);
    setSugIdx(-1);
  }

  function onKey(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSugIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSugIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (sugIdx >= 0 && suggestions[sugIdx]) choose(suggestions[sugIdx]);
      else if (pick) commit();
      else if (suggestions[0]) choose(suggestions[0]);
    } else if (e.key === "Escape") {
      setSuggestions([]);
    }
  }

  async function commit() {
    if (!pick) return;
    const add = list === "wishlist" ? api.addWishlistCard : api.addCollectionCard;
    try {
      const cardsNow = await add(friendId, { cardName: pick, qty, lang });
      const entry = { name: pick, qty, lang, target: list };
      setRecent((r) => [entry, ...r].slice(0, 4));
      toast(`${qty}× ${pick} added to ${list}`, "var(--green)", () => undo(entry));
      setQuery("");
      setPick(null);
      setQty(1);
      onAdded?.(list, cardsNow);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
  }

  async function undo(entry) {
    try {
      const data = await api.getFriend(friendId);
      const key = matchKey(entry.name);
      const rows = (entry.target === "wishlist" ? data.wishlist : data.collection).map((c) => ({
        cardName: c.card_name,
        qty: c.match_key === key ? Math.max(0, c.qty - entry.qty) : c.qty,
        lang: c.lang,
      })).filter((c) => c.qty > 0);
      const replace = entry.target === "wishlist" ? api.replaceWishlist : api.replaceCollection;
      const cardsNow = await replace(friendId, rows);
      setRecent((r) => r.filter((x) => x !== entry));
      onAdded?.(entry.target, cardsNow);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
  }

  return (
    <>
      <div className="be-drawer-scrim" onClick={onClose} />
      <aside className="be-drawer be-drawer--add" role="dialog" aria-label="Add cards">
        <div className="be-drawer__head">
          <div className="be-drawer__title">Add cards</div>
          <button type="button" className="be-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="be-drawer__body">
          <div className="be-seg">
            <button type="button" className={list === "collection" ? "is-on" : ""} onClick={() => setList("collection")}>
              Collection
            </button>
            <button type="button" className={list === "wishlist" ? "is-on" : ""} onClick={() => setList("wishlist")}>
              Wishlist
            </button>
          </div>
          <div className="be-suggest">
            <label>Card name</label>
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPick(null);
                setSugIdx(-1);
              }}
              onKeyDown={onKey}
              placeholder="Start typing… e.g. rhy stu"
            />
            {loading && <span className="be-spin" />}
            {suggestions.length > 0 && (
              <div role="listbox" className="be-suggest__list">
                {suggestions.map((name, i) => (
                  <button
                    key={name}
                    type="button"
                    role="option"
                    className={i === sugIdx ? "is-active" : ""}
                    onMouseEnter={() => setSugIdx(i)}
                    onClick={() => choose(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div className="be-hint">Scryfall autocomplete · ↑↓ to choose · Enter to add</div>
          </div>
          <div className="be-add-preview">
            <div className="be-add-preview__art">
              {meta?.image_normal ? <img src={meta.image_normal} alt="" /> : <span>Pick a card to preview</span>}
            </div>
            <div className="be-add-preview__meta">
              <div className="be-add-preview__name">{pick || ""}</div>
              <div className="be-muted">
                {meta ? [meta.type_line, meta.set_name].filter(Boolean).join(" · ") : ""}
              </div>
              <div className="be-price">{meta?.eur != null ? formatEur(meta.eur) : ""}</div>
              <div className="be-add-preview__row">
                <div>
                  <label>Qty</label>
                  <QtyStepper value={qty} onDec={() => setQty((q) => Math.max(1, q - 1))} onInc={() => setQty((q) => q + 1)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label>Language</label>
                  <LangSelect value={lang} onChange={setLang} />
                </div>
              </div>
              <button type="button" className="be-btn be-btn--gold" disabled={!pick} onClick={commit} style={{ opacity: pick ? 1 : 0.5 }}>
                Add to {list}
              </button>
            </div>
          </div>
          {recent.length > 0 && (
            <div>
              <div className="be-eyebrow">Just added</div>
              {recent.map((r, i) => (
                <div key={i} className="be-recent">
                  <span style={{ color: "var(--green)" }}>✓</span>
                  <span style={{ flex: 1 }}>
                    {r.qty}× {r.name} <span className="be-muted">· {r.lang} · {r.target}</span>
                  </span>
                  <button type="button" className="be-text-gold" onClick={() => undo(r)}>
                    Undo
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
