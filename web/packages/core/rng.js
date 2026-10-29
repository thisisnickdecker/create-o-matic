// Seeded randomness. Nothing in an instrument calls Math.random: every "random" choice comes from
// the patch's seed, so the same patch always makes the same picture.

// A small, fast generator: mulberry32. rng() returns a float in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// A stateless hash of up to four integers to [0, 1). Use it when the answer must depend only on
// where you are (a cell, a pixel, a frame), not on how many numbers were drawn before.
export function hash(a, b = 0, c = 0, d = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1) ^ Math.imul(d | 0, 0x85ebca77)
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d)
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39)
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296
}

export const newSeed = () => (Math.random() * 1e9) | 0
