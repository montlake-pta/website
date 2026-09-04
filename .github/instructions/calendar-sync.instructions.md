---
description: 'Rules for public Google Calendar synchronization and mixed homepage event rendering'
applyTo: 'scripts/sync-calendar.mjs,src/calendar.config.json,src/data/calendar-events.json,scripts/render-wix-content.mjs'
---

# Calendar synchronization instructions

- Use only the configured public Google Calendar ICS feed.
- Persist normalized public fields only. Never retain descriptions, conference
  links, meeting IDs, passcodes, attendees, or organizer details.
- Expand RRULE recurrences with exception dates, overrides, and the source
  timezone.
- Keep all-day end dates exclusive in storage and inclusive only for display.
- Mix upcoming Google and Wix events by normalized title plus local start date.
  Prefer Wix on duplicates so visitors receive the richer event detail route.
- Google-only events on the homepage link to `/calendar/`.
- Keep the snapshot deterministic and bounded to the configured future horizon.
