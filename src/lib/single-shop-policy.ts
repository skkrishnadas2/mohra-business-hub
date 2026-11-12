/** Verified existing proprietor profile; authorization never depends on editable metadata. */
export const STORE_OWNER_ID = "86dcab37-4e23-490e-9390-b0057f6e80ff";
export const canInitializeStore = (userId: string) => userId === STORE_OWNER_ID;
export const belongsToStore = (ownerId: string) => ownerId === STORE_OWNER_ID;
