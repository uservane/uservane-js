import { useContext } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";

export type UseUserVaneResult = {
  survey: UserVaneContextValue["survey"];
  identify: UserVaneContextValue["identify"];
  /** Currently visible survey, if any. */
  active: UserVaneContextValue["active"];
};

/**
 * Imperative UserVane API for React Native trees under `UserVaneProvider`.
 * References for survey/identify are stable across re-renders.
 */
export function useUserVane(): UseUserVaneResult {
  const ctx = useContext(UserVaneContext);
  if (ctx === null) {
    throw new Error("useUserVane must be used within a UserVaneProvider");
  }
  return { survey: ctx.survey, identify: ctx.identify, active: ctx.active };
}
