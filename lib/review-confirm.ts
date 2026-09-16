/**
 * Whether reverting still asks first.
 *
 * The reference's revert dialog carries a "Don't ask again", and the answer
 * outlives the Tab it was given in, so it lives in local storage beside the
 * panel's other remembered choices rather than in the Tab's selection.
 */
const STORAGE_KEY = "omp-review-revert-confirmed";

export function shouldConfirmRevert(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "skip";
  } catch {
    // A browser with storage denied still asks, which is the safe answer.
    return true;
  }
}

export function stopConfirmingRevert(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, "skip");
  } catch {
    // Nothing to remember it with; the dialog simply asks again next time.
  }
}
