/** Presence is optional. Storage/privacy restrictions must never break the counter. */
let volatileId: string | undefined;
export function presenceIdentity() {
  volatileId ??= crypto.randomUUID();
  try {
    const key = "mohra-cloud-device-v1";
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    window.sessionStorage.setItem(key, volatileId);
  } catch {
    // Keep one stable identity for this tab when browser storage is unavailable.
  }
  return volatileId;
}
