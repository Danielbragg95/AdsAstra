import { NextResponse } from "next/server";
import { openDb, VoiceProfileSchema, BrandInputSchema } from "@signalwork/engine";

export const runtime = "nodejs";

export async function GET() {
  const db = openDb();
  try {
    return NextResponse.json({ brands: db.listBrands() });
  } finally {
    db.close();
  }
}

export async function POST(req: Request) {
  const db = openDb();
  try {
    const parsed = BrandInputSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid brand", issues: parsed.error.issues.slice(0, 3) },
        { status: 400 },
      );
    }
    const brand = db.createBrand(parsed.data);
    return NextResponse.json({ brand }, { status: 201 });
  } finally {
    db.close();
  }
}

export async function PATCH(req: Request) {
  const db = openDb();
  try {
    const body = await req.json();
    const { brandId } = body;
    const existing = brandId ? db.getBrand(brandId) : null;
    if (!existing) {
      return NextResponse.json({ error: "brand not found" }, { status: 404 });
    }

    if (body.action === "archive") {
      db.archiveBrand(brandId);
      return NextResponse.json({ ok: true });
    }

    if (body.brand) {
      const parsed = BrandInputSchema.safeParse(body.brand);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "invalid brand", issues: parsed.error.issues.slice(0, 3) },
          { status: 400 },
        );
      }
      db.updateBrand(brandId, parsed.data);
      return NextResponse.json({ ok: true });
    }

    if (body.voice_profile) {
      const parsed = VoiceProfileSchema.safeParse(body.voice_profile);
      if (!parsed.success) {
        return NextResponse.json(
          { error: "invalid voice profile", issues: parsed.error.issues.slice(0, 3) },
          { status: 400 },
        );
      }
      db.updateBrandVoice(brandId, parsed.data);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  } finally {
    db.close();
  }
}
