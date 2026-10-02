import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { initials } from "../lib/format.js";
import { matchCountWithMe, useAuth, useData } from "../context.jsx";
import { AddCardsDrawer } from "../components/AddCardsDrawer.jsx";
import { ImportDrawer } from "../components/ImportDrawer.jsx";

const NAV = [
  { to: "/", label: "Dashboard", icon: "◈", end: true },
  { to: "/trades", label: "Trades", icon: "⇄", match: ["/trades"] },
  { to: "/binder", label: "Binder", icon: "▤" },
  { to: "/notifications", label: "Notifications", icon: "◎" },
];

const MOBILE = [
  { to: "/", label: "Home", icon: "◈", end: true },
  { to: "/trades", label: "Trades", icon: "⇄" },
  { to: "/binder", label: "Binder", icon: "▤" },
  { to: "/friends", label: "Friends", icon: "☺" },
  { to: "/profile", label: "Profile", icon: "◉" },
];

export function AppShell() {
  const { identity } = useAuth();
  const { friends, matches, loading, refreshAll } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 760px)").matches || new URLSearchParams(window.location.search).get("mobile") === "1");
  const [notifOpen, setNotifOpen] = useState(false);
  const [globalQ, setGlobalQ] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [binderTick, setBinderTick] = useState(0);

  function afterBinderWrite() {
    setBinderTick((n) => n + 1);
    refreshAll();
  }

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const on = (e) => setNarrow(e.matches || new URLSearchParams(window.location.search).get("mobile") === "1");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    setNotifOpen(false);
  }, [location.pathname]);

  const roster = useMemo(() => {
    const q = globalQ.trim().toLowerCase();
    return [...friends]
      .filter((f) => !q || f.name.toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.id === identity.id) return -1;
        if (b.id === identity.id) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [friends, globalQ, identity.id]);

  const meIni = initials(identity.name);

  return (
    <div className={`be-app${narrow ? " is-narrow" : ""}`}>
      <header className="be-topbar">
        <button type="button" className="be-brand" onClick={() => navigate("/")}>
          <div className="be-mark">B</div>
          <div className="be-brand__name">Binder Exchange</div>
        </button>
        <div style={{ flex: 1 }} />
        {!narrow && (
          <div className="be-search">
            <span>⌕</span>
            <input placeholder="Search cards or friends…" value={globalQ} onChange={(e) => setGlobalQ(e.target.value)} />
          </div>
        )}
        <div className="be-bell-wrap">
          <button type="button" className="be-bell" aria-label="Notifications" onClick={() => setNotifOpen((v) => !v)}>
            🔔
          </button>
          {notifOpen && (
            <div className="be-popover">
              <div className="be-popover__head">
                <div>Notifications</div>
                <button type="button" className="be-text-gold">
                  Mark all read
                </button>
              </div>
              <div className="be-popover__empty">Trade alerts land here in the next update.</div>
              <button type="button" className="be-popover__foot" onClick={() => navigate("/notifications")}>
                View all
              </button>
            </div>
          )}
        </div>
        <button type="button" className="be-userchip" onClick={() => navigate("/profile")}>
          <div className="be-avatar be-avatar--gold">{meIni}</div>
          {!narrow && <div>{identity.name}</div>}
        </button>
      </header>

      <div className="be-body">
        {!narrow && (
          <nav className="be-sidebar">
            <div className="be-nav">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => {
                    const on = item.to === "/binder" ? location.pathname.startsWith("/binder") : isActive;
                    return `be-nav__item${on ? " is-active" : ""}`;
                  }}
                >
                  <span className="be-nav__icon">{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="be-roster-head">
              Roster · {friends.length}
              <span className="be-online">{loading ? "…" : `${friends.length} traders`}</span>
            </div>
            <div className="be-roster">
              {roster.map((f) => {
                const n = matchCountWithMe(matches, identity.name, f.name);
                return (
                  <button key={f.id} type="button" className="be-roster__item" onClick={() => navigate(`/friends/${f.id}`)}>
                    <div className="be-roster__av">{initials(f.name)}</div>
                    <div className="be-roster__meta">
                      <div className="be-roster__name">{f.name}</div>
                      <div className="be-roster__counts">
                        {f.collection_count} · {f.wishlist_count} wish
                      </div>
                    </div>
                    {n > 0 && <span className="be-match-pill">{n}</span>}
                  </button>
                );
              })}
            </div>
          </nav>
        )}
        <main className="be-main">
          <Outlet
            context={{
              openAdd: (tab, friendId) => setDrawer({ kind: "add", tab, friendId: friendId || identity.id }),
              openImport: (tab, friendId) => setDrawer({ kind: "import", tab, friendId: friendId || identity.id }),
              refreshAll,
              binderTick,
              narrow,
            }}
          />
        </main>
      </div>

      {narrow && (
        <nav className="be-tabs">
          {MOBILE.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `be-tabs__item${isActive ? " is-active" : ""}`}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      {drawer?.kind === "add" && (
        <AddCardsDrawer
          friendId={drawer.friendId || identity.id}
          target={drawer.tab}
          onClose={() => setDrawer(null)}
          onAdded={() => afterBinderWrite()}
        />
      )}
      {drawer?.kind === "import" && (
        <ImportDrawer
          friendId={drawer.friendId || identity.id}
          target={drawer.tab}
          onClose={() => setDrawer(null)}
          onApplied={() => afterBinderWrite()}
        />
      )}
    </div>
  );
}
