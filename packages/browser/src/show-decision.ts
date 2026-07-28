/**
 * Client-side show-decision. Deterministic, offline-safe against cached rules.
 * Fail-safe: missing rules/token/suppression => do not show.
 */

import { log } from "./debug.js";
import { isSampledIn } from "./hash.js";
import type {
  BootstrapResponse,
  ClientState,
  ShowReason,
  SurveyDefinition,
  TraitPredicate,
} from "./types.js";

export type Decision = {
  show: boolean;
  reason: ShowReason;
  survey?: SurveyDefinition;
  showToken?: string;
};

function matchPredicate(pred: TraitPredicate, traits: Record<string, unknown>): boolean {
  const val = traits[pred.trait];
  switch (pred.op) {
    case "exists":
      return val !== undefined && val !== null;
    case "eq":
      return val === pred.value;
    case "neq":
      return val !== pred.value;
    case "in":
      return Array.isArray(pred.value) && pred.value.includes(val);
    case "gt":
      return typeof val === "number" && typeof pred.value === "number" && val > pred.value;
    case "lt":
      return typeof val === "number" && typeof pred.value === "number" && val < pred.value;
    case "gte":
      return typeof val === "number" && typeof pred.value === "number" && val >= pred.value;
    case "lte":
      return typeof val === "number" && typeof pred.value === "number" && val <= pred.value;
    default:
      return false;
  }
}

export function matchesTargeting(
  survey: SurveyDefinition,
  traits: Record<string, unknown>,
): boolean {
  const preds = survey.targeting;
  if (!preds || preds.length === 0) return true;
  return preds.every((p) => matchPredicate(p, traits));
}

export function isSuppressed(
  surveyId: string,
  rules: BootstrapResponse | null,
  local: Set<string>,
  session: Set<string>,
): boolean {
  if (session.has(surveyId)) return true;
  if (local.has(surveyId)) return true;
  if (rules?.suppression.includes(surveyId)) return true;
  return false;
}

/**
 * Evaluate whether a survey may be shown right now.
 * Requires identity for sampling/suppression stability; without userId we
 * still allow show if sample is 100% and not suppressed (anonymous).
 */
export function decideShow(
  survey: SurveyDefinition,
  state: Pick<
    ClientState,
    | "userId"
    | "traits"
    | "rules"
    | "rulesLoaded"
    | "rulesFailed"
    | "sessionShown"
    | "localSuppression"
  >,
): Decision {
  if (state.rulesFailed || !state.rulesLoaded || !state.rules) {
    return { show: false, reason: state.rulesFailed ? "network" : "no-rules" };
  }

  if (isSuppressed(survey.id, state.rules, state.localSuppression, state.sessionShown)) {
    log("decision", survey.slug, "suppressed");
    return { show: false, reason: "suppressed", survey };
  }

  if (!matchesTargeting(survey, state.traits)) {
    log("decision", survey.slug, "targeting miss");
    return { show: false, reason: "targeting", survey };
  }

  const sample = survey.samplePercent ?? 100;
  const uid = state.userId ?? "anonymous";
  if (!isSampledIn(uid, survey.id, sample)) {
    log("decision", survey.slug, "sampled out");
    return { show: false, reason: "sampled-out", survey };
  }

  const token = state.rules.showTokens?.[survey.id];
  if (!token) {
    // Server declined (cap / quiet period) or token not issued.
    log("decision", survey.slug, "no show-token");
    return { show: false, reason: "no-token", survey };
  }

  log("decision", survey.slug, "show");
  return { show: true, reason: "show", survey, showToken: token };
}

export function findSurveyBySlug(
  rules: BootstrapResponse | null,
  slug: string,
): SurveyDefinition | undefined {
  return rules?.surveys.find((s) => s.slug === slug);
}
