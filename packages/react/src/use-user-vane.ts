import { useContext } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";

export type UseUserVaneResult = {
  survey: UserVaneContextValue["survey"];
  identify: UserVaneContextValue["identify"];
};

/**
 * Imperative UserVane API for React trees under `UserVaneProvider`.
 * References are stable across re-renders (useCallback in the provider).
 */
export function useUserVane(): UseUserVaneResult {
  const ctx = useContext(UserVaneContext);
  if (ctx === null) {
    throw new Error("useUserVane must be used within a UserVaneProvider");
  }
  return { survey: ctx.survey, identify: ctx.identify };
}
