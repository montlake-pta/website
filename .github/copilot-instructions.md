# Repository instructions

Read and follow `/AGENTS.md` before making changes. Trust its repository map and
commands; search only when the request or current code reveals a gap.

This is a Node.js 24, dependency-light static-site generator. Wix is the
authoritative source for Blog, Events, Stores, `BoardMembers`, and
`WebsitePages`; GitHub Actions builds static HTML for GitHub Pages.

- Never edit or commit `dist/`.
- Edit `src/site.mjs` for static fallback content and routes,
  `src/styles.css` for design, `src/site.js` for browser behavior, and
  `scripts/*.mjs` for generation or Wix integration.
- Read `PRODUCT.md` and `DESIGN.md` before content, UX, or visual changes.
- For visual work, follow `.github/skills/impeccable/SKILL.md` and run the
  Impeccable detector after building.
- Preserve existing routes, accessibility, sanitization, and fallback behavior.
- Never expose `WIX_API_KEY` or any other secret.
- Use least-privilege GitHub Actions permissions.
- Validate ordinary changes with `npm run build && npm test`.
- Validate agent configuration with `npm run check:agents`.
- In PR summaries, distinguish source-code changes, Wix-authored content,
  repository settings, and any remaining manual deployment steps.
