import type { IdentifyOptions } from "@uservane/browser";
import { createContext } from "react";

export type UserVaneContextValue = {
  apiKey: string;
  apiBase: string | undefined;
  debug: boolean | undefined;
  survey: (slug: string) => void;
  identify: (opts: IdentifyOptions) => void;
};

export const UserVaneContext = createContext<UserVaneContextValue | null>(null);
