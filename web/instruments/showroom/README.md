# Showroom

Your work as tiles in 3D space. Add screenshots, landing pages, posters or any images, lay them
out as a grid wall, a cloud, a ring, a helix, a tunnel, a stack or a rippling wall, and move a
camera through them: drift, orbit, fly through, dive into one tile after another, or let the wall
pan and scroll past. Tiles take rounded corners, soft shadows, depth of field and a fade with
distance. Tall screenshots can scroll inside their tiles. Until you add images, sample work
(made-up sites and posters, drawn by the app) fills the room.

Open it at `/showroom/`.

## Driving it

- **The work.** Add images, or drop them anywhere on the page. They're kept in this browser
  (IndexedDB), and the patch names them. Tiles sets how many there are; with fewer images,
  images repeat. Show picks the top of a tall image (a landing page's hero) or its middle.
  Scroll pages moves down a tall image and back once a loop.
- **Arrangement.** The layout, then Gap, Depth, Scatter, Tilt and Size mix. Reroll gives a new
  shuffle and scatter from the seed. Turn X, Y and Z turn the whole arrangement; drag the preview
  to turn it.
- **Tiles.** Shape (each image's own, desktop, wide, 4:3, square, portrait, phone), Size,
  Corners (up to a pill or a circle), Shadow, Float and Spin.
- **Camera.** Move, then Zoom (scroll or pinch the preview), Lens (field of view), Look X and Y,
  Depth of field and Fade.
- **Vary** deals a new room: layout, move, spacing, tilt, lens and finish, keeping your images,
  format and background.
- Every number can be keyframed, as in Motion.

From code: `window.instrument` as in every instrument, e.g.
`instrument.setPatch({ params: { layout: "ring", move: "orbit", radius: 0.5 } })`.

## How it works

`showroom.js` is the engine. `arrange()` places each tile (position, rotation, size) from the
patch and its seed; `camera()` sets the view; `render()` draws with WebGL 2, because a 2D canvas
can't draw true perspective. Each tile is one quad. The rounded corners are cut in the fragment
shader with a signed distance, which also antialiases the edges. The image is fitted to cover
its tile. Depth of field samples coarser mipmaps away from the focus distance. Tiles are drawn
back to front. A tile seen from behind shows a plain card back. Fly through and Pan/Scroll wrap
tiles round, so they never run out.

The engine draws into its own WebGL canvas and copies the result into the 2D canvas the shell
gives it, so preview and exports share one path.

## How it was checked

- Every preset was rendered at two moments and looked at. Its frame at the very end of the loop
  matched its first frame within one level out of 255, and each moves mid-loop.
- All 49 combinations of layout and move render without error at the start, middle and end of
  the loop.
- With 8 real images added through the shelf, PNG, MP4, WebM and GIF were exported from the page
  in Chrome. FFprobe read 300 frames at 1920×1080 in each video. A frame decoded from the MP4
  matched the PNG. Exports took 4 to 14 seconds.
- Dragging the preview turned the arrangement and the scroll wheel zoomed.
- Phone (390 wide) and tablet (820 wide) layouts were looked at.
- MOV was made (117 MB for 10 seconds) but not yet decoded and checked, so it's marked untested.

## What it can't do yet

- Video files as tiles: images only for now.
- An embed for live websites.
- GPUs and drivers can round soft edges differently, by a level or so.
