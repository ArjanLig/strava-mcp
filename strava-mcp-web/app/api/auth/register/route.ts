import { NextRequest, NextResponse } from "next/server";
import { randomUUID, randomBytes } from "crypto";
import { saveClient } from "@/lib/redis";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const clientId = randomUUID();
  const clientSecret = randomBytes(32).toString("hex");
  const redirectUris: string[] = body.redirect_uris ?? [];

  await saveClient(clientId, { clientSecret, redirectUris });

  return NextResponse.json(
    {
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
    },
    { status: 201 }
  );
}
