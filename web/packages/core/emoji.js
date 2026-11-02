// Emoji from Noto Emoji (Google, Apache 2.0), vendored as SVG in vendor/noto-emoji: a set chosen
// for small businesses saying something (food, drink, parties, signs, faces, nature, things).
// Drawn from their own files, so every browser and every export shows the same emoji.
//   EMOJI          [{ char, hex, name, group }]
//   emojiOf(text)  the emoji in a string, in order, as entries (characters not in the set are skipped)
//   loadEmoji(hex) a promise of an <img> ready to draw
export const EMOJI_GROUPS = [["food", "Food"], ["drink", "Drink"], ["party", "Party"], ["sign", "Signs"], ["face", "Faces"], ["nature", "Nature"], ["thing", "Things"]]

const LIST = [
  ["1f354", "burger", "food"], ["1f35f", "fries", "food"], ["1f355", "pizza", "food"], ["1f32e", "taco", "food"], ["1f32d", "hot-dog", "food"], ["1f950", "croissant", "food"], ["1f369", "doughnut", "food"], ["1f370", "cake", "food"], ["1f9c1", "cupcake", "food"], ["1f366", "ice-cream", "food"], ["1f36a", "cookie", "food"], ["1f968", "pretzel", "food"], ["1f35c", "noodles", "food"], ["1f363", "sushi", "food"], ["1f957", "salad", "food"], ["1f373", "egg", "food"], ["1f951", "avocado", "food"], ["1f34b", "lemon", "food"], ["1f353", "strawberry", "food"], ["1f352", "cherries", "food"], ["1f351", "peach", "food"], ["1f349", "watermelon", "food"], ["1f34d", "pineapple", "food"], ["1f34c", "banana", "food"], ["1f336", "chilli", "food"], ["1f9c0", "cheese", "food"], ["1f956", "baguette", "food"], ["1f96f", "bagel", "food"], ["1f955", "carrot", "food"],
  ["1f378", "cocktail", "drink"], ["1f379", "tropical", "drink"], ["1f37a", "beer", "drink"], ["1f37b", "cheers", "drink"], ["1f377", "wine", "drink"], ["1f942", "clink", "drink"], ["1f37e", "bubbly", "drink"], ["2615", "coffee", "drink"], ["1f9cb", "bubble-tea", "drink"], ["1f964", "soda", "drink"], ["1f375", "tea", "drink"], ["1f9ca", "ice", "drink"],
  ["1f389", "party", "party"], ["1f38a", "confetti", "party"], ["1f388", "balloon", "party"], ["1f381", "gift", "party"], ["1f382", "birthday", "party"], ["1faa9", "mirror-ball", "party"], ["1f3b6", "notes", "party"], ["1f3a4", "mic", "party"], ["1f3a7", "headphones", "party"], ["1f3b8", "guitar", "party"], ["1f57a", "dancer", "party"], ["1f483", "dancing", "party"], ["1f39f", "ticket", "party"], ["1f3c6", "trophy", "party"],
  ["2728", "sparkles", "sign"], ["1f525", "fire", "sign"], ["2b50", "star", "sign"], ["1f31f", "glowing-star", "sign"], ["1f4a5", "boom", "sign"], ["2764", "heart", "sign"], ["1f496", "sparkle-heart", "sign"], ["1f4af", "hundred", "sign"], ["26a1", "zap", "sign"], ["1f4ab", "dizzy", "sign"], ["1f4ac", "speech", "sign"], ["1f440", "eyes", "sign"], ["1f449", "point", "sign"], ["1f44d", "thumbs-up", "sign"], ["1f64c", "hands-up", "sign"], ["1f44f", "clap", "sign"], ["270c", "peace", "sign"], ["1f918", "rock-on", "sign"], ["1faf6", "heart-hands", "sign"], ["1f4b8", "money-wings", "sign"], ["1f4b0", "money-bag", "sign"], ["1f3f7", "tag", "sign"], ["1f6cd", "shopping", "sign"], ["1f6d2", "trolley", "sign"], ["1f4e3", "megaphone", "sign"], ["1f4cd", "pin", "sign"], ["1f4c5", "calendar", "sign"], ["23f0", "alarm", "sign"], ["1f195", "new", "sign"], ["1f193", "free", "sign"],
  ["1f60d", "heart-eyes", "face"], ["1f929", "star-struck", "face"], ["1f60e", "cool", "face"], ["1f973", "party-face", "face"], ["1f60b", "yum", "face"], ["1f924", "drool", "face"], ["1f631", "scream", "face"], ["1fae0", "melting", "face"], ["1f643", "upside-down", "face"], ["1f610", "deadpan", "face"], ["1f92f", "mind-blown", "face"], ["1f480", "skull", "face"], ["1f47b", "ghost", "face"], ["1f47d", "alien", "face"], ["1f916", "robot", "face"], ["1f441", "eye", "face"],
  ["1f338", "blossom", "nature"], ["1f33b", "sunflower", "nature"], ["1f337", "tulip", "nature"], ["1f339", "rose", "nature"], ["1f33f", "herb", "nature"], ["1f340", "clover", "nature"], ["1f308", "rainbow", "nature"], ["2600", "sun", "nature"], ["1f319", "moon", "nature"], ["1f30a", "wave", "nature"], ["1f335", "cactus", "nature"], ["1f344", "mushroom", "nature"], ["1f490", "bouquet", "nature"], ["1f436", "dog", "nature"], ["1f431", "cat", "nature"], ["1f438", "frog", "nature"], ["1f984", "unicorn", "nature"],
  ["2702", "scissors", "thing"], ["1f488", "barber", "thing"], ["1f485", "nails", "thing"], ["1f56f", "candle", "thing"], ["1fab4", "plant", "thing"], ["1f4da", "books", "thing"], ["1f3a8", "palette", "thing"], ["1f9f6", "yarn", "thing"], ["1f6b2", "bike", "thing"], ["1f680", "rocket", "thing"], ["1f6f9", "skateboard", "thing"], ["1f48e", "gem", "thing"], ["1f511", "key", "thing"],
]
export const EMOJI = LIST.map(([hex, name, group]) => ({ hex, name, group, char: String.fromCodePoint(parseInt(hex, 16)) }))
const byChar = new Map(EMOJI.map((e) => [e.char, e]))

// Variation selectors (U+FE0F) are dropped, so "❤️" and "❤" are the same heart.
export function emojiOf(text) {
  const out = []
  for (const ch of String(text || "").replace(/\uFE0F/g, "")) { const e = byChar.get(ch); if (e) out.push(e) }
  return out
}

const cache = new Map()
export function loadEmoji(hex) {
  if (!cache.has(hex)) cache.set(hex, new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = new URL(`./vendor/noto-emoji/${hex}.svg`, import.meta.url).href
  }))
  return cache.get(hex)
}
