import { createSign } from "crypto";

export const publisherConfig = Object.freeze({
  appId: 4906160,
  clientId: "Iv23liarlRaAAiP9dGBM",
  installationId: 160793888,
  repositoryId: 1356687632,
  repository: "montlake-pta/website",
  workflow: "pages.yml",
  ref: "main",
  secretName: "github-publish-bridge-private-key",
});

const apiRoot = "https://api.github.com";
const transientStatuses = new Set([429, 500, 502, 503, 504]);
const headers = Object.freeze({
  Accept: "application/vnd.github+json",
  "Content-Type": "application/json",
  "X-GitHub-Api-Version": "2026-03-10",
  "User-Agent": "Montlake-PTA-Publish-Bridge",
});

export function createPublisher({ getPrivateKey, fetchImpl, now = Date.now, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) }) {
  let cachedToken;
  let tokenRequest;

  async function request(url, options) {
    for (let attempt = 0; attempt < 3; attempt++) {
      let response;
      let timer;
      try {
        response = await Promise.race([
          fetchImpl(url, options),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 10000); }),
        ]);
      } catch {
        throw new Error("GitHub publish request could not be confirmed. No credentials or source content were logged.");
      } finally {
        clearTimeout(timer);
      }
      if (response.ok) return response;
      if (!transientStatuses.has(response.status) || attempt === 2) {
        throw new Error(`GitHub publish request failed (HTTP ${response.status}); check the publishing app installation and permissions.`);
      }
      const retryAfter = Number(response.headers?.get?.("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(8000, retryAfter * 1000) : 500 * (attempt + 1));
    }
    throw new Error("GitHub publishing retries exhausted.");
  }

  async function installationToken() {
    if (cachedToken && cachedToken.expiresAt > now() + 60000) return cachedToken.value;
    if (!tokenRequest) {
      tokenRequest = (async () => {
        let key;
        try { key = await getPrivateKey(publisherConfig.secretName); }
        catch { throw new Error("The GitHub publisher signing key is unavailable in Wix Secrets Manager."); }
        if (typeof key !== "string" || !key.includes("PRIVATE KEY")) {
          throw new Error("The GitHub publisher signing key has an invalid format.");
        }
        const seconds = Math.floor(now() / 1000);
        const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
        const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
          iat: seconds - 60, exp: seconds + 540, iss: publisherConfig.clientId,
        })}`;
        let signature;
        try { signature = createSign("RSA-SHA256").update(unsigned).sign(key, "base64url"); }
        catch { throw new Error("The GitHub publisher signing key could not sign a request."); }
        const response = await request(`${apiRoot}/app/installations/${publisherConfig.installationId}/access_tokens`, {
          method: "POST",
          headers: { ...headers, Authorization: `Bearer ${unsigned}.${signature}` },
          body: JSON.stringify({
            repository_ids: [publisherConfig.repositoryId],
            permissions: { actions: "write" },
          }),
        });
        let result;
        try { result = await response.json(); }
        catch { throw new Error("GitHub returned an invalid installation-token response."); }
        const repositories = result.repositories;
        const expiresAt = Date.parse(result.expires_at);
        if (typeof result.token !== "string" || !result.token || !Number.isFinite(expiresAt)
          || expiresAt <= now() + 60000 || result.permissions?.actions !== "write"
          || Object.keys(result.permissions || {}).some(key => !["actions", "metadata"].includes(key))
          || !Array.isArray(repositories) || repositories.length !== 1
          || repositories[0].id !== publisherConfig.repositoryId
          || repositories[0].full_name !== publisherConfig.repository) {
          throw new Error("GitHub returned an unexpected installation-token scope or expiry.");
        }
        cachedToken = { value: result.token, expiresAt };
        return result.token;
      })();
    }
    try { return await tokenRequest; }
    finally { tokenRequest = undefined; }
  }

  return async function publishWebsite() {
    const token = await installationToken();
    const response = await request(`${apiRoot}/repos/${publisherConfig.repository}/actions/workflows/${publisherConfig.workflow}/dispatches`, {
      method: "POST",
      headers: { ...headers, Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ref: publisherConfig.ref }),
    });
    if (response.status === 204) return { accepted: true };
    let result;
    try { result = await response.json(); }
    catch { throw new Error("GitHub accepted the dispatch but did not return a readable run receipt; inspect Actions before retrying."); }
    if (!Number.isSafeInteger(result.workflow_run_id)
      || result.html_url !== `https://github.com/${publisherConfig.repository}/actions/runs/${result.workflow_run_id}`) {
      throw new Error("GitHub accepted the dispatch but returned an unexpected run receipt; inspect Actions before retrying.");
    }
    return { accepted: true, runId: result.workflow_run_id, runUrl: result.html_url };
  };
}
