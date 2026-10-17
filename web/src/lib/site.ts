// Site-wide facts shown in the header, footer and legal pages.
export const SITE = {
  name: "Fuel by NorbApp",
  operator: "NorbApp",
  email: "norbert@norbapp.com",
  telegramUrl: "https://t.me/norbapp",
  homeUrl: "https://norbapp.com",
  // Set at build time on Render (RENDER_GIT_COMMIT / RENDER_GIT_BRANCH via next.config env).
  build: {
    branch: process.env.NEXT_PUBLIC_BUILD_BRANCH || "local",
    commit: (process.env.NEXT_PUBLIC_BUILD_COMMIT || "dev").slice(0, 7),
  },
};

/**
 * Google AdSense. Ads (and the ad section of the privacy notice) are switched
 * on only when NEXT_PUBLIC_ADSENSE_CLIENT (ca-pub-…) is set at build time.
 * Consent in the EEA/UK/CH is handled by Google's certified CMP
 * ("Privacy & messaging" in AdSense), which the AdSense script loads itself.
 */
export const ADS = {
  client: process.env.NEXT_PUBLIC_ADSENSE_CLIENT || "",
  slots: {
    top: process.env.NEXT_PUBLIC_ADSENSE_SLOT_TOP || "",
    bottom: process.env.NEXT_PUBLIC_ADSENSE_SLOT_BOTTOM || "",
  },
};
export const ADS_ENABLED = /^ca-pub-\d+$/.test(ADS.client);
