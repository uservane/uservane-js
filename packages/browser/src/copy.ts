/**
 * All user-facing strings. Hard rule: no em-dashes (U+2014) anywhere.
 */

export const COPY = {
  /** Warm, short thanks. No second favor, no CTA. */
  thanks: "Thank you. That's genuinely useful.",
  skip: "Skip",
  submit: "Send",
  dismiss: "Dismiss",
  close: "Close",
  followUpOffer: "Want us to follow up?",
  followUpYes: "Yes, please",
  followUpNo: "No thanks",
  npsLow: "Not at all likely",
  npsHigh: "Extremely likely",
  csatLow: "Very dissatisfied",
  csatHigh: "Very satisfied",
  cesLow: "Strongly disagree",
  cesHigh: "Strongly agree",
  pmfVery: "Very disappointed",
  pmfSomewhat: "Somewhat disappointed",
  pmfNot: "Not disappointed",
  poweredBy: "Powered by UserVane",
  poweredByUrl: "https://uservane.com",
  ratingGroupLabel: "Rating from 0 to 10",
  csatGroupLabel: "Satisfaction rating from 1 to 5",
  cesGroupLabel: "Effort rating from 1 to 7",
  pmfGroupLabel: "How disappointed would you be",
  liveRegionQuestion: "Survey question available",
  liveRegionThanks: "Thank you for your response",
  liveRegionFollowUp: "Optional follow-up question",
} as const;

/** Assert no em-dash (U+2014) in any shipped copy string. Used by tests. */
export function allCopyValues(): string[] {
  return Object.values(COPY);
}
