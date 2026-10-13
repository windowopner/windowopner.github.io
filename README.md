# windowopner.github.io

My portfolio, served by GitHub Pages at https://windowopner.github.io.

Five projects loaded into a disc changer. Scroll, use the arrow keys, press a number key, or swipe to change disc. Each project has a small pixel 3D icon (Three.js r128, rendered at low resolution and scaled up), and a film grain layer sits on top of everything.

Two themes, picked with the slide switch at the top: Room (the player on a shelf, with a clamp that lifts, travels, and sets down) and Space (the discs ride a planet's ring, which you can also grab and spin). The choice is remembered per browser.

Plain HTML, CSS, and JavaScript with no build step.

- `app.js`: the project list (`DISCS`), selection, display, and input.
- `icons.js`: the pixel 3D icons, one builder function each.
- `film.js`: grain, dust, scratches, and flicker overlay.
- `orbit.js`: the Space theme (pixel planet, ring of discs, stars).
- `tools/lock.mjs`: encrypts `private/discs.json` (git-ignored) into `locks.json` with the keypad code.
- `favicon.svg`, `apple-touch-icon.png`, `og.png`: icon and link preview.
- `style.css`: the room, the player, and the console.

The Quality fader in the footer runs from pixel art (0) through the original look (40) to cinema (100): render resolution, frame rate, shading, grain, depth of field, letterbox, and colour grade all follow it. Link a setting with `?quality=0` to `?quality=100`.

First visit plays a short power-on intro (add `?intro` to see it again, `?nointro` to skip). The Notes button opens the liner notes booklet (link straight to it with `#notes`).

**Locked discs.** Every disc except Undertone ships as filler text drawn as a mosaic. Their real title, description, and link live only in `private/discs.json` on this computer. To set or change the keypad code (4 to 12 digits), run `node tools/lock.mjs` and commit the new `locks.json`. The page decrypts it in the browser when someone enters the code; a short numeric code can still be brute-forced offline, so use 8 or more digits.

To add or swap a project, edit `DISCS` in `app.js` and the matching icon builder in `icons.js` (same order).

When you change `style.css` or any `.js` file, bump the `?v=` number on its tag in `index.html`. GitHub Pages lets browsers cache files for 10 minutes, and without the bump a visitor can get the new page with the old styles.

Preview locally:

```bash
python3 -m http.server 8000
```
