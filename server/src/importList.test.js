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

  it("skips Moxfield section headers", () => {
    const rows = parseImportLines("Commanders:\n1 Atraxa, Praetors' Voice\nDeck:\n1 Sol Ring\n");
    assert.deepEqual(
      rows.map((r) => [r.qty, r.name]),
      [
        [1, "Atraxa, Praetors' Voice"],
        [1, "Sol Ring"],
      ]
    );
  });

  it("reads Archidekt collection CSV headers", () => {
    const rows = parseImportLines(
      [
        "Quantity,Name,Finish,Condition,Date Added,Language,Purchase Price,Tags,Edition Name,Edition Code,Multiverse Id,Scryfall ID,Collector Number",
        '2,Sol Ring,Normal,NM,2024-01-01,EN,,,"Commander Masters",CMM,1,aaaa,1',
        '1,"Atraxa, Praetors\' Voice",Foil,NM,2024-01-02,DE,,,"New Capenna Commander",NCC,2,bbbb,2',
      ].join("\n"),
      "archidekt"
    );
    assert.deepEqual(
      rows.map((r) => [r.qty, r.name, r.lang]).sort((a, b) => a[1].localeCompare(b[1])),
      [
        [1, "Atraxa, Praetors' Voice", "DE"],
        [2, "Sol Ring", "EN"],
      ]
    );
  });

  it("does not treat Edition Name as the card name", () => {
    const rows = parseImportLines(
      "Quantity,Name,Edition Name\n1,Lightning Bolt,Limited Edition Alpha\n",
      "archidekt"
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Lightning Bolt");
  });

  it("reads ManaBox CSV and skips maybeboard", () => {
    const rows = parseImportLines(
      [
        "ManaBox CSV Format,,,",
        "Binder Name,Binder Type,Name,Set code,Quantity",
        "Main,binder,Lightning Bolt,LEA,4",
        "Extras,Maybeboard,Shock,M11,8",
      ].join("\n")
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Lightning Bolt");
    assert.equal(rows[0].qty, 4);
  });

  it("reads Deckbox Count column", () => {
    const rows = parseImportLines('Count,Tradelist Count,Name\n3,0,Birds of Paradise\n');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].qty, 3);
    assert.equal(rows[0].name, "Birds of Paradise");
  });
});

describe("tagImportRows", () => {
  it("marks new, qty replace, kept, removed and unknown", () => {
    const parsed = parseImportLines("2 Shock\n1 Fake Card Name XYZ");
    const tagged = tagImportRows(
      parsed,
      [
        { match_key: "shock", qty: 1, card_name: "Shock" },
        { match_key: "solring", qty: 1, card_name: "Sol Ring" },
      ],
      {
        found: [{ match_key: "shock", name: "Shock", eur: 0.12 }],
        not_found: ["Fake Card Name XYZ"],
      }
    );
    assert.equal(tagged[0].kind, "upd");
    assert.equal(tagged[0].note, "have 1 → 2");
    assert.equal(tagged[1].kind, "unk");
    assert.equal(tagged[2].kind, "del");
    assert.equal(tagged[2].name, "Sol Ring");
  });
});

describe("applyImportRows", () => {
  it("replaces the list instead of adding qty", () => {
    const next = applyImportRows(
      [
        { card_name: "Shock", qty: 1, lang: "EN", match_key: "shock" },
        { card_name: "Sol Ring", qty: 1, lang: "EN", match_key: "solring" },
      ],
      [
        { kind: "upd", name: "Shock", qty: 2, match_key: "shock" },
        { kind: "new", name: "Bolt", qty: 4, match_key: "bolt" },
        { kind: "unk", name: "Nope", qty: 1 },
        { kind: "del", name: "Sol Ring", qty: 1, match_key: "solring" },
      ],
      "DE"
    );
    assert.equal(next.find((c) => c.cardName === "Shock").qty, 2);
    assert.equal(next.find((c) => c.cardName === "Shock").lang, "EN");
    assert.equal(next.find((c) => c.cardName === "Bolt").lang, "DE");
    assert.equal(next.find((c) => c.cardName === "Sol Ring"), undefined);
    assert.equal(next.length, 2);
  });
});
