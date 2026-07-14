import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { assetDir } from "@signalwork/engine";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ file: string }> }) {
  const { file } = await ctx.params;
  // path traversal guard: serve only bare filenames from the asset dir
  if (file !== basename(file) || !file.endsWith(".png")) {
    return NextResponse.json({ error: "bad filename" }, { status: 400 });
  }
  try {
    const buf = await readFile(resolve(assetDir(), file));
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
