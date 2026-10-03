import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { CardName } from "../components/CardName.jsx";
import { ManaDots, QtyStepper } from "../components/QtyStepper.jsx";
import { useToast } from "../components/ToastHost.jsx";
import { manaDots, matchKey } from "../lib/format.js";
import { useCardData } from "../components/CardPreview.jsx";
import { useAuth, useData } from "../context.jsx";

function mapRows(list) {
  return (list || []).map((c) => ({
    id: c.id,
    cardName: c.card_name,
    qty: c.qty,
    lang: c.lang || "EN",
    match_key: c.match_key,
    reserved: c.reserved || 0,
  }));
}

export function BinderScreen() {
  const { identity } = useAuth();
  const { matches, refreshAll } = useData();
  const { friendId: friendIdParam } = useParams();
  const navigate = useNavigate();
  const { openAdd, openImport, binderTick } = useOutletContext();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "wishlist" ? "wishlist" : "collection";
  const view = params.get("view") === "grid" ? "grid" : "list";
  const [filter, setFilter] = useState("");
  const [collection, setCollection] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [ownerName, setOwnerName] = useState(identity.name);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const ownerId = friendIdParam ? Number(friendIdParam) : identity.id;
  const isAdminEditing = String(ownerId) !== String(identity.id);
  const forbidden = isAdminEditing && !identity.isAdmin;

  async function load() {
    const data = await api.getFriend(ownerId);
    setOwnerName(data.name);
    setCollection(mapRows(data.collection));
    setWishlist(mapRows(data.wishlist));
    setLoading(false);
  }

  useEffect(() => {
    if (forbidden) return undefined;
    setLoading(true);
    load().catch((err) => toast(err.message, "var(--red)"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerId, forbidden, binderTick]);

  const rows = tab === "wishlist" ? wishlist : collection;
  const setRows = tab === "wishlist" ? setWishlist : setCollection;
  const q = filter.trim().toLowerCase();
  const shown = rows.filter((r) => !q || r.cardName.toLowerCase().includes(q));
  // Only prefetch Scryfall meta in grid view (thumbnails). List view was
  // requesting the whole binder for EUR totals and stalling the page.
  const gridNames = useMemo(
    () => (view === "grid" ? shown.map((r) => r.cardName) : []),
    [view, shown]
  );
  const cards = useCardData(gridNames);
  const collCount = collection.reduce((a, c) => a + c.qty, 0);
  const wishCount = wishlist.reduce((a, c) => a + c.qty, 0);

  const wantTags = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      if (m.owner !== ownerName) continue;
      const list = map.get(m.cardName) || [];
      if (!list.includes(m.seeker)) list.push(m.seeker);
      map.set(m.cardName, list);
    }
    return map;
  }, [matches, ownerName]);

  const haveTags = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      if (m.seeker !== ownerName) continue;
      map.set(m.cardName, (map.get(m.cardName) || 0) + 1);
    }
    return map;
  }, [matches, ownerName]);

  function setTab(next) {
    params.set("tab", next);
    setParams(params, { replace: true });
  }
  function setView(next) {
    params.set("view", next);
    setParams(params, { replace: true });
  }

  if (forbidden) return <Navigate to="/binder" replace />;

  async function patch(row, body) {
    const fn = tab === "wishlist" ? api.patchWishlistCard : api.patchCollectionCard;
    const next = mapRows(await fn(ownerId, row.id, body));
    setRows(next);
    refreshAll();
  }

  async function remove(row) {
    const fn = tab === "wishlist" ? api.deleteWishlistCard : api.deleteCollectionCard;
    const add = tab === "wishlist" ? api.addWishlistCard : api.addCollectionCard;
    const before = rows;
    setRows(rows.filter((r) => r.id !== row.id));
    try {
      await fn(ownerId, row.id);
      toast(`Removed ${row.cardName}`, "var(--red)", async () => {
        const restored = await add(ownerId, { cardName: row.cardName, qty: row.qty, lang: row.lang });
        setRows(mapRows(restored));
        refreshAll();
      });
      refreshAll();
    } catch (err) {
      setRows(before);
      toast(err.message, "var(--red)");
    }
  }

  async function clearList() {
    const replace = tab === "wishlist" ? api.replaceWishlist : api.replaceCollection;
    const previous = rows.map((c) => ({ cardName: c.cardName, qty: c.qty, lang: c.lang }));
    const label = tab === "wishlist" ? "wishlist" : "collection";
    setClearing(true);
    try {
      await replace(ownerId, []);
      setRows([]);
      setConfirmClear(false);
      toast(`Cleared ${label}`, "var(--red)", async () => {
        const restored = mapRows(await replace(ownerId, previous));
        setRows(restored);
        refreshAll();
      });
      refreshAll();
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setClearing(false);
  }

  const listLabel = tab === "wishlist" ? "wishlist" : "collection";
  const whose = isAdminEditing ? `${ownerName}'s ${listLabel}` : `your ${listLabel}`;

  return (
    <div className="be-page">
      {isAdminEditing && (
        <button type="button" className="be-back" onClick={() => navigate(`/friends/${ownerId}`)}>
          ← {ownerName}
        </button>
      )}
      {isAdminEditing && (
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          You're editing this as an admin — {ownerName} didn't make this change themselves.
        </div>
      )}
      <div className="be-page__head">
        <div>
          <h1>{isAdminEditing ? `${ownerName}'s binder` : "Your binder"}</h1>
          <div className="be-mono-sub">
            {collCount} in collection · {wishCount} on wishlist
          </div>
        </div>
        <div className="be-page__actions">
          <button
            type="button"
            className="be-btn be-btn--danger"
            onClick={() => setConfirmClear(true)}
            disabled={!rows.length || loading}
          >
            Clear {listLabel}
          </button>
          <button type="button" className="be-btn be-btn--gold" onClick={() => openAdd(tab, ownerId)}>
            + Add cards
          </button>
          <button type="button" className="be-btn be-btn--outline" onClick={() => openImport(tab, ownerId)}>
            Import list
          </button>
        </div>
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
              </div>
            );
          })}
        </div>
      ) : (
        <section className="be-list">
          <div className="be-list__head">
            <span />
            <span>Card</span>
            <span style={{ textAlign: "center" }}>Qty</span>
            <span />
          </div>
          {shown.map((r) => {
            const meta = cards[matchKey(r.cardName)];
            let tag = null;
            let tagClass = "";
            if (tab === "collection") {
              const reserved = r.reserved || 0;
              const wanters = wantTags.get(r.cardName) || [];
              if (reserved) {
                tag = "🔒 reserved";
                tagClass = "is-gold";
              } else if (wanters.length) {
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
                <QtyStepper
                  compact
                  value={r.qty}
                  onDec={() => r.qty > 1 && patch(r, { qty: r.qty - 1 })}
                  onInc={() => patch(r, { qty: r.qty + 1 })}
                />
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
              <button type="button" className="be-btn be-btn--gold" onClick={() => openAdd(tab, ownerId)}>
                + Add cards
              </button>
            </div>
          )}
        </section>
      )}
      {confirmClear &&
        createPortal(
          <div
            className="modal-backdrop modal-backdrop--top"
            onClick={() => !clearing && setConfirmClear(false)}
            role="presentation"
          >
            <div
              className="modal modal--warning"
              role="alertdialog"
              aria-labelledby="clear-list-title"
              aria-describedby="clear-list-copy"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 id="clear-list-title">Clear {listLabel}?</h2>
              <p id="clear-list-copy">
                This removes all {tab === "wishlist" ? wishCount : collCount} cards from {whose}. You can undo from the
                toast right after.
              </p>
              <div className="modal__actions">
                <button type="button" className="be-btn be-btn--outline" onClick={() => setConfirmClear(false)} disabled={clearing}>
                  Cancel
                </button>
                <button type="button" className="be-btn be-btn--danger" onClick={clearList} disabled={clearing}>
                  {clearing ? "Clearing…" : `Clear ${listLabel}`}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
