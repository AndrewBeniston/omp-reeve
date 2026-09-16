/**
 * The applications one file can be opened in, kept for the next menu.
 *
 * A native menu is drawn one time, at the moment it pops, so it cannot gain
 * rows later. Asking again on every right click therefore repeats the same
 * wait. The answer is the same for minutes at a time, so a fulfilled listing
 * is retained per path and the next menu opens with it in hand.
 *
 * Two opens while one request is still in flight share that request, so a
 * second right click does not start a second probe of the machine.
 *
 * A listing that could not be read is not retained. The next menu asks again.
 */

import { fetchExternalEditors } from "./file-source-client";
import type { ExternalEditorListing } from "./external-editor-registry";

/** Long enough to serve a reading session, short enough to see a new install. */
export const EXTERNAL_EDITOR_RETENTION_MS = 5 * 60 * 1000;

interface RetainedListing {
  listing: ExternalEditorListing;
  atMs: number;
}

const retained = new Map<string, RetainedListing>();
const inFlight = new Map<string, Promise<ExternalEditorListing | null>>();

type ListingFetcher = (filePath: string) => Promise<ExternalEditorListing | null>;

/**
 * The listing for one file, from what is retained or from the server.
 *
 * The request runs to its end whether or not the caller still waits for it,
 * which is what makes the next menu fast after a slow one.
 */
export function requestExternalEditors(
  filePath: string,
  fetcher: ListingFetcher = fetchExternalEditors,
  nowMs: number = Date.now(),
): Promise<ExternalEditorListing | null> {
  const held = retained.get(filePath);
  if (held && nowMs - held.atMs < EXTERNAL_EDITOR_RETENTION_MS) return Promise.resolve(held.listing);
  const running = inFlight.get(filePath);
  if (running) return running;
  const request = fetcher(filePath).then((listing) => {
    if (listing) retained.set(filePath, { listing, atMs: nowMs });
    return listing;
  }).finally(() => { inFlight.delete(filePath); });
  inFlight.set(filePath, request);
  return request;
}

/** Forget every retained listing. The next menu asks the server again. */
export function forgetExternalEditorListings(): void {
  retained.clear();
  inFlight.clear();
}
