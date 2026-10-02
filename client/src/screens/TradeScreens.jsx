import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.js";
import { CardName } from "../components/CardName.jsx";
import { useToast } from "../components/ToastHost.jsx";
import { formatEur, initials, matchKey, timeAgo } from "../lib/format.js";
import { useCardData } from "../components/CardPreview.jsx";
import { useAuth, useData } from "../context.jsx";

export function StatusBadge({ status }) {
  const cls =
    status === "accepted"
      ? "is-accepted"
      : status === "proposed"
        ? "is-proposed"
        : status === "declined" || status === "withdrawn"
          ? "is-declined"
          : status === "completed"
            ? "is-closed"
            : "";
  return <span className={`be-status ${cls}`}>{status}</span>;
}

function itemEur(item, cards, live) {
  if (!live && item.eur_at_completion != null) return Number(item.eur_at_completion) * item.qty;
  const eur = Number(cards[matchKey(item.card_name)]?.eur);
  return Number.isFinite(eur) ? eur * item.qty : 0;
}

export function TradeCard({ trade, onOpen }) {
  const names = (trade.items || []).map((i) => i.card_name);
  const cards = useCardData(names);
  const live = trade.status === "proposed" || trade.status === "accepted";
  const getEur = (trade.get || []).reduce((s, i) => s + itemEur(i, cards, live), 0);
  const giveEur = (trade.give || []).reduce((s, i) => s + itemEur(i, cards, live), 0);
  const getNames = (trade.get || []).map((i) => i.card_name).slice(0, 3).join(", ");
  const giveNames = (trade.give || []).map((i) => i.card_name).slice(0, 3).join(", ");
  return (
    <button type="button" className="be-trade-card" onClick={() => onOpen(trade.id)}>
      <div className="be-trade-card__av">{initials(trade.otherName)}</div>
      <div className="be-trade-card__body">
        <div className="be-trade-card__top">
          <strong>{trade.otherName}</strong>
          <StatusBadge status={trade.status} />
        </div>
        <div className="be-mono-sub">
          #{trade.id} · {timeAgo(trade.createdAt)}
          {trade.viewerIsProposer ? " · you proposed" : " · they proposed"}
        </div>
        <div className="be-muted">
          Get {getNames || "—"} · Give {giveNames || "—"}
        </div>
      </div>
      <div className="be-trade-card__bal">
        {formatEur(getEur)} ↔ {formatEur(giveEur)}
      </div>
    </button>
  );
}

export function NewTradeScreen() {
  const { identity } = useAuth();
  const { friends, matches, refreshAll } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const preset = params.get("partner");
  const [partnerId, setPartnerId] = useState(preset ? Number(preset) : null);
  const [picked, setPicked] = useState(() => new Set());
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const partners = friends.filter((f) => f.id !== identity.id);
  const partner = friends.find((f) => f.id === partnerId);

  const getRows = useMemo(() => {
    if (!partner) return [];
    return (matches || []).filter((m) => m.seeker === identity.name && m.owner === partner.name);
  }, [matches, identity.name, partner]);

  const giveRows = useMemo(() => {
    if (!partner) return [];
    const wanted = (matches || []).filter((m) => m.owner === identity.name && m.seeker === partner.name);
    return wanted;
  }, [matches, identity.name, partner]);

  const names = [...getRows, ...giveRows].map((r) => r.cardName);
  const cards = useCardData(names);

  function keyFor(row, fromMe) {
    return `${fromMe ? identity.id : partner.id}:${matchKey(row.cardName)}`;
  }

  function toggle(row, fromMe) {
    const k = keyFor(row, fromMe);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  const items = [];
  let getEur = 0;
  let giveEur = 0;
  for (const row of getRows) {
    if (!picked.has(keyFor(row, false))) continue;
    const qty = row.tradeAvailable || 1;
    items.push({ fromId: partner.id, cardName: row.cardName, qty });
    getEur += (Number(cards[matchKey(row.cardName)]?.eur) || 0) * qty;
  }
  for (const row of giveRows) {
    if (!picked.has(keyFor(row, true))) continue;
    const qty = row.tradeAvailable || 1;
    items.push({ fromId: identity.id, cardName: row.cardName, qty });
    giveEur += (Number(cards[matchKey(row.cardName)]?.eur) || 0) * qty;
  }
  const delta = getEur - giveEur;
  const balance =
    Math.abs(delta) < 0.005 ? "balanced" : delta > 0 ? `you gain ${formatEur(delta)}` : `you give ${formatEur(-delta)} more`;

  async function send() {
    if (!partnerId || !items.length) return;
    setBusy(true);
    try {
      const trade = await api.createTrade({ partnerId, items, message });
      toast("Proposal sent", "var(--green)");
      refreshAll();
      navigate(`/trades/${trade.id}`);
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  return (
    <div className="be-page">
      <button type="button" className="be-back" onClick={() => navigate("/trades")}>
        ← Trades
      </button>
      <h1>New trade</h1>
      <p className="be-copy">Pick a friend, then the cards you want and the cards you’ll give.</p>
      <div className="be-chip-row">
        {partners.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`be-chip${partnerId === f.id ? " is-on" : ""}`}
            onClick={() => {
              setPartnerId(f.id);
              setPicked(new Set());
            }}
          >
            <span className="be-chip__av">{initials(f.name)}</span>
            {f.name}
          </button>
        ))}
      </div>
      {!partner && <div className="be-muted">Select a partner to see overlapping cards.</div>}
      {partner && (
        <>
          <div className="be-friend-cols">
            <section className="be-panel">
              <div className="be-panel__title be-panel__title--green">You get from {partner.name}</div>
              {getRows.map((row) => {
                const on = picked.has(keyFor(row, false));
                return (
                  <label key={row.cardName} className={`be-check-row${on ? " is-on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(row, false)} />
                    <CardName name={row.cardName} />
                    <span className="be-muted">×{row.tradeAvailable}</span>
                    <span className="be-list__eur">{formatEur(cards[matchKey(row.cardName)]?.eur)}</span>
                  </label>
                );
              })}
              {!getRows.length && <div className="be-empty-copy">They don’t have anything on your wishlist.</div>}
            </section>
            <section className="be-panel">
              <div className="be-panel__title be-panel__title--gold">You give</div>
              {giveRows.map((row) => {
                const on = picked.has(keyFor(row, true));
                return (
                  <label key={row.cardName} className={`be-check-row${on ? " is-on" : ""}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(row, true)} />
                    <CardName name={row.cardName} />
                    <span className="be-tag is-green">wants</span>
                    <span className="be-muted">×{row.tradeAvailable}</span>
                    <span className="be-list__eur">{formatEur(cards[matchKey(row.cardName)]?.eur)}</span>
                  </label>
                );
              })}
              {!giveRows.length && <div className="be-empty-copy">They don’t want anything you have right now.</div>}
            </section>
          </div>
          <div className="be-trade-foot">
            <div>
              <div className="be-muted">Get {formatEur(getEur)} · Give {formatEur(giveEur)}</div>
              <div className="be-trade-foot__bal">{balance}</div>
            </div>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Optional note — where and when to meet"
            />
            <button type="button" className="be-btn be-btn--gold" disabled={!items.length || busy} onClick={send}>
              {busy ? "Sending…" : "Send proposal"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function TradeDetailScreen() {
  const { id } = useParams();
  const { identity } = useAuth();
  const { refreshAll } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [trade, setTrade] = useState(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const data = await api.getTrade(id);
    setTrade(data);
  }

  useEffect(() => {
    load().catch((err) => toast(err.message, "var(--red)"));
    const t = setInterval(() => {
      api.listComments(id).then((comments) => {
        setTrade((prev) => (prev ? { ...prev, comments } : prev));
      }).catch(() => {});
    }, 15000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const names = (trade?.items || []).map((i) => i.card_name);
  const cards = useCardData(names);
  const live = trade && (trade.status === "proposed" || trade.status === "accepted");

  async function act(action) {
    setBusy(true);
    try {
      const next = await api.actOnTrade(id, action);
      setTrade(next);
      refreshAll();
      toast(action === "complete" ? "Trade completed" : `Trade ${action}ed`, "var(--green)");
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  async function sendComment(e) {
    e.preventDefault();
    if (!body.trim()) return;
    try {
      const comments = await api.addComment(id, body.trim());
      setTrade((prev) => ({ ...prev, comments }));
      setBody("");
    } catch (err) {
      toast(err.message, "var(--red)");
    }
  }

  if (!trade) return <div className="be-page">Loading trade…</div>;

  const getEur = (trade.get || []).reduce((s, i) => s + itemEur(i, cards, live), 0);
  const giveEur = (trade.give || []).reduce((s, i) => s + itemEur(i, cards, live), 0);

  return (
    <div className="be-page">
      <button type="button" className="be-back" onClick={() => navigate("/trades?tab=proposals")}>
        ← Trades
      </button>
      <div className="be-page__head">
        <div className="be-friend-av">{initials(trade.otherName)}</div>
        <div style={{ flex: 1 }}>
          <h1>Trade with {trade.otherName}</h1>
          <div className="be-mono-sub">
            #{trade.id} · {timeAgo(trade.createdAt)} · proposed by {trade.proposerName}
          </div>
        </div>
        <StatusBadge status={trade.status} />
      </div>
      {trade.status === "accepted" && (
        <div className="warning-banner" style={{ marginBottom: 16 }}>
          🔒 Both sides accepted. These cards are reserved and hidden from other matches until you mark the trade
          completed.
        </div>
      )}
      <div className="be-friend-cols">
        <section className="be-panel">
          <div className="be-panel__title be-panel__title--green">You get</div>
          {(trade.get || []).map((item) => (
            <div key={item.id} className="be-match-row">
              <CardName name={item.card_name} />
              <span className="be-muted">×{item.qty}</span>
              <span className="be-list__eur">{formatEur(live ? cards[matchKey(item.card_name)]?.eur : item.eur_at_completion)}</span>
            </div>
          ))}
          {!trade.get?.length && <div className="be-empty-copy">Nothing coming your way.</div>}
        </section>
        <section className="be-panel">
          <div className="be-panel__title be-panel__title--gold">You give</div>
          {(trade.give || []).map((item) => (
            <div key={item.id} className="be-match-row">
              <CardName name={item.card_name} />
              <span className="be-muted">×{item.qty}</span>
              <span className="be-list__eur">{formatEur(live ? cards[matchKey(item.card_name)]?.eur : item.eur_at_completion)}</span>
            </div>
          ))}
          {!trade.give?.length && <div className="be-empty-copy">You’re not giving cards in this one.</div>}
        </section>
      </div>
      <section className="be-panel" style={{ marginTop: 16 }}>
        <div className="be-panel__title">Balance</div>
        <div style={{ padding: 16 }}>
          Get {formatEur(getEur)} · Give {formatEur(giveEur)}
          <div className="be-muted" style={{ marginTop: 6 }}>
            Cardmarket trend prices via Scryfall · {live ? "live, updated nightly" : "frozen at completion"}
          </div>
        </div>
      </section>
      <div className="be-trade-actions">
        {trade.status === "proposed" && !trade.viewerIsProposer && (
          <>
            <button type="button" className="be-btn be-btn--gold" disabled={busy} onClick={() => act("accept")}>
              Accept
            </button>
            <button type="button" className="be-btn be-btn--outline" disabled={busy} onClick={() => navigate(`/trades/new?partner=${trade.proposerId}`)}>
              Counter-propose
            </button>
            <button type="button" className="be-btn be-btn--danger" disabled={busy} onClick={() => act("decline")}>
              Decline
            </button>
          </>
        )}
        {trade.status === "proposed" && trade.viewerIsProposer && (
          <>
            <span className="be-muted">Waiting for {trade.otherName} to accept.</span>
            <button type="button" className="be-btn be-btn--outline" disabled={busy} onClick={() => act("withdraw")}>
              Withdraw proposal
            </button>
          </>
        )}
        {trade.status === "accepted" && (
          <>
            <button type="button" className="be-btn be-btn--gold" disabled={busy} onClick={() => act("complete")}>
              Mark as completed
            </button>
            {!trade.viewerIsProposer && (
              <button type="button" className="be-btn be-btn--danger" disabled={busy} onClick={() => act("decline")}>
                Decline
              </button>
            )}
          </>
        )}
        {(trade.status === "completed" || trade.status === "declined" || trade.status === "withdrawn") && (
          <span className="be-muted">This trade is closed.</span>
        )}
      </div>
      <section className="be-panel" style={{ marginTop: 18 }}>
        <div className="be-panel__title">Comments</div>
        <div className="be-comments">
          {(trade.comments || []).map((c) => (
            <div
              key={c.id}
              className={`be-comment${String(c.author_id) === String(identity.id) ? " is-mine" : ""}`}
            >
              <div className="be-mono-sub">
                {c.author_name} · {timeAgo(c.created_at)}
              </div>
              <div>{c.body}</div>
            </div>
          ))}
          {!trade.comments?.length && (
            <div className="be-empty-copy">No comments yet. Agree on where and when to meet.</div>
          )}
        </div>
        {trade.status !== "declined" && trade.status !== "withdrawn" && (
          <form className="be-comment-form" onSubmit={sendComment}>
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" />
            <button type="submit" className="be-btn be-btn--gold" disabled={!body.trim()}>
              Send
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

export function notificationCopy(n) {
  const p = n.payload || {};
  const who = p.fromName || "Someone";
  if (n.kind === "proposal") return `${who} sent you a trade proposal`;
  if (n.kind === "accepted") return `${who} accepted your proposal`;
  if (n.kind === "declined") return p.action === "withdraw" ? `${who} withdrew a proposal` : `${who} declined a trade`;
  if (n.kind === "completed") return `${who} marked a trade completed`;
  if (n.kind === "comment") return `${who}: ${p.preview || "new comment"}`;
  if (n.kind === "match") return `${who} added cards you want`;
  return "Notification";
}
