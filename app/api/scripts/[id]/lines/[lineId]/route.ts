import { NextResponse } from "next/server";
import { updateScriptLine } from "@/app/actions";

/**
 * Line save over plain HTTP (#4110).
 *
 * Line fields normally persist on blur through a server action. Switching apps
 * straight from a focused textarea can freeze the tab before blur fires, so the
 * editor flushes still-unsaved fields here with `fetch(..., { keepalive: true })`
 * when the page is hidden — a request the browser must complete regardless.
 */

const FIELDS = new Set(["say", "on_screen", "rationale"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; lineId: string }> },
) {
  const { id, lineId } = await params;

  let body: { field?: unknown; value?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { field, value } = body;
  if (typeof field !== "string" || !FIELDS.has(field)) {
    return NextResponse.json({ error: "Field not editable" }, { status: 400 });
  }
  if (typeof value !== "string") {
    return NextResponse.json({ error: "value is required" }, { status: 400 });
  }

  try {
    const result = await updateScriptLine(lineId, id, field as "say" | "on_screen" | "rationale", value);
    if (result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
  } catch (error) {
    console.error(`[line route] save failed for ${lineId}`, error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
