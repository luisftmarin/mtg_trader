import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

function adminFromToken(token) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return !!payload.isAdmin;
  } catch {
    return false;
  }
}

export const IDENTITY_KEY = "mtg-trade-ledger:identity";
export const TOKEN_KEY = "mtg-trade-ledger:token";

const AuthContext = createContext(null);
const DataContext = createContext(null);

export function AuthProvider({ children }) {
  const [identity, setIdentity] = useState(() => {
    try {
      const raw = window.localStorage.getItem(IDENTITY_KEY);
      const token = window.localStorage.getItem(TOKEN_KEY);
      if (!raw || !token) return null;
      const friend = JSON.parse(raw);
      friend.isAdmin = !!(friend.isAdmin || adminFromToken(token));
      return friend;
    } catch {
      return null;
    }
  });

  const signIn = useCallback((friend, token) => {
    window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(friend));
    window.localStorage.setItem(TOKEN_KEY, token);
    setIdentity(friend);
  }, []);

  const signOut = useCallback(() => {
    window.localStorage.removeItem(IDENTITY_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    setIdentity(null);
  }, []);

  return <AuthContext.Provider value={{ identity, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function DataProvider({ children }) {
  const { identity } = useAuth();
  const [friends, setFriends] = useState([]);
  const [matches, setMatches] = useState(null);
  const [openTrades, setOpenTrades] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [contacts, setContacts] = useState({});
  const [loading, setLoading] = useState(true);

  const refreshFriends = useCallback(async () => {
    const rows = await api.listFriends();
    setFriends(rows);
    return rows;
  }, []);

  const refreshMatches = useCallback(async () => {
    const rows = await api.getMatches();
    setMatches(rows);
    return rows;
  }, []);

  const refreshTrades = useCallback(async () => {
    try {
      const rows = await api.listTrades("open");
      setOpenTrades(rows);
      return rows;
    } catch {
      setOpenTrades([]);
      return [];
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const rows = await api.listNotifications();
      setNotifications(rows);
      return rows;
    } catch {
      setNotifications([]);
      return [];
    }
  }, []);

  const refreshContacts = useCallback(async () => {
    try {
      const rows = await api.listContacts();
      const byId = Object.fromEntries(rows.map((r) => [String(r.id), r.phone]));
      setContacts(byId);
      return byId;
    } catch {
      return {};
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshFriends(), refreshMatches(), refreshTrades(), refreshNotifications(), refreshContacts()]);
    } catch {
      // keep previous
    }
    setLoading(false);
  }, [refreshFriends, refreshMatches, refreshTrades, refreshNotifications, refreshContacts]);

  useEffect(() => {
    if (!identity) return undefined;
    refreshAll();
  }, [identity, refreshAll]);

  useEffect(() => {
    if (!identity) return undefined;
    function beat() {
      if (document.visibilityState !== "visible") return;
      api.heartbeat().catch(() => {});
      refreshFriends().catch(() => {});
    }
    beat();
    const timer = window.setInterval(beat, 60000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [identity, refreshFriends]);

  const value = useMemo(
    () => ({
      friends,
      matches,
      openTrades,
      notifications,
      contacts,
      loading,
      refreshFriends,
      refreshMatches,
      refreshTrades,
      refreshNotifications,
      refreshContacts,
      refreshAll,
    }),
    [friends, matches, openTrades, notifications, contacts, loading, refreshFriends, refreshMatches, refreshTrades, refreshNotifications, refreshContacts, refreshAll]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  return useContext(DataContext);
}

export function matchCountWithMe(matches, myName, friendName) {
  if (!matches || !myName || friendName === myName) return 0;
  return matches.filter(
    (m) =>
      (m.owner === friendName && m.seeker === myName) || (m.owner === myName && m.seeker === friendName)
  ).length;
}
