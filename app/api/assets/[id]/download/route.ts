import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { scriptImages } from "@/db/schema";
import { db } from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ASSET_HOSTS = new Set([
    "res.cloudinary.com",
    "eseodkdgtqzpypcsghsx.supabase.co",
    "files.catbox.moe",
]);
const IMAGE_EXTENSIONS = new Map([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
    ["image/avif", "avif"],
    ["image/heic", "heic"],
    ["image/heif", "heif"],
    ["image/tiff", "tiff"],
    ["image/bmp", "bmp"],
]);
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function failure(error: string, status: number) {
    return NextResponse.json({ error }, { status, headers: PRIVATE_HEADERS });
}

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    // The app's proxy excludes /api, so this route checks the session itself.
    if (request.cookies.get("auth")?.value !== "true") {
        return failure("Authentication required", 401);
    }

    const { id } = await params;
    if (!UUID.test(id)) return failure("Invalid asset ID", 400);

    let asset;
    try {
        [asset] = await db.select({ imageUrl: scriptImages.imageUrl })
            .from(scriptImages)
            .where(eq(scriptImages.id, id))
            .limit(1);
    } catch {
        return failure("Could not load asset", 500);
    }
    if (!asset) return failure("Asset not found", 404);

    try {
        // Only fetch the stored original. Never accept an arbitrary client URL,
        // and do not follow redirects that could escape the host allowlist.
        const url = new URL(asset.imageUrl);
        if (url.protocol !== "https:" || !ASSET_HOSTS.has(url.hostname) ||
            url.username || url.password || url.port) {
            return failure("Asset source is not supported", 502);
        }

        const upstream = await fetch(url, {
            cache: "no-store",
            redirect: "error",
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(30_000)]),
        });
        const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
        const extension = IMAGE_EXTENSIONS.get(contentType);
        if (!upstream.ok || !upstream.body || !extension) {
            await upstream.body?.cancel();
            return failure("Could not download the original image", 502);
        }

        return new Response(upstream.body, {
            headers: {
                ...PRIVATE_HEADERS,
                "Content-Type": contentType,
                "Content-Disposition": `attachment; filename="b-roll-${id}.${extension}"`,
                "X-Content-Type-Options": "nosniff",
            },
        });
    } catch {
        return failure("Could not download the original image", 502);
    }
}
