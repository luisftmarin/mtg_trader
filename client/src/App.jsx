import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import Papa from "papaparse";
import { Plus, X, Upload, ArrowRight, Download, Users, LogOut, RefreshCw, Key, Menu, Star, Search, Link2 } from "lucide-react";
import { api } from "./api.js";
import { Button, IconButton, TextField, Panel, Badge } from "./ui.jsx";

const PIPS = { W: "#F0E6C8", U: "#4A90D9", B: "#8B8B93", R: "#C1440E", G: "#3E7A4D" };

const PLATFORM_MAPPINGS = {
  Archidekt: { card_name: ["Name", "Card Name"], qty: ["Quantity", "Qty", "Count"] },
  Moxfield: { card_name: ["Name", "Card Name"], qty: ["Count", "Quantity", "Qty"] },
  ManaBox: { card_name: ["Name", "Card Name"], qty: ["Quantity", "Qty", "Count"] },
  "Names only": { card_name: ["Name", "Card Name"], qty: [] },
};

const IDENTITY_KEY = "mtg-trade-ledger:identity";
const TOKEN_KEY = "mtg-trade-ledger:token";

function matchKey(name) {
  return String(name || "").trim().split("//")[0].trim().toLowerCase();
}

function mergeCardRows(rows) {
  const byKey = new Map();
  const merged = [];
  for (const row of rows) {
    const key = matchKey(row.cardName);
    const existing = byKey.get(key);
    if (existing) {
      existing.qty += row.qty;
    } else {
      const entry = { cardName: row.cardName, qty: row.qty };
      byKey.set(key, entry);
      merged.push(entry);
    }
  }
  return merged;
}

function parseCsvText(text, platform) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields || [];
  const mapping = PLATFORM_MAPPINGS[platform];
  const cardCol = mapping.card_name.find((c) => fields.includes(c));
  const qtyCol = mapping.qty.find((c) => fields.includes(c));
  if (!cardCol) throw new Error(`No card name column found. Expected one of: ${mapping.card_name.join(", ")}`);
  const rows = result.data
    .filter((row) => row[cardCol])
    .map((row) => {
      const q = qtyCol ? parseInt(row[qtyCol], 10) : 1;
      return { cardName: String(row[cardCol]).trim(), qty: Number.isFinite(q) && q > 0 ? q : 1 };
    });
  return mergeCardRows(rows);
}

function matchInvolvesFriend(match, friendName) {
  if (!friendName) return false;
  return match.owner === friendName || match.seeker === friendName;
}

function sortMatchesByPriority(matches, priorityName) {
  if (!priorityName) return matches;
  return [...matches].sort((a, b) => {
    const aPrio = matchInvolvesFriend(a, priorityName) ? 0 : 1;
    const bPrio = matchInvolvesFriend(b, priorityName) ? 0 : 1;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return a.cardName.localeCompare(b.cardName);
  });
}

function buildMatchSummary(matches, userName, priorityName) {
  return {
    total: matches.length,
    involvingPriority: priorityName ? matches.filter((m) => matchInvolvesFriend(m, priorityName)).length : 0,
    userCanGet: matches.filter((m) => m.seeker === userName).length,
    userCanGive: matches.filter((m) => m.owner === userName).length,
  };
}

function overlapKeysBetween(listA, listB) {
  const keysB = new Set(listB.map((r) => matchKey(r.cardName)));
  const keys = new Set();
  for (const row of listA) {
    const key = matchKey(row.cardName);
    if (keysB.has(key)) keys.add(key);
  }
  return keys;
}

function looksLikeDeckUrl(url) {
  const trimmed = String(url || "").trim();
  return (
    /archidekt\.com\/decks\/\d+/i.test(trimmed) ||
    /archidekt\.com\/collection(?:\/v2)?\/\d+/i.test(trimmed)
  );
}

function sortPeerNames(names, priorityName) {
  return [...names].sort((a, b) => {
    if (priorityName) {
      const aPrio = a === priorityName ? 0 : 1;
      const bPrio = b === priorityName ? 0 : 1;
      if (aPrio !== bPrio) return aPrio - bPrio;
    }
    return a.localeCompare(b);
  });
}

function aggregateCanGetRows(rows, priorityFriendName, groupBySeeker = false) {
  const byCard = new Map();
  for (const row of rows) {
    const key = groupBySeeker ? `${row.seeker}|${matchKey(row.cardName)}` : matchKey(row.cardName);
    if (!byCard.has(key)) {
      byCard.set(key, { ...row, owners: [{ name: row.owner, ownerHas: row.ownerHas }] });
      continue;
    }
    const agg = byCard.get(key);
    if (!agg.owners.some((o) => o.name === row.owner)) {
      agg.owners.push({ name: row.owner, ownerHas: row.ownerHas });
    }
  }
  return Array.from(byCard.values()).map((agg) => {
    const sortedOwners = sortPeerNames(
      agg.owners.map((o) => o.name),
      priorityFriendName
    );
    const totalHas = agg.owners.reduce((sum, o) => sum + o.ownerHas, 0);
    return {
      ...agg,
      owner: sortedOwners[0],
      otherOwners: sortedOwners.slice(1),
      tradeAvailable: Math.min(agg.seekerNeeds, totalHas),
    };
  });
}

async function fetchCardSuggestions(query) {
  if (query.trim().length < 2) return [];
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
}

const cardImageCache = new Map();

async function fetchCardImage(name) {
  const key = matchKey(name);
  if (!key) return null;
  if (cardImageCache.has(key)) return cardImageCache.get(key);
  const front = String(name || "").trim().split("//")[0].trim();
  try {
    const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(front)}`);
    if (!res.ok) {
      cardImageCache.set(key, null);
      return null;
    }
    const card = await res.json();
    const url = card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null;
    cardImageCache.set(key, url);
    return url;
  } catch {
    cardImageCache.set(key, null);
    return null;
  }
}

function CardHover({ name, className = "", children }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef(null);
  const tokenRef = useRef(0);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  if (!name || !String(name).trim()) return children;

  function place(e) {
    const width = 220;
    const height = 310;
    const x = e.clientX + 18 + width > window.innerWidth ? e.clientX - width - 12 : e.clientX + 18;
    const y = e.clientY + height > window.innerHeight - 8 ? window.innerHeight - height - 8 : e.clientY - 24;
    setPos({ x: Math.max(8, x), y: Math.max(8, y) });
  }

  function onEnter(e) {
    place(e);
    clearTimeout(timerRef.current);
    const token = ++tokenRef.current;
    timerRef.current = setTimeout(async () => {
      const img = await fetchCardImage(name);
      if (tokenRef.current !== token) return;
      setUrl(img);
      setOpen(!!img);
    }, 180);
  }

  function onMove(e) {
    if (open) place(e);
  }

  function onLeave() {
    clearTimeout(timerRef.current);
    tokenRef.current += 1;
    setOpen(false);
  }

  return (
    <span className={`card-hover ${className}`.trim()} onMouseEnter={onEnter} onMouseMove={onMove} onMouseLeave={onLeave}>
      {children}
      {open &&
        url &&
        createPortal(
          <img className="card-hover__img" src={url} alt="" style={{ left: pos.x, top: pos.y }} />,
          document.body
        )}
    </span>
  );
}

function pipFor(name) {
  const letters = Object.keys(PIPS);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return letters[hash % letters.length];
}

export default function App() {
  const [identity, setIdentity] = useState(() => {
    try {
      const raw = window.localStorage.getItem(IDENTITY_KEY);
      const token = window.localStorage.getItem(TOKEN_KEY);
      return raw && token ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  if (!identity) {
    return (
      <AuthGate
        onSet={(friend, token) => {
          window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(friend));
          window.localStorage.setItem(TOKEN_KEY, token);
          setIdentity(friend);
        }}
      />
    );
  }

  return (
    <MainApp
      identity={identity}
      onSwitchIdentity={() => {
        window.localStorage.removeItem(IDENTITY_KEY);
        window.localStorage.removeItem(TOKEN_KEY);
        setIdentity(null);
      }}
    />
  );
}

function AuthGate({ onSet }) {
  const [mode, setMode] = useState("login"); // "login" | "register" | "claim"
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [unclaimed, setUnclaimed] = useState(null);

  useEffect(() => {
    if (mode !== "claim" || unclaimed !== null) return;
    api
      .listFriends()
      .then((friends) => setUnclaimed(friends.filter((f) => !f.has_password)))
      .catch(() => setUnclaimed([]));
  }, [mode]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      let result;
      if (mode === "login") result = await api.login(name.trim(), password);
      else if (mode === "claim") result = await api.claimAccount(name.trim(), password);
      else result = await api.register(name.trim(), password, adminCode);
      onSet(result.friend, result.token);
    } catch (e2) {
      setError(e2.message);
    }
    setBusy(false);
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="app-kicker">Trade with Friends</div>
        <h1 className="app-title">
          {mode === "login" ? "Sign in" : mode === "claim" ? "Claim your existing name" : "Create an account"}
        </h1>

        <div className="segmented">
          {[["login", "Sign in"], ["register", "Create account"]].map(([m, label]) => {
            const active = mode === m || (mode === "claim" && m === "login");
            return (
              <button
                key={m}
                type="button"
                className={active ? "is-active" : ""}
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === "claim" && (
          <div style={{ marginBottom: 14 }}>
            <div className="roster__label" style={{ marginBottom: 8 }}>
              Pick your name
            </div>
            {unclaimed === null ? (
              <div className="muted">Loading…</div>
            ) : unclaimed.length === 0 ? (
              <div className="muted" style={{ fontStyle: "italic" }}>
                No unclaimed traders found — everyone already has a password, or the roster is empty.
              </div>
            ) : (
              <div className="stack" style={{ maxHeight: 160, overflowY: "auto", gap: 6 }}>
                {unclaimed.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`roster-item ${name === f.name ? "is-selected" : ""}`}
                    onClick={() => setName(f.name)}
                  >
                    <span className="roster-item__name">{f.name}</span>
                    <span className="roster-item__counts">
                      {f.collection_count} coll · {f.wishlist_count} wish
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} className="stack">
          <TextField
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="username"
          />
          <TextField
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
          />
          {mode === "login" && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setMode("claim");
                setError("");
              }}
            >
              Existing trader without a password? Claim this name
            </button>
          )}
          {mode === "claim" && (
            <button
              type="button"
              className="text-link"
              onClick={() => {
                setMode("login");
                setError("");
                setName("");
                setUnclaimed(null);
              }}
            >
              Back to sign in
            </button>
          )}
          {mode === "register" && (
            <>
              <div className="muted">At least 6 characters.</div>
              {showAdminCode ? (
                <TextField
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Admin code"
                  type="password"
                />
              ) : (
                <button type="button" className="text-link" onClick={() => setShowAdminCode(true)}>
                  Have an admin code?
                </button>
              )}
            </>
          )}
          {error && <div className="warning-banner">{error}</div>}
          <Button type="submit" variant="primary" disabled={busy || !name.trim() || !password}>
            {busy ? "…" : mode === "login" ? "Sign in" : mode === "claim" ? "Set password" : "Create account"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function MainApp({ identity, onSwitchIdentity }) {
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [error, setError] = useState("");
  const [mainTab, setMainTab] = useState("trades");
  const [binderFriendId, setBinderFriendId] = useState(identity.id);
  const [binderVisited, setBinderVisited] = useState(false);
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [viewMode, setViewMode] = useState("mine");
  const [selectedFriendName, setSelectedFriendName] = useState(identity.name);
  const forceMobilePreview = new URLSearchParams(window.location.search).get("mobile") === "1";
  const [isMobile, setIsMobile] = useState(() => {
    if (forceMobilePreview) return true;
    return window.matchMedia("(max-width: 768px)").matches;
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const priorityStorageKey = `mtg-trade-ledger:priority:${identity.id}`;
  const [priorityFriendName, setPriorityFriendName] = useState(() => {
    try {
      return window.localStorage.getItem(priorityStorageKey) || "";
    } catch {
      return "";
    }
  });

  function updatePriorityFriend(name) {
    setPriorityFriendName(name);
    try {
      if (name) window.localStorage.setItem(priorityStorageKey, name);
      else window.localStorage.removeItem(priorityStorageKey);
    } catch {
      // ignore
    }
    if (name) setSelectedFriendName(name);
  }

  useEffect(() => {
    if (priorityFriendName && !friends.some((f) => f.name === priorityFriendName)) {
      setPriorityFriendName("");
      try {
        window.localStorage.removeItem(priorityStorageKey);
      } catch {
        // ignore
      }
    }
  }, [friends, priorityFriendName, priorityStorageKey]);

  useEffect(() => {
    if (forceMobilePreview) return;
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [forceMobilePreview]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function refreshFriends() {
    setLoadingFriends(true);
    try {
      setFriends(await api.listFriends());
    } catch (e) {
      setError(e.message);
    }
    setLoadingFriends(false);
  }

  useEffect(() => {
    refreshFriends();
  }, []);

  const friendsSignature = friends
    .map((f) => `${f.id}:${f.collection_count}:${f.wishlist_count}`)
    .join("|");

  async function calculateMatches() {
    if (friends.length < 2) return;
    setMatchesLoading(true);
    setError("");
    try {
      const result = await api.getMatches();
      setMatches(result);
      setSelectedFriendName((prev) => prev || identity.name);
    } catch (e) {
      setError(e.message);
    }
    setMatchesLoading(false);
  }

  useEffect(() => {
    if (loadingFriends) return;
    if (friends.length < 2) {
      setMatches(null);
      return;
    }
    let cancelled = false;
    setMatchesLoading(true);
    api
      .getMatches()
      .then((result) => {
        if (cancelled) return;
        setMatches(result);
        setSelectedFriendName((prev) => prev || identity.name);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setMatchesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [friendsSignature, loadingFriends, identity.name]);

  function requestRemoveFriend(id) {
    const friend = friends.find((f) => f.id === id);
    if (!friend) return;
    setConfirmDelete({
      id,
      name: friend.name,
      isSelf: id === identity.id,
      isAdminRemovingOther: identity.isAdmin && id !== identity.id,
      collectionCount: friend.collection_count ?? friend.collection_count ?? 0,
      wishlistCount: friend.wishlist_count ?? friend.wishlist_count ?? 0,
    });
  }

  async function confirmRemoveFriend() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.deleteFriend(id);
      if (binderFriendId === id) setBinderFriendId(identity.id);
      refreshFriends();
      setMatches(null);
      if (id === identity.id) {
        window.localStorage.removeItem(IDENTITY_KEY);
        window.localStorage.removeItem(TOKEN_KEY);
        window.location.reload();
      }
    } catch (e) {
      setError(e.message);
    }
  }

  const byPair = useMemo(() => {
    if (!matches) return {};
    const groups = {};
    matches.forEach((m) => {
      const key = `${m.owner}|${m.seeker}`;
      groups[key] = groups[key] || [];
      groups[key].push(m);
    });
    return groups;
  }, [matches]);

  const pairEntries = useMemo(() => {
    const me = identity.name;
    return Object.entries(byPair).sort(([a], [b]) => {
      const aMine = a.split("|").includes(me) ? 0 : 1;
      const bMine = b.split("|").includes(me) ? 0 : 1;
      if (aMine !== bMine) return aMine - bMine;
      return a.localeCompare(b);
    });
  }, [byPair, identity.name]);

  function exportCsv() {
    if (!matches || !matches.length) return;
    const header = "Who Has It,Who Needs It,Card Name,Seeker Needs,Owner Has,Trade Available\n";
    const rows = matches
      .map((m) => [m.owner, m.seeker, `"${m.cardName.replace(/"/g, '""')}"`, m.seekerNeeds, m.ownerHas, m.tradeAvailable].join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade_matches.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const selfFriend = friends.find((f) => f.id === identity.id);
  const binderFriend = friends.find((f) => f.id === binderFriendId) || selfFriend;
  const onTrades = mainTab === "trades";

  function showTrades() {
    setMainTab("trades");
  }

  function showBinder(friendId = binderFriendId || identity.id) {
    setBinderFriendId(friendId);
    setBinderVisited(true);
    setMainTab("binder");
  }
  const myMatches = useMemo(
    () => (matches || []).filter((m) => m.seeker === identity.name || m.owner === identity.name),
    [matches, identity.name]
  );

  const rosterFriends = useMemo(
    () =>
      [...friends].sort((a, b) => {
        const aSelf = a.id === identity.id ? 0 : 1;
        const bSelf = b.id === identity.id ? 0 : 1;
        if (aSelf !== bSelf) return aSelf - bSelf;
        const byCount = (b.collection_count ?? 0) - (a.collection_count ?? 0);
        return byCount !== 0 ? byCount : a.name.localeCompare(b.name);
      }),
    [friends, identity.id]
  );

  return (
    <div className={`app-shell${isMobile ? " is-mobile" : ""}`}>
      <header className="app-header">
        <div className="header-cluster">
          <IconButton className="roster-toggle" onClick={() => setSidebarOpen(true)} aria-label="Open roster">
            <Menu size={16} />
          </IconButton>
          <div className="app-header__brand" onClick={showTrades} title="Trades">
            <div className="app-kicker">Trade with Friends</div>
            <h1 className="app-title">{isMobile ? "Binder Exchange" : "Group Binder Exchange"}</h1>
          </div>
        </div>
        <div className="identity-chip">
          {!isMobile && (
            <>
              <span className="identity-chip__name">{identity.name}</span>
              {identity.isAdmin && <Badge>Admin</Badge>}
            </>
          )}
          <IconButton onClick={() => setShowChangePassword(true)} title="Change password" bare>
            <Key size={13} />
          </IconButton>
          <Button onClick={onSwitchIdentity}>
            <LogOut size={12} /> {isMobile ? identity.name : "Switch"}
          </Button>
        </div>
      </header>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.isSelf ? "Delete your account?" : `Remove ${confirmDelete.name} from the roster?`}
          warning={
            confirmDelete.isAdminRemovingOther
              ? `Admin warning: you are about to remove ${confirmDelete.name}. Their collection (${confirmDelete.collectionCount} cards) and wishlist (${confirmDelete.wishlistCount} cards) will be deleted. This cannot be undone.`
              : undefined
          }
          message={
            confirmDelete.isSelf
              ? "This permanently deletes your account, collection, and wishlist. This cannot be undone."
              : `This permanently removes ${confirmDelete.name} from the roster and deletes all their saved lists.`
          }
          confirmLabel={confirmDelete.isSelf ? "Delete my account" : "Remove trader"}
          onConfirm={confirmRemoveFriend}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {toast && <Toast message={toast} />}

      {error && <div className="warning-banner warning-banner--flush">{error}</div>}

      <div className="layout">
        {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

        <aside className={`roster${sidebarOpen ? " is-open" : ""}`}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div className="roster__label">
              <Users size={13} /> Roster
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <IconButton bare onClick={refreshFriends} title="Refresh">
                <RefreshCw size={13} />
              </IconButton>
              <IconButton className="roster-close" bare onClick={() => setSidebarOpen(false)} title="Close">
                <X size={16} />
              </IconButton>
            </div>
          </div>

          {loadingFriends ? (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Loading…</div>
          ) : rosterFriends.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic" }}>No traders yet.</div>
          ) : (
            rosterFriends.map((f) => {
              const isSelf = f.id === identity.id;
              const canEdit = isSelf || identity.isAdmin;
              return (
                <div
                  key={f.id}
                  className={`roster-item ${!onTrades && binderFriendId === f.id ? "is-selected" : ""} ${!canEdit ? "is-disabled" : ""}`}
                  onClick={() => {
                    if (!canEdit) return;
                    showBinder(f.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                >
                  <div className="avatar" aria-hidden>
                    {f.name.trim().slice(0, 2).toUpperCase()}
                  </div>
                  <div className="roster-item__meta">
                    <div className="roster-item__name">
                      {f.name}
                      {isSelf && <span className="roster-item__tag">you</span>}
                      {priorityFriendName === f.name && (
                        <span className="roster-item__tag">prio</span>
                      )}
                    </div>
                    <div className="roster-item__counts">
                      {f.collection_count} coll · {f.wishlist_count} wish
                    </div>
                  </div>
                  {(isSelf || identity.isAdmin) && (
                    <IconButton
                      bare
                      onClick={(e) => {
                        e.stopPropagation();
                        requestRemoveFriend(f.id);
                      }}
                      title={isSelf ? "Delete my account" : "Remove this trader (admin)"}
                    >
                      <X size={14} />
                    </IconButton>
                  )}
                </div>
              );
            })
          )}

          <div className="roster__hint">
            New traders create their own account from the sign-in screen — have them open this app's URL. You can only edit your own collection and wishlist.
          </div>
        </aside>

        <main className="main">
          <div className="toolbar">
            <div className="segmented toolbar-tabs">
              <button type="button" className={onTrades ? "is-active" : ""} onClick={showTrades}>
                Trades
              </button>
              <button type="button" className={!onTrades ? "is-active" : ""} onClick={() => showBinder()}>
                Binder
              </button>
            </div>
            {onTrades && friends.length >= 2 && (
              <label className="toolbar-label">
                <Star size={13} color={priorityFriendName ? "var(--gold)" : "var(--muted)"} fill={priorityFriendName ? "var(--gold)" : "none"} />
                Priority
                <select
                  className="field field--compact"
                  value={priorityFriendName}
                  onChange={(e) => updatePriorityFriend(e.target.value)}
                  style={{ flex: 1, minWidth: 140, color: priorityFriendName ? "var(--gold)" : undefined }}
                >
                  <option value="">None</option>
                  {friends.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name}
                      {f.id === identity.id ? " (you)" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {onTrades && (
              <div className="toolbar-actions">
                {friends.length >= 2 && (
                  <Button variant="ghost" onClick={calculateMatches} disabled={matchesLoading}>
                    {matchesLoading ? "Refreshing…" : "Refresh trades"}
                  </Button>
                )}
                {matches?.length > 0 && (
                  <Button onClick={exportCsv}>
                    <Download size={13} /> Export CSV
                  </Button>
                )}
              </div>
            )}
          </div>

          <div style={{ display: onTrades ? undefined : "none" }}>
          {friends.length < 2 ? (
            <div className="empty">
              Need at least two traders on the roster before matches can be calculated.
            </div>
          ) : matchesLoading && matches === null ? (
            <div className="empty">Finding trades…</div>
          ) : matches === null ? (
            <div className="empty">
              Could not load trades. Try <strong style={{ color: "var(--gold)" }}>Refresh trades</strong>.
            </div>
          ) : (
            <>
              {(!selfFriend?.collection_count && !selfFriend?.wishlist_count) && (
                <div className="notice" style={{ marginBottom: 16 }}>
                  Your binder is empty. Open the <strong>Binder</strong> tab and add a collection or wishlist so the group can match with you.
                </div>
              )}
              {selfFriend?.wishlist_count === 0 && selfFriend?.collection_count > 0 && viewMode === "mine" && (
                <div className="notice" style={{ marginBottom: 16 }}>
                  Your wishlist is empty, so you will not show up as needing cards. Add wants in the Binder tab.
                </div>
              )}

              {viewMode === "mine" ? (
                <MatchSummary
                  matches={myMatches}
                  userName={identity.name}
                  priorityFriendName={priorityFriendName}
                  mine
                />
              ) : (
                <MatchSummary matches={matches} userName={identity.name} priorityFriendName={priorityFriendName} group />
              )}

              {matches.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13 }}>No matches across the current roster.</div>
              ) : (
                <>
                  <div className="segmented" style={{ marginBottom: 18 }}>
                    {[
                      ["mine", "My trades"],
                      ["pair", "By pair"],
                      ["friend", "By trader"],
                      ["all", "Full list"],
                    ].map(([v, label]) => (
                      <button key={v} className={viewMode === v ? "is-active" : ""} onClick={() => setViewMode(v)}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {viewMode === "mine" && (
                    <div className="split">
                      <div>
                        <div className="section-label">You get</div>
                        <MatchTable
                          rows={sortMatchesByPriority(
                            matches.filter((m) => m.seeker === identity.name),
                            priorityFriendName
                          )}
                          peerLabel="Who has it"
                          peerKey="owner"
                          priorityFriendName={priorityFriendName}
                        />
                      </div>
                      <div>
                        <div className="section-label">You give</div>
                        <MatchTable
                          rows={sortMatchesByPriority(
                            matches.filter((m) => m.owner === identity.name),
                            priorityFriendName
                          )}
                          peerLabel="Who needs it"
                          peerKey="seeker"
                          priorityFriendName={priorityFriendName}
                        />
                      </div>
                    </div>
                  )}

                  {viewMode === "pair" &&
                    pairEntries.map(([key, rows]) => {
                      const [owner, seeker] = key.split("|");
                      return (
                        <Panel key={key} className="pair-card">
                          <div className="panel__header">
                            {owner} <ArrowRight size={13} color="var(--gold)" /> {seeker}
                            <span className="pair-card__count">
                              {rows.length} card{rows.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <MatchTable rows={rows} priorityFriendName={priorityFriendName} />
                        </Panel>
                      );
                    })}

                  {viewMode === "friend" && (
                    <>
                      <select
                        className="field field--compact"
                        value={selectedFriendName || identity.name}
                        onChange={(e) => setSelectedFriendName(e.target.value)}
                        style={{ marginBottom: 16, width: "auto", minWidth: 180 }}
                      >
                        {friends.map((f) => (
                          <option key={f.id}>{f.name}</option>
                        ))}
                      </select>
                      <div className="split">
                        <div>
                          <div className="section-label">{selectedFriendName} can get</div>
                          <MatchTable
                            rows={sortMatchesByPriority(
                              matches.filter((m) => m.seeker === selectedFriendName),
                              priorityFriendName
                            )}
                            peerLabel="Who has it"
                            peerKey="owner"
                            priorityFriendName={priorityFriendName}
                          />
                        </div>
                        <div>
                          <div className="section-label">{selectedFriendName} can give</div>
                          <MatchTable
                            rows={sortMatchesByPriority(
                              matches.filter((m) => m.owner === selectedFriendName),
                              priorityFriendName
                            )}
                            peerLabel="Who needs it"
                            peerKey="seeker"
                            priorityFriendName={priorityFriendName}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {viewMode === "all" && (
                    <MatchTable rows={matches} showBoth priorityFriendName={priorityFriendName} />
                  )}
                </>
              )}
            </>
          )}
          </div>

          {binderVisited && binderFriend && (
            <div style={{ display: onTrades ? "none" : undefined }}>
              <FriendEditor
                key={binderFriend.id}
                friend={binderFriend}
                isAdminEditing={binderFriend.id !== identity.id}
                onClose={showTrades}
                onSaved={() => {
                  refreshFriends();
                  setToast("Changes saved.");
                }}
                setError={setError}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (e2) {
      setError(e2.message);
    }
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal__header">
          <h2 className="panel__title">Change password</h2>
          <IconButton bare onClick={onClose} title="Close">
            <X size={16} />
          </IconButton>
        </div>

        {success ? (
          <div>
            <div style={{ fontSize: 13, marginBottom: 16 }}>Password updated.</div>
            <Button variant="primary" onClick={onClose} style={{ width: "100%" }}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <TextField
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              type="password"
              autoComplete="current-password"
            />
            <TextField
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              type="password"
              autoComplete="new-password"
            />
            <TextField
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              type="password"
              autoComplete="new-password"
            />
            <div style={{ fontSize: 11, color: "var(--muted)" }}>At least 6 characters.</div>
            {error && <div className="warning-banner">{error}</div>}
            <Button type="submit" variant="primary" disabled={busy || !currentPassword || !newPassword || !confirm}>
              {busy ? "…" : "Update password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function FriendEditor({ friend, isAdminEditing, onClose, onSaved, onListsChange, setError }) {
  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [saving, setSaving] = useState(false);
  const [replacePlatform, setReplacePlatform] = useState({ collection: "Archidekt", wishlist: "Archidekt" });
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  async function submitResetPassword(e) {
    e.preventDefault();
    setResetBusy(true);
    setError("");
    try {
      await api.resetPassword(friend.id, resetPasswordValue);
      setResetDone(true);
      setResetPasswordValue("");
    } catch (e2) {
      setError(e2.message);
    }
    setResetBusy(false);
  }

  useEffect(() => {
    setLoading(true);
    api
      .getFriend(friend.id)
      .then((data) => {
        const coll = data.collection.map((c) => ({ cardName: c.card_name, qty: c.qty }));
        const wish = data.wishlist.map((c) => ({ cardName: c.card_name, qty: c.qty }));
        setCollection(coll);
        setWishlist(wish);
        onListsChange?.({ collection: data.collection, wishlist: data.wishlist });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [friend.id]);

  useEffect(() => {
    if (loading) return;
    onListsChange?.({
      collection: collection.map((c) => ({ card_name: c.cardName, qty: c.qty })),
      wishlist: wishlist.map((c) => ({ card_name: c.cardName, qty: c.qty })),
    });
  }, [collection, wishlist, loading]);

  function updateRow(list, setList, i, field, value) {
    setList((prev) => {
      const next = [...prev];
      const row = { ...next[i] };
      if (field === "name") row.cardName = value;
      else if (field === "qty") {
        const q = parseInt(value, 10);
        row.qty = Number.isFinite(q) && q > 0 ? q : 1;
      }
      next[i] = row;
      return next;
    });
  }

  function removeRowAt(list, i) {
    return list.filter((_, idx) => idx !== i);
  }

  function addRow(list, cardName, qty) {
    const trimmed = cardName.trim();
    if (!trimmed) return list;
    const q = parseInt(qty, 10);
    return [...list, { cardName: trimmed, qty: Number.isFinite(q) && q > 0 ? q : 1 }];
  }

  async function persistLists(coll, wish) {
    setSaving(true);
    setError("");
    try {
      const collRows = coll.filter((r) => r.cardName.trim());
      const wishRows = wish.filter((r) => r.cardName.trim());
      await api.replaceCollection(friend.id, collRows);
      await api.replaceWishlist(friend.id, wishRows);
      onListsChange?.({
        collection: collRows.map((c) => ({ card_name: c.cardName, qty: c.qty })),
        wishlist: wishRows.map((c) => ({ card_name: c.cardName, qty: c.qty })),
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function addRowAndSave(kind, cardName, qty) {
    const nextCollection = kind === "collection" ? addRow(collection, cardName, qty) : collection;
    const nextWishlist = kind === "wishlist" ? addRow(wishlist, cardName, qty) : wishlist;
    if (nextCollection === collection && nextWishlist === wishlist) return;
    setCollection(nextCollection);
    setWishlist(nextWishlist);
    await persistLists(nextCollection, nextWishlist);
  }

  async function removeRowAndSave(kind, i) {
    const nextCollection = kind === "collection" ? removeRowAt(collection, i) : collection;
    const nextWishlist = kind === "wishlist" ? removeRowAt(wishlist, i) : wishlist;
    setCollection(nextCollection);
    setWishlist(nextWishlist);
    await persistLists(nextCollection, nextWishlist);
  }

  async function clearListAndSave(kind) {
    if (kind === "collection") {
      if (collection.length === 0) return;
      setCollection([]);
      await persistLists([], wishlist);
      return;
    }
    if (wishlist.length === 0) return;
    setWishlist([]);
    await persistLists(collection, []);
  }

  async function save() {
    await persistLists(collection, wishlist);
  }

  async function replaceFromFile(kind, file, platform) {
    try {
      const rows = parseCsvText(await file.text(), platform);
      if (kind === "collection") setCollection(rows);
      else setWishlist(rows);
    } catch (e) {
      setError(e.message);
    }
  }

  async function replaceFromDeckUrl(rows) {
    setCollection(rows);
  }

  if (loading) return <div style={{ fontSize: 13, color: "var(--muted)" }}>Loading {friend.name}'s lists…</div>;

  const listsEmpty = collection.length === 0 && wishlist.length === 0;
  const collectionOverlapKeys = overlapKeysBetween(collection, wishlist);
  const wishlistOverlapKeys = overlapKeysBetween(wishlist, collection);
  const overlapCount = collectionOverlapKeys.size;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isAdminEditing ? 6 : 20 }}>
        <h2 className="app-title" style={{ fontSize: 22 }}>
          {isAdminEditing ? (
            <>
              Editing <span style={{ color: "var(--gold)" }}>{friend.name}</span>
            </>
          ) : (
            "Your binder"
          )}
        </h2>
      </div>

      {isAdminEditing && (
        <div className="warning-banner" style={{ marginBottom: 14 }}>
          <div style={{ marginBottom: 8 }}>You're editing this as an admin — {friend.name} didn't make this change themselves.</div>
          {!showResetPassword ? (
            <Button type="button" onClick={() => setShowResetPassword(true)}>
              Reset {friend.name}'s password
            </Button>
          ) : resetDone ? (
            <div style={{ fontSize: 12, color: "var(--parchment)" }}>Password reset. Let {friend.name} know their new one.</div>
          ) : (
            <form onSubmit={submitResetPassword} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <TextField
                compact
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="New password for them"
                type="text"
                style={{ maxWidth: 220 }}
              />
              <Button type="submit" variant="primary" disabled={resetBusy || resetPasswordValue.length < 6}>
                {resetBusy ? "…" : "Set"}
              </Button>
              <Button type="button" onClick={() => setShowResetPassword(false)}>Cancel</Button>
            </form>
          )}
        </div>
      )}

      {overlapCount > 0 && (
        <div className="notice">
          <span style={{ fontFamily: "var(--mono)" }}>{overlapCount}</span> card{overlapCount !== 1 ? "s" : ""} appear in both collection and wishlist — highlighted below (already owned but still listed as wanted).
        </div>
      )}

      {listsEmpty && (
        <div className="empty" style={{ marginBottom: 16 }}>
          <div className="panel__title" style={{ marginBottom: 8, color: "var(--parchment)" }}>
            {isAdminEditing ? `Getting started with ${friend.name}'s lists` : "Getting started with your binder"}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Upload a CSV, paste an Archidekt deck/collection link, or add cards one at a time.</li>
            <li>Save when done, then switch to the Trades tab.</li>
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <EditableSection
          title="Collection"
          rows={collection}
          overlapKeys={collectionOverlapKeys}
          onUpdateRow={(i, field, value) => updateRow(collection, setCollection, i, field, value)}
          onRemoveRow={(i) => removeRowAndSave("collection", i)}
          onAddRow={(name, qty) => addRowAndSave("collection", name, qty)}
          onReplaceFile={(file) => replaceFromFile("collection", file, replacePlatform.collection)}
          platform={replacePlatform.collection}
          onPlatformChange={(p) => setReplacePlatform((prev) => ({ ...prev, collection: p }))}
          showDeckLinkImport
          onLoadDeckUrl={replaceFromDeckUrl}
          setError={setError}
          onClearAll={() => clearListAndSave("collection")}
          onSave={save}
          saving={saving}
        />
        <EditableSection
          title="Wishlist"
          rows={wishlist}
          overlapKeys={wishlistOverlapKeys}
          onUpdateRow={(i, field, value) => updateRow(wishlist, setWishlist, i, field, value)}
          onRemoveRow={(i) => removeRowAndSave("wishlist", i)}
          onAddRow={(name, qty) => addRowAndSave("wishlist", name, qty)}
          onReplaceFile={(file) => replaceFromFile("wishlist", file, replacePlatform.wishlist)}
          platform={replacePlatform.wishlist}
          onPlatformChange={(p) => setReplacePlatform((prev) => ({ ...prev, wishlist: p }))}
          onClearAll={() => clearListAndSave("wishlist")}
          onSave={save}
          saving={saving}
        />
      </div>
    </div>
  );
}

function EditableSection({ title, rows, overlapKeys, onUpdateRow, onRemoveRow, onAddRow, onReplaceFile, platform, onPlatformChange, showDeckLinkImport, onLoadDeckUrl, setError, onSave, onClearAll, saving }) {
  const [filter, setFilter] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !q || row.cardName.toLowerCase().includes(q));
  }, [rows, filter]);

  return (
    <div className="panel" style={{ flex: 1, minWidth: 320 }}>
      <div className="panel__header">
        <span className="panel__title">{title}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="roster-item__counts">
            {filter.trim() ? `${filtered.length} / ${rows.length}` : rows.length} cards
          </span>
          {onClearAll && rows.length > 0 && (
            <Button type="button" onClick={() => setConfirmClear(true)} disabled={saving}>
              Clear all
            </Button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar__inner">
          <Search size={12} color="var(--muted)" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cards…"
          />
          {filter && (
            <button type="button" onClick={() => setFilter("")} aria-label="Clear filter">
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div className="table-wrap">
        {filtered.length === 0 ? (
          <div className="table-empty">
            {filter.trim() ? "No cards match your filter." : "No cards yet — add one below or import a CSV."}
          </div>
        ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Card name</th>
              <th style={{ width: 70 }}>Qty</th>
              <th style={{ width: 36 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, index }) => {
              const isOverlap = overlapKeys?.has(matchKey(row.cardName));
              return (
              <tr key={index} className={isOverlap ? "is-overlap" : undefined}>
                <td>
                  <CardHover name={row.cardName} className="card-hover--fill">
                    <TextField
                      compact
                      value={row.cardName}
                      onChange={(e) => onUpdateRow(index, "name", e.target.value)}
                      title={isOverlap ? "Also on your other list" : undefined}
                      className={isOverlap ? "is-overlap" : undefined}
                    />
                  </CardHover>
                </td>
                <td>
                  <TextField
                    compact
                    type="number"
                    min="1"
                    value={row.qty}
                    onChange={(e) => onUpdateRow(index, "qty", e.target.value)}
                    className="field--qty"
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <IconButton bare type="button" onClick={() => onRemoveRow(index)} title="Remove card">
                    <X size={12} />
                  </IconButton>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>

      <AddCardForm onAdd={onAddRow} />

      <ImportSection
        platform={platform}
        onPlatformChange={onPlatformChange}
        onReplaceFile={onReplaceFile}
        showDeckLinkImport={showDeckLinkImport}
        onLoadDeckUrl={onLoadDeckUrl}
        setError={setError}
        onSave={onSave}
        saving={saving}
      />

      {confirmClear && (
        <ConfirmModal
          title={`Clear ${title.toLowerCase()}?`}
          message={`This permanently deletes all ${rows.length} cards from the ${title.toLowerCase()} and overwrites the saved list. This cannot be undone.`}
          confirmLabel={`Clear ${title.toLowerCase()}`}
          onConfirm={async () => {
            setConfirmClear(false);
            await onClearAll();
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}

function SaveChangesButton({ onSave, saving, style }) {
  if (!onSave) return null;
  return (
    <Button type="button" variant="primary" onClick={onSave} disabled={saving} style={style}>
      {saving ? "Saving…" : "Save changes"}
    </Button>
  );
}

function ImportSection({ platform, onPlatformChange, onReplaceFile, showDeckLinkImport, onLoadDeckUrl, setError, onSave, saving }) {
  const csvInputRef = useRef(null);

  return (
    <div className="well">
      <div className="roster__label" style={{ marginBottom: 10 }}>
        Import
      </div>

      <div style={{ marginBottom: showDeckLinkImport ? 12 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--muted)", marginBottom: 8 }}>
          <Upload size={12} color="var(--gold)" />
          Replace from CSV
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <select
            className="field field--compact"
            value={platform}
            onChange={(e) => onPlatformChange(e.target.value)}
            style={{ width: "auto" }}
          >
            {Object.keys(PLATFORM_MAPPINGS).map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <Button type="button" variant="ghost" onClick={() => csvInputRef.current?.click()}>
            <Upload size={12} /> Load CSV
          </Button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onReplaceFile(f);
              e.target.value = "";
            }}
          />
          <SaveChangesButton onSave={onSave} saving={saving} />
        </div>
        <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted)", lineHeight: 1.4 }}>
          Save changes overwrites the current list.
        </div>
      </div>

      {showDeckLinkImport && (
        <div className="well__divider">
          <DeckLinkImport onLoad={onLoadDeckUrl} setError={setError} embedded onSave={onSave} saving={saving} />
        </div>
      )}
    </div>
  );
}

function DeckLinkImport({ onLoad, setError, embedded, onSave, saving }) {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");

  async function loadFromUrl(rawUrl) {
    const trimmed = String(rawUrl || "").trim();
    if (!trimmed) return;
    if (!looksLikeDeckUrl(trimmed)) {
      setError("Paste a public Archidekt deck or collection link.");
      return;
    }
    setLoading(true);
    setHint("");
    setError("");
    try {
      const data = await api.importDeckFromUrl(trimmed);
      onLoad(data.cards.map((c) => ({ cardName: c.cardName, qty: c.qty })));
      const label = data.deckName ? `"${data.deckName}"` : "list";
      setHint(`Loaded ${data.cards.length} cards from ${label}. Hit Save to keep.`);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  const content = (
    <>
      <div className="section-label section-label--muted">
        <Link2 size={12} color="var(--gold)" />
        Load from Archidekt deck or collection link
      </div>
      <div className="import-row">
        <TextField
          compact
          className="field--grow"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="archidekt.com/decks/… or collection/v2/…"
        />
        <Button type="button" variant="ghost" onClick={() => loadFromUrl(url)} disabled={loading || !url.trim()}>
          {loading ? "Loading…" : "Load deck"}
        </Button>
        <SaveChangesButton onSave={onSave} saving={saving} />
      </div>
      {hint && <div className="hint hint--gold">{hint}</div>}
      <div className="hint">
        Public decks and collections only. Replaces the current list — save when you are happy with it.
      </div>
    </>
  );

  if (embedded) return content;

  return (
    <div className="well">
      {content}
    </div>
  );
}

function AddCardForm({ onAdd }) {
  const [cardName, setCardName] = useState("");
  const [qty, setQty] = useState(1);
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const debounceRef = useRef(null);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (cardName.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const names = await fetchCardSuggestions(cardName);
      setSuggestions(names.slice(0, 8));
      setActiveSuggestion(-1);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cardName]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pickSuggestion(name) {
    setCardName(name);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function submit(e) {
    e.preventDefault();
    if (!cardName.trim()) return;
    onAdd(cardName, qty);
    setCardName("");
    setQty(1);
    setSuggestions([]);
    setShowSuggestions(false);
  }

  function onKeyDown(e) {
    if (!showSuggestions || !suggestions.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveSuggestion((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeSuggestion >= 0) {
      e.preventDefault();
      pickSuggestion(suggestions[activeSuggestion]);
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  return (
    <form onSubmit={submit} className={`add-card${showSuggestions && suggestions.length ? " is-open" : ""}`}>
      <div ref={wrapRef} style={{ flex: 1, position: "relative", overflow: "visible" }}>
        <CardHover name={cardName} className="card-hover--fill">
          <TextField
            compact
            value={cardName}
            onChange={(e) => {
              setCardName(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onKeyDown={onKeyDown}
            placeholder="Card name"
            autoComplete="off"
          />
        </CardHover>
        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions">
            {suggestions.map((name, i) => (
              <CardHover key={name} name={name} className="card-hover--fill">
                <button
                  type="button"
                  className={i === activeSuggestion ? "is-active" : undefined}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickSuggestion(name)}
                >
                  {name}
                </button>
              </CardHover>
            ))}
          </div>
        )}
      </div>
      <TextField
        compact
        type="number"
        min="1"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className="field--qty"
      />
      <Button type="submit" variant="ghost">
        <Plus size={12} /> Add
      </Button>
    </form>
  );
}

function OwnerPeerCell({ primary, others, priorityFriendName }) {
  const [open, setOpen] = useState(false);
  if (!primary) return null;
  const isPrio = primary === priorityFriendName;
  return (
    <span style={{ display: "inline-block" }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
        <span className={isPrio ? "is-prio" : undefined}>{primary}</span>
        {others?.length > 0 && (
          <button
            type="button"
            className="chip-more"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${others.length} more owner${others.length !== 1 ? "s" : ""}`}
            title={`Also has it: ${others.join(", ")}`}
          >
            +{others.length}
          </button>
        )}
      </span>
      {open && others?.length > 0 && (
        <span className="muted" style={{ display: "block", marginTop: 4, fontSize: 11, lineHeight: 1.4 }}>
          Also has it:{" "}
          {others.map((name, i) => (
            <React.Fragment key={name}>
              {i > 0 && ", "}
              <span className={name === priorityFriendName ? "is-prio" : undefined}>{name}</span>
            </React.Fragment>
          ))}
        </span>
      )}
    </span>
  );
}

function MatchTable({ rows, peerLabel, peerKey, showBoth, priorityFriendName, ownedOverlapKeys }) {
  const aggregateOwners = peerKey === "owner" || showBoth;
  const displayRows = aggregateOwners
    ? aggregateCanGetRows(rows, priorityFriendName, showBoth)
    : rows;
  if (!displayRows.length) return <div className="table-empty">None right now.</div>;
  return (
    <div className="table-scroll">
    <table className="data-table">
      <thead>
        <tr>
          <th>Card</th>
          {showBoth && <th>Has it</th>}
          {showBoth && <th>Needs it</th>}
          {!showBoth && peerLabel && <th>{peerLabel}</th>}
          <th style={{ textAlign: "right" }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {displayRows.map((r, i) => {
          const isPrio = matchInvolvesFriend(r, priorityFriendName);
          const alreadyOwned = ownedOverlapKeys?.has(matchKey(r.cardName));
          return (
          <tr key={i} className={alreadyOwned ? "is-overlap" : isPrio ? "is-priority" : undefined}>
            <td className={alreadyOwned ? "is-gold" : undefined} title={alreadyOwned ? "Already in collection and wishlist" : undefined}>
              <span className="pip" style={{ background: PIPS[pipFor(r.cardName)] }} />
              <CardHover name={r.cardName}>{r.cardName}</CardHover>
              {alreadyOwned && <span className="tag">owned already</span>}
            </td>
            {showBoth && (
              <td>
                <OwnerPeerCell primary={r.owner} others={r.otherOwners} priorityFriendName={priorityFriendName} />
              </td>
            )}
            {showBoth && <td className={r.seeker === priorityFriendName ? "is-prio" : undefined}>{r.seeker}</td>}
            {!showBoth && peerKey === "owner" && (
              <td>
                <OwnerPeerCell primary={r.owner} others={r.otherOwners} priorityFriendName={priorityFriendName} />
              </td>
            )}
            {!showBoth && peerKey && peerKey !== "owner" && (
              <td className={r[peerKey] === priorityFriendName ? "is-prio" : undefined}>
                {r[peerKey]}
              </td>
            )}
            <td className="qty">{r.tradeAvailable}</td>
          </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

function MatchSummary({ matches, userName, priorityFriendName, label, group, mine }) {
  if (!matches?.length) return null;
  const stats = buildMatchSummary(matches, userName, priorityFriendName);
  const who = label || userName;
  return (
    <div className="stats-row">
      {mine ? (
        <>
          You get <strong>{stats.userCanGet}</strong>
          {" · "}
          You give <strong>{stats.userCanGive}</strong>
        </>
      ) : (
        <>
          <strong>{stats.total}</strong>{" "}
          {group ? "potential transfers across the group" : `transfers for ${who}`}
        </>
      )}
      {priorityFriendName && stats.involvingPriority > 0 && (
        <>
          {" "}
          · <strong>{stats.involvingPriority}</strong> involve{" "}
          <span className="is-prio">{priorityFriendName}</span>
        </>
      )}
      {!mine && (stats.userCanGet > 0 || stats.userCanGive > 0) && (
        <>
          {" "}
          · {group ? "You" : who} can get <strong>{stats.userCanGet}</strong>, give{" "}
          <strong>{stats.userCanGive}</strong>
        </>
      )}
    </div>
  );
}

function Toast({ message }) {
  return <div className="toast">{message}</div>;
}

function ConfirmModal({ title, message, warning, confirmLabel, onConfirm, onCancel }) {
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className={`modal ${warning ? "modal--warning" : ""}`} onClick={(e) => e.stopPropagation()}>
        <h2 className="panel__title" style={{ marginBottom: 10 }}>{title}</h2>
        {warning && <div className="warning-banner">{warning}</div>}
        <p>{message}</p>
        <div className="actions">
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}
