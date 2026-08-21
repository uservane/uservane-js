# UserVane JavaScript SDKs

Open-source (MIT) client and server SDKs for [UserVane](https://uservane.com):
honest in-product feedback (NPS, CSAT, CES, PMF) and agent-native satisfaction
capture correlated to the traces you already run.

Full documentation: **[docs.uservane.com](https://docs.uservane.com)**.

## Packages

**Widget SDKs** (in-product microsurveys)

| Package | What it does |
|---|---|
| [`@uservane/browser`](packages/browser) | Framework-agnostic browser SDK (one script tag). |
| [`@uservane/react`](packages/react) | React provider + hooks for the widget. |
| [`@uservane/react-native`](packages/react-native) | React Native SDK. |

**Agent-native** (capture at task resolution, correlated to your session)

| Package | What it does |
|---|---|
| [`@uservane/agent-core`](packages/agent-core) | Framework-agnostic headless controller + server-only token mint. |
| [`@uservane/agent-react`](packages/agent-react) | Shared inline capture UI. |
| [`@uservane/vercel-ai`](packages/vercel-ai) | Vercel AI SDK adapter. |
| [`@uservane/openai-agents`](packages/openai-agents) | OpenAI Agents SDK adapter. |
| [`@uservane/copilotkit`](packages/copilotkit) | CopilotKit adapter. |

**Trace sync**

| Package | What it does |
|---|---|
| [`@uservane/langfuse-push`](packages/langfuse-push) | Push UserVane scores into Langfuse as session scores. |

## Quickstart

```bash
npm install @uservane/browser
```

See the [quickstart guides](https://docs.uservane.com/start/quickstart-agent/) for
the agent-native and classic-widget paths.

## Examples

| Path | What it shows |
|---|---|
| [`examples/vercel-ai-chat`](examples/vercel-ai-chat) | Clone-and-run Next.js chat with `@uservane/vercel-ai` (mint token, resolveTask, inline feedback) |

```bash
cd examples/vercel-ai-chat
cp .env.example .env.local   # set UserVane + OpenAI keys
npm install && npm run dev
```

## Development

This is a pnpm workspace.

```bash
pnpm install
pnpm build       # build all packages (tsup)
pnpm typecheck
pnpm test        # vitest
pnpm lint        # biome
```

## Contributing

Pull requests welcome. Add a changeset for any change that should ship to npm:

```bash
pnpm changeset
```

On merge to `main`, a "Version Packages" PR is opened; merging it publishes the
changed packages to npm and cuts GitHub releases.

## License

[MIT](LICENSE) (c) O'Shea & Sons, LLC. UserVane is a product of O'Shea & Sons, LLC.
