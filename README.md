# windowopner.github.io

My portfolio, served by GitHub Pages at https://windowopner.github.io.

Six projects loaded into a six-disc player. Scroll, use the arrow keys, press 1 to 6, or swipe to change disc. Each project has a small pixel 3D icon (Three.js r128, rendered at low resolution and scaled up), and a film grain layer sits on top of everything.

Two themes, picked with the slide switch at the top: Room (the player on a shelf) and Space (the discs ride a planet's ring). The choice is remembered per browser.

Plain HTML, CSS, and JavaScript with no build step.

- `app.js`: the project list (`DISCS`), selection, display, and input.
- `icons.js`: the six pixel 3D icons, one builder function each.
- `film.js`: grain, dust, scratches, and flicker overlay.
- `orbit.js`: the Space theme (pixel planet, ring of discs, stars).
- `style.css`: the room, the player, and the console.

To add or swap a project, edit `DISCS` in `app.js` and the matching icon builder in `icons.js` (same order).

Preview locally:

```bash
python3 -m http.server 8000
```
