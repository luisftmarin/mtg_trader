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

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshFriends(), refreshMatches()]);
    } catch {
      // keep previous
    }
    setLoading(false);
  }, [refreshFriends, refreshMatches]);

  useEffect(() => {
    if (!identity) return undefined;
    refreshAll();
  }, [identity, refreshAll]);

  const value = useMemo(
    () => ({ friends, matches, loading, refreshFriends, refreshMatches, refreshAll }),
    [friends, matches, loading, refreshFriends, refreshMatches, refreshAll]
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
