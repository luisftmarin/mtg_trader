import React, { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import { Plus, X, Upload, ArrowRight, Download, Users, ChevronDown, LogOut, RefreshCw } from "lucide-react";
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
};

const IDENTITY_KEY = "mtg-trade-ledger:identity";
const TOKEN_KEY = "mtg-trade-ledger:token";

function matchKey(name) {
  return String(name || "").trim().split("//")[0].trim().toLowerCase();
}

function parseCsvText(text, platform) {
  const result = Papa.parse(text, { header: true, skipEmptyLines: true });
  const fields = result.meta.fields || [];
  const mapping = PLATFORM_MAPPINGS[platform];
  const cardCol = mapping.card_name.find((c) => fields.includes(c));
  const qtyCol = mapping.qty.find((c) => fields.includes(c));
  if (!cardCol) throw new Error(`No card name column found. Expected one of: ${mapping.card_name.join(", ")}`);
  if (!qtyCol) throw new Error(`No quantity column found. Expected one of: ${mapping.qty.join(", ")}`);
  return result.data
    .filter((row) => row[cardCol])
    .map((row) => {
      const q = parseInt(row[qtyCol], 10);
      return { cardName: String(row[cardCol]).trim(), qty: Number.isFinite(q) && q > 0 ? q : 1 };
    });
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
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      const result = mode === "login" ? await api.login(name.trim(), password) : await api.register(name.trim(), password, adminCode);
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
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: COLORS.gold, textTransform: "uppercase", marginBottom: 6 }}>Trade Ledger</div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 22, margin: "0 0 18px" }}>
          {mode === "login" ? "Sign in" : "Create an account"}
        </h1>

        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          {[["login", "Sign in"], ["register", "Create account"]].map(([m, label]) => (
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
                border: `1px solid ${mode === m ? COLORS.gold : COLORS.hair}`,
                background: mode === m ? "rgba(201,162,39,0.12)" : "transparent",
                color: mode === m ? COLORS.gold : COLORS.parchmentDim,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>

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
            {busy ? "…" : mode === "login" ? "Sign in" : "Create account"}
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
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handler = (e) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

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
      if (result.length && !selectedFriendName) setSelectedFriendName(result[0].seeker);
    } catch (e) {
      setError(e.message);
    }
    setMatchesLoading(false);
  }

  async function removeFriend(id) {
    try {
      await api.deleteFriend(id);
      if (editingFriendId === id) setEditingFriendId(null);
      refreshFriends();
      setMatches(null);
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
              <Users size={16} />
            </button>
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: COLORS.gold, textTransform: "uppercase", marginBottom: 2 }}>Trade Ledger</div>
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
          <button onClick={onSwitchIdentity} style={{ background: "none", border: `1px solid ${COLORS.hair}`, color: COLORS.parchmentDim, borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            <LogOut size={12} /> {isMobile ? identity.name : "Switch"}
          </button>
        </div>
      </header>

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
            friends.map((f) => (
              <div
                key={f.id}
                onClick={() => {
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
                  cursor: "pointer",
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {f.name}
                    {f.id === identity.id && <span style={{ color: COLORS.gold, fontSize: 10, marginLeft: 6 }}>you</span>}
                  </div>
                  <div style={{ fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
                    {f.collection_count} coll · {f.wishlist_count} wish
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeFriend(f.id);
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
                        removeFriend(f.id);
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
          {editingFriend ? (
            <FriendEditor
              friend={editingFriend}
              isAdminEditing={editingFriend.id !== identity.id}
              onClose={() => setEditingFriendId(null)}
              onSaved={() => {
                refreshFriends();
                setMatches(null);
                setEditingFriendId(null);
              }}
              setError={setError}
            />
          ) : friends.length < 2 ? (
            <div style={{ border: `1px dashed ${COLORS.hair}`, borderRadius: 6, padding: 40, textAlign: "center", color: COLORS.parchmentDim, fontSize: 13 }}>
              Need at least two traders on the roster before matches can be calculated.
            </div>
          ) : (
            <>
              <button
                onClick={calculateMatches}
                disabled={matchesLoading}
                style={{ background: "transparent", border: `1px solid ${COLORS.gold}`, color: COLORS.gold, borderRadius: 4, padding: "10px 18px", fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", cursor: "pointer", marginBottom: 22, opacity: matchesLoading ? 0.6 : 1 }}
              >
                {matchesLoading ? "Calculating…" : "Calculate group matches"}
              </button>

              {matches !== null && (
                matches.length === 0 ? (
                  <div style={{ color: COLORS.parchmentDim, fontSize: 13 }}>No matches across the current roster.</div>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <div style={{ fontSize: 13, color: COLORS.parchmentDim }}>
                        <span style={{ color: COLORS.gold, fontFamily: "'JetBrains Mono', monospace" }}>{matches.length}</span> potential transfers found
                      </div>
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
                      Object.entries(byPair).map(([key, rows]) => {
                        const [owner, seeker] = key.split("|");
                        return (
                          <div key={key} style={{ marginBottom: 14, border: `1px solid ${COLORS.hair}`, borderRadius: 6, overflow: "hidden" }}>
                            <div style={{ background: COLORS.panel, padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, fontFamily: "'Fraunces', serif", fontSize: 14 }}>
                              {owner} <ArrowRight size={13} color={COLORS.gold} /> {seeker}
                              <span style={{ marginLeft: "auto", fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>
                                {rows.length} card{rows.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                            <MatchTable rows={rows} />
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
                            <option key={f.id}>{f.name}</option>
                          ))}
                        </select>
                        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 280 }}>
                            <div style={{ fontSize: 12, color: COLORS.gold, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{selectedFriendName} can get</div>
                            <MatchTable rows={matches.filter((m) => m.seeker === selectedFriendName)} peerLabel="Who has it" peerKey="owner" />
                          </div>
                          <div style={{ flex: 1, minWidth: 280 }}>
                            <div style={{ fontSize: 12, color: COLORS.gold, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>{selectedFriendName} can give</div>
                            <MatchTable rows={matches.filter((m) => m.owner === selectedFriendName)} peerLabel="Who needs it" peerKey="seeker" />
                          </div>
                        </div>
                      </>
                    )}

                    {viewMode === "all" && <MatchTable rows={[...matches].sort((a, b) => a.cardName.localeCompare(b.cardName))} showBoth />}
                  </>
                )
              )}
            </>
          )}
        </main>
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
        <div style={{ fontSize: 11, color: COLORS.gold, marginBottom: 14 }}>
          You're editing this as an admin — {friend.name} didn't make this change themselves.
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
  return (
    <div style={{ flex: 1, minWidth: 320, border: `1px solid ${COLORS.hair}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ background: COLORS.panel, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 11, color: COLORS.parchmentDim, fontFamily: "'JetBrains Mono', monospace" }}>{rows.length} cards</span>
      </div>

      <div style={{ padding: "10px 14px", display: "flex", gap: 6, alignItems: "center", borderBottom: `1px solid ${COLORS.hair}` }}>
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

      <div style={{ maxHeight: 360, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${COLORS.hair}` }}>
              <th style={thStyle}>Card name</th>
              <th style={{ ...thStyle, width: 70 }}>Qty</th>
              <th style={{ ...thStyle, width: 30 }}></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} style={{ borderBottom: `1px solid rgba(51,56,68,0.5)` }}>
                <td style={{ padding: "4px 6px" }}>
                  <input value={r.cardName} onChange={(e) => onUpdateRow(i, "name", e.target.value)} style={{ width: "100%", background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 3, color: COLORS.parchment, fontSize: 12, padding: "4px 6px" }} />
                </td>
                <td style={{ padding: "4px 6px" }}>
                  <input type="number" min="1" value={r.qty} onChange={(e) => onUpdateRow(i, "qty", e.target.value)} style={{ width: "100%", background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 3, color: COLORS.parchment, fontSize: 12, padding: "4px 6px", fontFamily: "'JetBrains Mono', monospace" }} />
                </td>
                <td style={{ padding: "4px 6px", textAlign: "center" }}>
                  <button onClick={() => onRemoveRow(i)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.parchmentDim, padding: 2 }}>
                    <X size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AddCardForm onAdd={onAddRow} />
    </div>
  );
}

function AddCardForm({ onAdd }) {
  const [cardName, setCardName] = useState("");
  const [qty, setQty] = useState(1);

  function submit(e) {
    e.preventDefault();
    if (!cardName.trim()) return;
    onAdd(cardName, qty);
    setCardName("");
    setQty(1);
  }

  return (
    <form onSubmit={submit} style={{ borderTop: `1px solid ${COLORS.hair}`, padding: "10px 14px", display: "flex", gap: 6 }}>
      <input value={cardName} onChange={(e) => setCardName(e.target.value)} placeholder="Card name" style={{ flex: 1, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, color: COLORS.parchment, fontSize: 12, padding: "6px 8px" }} />
      <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 56, background: COLORS.panelRaised, border: `1px solid ${COLORS.hair}`, borderRadius: 4, color: COLORS.parchment, fontSize: 12, padding: "6px 8px", fontFamily: "'JetBrains Mono', monospace" }} />
      <button type="submit" style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: `1px solid ${COLORS.gold}`, color: COLORS.gold, borderRadius: 4, padding: "6px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
        <Plus size={12} /> Add
      </button>
    </form>
  );
}

function MatchTable({ rows, peerLabel, peerKey, showBoth }) {
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
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: `1px solid rgba(51,56,68,0.5)` }}>
            <td style={tdStyle}>
              <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: PIPS[pipFor(r.cardName)], marginRight: 8 }} />
              {r.cardName}
            </td>
            {showBoth && <td style={tdStyle}>{r.owner}</td>}
            {showBoth && <td style={tdStyle}>{r.seeker}</td>}
            {!showBoth && peerKey && <td style={tdStyle}>{r[peerKey]}</td>}
            <td style={{ ...tdStyle, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", color: COLORS.gold }}>{r.tradeAvailable}</td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}

const thStyle = { textAlign: "left", padding: "6px 10px", fontSize: 11, color: COLORS.parchmentDim, textTransform: "uppercase", letterSpacing: "0.05em" };
const tdStyle = { padding: "8px 10px", color: COLORS.parchment };
