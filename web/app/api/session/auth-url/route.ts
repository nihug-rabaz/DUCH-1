import { NextResponse } from "next/server";
import { buildAuthUrl, generateVerifier } from "@/lib/ms-oauth";

export async function POST(request: Request) {
  try {
    const data = await request.json().catch(() => ({}));
    const idNumber = String(data.id_number || data.idNumber || "").trim();
    if (!idNumber) {
      return NextResponse.json({ error: "id_number_required" }, { status: 400 });
    }
    const verifier = generateVerifier();
    const payload = buildAuthUrl(idNumber, verifier);
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = msg === "invalid_id_number" ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
