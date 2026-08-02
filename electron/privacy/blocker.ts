import type { Session } from "electron";
import { getSetting } from "../storage/settings";

/** Privacy-focused request blocking — no telemetry, no third-party trackers. */

const TRACKER_DOMAINS = new Set([
  "google-analytics.com",
  "googletagmanager.com",
  "doubleclick.net",
  "facebook.net",
  "connect.facebook.net",
  "analytics.twitter.com",
  "scorecardresearch.com",
  "hotjar.com",
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "amplitude.com",
  "fullstory.com",
  "clarity.ms",
  "newrelic.com",
  "optimizely.com",
  "quantserve.com",
  "outbrain.com",
  "taboola.com",
  "adservice.google.com",
  "googlesyndication.com",
  "adsystem.com",
  "adnxs.com",
  "criteo.com",
  "moatads.com",
  "chartbeat.com",
  "parsely.com",
  "bluekai.com",
  "exelator.com",
  "demdex.net",
  "everesttech.net",
  "rlcdn.com",
  "tapad.com",
  "krxd.net",
  "mathtag.com",
  "turn.com",
  "yieldmo.com",
  "pubmatic.com",
  "rubiconproject.com",
  "openx.net",
  "casalemedia.com",
  "advertising.com",
  "amazon-adsystem.com",
  "bat.bing.com",
]);

const AD_PATH_PATTERNS = [
  /\/ads?\//i,
  /\/adserver\//i,
  /\/advert(?:ising)?\//i,
  /\/tracking\//i,
  /\/tracker\//i,
  /\/pixel\//i,
  /\/beacon\//i,
  /\/collect\?/i,
  /\/analytics\//i,
  /\/gtm\.js/i,
  /\/ga\.js/i,
  /\/fbevents\.js/i,
];

function isBlocked(url: string): boolean {
  try {
    const { hostname, pathname, search } = new URL(url);

    // Never block local/dev resources
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname.endsWith(".local")) {
      return false;
    }

    for (const domain of TRACKER_DOMAINS) {
      if (hostname === domain || hostname.endsWith(`.${domain}`)) {
        return true;
      }
    }

    const fullPath = pathname + search;
    return AD_PATH_PATTERNS.some((pattern) => pattern.test(fullPath));
  } catch {
    return false;
  }
}

export function setupPrivacyBlocking(sess: Session) {
  sess.webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    if (getSetting("tracker_blocking_enabled") === "false") {
      callback({});
      return;
    }
    if (isBlocked(details.url)) {
      callback({ cancel: true });
    } else {
      callback({});
    }
  });
}
