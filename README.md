# windowopner.github.io

My portfolio, served by GitHub Pages at https://windowopner.github.io.

Five projects kept as an archive of discs. One disc sits in front inside a dial of tick marks; scroll, drag the disc, use the arrow keys, press a number, or tap a code to change it.

The discs are real-time 3D (Three.js 0.170 from jsDelivr): a mirrored data layer with a thin-film iridescent sheen whose thickness varies around the disc, so the rainbow turns as it spins, a clear hub, and a label printed in ink. Reflections come from a small studio of softboxes and black flags baked into an environment map. Without WebGL a flat disc stands in.

A first visit plays a short opening (the name draws in outline, fills, and the card lifts away). Add `?intro` to see it again or `?nointro` to skip it; it never plays with reduced motion. Info opens with `#info` (old `#notes` links land there too).

Plain HTML, CSS, and JavaScript modules with no build step.

- `app.js`: the disc list (`DISCS`), the index, the dial, the sheet, the keypad lock, input, and the opening.
- `scene.js`: the 3D carousel (materials, lighting, drag and click).
- `style.css`: layout and type. Cool off-white, ink hairlines, one red accent, square corners.
- `tools/lock.mjs`: encrypts `private/discs.json` (git-ignored) into `locks.json` with the keypad code.
- `favicon.svg`, `apple-touch-icon.png`, `og.png`: icon and link preview.

**Locked discs.** Every disc except Undertone ships as filler text drawn as a mosaic. Their real title, description, and link live only in `private/discs.json` on this computer. To set or change the keypad code (4 to 12 digits), run `node tools/lock.mjs` and commit the new `locks.json`. The page decrypts it in the browser when someone enters the code; a short numeric code can still be brute-forced offline, so use 8 or more digits.

To add or swap a project, edit `DISCS` in `app.js`. The disc label is drawn from the same entry.

When you change `style.css` or any `.js` file, bump the `?v=` number on the `style.css` and `app.js` tags in `index.html` (`app.js` passes it on to `scene.js` and `locks.json`). GitHub Pages lets browsers cache files for 10 minutes, and without the bump a visitor can get the new page with the old styles.

Preview locally:

```bash
python3 -m http.server 8000
```
