import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/kit";
import { PartyWorkspace } from "@/components/BusinessWorkspace";
export const Route = createFileRoute("/khata")({
  head: () => ({ meta: [{ title: "পার্টি ও খাতা — মোহরা" }] }),
  component: () => (
    <Page title="পার্টি ও খাতা" sub="ধার, অগ্রিম, পাওনা ও দেনা — কেনাবেচা ছাড়াও আর্থিক লেনদেন">
      <PartyWorkspace />
    </Page>
  ),
});
