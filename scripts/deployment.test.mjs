import assert from "node:assert/strict";
import test from "node:test";
import { CHECKOUT_ORIGIN, deploymentEnvironment, deploymentProfiles, PREVIEW_SITE_URL, PUBLIC_SITE_URL } from "../src/deployment.mjs";
import { validateRedirect, callbackUrls } from "../src/wix-visitor-api.mjs";
import { visitorConfiguration } from "./visitor-config.mjs";

const publicConfig = { clientId: "b0a3701c-099d-4f99-8057-e3a0d1fb2d71",
  siteId: "f17e8f26-4d30-4997-bca1-82f1599221bb", baseUrl: PUBLIC_SITE_URL };

test("launch and preview presets select a complete consistent set without mutating the environment", () => {
  const env = { DEPLOYMENT_PROFILE: "launch", UNRELATED: "keep" };
  const resolved = deploymentEnvironment(env);
  assert.deepEqual(resolved, { ...env, ...deploymentProfiles.launch });
  assert.equal(env.SITE_URL, undefined);
  assert.equal(deploymentEnvironment({ DEPLOYMENT_PROFILE: "preview" }).SITE_URL, PREVIEW_SITE_URL);
  const untouched = { SITE_URL: "https://example.org/", WIX_HEADLESS_ENABLED: "false" };
  assert.equal(deploymentEnvironment(untouched), untouched);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "launch" }).enabled, true);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "launch" }).baseUrl, PUBLIC_SITE_URL);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "launch" }).readOnly, false);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "preview" }).enabled, false);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "preview" }).baseUrl, PREVIEW_SITE_URL);
  assert.equal(visitorConfiguration({ DEPLOYMENT_PROFILE: "preview" }).readOnly, true);
});

test("mixed old overrides cannot silently turn a launch or rollback preset into another mode", () => {
  for (const value of ["unknown", "__proto__", "constructor", "toString"]) {
    assert.throws(() => deploymentEnvironment({ DEPLOYMENT_PROFILE: value }), /preview or launch/);
  }
  for (const [key, value] of Object.entries(deploymentProfiles.preview)) {
    assert.throws(() => deploymentEnvironment({ DEPLOYMENT_PROFILE: "launch", [key]: value }), /conflicts/);
  }
  assert.equal(deploymentEnvironment({ DEPLOYMENT_PROFILE: "launch", SITE_URL: "", WIX_HEADLESS_ENABLED: "" }).SITE_URL, PUBLIC_SITE_URL);
});

test("the approved HTTPS checkout origin is allowed from preview and production, never the frontend itself", () => {
  for (const baseUrl of [PREVIEW_SITE_URL, PUBLIC_SITE_URL]) {
    const config = { ...publicConfig, baseUrl };
    assert.equal(validateRedirect(`${CHECKOUT_ORIGIN}/_api/redirects/session?token=public-fixture`, config),
      `${CHECKOUT_ORIGIN}/_api/redirects/session?token=public-fixture`);
    for (const target of [
      PUBLIC_SITE_URL, "https://montlakepta.org/checkout",
      "http://checkout.montlakepta.org/", "https://checkout.montlakepta.org.evil.example/",
      "https://sub.checkout.montlakepta.org/", "https://checkout.montlakepta.org./",
      "https://user:password@checkout.montlakepta.org/", "https://checkout.montlakepta.org@evil.example/",
      "https://checkout.montlakepta.org:444/", "javascript:alert(1)",
      "https:\\\\checkout.montlakepta.org\\checkout", " https://checkout.montlakepta.org/",
      "https://checkout.montlakepta.org/\nsecret",
    ]) assert.throws(() => validateRedirect(target, config), /checkout|Checkout/);
    assert.throws(() => validateRedirect(`${CHECKOUT_ORIGIN}/`, config, CHECKOUT_ORIGIN), /Checkout/);
  }
  assert.deepEqual(callbackUrls(publicConfig), {
    thankYouPageUrl: `${PUBLIC_SITE_URL}checkout/complete/`,
    postFlowUrl: `${PUBLIC_SITE_URL}cart/`, cartPageUrl: `${PUBLIC_SITE_URL}cart/`,
  });
});
