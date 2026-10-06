# Balloon Darts sprites

Each PNG is drawn at 1:1 (one image pixel = one art pixel). The game scales them up with
crisp pixels and reads the files' width/height, so you can resize a sprite freely.

| File | Used for |
| --- | --- |
| `balloon-<color>.png` | Balloons: `pink`, `yellow`, `green`, `blue`, `purple` |
| `pop-burst-<color>.png` | Starburst when a balloon of that color pops |
| `balloon-string.png` | String hanging under each balloon |
| `dart.png` | The dart, tip pointing up |

Sizes are read from `balloon-pink.png` and `pop-burst-pink.png`, so keep each color's
variants the same size. The color list (and each color's main shade, used for the burst
shards) is `balloonColors` in `app.js`; to add a color, add a pair of PNGs and an entry there.

Use full opacity, no anti-aliasing, and stick to the
[NES palette](https://lospec.com/palette-list/nintendo-entertainment-system).

| Color | Light | Normal | Dark |
| --- | --- | --- | --- |
| pink | `#f8a4c0` | `#e40058` | `#a80020` |
| yellow | `#f8d878` | `#f8b800` | `#ac7c00` |
| green | `#b8f8b8` | `#00a800` | `#006800` |
| blue | `#a4e4fc` | `#0078f8` | `#0000fc` |
| purple | `#d8b8f8` | `#6844fc` | `#4428bc` |
