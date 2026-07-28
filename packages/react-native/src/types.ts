import type { SurveyDefinition } from "@uservane/browser";

/** Survey currently presented to the respondent (render state). */
export type ActiveSurvey = {
  survey: SurveyDefinition;
  /** Single-use server show-token; required for response ingestion. */
  showToken: string;
};

export type SurveyCompleteResult = {
  rating: number;
  text?: string;
  followUpRequested?: boolean;
};
