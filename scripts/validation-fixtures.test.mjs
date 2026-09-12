import assert from "node:assert/strict";
import test from "node:test";
import { excludeValidationFixtures, validationFixturePrefix } from "./validation-fixtures.mjs";
import { assertPublicSnapshot, normalizeWixContent } from "./normalize-wix-content.mjs";

const id = "10000000-0000-4000-8000-000000000001";
const fixture = { id, name: `${validationFixturePrefix}controlled product` };

test("only explicitly registered matching fixtures are excluded; ordinary products remain unchanged", () => {
  const ordinary = { _id: "ordinary", name: "Real fundraiser" };
  const messages = [];
  assert.deepEqual(excludeValidationFixtures("products", [ordinary, { _id: id, name: fixture.name }], [fixture],
    message => messages.push(message)), [ordinary]);
  assert.equal(messages.length, 1);
  assert(!messages[0].includes(id));
});

test("unregistered test resources and renamed registered resources stop publication rather than hide real content", () => {
  assert.throws(() => excludeValidationFixtures("products", [{ _id: id, name: fixture.name }]), /unregistered/);
  assert.throws(() => excludeValidationFixtures("products", [{ _id: id, name: "Real fundraiser now" }], [fixture]), /identity changed/);
  assert.throws(() => excludeValidationFixtures("products", [], [{ ...fixture, name: "Ordinary" }]), /Invalid/);
  assert.throws(() => excludeValidationFixtures("products", [], [fixture, fixture]), /Invalid/);
  assert.deepEqual(excludeValidationFixtures("events", [{ _id: id, title: fixture.name }], [fixture], () => {}), []);
  assert.equal(excludeValidationFixtures("products", [{ _id: id, name: fixture.name, visible: false }]).length, 1);
  assert.equal(excludeValidationFixtures("events", [{ _id: id, title: fixture.name, status: "DRAFT" }]).length, 1);
});

test("public snapshot exports cannot accidentally contain a test product or event", () => {
  const empty = { blogPosts: [], events: [], products: [], storeCollections: [], boardMembers: [], cmsPages: [] };
  for (const input of [
    { products: [{ _id: id, slug: "test-product", name: fixture.name, visible: true }] },
    { events: [{ _id: id, slug: "test-event", title: fixture.name, status: "UPCOMING" }] },
  ]) assert.throws(() => assertPublicSnapshot(normalizeWixContent({ ...empty, ...input })), /public export/);
});
