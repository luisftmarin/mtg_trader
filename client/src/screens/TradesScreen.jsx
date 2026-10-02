import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Download, Star } from "lucide-react";
import { Button, Panel } from "../ui.jsx";
import { CardName } from "../components/CardName.jsx";
import { useAuth, useData } from "../context.jsx";
import { TradeCard } from "./TradeScreens.jsx";
import { api } from "../api.js";
import {
  aggregateCanGetRows,
  buildMatchSummary,
  matchInvolvesFriend,
  sortMatchesByPriority,
} from "../lib/trades.js";

export function TradesScreen() {
  const { identity } = useAuth();
  const { friends, matches, loading, refreshMatches, openTrades } = useData();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = ["proposals", "history"].includes(params.get("tab")) ? params.get("tab") : "matches";
  const [history, setHistory] = useState([]);
  const [viewMode, setViewMode] = useState("mine");
  const [selectedFriendName, setSelectedFriendName] = useState(identity.name);
  const priorityStorageKey = `mtg-trade-ledger:priority:${identity.id}`;
  const [priorityFriendName, setPriorityFriendName] = useState(() => {
    try {
      return window.localStorage.getItem(priorityStorageKey) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    if (tab !== "history") return undefined;
    api.listTrades("history").then(setHistory).catch(() => setHistory([]));
  }, [tab]);

  function setTab(next) {
    const copy = new URLSearchParams(params);
    if (next === "matches") copy.delete("tab");
    else copy.set("tab", next);
    setParams(copy, { replace: true });
  }

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

  const myMatches = useMemo(
    () => (matches || []).filter((m) => m.seeker === identity.name || m.owner === identity.name),
    [matches, identity.name]
  );
  const byPair = useMemo(() => {
    const map = new Map();
    for (const m of matches || []) {
      const key = `${m.owner}|${m.seeker}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    return [...map.entries()];
  }, [matches]);

  function exportCsv() {
    const rows = [["card", "has", "needs", "qty"], ...(matches || []).map((m) => [m.cardName, m.owner, m.seeker, m.tradeAvailable])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "matches.csv";
    a.click();
  }

  return (
    <div className="be-page">
      <div className="be-page__head">
        <div>
          <h1>Trades</h1>
          <div className="be-mono-sub">matches from live binders</div>
        </div>
        <Link to="/trades/new" className="be-btn be-btn--gold">
          + New trade
        </Link>
      </div>
      <div className="be-seg" style={{ marginBottom: 16, maxWidth: 420 }}>
        <button type="button" className={tab === "matches" ? "is-on" : ""} onClick={() => setTab("matches")}>
          Matches <span className="be-seg__n">{matches?.length || 0}</span>
        </button>
        <button type="button" className={tab === "proposals" ? "is-on" : ""} onClick={() => setTab("proposals")}>
          Proposals <span className="be-seg__n">{openTrades.length}</span>
        </button>
        <button type="button" className={tab === "history" ? "is-on" : ""} onClick={() => setTab("history")}>
          History
        </button>
      </div>
      {tab === "proposals" && (
        <div className="be-trade-list">
          {openTrades.map((t) => (
            <TradeCard key={t.id} trade={t} onOpen={(id) => navigate(`/trades/${id}`)} />
          ))}
          {!openTrades.length && <div className="be-empty-copy">No open proposals yet. Start one with + New trade.</div>}
        </div>
      )}
      {tab === "history" && (
        <div className="be-trade-list">
          {history.map((t) => (
            <TradeCard key={t.id} trade={t} onOpen={(id) => navigate(`/trades/${id}`)} />
          ))}
          {!history.length && <div className="be-empty-copy">Completed and closed trades land here. Prices are frozen at completion.</div>}
        </div>
      )}
      {tab === "matches" && (
      <>
      <div className="be-toolbar" style={{ marginBottom: 16 }}>
        <label className="toolbar-label">
          <Star size={13} color={priorityFriendName ? "var(--gold)" : "var(--text-muted)"} fill={priorityFriendName ? "var(--gold)" : "none"} />
          Priority
          <select className="field field--compact" value={priorityFriendName} onChange={(e) => updatePriorityFriend(e.target.value)}>
            <option value="">None</option>
            {friends.map((f) => (
              <option key={f.id} value={f.name}>
                {f.name}
                {f.id === identity.id ? " (you)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button variant="ghost" onClick={refreshMatches} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh trades"}
        </Button>
        {matches?.length > 0 && (
          <Button onClick={exportCsv}>
            <Download size={13} /> Export CSV
          </Button>
        )}
      </div>

      {friends.length < 2 ? (
        <div className="empty">Need at least two traders on the roster before matches can be calculated.</div>
      ) : matches === null ? (
        <div className="empty">Finding trades…</div>
      ) : (
        <>
          {viewMode === "mine" ? (
            <MatchSummary matches={myMatches} userName={identity.name} priorityFriendName={priorityFriendName} mine />
          ) : (
            <MatchSummary matches={matches} userName={identity.name} priorityFriendName={priorityFriendName} group />
          )}
          {matches.length === 0 ? (
            <div className="be-muted">No matches across the current roster.</div>
          ) : (
            <>
              <div className="segmented" style={{ marginBottom: 18 }}>
                {[
                  ["mine", "My trades"],
                  ["pair", "By pair"],
                  ["friend", "By trader"],
                  ["all", "Full list"],
                ].map(([v, label]) => (
                  <button key={v} type="button" className={viewMode === v ? "is-active" : ""} onClick={() => setViewMode(v)}>
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
                byPair.map(([key, rows]) => {
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
              {viewMode === "all" && <MatchTable rows={matches} showBoth priorityFriendName={priorityFriendName} />}
            </>
          )}
        </>
      )}
      </>
      )}
    </div>
  );
}

function OwnerPeerCell({ primary, others, priorityFriendName }) {
  if (!others?.length) {
    return <span className={primary === priorityFriendName ? "is-prio" : undefined}>{primary}</span>;
  }
  return (
    <span>
      <span className={primary === priorityFriendName ? "is-prio" : undefined}>{primary}</span>
      <span className="be-muted"> +{others.length}</span>
    </span>
  );
}

function MatchTable({ rows, peerLabel, peerKey, showBoth, priorityFriendName }) {
  const aggregateOwners = peerKey === "owner" || showBoth;
  const displayRows = aggregateOwners ? aggregateCanGetRows(rows, priorityFriendName, showBoth) : rows;
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
            return (
              <tr key={i} className={isPrio ? "is-priority" : undefined}>
                <td>
                  <CardName name={r.cardName} />
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
                  <td className={r[peerKey] === priorityFriendName ? "is-prio" : undefined}>{r[peerKey]}</td>
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

function MatchSummary({ matches, userName, priorityFriendName, group, mine }) {
  if (!matches?.length) return null;
  const stats = buildMatchSummary(matches, userName, priorityFriendName);
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
          <strong>{stats.total}</strong> {group ? "potential transfers across the group" : `transfers`}
        </>
      )}
      {priorityFriendName && stats.involvingPriority > 0 && (
        <>
          {" "}
          · <strong>{stats.involvingPriority}</strong> involve <span className="is-prio">{priorityFriendName}</span>
        </>
      )}
    </div>
  );
}
