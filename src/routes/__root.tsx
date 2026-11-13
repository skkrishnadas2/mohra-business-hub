import { PwaLifecycle } from "@/components/PwaInstall";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { AppShell } from "../components/AppShell";
import { Toaster } from "../components/ui/sonner";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { disconnectCloud } from "@/lib/cloud-sync";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">পাতাটি পাওয়া যায়নি</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          এই ঠিকানায় কোনো পাতা নেই। হোমে ফিরে কাজটি বেছে নিন।
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            হোমে ফিরুন
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          পাতাটি খুলতে সমস্যা হয়েছে
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          আবার চেষ্টা করুন অথবা হোমে ফিরুন। সেভের নিশ্চিতকরণ না পেলে একই লেনদেন আবার না দিয়ে
          সংযোগের অবস্থা দেখুন।
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            আবার চেষ্টা করুন
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            হোমে ফিরুন
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    // Replace these placeholders with the app's name and description when first building the app.
    // Each content route, / included, must still set its own head(). Never add og:image or
    // twitter:image here: every page without its own would inherit the root's preview image.
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#123c32" },
      { name: "application-name", content: "MOHRA" },
      { name: "apple-mobile-web-app-title", content: "MOHRA" },
      { title: "MOHRA — IT Care & Telecom Center" },
      { name: "description", content: "Mohra IT Care & Telecom Center POS, recharge and MFS hub" },
      { property: "og:title", content: "MOHRA — IT Care & Telecom Center" },
      {
        property: "og:description",
        content: "Mohra IT Care & Telecom Center POS, recharge and MFS hub",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.ico?v=mohra-3", type: "image/x-icon" },
      { rel: "icon", href: "/favicon.png?v=mohra-3", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/store-mark.svg?v=mohra-3", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png?v=mohra-3", sizes: "180x180" },
      { rel: "manifest", href: "/manifest.webmanifest?v=mohra-3" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="bn">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      void router.invalidate();
      if (event === "SIGNED_OUT") disconnectCloud();
      else void queryClient.invalidateQueries();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <PwaLifecycle />
      <AppShell>
        <Outlet />
      </AppShell>
      <Toaster position="top-center" />
    </QueryClientProvider>
  );
}
