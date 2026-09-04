---
description: 'Rules for the public Constant Contact newsletter archive and generated newsletter routes'
applyTo: 'scripts/sync-newsletters.mjs,scripts/render-newsletters.mjs,src/data/newsletters.json,src/newsletter.config.json'
---

# Newsletter archive instructions

- Use Constant Contact's public archive endpoint and public `data-m` identifier;
  do not introduce OAuth or browser credentials.
- Validate the archive identifier and accept only HTTPS campaign URLs from
  `conta.cc` or `myemail.constantcontact.com`.
- Preserve the endpoint's newest-first order.
- Generate stable edition slugs using the campaign URL so new newsletters do
  not change old routes.
- Embed public campaign pages in sandboxed iframes and retain an external-link
  fallback.
- Keep the checked-in snapshot valid when the archive is unavailable.
- The `/newsletter/` route must default to the newest edition and include signup
  calls to action above and below the issue.
