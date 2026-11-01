import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import {
  buildAiSystemPrompt,
  buildAiUserPrompt,
  callLlm,
  docToPlainText,
  type AiAction,
} from "@/lib/llm";
import {
  getDocument,
  getSpace,
  readStore,
  resolveLlmSettings,
} from "@/lib/store";

async function handlePOST(request: Request) {
  const body = await request.json();
  const action = body.action as AiAction;
  const prompt = String(body.prompt ?? "").trim();
  const spaceId = body.spaceId ? String(body.spaceId) : undefined;
  const documentId = body.documentId ? String(body.documentId) : undefined;
  const selection = body.selection ? String(body.selection) : undefined;

  if (!prompt) {
    return NextResponse.json({ error: "prompt requis" }, { status: 400 });
  }
  if (action !== "ask" && action !== "draft" && action !== "proofread") {
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  }

  const data = await readStore();
  const settings = resolveLlmSettings(data, spaceId);
  const space = spaceId ? await getSpace(spaceId) : undefined;
  const document = documentId ? await getDocument(documentId) : undefined;

  try {
    const text = await callLlm(
      settings,
      buildAiSystemPrompt(action),
      buildAiUserPrompt({
        action,
        prompt,
        selection,
        spaceName: space?.name,
        docTitle: document?.title,
        docText: document ? docToPlainText(document.content) : undefined,
      }),
    );
    return NextResponse.json({ text });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur LLM" },
      { status: 400 },
    );
  }
}

export const POST = secureRoute(handlePOST);
