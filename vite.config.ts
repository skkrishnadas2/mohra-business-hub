// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// Never set ssr.external or resolve.external: the Worker has no runtime module resolution, so
// the build fails. Never add compression (compressPublicAssets, vite-plugin-compression):
// hosting already compresses at the edge.
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { NitroConfig } from "nitro/types";
import { loadEnv } from "vite";

// Keep server dependency helpers in the same bundle: split CommonJS chunks
// can initialize before their helper exports in the hosted Worker runtime.
// The cloudflare-module preset sets rollupConfig.output.inlineDynamicImports=false, which
// outranks the top-level flag when Nitro merges bundler options, so override it there too.
// Without this, rolldown splits node_modules into _libs/* chunks that import the CommonJS
// runtime helper from an _ssr chunk in a cycle: "__commonJSMin is not a function" at startup.
const nitroOptions: NitroConfig = {
  preset: "cloudflare-module",
  inlineDynamicImports: true,
  rollupConfig: { output: { inlineDynamicImports: true } },
};

export default defineConfig(({ mode }) => {
  // Existing unprefixed Cloud settings provide public-only build-time defaults.
  // External hosting can override the browser target through VITE_SUPABASE_*.
  const cloudEnv = loadEnv(mode, process.cwd(), "SUPABASE_");
  return {
  vite: {
    optimizeDeps: {
      // Reject requests from an obsolete optimizer generation instead of combining
      // its React hooks with the current renderer (two separate hook dispatchers).
      ignoreOutdatedRequests: false,
      include: ["zustand", "zustand/vanilla", "@radix-ui/react-slot", "@radix-ui/react-alert-dialog"],
    },
  },
  define: {
    "import.meta.env.VITE_LOVABLE_SUPABASE_URL": JSON.stringify(cloudEnv['SUPABASE_URL'] ?? ""),
    "import.meta.env.VITE_LOVABLE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(cloudEnv['SUPABASE_PUBLISHABLE_KEY'] ?? ""),
  },
  nitro: nitroOptions,
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  };
});
