const CORRECTION_DURATION_MS = 350;
const ABANDON_EVENTS = ["wheel", "touchmove", "pointerdown", "keydown"] as const;

export function startExpansionScrollAnchor(
  row: HTMLElement,
  turnElement: HTMLElement,
): () => void {
  const recordedTop = row.getBoundingClientRect().top;
  const startedAt = performance.now();
  let frame = 0;
  let stopped = false;

  const correct = () => {
    if (stopped) return;
    const distance = row.getBoundingClientRect().top - recordedTop;
    if (distance !== 0) window.scrollBy(0, distance);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timeout);
    document.removeEventListener("wheel", abandon);
    document.removeEventListener("touchmove", abandon);
    document.removeEventListener("pointerdown", abandon);
    document.removeEventListener("keydown", abandon);
    resizeObserver.disconnect();
  };
  const abandon = () => stop();
  const resizeObserver = new ResizeObserver(correct);

  const timeout = window.setTimeout(stop, CORRECTION_DURATION_MS);
  for (const name of ABANDON_EVENTS) document.addEventListener(name, abandon, { passive: true });
  resizeObserver.observe(turnElement);
  frame = window.requestAnimationFrame(function correctOnFrame() {
    correct();
    if (!stopped) frame = window.requestAnimationFrame(correctOnFrame);
  });

  return stop;
}
