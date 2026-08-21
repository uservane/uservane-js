/**
 * Shared shape for the UserVane binding the server attaches to the assistant
 * message. Imported by both the route handler and the client page so the two
 * sides cannot drift.
 */
export type UserVaneMetadata = {
  uservane?: {
    /** Stable for the whole conversation. The score lands on this session. */
    sessionId: string;
    surveyId: string;
    /** Short-lived, session-bound show-token. Safe to send to the browser. */
    showToken: string;
  };
};
