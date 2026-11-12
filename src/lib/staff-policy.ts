import type { State } from "./store";
import { canInitializeStore, STORE_OWNER_ID } from "./single-shop-policy";
export function assertStaffRemoval(ownerId: string, targetId: string, state: State) {
  if (!canInitializeStore(ownerId)) throw new Error("টিম পরিচালনা শুধু মালিকের জন্য।");
  if (targetId === STORE_OWNER_ID) throw new Error("মালিকের প্রবেশাধিকার বন্ধ করা যাবে না।");
  if (state.operations?.shifts.some((s) => s.openedBy.userId === targetId && !s.closedAt))
    throw new Error("আগে এই কর্মীর চালু শিফট বন্ধ করুন।");
  if (
    state.operations?.requests.some(
      (r) => r.requestedBy.userId === targetId && r.status === "pending",
    )
  )
    throw new Error("আগে কর্মীর অপেক্ষমাণ অনুরোধ নিষ্পত্তি করুন।");
}
