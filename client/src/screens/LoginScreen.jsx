import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../context.jsx";

export function LoginScreen() {
  const { signIn } = useAuth();
  const [mode, setMode] = useState("login");
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
  }, [mode, unclaimed]);

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
      signIn(result.friend, result.token);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="be-login">
      <div className="be-login__glow" />
      <div className="be-login__card">
        <div className="be-login__brand">
          <div className="be-mark be-mark--lg">B</div>
          <div>
            <div className="be-eyebrow be-eyebrow--gold">Trade with friends</div>
            <div className="be-login__title">Binder Exchange</div>
          </div>
        </div>

        {mode === "login" && (
          <form onSubmit={submit}>
            <label>Username</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="willian" autoComplete="username" />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
            />
            {error && <div className="warning-banner">{error}</div>}
            <button type="submit" className="be-btn be-btn--gold be-btn--block" disabled={busy || !name.trim() || !password}>
              {busy ? "…" : "Sign in"}
            </button>
            <div className="be-login__links">
              <button type="button" onClick={() => { setMode("claim"); setError(""); }}>
                Forgot password
              </button>
              <button type="button" className="be-text-gold" onClick={() => { setMode("register"); setError(""); }}>
                Create account
              </button>
            </div>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={submit}>
            <label>Username</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="username" />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" />
            {showAdminCode ? (
              <>
                <label>Admin code</label>
                <input type="password" value={adminCode} onChange={(e) => setAdminCode(e.target.value)} placeholder="Admin code" />
              </>
            ) : (
              <button type="button" className="text-link" onClick={() => setShowAdminCode(true)}>
                Have an admin code?
              </button>
            )}
            {error && <div className="warning-banner">{error}</div>}
            <button type="submit" className="be-btn be-btn--gold be-btn--block" disabled={busy || !name.trim() || !password}>
              {busy ? "…" : "Create account"}
            </button>
            <div className="be-login__links">
              <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}

        {mode === "claim" && (
          <form onSubmit={submit}>
            <p className="be-copy">Claim an existing roster name that has no password yet, or ask an admin to reset yours.</p>
            {unclaimed === null ? (
              <div className="be-muted">Loading…</div>
            ) : unclaimed.length === 0 ? (
              <div className="be-muted">No unclaimed traders. Ask an admin to reset your password.</div>
            ) : (
              <div className="be-claim-list">
                {unclaimed.map((f) => (
                  <button key={f.id} type="button" className={name === f.name ? "is-on" : ""} onClick={() => setName(f.name)}>
                    {f.name}
                  </button>
                ))}
              </div>
            )}
            <label>Username</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
            {error && <div className="warning-banner">{error}</div>}
            <button type="submit" className="be-btn be-btn--gold be-btn--block" disabled={busy || !name.trim() || !password}>
              {busy ? "…" : "Set password"}
            </button>
            <div className="be-login__links">
              <button type="button" onClick={() => { setMode("login"); setError(""); }}>
                Back to sign in
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
