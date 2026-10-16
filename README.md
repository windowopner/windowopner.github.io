# windowopner.github.io

My portfolio, served by GitHub Pages at https://windowopner.github.io.

Five projects kept as an archive of discs: StudyOS, Undertone, Folio, Workspace Connector, and WebGL Ripple. One disc sits in front inside a dial of tick marks; scroll, drag the disc, use the arrow keys, press a number, or tap a code to change it.

The discs are real-time 3D (Three.js 0.170 from jsDelivr): a mirrored data layer with a thin-film iridescent sheen whose thickness varies around the disc, so the rainbow turns as it spins, a clear hub, and a label printed in ink. Reflections come from a small studio of softboxes and black flags baked into an environment map. Without WebGL a flat disc stands in.

The discs float over a faint mirror floor with a perspective grid (a custom shader on Three.js's Reflector). Below the stage, a timeline lays the discs out on a track with a red playhead that follows the carousel; drag along it to scrub. Changing disc reveals the title letter by letter and darkens the text word by word. The opening's counter follows real loading progress (fonts, the 3D module, the lighting, the first frame).

The disc number sits huge and outlined behind the stage and rolls like an odometer when the disc changes; a band of text turns slowly outside the dial. The studio light sweeps across the mirror with the pointer, discs cast soft shadows on the floor, and far discs fade into the paper. The front disc reacts: it spins up when chosen, lifts on hover, and flies toward you when a project opens. A flick carries the carousel on past where the drag let go. Dragging has soft notches at each disc and a rubber band past either end, with a short buzz per notch on phones that support vibration; the discs lean into the turn. Press and hold the front disc to grab it like a record, turn it, and let go to leave it spinning. A ripple runs across the floor grid when a disc lands, the grid lights up under the pointer, the dial ticks stretch with speed, and codes scramble before settling.

**Sound** (off until the Sound button or `M` turns it on; the choice is remembered, and a returning visitor who left it on hears it from their first click). Every disc is a record with its own electronic loop, synthesised in the browser when sound starts, all at 122 BPM around A minor: 01 deep house, 02 future garage, 03 minimal techno, 04 dub techno, 05 IDM, 06 acid techno. The carousel is the crossfader, so dragging between discs blends the two loops while a filter closes and opens again. Holding the front disc puts your hand on the record: hold still and the music stops, turn it and it plays at your hand's speed (backwards too), let go and it spins back up. Notches click, grabbing a disc thumps, and opening a project whooshes. Opening About muffles the music; turning sound off is a tape stop. The floor grid and the front disc pulse with the kick, and the Sound button's bars follow the mix.

A first visit plays a short opening (the name draws in outline, fills, and the card lifts away). Add `?intro` to see it again or `?nointro` to skip it; it never plays with reduced motion. The header carries a one-line role under the name. About opens with `#about` (older `#info` and `#notes` links land there too) and holds a short bio, the disc list, the toolkit, and contact links. The page also ships a schema.org `Person` block and a canonical URL for search engines.

Plain HTML, CSS, and JavaScript modules with no build step.

- `app.js`: the disc list (`DISCS`), the index, the dial, the sheet, About, input, and the opening.
- `scene.js`: the 3D carousel (materials, lighting, drag and click).
- `sound.js`: the sound engine (deck, filters, cues, level meters), loaded only when sound is turned on.
- `tracks.js`: the six loops, rendered offline with Web Audio into sample arrays.
- `deck.js`: an AudioWorklet that plays every loop from one read head, so they stay in step at any speed or direction.
- `style.css`: layout and type. Cool off-white, ink hairlines, one red accent, square corners.
- `favicon.svg`, `apple-touch-icon.png`, `og.png`: icon and link preview.

To add or swap a project, edit `DISCS` in `app.js`: title, kind, stack, a one- or two-sentence description, an optional `status` (`"archived"`, or `"source"` when the `url` is a code repository rather than a running site), and a `url` when there is something to open. A new disc also needs a loop of its own in `tracks.js`. The disc label, the index, About, and the ring text are all drawn from the same entry. Update the `<noscript>` list in `index.html` to match.

`og.png` is a 1200x630 capture of the page with disc 01 in front; retake it when the first disc changes.

When you change `style.css` or any `.js` file, bump the `?v=` number on the `style.css` and `app.js` tags in `index.html` (`app.js` passes it on to `scene.js`, `sound.js`, `tracks.js`, and `deck.js`). GitHub Pages lets browsers cache files for 10 minutes, and without the bump a visitor can get the new page with the old styles.

Preview locally:

```bash
python3 -m http.server 8000
```
