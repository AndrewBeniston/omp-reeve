"use client";

import { useEffect, useRef, useState } from "react";
import type { ReviewFileFacts } from "@/lib/review-file-facts";
import { fetchReviewFileFacts, NO_REVIEW_FILE_FACTS } from "@/lib/review-preview-client";
import { reviewOwnerKey, type ReviewRequestContext } from "@/lib/review-owner";

/**
 * What Git says about the changed files beyond their patches.
 *
 * Read once per set of paths. The key is the paths themselves rather than the
 * array, because a panel rebuilds that array on every render and would
 * otherwise ask again each time.
 */
export function useReviewFileFacts(context: ReviewRequestContext, paths: string[]): ReviewFileFacts {
  const [facts, setFacts] = useState<ReviewFileFacts>(NO_REVIEW_FILE_FACTS);
  const key = paths.join("\n");
  const owner = `${context.tabId}\n${reviewOwnerKey(context.owner)}`;
  const latest = useRef(context);
  latest.current = context;
  useEffect(() => {
    if (!key) {
      setFacts(NO_REVIEW_FILE_FACTS);
      return;
    }
    const controller = new AbortController();
    fetchReviewFileFacts(latest.current, key.split("\n"), controller.signal)
      .then((next) => { if (!controller.signal.aborted) setFacts(next); })
      .catch(() => {});
    return () => controller.abort();
  }, [key, owner]);
  return facts;
}
