import { useContext } from "react";
import { UserVaneContext, type UserVaneContextValue } from "./context.js";

export type UseUserVaneResult = {
  identify: UserVaneContextValue["identify"];
  resolveTask: UserVaneContextValue["resolveTask"];
  noteUserTurn: UserVaneContextValue["noteUserTurn"];
  survey: UserVaneContextValue["survey"];
  dismiss: UserVaneContextValue["dismiss"];
  complete: UserVaneContextValue["complete"];
  isTaskOpen: UserVaneContextValue["isTaskOpen"];
  bind: UserVaneContextValue["bind"];
  active: UserVaneContextValue["active"];
  controller: UserVaneContextValue["controller"];
};

/**
 * Imperative UserVane agent API for React trees under `UserVaneProvider`.
 */
export function useUserVane(): UseUserVaneResult {
  const ctx = useContext(UserVaneContext);
  if (ctx === null) {
    throw new Error("useUserVane must be used within a UserVaneProvider");
  }
  return {
    identify: ctx.identify,
    resolveTask: ctx.resolveTask,
    noteUserTurn: ctx.noteUserTurn,
    survey: ctx.survey,
    dismiss: ctx.dismiss,
    complete: ctx.complete,
    isTaskOpen: ctx.isTaskOpen,
    bind: ctx.bind,
    active: ctx.active,
    controller: ctx.controller,
  };
}
