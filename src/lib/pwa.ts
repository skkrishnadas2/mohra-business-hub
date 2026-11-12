import { create } from "zustand";
export interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}
export const usePwa = create<{ prompt: InstallPrompt | null; installed: boolean; busy: boolean }>(
  () => ({ prompt: null, installed: false, busy: false }),
);
export function installPlatform(ua: string, touch = 0): "android" | "ios" | "other" {
  if (/iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return "ios";
  return /android/i.test(ua) ? "android" : "other";
}
export async function requestAppInstall(): Promise<"accepted" | "dismissed" | "guide"> {
  const { prompt, busy } = usePwa.getState();
  if (!prompt || busy) return "guide";
  usePwa.setState({ busy: true, prompt: null });
  try {
    await prompt.prompt();
    return (await prompt.userChoice).outcome;
  } finally {
    usePwa.setState({ busy: false });
  }
}
/** Only public icons/offline help are cached. Financial and authentication requests stay on the network. */
export function startPwa() {
  const capture = (e: Event) => {
    e.preventDefault();
    usePwa.setState({ prompt: e as InstallPrompt, installed: false });
  };
  const display = window.matchMedia("(display-mode: standalone)");
  const detect = () =>
    usePwa.setState({
      installed:
        display.matches || !!(navigator as Navigator & { standalone?: boolean }).standalone,
    });
  const installed = () => usePwa.setState({ installed: true, prompt: null });
  window.addEventListener("beforeinstallprompt", capture);
  window.addEventListener("appinstalled", installed);
  display.addEventListener?.("change", detect);
  detect();
  if ("serviceWorker" in navigator && window.isSecureContext)
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .catch(() => undefined);
  return () => {
    window.removeEventListener("beforeinstallprompt", capture);
    window.removeEventListener("appinstalled", installed);
    display.removeEventListener?.("change", detect);
  };
}
