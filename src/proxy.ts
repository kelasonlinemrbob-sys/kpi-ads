import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie presence check; the session itself is verified in server components/actions.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("kpi_session");
  const { pathname } = req.nextUrl;
  const publicForm = pathname.startsWith("/f/") || pathname === "/embed/order.js";
  // The application homepage and privacy policy must be readable without a session for OAuth review.
  if (!hasSession && !publicForm && !["/", "/robots.txt", "/sitemap.xml", "/login", "/forgot-password", "/reset-password", "/accept-invitation", "/privacy-policy"].includes(pathname)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const response = NextResponse.next();
  if (publicForm || ["/forgot-password", "/reset-password", "/accept-invitation"].includes(pathname)) {
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
