import { describe, expect, it } from "vitest";
import { decideShow, matchesTargeting } from "../src/show-decision.js";
import { makeBootstrap, makeSurvey } from "./helpers.js";

describe("show-decision", () => {
  const baseState = {
    userId: "u1",
    traits: { plan: "pro" } as Record<string, unknown>,
    rulesLoaded: true,
    rulesFailed: false,
    sessionShown: new Set<string>(),
    localSuppression: new Set<string>(),
  };

  it("shows when all conditions pass", () => {
    const survey = makeSurvey();
    const rules = makeBootstrap({
      surveys: [survey],
      showTokens: { [survey.id]: "tok" },
    });
    const d = decideShow(survey, { ...baseState, rules });
    expect(d.show).toBe(true);
    expect(d.showToken).toBe("tok");
  });

  it("blocks when rules failed (network)", () => {
    const survey = makeSurvey();
    const d = decideShow(survey, {
      ...baseState,
      rules: null,
      rulesFailed: true,
      rulesLoaded: true,
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("network");
  });

  it("server suppression without local seed blocks (mutation-sensitive)", () => {
    const survey = makeSurvey();
    const rules = makeBootstrap({
      surveys: [survey],
      suppression: [survey.id],
      showTokens: { [survey.id]: "tok" },
    });
    const d = decideShow(survey, {
      ...baseState,
      rules,
      localSuppression: new Set(),
      sessionShown: new Set(),
    });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("suppressed");
  });

  it("blocks session-shown", () => {
    const survey = makeSurvey();
    const rules = makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok" } });
    const d = decideShow(survey, {
      ...baseState,
      rules,
      sessionShown: new Set([survey.id]),
    });
    expect(d.reason).toBe("suppressed");
  });

  it("targeting eq works", () => {
    const survey = makeSurvey({
      targeting: [{ trait: "plan", op: "eq", value: "pro" }],
    });
    expect(matchesTargeting(survey, { plan: "pro" })).toBe(true);
    expect(matchesTargeting(survey, { plan: "free" })).toBe(false);
  });

  it("targeting miss blocks show", () => {
    const survey = makeSurvey({
      targeting: [{ trait: "plan", op: "eq", value: "enterprise" }],
    });
    const rules = makeBootstrap({ surveys: [survey], showTokens: { [survey.id]: "tok" } });
    const d = decideShow(survey, { ...baseState, rules, traits: { plan: "pro" } });
    expect(d.show).toBe(false);
    expect(d.reason).toBe("targeting");
  });
});
