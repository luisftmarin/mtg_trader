// In dev, Vite proxies /api to the local Express server (see vite.config.js).
// In production, set VITE_API_URL to your deployed backend's URL.
const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const token = window.localStorage.getItem("mtg-trade-ledger:token");
  const res = await fetch(`${BASE}/api${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...options,
  });
  if (res.status === 401 && token) {
    // Token expired or invalid — clear it and send the user back to sign-in.
    window.localStorage.removeItem("mtg-trade-ledger:token");
    window.localStorage.removeItem("mtg-trade-ledger:identity");
    window.location.reload();
    return new Promise(() => {}); // reloading — don't resolve
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  register: (name, password, adminCode) =>
    request("/auth/register", { method: "POST", body: JSON.stringify({ name, password, adminCode }) }),
  login: (name, password) => request("/auth/login", { method: "POST", body: JSON.stringify({ name, password }) }),
  listFriends: () => request("/friends"),
  deleteFriend: (id) => request(`/friends/${id}`, { method: "DELETE" }),
  getFriend: (id) => request(`/friends/${id}`),
  replaceCollection: (id, cards) =>
    request(`/friends/${id}/collection`, { method: "PUT", body: JSON.stringify({ cards }) }),
  replaceWishlist: (id, cards) =>
    request(`/friends/${id}/wishlist`, { method: "PUT", body: JSON.stringify({ cards }) }),
  getMatches: () => request("/matches"),
};
