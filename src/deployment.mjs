export const PREVIEW_SITE_URL = "https://montlake-pta.github.io/website/";
export const PUBLIC_SITE_URL = "https://www.montlakepta.org/";
export const CHECKOUT_ORIGIN = "https://checkout.montlakepta.org";

export const deploymentProfiles = Object.freeze({
  preview: Object.freeze({
    SITE_URL: PREVIEW_SITE_URL,
    WIX_HEADLESS_ENABLED: "false",
    WIX_HEADLESS_READ_ONLY: "true",
  }),
  launch: Object.freeze({
    SITE_URL: PUBLIC_SITE_URL,
    WIX_HEADLESS_ENABLED: "true",
    WIX_HEADLESS_READ_ONLY: "false",
  }),
});

export function deploymentEnvironment(env = process.env) {
  if (!env.DEPLOYMENT_PROFILE) return env;
  if (!Object.hasOwn(deploymentProfiles, env.DEPLOYMENT_PROFILE)) throw new Error("DEPLOYMENT_PROFILE must be preview or launch.");
  const profile = deploymentProfiles[env.DEPLOYMENT_PROFILE];
  for (const [key, value] of Object.entries(profile)) {
    if (env[key] && env[key] !== value) throw new Error(`${key} conflicts with DEPLOYMENT_PROFILE; clear the individual override or choose the matching profile.`);
  }
  return { ...env, ...profile };
}

export function deploymentBaseUrl(env = process.env) {
  const value = deploymentEnvironment(env).SITE_URL || PREVIEW_SITE_URL;
  let url;
  try { url = new URL(value); }
  catch { throw new Error("SITE_URL must be a valid public HTTPS directory URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || !url.pathname.endsWith("/")) {
    throw new Error("SITE_URL must be an HTTPS directory URL without credentials, query or fragment.");
  }
  return url.href;
}
