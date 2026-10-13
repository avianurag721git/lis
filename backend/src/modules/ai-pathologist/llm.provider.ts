import { env } from "../../config/env";
import { logger } from "../../common/logger/logger";
import { AiProvider, LlmCompletionRequest, LlmCompletionResponse } from "./aiPathologist.types";

const resolveProvider = (): AiProvider => {
  const p = env.aiProvider.toLowerCase();
  if (p === "openai" || p === "anthropic" || p === "local" || p === "mock") return p;
  if (env.openaiApiKey) return "openai";
  if (env.anthropicApiKey) return "anthropic";
  if (env.aiLocalBaseUrl) return "local";
  return "mock";
};

const resolveModel = (provider: AiProvider): string => {
  if (env.aiModel) return env.aiModel;
  if (provider === "openai") return "gpt-4o";
  if (provider === "anthropic") return "claude-3-5-sonnet-20241022";
  if (provider === "local") return "llama3.2";
  return "mock-clinical-v1";
};

const callOpenAi = async (req: LlmCompletionRequest, model: string): Promise<string> => {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.2
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
};

const callAnthropic = async (req: LlmCompletionRequest, model: string): Promise<string> => {
  const system = req.messages.find((m) => m.role === "system")?.content ?? "";
  const userMessages = req.messages.filter((m) => m.role !== "system");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.anthropicApiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.2,
      system,
      messages: userMessages.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }))
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Anthropic error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return json.content?.find((c) => c.type === "text")?.text?.trim() ?? "";
};

const callLocal = async (req: LlmCompletionRequest, model: string): Promise<string> => {
  const base = env.aiLocalBaseUrl.replace(/\/$/, "");
  const url = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: req.messages,
      max_tokens: req.maxTokens ?? 512,
      temperature: req.temperature ?? 0.2,
      stream: false
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Local LLM error ${res.status}: ${errText.slice(0, 200)}`);
  }
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return json.choices?.[0]?.message?.content?.trim() ?? "";
};

export const llmProvider = {
  resolveProvider,
  resolveModel,

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    const provider = resolveProvider();
    const model = resolveModel(provider);

    if (provider === "mock" || !env.aiEnabled) {
      return { text: "", provider: "mock", model };
    }

    try {
      let text = "";
      if (provider === "openai") {
        if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY not set");
        text = await callOpenAi(req, model);
      } else if (provider === "anthropic") {
        if (!env.anthropicApiKey) throw new Error("ANTHROPIC_API_KEY not set");
        text = await callAnthropic(req, model);
      } else if (provider === "local") {
        text = await callLocal(req, model);
      }
      return { text, provider, model };
    } catch (err) {
      logger.warn({ err, provider }, "LLM completion failed");
      throw err;
    }
  }
};
