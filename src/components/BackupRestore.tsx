import { backupStateSchema } from "@/lib/backup-schema";
import { useSubmission } from "@/lib/confirmed-write";
import { useRef, useState } from "react";
import { useStore, type State, actionError } from "@/lib/store";
import { toast } from "sonner";
import { Panel, act } from "./BusinessWorkspace";
import { BigButton, TextInput } from "./kit";
export function BackupRestore() {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const fileRead = useRef(0);
  const [data, setData] = useState<State | null>(null);
  const [confirmation, setConfirmation] = useState("");
  if (s.role !== "owner") return null;
  return (
    <fieldset disabled={busy} className="min-w-0">
      <Panel title="ব্যাকআপ পুনরুদ্ধার">
        <p className="text-sm text-muted-foreground">
          রিপোর্ট থেকে নেওয়া পূর্ণ JSON ব্যাকআপ বেছে নিন। শুধু নতুন খালি দোকানে পুনরুদ্ধার করা
          যাবে; চালু দোকানের ইতিহাস প্রতিস্থাপন হবে না।
        </p>
        <input
          aria-label="ব্যাকআপ JSON ফাইল"
          type="file"
          accept=".json,application/json"
          className="w-full text-sm"
          onChange={async (e) => {
            const request = ++fileRead.current;
            setData(null);
            setConfirmation("");
            const file = e.target.files?.[0];
            if (!file) return;
            if (file.size > 3000000) {
              toast.error("ব্যাকআপ সর্বোচ্চ ৩ MB");
              return;
            }
            try {
              const value = JSON.parse(await file.text());
              if (value.format !== "mohra-business-backup" || value.version !== 2 || !value.state)
                throw new Error("সঠিক MOHRA ব্যাকআপ দিন");
              if (request !== fileRead.current) return;
              const parsed = backupStateSchema.safeParse(value.state);
              if (!parsed.success)
                throw new Error(
                  "ব্যাকআপের তথ্য অসম্পূর্ণ বা সঠিক নয়। রিপোর্ট থেকে পূর্ণ JSON ব্যাকআপ নিন।",
                );
              setData(parsed.data as State);
            } catch (e) {
              if (request === fileRead.current) toast.error(actionError(e));
            }
          }}
        />
        {data && (
          <>
            <p className="text-sm">
              দোকান: {data.shopName} · পুনরুদ্ধার নিশ্চিত করতে RESTORE লিখুন
            </p>
            <TextInput
              aria-label="পুনরুদ্ধার নিশ্চিতকরণ"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            <BigButton
              disabled={confirmation !== "RESTORE"}
              onClick={async () => {
                if (await act(() => s.restoreBackup(data), "ব্যাকআপ পুনরুদ্ধারের রেকর্ড হয়েছে")) {
                  setData(null);
                  setConfirmation("");
                }
              }}
            >
              ব্যাকআপ পুনরুদ্ধার
            </BigButton>
          </>
        )}
      </Panel>
    </fieldset>
  );
}
