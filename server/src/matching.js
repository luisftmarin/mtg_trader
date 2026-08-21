// Pure function: given { [friendId]: { name, collection: [{match_key, card_name, qty}], wishlist: [...] } },
// returns all possible trades across the group.
export function computeMatches(friendsData) {
  const ids = Object.keys(friendsData);
  const matches = [];

  for (const seekerId of ids) {
    const seeker = friendsData[seekerId];
    if (!seeker.wishlist.length) continue;

    for (const ownerId of ids) {
      if (ownerId === seekerId) continue;
      const owner = friendsData[ownerId];
      if (!owner.collection.length) continue;

      const collByKey = new Map();
      owner.collection.forEach((c) => {
        collByKey.set(c.match_key, (collByKey.get(c.match_key) || 0) + c.qty);
      });

      seeker.wishlist.forEach((w) => {
        const ownerQty = collByKey.get(w.match_key);
        if (ownerQty) {
          matches.push({
            ownerId,
            owner: owner.name,
            seekerId,
            seeker: seeker.name,
            cardName: w.card_name,
            seekerNeeds: w.qty,
            ownerHas: ownerQty,
            tradeAvailable: Math.min(w.qty, ownerQty),
          });
        }
      });
    }
  }

  return matches;
}
