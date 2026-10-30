# Carousel creator

Carousels from what you're trying to say. Write it, one paragraph a slide, and pick a layout
system; bring your own fonts, colours and images. Every slide comes out at the platform's size,
as PNGs, a PDF for LinkedIn, a moving slide, or the whole carousel as one video.

Open it at `/carousel/`.

## Writing

One slide per paragraph; leave a blank line between slides. Each paragraph is read for what it is:

- the first paragraph is the **cover**;
- lines starting `-` or `1.` make a **list**;
- a paragraph starting `>` is a **quote**;
- a short line alone (three words or fewer) is a **big word**;
- `[image]` places your next image (or `[image 2]`, the second), with the rest as a caption;
- `->` makes the **closing card**;
- anything else is a **statement**: the first line is the headline, the rest the text.

`*Stars*` mark emphasis: italic in Editorial, the accent colour in Swiss and Poster. Start a
paragraph with `#cover`, `#big`, `#list`, `#quote`, `#statement`, `#image` or `#end` to say what
it is outright.

## The systems

Drawn from a study of saved carousels, as principles rather than copies:

- **Editorial**: a serif with italic emphasis, a series line and signature framing every slide,
  numbered lists between hairlines, a thin diagram on statement slides, black-and-white pictures.
- **Poster**: capitals stacked like wood type, every line set to the full width, alternate lines
  in the accent, riso dots.
- **Tide**: full-bleed accent with drifting bands and a shape, the words broken between a
  condensed face at the top and an italic at the foot. With Panorama, the colour runs across
  every slide.
- **Zine**: typewriter text in cut-out label strips, a serif italic headline, arched pictures.
- **Notebook**: lowercase serif in the accent, small pictures, lots of air.
- **Swiss**: a six-column grid, big slide numbers, an accent block, bold sans.

Presets are the systems with fonts and colours; picking one keeps your words and images.

## Platforms

Instagram 4:5 (1080×1350) or 3:4 (1080×1440), square (1080×1080), LinkedIn document (4:5, as a
PDF), TikTok photo mode (1080×1920), Threads (4:5), a Substack cover (1456×1048), or any size.
The guides disagree on some limits (Threads, Instagram's 3:4); the help text says which.

## Exports

- **PNG, MP4, WebM, GIF** in the Print shop: the slide on the stage, or, with Stage shows set to
  the whole carousel, every slide in turn as one video (Seconds a slide sets the pace).
- **All slides (PNG)**: a .zip, numbered in order.
- **PDF for LinkedIn**: one page a slide, JPEG at 92%.
- Freeze frame sets the moment taken for stills: past halfway, everything has arrived.

## How it was checked

- Every preset's slides were rendered and looked at. That caught three problems, now fixed:
  Tide's gradient faded into the text colour, Zine and Notebook left their text small at the
  top, and Zine's list numbers broke across lines.
- In the page in Chrome, with two screenshots added: an image slide, All slides (an 8-file
  zip, 14.5 MB), the LinkedIn PDF (8 pages, 1.5 MB, opened by Quick Look) and the whole
  carousel as MP4 (480 frames, 16 s at 1080×1350, 1.8 MB).
- Phone layout looked at.

## What it can't do yet

- Two images on one slide, or text over a full-bleed picture.
- Per-slide colours or systems.
- Saving a brand to reuse. For now, Save in the Patch bay or Download .json keeps it.
