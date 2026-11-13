import { useRef, useState, type FormEvent } from "react";
import { ArrowDownLeft, ArrowUpRight, CheckCircle2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { actionError, useStore, type Account } from "@/lib/store";
import { useCloud } from "@/lib/cloud-sync";
import { confirmed, useSubmission } from "@/lib/confirmed-write";
import { taka } from "@/lib/rules";
import {
  B2B_TASKS,
  b2bOptions,
  b2bTaskKind,
  b2bMovement,
  b2bPreferenceKey,
  chooseB2BAccount,
  compatibleB2B,
  parseB2BMoney,
  readB2BPreferences,
  writeB2BPreferences,
  type B2BTask,
  type B2BPreferences,
} from "@/lib/b2b-workflow";
import { LegacySettlements } from "./BusinessWorkspace";
import { Money, TextInput } from "./kit";

export function B2BWorkspace({ context }: { context?: "mfs" | "recharge" }) {
  const shopId = useCloud((s) => s.shopId) ?? "device";
  const actorId = useStore((s) => s.actor?.userId ?? s.role ?? "signed-out");
  return (
    <B2BSession
      key={`${shopId}:${actorId}:${context ?? "all"}`}
      scope={b2bPreferenceKey(shopId, actorId)}
      {...(context ? { context } : {})}
    />
  );
}
function B2BSession({ scope, context }: { scope: string; context?: "mfs" | "recharge" }) {
  const s = useStore();
  const busy = useSubmission((x) => x.busy);
  const pending = useCloud((x) => x.pending);
  const [preferences, setPreferences] = useState(() => readB2BPreferences(scope));
  const allowedTasks = B2B_TASKS.filter(
    (t) => !context || (context === "recharge" ? t.id === "recharge_buy" : t.id !== "recharge_buy"),
  );
  const [task, setTask] = useState<B2BTask>(() =>
    allowedTasks.some((t) => t.id === preferences.task) ? preferences.task : allowedTasks[0]!.id,
  );
  const accounts = s.accounts.filter(
    (a) =>
      !a.inactive &&
      (s.role === "owner" || a.cashierAllowed !== false) &&
      (a.kind !== "bank" || s.can("viewBank")),
  );
  const initialOptions = b2bOptions(task, accounts);
  const [sourceId, setSource] = useState(() =>
    chooseB2BAccount(preferences.accounts[task]?.sourceId, initialOptions.sources, true),
  );
  const [targetId, setTarget] = useState(() =>
    chooseB2BAccount(
      preferences.accounts[task]?.targetId,
      b2bOptions(task, accounts, sourceId).targets,
      true,
    ),
  );
  const [amount, setAmount] = useState("");
  const [bonus, setBonus] = useState("");
  const [providerRef, setProviderRef] = useState("");
  const [lastReceipt, setLastReceipt] = useState("");
  const [method, setMethod] = useState<"cash" | "bank">(() => {
    const saved = task === "agent_return" ? targetId : sourceId;
    return saved && saved !== "cash" && s.accounts.find((a) => a.id === saved)?.kind !== "cash"
      ? "bank"
      : "cash";
  });
  const input = useRef<HTMLInputElement>(null);
  const memo = useRef("");
  const posting = useRef(false);
  const { sources, targets } = b2bOptions(task, accounts, sourceId);
  const source = sources.find((a) => a.id === sourceId);
  const target = targets.find((a) => a.id === targetId);
  const value = parseB2BMoney(amount);
  const extra = task === "recharge_buy" ? (bonus.trim() ? parseB2BMoney(bonus) : 0) : 0;
  const movement =
    source && target && value !== null && extra !== null
      ? b2bMovement(source, target, value, extra)
      : null;
  const hasFunds = !!source && value !== null && value <= source.balance;
  const ready = !!source && !!target && value !== null && value > 0 && extra !== null && hasFunds;
  const visibleAccountIds = new Set(accounts.map((account) => account.id));
  const history = s.txns
    .filter((t) => t.type.startsWith("b2b_") && (!context || t.type === `b2b_${context}`))
    // Cached rows can contain accounts no longer visible to this cashier. Hide the
    // complete row, including its title, amount and provider reference.
    .filter(
      (t) =>
        s.role === "owner" ||
        (t.moves.length > 0 && t.moves.every((move) => visibleAccountIds.has(move.accountId))),
    )
    .slice()
    .sort((a, b) => b.at - a.at)
    .slice(0, 8);
  const lock = busy || pending > 0;

  const remember = (nextTask: B2BTask, nextSource: string, nextTarget: string) => {
    const next: B2BPreferences = {
      ...preferences,
      task: nextTask,
      accounts: {
        ...preferences.accounts,
        [nextTask]: { sourceId: nextSource, targetId: nextTarget },
      },
    };
    setPreferences(next);
    writeB2BPreferences(scope, next);
  };
  const changeTask = (next: B2BTask) => {
    const options = b2bOptions(next, accounts);
    const nextSource = chooseB2BAccount(
      preferences.accounts[next]?.sourceId,
      options.sources,
      true,
    );
    const nextTarget = chooseB2BAccount(
      preferences.accounts[next]?.targetId,
      b2bOptions(next, accounts, nextSource).targets,
      true,
    );
    const financialId = next === "agent_return" ? nextTarget : nextSource;
    setMethod(
      financialId &&
        financialId !== "cash" &&
        s.accounts.find((a) => a.id === financialId)?.kind !== "cash"
        ? "bank"
        : "cash",
    );
    setTask(next);
    setSource(nextSource);
    setTarget(nextTarget);
    setAmount("");
    setBonus("");
    setProviderRef("");
    memo.current = "";
    remember(next, nextSource, nextTarget);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (
      !ready ||
      lock ||
      posting.current ||
      !source ||
      !target ||
      value === null ||
      extra === null ||
      !compatibleB2B(task, source, target)
    )
      return;
    posting.current = true;
    // This is an internal memo, never a fabricated bank/provider TrxID.
    memo.current ||= `SR-${crypto.randomUUID()}`;
    try {
      await confirmed(() =>
        s.b2b({
          kind: b2bTaskKind(task),
          workflow: "direct",
          sourceId: source.id,
          targetId: target.id,
          amount: value,
          commission: extra,
          ref: memo.current,
          ...(providerRef.trim() ? { providerRef: providerRef.trim() } : {}),
        }),
      );
      remember(task, source.id, target.id);
      setLastReceipt(`${source.name} −${taka(value)} → ${target.name} +${taka(value + extra)}`);
      setAmount("");
      setBonus("");
      setProviderRef("");
      memo.current = "";
      toast.success("দুই পাশের হিসাব সংরক্ষিত হয়েছে");
      requestAnimationFrame(() => input.current?.focus());
    } catch (error) {
      toast.error(actionError(error));
    } finally {
      posting.current = false;
    }
  };
  if (!s.can("b2b"))
    return (
      <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
        B2B লেনদেনের অনুমতি নেই। মালিকের সঙ্গে যোগাযোগ করুন।
      </div>
    );
  const visibleTasks = allowedTasks;
  const mfsTask = task === "agent_load" || task === "agent_return";
  const financialOptions = accounts.filter((a) => a.kind === method);
  const financialId = task === "agent_return" ? targetId : sourceId;
  const chooseFinancial = (id: string) => {
    if (task === "agent_return") {
      setTarget(id);
      remember(task, sourceId, id);
    } else {
      setSource(id);
      remember(task, id, targetId);
    }
  };
  const changeMethod = (next: "cash" | "bank") => {
    if (next === method) return;
    setMethod(next);
    const options = accounts.filter((a) => a.kind === next);
    chooseFinancial(chooseB2BAccount(undefined, options, true));
    setProviderRef("");
    memo.current = "";
  };
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">SR / DSO-এর সঙ্গে B2B</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              সম্পন্ন লেনদেন লিখুন · একবার সেভে দুই পাশের ব্যালেন্স
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-2">
          {visibleTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={lock}
              onClick={() => changeTask(t.id)}
              aria-pressed={task === t.id}
              className={`min-h-20 rounded-xl border p-3 text-left transition-colors ${task === t.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-secondary"}`}
            >
              <span
                className={`mb-1 block text-sm font-semibold ${task === t.id ? "text-primary" : ""}`}
              >
                {t.label}
              </span>
              <span className="text-xs text-muted-foreground">{t.hint}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <form
          onSubmit={submit}
          className="space-y-5 rounded-2xl border bg-card p-4 shadow-soft sm:p-5"
        >
          <fieldset disabled={lock} className="min-w-0 space-y-5 disabled:opacity-70">
            {mfsTask ? (
              <div className="space-y-4">
                <AccountChoice
                  label="কোন এজেন্ট অ্যাকাউন্ট"
                  value={task === "agent_load" ? targetId : sourceId}
                  options={accounts.filter((a) => a.kind === "mfs_agent")}
                  onChange={(id) => {
                    if (task === "agent_load") {
                      setTarget(id);
                      remember(task, sourceId, id);
                    } else {
                      setSource(id);
                      remember(task, id, targetId);
                    }
                  }}
                />
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {task === "agent_load" ? "টাকা কীভাবে দিলেন?" : "টাকা কোথায় পেলেন?"}
                  </p>
                  <div
                    className="grid grid-cols-2 gap-2"
                    role="group"
                    aria-label={
                      task === "agent_load" ? "টাকা দেওয়ার মাধ্যম" : "টাকা পাওয়ার মাধ্যম"
                    }
                  >
                    <button
                      type="button"
                      aria-pressed={method === "cash"}
                      onClick={() => changeMethod("cash")}
                      className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${method === "cash" ? "border-primary bg-primary/5 text-primary" : ""}`}
                    >
                      {task === "agent_load" ? "ক্যাশে দিলাম" : "ক্যাশ পেলাম"}
                    </button>
                    <button
                      type="button"
                      aria-pressed={method === "bank"}
                      onClick={() => changeMethod("bank")}
                      className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${method === "bank" ? "border-primary bg-primary/5 text-primary" : ""}`}
                    >
                      {task === "agent_load" ? "ব্যাংক থেকে দিলাম" : "ব্যাংকে পেলাম"}
                    </button>
                  </div>
                </div>
                <AccountChoice
                  label={
                    method === "bank"
                      ? task === "agent_load"
                        ? "কোন ব্যাংক থেকে দিলেন"
                        : "কোন ব্যাংকে পেলেন"
                      : "ক্যাশ অ্যাকাউন্ট"
                  }
                  value={financialId}
                  options={financialOptions}
                  onChange={chooseFinancial}
                />
                {method === "bank" && !financialOptions.length && (
                  <p className="text-sm text-muted-foreground">
                    ব্যবহারযোগ্য ব্যাংক অ্যাকাউন্ট নেই। আমার অ্যাকাউন্টসে ব্যাংক যোগ করুন বা মালিকের
                    কাছে অনুমতি নিন।
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {task === "agent_load"
                    ? "SR / DSO-কে টাকা দিয়ে এজেন্ট ব্যালেন্স পেয়েছেন।"
                    : method === "bank"
                      ? "এজেন্ট থেকে নিজের ব্যাংকে টাকা এসেছে; ক্যাশ বাক্স বদলাবে না।"
                      : "SR / DSO-কে এজেন্ট ব্যালেন্স দিয়ে হাতে ক্যাশ পেয়েছেন।"}
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                <AccountChoice
                  label="যে হিসাব থেকে কমবে"
                  value={sourceId}
                  options={sources}
                  onChange={(id) => {
                    const nextTarget = chooseB2BAccount(
                      targetId || undefined,
                      b2bOptions(task, accounts, id).targets,
                      true,
                    );
                    setSource(id);
                    setTarget(nextTarget);
                    remember(task, id, nextTarget);
                  }}
                />
                <AccountChoice
                  label="যে হিসাবে বাড়বে"
                  value={targetId}
                  options={targets}
                  onChange={(id) => {
                    setTarget(id);
                    remember(task, sourceId, id);
                  }}
                />
              </div>
            )}
            {(!source || !target) && (
              <p className="rounded-xl bg-secondary px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                একবার সঠিক হিসাব বেছে নিলে পরের এন্ট্রিতে মনে থাকবে। কোনো হিসাব বন্ধ হলে অন্যটিতে
                টাকা বসবে না।{" "}
                <a href="/accounts" className="font-medium text-primary underline">
                  হিসাব দেখুন
                </a>
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor={`amount-${context ?? "main"}`}
                  className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                  লেনদেনের পরিমাণ
                </label>
                <TextInput
                  ref={input}
                  id={`amount-${context ?? "main"}`}
                  aria-label="B2B পরিমাণ"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="৳ ০"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-14 text-xl font-semibold"
                  required
                />
              </div>
              {task === "recharge_buy" && (
                <div>
                  <label
                    htmlFor="sr-bonus"
                    className="mb-2 block text-xs font-medium text-muted-foreground"
                  >
                    SR-এর অতিরিক্ত ব্যালেন্স / বোনাস
                  </label>
                  <TextInput
                    id="sr-bonus"
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="না থাকলে ০"
                    value={bonus}
                    onChange={(e) => setBonus(e.target.value)}
                    className="h-14"
                  />
                </div>
              )}
            </div>
            {amount && (value === null || (task === "recharge_buy" && extra === null)) && (
              <p role="alert" className="text-sm text-destructive">
                সঠিক টাকার পরিমাণ লিখুন—সর্বোচ্চ দুই ঘর দশমিক।
              </p>
            )}
            {value !== null && value > 0 && source && !hasFunds && (
              <p role="alert" className="text-sm text-destructive">
                {source.name}-এ পর্যাপ্ত ব্যালেন্স নেই। অন্য হিসাব নিজে থেকে নির্বাচন করা হবে না।
              </p>
            )}
            {movement && source && target && value !== null && value > 0 && (
              <div
                aria-label="B2B হিসাবের পরিবর্তন"
                className="grid gap-3 rounded-xl border border-primary/15 bg-primary/5 p-4 sm:grid-cols-2"
              >
                <Movement account={source} after={movement.sourceAfter} incoming={false} />
                <Movement account={target} after={movement.targetAfter} incoming />
              </div>
            )}
            <details className="rounded-xl border px-3 py-2">
              <summary className="cursor-pointer py-1 text-xs text-muted-foreground">
                TrxID / ব্যাংক স্লিপ যোগ করুন (ঐচ্ছিক)
              </summary>
              <TextInput
                aria-label="প্রকৃত TrxID বা ব্যাংক স্লিপ"
                className="my-2"
                placeholder="আসল TrxID / স্লিপ নং"
                value={providerRef}
                onChange={(e) => setProviderRef(e.target.value)}
                maxLength={120}
              />
              <p className="pb-1 text-xs text-muted-foreground">
                সফটওয়্যারের মেমো নম্বর নিজে তৈরি হবে।
              </p>
            </details>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {task === "recharge_buy"
                ? "বোনাস যত ব্যালেন্স পেয়েছেন তত লিখুন; একবারই যোগ হবে।"
                : "SR-এর এই লেনদেনে কাস্টমার ক্যাশ-ইন / আউট কমিশন যোগ হবে না।"}
            </p>
            <button
              type="submit"
              disabled={!ready || lock}
              className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <CheckCircle2 size={18} />
              {busy
                ? "সংরক্ষণ হচ্ছে…"
                : pending
                  ? "আগের এন্ট্রির নিশ্চিতকরণ বাকি"
                  : "সম্পন্ন লেনদেন সেভ করুন"}
            </button>
          </fieldset>
          {lastReceipt && (
            <p
              role="status"
              className="rounded-xl bg-accent p-3 text-sm leading-relaxed text-accent-foreground"
            >
              সংরক্ষিত · {lastReceipt}
            </p>
          )}
        </form>
        <aside className="space-y-3 rounded-2xl border bg-card p-4 shadow-soft sm:p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <UsersRound size={17} />
            সাম্প্রতিক B2B
          </h3>
          {!history.length && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              সম্পন্ন SR লেনদেন এখানে আলাদা দেখা যাবে। পার্টির ধার–দেনায় যোগ হবে না।
            </p>
          )}
          {history.map((t) => (
            <div key={t.id} className="space-y-1 border-b py-3 last:border-0">
              <div className="flex justify-between gap-2 text-sm">
                <span>{t.type === "b2b_recharge" ? "রিচার্জ ব্যালেন্স ক্রয়" : "MFS B2B"}</span>
                <Money v={t.amount} className="font-semibold" />
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {new Date(t.at).toLocaleString("bn-BD")}
              </p>
              {t.providerRef && (
                <p className="break-all text-[11px] text-muted-foreground">
                  TrxID / স্লিপ: {t.providerRef}
                </p>
              )}
            </div>
          ))}
        </aside>
      </div>
      {s.role === "owner" && !!s.business?.settlements.length && (
        <details className="rounded-2xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-medium">
            পুরোনো অপেক্ষমাণ হিসাব যাচাই করুন
          </summary>
          <div className="mt-4">
            <LegacySettlements />
          </div>
        </details>
      )}
    </div>
  );
}
function AccountChoice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Account[];
  onChange: (id: string) => void;
}) {
  const selected = options.find((a) => a.id === value);
  return (
    <div className="min-w-0 rounded-xl border p-3">
      <p className="mb-2 text-xs text-muted-foreground">{label}</p>
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full min-w-0 rounded-lg border bg-card px-2 text-sm font-medium"
      >
        <option value="">হিসাব বেছে নিন</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      {selected && (
        <p className="mt-2 text-xs text-muted-foreground">
          এখন <Money v={selected.balance} className="font-medium text-foreground" />
        </p>
      )}
    </div>
  );
}
function Movement({
  account,
  after,
  incoming,
}: {
  account: Account;
  after: number;
  incoming: boolean;
}) {
  const Icon = incoming ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon size={14} />
        {incoming ? "বাড়বে" : "কমবে"}
      </p>
      <p className="mt-1 break-words text-sm font-medium">{account.name}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {taka(account.balance)} →{" "}
        <span
          className={after < 0 ? "font-semibold text-destructive" : "font-semibold text-foreground"}
        >
          {taka(after)}
        </span>
      </p>
    </div>
  );
}
