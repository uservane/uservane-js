"use client";

import { useChat } from "@ai-sdk/react";
import { useUserVane } from "@uservane/vercel-ai";
import { DefaultChatTransport, isTextUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import type { UserVaneMetadata } from "./feedback-metadata";

type ChatUIMessage = UIMessage<UserVaneMetadata>;

export default function Page() {
  const { resolveTask, bind } = useUserVane();

  // One session id for the whole conversation. Generated once, sent with every
  // request, and never regenerated: the feedback score has to land on the
  // session this conversation actually happened in.
  const [sessionId] = useState(() => crypto.randomUUID());
  const [transport] = useState(
    () =>
      new DefaultChatTransport<ChatUIMessage>({
        api: "/api/chat",
        body: { sessionId, userId: "example-user" },
      }),
  );

  const { messages, sendMessage, status, error } = useChat<ChatUIMessage>({ transport });
  const [input, setInput] = useState("");
  const [resolved, setResolved] = useState(false);
  const [bound, setBound] = useState(false);
  // Ref guard keeps bind() idempotent under StrictMode double-invocation;
  // the state above is what the UI renders from.
  const boundRef = useRef(false);

  const busy = status === "submitted" || status === "streaming";

  // Bind once, as soon as the server hands us a token for this session.
  useEffect(() => {
    if (boundRef.current) return;
    for (const message of messages) {
      const binding = message.metadata?.uservane;
      if (binding) {
        boundRef.current = true;
        bind({
          surveyId: binding.surveyId,
          sessionId: binding.sessionId,
          showToken: binding.showToken,
        });
        setBound(true);
        return;
      }
    }
  }, [messages, bind]);

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const text = input.trim();
      if (!text || busy) return;
      setInput("");
      void sendMessage({ text });
    },
    [busy, input, sendMessage],
  );

  const onResolve = useCallback(() => {
    if (resolved) return;
    // Honesty: fire only when the user confirms the outcome, never when the
    // model merely stopped generating.
    resolveTask({ outcome: "answered" });
    setResolved(true);
  }, [resolveTask, resolved]);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 80px" }}>
      <header style={{ marginBottom: 28 }}>
        <p style={{ margin: 0, color: "#7d8b99", fontSize: 13, letterSpacing: 0.04 }}>
          Example · @uservane/vercel-ai
        </p>
        <h1 style={{ margin: "6px 0 8px", fontSize: 28, fontWeight: 650 }}>
          Chat, then resolve the task
        </h1>
        <p style={{ margin: 0, color: "#9aa7b5", lineHeight: 1.55, fontSize: 15 }}>
          Ask something. When the answer is good enough for you, click{" "}
          <strong style={{ color: "#e8eef5" }}>Mark task resolved</strong>. UserVane only asks for
          feedback after a real outcome.
        </p>
      </header>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 12,
          marginBottom: 20,
          minHeight: 200,
        }}
      >
        {messages.length === 0 && (
          <p style={{ color: "#6b7785", fontSize: 14 }}>
            Try: “Summarize why in-product feedback needs a margin of error.”
          </p>
        )}
        {messages.map((m) => {
          const text = m.parts
            .filter(isTextUIPart)
            .map((p) => p.text)
            .join("");
          if (!text) return null;
          return (
            <div
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "90%",
                padding: "10px 14px",
                borderRadius: 12,
                background: m.role === "user" ? "#1a3a52" : "#141a22",
                border: "1px solid #243040",
                whiteSpace: "pre-wrap",
                fontSize: 14,
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontSize: 11, color: "#7d8b99", marginBottom: 4 }}>
                {m.role === "user" ? "You" : "Assistant"}
              </div>
              {text}
            </div>
          );
        })}
        {status === "submitted" && <p style={{ color: "#6b7785", fontSize: 13 }}>Thinking…</p>}
      </div>

      {error && (
        <p style={{ color: "#f07178", fontSize: 13 }} role="alert">
          {error.message}
        </p>
      )}

      <form onSubmit={onSubmit} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Message…"
          disabled={busy}
          style={{
            flex: 1,
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #2a3544",
            background: "#0f141b",
            color: "#e8eef5",
            fontSize: 15,
          }}
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: "#3d8bfd",
            color: "#fff",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Send
        </button>
      </form>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onResolve}
          disabled={!bound || resolved || busy}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid #3d8bfd",
            background: resolved ? "#1a2838" : "transparent",
            color: "#cfe0ff",
            fontWeight: 600,
            cursor: bound && !resolved ? "pointer" : "not-allowed",
            opacity: bound && !resolved ? 1 : 0.5,
          }}
        >
          {resolved ? "Task resolved" : "Mark task resolved"}
        </button>
        <span style={{ fontSize: 12, color: "#6b7785" }}>
          {bound
            ? "Session bound. Resolve when the outcome is real."
            : "Send a message first so the server can mint a feedback token."}
        </span>
      </div>

      <p style={{ marginTop: 36, fontSize: 12, color: "#5a6673", lineHeight: 1.5 }}>
        Docs:{" "}
        <a href="https://docs.uservane.com/start/quickstart-agent/" style={{ color: "#8eb6ff" }}>
          agent quickstart
        </a>
        . SDK:{" "}
        <a href="https://www.npmjs.com/package/@uservane/vercel-ai" style={{ color: "#8eb6ff" }}>
          @uservane/vercel-ai
        </a>
        .
      </p>
    </main>
  );
}
