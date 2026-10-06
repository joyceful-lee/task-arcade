# Claw Machine sprites

Each PNG is drawn at 1:1 (one image pixel = one art pixel) and drawn onto the game's
low-res canvas, which is scaled up with crisp pixels (4× desktop, 3× phones).

| File | Used for |
| --- | --- |
| `ball-<color>.png` | Small gachapon balls (12×12): `pink`, `yellow`, `green`, `blue`, `purple` |
| `ball-large-<color>.png` | Large gachapon balls (18×18), same colors; about 30% of the balls |
| `claw-open.png` | Claw while idle, descending, and releasing (17×14) |
| `claw-closed.png` | Claw while gripping (17×14) |
| `marquee.png` | Cabinet marquee strip (256×16) |

The physics treats balls as circles of radius 6 (small) and 9 (large), so keep the sprites
12×12 and 18×18; the sizes live in `BALL_SIZES` in `app.js`. The claw is drawn centered on
its cable (8 pixels left of center), and a held ball's center sits 3 pixels plus its radius
below the claw's top edge. The machine interior (walls, rail, chute) is painted in code
in `paintClawBackdrop` / `paintClawForeground` in `app.js`.

Use full opacity, no anti-aliasing, and stick to the
[NES palette](https://lospec.com/palette-list/nintendo-entertainment-system).
The marquee is centered and cropped at the sides on narrow screens, so keep the title
within the middle ~150 pixels.
