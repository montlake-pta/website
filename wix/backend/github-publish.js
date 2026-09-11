import { secrets } from "wix-secrets-backend.v2";
import { elevate } from "wix-auth";
import { fetch } from "wix-fetch";
import { createPublisher } from "./github-publish-core.js";

const publishWebsite = createPublisher({
  getPrivateKey: async name => (await elevate(secrets.getSecretValue)(name)).value,
  fetchImpl: fetch,
});

// Backend automation action only. Never expose this as an Anyone web method.
// The trigger payload is deliberately ignored: no CMS or customer data leaves Wix.
export const invoke = async () => {
  const receipt = await publishWebsite();
  console.info("GitHub website publish requested", receipt.runId || "accepted");
  return {};
};
