import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, normalizePhone, settingAllows } from "./profileSettings.js";

describe("profile settings", () => {
  it("defaults alerts on and digest off", () => {
    const s = mergeSettings(null);
    assert.equal(s.alert_matches, true);
    assert.equal(s.alert_proposals, true);
    assert.equal(s.alert_comments, true);
    assert.equal(s.weekly_digest, false);
  });

  it("honours explicit offs", () => {
    const s = mergeSettings({ alert_matches: false, weekly_digest: true });
    assert.equal(s.alert_matches, false);
    assert.equal(s.weekly_digest, true);
    assert.equal(settingAllows(s, "match"), false);
    assert.equal(settingAllows(s, "proposal"), true);
  });
});

describe("normalizePhone", () => {
  it("keeps only digits with the country code", () => {
    assert.equal(normalizePhone("+351 912 345 678"), "351912345678");
    assert.equal(normalizePhone("0049 (151) 234-5678"), "491512345678");
  });

  it("treats blank as cleared", () => {
    assert.equal(normalizePhone("   "), "");
    assert.equal(normalizePhone(undefined), "");
  });

  it("rejects letters and wrong lengths", () => {
    assert.equal(normalizePhone("call me"), null);
    assert.equal(normalizePhone("12345"), null);
    assert.equal(normalizePhone("+1234567890123456"), null);
  });
});
