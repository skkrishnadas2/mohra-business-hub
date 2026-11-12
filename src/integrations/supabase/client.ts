// Environment-configurable client; keep preview auth storage intact.
import { captureRecovery, beginRecovery } from "@/lib/recovery";
import { createCloudFetch } from "@/lib/cloud-transport";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { brokeredPreviewStorage } from "./previewAuthStorage";

// Vite injects the existing Cloud defaults from environment variables at build time.
// Only public settings are exposed here; never expose the service-role key.
const SUPABASE_URL =
  import.meta.env["VITE_SUPABASE_URL"] || import.meta.env["VITE_LOVABLE_SUPABASE_URL"];
const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  import.meta.env["VITE_LOVABLE_SUPABASE_PUBLISHABLE_KEY"];

/** False when the build had no public Cloud settings; the shop then runs device-local only. */
export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

export const CLOUD_NOT_CONFIGURED_MESSAGE = "Cloud is not configured for this build";

// This module is imported by the root route, so it must never throw at import time:
// a missing setting would otherwise turn every page into a 500. Without settings we build
// an inert client whose requests fail immediately, and the app stays in local-only mode.
const NOT_CONFIGURED_URL = "https://cloud-not-configured.invalid";
const offlineFetch: typeof fetch = () => Promise.reject(new Error(CLOUD_NOT_CONFIGURED_MESSAGE));

if (!isCloudConfigured && typeof window !== "undefined") {
  console.warn(
    "[cloud] Supabase public environment settings are missing; running in local-only mode.",
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

captureRecovery();
export const supabase = isCloudConfigured
  ? createClient<Database>(SUPABASE_URL as string, SUPABASE_PUBLISHABLE_KEY as string, {
      global: {
        fetch: createCloudFetch(
          SUPABASE_URL as string,
          typeof window === "undefined" ? undefined : window.location.origin,
        ),
      },
      auth: {
        storage: brokeredPreviewStorage(),
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : createClient<Database>(NOT_CONFIGURED_URL, "not-configured", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: offlineFetch },
    });

if (isCloudConfigured && typeof window !== "undefined")
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") beginRecovery();
  });
