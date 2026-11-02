import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { canAccessSpace, currentUser } from "@/lib/auth";
import {
  buildAiContextBundle,
  formatAiContextForPrompt,
  type AiContextScope,
} from "@/lib/ai-context";
import {
  answerFromExcerpts,
  buildFocusedAskContext,
  looksHallucinated,
} from "@/lib/ai-excerpts";
import {
  analyzeTermCoverage,
  buildMissingTermsReply,
  sanitizeAiResponse,
} from "@/lib/ai-grounding";
import {
  buildAiSystemPrompt,
  buildAiUserPrompt,
  callLlm,
  type AiAction,
  type AiChatTurn,
} from "@/lib/llm";
import {
  getDocument,
  getSpace,
  listDocuments,
  readStore,
  resolveLlmSettings,
} from "@/lib/store";
import { extractText } from "@/lib/tiptap-text";

function parseScope(value: unknown): AiContextScope {
  if (value === "page" || value === "related" || value === "space") return value;
  return "related";
}

function parseHistory(value: unknown): AiChatTurn[] {
  if (!Array.isArray(value)) return [];
  const out: AiChatTurn[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = String((item as { content?: unknown }).content ?? "").trim();
    if ((role === "user" || role === "assistant") && content) {
      out.push({ role, content });
    }
  }
  return out;
}

async function handlePOST(request: Request) {
  const body = await request.json();
  const action = body.action as AiAction;
  const prompt = String(body.prompt ?? "").trim();
  const spaceId = body.spaceId ? String(body.spaceId) : undefined;
  const documentId = body.documentId ? String(body.documentId) : undefined;
  const selection = body.selection ? String(body.selection) : undefined;
  const scope = parseScope(body.scope);
  const history = parseHistory(body.history);

  if (!prompt) {
    return NextResponse.json({ error: "prompt requis" }, { status: 400 });
  }
  if (action !== "ask" && action !== "draft" && action !== "proofread") {
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  }
  if (!spaceId) {
    return NextResponse.json({ error: "spaceId requis" }, { status: 400 });
  }

  const data = await readStore();
  const account = (await currentUser())!;
  const settings = resolveLlmSettings(data, spaceId);
  const space = await getSpace(spaceId);
  const document = documentId ? await getDocument(documentId) : undefined;
  const spaceDocs = await listDocuments(spaceId);
  const spaceLabel = space?.name?.trim() || "ce Space";

  const effectiveScope: AiContextScope =
    action === "proofread"
      ? "page"
      : scope === "page" && !document
        ? "space"
        : scope;

  const priorUser = history
    .filter((t) => t.role === "user")
    .slice(-2)
    .map((t) => t.content)
    .join(" ");
  const query = `${priorUser} ${prompt}`;

  if (action === "ask") {
    const coverage = analyzeTermCoverage(prompt, spaceDocs);
    const missing = coverage.filter((c) => !c.present).map((c) => c.term);
    const present = coverage.filter((c) => c.present).map((c) => c.term);
    if (coverage.length > 0 && missing.length === coverage.length) {
      const otherSpaces: { name: string; terms: string[] }[] = [];
      for (const s of data.spaces) {
        if (
          s.id === spaceId ||
          !canAccessSpace(account, s.id)
        ) continue;
        const docs = data.documents.filter(
          (d) =>
            d.spaceId === s.id &&
            (d.kind === "page" || d.kind === "category"),
        );
        const hit = missing.filter((term) => {
          const blob = docs
            .map(
              (d) =>
                `${d.title} ${d.slug} ${d.sourcePath ?? ""} ${extractText(d.content)}`,
            )
            .join("\n")
            .toLowerCase();
          return blob.includes(term.toLowerCase());
        });
        if (hit.length) otherSpaces.push({ name: s.name, terms: hit });
      }

      return NextResponse.json({
        text: buildMissingTermsReply({
          spaceName: spaceLabel,
          missing,
          present,
          otherSpaces,
        }),
        sources: [],
        scope: effectiveScope,
        truncated: false,
      });
    }

    // Focused excerpts only — full Space dumps make small models invent.
    const focused = buildFocusedAskContext({
      spaceDocs,
      primary: document ?? null,
      query,
      locale: document?.locale,
    });

    const system = [
      buildAiSystemPrompt("ask"),
      `Space: « ${spaceLabel} ».`,
      "Tu paraphrases uniquement les extraits fournis dans le message utilisateur.",
      "Interdit: inventer éditeur (OpenAI, Anthropic, Meta…), confondre Ollama et Llama, inventer CNN/Transformer si ce n’est pas dans les extraits.",
      "Réponse courte (Markdown), cite 1–3 titres de pages. Pas de dump du contexte.",
    ].join("\n");

    const user = [
      focused.block,
      "",
      `Question: ${prompt}`,
      "",
      "Réponds maintenant — uniquement la réponse, rien d’autre.",
    ].join("\n");

    try {
      // Drop prior invented answers so they don't poison the next turn.
      const cleanHistory = history.filter(
        (t) => t.role === "user" || !looksHallucinated(t.content),
      );
      const raw = await callLlm(settings, system, user, cleanHistory);
      let text = sanitizeAiResponse(raw);
      if (!text || looksHallucinated(text)) {
        text = answerFromExcerpts(focused.excerpts, prompt);
      }
      return NextResponse.json({
        text,
        sources: focused.sources,
        scope: effectiveScope,
        truncated: focused.truncated,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur LLM" },
        { status: 400 },
      );
    }
  }

  // draft / proofread: broader context still OK
  const bundle = buildAiContextBundle({
    scope: effectiveScope,
    spaceDocs,
    primary: document ?? null,
    locale: document?.locale,
    query,
  });

  const system = [
    buildAiSystemPrompt(action),
    `Space: « ${spaceLabel} ».`,
    formatAiContextForPrompt(bundle),
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const raw = await callLlm(
      settings,
      system,
      buildAiUserPrompt({
        action,
        prompt,
        selection,
        spaceName: space?.name,
        docTitle: document?.title,
      }),
      history,
    );
    return NextResponse.json({
      text: sanitizeAiResponse(raw),
      sources: bundle.sources,
      scope: effectiveScope,
      truncated: bundle.truncated,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur LLM" },
      { status: 400 },
    );
  }
}

export const POST = secureRoute(handlePOST);
