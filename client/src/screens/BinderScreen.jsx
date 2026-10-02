import React, { useEffect, useMemo, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { CardName } from "../components/CardName.jsx";
import { LangSelect, ManaDots, QtyStepper } from "../components/QtyStepper.jsx";
import { useToast } from "../components/ToastHost.jsx";
import { formatEur, manaDots, matchKey } from "../lib/format.js";
import { useCardData } from "../components/CardPreview.jsx";
import { useAuth, useData } from "../context.jsx";

function mapRows(list) {
  return (list || []).map((c) => ({
    id: c.id,
    cardName: c.card_name,
    qty: c.qty,
    lang: c.lang || "EN",
    match_key: c.match_key,
  }));
}

export function BinderScreen() {
  const { identity } = useAuth();
  const { matches, refreshAll } = useData();
  const { openAdd, openImport } = useOutletContext();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "wishlist" ? "wishlist" : "collection";
  const view = params.get("view") === "grid" ? "grid" : "list";
  const [filter, setFilter] = useState("");
  const [collection, setCollection] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await api.getFriend(identity.id);
    setCollection(mapRows(data.collection));
    setWishlist(mapRows(data.wishlist));
    setLoading(false);
  }

  useEffect(() => {
    load().catch((err) => toast(err.message, "var(--red)"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity.id]);

  const rows = tab === "wishlist" ? wishlist : collection;
  const setRows = tab === "wishlist" ? setWishlist : setCollection;
  const names = useMemo(
    () => [...collection, ...wishlist].map((r) => r.cardName),
    [collection, wishlist]
  );
  const cards = useCardData(names);
  const q = filter.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.cardName.toLowerCase().includes(q));

  const collEur = useMemo(() => sumEur(collection, cards), [collection, cards]);
  const wishEur = useMemo(() => sumEur(wishlist, cards), [wishlist, cards]);
  const collCount = collection.reduce((a, c) => a + c.qty, 0);
  const wishCount = wishlist.reduce((a, c) => a + c.qty, 0);

  const wantTags = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      if (m.owner !== identity.name) continue;
      const list = map.get(m.cardName) || [];
      if (!list.includes(m.seeker)) list.push(m.seeker);
      map.set(m.cardName, list);
    }
    return map;
  }, [matches, identity.name]);

  const haveTags = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      if (m.seeker !== identity.name) continue;
      map.set(m.cardName, (map.get(m.cardName) || 0) + 1);
    }
    return map;
  }, [matches, identity.name]);

  function setTab(next) {
    params.set("tab", next);
    setParams(params, { replace: true });
  }
  function setView(next) {
    params.set("view", next);
    setParams(params, { replace: true });
  }

  async function patch(row, body) {
    const fn = tab === "wishlist" ? api.patchWishlistCard : api.patchCollectionCard;
    const next = mapRows(await fn(identity.id, row.id, body));
    setRows(next);
    refreshAll();
  }

  async function remove(row) {
    const fn = tab === "wishlist" ? api.deleteWishlistCard : api.deleteCollectionCard;
    const add = tab === "wishlist" ? api.addWishlistCard : api.addCollectionCard;
    const before = rows;
    setRows(rows.filter((r) => r.id !== row.id));
    try {
      await fn(identity.id, row.id);
      toast(`Removed ${row.cardName}`, "var(--red)", async () => {
        const restored = await add(identity.id, { cardName: row.cardName, qty: row.qty, lang: row.lang });
        setRows(mapRows(restored));
        refreshAll();
      });
      refreshAll();
    } catch (err) {
      setRows(before);
      toast(err.message, "var(--red)");
    }
  }

  return (
    <div className="be-page">
      <div className="be-page__head">
        <div>
          <h1>Your binder</h1>
          <div className="be-mono-sub">
            collection {formatEur(collEur)} · wishlist {formatEur(wishEur)}
          </div>
        </div>
        <button type="button" className="be-btn be-btn--outline" onClick={() => openImport(tab)}>
          Import list
        </button>
        <button type="button" className="be-btn be-btn--gold" onClick={() => openAdd(tab)}>
          + Add cards
        </button>
      </div>
      <div className="be-toolbar">
        <div className="be-seg">
          <button type="button" className={tab === "collection" ? "is-on" : ""} onClick={() => setTab("collection")}>
            Collection <span className="be-seg__n">{collCount}</span>
          </button>
          <button type="button" className={tab === "wishlist" ? "is-on" : ""} onClick={() => setTab("wishlist")}>
            Wishlist <span className="be-seg__n">{wishCount}</span>
          </button>
        </div>
        <div className="be-filter">
          <span>⌕</span>
          <input placeholder="Filter this list…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        </div>
        <div className="be-view-toggle">
          <button type="button" className={view === "list" ? "is-on" : ""} aria-label="List view" onClick={() => setView("list")}>
            ☰
          </button>
          <button type="button" className={view === "grid" ? "is-on" : ""} aria-label="Grid view" onClick={() => setView("grid")}>
            ▦
          </button>
        </div>
      </div>

      {loading ? (
        <div className="be-empty">Loading binder…</div>
      ) : view === "grid" ? (
        <div className="be-grid">
          {shown.map((r) => {
            const meta = cards[matchKey(r.cardName)];
            return (
              <div key={r.id} className="be-grid__card">
                {meta?.image_small ? <img src={meta.image_small} alt={r.cardName} /> : <div className="be-grid__ph">{r.cardName}</div>}
                <span className="be-grid__qty">×{r.qty}</span>
                <span className="be-grid__eur">{formatEur((meta?.eur || 0) * r.qty)}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <section className="be-list">
          <div className="be-list__head">
            <span />
            <span>Card</span>
            <span>Set</span>
            <span>Lang</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span style={{ textAlign: "right" }}>Eur</span>
            <span />
          </div>
          {shown.map((r) => {
            const meta = cards[matchKey(r.cardName)];
            let tag = null;
            let tagClass = "";
            if (tab === "collection") {
              const wanters = wantTags.get(r.cardName) || [];
              if (wanters.length) {
                tag = `${wanters.slice(0, 2).join(", ")}${wanters.length > 2 ? ` +${wanters.length - 2}` : ""} want${wanters.length > 1 ? "" : "s"} this`;
                tagClass = "is-gold";
              }
            } else {
              const n = haveTags.get(r.cardName) || 0;
              if (n) {
                tag = `${n} friend${n > 1 ? "s have" : " has"} it`;
                tagClass = "is-green";
              }
            }
            return (
              <div key={r.id} className="be-list__row">
                <ManaDots colors={manaDots(meta?.color_identity)} />
                <div className="be-list__name">
                  <CardName name={r.cardName} />
                  {tag && <span className={`be-tag ${tagClass}`}>{tag}</span>}
                </div>
                <span className="be-list__set">{meta?.set_code || "—"}</span>
                <LangSelect value={r.lang} onChange={(lang) => patch(r, { lang })} />
                <QtyStepper
                  compact
                  value={r.qty}
                  onDec={() => r.qty > 1 && patch(r, { qty: r.qty - 1 })}
                  onInc={() => patch(r, { qty: r.qty + 1 })}
                />
                <span className="be-list__eur">{formatEur((meta?.eur || 0) * r.qty)}</span>
                <button type="button" className="be-remove" aria-label="Remove" onClick={() => remove(r)}>
                  ✕
                </button>
              </div>
            );
          })}
          {!shown.length && (
            <div className="be-empty">
              <div className="be-empty__title">Nothing here yet</div>
              <div>Add cards by name, or paste a list from Archidekt, Moxfield or a spreadsheet.</div>
              <button type="button" className="be-btn be-btn--gold" onClick={() => openAdd(tab)}>
                + Add cards
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function sumEur(list, cards) {
  return list.reduce((sum, r) => sum + (Number(cards[matchKey(r.cardName)]?.eur) || 0) * r.qty, 0);
}
