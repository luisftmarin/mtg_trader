import React, { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { CardName } from "../components/CardName.jsx";
import { ManaDots } from "../components/QtyStepper.jsx";
import { formatEur, initials, manaDots, matchKey } from "../lib/format.js";
import { useCardData } from "../components/CardPreview.jsx";
import { useAuth, useData } from "../context.jsx";

export function FriendScreen() {
  const { id } = useParams();
  const { identity } = useAuth();
  const { friends, matches } = useData();
  const navigate = useNavigate();
  const friend = friends.find((f) => String(f.id) === String(id));
  const name = friend?.name || "Trader";
  const get = (matches || []).filter((m) => m.owner === name && m.seeker === identity.name);
  const give = (matches || []).filter((m) => m.owner === identity.name && m.seeker === name);
  const cards = useCardData([...get, ...give].map((m) => m.cardName));

  const uniqueGet = useMemo(() => dedupe(get), [get]);
  const uniqueGive = useMemo(() => dedupe(give), [give]);

  if (!friend) {
    return (
      <div className="be-page">
        <button type="button" className="be-back" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <div className="be-muted">Trader not found.</div>
      </div>
    );
  }

  return (
    <div className="be-page">
      <button type="button" className="be-back" onClick={() => navigate(-1)}>
        ← Back
      </button>
      <div className="be-page__head">
        <div className="be-friend-av">{initials(name)}</div>
        <div style={{ flex: 1 }}>
          <h1>{name}</h1>
          <div className="be-mono-sub">
            {friend.collection_count} cards · {friend.wishlist_count} wishes
          </div>
        </div>
        <button type="button" className="be-btn be-btn--gold" onClick={() => navigate("/trades/new")}>
          Propose trade
        </button>
      </div>
      <div className="be-friend-cols">
        <section className="be-panel">
          <div className="be-panel__title be-panel__title--green">They have · you want · {uniqueGet.length}</div>
          {uniqueGet.map((m) => {
            const meta = cards[matchKey(m.cardName)];
            return (
              <div key={m.cardName} className="be-match-row">
                <ManaDots colors={manaDots(meta?.color_identity)} />
                <CardName name={m.cardName} />
                <span className="be-list__eur">{formatEur(meta?.eur)}</span>
              </div>
            );
          })}
          {!uniqueGet.length && <div className="be-empty-copy">No overlap with your wishlist.</div>}
        </section>
        <section className="be-panel">
          <div className="be-panel__title be-panel__title--gold">They want · you have · {uniqueGive.length}</div>
          {uniqueGive.map((m) => {
            const meta = cards[matchKey(m.cardName)];
            return (
              <div key={m.cardName} className="be-match-row">
                <ManaDots colors={manaDots(meta?.color_identity)} />
                <CardName name={m.cardName} />
                <span className="be-list__eur">{formatEur(meta?.eur)}</span>
              </div>
            );
          })}
          {!uniqueGive.length && <div className="be-empty-copy">They don't want anything you have right now.</div>}
        </section>
      </div>
    </div>
  );
}

function dedupe(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    if (seen.has(r.cardName)) return false;
    seen.add(r.cardName);
    return true;
  });
}

export function RosterScreen() {
  const { friends } = useData();
  const { identity } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="be-page">
      <h1>Friends</h1>
      <section className="be-panel">
        {friends.map((f) => (
          <button key={f.id} type="button" className="be-roster__item be-roster__item--wide" onClick={() => navigate(`/friends/${f.id}`)}>
            <div className="be-roster__av">{initials(f.name)}</div>
            <div className="be-roster__meta">
              <div className="be-roster__name">{f.name}{f.id === identity.id ? " (you)" : ""}</div>
              <div className="be-roster__counts">
                {f.collection_count} · {f.wishlist_count} wish
              </div>
            </div>
          </button>
        ))}
      </section>
    </div>
  );
}

export function NotificationsScreen() {
  return (
    <div className="be-page" style={{ maxWidth: 760 }}>
      <div className="be-page__head">
        <h1 style={{ flex: 1 }}>Notifications</h1>
        <button type="button" className="be-btn be-btn--outline">
          Mark all read
        </button>
      </div>
      <section className="be-panel">
        <div className="be-empty-copy">No notifications yet. Proposals and comments will appear here.</div>
      </section>
    </div>
  );
}

export function ComingSoon({ title, copy }) {
  const navigate = useNavigate();
  return (
    <div className="be-page">
      <button type="button" className="be-back" onClick={() => navigate("/trades")}>
        ← Trades
      </button>
      <h1>{title}</h1>
      <p className="be-copy">{copy}</p>
    </div>
  );
}
