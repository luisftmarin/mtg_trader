import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { initials, timeAgo } from "../lib/format.js";
import { useAuth } from "../context.jsx";
import { useToast } from "../components/ToastHost.jsx";
import { TextField, Button } from "../ui.jsx";

const TOGGLES = [
  { key: "alert_matches", label: "New match alerts", hint: "When a friend adds a card you want." },
  { key: "alert_proposals", label: "Trade proposals", hint: "Proposals, accepts, declines, and completions." },
  { key: "alert_comments", label: "Comments", hint: "New comments on trades you’re in." },
  { key: "weekly_digest", label: "Weekly digest", hint: "Saved for later — there is no email yet." },
];

export function ProfileScreen() {
  const { identity, signIn, signOut } = useAuth();
  const toast = useToast();
  const token = typeof window !== "undefined" ? window.localStorage.getItem("mtg-trade-ledger:token") : "";
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [displayName, setDisplayName] = useState(identity.name);
  const [binderPaused, setBinderPaused] = useState(false);
  const [settings, setSettings] = useState({
    alert_matches: true,
    alert_proposals: true,
    alert_comments: true,
    weekly_digest: false,
  });
  const [pricesUpdatedAt, setPricesUpdatedAt] = useState(null);

  useEffect(() => {
    api
      .getProfile()
      .then((p) => {
        setDisplayName(p.displayName);
        setBinderPaused(!!p.binderPaused);
        setSettings(p.settings);
        setPricesUpdatedAt(p.pricesUpdatedAt);
      })
      .catch((err) => toast(err.message, "var(--red)"))
      .finally(() => setLoading(false));
  }, [toast]);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await api.saveProfile({ displayName, binderPaused, settings });
      setDisplayName(saved.displayName);
      signIn({ ...identity, displayName: saved.displayName, binderPaused: saved.binderPaused }, token);
      toast("Profile saved", "var(--green)");
    } catch (err) {
      toast(err.message, "var(--red)");
    }
    setBusy(false);
  }

  function setToggle(key, on) {
    setSettings((prev) => ({ ...prev, [key]: on }));
  }

  return (
    <div className="be-page" style={{ maxWidth: 820 }} data-testid="profile-page">
      <h1>Profile &amp; settings</h1>
      {loading ? (
        <div className="be-muted">Loading profile…</div>
      ) : (
        <form onSubmit={save}>
          <section className="be-panel be-profile-card">
            <div className="be-profile-av" aria-hidden="true">
              {initials(displayName || identity.name)}
            </div>
            <div className="be-profile-fields">
              <div>
                <label htmlFor="profile-display-name">Display name</label>
                <input
                  id="profile-display-name"
                  data-testid="profile-display-name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="nickname"
                />
              </div>
              <div>
                <label htmlFor="profile-username">Username</label>
                <input id="profile-username" value={identity.name} readOnly />
              </div>
            </div>
          </section>

          <section className="be-panel" style={{ padding: 8, marginBottom: 16 }}>
            {TOGGLES.map((t) => (
              <ToggleRow
                key={t.key}
                testId={`profile-toggle-${t.key}`}
                label={t.label}
                hint={t.hint}
                on={!!settings[t.key]}
                onChange={(v) => setToggle(t.key, v)}
              />
            ))}
            <ToggleRow
              testId="profile-pause"
              label="Pause my binder"
              hint="Hide my cards from matching while I'm away."
              on={binderPaused}
              onChange={setBinderPaused}
            />
          </section>

          <section className="be-panel" style={{ padding: 18, marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Prices</div>
            <div className="be-copy">
              Cardmarket trend price in EUR via Scryfall, refreshed nightly. Last update{" "}
              {pricesUpdatedAt ? timeAgo(pricesUpdatedAt) : "never"}.
            </div>
          </section>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="submit" className="be-btn be-btn--gold" data-testid="profile-save" disabled={busy || !displayName.trim()}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className="be-btn be-btn--outline" onClick={() => setShowPw(true)}>
              Change password
            </button>
            <button type="button" className="be-btn be-btn--danger" data-testid="profile-sign-out" onClick={signOut}>
              Sign out
            </button>
          </div>
        </form>
      )}
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}

function ToggleRow({ label, hint, on, onChange, testId }) {
  const id = `toggle-${label.replace(/\s+/g, "-").toLowerCase()}`;
  return (
    <div className="be-toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        <div className="be-muted">{hint}</div>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={on}
        data-testid={testId}
        className={`be-switch${on ? " is-on" : ""}`}
        onClick={() => onChange(!on)}
      >
        <span className="be-switch__knob" />
      </button>
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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (newPassword !== confirm) {
      setError("New passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.changePassword(currentPassword, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="panel__title" style={{ marginBottom: 10 }}>
          Change password
        </h2>
        {success ? (
          <div>
            <p>Password updated.</p>
            <Button onClick={onClose}>Close</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="stack">
            <TextField value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Current password" type="password" />
            <TextField value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" type="password" />
            <TextField value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" type="password" />
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
