# Prize Wheel sprites

Each PNG is drawn at 1:1 (one image pixel = one art pixel) onto the game's low-res canvas,
which is scaled up with crisp pixels (4× desktop, 3× phones).

| File | Used for |
| --- | --- |
| `pointer.png` | Pointer at the top of the wheel, tip pointing down (11×12) |
| `pointer-tick.png` | Pointer flicked sideways for a few frames each time a peg passes (11×12) |
| `marquee.png` | Cabinet marquee strip (256×16) |

The pointer is drawn centered over the wheel with its tip overlapping the gold rim. The wheel
itself (wedges, numbers, rim bulbs, hub) is rendered in code by `paintWheel` in `app.js`, since
its wedge count changes with the number of tasks; wedge colors are `wheelColors`. The stage
(curtains, floor, stand) is painted by `paintWheelBackdrop`.

Use full opacity, no anti-aliasing, and stick to the
[NES palette](https://lospec.com/palette-list/nintendo-entertainment-system).
The marquee is centered and cropped at the sides on narrow screens, so keep the title
within the middle ~150 pixels.
