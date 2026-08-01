import { getSetting } from "./settings";
import { purgeAllTransient, purgeTransientHistory } from "./history";

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
  if (getSetting("transient_purge_on_close") !== "false") {
    purgeAllTransient();
  } else {
    purgeTransientHistory();
  }
}
