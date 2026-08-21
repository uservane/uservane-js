---
"@uservane/browser": patch
"@uservane/react": patch
"@uservane/react-native": patch
"@uservane/agent-core": patch
"@uservane/agent-react": patch
"@uservane/vercel-ai": patch
"@uservane/openai-agents": patch
"@uservane/copilotkit": patch
"@uservane/langfuse-push": patch
---

Add npm keywords so the packages are findable by search.

All nine shipped with none, which meant npm search, itself a catalogue we were
already listed in, could not surface them for the terms people actually type:
langfuse, agent-feedback, vercel-ai-sdk, copilotkit, nps, csat. Keywords are
metadata only and change no behaviour, but they only take effect on publish.
