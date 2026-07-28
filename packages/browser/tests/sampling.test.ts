import { describe, expect, it } from "vitest";
import { isSampledIn, stableHash } from "../src/hash.js";
import { decideShow } from "../src/show-decision.js";
import { makeBootstrap, makeSurvey } from "./helpers.js";

describe("deterministic sampling", () => {
  it("stableHash is deterministic", () => {
    expect(stableHash("u1\0s1")).toBe(stableHash("u1\0s1"));
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });

  it("same userId+surveyId always same sample decision", () => {
    const a = isSampledIn("user_x", "survey_y", 50);
    for (let i = 0; i < 20; i++) {
      expect(isSampledIn("user_x", "survey_y", 50)).toBe(a);
    }
  });

  it("samplePercent 100 always in; 0 always out", () => {
    expect(isSampledIn("any", "s", 100)).toBe(true);
    expect(isSampledIn("any", "s", 0)).toBe(false);
  });

  it("decideShow returns sampled-out when out of audience", () => {
    const survey = makeSurvey({ samplePercent: 0 });
    const rules = makeBootstrap({
      surveys: [survey],
      showTokens: { [survey.id]: "tok" },
    });
    const d = decideShow(survey, {
      userId: "u1",
      traits: {},
      rules,
      rulesLoaded: true,
      rulesFailed: false,
      sessionShown: new Set(),
      localSuppression: new Set(),
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("sampled-out");
  });

  it("decideShow requires show-token", () => {
    const survey = makeSurvey();
    const rules = makeBootstrap({
      surveys: [survey],
      showTokens: {}, // server declined
    });
    const d = decideShow(survey, {
      userId: "u1",
      traits: {},
      rules,
      rulesLoaded: true,
      rulesFailed: false,
      sessionShown: new Set(),
      localSuppression: new Set(),
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("no-token");
  });
});
