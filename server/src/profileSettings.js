export const DEFAULT_SETTINGS = {
  alert_matches: true,
  alert_proposals: true,
  alert_comments: true,
  weekly_digest: false,
};

export function mergeSettings(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  return {
    alert_matches: src.alert_matches !== false,
    alert_proposals: src.alert_proposals !== false,
    alert_comments: src.alert_comments !== false,
    weekly_digest: src.weekly_digest === true,
  };
}

// Stored as digits only with the country code (what wa.me expects). Returns
// "" for blank input and null when the number can't be valid.
export function normalizePhone(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/[^\d\s+().-]/.test(s)) return null;
  const digits = s.replace(/^00/, "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function settingAllows(settings, kind) {
  const s = mergeSettings(settings);
  if (kind === "match") return s.alert_matches;
  if (kind === "comment") return s.alert_comments;
  if (kind === "proposal" || kind === "accepted" || kind === "declined" || kind === "completed") {
    return s.alert_proposals;
  }
  return true;
}
