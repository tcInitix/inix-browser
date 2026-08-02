import type { Session } from "electron";
import { getSetting } from "../storage/settings";

/** Privacy-focused request blocking — no telemetry, no third-party trackers. */

/**
 * Curated block list based on the most common tracker/ad networks appearing in
 * EasyList & EasyPrivacy. Intentionally kept in-source (~250 entries) so we
 * don't ship a native module or block-list fetcher on first launch.
 * Additional user entries are merged in from the `tracker_blocklist_custom`
 * setting (newline-separated hostnames).
 */
const TRACKER_DOMAINS = new Set<string>([
  // Analytics
  "google-analytics.com",
  "googletagmanager.com",
  "googletagservices.com",
  "google-analytics.l.google.com",
  "ssl.google-analytics.com",
  "stats.g.doubleclick.net",
  "analytics.google.com",
  "analytics.twitter.com",
  "scorecardresearch.com",
  "hotjar.com",
  "hotjar.io",
  "mixpanel.com",
  "segment.io",
  "segment.com",
  "amplitude.com",
  "fullstory.com",
  "clarity.ms",
  "newrelic.com",
  "nr-data.net",
  "js-agent.newrelic.com",
  "bam.nr-data.net",
  "optimizely.com",
  "quantserve.com",
  "quantcast.com",
  "chartbeat.com",
  "chartbeat.net",
  "parsely.com",
  "parse.ly",
  "heap.io",
  "heapanalytics.com",
  "kissmetrics.com",
  "logrocket.com",
  "logrocket.io",
  "sentry.io",
  "bugsnag.com",
  "raygun.io",
  "rollbar.com",
  "trackjs.com",
  "yandex.ru",
  "mc.yandex.ru",
  "metrika.yandex.ru",
  "matomo.cloud",
  "clicktale.net",
  "inspectlet.com",
  "mouseflow.com",
  "smartlook.com",
  "crazyegg.com",
  "vwo.com",
  "visualwebsiteoptimizer.com",
  "statcounter.com",
  "sitemeter.com",
  "histats.com",
  "clicky.com",
  "gosquared.com",
  "getclicky.com",
  "cxense.com",
  // Facebook / Meta
  "facebook.net",
  "connect.facebook.net",
  "an.facebook.com",
  "pixel.facebook.com",
  // Ad networks
  "doubleclick.net",
  "adservice.google.com",
  "googlesyndication.com",
  "googleadservices.com",
  "pagead2.googlesyndication.com",
  "adsystem.com",
  "amazon-adsystem.com",
  "adnxs.com",
  "adnxs-simple.com",
  "criteo.com",
  "criteo.net",
  "moatads.com",
  "outbrain.com",
  "taboola.com",
  "bluekai.com",
  "demdex.net",
  "everesttech.net",
  "exelator.com",
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
  "bat.bing.com",
  "bing.com/action",
  "clarity.microsoft.com",
  "adform.net",
  "smartadserver.com",
  "adroll.com",
  "adsrvr.org",
  "lijit.com",
  "contextweb.com",
  "yieldlab.net",
  "sharethrough.com",
  "sonobi.com",
  "indexww.com",
  "prebid.org",
  "gumgum.com",
  "spotxchange.com",
  "smartclip.net",
  "aidata.io",
  "adition.com",
  "adtechus.com",
  "adtech.de",
  "auditude.com",
  "brightroll.com",
  "eyeota.net",
  "innovid.com",
  "liveintent.com",
  "liveramp.com",
  "media6degrees.com",
  "openx.com",
  "revsci.net",
  "serving-sys.com",
  "smart-adserver.com",
  "spotscenered.info",
  "yieldmanager.com",
  "yldbt.com",
  "zedo.com",
  "zergnet.com",
  "23video.com",
  "adledge.com",
  "adperium.com",
  "adjuggler.com",
  "adjuggler.net",
  "adition.net",
  "adonly.com",
  "mgid.com",
  "revcontent.com",
  "media.net",
  // Malvertising / pop-under
  "adsterra.com",
  "propellerads.com",
  "propellerclick.com",
  "popads.net",
  "popcash.net",
  "exoclick.com",
  "hilltopads.net",
  "monetag.com",
  "onclickmax.com",
  "onclickalgo.com",
  "pushame.com",
  "pushmobilenews.com",
  "trafficjunky.com",
  "juicyads.com",
  "revenuehits.com",
  "clickbank.net",
  "clicksor.com",
  "clicksor.net",
  "trafficstars.com",
  "toroadvertising.com",
  "advertserve.com",
  "eroadvertising.com",
  "plugrush.com",
  "trafficfactory.biz",
  "trafficshop.com",
  "adthink-media.com",
  "adnium.com",
  // Session replay / heatmaps
  "sessioncam.com",
  "quantummetric.com",
  "decibelinsight.net",
  // Consent / GDPR tag managers (not always trackers, but scope creepy)
  "onetrust.com",
  "cookielaw.org",
  "consensu.org",
  "trustarc.com",
  // Common CDN-hosted trackers
  "cdn.mxpnl.com",
  "cdn.segment.com",
  "cdn.optimizely.com",
  "cdn.heapanalytics.com",
]);

const AD_PATH_PATTERNS = [
  /\/ads?[/-]/i,
  /\/adserver\//i,
  /\/adservice\//i,
  /\/advert(?:ising|isement)?\//i,
  /\/tracking[/.]/i,
  /\/tracker[/.]/i,
  /\/pixel[/.]/i,
  /\/beacon[/.]/i,
  /\/collect\?/i,
  /\/analytics[/.]/i,
  /\/telemetry\//i,
  /\/gtm\.js/i,
  /\/gtag\/js/i,
  /\/ga\.js/i,
  /\/analytics\.js/i,
  /\/fbevents\.js/i,
  /\/hotjar[-.]/i,
  /\/matomo\.js/i,
  /\/piwik\.(js|php)/i,
  /\/clarity\.js/i,
  /\/mixpanel[-.]/i,
  /\/amplitude[-.]/i,
  /\/segment[-.]/i,
  /\/fullstory[-.]/i,
  /\/logrocket[-.]/i,
  /\/sentry[-.]/i,
  /\?utm_/i,
  /[?&](fbclid|gclid|msclkid|dclid|yclid|_ga|mc_cid|mc_eid|vero_id|vero_conv)=/i,
];

// Runtime custom list from user setting `tracker_blocklist_custom` (newline-separated)
let customDomains = new Set<string>();
export function refreshCustomBlocklist() {
  const raw = getSetting("tracker_blocklist_custom") ?? "";
  customDomains = new Set(
    raw
      .split(/\r?\n/)
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s && !s.startsWith("#")),
  );
}
refreshCustomBlocklist();

// Track blocked-request counter for the status bar / debugging
let blockedCount = 0;
export function getBlockedCount(): number {
  return blockedCount;
}
export function resetBlockedCount(): void {
  blockedCount = 0;
}

function domainMatches(hostname: string, set: Set<string>): boolean {
  for (const domain of set) {
    if (hostname === domain || hostname.endsWith(`.${domain}`)) return true;
  }
  return false;
}

function isBlocked(url: string): boolean {
  try {
    const { hostname, pathname, search } = new URL(url);

    // Never block local/dev resources
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".localhost")
    ) {
      return false;
    }

    if (domainMatches(hostname, TRACKER_DOMAINS)) return true;
    if (customDomains.size && domainMatches(hostname, customDomains)) return true;

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
      blockedCount++;
      callback({ cancel: true });
    } else {
      callback({});
    }
  });
}
