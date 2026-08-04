import { parseHistoryPurgeOnClose } from "./settings";
import { purgeAllTransient, purgeTransientHistory, clearHistory } from "./history";

let hourlyTimer: ReturnType<typeof setInterval> | null = null;

export function startHistoryPurgeScheduler(): void {
  void purgeTransientHistory();
  if (hourlyTimer) return;
  hourlyTimer = setInterval(() => {
    void purgeTransientHistory();
  }, 3600_000);
}

export function stopHistoryPurgeScheduler(): void {
  if (hourlyTimer) {
    clearInterval(hourlyTimer);
    hourlyTimer = null;
  }
}

export function purgeOnAppClose(): void {
  const mode = parseHistoryPurgeOnClose();
  if (mode === "non_vaulted") {
    clearHistory();
  } else if (mode === "transient") {
    purgeAllTransient();
  } else {
    purgeTransientHistory();
  }
}
