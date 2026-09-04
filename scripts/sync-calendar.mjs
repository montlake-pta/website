import ical from "node-ical";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const root = dirname(dirname(currentFile));

if (process.argv[1] === currentFile) await main();

async function main() {
  const config = JSON.parse(await readFile(join(root, "src", "calendar.config.json"), "utf8"));
  const output = join(root, "src", "data", "calendar-events.json");
  const snapshot = await createCalendarSnapshot({ calendarUrl: config.icsUrl });
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`Synced ${snapshot.events.length} upcoming Google Calendar events.`);
}

export async function createCalendarSnapshot({
  calendarUrl,
  fetchImpl = fetch,
  now = new Date(),
  horizonDays = 400,
}) {
  const url = safeCalendarUrl(calendarUrl);
  if (!url) throw new Error("A public Google Calendar ICS URL is required.");

  const response = await fetchImpl(url, {
    headers: { "user-agent": "Montlake PTA public calendar sync" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Google Calendar request failed: ${response.status} ${response.statusText}`);
  }

  const parsed = await ical.async.parseICS(await response.text());
  const from = new Date(now.valueOf() - 24 * 60 * 60 * 1000);
  const to = new Date(now.valueOf() + horizonDays * 24 * 60 * 60 * 1000);
  const events = [];

  for (const event of Object.values(parsed)) {
    if (event?.type !== "VEVENT" || event.status === "CANCELLED") continue;
    const instances = ical.expandRecurringEvent(event, {
      from,
      to,
      expandOngoing: true,
    });
    for (const instance of instances) {
      const normalized = normalizeEvent(instance, event);
      if (normalized) events.push(normalized);
    }
  }

  events.sort((left, right) => new Date(left.startAt) - new Date(right.startAt));
  return {
    schemaVersion: 1,
    source: "google-calendar",
    syncedAt: now.toISOString(),
    events: dedupeEvents(events),
  };
}

function normalizeEvent(instance, parent) {
  const effective = instance.event || parent;
  if (effective.status === "CANCELLED") return null;
  if (!(instance?.start instanceof Date) || Number.isNaN(instance.start.valueOf())) return null;
  const title = String(effective.summary || instance.summary || parent.summary || "").trim();
  if (!title) return null;
  const allDay = Boolean(instance.isFullDay || instance.start.dateOnly);
  const startAt = (allDay ? allDayBoundary(instance.start) : instance.start).toISOString();
  const endAt = instance.end instanceof Date && !Number.isNaN(instance.end.valueOf())
    ? (allDay ? allDayBoundary(instance.end) : instance.end).toISOString()
    : null;
  const uid = String(parent.uid || instance.uid || title);
  return {
    id: createHash("sha256").update(`${uid}:${startAt}`).digest("hex").slice(0, 16),
    title,
    startAt,
    endAt,
    allDay,
    location: safeLocation(effective.location),
    status: effective.status || "CONFIRMED",
    source: "google-calendar",
  };
}

function dedupeEvents(events) {
  const unique = new Map();
  for (const event of events) {
    const key = `${normalizeTitle(event.title)}|${event.startAt}`;
    if (!unique.has(key)) unique.set(key, event);
  }
  return [...unique.values()];
}

function safeLocation(value) {
  if (typeof value !== "string") return "";
  const location = value.replace(/\s+/g, " ").trim().slice(0, 240);
  if (/(?:https?:\/\/|www\.|@|pass[\s_-]*code|password|\bpin\b|access[\s_-]*code|security[\s_-]*code|join[\s_-]*code|meeting[\s_-]*id|conference[\s_-]*id|dial[\s_-]*in|zoom|teams|webex|google[\s_-]*meet|virtual|online)/i.test(location)) {
    return "";
  }
  return location;
}

function allDayBoundary(date) {
  // node-ical represents VALUE=DATE as midnight in the process timezone.
  // Local date components therefore preserve the source calendar date across hosts.
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const desired = Date.UTC(year, month, day);
  let guess = desired;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let index = 0; index < 3; index++) {
    const values = Object.fromEntries(
      formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]),
    );
    const observed = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second),
    );
    const adjustment = desired - observed;
    guess += adjustment;
    if (adjustment === 0) break;
  }

  return new Date(guess);
}

function safeCalendarUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "calendar.google.com" && url.pathname.endsWith("/public/basic.ics")
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function normalizeTitle(value) {
  const original = value.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const alphanumeric = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return alphanumeric || original;
}
