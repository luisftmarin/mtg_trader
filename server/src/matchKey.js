// The one normalisation used everywhere: card rows, the Scryfall cache and
// matching all key off this, so a typo or a double-faced name never splits
// a card into two entries.
export function matchKey(name) {
  return String(name || "").trim().split("//")[0].trim().toLowerCase();
}
