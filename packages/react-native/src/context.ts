import type { IdentifyOptions } from "@uservane/browser";
import { createContext } from "react";
import type { ActiveSurvey } from "./types.js";

export type UserVaneContextValue = {
  apiKey: string;
  apiBase: string | undefined;
  debug: boolean | undefined;
  /** Imperative survey trigger by slug. Buffers until bootstrap completes. */
  survey: (slug: string) => void;
  /** Identify the respondent; re-bootstraps for server suppression + tokens. */
  identify: (opts: IdentifyOptions) => void;
  /** Currently visible survey, if any. Null when nothing is showing. */
  active: ActiveSurvey | null;
  /** Dismiss without submitting a rating. */
  dismiss: () => void;
  /** Complete with rating (and optional free-text / follow-up request). */
  complete: (result: { rating: number; text?: string; followUpRequested?: boolean }) => void;
};

export const UserVaneContext = createContext<UserVaneContextValue | null>(null);
