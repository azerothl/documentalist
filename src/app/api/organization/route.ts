import { NextResponse } from "next/server";
import { readStore, updateOrganization } from "@/lib/store";

export async function GET() {
  const data = await readStore();
  return NextResponse.json({ organization: data.organization });
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const organization = await updateOrganization({
    name: body.name,
    llm: body.llm,
  });
  return NextResponse.json({ organization });
}
