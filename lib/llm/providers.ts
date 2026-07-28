import { JUDGE_SYSTEM_PROMPT, parseCommitJudgment, type CommitJudgment, type JudgeCommitInput } from "@/lib/analysis/judge";

export type LLMProviderId = "openai" | "gemini" | "grok" | "nvidia-nim" | "openrouter";

export interface LLMSelection {
  provider: LLMProviderId;
  model: string;
}

export interface ProviderSummary {
  id: LLMProviderId;
  name: string;
}

export interface ProviderModel {
  id: string;
  name: string;
}

type Fetcher = typeof fetch;

type ProviderConfig = {
  name: string;
  apiKeyEnv: string;
  baseUrl: string;
};

const providerConfigs: Record<LLMProviderId, ProviderConfig> = {
  openai: { name: "OpenAI", apiKeyEnv: "OPENAI_API_KEY", baseUrl: "https://api.openai.com/v1" },
  gemini: { name: "Google Gemini", apiKeyEnv: "GEMINI_API_KEY", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" },
  grok: { name: "xAI Grok", apiKeyEnv: "XAI_API_KEY", baseUrl: "https://api.x.ai/v1" },
  "nvidia-nim": { name: "NVIDIA NIM", apiKeyEnv: "NVIDIA_NIM_API_KEY", baseUrl: process.env.NVIDIA_NIM_BASE_URL ?? "https://integrate.api.nvidia.com/v1" },
  openrouter: { name: "OpenRouter", apiKeyEnv: "OPENROUTER_API_KEY", baseUrl: "https://openrouter.ai/api/v1" },
};

export function getConfiguredProviders(): ProviderSummary[] {
  return (Object.keys(providerConfigs) as LLMProviderId[])
    .filter((provider) => Boolean(process.env[providerConfigs[provider].apiKeyEnv]))
    .map((provider) => ({ id: provider, name: providerConfigs[provider].name }));
}

export function parseLLMSelection(value: unknown): LLMSelection {
  if (!isRecord(value) || !isLLMProviderId(value.provider) || typeof value.model !== "string" || !value.model.trim()) {
    throw new Error("Choose a configured LLM provider and model before analysis.");
  }
  if (!getApiKey(value.provider)) throw new Error(`${providerConfigs[value.provider].name} is not configured on this server.`);

  return { provider: value.provider, model: value.model.trim() };
}

export async function listProviderModels(provider: LLMProviderId, fetcher: Fetcher = fetch): Promise<ProviderModel[]> {
  const apiKey = getApiKey(provider);
  if (!apiKey) throw new Error(`${providerConfigs[provider].name} is not configured on this server.`);

  if (provider === "gemini") {
    const response = await fetcher(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
      headers: { Accept: "application/json" },
    });
    const payload = await parseResponse(response, provider);
    const models = isRecord(payload) && Array.isArray(payload.models) ? payload.models : [];
    return models
      .filter(isRecord)
      .filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes("generateContent"))
      .flatMap((model) => typeof model.name === "string" ? [{ id: model.name.replace(/^models\//, ""), name: typeof model.displayName === "string" ? model.displayName : model.name.replace(/^models\//, "") }] : [])
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  const response = await fetcher(`${getBaseUrl(provider)}/models`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${apiKey}` },
  });
  const payload = await parseResponse(response, provider);
  const models = isRecord(payload) && Array.isArray(payload.data) ? payload.data : [];
  return models
    .filter(isRecord)
    .flatMap((model) => typeof model.id === "string" ? [{ id: model.id, name: typeof model.name === "string" ? model.name : model.id }] : [])
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function judgeCommitWithProvider(
  input: JudgeCommitInput,
  selection: LLMSelection,
  fetcher: Fetcher = fetch,
): Promise<CommitJudgment> {
  const apiKey = getApiKey(selection.provider);
  if (!apiKey) throw new Error(`${providerConfigs[selection.provider].name} is not configured on this server.`);

  const request = {
    model: selection.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: JUDGE_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          commit_message: input.commitMessage,
          diff: input.diffText,
          reference_check: input.referenceCheck,
          coverage_delta: input.coverageDelta,
        }),
      },
    ],
  };

  let response = await sendChatCompletion(request, selection.provider, apiKey, fetcher, true);
  if (!response.ok && (response.status === 400 || response.status === 422)) {
    response = await sendChatCompletion(request, selection.provider, apiKey, fetcher, false);
  }

  const payload = await parseResponse(response, selection.provider);
  const content = getChatContent(payload);
  if (!content) throw new Error(`${providerConfigs[selection.provider].name} returned an empty judgment.`);

  return parseCommitJudgment(content);
}

async function sendChatCompletion(
  request: Record<string, unknown>,
  provider: LLMProviderId,
  apiKey: string,
  fetcher: Fetcher,
  useJsonMode: boolean,
) {
  return fetcher(`${getBaseUrl(provider)}/chat/completions`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ...request,
      ...(useJsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
}

async function parseResponse(response: Response, provider: LLMProviderId): Promise<unknown> {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = isRecord(payload) && isRecord(payload.error) && typeof payload.error.message === "string"
      ? payload.error.message
      : "The provider request failed.";
    throw new Error(`${providerConfigs[provider].name}: ${message}`);
  }
  return payload;
}

function getChatContent(payload: unknown): string | null {
  if (!isRecord(payload) || !Array.isArray(payload.choices) || !isRecord(payload.choices[0])) return null;
  const message = payload.choices[0].message;
  if (!isRecord(message)) return null;
  if (typeof message.content === "string") return message.content;
  if (Array.isArray(message.content)) {
    return message.content.filter(isRecord).map((part) => typeof part.text === "string" ? part.text : "").join("");
  }
  return null;
}

function getApiKey(provider: LLMProviderId): string | undefined {
  return process.env[providerConfigs[provider].apiKeyEnv];
}

function getBaseUrl(provider: LLMProviderId): string {
  return provider === "nvidia-nim"
    ? (process.env.NVIDIA_NIM_BASE_URL ?? providerConfigs[provider].baseUrl).replace(/\/$/, "")
    : providerConfigs[provider].baseUrl;
}

export function isLLMProviderId(value: unknown): value is LLMProviderId {
  return value === "openai" || value === "gemini" || value === "grok" || value === "nvidia-nim" || value === "openrouter";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
