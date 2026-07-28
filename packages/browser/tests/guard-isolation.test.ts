/**
 * Isolated mutation-sensitive guards.
 * These go RED if the corresponding check is removed from production code.
 */
import { describe, expect, it } from "vitest";
import { decideShow, isSuppressed } from "../src/show-decision.js";
import { makeBootstrap, makeSurvey } from "./helpers.js";

describe("isolated server-suppression guard", () => {
  it("server suppression alone blocks show when localSuppression is empty", () => {
    const survey = makeSurvey({ id: "s_server_only" });
    const rules = makeBootstrap({
      surveys: [survey],
      // Server says answered - this is the ONLY suppression source.
      suppression: [survey.id],
      showTokens: { [survey.id]: "tok_still_issued" },
    });

    // Mutation target: if show-decision stops consulting rules.suppression,
    // this test goes RED (would show: true).
    const d = decideShow(survey, {
      userId: "u_new_device",
      traits: {},
      rules,
      rulesLoaded: true,
      rulesFailed: false,
      sessionShown: new Set(), // empty
      localSuppression: new Set(), // NOT pre-seeded
    });

    expect(d.show).toBe(false);
    expect(d.reason).toBe("suppressed");
    expect(isSuppressed(survey.id, rules, new Set(), new Set())).toBe(true);
  });
});

describe("isolated rulesFailed fail-closed guard", () => {
  it("rulesFailed alone forces no-show even if a cached rules object is present", () => {
    const survey = makeSurvey();
    const rules = makeBootstrap({
      surveys: [survey],
      suppression: [],
      showTokens: { [survey.id]: "tok" },
    });

    // Mutation target: if the rulesFailed check is removed from decideShow,
    // this would return show: true.
    const d = decideShow(survey, {
      userId: "u1",
      traits: {},
      rules, // present
      rulesLoaded: true,
      rulesFailed: true, // network path marked failed
      sessionShown: new Set(),
      localSuppression: new Set(),
    });

    expect(d.show).toBe(false);
    expect(d.reason).toBe("network");
  });

  it("null rules + loaded => no-rules (not a partial render path)", () => {
    const survey = makeSurvey();
    const d = decideShow(survey, {
      userId: "u1",
      traits: {},
      rules: null,
      rulesLoaded: true,
      rulesFailed: false,
      sessionShown: new Set(),
      localSuppression: new Set(),
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("no-rules");
  });
});
