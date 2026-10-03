import React, { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { initials, timeAgo } from "../lib/format.js";
import { matchCountWithMe, useAuth, useData } from "../context.jsx";
import { api } from "../api.js";
import { notificationCopy } from "./TradeScreens.jsx";
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
  const { friends, matches, loading, openTrades, notifications, refreshAll } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 760px)").matches || new URLSearchParams(window.location.search).get("mobile") === "1");
  const [notifOpen, setNotifOpen] = useState(false);
  const [globalQ, setGlobalQ] = useState("");
  const [drawer, setDrawer] = useState(null);
  const [binderTick, setBinderTick] = useState(0);
  const [tabsHidden, setTabsHidden] = useState(false);
  const mainRef = React.useRef(null);

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
    setTabsHidden(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!narrow) {
      setTabsHidden(false);
      return undefined;
    }
    const el = mainRef.current;
    if (!el) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTabsHidden(false);
      return undefined;
    }
    let lastY = el.scrollTop;
    function onScroll() {
      const y = el.scrollTop;
      const delta = y - lastY;
      lastY = y;
      if (y < 24) {
        setTabsHidden(false);
        return;
      }
      if (delta > 10) setTabsHidden(true);
      else if (delta < -10) setTabsHidden(false);
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [narrow, location.pathname]);

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

  const unread = notifications.filter((n) => !n.read_at);
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
            {unread.length > 0 && <span className="be-bell__dot" />}
          </button>
          {notifOpen && (
            <div className="be-popover">
              <div className="be-popover__head">
                <div>Notifications</div>
                <button
                  type="button"
                  className="be-text-gold"
                  onClick={async () => {
                    await api.markNotificationsRead();
                    refreshAll();
                  }}
                >
                  Mark all read
                </button>
              </div>
              {unread.concat(notifications.filter((n) => n.read_at)).slice(0, 4).map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`be-popover__item${!n.read_at ? " is-unread" : ""}`}
                  onClick={() => {
                    setNotifOpen(false);
                    if (n.payload?.tradeId) navigate(`/trades/${n.payload.tradeId}`);
                    else navigate("/notifications");
                  }}
                >
                  <span>{notificationCopy(n)}</span>
                  <span className="be-mono-sub">{timeAgo(n.created_at)}</span>
                </button>
              ))}
              {!notifications.length && <div className="be-popover__empty">No alerts yet.</div>}
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
                    const on =
                      item.to === "/binder"
                        ? location.pathname.startsWith("/binder")
                        : item.to === "/trades"
                          ? location.pathname.startsWith("/trades")
                          : isActive;
                    return `be-nav__item${on ? " is-active" : ""}`;
                  }}
                >
                  <span className="be-nav__icon">{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.to === "/trades" && openTrades.length > 0 && (
                    <span className="be-match-pill">{openTrades.length}</span>
                  )}
                  {item.to === "/notifications" && unread.length > 0 && (
                    <span className="be-match-pill">{unread.length}</span>
                  )}
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
        <main className="be-main" ref={mainRef}>
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
        <nav className={`be-tabs${tabsHidden ? " is-hidden" : ""}`} aria-label="Main">
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
