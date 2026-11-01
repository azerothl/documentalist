import { safeFetch } from "./outbound";
import type { LlmSettings, TipTapDoc } from "./types";
import { extractText } from "./tiptap-text";

export type AiAction = "ask" | "draft" | "proofread";

export function buildAiSystemPrompt(action: AiAction): string {
  switch (action) {
    case "ask":
      return "Tu es un assistant documentation. Réponds en te basant uniquement sur le contexte fourni. Si l’info manque, dis-le clairement. Réponds en français sauf si la question est clairement en anglais.";
    case "draft":
      return "Tu es un rédacteur technique. Propose un texte clair, concis et structuré (Markdown léger). Réponds uniquement avec le texte proposé, sans préambule.";
    case "proofread":
      return "Tu es un correcteur. Améliore clarté, grammaire et style sans changer le sens. Réponds uniquement avec le texte corrigé.";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

export function buildAiUserPrompt(input: {
  action: AiAction;
  prompt: string;
  selection?: string;
  docTitle?: string;
  docText?: string;
  spaceName?: string;
}): string {
  const parts: string[] = [];
  if (input.spaceName) parts.push(`Space: ${input.spaceName}`);
  if (input.docTitle) parts.push(`Page: ${input.docTitle}`);
  if (input.docText) {
    const clipped = input.docText.slice(0, 12000);
    parts.push(`Contenu de la page:\n${clipped}`);
  }
  if (input.selection?.trim()) {
    parts.push(`Sélection:\n${input.selection.trim()}`);
  }
  parts.push(`Demande:\n${input.prompt.trim()}`);
  return parts.join("\n\n");
}

export async function callLlm(
  settings: LlmSettings,
  system: string,
  user: string,
): Promise<string> {
  if (!settings.enabled) {
    throw new Error("LLM désactivé. Activez-le dans Paramètres.");
  }
  if (!settings.apiKey.trim()) {
    throw new Error("Clé API manquante. Configurez-la dans Paramètres.");
  }
  if (!settings.model.trim()) {
    throw new Error("Modèle manquant.");
  }

  if (settings.provider === "anthropic") {
    return callAnthropic(settings, system, user);
  }
  return callOpenAiCompatible(settings, system, user);
}

async function callOpenAiCompatible(
  settings: LlmSettings,
  system: string,
  user: string,
): Promise<string> {
  const base = (settings.baseUrl || "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const res = await safeFetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      String(data.error?.message || data.message || `LLM HTTP ${res.status}`),
    );
  }
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Réponse LLM vide");
  return String(text).trim();
}

async function callAnthropic(
  settings: LlmSettings,
  system: string,
  user: string,
): Promise<string> {
  const base = (settings.baseUrl || "https://api.anthropic.com").replace(
    /\/$/,
    "",
  );
  const res = await safeFetch(`${base}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": settings.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: settings.model || "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      String(data.error?.message || data.message || `LLM HTTP ${res.status}`),
    );
  }
  const text = data.content?.find(
    (c: { type: string }) => c.type === "text",
  )?.text;
  if (!text) throw new Error("Réponse LLM vide");
  return String(text).trim();
}

export function docToPlainText(doc: TipTapDoc | null | undefined): string {
  return extractText(doc);
}
