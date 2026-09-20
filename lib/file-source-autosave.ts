import { mergeFileSource } from "./file-source-merge";

/**
 * When an edited file is written back, and what happens when it moved first.
 *
 * The reference saves on a 3000 ms timer, cleared and re-armed by each further
 * edit, skipped while the document is read-only or while an unresolved
 * external change is being held, and coalesced through a single in-flight
 * promise so two saves never race. A save that lands while newer text exists
 * arms the timer again.
 *
 * This is that machine, with no editor and no React in it: it holds the text,
 * the modification time the text was read at, and the transport, so the
 * conflict path can be tested without a working tree or a browser.
 */

/** The reference's autosave delay, in milliseconds. */
export const FILE_SOURCE_AUTOSAVE_DELAY = 3000;

export type AutosaveWrite = (content: string, expectedMtimeMs: number) => Promise<AutosaveResult>;

export type AutosaveResult =
  | { outcome: "saved"; mtimeMs: number }
  | { outcome: "conflict"; content: string; mtimeMs: number }
  | { outcome: "failed"; message: string };

export type AutosaveStatus = "clean" | "dirty" | "saving" | "conflict" | "failed";

export interface AutosaveState {
  status: AutosaveStatus;
  /** The text last written, or last read, whichever is newer. */
  saved: string;
  /** The modification time that text carries on disk. */
  mtimeMs: number;
  message: string | null;
}

export interface FileSourceAutosaveOptions {
  content: string;
  mtimeMs: number;
  readOnly?: boolean;
  write: AutosaveWrite;
  onState: (state: AutosaveState) => void;
  /** Raised when disk and local text cannot be reconciled without a human. */
  onExternalConflict?: (disk: string) => void;
  delay?: number;
  schedule?: (run: () => void, delay: number) => unknown;
  cancel?: (timer: unknown) => void;
}

export class FileSourceAutosave {
  private current: string;
  private saved: string;
  /** The text the editor opened, which is what a merge is measured against. */
  private base: string;
  private mtimeMs: number;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;
  private held = false;
  private failure: string | null = null;
  private readonly delay: number;
  private readonly schedule: (run: () => void, delay: number) => unknown;
  private readonly cancel: (timer: unknown) => void;

  constructor(private readonly options: FileSourceAutosaveOptions) {
    this.current = options.content;
    this.saved = options.content;
    this.base = options.content;
    this.mtimeMs = options.mtimeMs;
    this.delay = options.delay ?? FILE_SOURCE_AUTOSAVE_DELAY;
    this.schedule = options.schedule ?? ((run, delay) => setTimeout(run, delay));
    this.cancel = options.cancel ?? ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  }

  private publish(status: AutosaveStatus): void {
    this.options.onState({ status, saved: this.saved, mtimeMs: this.mtimeMs, message: this.failure });
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      this.cancel(this.timer);
      this.timer = null;
    }
  }

  /** New text from the editor. Nothing is written until the timer expires. */
  edit(content: string): void {
    if (this.options.readOnly) return;
    this.current = content;
    this.failure = null;
    if (this.held) {
      // An unresolved external change is held: keep the edit, write nothing.
      this.publish("conflict");
      return;
    }
    this.clearTimer();
    if (content === this.saved) {
      this.publish(this.inFlight ? "saving" : "clean");
      return;
    }
    this.timer = this.schedule(() => { this.timer = null; void this.save(); }, this.delay);
    this.publish(this.inFlight ? "saving" : "dirty");
  }

  /**
   * Write now. Concurrent callers share one write; text typed during a write
   * re-arms the timer rather than starting a second one.
   */
  save(): Promise<void> {
    if (this.options.readOnly || this.held) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (this.current === this.saved) return Promise.resolve();
    this.clearTimer();
    const writing = this.current;
    this.publish("saving");
    const run = this.options.write(writing, this.mtimeMs)
      .then((result) => this.settle(writing, result))
      .catch((error) => this.settle(writing, { outcome: "failed", message: error instanceof Error ? error.message : "This file could not be saved." }))
      .finally(() => { this.inFlight = null; });
    this.inFlight = run;
    return run;
  }

  private settle(writing: string, result: AutosaveResult): void {
    if (result.outcome === "saved") {
      this.saved = writing;
      this.base = writing;
      this.mtimeMs = result.mtimeMs;
      // Text typed while that write was in the air is not lost: it is newer
      // than what landed, so the timer is armed again for it.
      if (this.current !== this.saved) {
        this.timer = this.schedule(() => { this.timer = null; void this.save(); }, this.delay);
        this.publish("dirty");
      } else {
        this.publish("clean");
      }
      return;
    }
    if (result.outcome === "failed") {
      this.failure = result.message;
      this.publish("failed");
      return;
    }
    this.adopt(result);
  }

  /**
   * Somebody else wrote the file. If the disk already holds what was being
   * written, this only adopts the new modification time. Otherwise the three
   * texts are merged, and a merge that cannot be made is held rather than
   * overwritten.
   */
  private adopt(result: { content: string; mtimeMs: number }): void {
    this.mtimeMs = result.mtimeMs;
    if (result.content === this.current) {
      this.saved = result.content;
      this.base = result.content;
      this.publish("clean");
      return;
    }
    const merged = mergeFileSource({ base: this.base, disk: result.content, local: this.current });
    if (merged.kind === "conflict") {
      this.held = true;
      this.clearTimer();
      this.saved = result.content;
      this.base = result.content;
      this.failure = "This file changed on disk while you were editing it.";
      this.publish("conflict");
      this.options.onExternalConflict?.(result.content);
      return;
    }
    const content = merged.kind === "clean" ? this.current : merged.content;
    this.current = content;
    this.saved = result.content;
    this.base = result.content;
    this.options.onState({ status: "dirty", saved: content, mtimeMs: this.mtimeMs, message: null });
    this.timer = this.schedule(() => { this.timer = null; void this.save(); }, this.delay);
  }

  /** The human decided: take this text, over whatever is on disk now. */
  resolve(content: string, mtimeMs: number): void {
    this.held = false;
    this.failure = null;
    this.base = content;
    this.saved = content;
    this.current = content;
    this.mtimeMs = mtimeMs;
    this.publish("clean");
  }

  /** The merged text, which after an adopted external change is not what was typed. */
  text(): string {
    return this.current;
  }

  dispose(): void {
    this.clearTimer();
  }
}
