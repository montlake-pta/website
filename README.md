# Montlake PTA website

A dependency-free static website for Montlake Elementary PTA, rebuilt from the
public content at [montlakepta.org](https://www.montlakepta.org/).

**Preview:** <https://montlake-pta.github.io/website/>

## Edit the site

- Page copy, navigation, and external service URLs: `src/site.mjs`
- Visual design and responsive styles: `src/styles.css`
- Mobile navigation: `src/site.js`
- Images and brand assets: `src/assets/`
- Shared page templates and metadata: `scripts/build.mjs`

The generated `dist/` directory is intentionally ignored. GitHub Actions builds
it when changes reach `main`.

```sh
npm run build
npm test
```

To preview locally:

```sh
python3 -m http.server 4173 --directory dist
```

Then open <http://localhost:4173/>.

## Existing services retained

The redesign keeps the PTA's current operational tools in place:

- Constant Contact for the weekly newsletter
- Givebacks for PTA membership
- PayPal and employer portals for donations
- Google Calendar for live dates and events
- 6crickets for enrichment registration
- SchoolAuction.net for the seasonal auction

The existing site remains at `montlakepta.org` during the preview period. Its news
archive and historical event/store detail pages have not been moved because
those platform features require a separate content export or publishing workflow.
Do not add a `CNAME` file or change DNS until that content and the desired
domain cutover date are confirmed.
