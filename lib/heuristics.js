const HIGH_CONFIDENCE_PATTERNS = [
  // CDN / static asset hosts
  { pat: /^cdn[.\-]/i, label: "CDN-style hostname" },
  { pat: /^static[.\-]/i, label: "Static asset host" },
  { pat: /^assets?[.\-]/i, label: "Asset host" },
  { pat: /^media[.\-]/i, label: "Media host" },
  { pat: /^img[.\-]/i, label: "Image host" },
  { pat: /^images?[.\-]/i, label: "Image host" },
  { pat: /^js[.\-]/i, label: "Script host" },
  { pat: /^css[.\-]/i, label: "Stylesheet host" },
  { pat: /^fonts?[.\-]/i, label: "Font host" },
  { pat: /\.cloudfront\.net$/i, label: "AWS CloudFront CDN" },
  { pat: /\.akamai(hd|edge|technologies)?\.net$/i, label: "Akamai CDN" },
  { pat: /\.fastly(\.net|lb\.net)$/i, label: "Fastly CDN" },
  { pat: /\.cloudflare\.com$/i, label: "Cloudflare" },
  { pat: /\.jsdelivr\.net$/i, label: "jsDelivr CDN" },
  { pat: /\.unpkg\.com$/i, label: "unpkg CDN" },
  { pat: /\.gstatic\.com$/i, label: "Google static assets" },
  { pat: /\.googleapis\.com$/i, label: "Google APIs" },
  { pat: /\.bunnycdn\.com$/i, label: "BunnyCDN" },
  { pat: /\.b-cdn\.net$/i, label: "BunnyCDN" },
  { pat: /\.azureedge\.net$/i, label: "Azure CDN" },
  { pat: /\.kxcdn\.com$/i, label: "KeyCDN" },
  { pat: /\.cdninstagram\.com$/i, label: "Instagram CDN" },
  { pat: /\.twimg\.com$/i, label: "Twitter media CDN" },

  // Payments
  { pat: /(^|\.)stripe\.com$/i, label: "Stripe payments" },
  { pat: /(^|\.)paypal\.com$/i, label: "PayPal" },
  { pat: /\.paypalobjects\.com$/i, label: "PayPal assets" },
  { pat: /\.braintreegateway\.com$/i, label: "Braintree payments" },
  { pat: /(^|\.)adyen\.com$/i, label: "Adyen payments" },
  { pat: /(^|\.)klarna\.com$/i, label: "Klarna" },
  { pat: /(^|\.)checkout\.com$/i, label: "Checkout.com" },
  { pat: /(^|\.)sofort\.com$/i, label: "Sofort payments" },

  // Captcha / security
  { pat: /(^|\.)recaptcha\.net$/i, label: "Google reCAPTCHA" },
  { pat: /(^|\.)hcaptcha\.com$/i, label: "hCaptcha" },
  { pat: /(^|\.)turnstile\.com$/i, label: "Cloudflare Turnstile" },

  // Auth / SSO
  { pat: /^accounts\./i, label: "Account/login host" },
  { pat: /^login\./i, label: "Login host" },
  { pat: /^auth\./i, label: "Auth host" },
  { pat: /^sso\./i, label: "SSO host" },
  { pat: /^oauth\./i, label: "OAuth host" },
  { pat: /(^|\.)okta\.com$/i, label: "Okta SSO" },
  { pat: /(^|\.)auth0\.com$/i, label: "Auth0" },
  { pat: /(^|\.)microsoftonline\.com$/i, label: "Microsoft login" },
  { pat: /(^|\.)login\.microsoft\.com$/i, label: "Microsoft login" },

  // Maps
  { pat: /(^|\.)mapbox\.com$/i, label: "Mapbox" },
  { pat: /(^|\.)openstreetmap\.org$/i, label: "OpenStreetMap" },
];

const LOW_CONFIDENCE_PATTERNS = [
  // Analytics
  { pat: /google-analytics\.com$/i, label: "Google Analytics" },
  { pat: /googletagmanager\.com$/i, label: "Google Tag Manager" },
  { pat: /\.segment\.(io|com)$/i, label: "Segment analytics" },
  { pat: /\.mixpanel\.com$/i, label: "Mixpanel" },
  { pat: /\.amplitude\.com$/i, label: "Amplitude" },
  { pat: /\.heap(analytics)?\.com$/i, label: "Heap" },
  { pat: /\.hotjar\.com$/i, label: "Hotjar" },
  { pat: /\.fullstory\.com$/i, label: "FullStory" },
  { pat: /\.statcounter\.com$/i, label: "StatCounter" },
  { pat: /\.quantserve\.com$/i, label: "Quantcast" },
  { pat: /\.chartbeat\.(com|net)$/i, label: "Chartbeat" },
  { pat: /\.scorecardresearch\.com$/i, label: "Comscore" },

  // Tracking
  { pat: /\.facebook\.net$/i, label: "Facebook pixel" },
  { pat: /connect\.facebook\.net$/i, label: "Facebook pixel" },
  { pat: /^pixel\./i, label: "Tracking pixel host" },
  { pat: /^track\./i, label: "Tracking host" },
  { pat: /^analytics\./i, label: "Analytics host" },
  { pat: /^stats?\./i, label: "Stats host" },
  { pat: /^metrics\./i, label: "Metrics host" },
  { pat: /^telemetry\./i, label: "Telemetry host" },
  { pat: /^events?\./i, label: "Event collection host" },
  { pat: /^beacon\./i, label: "Beacon host" },

  // Ad networks
  { pat: /doubleclick\.net$/i, label: "DoubleClick ads" },
  { pat: /googlesyndication\.com$/i, label: "Google ads" },
  { pat: /googleadservices\.com$/i, label: "Google ad services" },
  { pat: /\.taboola\.com$/i, label: "Taboola ads" },
  { pat: /\.outbrain\.com$/i, label: "Outbrain ads" },
  { pat: /\.criteo\.(com|net)$/i, label: "Criteo ads" },
  { pat: /\.pubmatic\.com$/i, label: "PubMatic ads" },
  { pat: /\.adnxs\.com$/i, label: "AppNexus ads" },
  { pat: /\.openx\.net$/i, label: "OpenX ads" },
  { pat: /\.adsrvr\.org$/i, label: "Trade Desk ads" },
  { pat: /\.bidswitch\.net$/i, label: "BidSwitch ads" },
  { pat: /\.rubiconproject\.com$/i, label: "Rubicon ads" },
  { pat: /\.moatads\.com$/i, label: "Moat ads" },
  { pat: /\.adsafeprotected\.com$/i, label: "IAS ads" },
  { pat: /\.adsystem\./i, label: "Ad system host" },
];

const BASE_SCORE = 0.4;

export function scoreDomain(domain, options = {}) {
  const {
    directMatch = false,
    sameSiteAsPage = false,
    reasonsI18n = {},
  } = options;
  const sameSiteText = reasonsI18n.sameSite || "Same registrable domain as the page";
  const directText = reasonsI18n.direct || "Browser confirmed this request failed";

  let score = BASE_SCORE;
  let category = "unknown";
  const reasons = [];

  for (const { pat, label } of HIGH_CONFIDENCE_PATTERNS) {
    if (pat.test(domain)) {
      score = Math.max(score, 0.78);
      category = "essential";
      reasons.push(label);
      break;
    }
  }

  for (const { pat, label } of LOW_CONFIDENCE_PATTERNS) {
    if (pat.test(domain)) {
      score = Math.min(score, 0.12);
      category = "tracker/ad";
      reasons.length = 0;
      reasons.push(label);
      break;
    }
  }

  if (sameSiteAsPage) {
    score = Math.min(1, score + 0.15);
    reasons.push(sameSiteText);
  }

  if (directMatch) {
    score = Math.min(1, score + 0.25);
    reasons.unshift(directText);
    if (category === "unknown") category = "likely essential";
  }

  return { score: Math.round(score * 100) / 100, category, reasons };
}

const TWO_PART_TLDS = new Set([
  "co.uk", "org.uk", "ac.uk", "gov.uk", "me.uk",
  "com.au", "org.au", "net.au", "edu.au",
  "co.jp", "or.jp", "ne.jp", "ac.jp",
  "co.nz", "org.nz", "net.nz",
  "co.za", "org.za",
  "com.br", "com.mx", "com.ar", "com.tr", "com.sg", "com.hk",
  "co.in", "co.kr", "co.il",
]);

export function registrableDomain(hostname) {
  if (!hostname) return hostname;
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_PART_TLDS.has(lastTwo) && parts.length >= 3) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
}
