import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canAct, nextStatus, otherPartyId, summarizeItems } from "./trades.js";

const trade = { id: 1, proposer_id: 10, partner_id: 20, status: "proposed" };

describe("trade state machine", () => {
  it("maps proposed actions", () => {
    assert.equal(nextStatus("proposed", "accept"), "accepted");
    assert.equal(nextStatus("proposed", "decline"), "declined");
    assert.equal(nextStatus("proposed", "withdraw"), "withdrawn");
    assert.equal(nextStatus("proposed", "complete"), null);
  });

  it("maps accepted actions", () => {
    assert.equal(nextStatus("accepted", "complete"), "completed");
    assert.equal(nextStatus("accepted", "decline"), "declined");
    assert.equal(nextStatus("accepted", "accept"), null);
  });

  it("only the partner may accept or decline", () => {
    assert.equal(canAct(trade, 20, "accept"), true);
    assert.equal(canAct(trade, 10, "accept"), false);
    assert.equal(canAct(trade, 20, "decline"), true);
    assert.equal(canAct(trade, 10, "decline"), false);
  });

  it("only the proposer may withdraw", () => {
    assert.equal(canAct(trade, 10, "withdraw"), true);
    assert.equal(canAct(trade, 20, "withdraw"), false);
  });

  it("either party may complete an accepted trade", () => {
    const accepted = { ...trade, status: "accepted" };
    assert.equal(canAct(accepted, 10, "complete"), true);
    assert.equal(canAct(accepted, 20, "complete"), true);
    assert.equal(canAct(accepted, 99, "complete"), false);
  });

  it("closed trades have no further actions", () => {
    assert.equal(canAct({ ...trade, status: "completed" }, 10, "complete"), false);
    assert.equal(canAct({ ...trade, status: "declined" }, 20, "accept"), false);
  });

  it("splits items into get vs give for the viewer", () => {
    const items = [
      { from_id: 10, card_name: "Bolt" },
      { from_id: 20, card_name: "Sol Ring" },
    ];
    assert.deepEqual(
      summarizeItems(items, 10).give.map((i) => i.card_name),
      ["Bolt"]
    );
    assert.deepEqual(
      summarizeItems(items, 10).get.map((i) => i.card_name),
      ["Sol Ring"]
    );
    assert.equal(otherPartyId(trade, 10), 20);
  });
});
