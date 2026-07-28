import type {
  ActiveAsk,
  AgentController,
  AgentIdentifyOptions,
  BoundTokenBinding,
  CompleteOptions,
  ResolveTaskOptions,
} from "@uservane/agent-core";
import { createContext } from "react";

export type UserVaneContextValue = {
  apiKey: string;
  apiBase: string | undefined;
  debug: boolean | undefined;
  controller: AgentController;
  active: ActiveAsk | null;
  identify: (opts?: AgentIdentifyOptions) => void;
  resolveTask: (opts?: ResolveTaskOptions) => void;
  noteUserTurn: () => void;
  survey: (slug: string) => void;
  dismiss: () => void;
  complete: (result: CompleteOptions) => void;
  isTaskOpen: () => boolean;
  /** Install a server-minted session-bound token (production linked path). */
  bind: (binding: BoundTokenBinding) => void;
};

export const UserVaneContext = createContext<UserVaneContextValue | null>(null);
