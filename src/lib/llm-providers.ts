import type { LlmProvider, LlmSettings } from "./types";

export type LlmProviderInfo = {
  id: LlmProvider;
  label: string;
  description: string;
  defaultBaseUrl: string;
  defaultModel: string;
  models: string[];
  apiKeyRequired: boolean;
  /** Loopback OpenAI-compatible servers */
  local: boolean;
  protocol: "openai" | "anthropic";
};

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    description: "API cloud OpenAI (Chat Completions).",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    models: [
      "gpt-4o-mini",
      "gpt-4o",
      "gpt-4.1-mini",
      "gpt-4.1",
      "o4-mini",
      "o3-mini",
    ],
    apiKeyRequired: true,
    local: false,
    protocol: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "API cloud Claude (Messages).",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
    models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-4-5-20251001",
      "claude-3-5-haiku-latest",
      "claude-3-5-sonnet-latest",
    ],
    apiKeyRequired: true,
    local: false,
    protocol: "anthropic",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    description: "Serveur local Ollama, API compatible OpenAI.",
    defaultBaseUrl: "http://127.0.0.1:11434/v1",
    defaultModel: "llama3.2",
    models: [
      "llama3.2",
      "llama3.1",
      "llama3.3",
      "mistral",
      "mixtral",
      "qwen2.5",
      "qwen2.5-coder",
      "gemma2",
      "phi3",
      "codellama",
      "deepseek-r1",
      "nomic-embed-text",
    ],
    apiKeyRequired: false,
    local: true,
    protocol: "openai",
  },
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    description: "Serveur local LM Studio (onglet Local Server).",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    models: ["local-model"],
    apiKeyRequired: false,
    local: true,
    protocol: "openai",
  },
  {
    id: "vllm",
    label: "vLLM (local)",
    description: "Endpoint OpenAI-compatible exposé par vLLM.",
    defaultBaseUrl: "http://127.0.0.1:8000/v1",
    defaultModel: "default",
    models: ["default"],
    apiKeyRequired: false,
    local: true,
    protocol: "openai",
  },
  {
    id: "compatible",
    label: "OpenAI-compatible (custom)",
    description:
      "Tout endpoint /v1/chat/completions (Groq, Together, OpenRouter, proxy…).",
    defaultBaseUrl: "",
    defaultModel: "",
    models: [],
    apiKeyRequired: false,
    local: false,
    protocol: "openai",
  },
];

export function getLlmProvider(id: LlmProvider): LlmProviderInfo {
  return (
    LLM_PROVIDERS.find((p) => p.id === id) ??
    LLM_PROVIDERS.find((p) => p.id === "compatible")!
  );
}

export function defaultsForProvider(id: LlmProvider): Pick<
  LlmSettings,
  "provider" | "baseUrl" | "model"
> {
  const info = getLlmProvider(id);
  return {
    provider: info.id,
    baseUrl: info.defaultBaseUrl,
    model: info.defaultModel,
  };
}

export const LLM_PROVIDER_IDS = LLM_PROVIDERS.map((p) => p.id) as [
  LlmProvider,
  ...LlmProvider[],
];
