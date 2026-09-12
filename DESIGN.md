---
name: Montlake PTA
description: A warm, practical field guide for the Montlake Elementary community.
colors:
  wolf-ink: "#111842"
  montlake-navy: "#111b52"
  midnight-navy: "#070d31"
  school-blue: "#86c9ec"
  lake-blue: "#176b9a"
  mist-blue: "#dcecf6"
  paper: "#fbfcff"
  warm-field: "#f1f4f8"
  silver: "#d6dbe3"
  silver-soft: "#eff0f3"
  brick: "#a94737"
  brick-soft: "#fae9e4"
  body-muted: "#53617b"
  footer-muted: "#b9c3d7"
  footer-subtle: "#8795b3"
typography:
  scale:
    micro: "0.7rem"
    meta: "0.8rem"
    small: "0.85rem"
    nav: "0.9rem"
    utility: "0.92rem"
    body: "1rem"
    body-large: "1.05rem"
    supporting: "1.1rem"
    article: "1.125rem"
    compact-title: "1.15rem"
    lede-small: "1.2rem"
    title-small: "1.25rem"
    lede: "1.3rem"
    subsection: "1.35rem"
    brand: "1.45rem"
    lead: "1.5rem"
    card-title: "1.55rem"
    arrow: "1.75rem"
    aside-title: "1.8rem"
    section-small: "2rem"
    display-compact: "2.4rem"
    statistic: "2.5rem"
    display-small: "2.6rem"
    display-mobile: "2.8rem"
    display-base: "3rem"
    display-subsection: "3.1rem"
    display-hero: "3.2rem"
    display-article: "3.5rem"
    display-large: "4rem"
    display-mobile-large: "4.2rem"
    display-section: "4.7rem"
    display-mission: "4.8rem"
    display-page: "5rem"
    display-donate: "5.2rem"
    display-max: "5.9rem"
  display:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "clamp(3rem, 6vw, 5.9rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Literata, Georgia, serif"
    fontSize: "clamp(2rem, 3.5vw, 4.7rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Atkinson Hyperlegible Next, Segoe UI, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 700
    lineHeight: 1.2
rounded:
  control: "999px"
  compact: "0.75rem"
  surface: "1rem"
  image: "1.25rem"
  feature: "1.5rem"
spacing:
  xs: "0.5rem"
  sm: "0.75rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
  section: "clamp(4.5rem, 8vw, 7rem)"
components:
  button-primary:
    backgroundColor: "{colors.montlake-navy}"
    textColor: "{colors.paper}"
    rounded: "{rounded.control}"
    padding: "0.7rem 1.25rem"
    height: "48px"
  callout:
    backgroundColor: "{colors.mist-blue}"
    textColor: "{colors.wolf-ink}"
    rounded: "{rounded.surface}"
    padding: "1.5rem 1.75rem"
---

# Design System: Montlake Field Guide

## Overview

**Creative North Star: "The Montlake Field Guide"**

The site combines the confidence of the Montlake wolf mark with the warmth and
clarity of a well-used neighborhood guide. It should feel authored by people who
know the school and understand that visitors are often looking for one answer
quickly. Utility leads; community character follows.

The visual system uses the wolf logo as an anchor rather than a costume. Deep
navy carries structure, school blue marks routes and interaction, cool silver
supports quiet surfaces, and warm paper prevents the experience from feeling
institutional. Brick appears sparingly to create contrast and human warmth.

**Key Characteristics:**

- practical navigation before promotional storytelling;
- literary but highly legible typography;
- open reading surfaces with restrained containers;
- circular linework and badge-derived details rather than generic decoration;
- community photography that shows real people and programs.

## Colors

The palette is school-aligned, high-contrast, and mostly neutral by area.

### Primary

- **Montlake Navy** (`#111b52`): primary buttons, structural surfaces, and
  identity-bearing sections.
- **Midnight Navy** (`#070d31`): announcement bar and footer.
- **Wolf Ink** (`#111842`): body text and headings.

### Secondary

- **School Blue** (`#86c9ec`): badge-derived highlights and quiet visual
  geometry.
- **Lake Blue** (`#176b9a`): links, utility icons, and interactive emphasis.

### Tertiary

- **Community Brick** (`#a94737`): rare emphasis, hover states, and human warmth.
- **Brick Wash** (`#fae9e4`): a quiet page-heading tint for community and
  event pages.

### Neutral

- **Cool Paper** (`#fbfcff`): primary reading surface.
- **School Field** (`#f1f4f8`): supporting content surface.
- **Wolf Silver** (`#d6dbe3`): neutral brand reference.
- **Silver Mist** (`#eff0f3`): utility and secondary surfaces.
- **Body Muted** (`#53617b`): secondary text on light backgrounds.
- **Footer Muted** (`#b9c3d7`): supporting text on Midnight Navy.
- **Footer Subtle** (`#8795b3`): legal and tertiary footer text.

**The 80/15/5 Rule.** Warm neutrals occupy most of a page, navy provides
structure, and saturated blue or brick stays rare enough to retain meaning.

## Typography

**Display Font:** Literata (with Georgia fallback)  
**Body Font:** Atkinson Hyperlegible Next (with Segoe UI fallback)

**Character:** Literata brings a bookish, public-school voice without becoming
precious. Atkinson Hyperlegible Next keeps dates, contacts, and instructions
easy to distinguish during quick scans.

### Hierarchy

- **Display** (600, up to `5.9rem`, `1.05`): homepage and page-level statements.
- **Headline** (600, fluid `2rem–4.7rem`, `1.05`): major section boundaries.
- **Title** (600, `1.35rem–2.4rem`): cards, utility routes, and subsections.
- **Body** (400, `1rem`, `1.6`): reading copy with a maximum measure of `68ch`.
- **Label** (700, minimum `0.8rem`): metadata and compact utility text.

**The Functional Floor Rule.** Text that helps a person navigate or act never
drops below `0.8rem`.

## Layout

The site uses a centered `1180px` maximum container with generous section
spacing. The homepage begins with a compact operational link rail, then a
two-column community-led hero and a live editorial module for upcoming events
and current PTA updates. Repeated parent tasks use open rows and dividers
instead of equal-weight cards.

Content pages are Read surfaces: a clear page heading, optional “On this page”
navigation for long documents, a `68ch` reading measure, and a single help
aside. Mobile order always matches document and keyboard order.

Task-oriented guides such as Enrichment use a compact page heading and put
registration and day-of contacts before the outline. The `outlineAfterIntro`
page flag retains introductory CMS content ahead of structural-section links;
long addresses wrap rather than widening the page on small phones.

Rich articles retain inline links, lists and figures. Long addresses wrap
within the reading column; inline images keep their full aspect ratio rather
than using hero-image cropping. Figure captions use readable supporting text,
and data graphics retain a textual equivalent where authored.
Article tables preserve row/cell structure, use thin dividers and wrap within
the reading column rather than introducing horizontal page scroll.

Blog posts use a centered, single `68ch` reading column on the paper surface,
not the general page banner and sidebar. A compact news return link, balanced
`2rem–3.5rem` Literata title and publication date precede the article. An updated
date appears only when its local calendar day differs. Excerpts belong to news
listings and metadata, not a repeated introduction above the article.
Article copy is `1.125rem` with `1.65` line height; section headings are smaller
than general-page headings. Long articles retain the shared on-page outline.
Cover thumbnails are decorative and optional: omit the cover when the same
image is already in the body, preserving the authored figure, caption and alt
text. Never crop an informational graphic; standalone covers fit within
`28rem` height. A divided closing section carries the news return link and
PTA contact, without a competing help card.

Visitor transaction forms are Operate surfaces within the same reading layout:
visible labels, 48px controls, native validation, explicit loading/error states
and restrained status messages. Checkout confirmations never infer payment
success from a return URL alone. The catalog remains readable without
JavaScript; live purchasing and registration are progressive enhancements.

Fundraising surfaces are Persuade within the Field Guide: an optional
student-led hero, open campaign links, a readable body, and optional impact,
equity and trust sections. Donate is the year-round hub; Annual Fund and Spring
Auction reuse the same layout. Their CMS-authored summaries appear in open,
divided rows on the hub and homepage, not additional cards.

Campaign status and school year follow the introduction as useful operational
information, never an eyebrow. Optional goals and deadlines use compact,
tabular-number facts rather than oversized statistics or invented progress.
Closed and upcoming campaigns retain their information and offer a year-round
giving route instead of a live campaign action. Long bodies retain an on-page
outline. Optional images can be removed without leaving an empty grid column.
All fundraising claims, image descriptions, body sections and primary actions
are authored in the CMS; typography, spacing and generic interface labels are
code-owned. Never use artificial urgency or donation pressure.

## Elevation & Depth

The system is flat by default. Borders, background tone, and spacing establish
most hierarchy. A single soft ambient shadow is reserved for the hero image and
floating navigation menu, where elevation clarifies layering.

**The Flat-by-Default Rule.** If spacing and tone can establish the relationship,
do not add another card or shadow.

## Shapes

Rounded rectangles support approachable controls and content surfaces. Pill
shapes are reserved for buttons. Circular linework references the wolf badge in
large identity moments; it is not repeated on every component.

## Components

### Buttons

- **Shape:** pill (`999px`) with a `48px` minimum height.
- **Primary:** Montlake Navy with Warm Paper text.
- **Hover:** Community Brick with white text.
- **Focus:** two-tone Warm Paper and Midnight Navy ring that remains visible on
  both light and dark surfaces.
- **Secondary:** transparent with a navy border.

### Utility Links

Compact icon-and-label routes use authored outline SVGs, visible secondary text,
and borders rather than individual card shadows.

### Cards and Lists

Cards are used only for genuinely repeatable content such as posts and products.
Operational choices and informational groups prefer rows, spacing, and
dividers.

### Callouts

Callouts use Mist Blue, a subtle full border, and a `1rem` radius. Never use a
thick colored side tab.

## Do's and Don'ts

### Do

- Put calendar, newsletter, after-school, and attendance routes near the top.
- Use real Montlake photography with accurate alt text.
- Use dividers and proximity before adding containers.
- Preserve generous reading measure and strong focus treatment.
- Let the logo inform color and geometry subtly.

### Don't

- Reintroduce eyebrow labels above headings or decorative section numbers.
- Use equal-size icon cards as default page scaffolding.
- Use thick accent borders, side-tab callouts, or emoji as icons.
- Make school blue the background of every section.
- Reduce functional labels below `0.8rem`.
- Let visual order differ from document or keyboard order on mobile.
