/** Public and internal types for the UserVane browser SDK. */

export type InitOptions = {
  /** Publishable key, e.g. `uv_pk_live_…`. */
  key: string;
  /** API origin. Defaults to `https://api.uservane.com`. */
  apiBase?: string;
  /** When true, logs decision rationale and swallowed errors to the console. */
  debug?: boolean;
};

export type IdentifyOptions = {
  userId: string;
  traits?: Record<string, unknown>;
};

export type Presentation = "corner" | "inline" | "banner";
export type Corner = "bottom-right" | "bottom-left" | "top-right" | "top-left";
export type SurveyType = "nps" | "csat" | "ces" | "pmf";
export type Trigger = "auto" | "manual";

export type TraitOp = "eq" | "neq" | "in" | "gt" | "lt" | "gte" | "lte" | "exists";

export type TraitPredicate = {
  trait: string;
  op: TraitOp;
  value?: unknown;
};

export type SurveyDefinition = {
  id: string;
  slug: string;
  type: SurveyType;
  question: string;
  /** Optional free-text follow-up. Always skippable. */
  followUpQuestion?: string;
  presentation: Presentation;
  corner?: Corner;
  trigger: Trigger;
  /**
   * Fixed delay (ms) after page-idle before auto appearance.
   * Fires once. Not idle-detection hunting. Default 8000.
   */
  delayMs?: number;
  /** Deterministic audience sampling 0–100. Default 100. */
  samplePercent?: number;
  targeting?: TraitPredicate[];
  /** Free plan shows a small "Powered by UserVane" link. */
  showBadge?: boolean;
  endLabels?: { low: string; high: string };
};

/**
 * Payload from the definitions/rules endpoint.
 * Show-tokens are single-use HMACs issued server-side; the client never invents them.
 */
export type BootstrapResponse = {
  surveys: SurveyDefinition[];
  /** Survey ids this respondent has answered or dismissed (server-authoritative). */
  suppression: string[];
  /** Per-survey show-token map. Missing token => server declined (cap/quiet). */
  showTokens?: Record<string, string>;
};

export type SubmitPayload = {
  surveyId: string;
  rating: number;
  text?: string;
  /** Detractor opt-in: respondent asked to be contacted. */
  followUpRequested?: boolean;
  showToken: string;
  userId?: string;
  traits?: Record<string, unknown>;
};

export type WidgetState =
  | "hidden"
  | "entering"
  | "question"
  | "follow-up"
  | "submitting"
  | "thanks"
  | "exiting";

export type ShowReason =
  | "show"
  | "no-identity"
  | "suppressed"
  | "targeting"
  | "sampled-out"
  | "no-token"
  | "already-shown"
  | "not-found"
  | "no-rules"
  | "network";

export type ClientState = {
  key: string;
  apiBase: string;
  debug: boolean;
  userId: string | null;
  traits: Record<string, unknown>;
  rules: BootstrapResponse | null;
  rulesLoaded: boolean;
  rulesFailed: boolean;
  /** Survey ids shown or answered this session (client). */
  sessionShown: Set<string>;
  /** Local remembered dismissals/answers (backup; server is authoritative). */
  localSuppression: Set<string>;
};

export const DEFAULT_API_BASE = "https://api.uservane.com";
/** Fixed generous delay after idle; fires once. [R2] */
export const DEFAULT_AUTO_DELAY_MS = 8000;
export const THANKS_AUTO_DISMISS_MS = 2500;
/** @deprecated Prefer isLowScoreFollowUp(type, rating). NPS-only threshold. */
export const DETRACTOR_MAX = 6;
