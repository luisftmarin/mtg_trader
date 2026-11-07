import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeMatches } from "./matching.js";

describe("computeMatches", () => {
  it("passes through which wishlists a wanted card is on", () => {
    const matches = computeMatches({
      1: { name: "ana", collection: [], wishlist: [{ match_key: "sol ring", card_name: "Sol Ring", qty: 2, lists: ["Atraxa deck", "Wishlist"] }] },
      2: { name: "bo", collection: [{ match_key: "sol ring", card_name: "Sol Ring", qty: 1 }], wishlist: [] },
    });
    assert.equal(matches.length, 1);
    assert.deepEqual(matches[0].lists, ["Atraxa deck", "Wishlist"]);
    assert.equal(matches[0].tradeAvailable, 1);
  });

  it("leaves lists off when the wishlist row has none", () => {
    const [m] = computeMatches({
      1: { name: "ana", collection: [], wishlist: [{ match_key: "shock", card_name: "Shock", qty: 1 }] },
      2: { name: "bo", collection: [{ match_key: "shock", card_name: "Shock", qty: 4 }], wishlist: [] },
    });
    assert.equal("lists" in m, false);
  });
});
