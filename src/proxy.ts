import { NextResponse, type NextRequest } from "next/server";

// Cheap cookie presence check; the session itself is verified in server components/actions.
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has("kpi_session");
  const { pathname } = req.nextUrl;
  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico)$).*)"],
};
