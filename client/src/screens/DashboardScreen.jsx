import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatEur, matchKey } from "../lib/format.js";
import { useAuth, useData } from "../context.jsx";
import { useCardData } from "../components/CardPreview.jsx";

export function DashboardScreen() {
  const { identity } = useAuth();
  const { friends, matches } = useData();
  const navigate = useNavigate();
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const me = identity.name;
  const get = (matches || []).filter((m) => m.seeker === me);
  const give = (matches || []).filter((m) => m.owner === me);
  const names = [...get, ...give].map((m) => m.cardName);
  const cards = useCardData(names);
  const getTotal = get.reduce((s, m) => s + (Number(cards[matchKey(m.cardName)]?.eur) || 0), 0);
  const giveTotal = give.reduce((s, m) => s + (Number(cards[matchKey(m.cardName)]?.eur) || 0), 0);
  const fromFriends = new Set(get.map((m) => m.owner)).size;
  const meFriend = friends.find((f) => f.id === identity.id);
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" }).toUpperCase();

  const stats = [
    { label: "Cards you can get", value: get.length, sub: `from ${fromFriends} friends · ${formatEur(getTotal)}`, color: "var(--green)", go: () => navigate("/trades") },
    { label: "Cards friends want", value: give.length, sub: `worth ${formatEur(giveTotal)} to give`, color: "var(--text)", go: () => navigate("/trades") },
    { label: "Open trades", value: 0, sub: "Trade proposals arrive in a later update", color: "var(--gold)", go: () => navigate("/trades") },
    { label: "Binder size", value: meFriend?.collection_count || 0, sub: `${meFriend?.wishlist_count || 0} on wishlist`, color: "var(--text)", go: () => navigate("/binder") },
  ];

  const partners = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      const other = m.owner === me ? m.seeker : m.seeker === me ? m.owner : null;
      if (!other) continue;
      const row = map.get(other) || { name: other, get: 0, give: 0 };
      if (m.seeker === me) row.get += 1;
      if (m.owner === me) row.give += 1;
      map.set(other, row);
    }
    return [...map.values()].sort((a, b) => b.get + b.give - (a.get + a.give)).slice(0, 8);
  }, [matches, me]);

  return (
    <div className="be-page">
      <div className="be-eyebrow be-eyebrow--gold">{today}</div>
      <h1 className="be-h1-lg">
        {hello}, {identity.name}
      </h1>
      <div className="be-stats">
        {stats.map((s, i) => (
          <button key={s.label} type="button" className="be-stat" style={{ animationDelay: `${i * 60}ms` }} onClick={s.go}>
            <div className="be-stat__label">{s.label}</div>
            <div className="be-stat__n" style={{ color: s.color }}>
              {s.value}
            </div>
            <div className="be-muted">{s.sub}</div>
          </button>
        ))}
      </div>
      <div className="be-dash-grid">
        <section className="be-panel">
          <div className="be-panel__title">Best trade partners</div>
          {partners.length === 0 && <div className="be-muted" style={{ padding: 16 }}>Matches show up once two binders overlap.</div>}
          {partners.map((p) => (
            <div key={p.name} className="be-partner">
              <div>
                <div className="be-partner__name">{p.name}</div>
                <div className="be-muted">
                  You get <strong>{p.get}</strong> · you give <strong>{p.give}</strong>
                </div>
              </div>
              <button type="button" className="be-btn be-btn--outline" onClick={() => navigate("/trades/new")}>
                Propose
              </button>
            </div>
          ))}
        </section>
        <section className="be-panel">
          <div className="be-panel__title">Open trades</div>
          <div className="be-muted" style={{ padding: 16 }}>
            Propose → accept → complete lands in the trades PR. Matches are live now on the Trades screen.
          </div>
        </section>
        <section className="be-panel">
          <div className="be-panel__title">Wishlist now available</div>
          <div className="be-wish-strip">
            {get.slice(0, 8).map((m) => (
              <button key={`${m.cardName}-${m.owner}`} type="button" className="be-wish-thumb" onClick={() => navigate("/trades")}>
                <div className="be-wish-thumb__name">{m.cardName}</div>
                <div className="be-muted">from {m.owner}</div>
              </button>
            ))}
            {!get.length && <div className="be-muted" style={{ padding: 16 }}>Nothing on your wishlist is in a friend’s binder yet.</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
