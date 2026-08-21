// In dev, Vite proxies /api to the local Express server (see vite.config.js).
// In production, set VITE_API_URL to your deployed backend's URL.
const BASE = import.meta.env.VITE_API_URL || "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
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
  listFriends: () => request("/friends"),
  createFriend: (name) => request("/friends", { method: "POST", body: JSON.stringify({ name }) }),
  deleteFriend: (id) => request(`/friends/${id}`, { method: "DELETE" }),
  getFriend: (id) => request(`/friends/${id}`),
  replaceCollection: (id, cards) =>
    request(`/friends/${id}/collection`, { method: "PUT", body: JSON.stringify({ cards }) }),
  replaceWishlist: (id, cards) =>
    request(`/friends/${id}/wishlist`, { method: "PUT", body: JSON.stringify({ cards }) }),
  getMatches: () => request("/matches"),
};
