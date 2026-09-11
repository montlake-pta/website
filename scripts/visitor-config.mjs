import defaults from "../src/wix-client.config.json" with { type: "json" };
import wix from "../src/wix.config.json" with { type: "json" };
import { site } from "../src/site.mjs";

export function visitorConfiguration(env = process.env, settings = defaults) {
  const flag = env.WIX_HEADLESS_ENABLED || String(settings.enabled);
  if (!["true", "false"].includes(flag)) throw new Error("WIX_HEADLESS_ENABLED must be true or false.");
  const enabled = flag === "true";
  const clientId = env.WIX_HEADLESS_CLIENT_ID || settings.clientId;
  if ((enabled || clientId) && !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clientId || "")) {
    throw new Error("Configure a valid public Wix Headless client ID before enabling visitor transactions.");
  }
  return { enabled, clientId, siteId: env.WIX_SITE_ID || wix.siteId, baseUrl: site.previewUrl };
}
