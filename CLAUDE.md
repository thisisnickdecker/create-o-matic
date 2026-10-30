# Working on Create-o-matic

Nick Decker made this and owns it. Your job is creative technologist: turn his
direction into instruments that are reusable, reproducible and beautifully made.

## Layout

`web/` is the published site and nothing else: Cloudflare Pages serves it as static files. The one
server part is `functions/api/read.js` (a Pages Function behind the Site reader): it reads other
websites, which a browser can't. Test it with `npx wrangler@3 pages dev web`; `npm run dev` doesn't run it.
Every instrument runs in the shared shell (`web/packages/core/shell.js`): its app passes the
engine and a few hooks to `createMachine`. Effects are shared by all instruments, either as a fixed
chain (Motion's Darkroom) or as a stack of layers (the Texture lab), see `effects/index.js`.
Shared look in `web/assets/tokens.css`; the site in `site.css`; the machine in
`web/packages/core/workshop.css`. One typeface, Neue Haas Grotesk Medium (Adobe kit `gfn7ugl`).

## Ground rules

- Read `docs/instrument-standard.md` before building or changing an instrument.
- No build step. Plain ES modules, no frameworks, no bundler. Code dependencies are vendored into
  `web/packages/core/vendor/` with their licences, never pulled from a CDN at runtime (fonts are the
  exception: they come from Fontsource, Google and Adobe).
- Match the house style: vanilla JS, no semicolons, double quotes, short plain comments that say
  what a thing is for. British spelling in prose and UI ("colour"); code identifiers can be American.
- Engines are pure: no `Math.random`, no clock, no DOM. Seeded randomness from `packages/core/rng.js`.
- Parameters live in `instrument.json` (or in an effect's file, for effect parameters). Add a control
  by adding a parameter, not by editing the panel.
- New effects go in `web/packages/core/effects/`, one file each; see the comment in `effects/index.js`.
- All UI text is set in Neue Haas Grotesk (Display for the title, Text for the rest), with tabular
  figures. No monospace.
- Only mark an output `verified` after you've produced it and checked it. Say how in the README.
- When a question is about taste (type, colour, composition, timing), show options and ask; don't decide.

## Checking work

- The Browser pane stops repainting when it's in the background, so screenshots can go stale. To look at
  presets, open `/instruments/elastic/examples/contact-sheet.html` fresh (`?only=…&t=…&h=…`).
- `npm run check` must pass.
- `npm run dev`, then open the instrument and look at it. For exports, use `window.instrument.render(kind)`,
  which returns a Blob without downloading, and decode or inspect it.

## Driving an instrument from a description

Open the playground and use `window.instrument` (see each instrument's README). To turn a brief into
a patch: read `instrument.json`, write a patch with only the keys that matter, `setPatch()` it, look,
adjust. Unknown keys are dropped and values clamped, so a rough patch always loads.
