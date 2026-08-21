import { createOpenAI } from "@ai-sdk/openai";
import { mintFeedbackToken } from "@uservane/vercel-ai/server";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import type { UserVaneMetadata } from "../../feedback-metadata";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Stream a chat reply and mint a UserVane show-token bound to the conversation's
 * sessionId.
 *
 * The sessionId is supplied by the CLIENT and is stable for the whole
 * conversation. That is the point of the integration: the score has to land on
 * the same session you traced, so it cannot be minted fresh per request.
 *
 * The binding travels back to the browser as assistant-message metadata, which
 * is the AI SDK's supported channel for server data. The client calls bind()
 * with it, and later resolveTask() when the user says the task is done.
 */
export async function POST(req: Request) {
  const secretKey = process.env.USERVANE_SECRET_KEY;
  if (!secretKey) {
    return new Response("USERVANE_SECRET_KEY is not set", { status: 500 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return new Response("OPENAI_API_KEY is not set", { status: 500 });
  }

  let body: { messages?: UIMessage[]; sessionId?: string; userId?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const messages = body.messages ?? [];
  const sessionId = body.sessionId;
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    // Fail rather than invent one. A guessed session id would attach the score
    // to the wrong conversation, which is worse than no score at all.
    return new Response("sessionId is required", { status: 400 });
  }
  const userId =
    typeof body.userId === "string" && body.userId.length > 0 ? body.userId : "example-anon";

  const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const modelId = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const result = streamText({
    model: openai(modelId),
    system: "You are a concise product assistant for a demo. Answer clearly in a few sentences.",
    messages: await convertToModelMessages(messages),
  });

  // Mint before streaming finishes so the binding can ride out on the `start`
  // metadata event. A mint failure must not break the chat, so it degrades to
  // "no feedback ask" rather than a 500.
  let binding: UserVaneMetadata["uservane"];
  try {
    const mint = await mintFeedbackToken({
      secretKey,
      respondentId: userId,
      sessionId,
      ...(process.env.USERVANE_SURVEY_ID ? { surveyId: process.env.USERVANE_SURVEY_ID } : {}),
    });
    // tokens is surveyId -> showToken, and is empty when the respondent is
    // suppressed (already answered, or asked too recently).
    const first = Object.entries(mint.tokens)[0];
    if (first) {
      const [surveyId, showToken] = first;
      binding = { sessionId, surveyId, showToken };
    }
  } catch (err) {
    console.error("[uservane] mintFeedbackToken failed", err);
  }

  return result.toUIMessageStreamResponse<UIMessage<UserVaneMetadata>>({
    messageMetadata: ({ part }) =>
      part.type === "start" && binding ? { uservane: binding } : undefined,
  });
}
