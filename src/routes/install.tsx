import { createFileRoute } from "@tanstack/react-router";
import { InstallPage } from "@/components/PwaInstall";
import { STORE_BRAND } from "@/lib/store-brand";
import { storePreviewMeta } from "@/lib/brand-preview";
export const Route = createFileRoute("/install")({
  head: () => ({
    meta: [
      { title: "MOHRA অ্যাপ ইনস্টল করুন" },
      {
        name: "description",
        content: "MOHRA IT CARE & TELECOM CENTER — ফোনের হোমস্ক্রিনে দোকানের অ্যাপ ইনস্টল করুন।",
      },
      { property: "og:title", content: "MOHRA — ফোনে অ্যাপ ইনস্টল করুন" },
      {
        property: "og:description",
        content: "Proprietor: Sankar Das · POS, telecom, MFS and Khata in one store workspace.",
      },
      { property: "og:url", content: STORE_BRAND.url + "/install" },
      ...storePreviewMeta,
    ],
    links: [{ rel: "canonical", href: STORE_BRAND.url + "/install" }],
  }),
  component: InstallPage,
});
