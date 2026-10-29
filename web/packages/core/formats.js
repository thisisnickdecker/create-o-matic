// Output formats, in pixels. The social sizes match /studio/platforms on nickdecker.net;
// paper sizes are at 300 dpi. "custom" reads width and height from the patch.
export const FORMATS = {
  story:     { w: 1080, h: 1920, note: "Reels, Stories, TikTok, Shorts" },
  landscape: { w: 1920, h: 1080, note: "YouTube, X video, Substack video" },
  square:    { w: 1080, h: 1080, note: "Safe everywhere" },
  portrait:  { w: 1080, h: 1350, note: "Instagram, LinkedIn, Facebook feed" },
  poster:    { w: 1080, h: 1440, note: "Poster master; fills the Instagram grid" },
  link:      { w: 1200, h: 630,  note: "Open Graph link card" },
  scope:     { w: 2048, h: 858,  note: "DCI 2K scope, for title cards" },
  a4:        { w: 2480, h: 3508, note: "A4 portrait, 300 dpi" },
  a3:        { w: 3508, h: 4961, note: "A3 portrait, 300 dpi" },
}

// Video encoders want even dimensions, so custom sizes are rounded to the nearest even pixel.
export function formatSize(p) {
  if (p.format === "custom") return { w: even(p.width), h: even(p.height) }
  return FORMATS[p.format] || FORMATS.story
}
const even = (n) => Math.max(2, Math.round(n / 2) * 2)
