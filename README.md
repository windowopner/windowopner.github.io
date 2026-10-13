# windowopner.github.io

My portfolio, served by GitHub Pages at https://windowopner.github.io.

Six projects loaded into a six-disc player. Scroll, use the arrow keys, press 1 to 6, or swipe to change disc. Each project has a small pixel 3D icon (Three.js r128, rendered at low resolution and scaled up), and a film grain layer sits on top of everything.

Two themes, picked with the slide switch at the top: Room (the player on a shelf, with a clamp that lifts, travels, and sets down) and Space (the discs ride a planet's ring, which you can also grab and spin). The choice is remembered per browser.

Plain HTML, CSS, and JavaScript with no build step.

- `app.js`: the project list (`DISCS`), selection, display, and input.
- `icons.js`: the six pixel 3D icons, one builder function each.
- `film.js`: grain, dust, scratches, and flicker overlay.
- `orbit.js`: the Space theme (pixel planet, ring of discs, stars).
- `tools/lock.mjs`: encrypts `private/discs.json` (git-ignored) into `locks.json` with the keypad code.
- `favicon.svg`, `apple-touch-icon.png`, `og.png`: icon and link preview.
- `style.css`: the room, the player, and the console.

First visit plays a short power-on intro (add `?intro` to see it again, `?nointro` to skip). The Notes button opens the liner notes booklet (link straight to it with `#notes`).

**Locked discs.** Every disc except Undertone ships as filler text drawn as a mosaic. Their real title, description, and link live only in `private/discs.json` on this computer. To set or change the keypad code (4 to 12 digits), run `node tools/lock.mjs` and commit the new `locks.json`. The page decrypts it in the browser when someone enters the code; a short numeric code can still be brute-forced offline, so use 8 or more digits.

To add or swap a project, edit `DISCS` in `app.js` and the matching icon builder in `icons.js` (same order).

When you change `style.css` or any `.js` file, bump the `?v=` number on its tag in `index.html`. GitHub Pages lets browsers cache files for 10 minutes, and without the bump a visitor can get the new page with the old styles.

Preview locally:

```bash
python3 -m http.server 8000
```
