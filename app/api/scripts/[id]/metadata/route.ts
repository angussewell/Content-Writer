import { NextResponse } from "next/server";
import { updateScript } from "@/app/actions";

/**
 * Metadata save over plain HTTP (#4110).
 *
 * The editor's normal save goes through the `updateScript` server action. That
 * request is abandoned when mobile Safari freezes or evicts a backgrounded tab,
 * which is how title/hook/intro edits were disappearing with no error: nothing
 * had been sent yet, so nothing could fail loudly.
 *
 * A route handler can be called with `fetch(..., { keepalive: true })`, which
 * the browser is obliged to complete even as the page goes away. The editor
 * uses it to flush pending edits on visibilitychange/pagehide.
 */

type Body = {
  title?: unknown;
  intros?: unknown;
  contextItems?: unknown;
};

function asIntros(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { id, titleHook, verbalIntro } = item as Record<string, unknown>;
    if (typeof id !== "string") return [];
    return [{
      id,
      titleHook: typeof titleHook === "string" ? titleHook : "",
      verbalIntro: typeof verbalIntro === "string" ? verbalIntro : "",
    }];
  });
}

function asContextItems(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const { id, content } = item as Record<string, unknown>;
    if (typeof id !== "string") return [];
    return [{ id, content: typeof content === "string" ? content : "" }];
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.title !== "string") {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  try {
    await updateScript(id, {
      title: body.title,
      intros: asIntros(body.intros),
      contextItems: asContextItems(body.contextItems),
    });
  } catch (error) {
    console.error(`[metadata route] save failed for ${id}`, error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
