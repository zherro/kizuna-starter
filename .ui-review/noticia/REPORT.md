# ui-review: variant noticia (2026-10-25)
Mode: standard + keyboard + dark mode · built-in browser + detect.js (agent-browser not installed) · ui-review 1.2.0

Pages: news with 3 sources (Mega-Sena), news with a portrait photo (Rota dos Balneários), news with a long title and 4 sources (Mega-Sena calendar), showcase `/showcase/service-detail-noticia`, search `/busca?group=noticias`. Breakpoints 360, 768, 1366 and 1920.

## Summary
2 broken, 4 degraded, 9 polish. Both broken findings and 2 degraded ones are fixed. No horizontal scroll, clipped text or real overlap at any size. The overlaps detect.js reports in the sources and inline links are false positives (inline links wrapping).

## Fixed
| Sev | Element | Issue | Source | Fix |
|---|---|---|---|---|
| broken | Page top (dark mode) | Fixed-lightness gradient left a light band and an unreadable breadcrumb | kizuna-core service-detail-page.tsx | Gradient derived from the background token, so it is light in light mode and dark in dark mode |
| broken | Headline (dark mode) | Display color defined only for the light theme: dark brown on near black, about 1.5:1 | src/app/globals.css and kizuna-core/template/src/app/globals.css (bora_cuiaba dark block) | Light display color in the dark block; also affects the home news block titles |
| degraded | Portrait cover photo | A 1280x1920 photo was cropped to about a third in the wide frame | kizuna-core content/article-figure.tsx | Tall photos are contained over a blurred copy of themselves; same frame size, no layout shift |
| degraded | Byline | Separator dangled at the end of a line when date and reading time wrapped | kizuna-core content/article-byline.tsx | Separator sits before each item and is clipped at line start |
| polish | Breadcrumb links | 16px tall tap targets | service-detail-page.tsx | 24px hit area with negative margin, same breadcrumb height |

## Reported only
| Sev | Element | Issue | Where |
|---|---|---|---|
| degraded | "Veja também" | The same film repeats (Duna - Parte 3 three times) | random services loader (no de-duplication) |
| degraded | News search | Shows the price range filter, which does not apply to news | search filters panel |
| polish | Search cards at 1366 and 1920 | Titles cut at two lines and lose meaning | listing-result-card.tsx |
| polish | Carousels | Cards with and without subcategory have different heights | carousel cards |
| polish | Carousel links on the detail page | Carry `src=home` | carousel source tracking |
| polish | Header | "Inicio" without accent | site header |
| polish | Showcase | Missing accents; Gostei/Favoritar without icon | showcase-sections.ts |
| polish | 1366x768 with a three-line title | The 2:1 photo pushes the lead below the fold | article layout |
| polish | Tablet | Share button has no border next to the bordered reaction buttons | article actions |
| polish | Data | The Mega-Sena stories have the kicker "Cultura & Entretenimento" (no lottery subcategory) | taxonomy |

## Keyboard and dark mode
Tab order: photo credit links, Gostei, Favoritar, Compartilhar, body links, source links. All have a visible focus ring and there is no focus trap. Dark mode: body, caption, actions and sources read well after the two fixes above.

## Console / network
Only Google One Tap / FedCM errors from the local environment.
