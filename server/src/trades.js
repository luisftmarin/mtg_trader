export const ACTIONS = ["accept", "decline", "withdraw", "complete"];

const NEXT = {
  proposed: { accept: "accepted", decline: "declined", withdraw: "withdrawn" },
  accepted: { complete: "completed", decline: "declined" },
};

export function nextStatus(status, action) {
  return NEXT[status]?.[action] || null;
}

export function canAct(trade, userId, action) {
  const uid = String(userId);
  const proposer = String(trade.proposer_id);
  const partner = String(trade.partner_id);
  if (uid !== proposer && uid !== partner) return false;
  if (!nextStatus(trade.status, action)) return false;
  if (action === "accept" || action === "decline") return uid === partner;
  if (action === "withdraw") return uid === proposer;
  if (action === "complete") return true;
  return false;
}

export function otherPartyId(trade, userId) {
  return String(userId) === String(trade.proposer_id) ? trade.partner_id : trade.proposer_id;
}

export function summarizeItems(items, viewerId) {
  const get = [];
  const give = [];
  for (const item of items || []) {
    if (String(item.from_id) === String(viewerId)) give.push(item);
    else get.push(item);
  }
  return { get, give };
}
