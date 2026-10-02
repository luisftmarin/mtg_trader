export function matchInvolvesFriend(match, friendName) {
  if (!friendName) return false;
  return match.owner === friendName || match.seeker === friendName;
}

export function sortMatchesByPriority(matches, priorityName) {
  if (!priorityName) return matches;
  return [...matches].sort((a, b) => {
    const aPrio = matchInvolvesFriend(a, priorityName) ? 0 : 1;
    const bPrio = matchInvolvesFriend(b, priorityName) ? 0 : 1;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return a.cardName.localeCompare(b.cardName);
  });
}

export function buildMatchSummary(matches, userName, priorityName) {
  return {
    total: matches.length,
    involvingPriority: priorityName ? matches.filter((m) => matchInvolvesFriend(m, priorityName)).length : 0,
    userCanGet: matches.filter((m) => m.seeker === userName).length,
    userCanGive: matches.filter((m) => m.owner === userName).length,
  };
}

export function sortPeerNames(names, priorityName) {
  return [...names].sort((a, b) => {
    if (priorityName) {
      const aPrio = a === priorityName ? 0 : 1;
      const bPrio = b === priorityName ? 0 : 1;
      if (aPrio !== bPrio) return aPrio - bPrio;
    }
    return a.localeCompare(b);
  });
}

export function aggregateCanGetRows(rows, priorityFriendName, groupBySeeker = false) {
  const byCard = new Map();
  for (const row of rows) {
    const key = groupBySeeker ? `${row.seeker}|${row.cardName}` : row.cardName;
    if (!byCard.has(key)) {
      byCard.set(key, { ...row, owners: [{ name: row.owner, ownerHas: row.ownerHas }] });
      continue;
    }
    const agg = byCard.get(key);
    if (!agg.owners.some((o) => o.name === row.owner)) {
      agg.owners.push({ name: row.owner, ownerHas: row.ownerHas });
    }
  }
  return Array.from(byCard.values()).map((agg) => {
    const sortedOwners = sortPeerNames(
      agg.owners.map((o) => o.name),
      priorityFriendName
    );
    const totalHas = agg.owners.reduce((sum, o) => sum + o.ownerHas, 0);
    return {
      ...agg,
      owner: sortedOwners[0],
      otherOwners: sortedOwners.slice(1),
      tradeAvailable: Math.min(agg.seekerNeeds, totalHas),
    };
  });
}
