import assert from "node:assert/strict";
import test from "node:test";
import { cutoverLinkProblems } from "./check-cutover.mjs";

test("cutover checks reject old content/assets and explicitly marked transaction fallbacks", () => {
  const base = "https://montlake-pta.github.io/website/";
  const html = '<a href="https://www.montlakepta.org/old">Old</a><img src="//montlakepta.org/_files/old.pdf">'
    + '<a href="../event/" data-legacy-transaction="true">Register</a>';
  assert.equal(cutoverLinkProblems(html, `${base}post/article/`, base).length, 3);
});

test("mail, independent services and Wix media are not retired-frontend dependencies", () => {
  const base = "https://montlake-pta.github.io/website/";
  assert.deepEqual(cutoverLinkProblems('<a href="mailto:events@montlakepta.org">Email</a>'
    + '<a href="https://www.gofevo.com/event/example">Tickets</a><img src="https://static.wixstatic.com/media/file.jpg">'
    + '<a href="../../calendar/">Calendar</a>', `${base}post/article/`, base), []);
});

test("the final new-site domain is legitimate, but a marked legacy self-handoff never is", () => {
  const base = "https://www.montlakepta.org/";
  assert.deepEqual(cutoverLinkProblems('<a href="https://www.montlakepta.org/calendar/">Calendar</a>', base, base), []);
  assert.equal(cutoverLinkProblems('<a data-legacy-transaction="true" href="/event-details/event/">Register</a>', base, base).length, 1);
});
