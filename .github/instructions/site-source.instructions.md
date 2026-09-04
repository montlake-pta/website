---
description: 'Rules for generated pages, frontend behavior, accessibility, and the Montlake design system'
applyTo: 'src/**/*.mjs,src/**/*.js,src/**/*.css,scripts/build.mjs,scripts/render-wix-content.mjs,scripts/render-newsletters.mjs,scripts/check-site.mjs,PRODUCT.md,DESIGN.md'
---

# Site source instructions

- Treat `PRODUCT.md` and `DESIGN.md` as authoritative.
- Preserve URL compatibility and calculate relative asset/link bases correctly
  for nested dynamic routes.
- Keep generated markup semantic: one page-level `h1`, logical headings,
  landmarks, useful alt text, labels, and visible keyboard focus.
- Keep body copy within a readable measure and functional text at or above the
  documented minimum.
- Use design tokens from `src/styles.css`; update `DESIGN.md` and
  `.impeccable/design.json` when the visual system changes.
- Do not add visitor-facing details about Wix, GitHub Actions, migration, or
  implementation internals.
- Sanitize any HTML originating outside the repository with an explicit
  allowlist.
- Build before testing. For UI changes, run the Impeccable detector against
  `dist/` and inspect representative wide and narrow layouts.
