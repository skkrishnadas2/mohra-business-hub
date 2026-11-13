import { createFileRoute } from "@tanstack/react-router";
import { B2BWorkspace } from "@/components/B2BWorkspace";
import { Page } from "@/components/kit";
export const Route = createFileRoute("/b2b")({
  head: () => ({ meta: [{ title: "B2B ও SR — MOHRA" }] }),
  component: () => (
    <Page title="B2B ও SR" sub="SR-এর তাৎক্ষণিক লেনদেন · দুই পাশের ব্যালেন্স একসঙ্গে">
      <B2BWorkspace />
    </Page>
  ),
});
