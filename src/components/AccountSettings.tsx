import { useState } from "react";
import { useStore } from "@/lib/store";
import { Panel, Field, act } from "./BusinessWorkspace";
import { BigButton, TextInput, NumInput } from "./kit";
export function AccountSettings() {
  const s = useStore();
  const [id, setId] = useState("");
  const a = s.accounts.find((a) => a.id === id);
  const [name, setName] = useState("");
  const [number, setNumber] = useState("");
  const [rateIn, setIn] = useState("");
  const [rateOut, setOut] = useState("");
  const [deferred, setDeferred] = useState(false);
  const [inactive, setInactive] = useState(false);
  const [cashierAllowed, setCashierAllowed] = useState(true);
  if (s.role !== "owner") return <p className="p-4 text-sm">শুধু মালিকের জন্য।</p>;
  return (
    <div className="max-w-xl">
      <Panel title="অ্যাকাউন্ট ও কমিশন সেটিং">
        <select
          className="h-12 w-full rounded-xl border bg-card px-3"
          aria-label="সেটিংয়ের অ্যাকাউন্ট"
          value={id}
          onChange={(e) => {
            const a = s.accounts.find((a) => a.id === e.target.value);
            setId(e.target.value);
            setName(a?.name ?? "");
            setNumber(a?.number ?? "");
            setIn(a?.commissionIn === undefined ? "" : String(a.commissionIn));
            setOut(a?.commissionOut === undefined ? "" : String(a.commissionOut));
            setDeferred(!!a?.commissionDeferred);
            setInactive(!!a?.inactive);
            setCashierAllowed(a?.cashierAllowed !== false);
          }}
        >
          <option value="">অ্যাকাউন্ট বেছে নিন</option>
          {s.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.inactive ? " (নিষ্ক্রিয়)" : ""}
            </option>
          ))}
        </select>
        {a && (
          <>
            <Field title="নাম">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field title="নম্বর (ঐচ্ছিক)">
              <TextInput value={number} onChange={(e) => setNumber(e.target.value)} />
            </Field>
            {a.kind === "mfs_agent" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Field title="Cash-in: প্রতি হাজারে কমিশন">
                    <NumInput value={rateIn} onChange={setIn} placeholder="ডিফল্ট" />
                  </Field>
                  <Field title="Cash-out: প্রতি হাজারে কমিশন">
                    <NumInput value={rateOut} onChange={setOut} placeholder="ডিফল্ট" />
                  </Field>
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={deferred}
                    onChange={(e) => setDeferred(e.target.checked)}
                  />
                  কমিশন পরে আসে — পাওনা হিসেবে রাখুন
                </label>
              </>
            )}
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={inactive}
                onChange={(e) => setInactive(e.target.checked)}
              />
              অ্যাকাউন্ট নিষ্ক্রিয়
            </label>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={cashierAllowed}
                onChange={(e) => setCashierAllowed(e.target.checked)}
              />
              ক্যাশিয়ার এই অ্যাকাউন্ট দেখতে ও ব্যবহার করতে পারবেন
            </label>
            <BigButton
              onClick={() =>
                act(() =>
                  s.configureAccount(id, {
                    name,
                    number,
                    inactive,
                    commissionIn: rateIn === "" ? undefined : Number(rateIn),
                    commissionOut: rateOut === "" ? undefined : Number(rateOut),
                    commissionDeferred: deferred,
                    cashierAllowed,
                  }),
                )
              }
            >
              সেটিং সংরক্ষণ
            </BigButton>
            <p className="text-xs text-muted-foreground">
              পুরোনো লেনদেন অপরিবর্তিত থাকবে। বন্ধ করার আগে ব্যালেন্স শূন্য ও SR settlement সম্পন্ন
              করুন।
            </p>
          </>
        )}
      </Panel>
    </div>
  );
}
