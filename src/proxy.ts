import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie presence check; the session itself is verified in server components/actions.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("kpi_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && !["/login", "/forgot-password", "/reset-password"].includes(pathname)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const response = NextResponse.next();
  if (["/forgot-password", "/reset-password"].includes(pathname)) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
