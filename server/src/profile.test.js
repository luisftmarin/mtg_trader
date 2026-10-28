import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeSettings, settingAllows } from "./profileSettings.js";

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
