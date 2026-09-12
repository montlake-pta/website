export const validationFixturePrefix = "Montlake SDK validation ";
export class ValidationFixtureError extends Error {}
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;

export function excludeValidationFixtures(kind, records, fixtures = [], notify = console.warn) {
  if (!["products", "events"].includes(kind) || !Array.isArray(fixtures)
    || fixtures.some(fixture => !uuid.test(fixture.id || "") || typeof fixture.name !== "string"
      || !fixture.name.startsWith(validationFixturePrefix))
    || new Set(fixtures.map(fixture => fixture.id)).size !== fixtures.length) {
    throw new ValidationFixtureError("Invalid approved SDK validation fixture registry.");
  }
  const nameKey = kind === "products" ? "name" : "title";
  let excluded = 0;
  const result = records.filter(record => {
    const registered = fixtures.find(fixture => fixture.id === record._id);
    if (registered) {
      if (record[nameKey] !== registered.name) throw new ValidationFixtureError("An SDK validation fixture identity changed; sync stopped.");
      excluded++;
      return false;
    }
    const publicRecord = kind === "products" ? record.visible !== false : record.status !== "DRAFT";
    if (publicRecord && typeof record[nameKey] === "string" && record[nameKey].startsWith(validationFixturePrefix)) {
      throw new ValidationFixtureError("An unregistered SDK validation fixture reached public sync; register it before publishing.");
    }
    return true;
  });
  if (excluded) notify(`Excluded ${excluded} explicitly registered SDK validation ${kind} from public content.`);
  return result;
}
