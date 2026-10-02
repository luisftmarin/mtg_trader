import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { initials } from "../lib/format.js";
import { useAuth } from "../context.jsx";
import { TextField, Button } from "../ui.jsx";

export function ProfileScreen() {
  const { identity, signOut } = useAuth();
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="be-page" style={{ maxWidth: 820 }}>
      <h1>Profile &amp; settings</h1>
      <section className="be-panel be-profile-card">
        <div className="be-profile-av">{initials(identity.name)}</div>
        <div className="be-profile-fields">
          <div>
            <label>Display name</label>
            <input value={identity.name} readOnly />
          </div>
          <div>
            <label>Username</label>
            <input value={identity.name} readOnly />
          </div>
        </div>
      </section>
      <section className="be-panel" style={{ padding: 18 }}>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Prices</div>
        <div className="be-copy">
          Cardmarket trend price in EUR via Scryfall, refreshed nightly. Binder language and notification toggles land in the profile PR.
        </div>
      </section>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="be-btn be-btn--outline" onClick={() => setShowPw(true)}>
          Change password
        </button>
        <button type="button" className="be-btn be-btn--danger" onClick={signOut}>
          Sign out
        </button>
      </div>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
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
        <h2 className="panel__title" style={{ marginBottom: 10 }}>Change password</h2>
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
