/**
 * Per-type scale configuration for the widget.
 * Mirrors apps/uservane-api/src/survey-types.ts (kept in sync intentionally;
 * browser must not import the API package).
 */

export type SurveyType = "nps" | "csat" | "ces" | "pmf";

export type ScaleOption = {
  value: number;
  label: string;
};

export type ScaleConfig = {
  type: SurveyType;
  min: number;
  max: number;
  defaultEndLabels?: { low: string; high: string };
  options?: readonly ScaleOption[];
  groupLabel: string;
};

export const PMF_VERY = 2;
export const PMF_SOMEWHAT = 1;
export const PMF_NOT = 0;

export const SCALE_BY_TYPE: Record<SurveyType, ScaleConfig> = {
  nps: {
    type: "nps",
    min: 0,
    max: 10,
    defaultEndLabels: { low: "Not at all likely", high: "Extremely likely" },
    groupLabel: "Rating from 0 to 10",
  },
  csat: {
    type: "csat",
    min: 1,
    max: 5,
    defaultEndLabels: { low: "Very dissatisfied", high: "Very satisfied" },
    groupLabel: "Satisfaction rating from 1 to 5",
  },
  ces: {
    type: "ces",
    min: 1,
    max: 7,
    defaultEndLabels: { low: "Strongly disagree", high: "Strongly agree" },
    groupLabel: "Effort rating from 1 to 7",
  },
  pmf: {
    type: "pmf",
    min: 0,
    max: 2,
    options: [
      { value: PMF_VERY, label: "Very disappointed" },
      { value: PMF_SOMEWHAT, label: "Somewhat disappointed" },
      { value: PMF_NOT, label: "Not disappointed" },
    ],
    groupLabel: "How disappointed would you be",
  },
};

export function parseSurveyType(raw: string | null | undefined): SurveyType {
  if (raw === "csat" || raw === "ces" || raw === "pmf" || raw === "nps") {
    return raw;
  }
  return "nps";
}

export function scaleForType(type: SurveyType | string): ScaleConfig {
  return SCALE_BY_TYPE[parseSurveyType(type)];
}

/**
 * Actionable follow-up path (optional "want us to follow up?").
 * NPS: detractors 0-6. CSAT: 1-2. CES: 1-3.
 * PMF: "not disappointed" (PMF_NOT=0). That is the churn-risk / actionable-
 * negative signal (they will not miss the product). "Very disappointed" is the
 * PMF *positive* fit signal and is NOT the follow-up target. Matches the
 * webhook isDetractor flag via classifyResponseLabel (rating===0).
 */
export function isLowScoreFollowUp(type: SurveyType | string, rating: number): boolean {
  const t = parseSurveyType(type);
  switch (t) {
    case "nps":
      return rating <= 6;
    case "csat":
      return rating <= 2;
    case "ces":
      return rating <= 3;
    case "pmf":
      return rating === PMF_NOT;
    default: {
      const _exhaustive: never = t;
      return _exhaustive;
    }
  }
}
