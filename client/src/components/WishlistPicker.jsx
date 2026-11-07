import React, { useEffect, useState } from "react";
import { api } from "../api.js";

export const NEW_LIST = "new";

// Loads a trader's named wishlists and lets the user pick one (or, with
// allowNew, type a name for a list that gets created on save).
export function WishlistPicker({ friendId, value, onChange, allowNew = false, newName = "", onNewName, onLists }) {
  const [lists, setLists] = useState(null);

  useEffect(() => {
    let live = true;
    api
      .getFriend(friendId)
      .then((data) => {
        if (!live) return;
        const next = data.wishlists || [];
        setLists(next);
        onLists?.(next);
        const known = next.some((l) => String(l.id) === String(value));
        if (!known && value !== NEW_LIST && next[0]) onChange(next[0].id);
      })
      .catch(() => live && setLists([]));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [friendId]);

  return (
    <div className="be-archidekt">
      <label htmlFor="wishlist-pick">Which wishlist</label>
      <select
        id="wishlist-pick"
        className="be-select"
        data-testid="wishlist-pick"
        value={value ?? ""}
        disabled={!lists}
        onChange={(e) => onChange(e.target.value === NEW_LIST ? NEW_LIST : Number(e.target.value))}
      >
        {!lists && <option value="">Loading…</option>}
        {(lists || []).map((l) => (
          <option key={l.id} value={l.id}>
            {l.name} ({l.count})
          </option>
        ))}
        {allowNew && <option value={NEW_LIST}>+ New list…</option>}
      </select>
      {allowNew && value === NEW_LIST && (
        <input
          data-testid="wishlist-new-name"
          value={newName}
          maxLength={40}
          onChange={(e) => onNewName?.(e.target.value)}
          placeholder="e.g. Atraxa deck"
          autoFocus
        />
      )}
    </div>
  );
}
