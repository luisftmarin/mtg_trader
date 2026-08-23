import React, { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import { Plus, X, Upload, ArrowRight, Download, Users, LogOut, RefreshCw, Key, Menu, Star, Search } from "lucide-react";
import { api } from "./api.js";

const COLORS = {
  ink: "#14161C",
  panel: "#1B1E27",
  panelRaised: "#22262F",
  hair: "#333844",
  parchment: "#ECE7DD",
  parchmentDim: "#A6A79C",
  gold: "#C9A227",
};

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

function sortPairEntries(entries, priorityName) {
  if (!priorityName) return entries;
  return [...entries].sort(([keyA], [keyB]) => {
    const [ownerA, seekerA] = keyA.split("|");
    const [ownerB, seekerB] = keyB.split("|");
    const aPrio = ownerA === priorityName || seekerA === priorityName ? 0 : 1;
    const bPrio = ownerB === priorityName || seekerB === priorityName ? 0 : 1;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return keyA.localeCompare(keyB);
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

async function fetchCardSuggestions(query) {
  if (query.trim().length < 2) return [];
  const res = await fetch(`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(query.trim())}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.data || [];
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
    <div style={{ minHeight: "100vh", background: COLORS.ink, color: COLORS.parchment, fontFamily: "'Inter', sans-serif", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap'); * { box-sizing: border-box; } input, button { font-family: inherit; }`}</style>
      <div style={{ width: 380, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: 28, background: COLORS.panel }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: COLORS.gold, textTransform: "uppercase", marginBottom: 6 }}>Trade with Friends</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22, margin: "0 0 18px" }}>
          {mode === "login" ? "Sign in" : mode === "claim" ? "Claim your existing name" : "Create an account"}
        </h1>

        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[["login", "Sign in"], ["register", "Create account"]].map(([m, label]) => {
            const active = mode === m || (mode === "claim" && m === "login");
            return (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError("");
                }}
                style={{
                  flex: 1,
                  padding: "7px 0",
                  fontSize: 12,
                  borderRadius: 4,
                  border: `1px solid ${active ? COLORS.gold : COLORS.hair}`,
                  background: active ? "rgba(201,162,39,0.12)" : "transparent",
                  color: active ? COLORS.gold : COLORS.parchmentDim,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {mode === "claim" && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: COLORS.parchmentDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Pick your name
            </div>
            {unclaimed === null ? (
              <div style={{ fontSize: 12, color: COLORS.parchmentDim }}>Loading…</div>
            ) : unclaimed.length === 0 ? (
              <div style={{ fontSize: 12, color: COLORS.parchmentDim, fontStyle: "italic" }}>
                No unclaimed traders found — everyone already has a password, or the roster is empty.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 160, overflowY: "auto" }}>
                {unclaimed.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setName(f.name)}
                    style={{
                      textAlign: "left",
                      background: name === f.name ? "rgba(201,162,39,0.12)" : COLORS.panelRaised,
                      border: `1px solid ${name === f.name ? COLORS.gold : COLORS.hair}`,
                      borderRadius: 4,
                      padding: "8px 10px",
                      color: name === f.name ? COLORS.gold : COLORS.parchment,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    {f.name}
                    <span style={{ float: "right", fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.collection_count} coll · {f.wishlist_count} wish
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="username"
            style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
          />
          {mode === "login" && (
            <button
              type="button"
              onClick={() => {
                setMode("claim");
                setError("");
              }}
              style={{ background: "none", border: "none", color: COLORS.parchmentDim, fontSize: 11, textAlign: "left", cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              Existing trader without a password? Claim this name
            </button>
          )}
          {mode === "claim" && (
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setError("");
                setName("");
                setUnclaimed(null);
              }}
              style={{ background: "none", border: "none", color: COLORS.parchmentDim, fontSize: 11, textAlign: "left", cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              Back to sign in
            </button>
          )}
          {mode === "register" && (
            <>
              <div style={{ fontSize: 11, color: COLORS.parchmentDim }}>At least 6 characters.</div>
              {showAdminCode ? (
                <input
                  value={adminCode}
                  onChange={(e) => setAdminCode(e.target.value)}
                  placeholder="Admin code"
                  type="password"
                  style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdminCode(true)}
                  style={{ background: "none", border: "none", color: COLORS.parchmentDim, fontSize: 11, textAlign: "left", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                >
                  Have an admin code?
                </button>
              )}
            </>
          )}
          {error && <div style={{ fontSize: 12, color: "#D9736A" }}>{error}</div>}
          <button
            type="submit"
            disabled={busy || !name.trim() || !password}
            style={{ background: COLORS.gold, border: "none", color: COLORS.ink, borderRadius: 4, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1, marginTop: 4 }}
          >
            {busy ? "…" : mode === "login" ? "Sign in" : mode === "claim" ? "Set password" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

function MainApp({ identity, onSwitchIdentity }) {
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [error, setError] = useState("");
  const [editingFriendId, setEditingFriendId] = useState(null);
  const [matches, setMatches] = useState(null);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [viewMode, setViewMode] = useState("pair");
  const [selectedFriendName, setSelectedFriendName] = useState(null);
  const forceMobilePreview = new URLSearchParams(window.location.search).get("mobile") === "1";
  const [isMobile, setIsMobile] = useState(() => forceMobilePreview || window.innerWidth <= 768);
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

  async function calculateMatches() {
    setMatchesLoading(true);
    setError("");
    try {
      const result = await api.getMatches();
      setMatches(result);
      if (priorityFriendName && friends.some((f) => f.name === priorityFriendName)) {
        setSelectedFriendName(priorityFriendName);
      } else if (editingFriend) {
        setSelectedFriendName(editingFriend.name);
      } else if (result.length && !selectedFriendName) {
        setSelectedFriendName(result[0].seeker);
      }
    } catch (e) {
      setError(e.message);
    }
    setMatchesLoading(false);
  }

  function resetMatches() {
    setMatches(null);
    if (!editingFriendId) {
      setEditingFriendId(identity.id);
    }
  }

  function requestRemoveFriend(id) {
    const friend = friends.find((f) => f.id === id);
    if (!friend) return;
    setConfirmDelete({ id, name: friend.name, isSelf: id === identity.id });
  }

  async function confirmRemoveFriend() {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    try {
      await api.deleteFriend(id);
      if (editingFriendId === id) setEditingFriendId(null);
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

  const sortedPairEntries = useMemo(
    () => sortPairEntries(Object.entries(byPair), priorityFriendName),
    [byPair, priorityFriendName]
  );

  function exportCsv() {
    if (!matches || !matches.length) return;
    const header = "Who Has It,Who Needs It,Card Name,Seeker Needs,Owner Has,Trade Available\n";
    const rows = sortMatchesByPriority(matches, priorityFriendName)
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

  const editingFriend = friends.find((f) => f.id === editingFriendId);

  return (
    <div style={{ minHeight: "100vh", background: COLORS.ink, color: COLORS.parchment, fontFamily: "'Inter', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        input, select, button { font-family: inherit; }
        ::placeholder { color: ${COLORS.parchmentDim}; opacity: 0.6; }
      `}</style>

      <header style={{ padding: isMobile ? "14px 16px" : "20px 28px", borderBottom: `1px solid ${COLORS.hair}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          {isMobile && (
            <button
              onClick={() => setSidebarOpen(true)}
              style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchment, borderRadius: 4, padding: "6px 8px", cursor: "pointer", flexShrink: 0 }}
            >
              <Menu size={16} />
            </button>
          )}
          <div
            onClick={() => setEditingFriendId(null)}
            style={{ minWidth: 0, cursor: "pointer" }}
            title="Back to main page"
          >
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: COLORS.gold, textTransform: "uppercase", marginBottom: 2 }}>Trade with Friends</div>
            <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: isMobile ? 18 : 26, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {isMobile ? "Binder Exchange" : "Group Binder Exchange"}
            </h1>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: isMobile ? 8 : 14, flexShrink: 0 }}>
          {!isMobile && (
            <div style={{ fontSize: 12, color: COLORS.parchmentDim }}>
              Signed in as <span style={{ color: COLORS.parchment, fontWeight: 500 }}>{identity.name}</span>
              {identity.isAdmin && (
                <span style={{ marginLeft: 8, fontSize: 10, color: COLORS.gold, border: `1px solid ${COLORS.gold}`, borderRadius: 3, padding: "1px 6px" }}>
                  ADMIN
                </span>
              )}
            </div>
          )}
          <button onClick={() => setShowChangePassword(true)} title="Change password" style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "6px 8px", cursor: "pointer", display: "flex", alignItems: "center" }}>
            <Key size={13} />
          </button>
          <button onClick={onSwitchIdentity} style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <LogOut size={12} /> {isMobile ? identity.name : "Switch"}
          </button>
        </div>
      </header>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {confirmDelete && (
        <ConfirmModal
          title={confirmDelete.isSelf ? "Delete your account?" : `Remove ${confirmDelete.name}?`}
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

      {error && (
        <div style={{ background: "rgba(217,115,106,0.12)", color: "#D9736A", padding: isMobile ? "8px 16px" : "8px 28px", fontSize: 12 }}>{error}</div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative" }}>
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 40 }}
          />
        )}

        <aside
          style={
            isMobile
              ? {
                  position: "fixed",
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: "85%",
                  maxWidth: 320,
                  background: COLORS.ink,
                  borderRight: `1px solid ${COLORS.hair}`,
                  padding: 20,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  zIndex: 50,
                  overflowY: "auto",
                  transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                  transition: "transform 0.2s ease",
                }
              : { width: 320, borderRight: `1px solid ${COLORS.hair}`, padding: 20, display: "flex", flexDirection: "column", gap: 10 }
          }
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.parchmentDim, display: "flex", alignItems: "center", gap: 6 }}>
              <Users size={13} /> Roster
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={refreshFriends} title="Refresh" style={{ background: "none", border: "none", color: COLORS.parchmentDim, cursor: "pointer", padding: 2 }}>
                <RefreshCw size={13} />
              </button>
              {isMobile && (
                <button onClick={() => setSidebarOpen(false)} style={{ background: "none", border: "none", color: COLORS.parchmentDim, cursor: "pointer", padding: 2 }}>
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          {loadingFriends ? (
            <div style={{ fontSize: 12, color: COLORS.parchmentDim }}>Loading…</div>
          ) : friends.length === 0 ? (
            <div style={{ fontSize: 12, color: COLORS.parchmentDim, fontStyle: "italic" }}>No traders yet.</div>
          ) : (
            friends.map((f) => {
              const isSelf = f.id === identity.id;
              const canEdit = isSelf || identity.isAdmin;
              return (
                <div
                  key={f.id}
                  onClick={() => {
                    if (!canEdit) return;
                    setEditingFriendId(f.id);
                    if (isMobile) setSidebarOpen(false);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: editingFriendId === f.id ? COLORS.panelRaised : COLORS.panel,
                    border: `1px solid ${editingFriendId === f.id ? COLORS.gold : COLORS.hair}`,
                    borderRadius: 4,
                    padding: "8px 10px",
                    cursor: canEdit ? "pointer" : "default",
                    opacity: canEdit ? 1 : 0.85,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {f.name}
                      {isSelf && <span style={{ color: COLORS.gold, fontSize: 10, marginLeft: 6 }}>you</span>}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
                      {f.collection_count} coll · {f.wishlist_count} wish
                    </div>
                  </div>
                  {(isSelf || identity.isAdmin) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        requestRemoveFriend(f.id);
                      }}
                      title={isSelf ? "Delete my account" : "Remove this trader (admin)"}
                      style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.parchmentDim, padding: 4 }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })
          )}

          <div style={{ fontSize: 11, color: COLORS.parchmentDim, marginTop: 6 }}>
            New traders create their own account from the sign-in screen — have them open this app's URL. You can only edit your own collection and wishlist.
          </div>
        </aside>

        <main style={{ flex: 1, padding: isMobile ? 16 : 28, overflow: "auto", minWidth: 0 }}>
          <div
            style={{
              marginBottom: 22,
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              alignItems: isMobile ? "stretch" : "center",
              gap: 10,
              flexWrap: "wrap",
              position: "sticky",
              top: 0,
              background: COLORS.ink,
              zIndex: 10,
              paddingTop: 2,
              paddingBottom: 2,
            }}
          >
            {friends.length >= 2 && (
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 12,
                  color: COLORS.parchmentDim,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                <Star size={13} color={priorityFriendName ? COLORS.gold : COLORS.parchmentDim} fill={priorityFriendName ? COLORS.gold : "none"} />
                Priority
                <select
                  value={priorityFriendName}
                  onChange={(e) => updatePriorityFriend(e.target.value)}
                  style={{
                    flex: isMobile ? 1 : undefined,
                    background: COLORS.panelRaised,
                    border: `1px solid ${priorityFriendName ? COLORS.gold : COLORS.hair}`,
                    color: priorityFriendName ? COLORS.gold : COLORS.parchment,
                    borderRadius: 4,
                    padding: "8px 10px",
                    fontSize: 12,
                    minWidth: isMobile ? 0 : 140,
                  }}
                >
                  <option value="">None</option>
                  {friends
                    .filter((f) => f.id !== identity.id)
                    .map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", gap: 10, width: isMobile ? "100%" : undefined }}>
              <button
                onClick={calculateMatches}
                disabled={matchesLoading || friends.length < 2}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.gold}`,
                  color: COLORS.gold,
                  borderRadius: 4,
                  padding: "10px 18px",
                  fontSize: 13,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  cursor: matchesLoading || friends.length < 2 ? "default" : "pointer",
                  opacity: matchesLoading || friends.length < 2 ? 0.5 : 1,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                {matchesLoading ? "Calculating…" : "Calculate group matches"}
              </button>
              <button
                onClick={resetMatches}
                disabled={matches === null}
                title="Clear matches and return to collection/wishlist"
                style={{
                  background: "none",
                  border: `1px solid ${COLORS.hair}`,
                  color: COLORS.parchmentDim,
                  borderRadius: 4,
                  padding: "10px 14px",
                  fontSize: 12,
                  cursor: matches === null ? "default" : "pointer",
                  opacity: matches === null ? 0.5 : 1,
                  width: isMobile ? "100%" : undefined,
                }}
              >
                Reset
              </button>
              {editingFriend && (
                <button
                  onClick={() => setEditingFriendId(null)}
                  style={{
                    background: "none",
                    border: `1px solid ${COLORS.hair}`,
                    color: COLORS.parchmentDim,
                    borderRadius: 4,
                    padding: "10px 14px",
                    fontSize: 12,
                    cursor: "pointer",
                    width: isMobile ? "100%" : undefined,
                  }}
                >
                  ← Back to main page
                </button>
              )}
            </div>
          </div>

          {editingFriend ? (
            <>
              {matches !== null && (
                <div style={{ marginBottom: 32, paddingBottom: 24, borderBottom: `1px solid ${COLORS.hair}` }}>
                  <MatchSummary matches={matches} userName={identity.name} priorityFriendName={priorityFriendName} />
                  <div style={{ fontSize: 12, color: COLORS.gold, marginBottom: 14, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {editingFriend.name}'s matches
                  </div>
                  <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <div style={{ fontSize: 12, color: COLORS.parchmentDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Can get</div>
                      <MatchTable
                        rows={sortMatchesByPriority(matches.filter((m) => m.seeker === editingFriend.name), priorityFriendName)}
                        peerLabel="Who has it"
                        peerKey="owner"
                        priorityFriendName={priorityFriendName}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 280 }}>
                      <div style={{ fontSize: 12, color: COLORS.parchmentDim, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Can give</div>
                      <MatchTable
                        rows={sortMatchesByPriority(matches.filter((m) => m.owner === editingFriend.name), priorityFriendName)}
                        peerLabel="Who needs it"
                        peerKey="seeker"
                        priorityFriendName={priorityFriendName}
                      />
                    </div>
                  </div>
                </div>
              )}
              <FriendEditor
                friend={editingFriend}
                isAdminEditing={editingFriend.id !== identity.id}
                onClose={() => setEditingFriendId(null)}
                onSaved={() => {
                  refreshFriends();
                  setToast("Changes saved.");
                }}
                setError={setError}
              />
            </>
          ) : friends.length < 2 ? (
            <div style={{ border: `1px dashed ${COLORS.hair}`, borderRadius: 6, padding: 40, textAlign: "center", color: COLORS.parchmentDim, fontSize: 13 }}>
              Need at least two traders on the roster before matches can be calculated.
            </div>
          ) : matches === null ? (
            <div style={{ border: `1px dashed ${COLORS.hair}`, borderRadius: 6, padding: isMobile ? 24 : 32, color: COLORS.parchmentDim, fontSize: 13, lineHeight: 1.6 }}>
              <div style={{ fontFamily: "'Fraunces', serif", color: COLORS.parchment, fontSize: 16, marginBottom: 10 }}>Ready to find trades?</div>
              <ol style={{ margin: "0 0 0 18px", padding: 0 }}>
                <li>Click your name in the roster to add your collection and wishlist.</li>
                <li>Import a CSV from Archidekt, or add cards manually.</li>
                <li>Once at least two traders have lists, hit <strong style={{ color: COLORS.gold }}>Calculate group matches</strong>.</li>
              </ol>
            </div>
          ) : (
            <>
              <MatchSummary matches={matches} userName={identity.name} priorityFriendName={priorityFriendName} />
              {matches.length === 0 ? (
                <div style={{ color: COLORS.parchmentDim, fontSize: 13 }}>No matches across the current roster.</div>
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 16 }}>
                    <button onClick={exportCsv} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchment, borderRadius: 4, padding: "6px 12px", fontSize: 12, cursor: "pointer" }}>
                      <Download size={13} /> Export CSV
                    </button>
                  </div>

                  <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
                    {[["pair", "By trade pair"], ["friend", "By trader"], ["all", "Full list"]].map(([v, label]) => (
                      <button
                        key={v}
                        onClick={() => setViewMode(v)}
                        style={{ padding: "6px 14px", fontSize: 12, borderRadius: 4, border: `1px solid ${viewMode === v ? COLORS.gold : COLORS.hair}`, background: viewMode === v ? "rgba(201,162,39,0.1)" : "transparent", color: viewMode === v ? COLORS.gold : COLORS.parchmentDim, cursor: "pointer" }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {viewMode === "pair" &&
                    sortedPairEntries.map(([key, rows]) => {
                      const [owner, seeker] = key.split("|");
                      const isPrio = matchInvolvesFriend({ owner, seeker }, priorityFriendName);
                      return (
                        <div
                          key={key}
                          style={{
                            marginBottom: 14,
                            border: `1px solid ${isPrio ? COLORS.gold : COLORS.hair}`,
                            borderRadius: 6,
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ background: COLORS.panel, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Fraunces', serif", fontSize: 14 }}>
                            {isPrio && <Star size={12} fill={COLORS.gold} color={COLORS.gold} />}
                            {owner} <ArrowRight size={13} color={COLORS.gold} /> {seeker}
                            <span style={{ marginLeft: "auto", fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
                              {rows.length} card{rows.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <MatchTable rows={sortMatchesByPriority(rows, priorityFriendName)} priorityFriendName={priorityFriendName} />
                        </div>
                      );
                    })}

                  {viewMode === "friend" && (
                    <>
                      <select
                        value={selectedFriendName || ""}
                        onChange={(e) => setSelectedFriendName(e.target.value)}
                        style={{ marginBottom: 16, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, color: COLORS.parchment, borderRadius: 4, padding: "7px 10px", fontSize: 13 }}
                      >
                        {friends.map((f) => (
                          <option key={f.id}>{f.name}{priorityFriendName === f.name ? " ★" : ""}</option>
                        ))}
                      </select>
                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ fontSize: 12, color: COLORS.gold, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{selectedFriendName} can get</div>
                          <MatchTable
                            rows={sortMatchesByPriority(matches.filter((m) => m.seeker === selectedFriendName), priorityFriendName)}
                            peerLabel="Who has it"
                            peerKey="owner"
                            priorityFriendName={priorityFriendName}
                          />
                        </div>
                        <div style={{ flex: 1, minWidth: 280 }}>
                          <div style={{ fontSize: 12, color: COLORS.gold, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{selectedFriendName} can give</div>
                          <MatchTable
                            rows={sortMatchesByPriority(matches.filter((m) => m.owner === selectedFriendName), priorityFriendName)}
                            peerLabel="Who needs it"
                            peerKey="seeker"
                            priorityFriendName={priorityFriendName}
                          />
                        </div>
                      </div>
                    </>
                  )}

                  {viewMode === "all" && (
                    <MatchTable rows={sortMatchesByPriority(matches, priorityFriendName)} showBoth priorityFriendName={priorityFriendName} />
                  )}
                </>
              )}
            </>
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 340, background: COLORS.panel, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: 24 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, margin: 0 }}>Change password</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.parchmentDim, cursor: "pointer", padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        {success ? (
          <div>
            <div style={{ fontSize: 13, color: COLORS.parchment, marginBottom: 16 }}>Password updated.</div>
            <button onClick={onClose} style={{ width: "100%", background: COLORS.gold, border: "none", color: COLORS.ink, borderRadius: 4, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              type="password"
              autoComplete="current-password"
              style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
            />
            <input
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              type="password"
              autoComplete="new-password"
              style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
            />
            <input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              type="password"
              autoComplete="new-password"
              style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "9px 10px", color: COLORS.parchment, fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: COLORS.parchmentDim }}>At least 6 characters.</div>
            {error && <div style={{ fontSize: 12, color: "#D9736A" }}>{error}</div>}
            <button
              type="submit"
              disabled={busy || !currentPassword || !newPassword || !confirm}
              style={{ background: COLORS.gold, border: "none", color: COLORS.ink, borderRadius: 4, padding: "9px 0", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: busy ? 0.6 : 1, marginTop: 4 }}
            >
              {busy ? "…" : "Update password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function FriendEditor({ friend, isAdminEditing, onClose, onSaved, setError }) {
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
        setCollection(data.collection.map((c) => ({ cardName: c.card_name, qty: c.qty })));
        setWishlist(data.wishlist.map((c) => ({ cardName: c.card_name, qty: c.qty })));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [friend.id]);

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

  function removeRow(setList, i) {
    setList((prev) => prev.filter((_, idx) => idx !== i));
  }

  function addRow(setList, cardName, qty) {
    const trimmed = cardName.trim();
    if (!trimmed) return;
    const q = parseInt(qty, 10);
    setList((prev) => [...prev, { cardName: trimmed, qty: Number.isFinite(q) && q > 0 ? q : 1 }]);
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

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api.replaceCollection(friend.id, collection.filter((r) => r.cardName.trim()));
      await api.replaceWishlist(friend.id, wishlist.filter((r) => r.cardName.trim()));
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  if (loading) return <div style={{ fontSize: 13, color: COLORS.parchmentDim }}>Loading {friend.name}'s lists…</div>;

  const listsEmpty = collection.length === 0 && wishlist.length === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: isAdminEditing ? 6 : 20 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 20, margin: 0 }}>
          Editing <span style={{ color: COLORS.gold }}>{friend.name}</span>
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "8px 16px", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={save} disabled={saving} style={{ background: COLORS.gold, border: "none", color: COLORS.ink, borderRadius: 4, padding: "8px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {isAdminEditing && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: COLORS.gold, marginBottom: 8 }}>
            You're editing this as an admin — {friend.name} didn't make this change themselves.
          </div>
          {!showResetPassword ? (
            <button
              type="button"
              onClick={() => setShowResetPassword(true)}
              style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}
            >
              Reset {friend.name}'s password
            </button>
          ) : resetDone ? (
            <div style={{ fontSize: 12, color: COLORS.parchment }}>Password reset. Let {friend.name} know their new one.</div>
          ) : (
            <form onSubmit={submitResetPassword} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                value={resetPasswordValue}
                onChange={(e) => setResetPasswordValue(e.target.value)}
                placeholder="New password for them"
                type="text"
                style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "6px 8px", color: COLORS.parchment, fontSize: 12 }}
              />
              <button
                type="submit"
                disabled={resetBusy || resetPasswordValue.length < 6}
                style={{ background: COLORS.gold, border: "none", color: COLORS.ink, borderRadius: 4, padding: "6px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer", opacity: resetBusy ? 0.6 : 1 }}
              >
                {resetBusy ? "…" : "Set"}
              </button>
              <button type="button" onClick={() => setShowResetPassword(false)} style={{ background: "none", border: "none", color: COLORS.parchmentDim, fontSize: 11, cursor: "pointer" }}>
                Cancel
              </button>
            </form>
          )}
        </div>
      )}

      {listsEmpty && (
        <div style={{ border: `1px dashed ${COLORS.hair}`, borderRadius: 6, padding: "16px 18px", marginBottom: 16, fontSize: 12, color: COLORS.parchmentDim, lineHeight: 1.6 }}>
          <div style={{ color: COLORS.parchment, fontWeight: 500, marginBottom: 8 }}>Getting started with {friend.name}'s lists</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Upload a CSV — use <strong style={{ color: COLORS.gold }}>Names only</strong> for Archidekt deck exports.</li>
            <li>Or add cards one at a time — names autocomplete from Scryfall as you type.</li>
            <li>Save when done, then calculate group matches from the main page.</li>
          </ul>
        </div>
      )}

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <EditableSection
          title="Collection"
          rows={collection}
          onUpdateRow={(i, field, value) => updateRow(collection, setCollection, i, field, value)}
          onRemoveRow={(i) => removeRow(setCollection, i)}
          onAddRow={(name, qty) => addRow(setCollection, name, qty)}
          onReplaceFile={(file) => replaceFromFile("collection", file, replacePlatform.collection)}
          platform={replacePlatform.collection}
          onPlatformChange={(p) => setReplacePlatform((prev) => ({ ...prev, collection: p }))}
        />
        <EditableSection
          title="Wishlist"
          rows={wishlist}
          onUpdateRow={(i, field, value) => updateRow(wishlist, setWishlist, i, field, value)}
          onRemoveRow={(i) => removeRow(setWishlist, i)}
          onAddRow={(name, qty) => addRow(setWishlist, name, qty)}
          onReplaceFile={(file) => replaceFromFile("wishlist", file, replacePlatform.wishlist)}
          platform={replacePlatform.wishlist}
          onPlatformChange={(p) => setReplacePlatform((prev) => ({ ...prev, wishlist: p }))}
        />
      </div>
    </div>
  );
}

function EditableSection({ title, rows, onUpdateRow, onRemoveRow, onAddRow, onReplaceFile, platform, onPlatformChange }) {
  const inputRef = useRef(null);
  const [filter, setFilter] = useState("");
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => !q || row.cardName.toLowerCase().includes(q));
  }, [rows, filter]);

  return (
    <div style={{ flex: 1, minWidth: 320, border: `1px solid ${COLORS.hair}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ background: COLORS.panel, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
          {filter.trim() ? `${filtered.length} / ${rows.length}` : rows.length} cards
        </span>
      </div>

      <div style={{ padding: "10px 14px", display: "flex", gap: 6, alignItems: "center", borderBottom: `1px solid ${COLORS.hair}`, flexWrap: "wrap" }}>
        <select value={platform} onChange={(e) => onPlatformChange(e.target.value)} style={{ background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, color: COLORS.parchment, borderRadius: 4, padding: "5px 6px", fontSize: 11 }}>
          {Object.keys(PLATFORM_MAPPINGS).map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button onClick={() => inputRef.current?.click()} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: `1px dashed ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "5px 10px", fontSize: 11, cursor: "pointer" }}>
          <Upload size={12} /> Replace with CSV
        </button>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onReplaceFile(f);
            e.target.value = "";
          }}
        />
      </div>

      <div style={{ padding: "8px 14px", borderBottom: `1px solid ${COLORS.hair}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, padding: "5px 8px" }}>
          <Search size={12} color={COLORS.parchmentDim} />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter cards…"
            style={{ flex: 1, background: "none", border: "none", color: COLORS.parchment, fontSize: 12, outline: "none" }}
          />
          {filter && (
            <button onClick={() => setFilter("")} style={{ background: "none", border: "none", color: COLORS.parchmentDim, cursor: "pointer", padding: 0 }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: COLORS.parchmentDim, fontSize: 12, fontStyle: "italic" }}>
            {filter.trim() ? "No cards match your filter." : "No cards yet — add one below or import a CSV."}
          </div>
        ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.hair}` }}>
              <th style={thStyle}>Card name</th>
              <th style={{ ...thStyle, width: 70 }}>Qty</th>
              <th style={{ ...thStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(({ row, index }) => (
              <tr key={index} style={{ borderBottom: `1px solid rgba(51,56,68,0.5)` }}>
                <td style={{ padding: "4px 6px" }}>
                  <input value={row.cardName} onChange={(e) => onUpdateRow(index, "name", e.target.value)} style={{ width: "100%", background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 3, color: COLORS.parchment, fontSize: 12, padding: "4px 6px" }} />
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <input type="number" min="1" value={row.qty} onChange={(e) => onUpdateRow(index, "qty", e.target.value)} style={{ width: "100%", background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 3, color: COLORS.parchment, fontSize: 12, padding: "4px 6px", fontFamily: "'JetBrains Mono', monospace" }} />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <button onClick={() => onRemoveRow(index)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.parchmentDim, padding: 2 }}>
                    <X size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      <AddCardForm onAdd={onAddRow} />
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
    <form onSubmit={submit} style={{ borderTop: `1px solid ${COLORS.hair}`, padding: "10px 14px", display: "flex", gap: 6, position: "relative" }}>
      <div ref={wrapRef} style={{ flex: 1, position: "relative" }}>
        <input
          value={cardName}
          onChange={(e) => {
            setCardName(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={onKeyDown}
          placeholder="Card name"
          autoComplete="off"
          style={{ width: "100%", background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, color: COLORS.parchment, fontSize: 12, padding: "6px 8px" }}
        />
        {showSuggestions && suggestions.length > 0 && (
          <div style={{ position: "absolute", left: 0, right: 0, top: "100%", marginTop: 4, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, zIndex: 20, maxHeight: 180, overflowY: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
            {suggestions.map((name, i) => (
              <button
                key={name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pickSuggestion(name)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  background: i === activeSuggestion ? "rgba(201,162,39,0.12)" : "transparent",
                  border: "none",
                  color: COLORS.parchment,
                  fontSize: 12,
                  padding: "7px 10px",
                  cursor: "pointer",
                }}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </div>
      <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 56, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, color: COLORS.parchment, fontSize: 12, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace" }} />
      <button type="submit" style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${COLORS.gold}`, color: COLORS.gold, borderRadius: 4, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
        <Plus size={12} /> Add
      </button>
    </form>
  );
}

function MatchTable({ rows, peerLabel, peerKey, showBoth, priorityFriendName }) {
  if (!rows.length) return <div style={{ fontSize: 12, color: COLORS.parchmentDim, fontStyle: "italic" }}>None right now.</div>;
  return (
    <div style={{ overflowX: "auto" }}>
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 360 }}>
      <thead>
        <tr style={{ borderBottom: `1px solid ${COLORS.hair}` }}>
          <th style={thStyle}>Card</th>
          {showBoth && <th style={thStyle}>Has it</th>}
          {showBoth && <th style={thStyle}>Needs it</th>}
          {!showBoth && peerLabel && <th style={thStyle}>{peerLabel}</th>}
          <th style={{ ...thStyle, textAlign: "right" }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const isPrio = matchInvolvesFriend(r, priorityFriendName);
          return (
          <tr key={i} style={{ borderBottom: `1px solid rgba(51,56,68,0.5)`, background: isPrio ? "rgba(201,162,39,0.06)" : "transparent" }}>
            <td style={tdStyle}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: PIPS[pipFor(r.cardName)], marginRight: 8 }} />
              {r.cardName}
            </td>
            {showBoth && <td style={{ ...tdStyle, color: r.owner === priorityFriendName ? COLORS.gold : COLORS.parchment }}>{r.owner}</td>}
            {showBoth && <td style={{ ...tdStyle, color: r.seeker === priorityFriendName ? COLORS.gold : COLORS.parchment }}>{r.seeker}</td>}
            {!showBoth && peerKey && (
              <td style={{ ...tdStyle, color: r[peerKey] === priorityFriendName ? COLORS.gold : COLORS.parchment, fontWeight: r[peerKey] === priorityFriendName ? 500 : 400 }}>
                {r[peerKey]}
              </td>
            )}
            <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold }}>{r.tradeAvailable}</td>
          </tr>
          );
        })}
      </tbody>
    </table>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "6px 10px", fontSize: 11, color: COLORS.parchmentDim, textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle = { padding: "8px 10px", color: COLORS.parchment };

function MatchSummary({ matches, userName, priorityFriendName }) {
  if (!matches?.length) return null;
  const stats = buildMatchSummary(matches, userName, priorityFriendName);
  return (
    <div
      style={{
        marginBottom: 16,
        padding: "12px 14px",
        background: COLORS.panel,
        border: `1px solid ${COLORS.hair}`,
        borderRadius: 6,
        fontSize: 13,
        color: COLORS.parchmentDim,
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace", fontWeight: 500 }}>{stats.total}</span> potential transfers
      {priorityFriendName && stats.involvingPriority > 0 && (
        <>
          {" "}
          · <span style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>{stats.involvingPriority}</span> involve{" "}
          <span style={{ color: COLORS.gold }}>{priorityFriendName}</span>
        </>
      )}
      {(stats.userCanGet > 0 || stats.userCanGive > 0) && (
        <>
          {" "}
          · You can get <span style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>{stats.userCanGet}</span>, give{" "}
          <span style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>{stats.userCanGive}</span>
        </>
      )}
    </div>
  );
}

function Toast({ message }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: COLORS.panelRaised,
        border: `1px solid ${COLORS.gold}`,
        color: COLORS.parchment,
        borderRadius: 6,
        padding: "10px 18px",
        fontSize: 13,
        zIndex: 70,
        boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
      }}
    >
      {message}
    </div>
  );
}

function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 360, maxWidth: "100%", background: COLORS.panel, border: `1px solid ${COLORS.hair}`, borderRadius: 8, padding: 24 }}>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 17, margin: "0 0 10px", color: COLORS.parchment }}>{title}</h2>
        <p style={{ fontSize: 13, color: COLORS.parchmentDim, margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "8px 14px", fontSize: 12, cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ background: "#8B3A34", border: "none", color: COLORS.parchment, borderRadius: 4, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
