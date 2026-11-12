import { create } from "zustand";
import { confirmCloudWrite, useCloud } from "./cloud-sync";
export const useSubmission = create<{ busy: boolean }>(() => ({ busy: false }));
/** Financial forms may show success only after the exact server receipt arrives. */
export async function confirmed<T>(fn: () => T): Promise<T> {
  if (useSubmission.getState().busy)
    throw new Error("আগের অনুরোধ সংরক্ষণ হচ্ছে। একটু অপেক্ষা করুন।");
  if (useCloud.getState().pending > 0)
    throw new Error("আগের অনুরোধ নিশ্চিত হওয়া বাকি। সংযোগ পাতায় অবস্থা দেখুন।");
  useSubmission.setState({ busy: true });
  try {
    const { result, confirmed: ok } = await confirmCloudWrite(fn);
    if (!ok)
      throw new Error(
        "সার্ভারের নিশ্চিতকরণ অপেক্ষমাণ। একই লেনদেন আবার দেবেন না; সংযোগ পাতায় অবস্থা দেখুন।",
      );
    if (result === false) throw new Error("পরিবর্তন গ্রহণ করা যায়নি");
    return result;
  } finally {
    useSubmission.setState({ busy: false });
  }
}
