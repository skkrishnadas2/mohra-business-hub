import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import {
  usePwa,
  startPwa,
  requestAppInstall,
  installPlatform,
  type InstallPrompt,
} from "@/lib/pwa";
import { InstallPage, InstallButton } from "@/components/PwaInstall";
let stop: (() => void) | undefined;
beforeEach(() => {
  usePwa.setState({ prompt: null, installed: false, busy: false });
});
afterEach(() => {
  stop?.();
  stop = undefined;
  cleanup();
  vi.restoreAllMocks();
});
const event = (outcome: "accepted" | "dismissed") =>
  Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome }),
  }) as unknown as InstallPrompt;
describe("phone installation", () => {
  it("detects Android, iPhone and iPad without assuming install API support", () => {
    expect(installPlatform("Android Chrome")).toBe("android");
    expect(installPlatform("iPhone Safari")).toBe("ios");
    expect(installPlatform("Macintosh", 5)).toBe("ios");
    expect(installPlatform("Desktop Chrome")).toBe("other");
  });
  it("captures a native browser prompt and waits for an actual installation event", async () => {
    stop = startPwa();
    const prompt = event("accepted");
    window.dispatchEvent(prompt);
    expect(prompt.defaultPrevented).toBe(true);
    await expect(requestAppInstall()).resolves.toBe("accepted");
    expect(prompt.prompt).toHaveBeenCalledOnce();
    expect(usePwa.getState().prompt).toBeNull();
    expect(usePwa.getState().installed).toBe(false);
    window.dispatchEvent(new Event("appinstalled"));
    expect(usePwa.getState().installed).toBe(true);
  });
  it("does not reuse a dismissed browser prompt", async () => {
    stop = startPwa();
    const prompt = event("dismissed");
    window.dispatchEvent(prompt);
    await expect(requestAppInstall()).resolves.toBe("dismissed");
    await expect(requestAppInstall()).resolves.toBe("guide");
    expect(prompt.prompt).toHaveBeenCalledOnce();
  });
  it("cleans up browser listeners after unmount", () => {
    stop = startPwa();
    stop();
    stop = undefined;
    window.dispatchEvent(event("accepted"));
    expect(usePwa.getState().prompt).toBeNull();
  });
  it("shows Android instructions and a valid Chrome intent from the fallback button", async () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android; wv Chrome");
    render(<InstallPage />);
    expect(screen.queryByText("ইনস্টলের সহজ নিয়ম")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "ইনস্টলের নিয়ম দেখুন" }));
    expect(screen.getByText("ইনস্টলের সহজ নিয়ম")).toBeDefined();
    expect(screen.getByRole("link", { name: "Chrome-এ খুলুন" }).getAttribute("href")).toMatch(
      /^intent:\/\/mohara-it-care\..*\/install#Intent/,
    );
  });
  it("shows the iPhone Share instructions without a fake install success", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("iPhone Safari");
    render(<InstallPage />);
    fireEvent.click(screen.getByRole("button", { name: "ইনস্টলের নিয়ম দেখুন" }));
    expect(screen.getByText("Share চাপুন → Add to Home Screen।")).toBeDefined();
    expect(screen.queryByText("MOHRA অ্যাপ ইনস্টল করা আছে")).toBeNull();
  });
  it("calls the browser prompt from the real install button", async () => {
    const prompt = event("accepted");
    usePwa.setState({ prompt });
    render(<InstallPage />);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "অ্যাপ ইনস্টল করুন" })),
    );
    expect(prompt.prompt).toHaveBeenCalledOnce();
    expect(screen.getByRole("status").textContent).toContain("অনুরোধ গ্রহণ");
    expect(usePwa.getState().installed).toBe(false);
  });
  it("does not offer another install while running as an installed app", () => {
    usePwa.setState({ installed: true });
    render(<InstallPage />);
    expect(screen.getByRole("status").textContent).toContain("ইনস্টল করা আছে");
    expect(screen.queryByRole("button", { name: "অ্যাপ ইনস্টল করুন" })).toBeNull();
  });
});

describe("in-place install popup", () => {
  it("opens only on a tap and dismisses without navigating or losing form data", () => {
    render(
      <>
        <input aria-label="চলমান কাজ" defaultValue="invoice draft" />
        <InstallButton />
      </>,
    );
    const trigger = screen.getByRole("button", { name: "অ্যাপ নিন" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(trigger.tagName).toBe("BUTTON");
    const previous = window.location.href;
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "ফোনেই থাকুক MOHRA" })).toBeDefined();
    expect(screen.getByText("ইনস্টলের সহজ নিয়ম")).toBeDefined();
    expect(screen.queryByRole("button", { name: "ইনস্টলের নিয়ম দেখুন" })).toBeNull();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.href).toBe(previous);
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("invoice draft");
  });
  it("uses the real install prompt from inside the popup", async () => {
    const prompt = event("accepted");
    usePwa.setState({ prompt });
    render(<InstallButton />);
    fireEvent.click(screen.getByRole("button", { name: "অ্যাপ নিন" }));
    expect(screen.queryByText("ইনস্টলের সহজ নিয়ম")).toBeNull();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "অ্যাপ ইনস্টল করুন" })),
    );
    expect(prompt.prompt).toHaveBeenCalledOnce();
    expect(usePwa.getState().installed).toBe(false);
  });
  it("opens Android Chrome on the main store URL without copying private query data", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android; wv Chrome");
    render(<InstallButton />);
    fireEvent.click(screen.getByRole("button", { name: "অ্যাপ নিন" }));
    expect(screen.getByRole("link", { name: "Chrome-এ খুলুন" }).getAttribute("href")).toMatch(
      /^intent:\/\/mohara-it-care\..*\/#Intent/,
    );
  });
  it("hides the trigger when already installed", () => {
    usePwa.setState({ installed: true });
    render(<InstallButton />);
    expect(screen.queryByRole("button", { name: "অ্যাপ নিন" })).toBeNull();
  });
});
