// ─────────────────────────────────────────────────────────────
// MIDDLEWARE — refresca la sesión en cada request y protege el
// dashboard: sin sesión, redirige a /login. Las rutas /api/* se
// protegen a sí mismas (cada una responde 401 JSON vía
// requireUser()) — no las redirigimos aquí porque un fetch()
// siguiendo un redirect a una página HTML rompería el cliente.
// ─────────────────────────────────────────────────────────────

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/callback"];

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  // IMPORTANTE: usar getUser() (valida el token contra Supabase), no
  // getSession() (solo lee la cookie) — así el middleware también
  // refresca el access token cuando ya expiró.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isApiPath = pathname.startsWith("/api/");

  if (!user && !isPublicPath && !isApiPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
