// Every price in the app is the Cardmarket trend price in EUR (Scryfall
// prices.eur), formatted the way the prototype does it.
const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function formatEur(value) {
  const n = Number(value);
  return Number.isFinite(n) ? EUR.format(n) : "—";
}

// Same normalisation as the server's matchKey(), so client-side lookups into
// the card cache hit the same rows the server wrote.
export function matchKey(name) {
  return String(name || "")
    .trim()
    .split("//")[0]
    .trim()
    .toLowerCase();
}

const MANA = {
  W: "var(--mana-w)",
  U: "var(--mana-u)",
  B: "var(--mana-b)",
  R: "var(--mana-r)",
  G: "var(--mana-g)",
};

// Colourless and unknown cards still get one dot, so rows stay aligned.
export function manaDots(colorIdentity) {
  const dots = String(colorIdentity || "")
    .split("")
    .filter((c) => MANA[c])
    .map((c) => MANA[c]);
  return dots.length ? dots : ["var(--mana-c)"];
}

export function initials(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase();
}

export function timeAgo(value) {
  const t = new Date(value).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}
