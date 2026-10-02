import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseDeckUrl, extractMoxfieldCards } from "./deckImport.js";

describe("parseDeckUrl", () => {
  it("reads Archidekt decks and collections", () => {
    assert.deepEqual(parseDeckUrl("https://archidekt.com/decks/12345"), { kind: "deck", id: "12345" });
    assert.deepEqual(parseDeckUrl("https://archidekt.com/collection/v2/99"), { kind: "collection", id: "99" });
  });

  it("reads a Moxfield deck slug", () => {
    assert.deepEqual(parseDeckUrl("https://www.moxfield.com/decks/nTgx8qj-fk2PPJts7KfqDA"), {
      kind: "moxfield",
      id: "nTgx8qj-fk2PPJts7KfqDA",
    });
  });

  it("returns null for unknown hosts", () => {
    assert.equal(parseDeckUrl("https://example.com/decks/1"), null);
  });
});

describe("extractMoxfieldCards", () => {
  it("pulls commanders and mainboard from the v2 shape", () => {
    const cards = extractMoxfieldCards({
      commanders: { Atraxa: { quantity: 1, card: { name: "Atraxa, Praetors' Voice" } } },
      mainboard: { "Sol Ring": { quantity: 1, card: { name: "Sol Ring" } } },
      maybeboard: { Shock: { quantity: 4, card: { name: "Shock" } } },
    });
    assert.deepEqual(
      cards.map((c) => [c.cardName, c.qty]).sort(),
      [
        ["Atraxa, Praetors' Voice", 1],
        ["Sol Ring", 1],
      ]
    );
  });

  it("reads the v3 boards.cards shape and merges duplicates", () => {
    const cards = extractMoxfieldCards({
      name: "Test",
      boards: {
        mainboard: {
          cards: {
            a: { quantity: 2, card: { name: "Lightning Bolt" } },
            b: { quantity: 1, card: { name: "Lightning Bolt" } },
          },
        },
      },
    });
    assert.equal(cards.length, 1);
    assert.equal(cards[0].qty, 3);
  });
});
