import { useState } from "react";
import { useStore, type State, actionError } from "@/lib/store";
import { toast } from "sonner";
import { Panel, act } from "./BusinessWorkspace";
import { BigButton, TextInput } from "./kit";
export function BackupRestore() {
  const s = useStore();
  const [data, setData] = useState<State | null>(null);
  const [confirmation, setConfirmation] = useState("");
  if (s.role !== "owner") return null;
  return (
    <Panel title="ব্যাকআপ পুনরুদ্ধার">
      <p className="text-sm text-muted-foreground">
        রিপোর্ট থেকে নেওয়া পূর্ণ JSON ব্যাকআপ বেছে নিন। শুধু নতুন খালি দোকানে পুনরুদ্ধার করা যাবে;
        চালু দোকানের ইতিহাস প্রতিস্থাপন হবে না।
      </p>
      <input
        aria-label="ব্যাকআপ JSON ফাইল"
        type="file"
        accept=".json,application/json"
        className="w-full text-sm"
        onChange={async (e) => {
          setData(null);
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
            setData(value.state);
          } catch (e) {
            toast.error(actionError(e));
          }
        }}
      />
      {data && (
        <>
          <p className="text-sm">দোকান: {data.shopName} · পুনরুদ্ধার নিশ্চিত করতে RESTORE লিখুন</p>
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
  );
}
