import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseImportLines, tagImportRows, applyImportRows } from "./importList.js";

describe("parseImportLines", () => {
  it("reads qty, optional x, and strips a set code tail", () => {
    const rows = parseImportLines("4 Lightning Bolt\n1x Sol Ring (CMM) 464\nRhystic Study\n");
    assert.equal(rows.length, 3);
    assert.deepEqual(
      rows.map((r) => [r.qty, r.name]),
      [
        [4, "Lightning Bolt"],
        [1, "Sol Ring"],
        [1, "Rhystic Study"],
      ]
    );
  });

  it("skips blanks, comments and a CSV header", () => {
    const rows = parseImportLines("Name,Qty\n// comment\n2 Birds of Paradise\n");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Birds of Paradise");
  });

  it("merges duplicate names", () => {
    const rows = parseImportLines("2 Shock\n1 Shock");
    assert.equal(rows.length, 1);
    assert.equal(rows[0].qty, 3);
  });
});

describe("tagImportRows", () => {
  it("marks new, updated and unknown", () => {
    const parsed = parseImportLines("2 Shock\n1 Fake Card Name XYZ");
    const tagged = tagImportRows(parsed, [{ match_key: "shock", qty: 1, card_name: "Shock" }], {
      found: [{ match_key: "shock", name: "Shock", eur: 0.12 }],
      not_found: ["Fake Card Name XYZ"],
    });
    assert.equal(tagged[0].kind, "upd");
    assert.equal(tagged[0].note, "have 1 → 3");
    assert.equal(tagged[1].kind, "unk");
  });
});

describe("applyImportRows", () => {
  it("adds qty to existing rows and appends new ones", () => {
    const next = applyImportRows(
      [{ card_name: "Shock", qty: 1, lang: "EN" }],
      [
        { kind: "upd", name: "Shock", qty: 2 },
        { kind: "new", name: "Bolt", qty: 4 },
        { kind: "unk", name: "Nope", qty: 1 },
      ],
      "DE"
    );
    assert.equal(next.find((c) => c.cardName === "Shock").qty, 3);
    assert.equal(next.find((c) => c.cardName === "Bolt").lang, "DE");
    assert.equal(next.length, 2);
  });
});
