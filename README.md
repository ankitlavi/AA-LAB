# CartWise

One app for your orders on Amazon, Flipkart, Myntra, Nykaa, Savana, AJIO and Meesho.
Built with Expo (React Native) — the same code runs on Android and iOS.

## What it does

| # | Feature | Where |
|---|---------|-------|
| 1 | Orders from every connected site on one front panel | Orders tab |
| 2 | Return deadline per delivered order; flashing red alert in the last 2 days, plus phone notifications | Orders tab |
| 3 | Finds the same product on every site and points to the cheapest | Compare tab |
| 4 | One combined rating across sites; flags a site whose rating is much higher than the rest | Compare tab |
| 5 | Coupons found on the product page, with tap-to-copy codes | "Offers & buy" |
| 6 | Bank / card / UPI offers listed before you proceed to order | "Offers & buy" |
| 7 | Shop on the real sites inside the app; "Continue shopping" reopens the last page; one-tap price comparison from any product page | Home → Shop |

| 8 | Price history chart and "good time to buy" verdict for every product compared | Compare tab |
| 9 | Watchlist with a target price; alert (banner + notification) when any site drops to it | Compare tab, Home |
| 10 | "Best with your cards": tick the cards you hold and the biggest usable bank offer is highlighted | "Offers & buy", My shops |
| 11 | Ask AI (ChatGPT, Gemini, Claude) for product details or the OEM, via their free websites; no API key | Compare tab |

Price history starts the first time a product is compared and grows with each check.
Watched products are re-checked when the app is opened (if the last check is over
6 hours old) or with "Check all" — not while the app is closed.

## How it works

There is no server. You sign in on each site's own page inside the app; CartWise
never sees or stores your password. It then loads the site's pages in hidden
WebViews on the phone and reads what is on screen (`src/scrape/`).

- `src/sites.ts` — one entry per site (URLs + product-link pattern). Add a site here.
- `src/scrape/scripts.ts` — the in-page readers for search results, orders, coupons and offers.
- `src/logic/` — order parsing, return windows, product matching, combined rating (pure, unit-tested).
- `src/screens/` — the UI.

## Platforms

- **Android / iOS** — the primary build (Expo / React Native).
- **Windows desktop** — a full desktop app (`.exe`) that also signs in to shops and
  tracks real orders/prices on the PC. See [`desktop/README.md`](desktop/README.md).

## Run it

```bash
npm install
npx expo start
```

Scan the QR code with the **Expo Go** app (Android / iOS) to run it on your phone.
`npx expo start --web` opens a browser preview that uses sample data only.

```bash
npx tsx tests/logic.test.ts   # unit tests
npx tsc --noEmit              # typecheck
```

To produce installable builds: `npx eas-cli@latest build -p android` / `-p ios`.

## Things to know

- The readers are heuristic and depend on each site's page layout. When a site
  changes its pages a reader can stop finding things; orders can always be added
  or corrected by hand (Orders → + Add / Edit).
- When a site's orders page doesn't state a return deadline, the app estimates it
  from `returnDays` in `src/sites.ts` and labels it "estimated". Return periods
  vary by product and seller.
- Reading pages this way is for personal use with your own accounts. Check each
  site's terms before distributing the app publicly.
