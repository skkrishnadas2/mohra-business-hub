import { STORE_BRAND } from "./store-brand";
export const storePreviewMeta = [
  { property: "og:site_name", content: STORE_BRAND.fullName },
  { property: "og:locale", content: "bn_BD" },
  { property: "og:image", content: STORE_BRAND.url + "/mohra-share-v3.png" },
  { property: "og:image:type", content: "image/png" },
  { property: "og:image:width", content: "1200" },
  { property: "og:image:height", content: "630" },
  { property: "og:image:alt", content: STORE_BRAND.fullName + " — Proprietor Sankar Das" },
  { name: "twitter:card", content: "summary_large_image" },
  { name: "twitter:image", content: STORE_BRAND.url + "/mohra-share-v3.png" },
];
