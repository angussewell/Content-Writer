import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Phones default to the Ideas board; the workspace stays reachable via the
// tab links, which always carry a ?tab= query.
const MOBILE_UA = /iPhone|iPod|Windows Phone|Android.+Mobile|Mobi/i;

export function middleware(request: NextRequest) {
    const authCookie = request.cookies.get("auth");
    const isAuthenticated = authCookie?.value === "true";

    if (!isAuthenticated && request.nextUrl.pathname !== "/login") {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (isAuthenticated && request.nextUrl.pathname === "/login") {
        return NextResponse.redirect(new URL("/", request.url));
    }

    if (
        isAuthenticated &&
        request.nextUrl.pathname === "/" &&
        request.nextUrl.search === "" &&
        MOBILE_UA.test(request.headers.get("user-agent") ?? "")
    ) {
        return NextResponse.redirect(new URL("/ideas", request.url));
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
