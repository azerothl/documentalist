import { secureRoute } from "@/lib/api";
import { NextResponse } from "next/server";
import { readStore, updateOrganization } from "@/lib/store";

async function handleGET() {
  const data = await readStore();
  return NextResponse.json({ organization: data.organization });
}

async function handlePATCH(request: Request) {
  const body = await request.json();
  const organization = await updateOrganization({
    name: body.name,
    llm: body.llm,
  });
  return NextResponse.json({ organization });
}

export const GET = secureRoute(handleGET);

export const PATCH = secureRoute(handlePATCH);
