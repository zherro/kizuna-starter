# ui-review: http://localhost:3000/cuiaba-mt (2026-10-25)
Mode: standard + frontend-design pass · built-in browser + detect.js (agent-browser not installed) · ui-review 1.2.0

## Summary
Before: 1 broken, 3 degraded, 2 polish. After the fixes: 0 broken, 0 degraded, 2 polish. No horizontal scroll at any breakpoint.

Not covered: the places mosaic, news and "Eventos" rail. The local database has no approved place, no news and no event in the region, so those blocks render nothing.

## Findings (all breakpoints)
| Sev | Element | Issue | Source | Status |
|---|---|---|---|---|
| broken | Category carousel | Shows "Nenhuma categoria disponível." because the facets resource returns 400 (the local DB lacks the search 0013 migration) and group mode with onlyWithListings had no fallback | kizuna-core/src/client/components/taxonomy/category-carousel.tsx | fixed: falls back to the primary group of categories that have listings; the home also hides the carousel when it is empty |
| degraded | "Ver todas" link (mobile) | Drops to its own line below the title, because the 10/2 Grid stacks on mobile | category-carousel.tsx (Header) | fixed: flex row, link does not wrap |
| degraded | Card meta (category, city, date) | 11px grey text on mobile | kizuna-core/src/client/components/ui-better-soft/lists/listing-result-card.tsx | fixed: 12px |
| degraded | Section copy | "começa aqui" repeated in two titles; rail titles use the "Palavra - fragmento" hyphen pattern | src/i18n/messages.ts, kizuna.config.json | fixed: "O que você quer fazer hoje?", "Cinema em cartaz", "Eventos que vêm aí" |
| polish | Cinema rail | The same film shows up as separate cards per cinema (Duna, Vingadores) | data | not changed (content) |
| polish | Footer links | 20px tall tap targets on mobile | footer | not changed |

Checked and dismissed: overlaps with the Next dev "Issue" badge (dev only), and wrapped controls on card links and the bottom nav (they stack on purpose).

## Console / network (first run)
- 404 /api/resources/ad_slots and ad_creatives: the ads plugin migration was missing in the local DB.
- 400 /api/resources/category_service_facets: column subcategory_ids did not exist (services 0013 was missing).
- 404 /api/location/ip.

## Second run, after the migrations (same day)
`kizuna update` moved the lock to the new migration counts without touching the DB, so `db migrate` saw nothing pending. The 18 missing files were applied with `kizuna db run`: core 0119-0120, taxonomy 0005, services 0010-0016, ads 0001 and search 0005-0011. The PostgREST schema was then reloaded.

- facets, ad_slots, ad_creatives and category_service_stats all return 200.
- The category carousel uses the real facets now (the fallback is no longer needed locally).
- No horizontal scroll, clipped text or broken images at 360, 768 and 1920.
- The compact category label went from 11px to 12px. The 11px left are the 1/2/3 step badges (decorative).
- "Ver todas" reads as 60x20, but its pseudo-element expands the hit area by 8px on each side.
- Still not covered: places (none approved), news and events (no data in the local DB; only Cinema has listings).
