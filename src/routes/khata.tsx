import { createFileRoute } from "@tanstack/react-router";
import { Page } from "@/components/kit";
import { PartyWorkspace } from "@/components/BusinessWorkspace";
export const Route = createFileRoute("/khata")({
  head: () => ({ meta: [{ title: "পার্টি ও খাতা — মোহরা" }] }),
  component: () => (
    <Page title="পার্টি ও খাতা" sub="একই পার্টির পাওনা, দেনা ও সমন্বয় এক জায়গায়">
      <PartyWorkspace />
    </Page>
  ),
});
