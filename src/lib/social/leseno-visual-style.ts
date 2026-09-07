/**
 * Canonical leseno visual system for social FLUX planning (gpt-oss style system).
 * Do NOT put website URLs here — models cannot see linked images; describe the look.
 */

export const LESENO_SOCIAL_STYLE_GUIDE = `leseno.de brand illustration system (match marketing art on the site):

ART STYLE
- Clean modern 2D digital illustration (children's book / edtech character art)
- Soft gradients, gentle glow/bloom around light sources, smooth shading
- Cream / warm off-white backgrounds OR lived-in rooms with cream walls
- Subject fills a square social crop
- NOT photorealistic, NOT stock photo, NOT 3D CGI, NOT watercolor wash, NOT manga

COLOR PALETTE (strict — name these colors in every brief)
- Hero orange: vivid warm orange (brand phoenix / orange-700 energy)
- Golden yellow for magical glow and highlights
- Cream / warm off-white surfaces
- Warm brown skin/hair accents; freckles when drawing the familiar kid look
- Optional deep navy only as hoodie/clothing contrast
- Avoid cool cyan, teal, purple neon, grey corporate stock looks

SCENES (critical — avoid boring book-portrait defaults)
- Show a FULL situation: place + action + relationship energy
- Good: sofa adventure, blanket fort, kitchen-table storytelling, park picnic, bedtime chaos, backyard flashlight quest, bus-seat reading bubble, dramatic parent performance reading
- Book is a PROP inside the scene, not the only subject
- Prefer 2–4 figures or rich environment — not a lone kid staring at a closed book
- Motion, expressions, lived-in details (cushions, toys, lamp, window, tea)

CHARACTERS
- Kids about 7–11; vary gender and appearance — do NOT always draw the same boy
- Familiar leseno kid vibe when it fits: messy dark-brown hair, freckles, large expressive eyes
- Simple solid hoodies (orange or navy), no logos or writing on clothes
- Parents/siblings/pets welcome when the caption fits

MOTIFS (only when they fit — not every post)
- Book as warm internal light / soft portal
- Stylized phoenix/bird of orange–gold flame shapes
- Soft sparkles, four-point stars, floating ember dots
- Lightning-bolt as a pure graphic shape (never letters)

NEVER
- Readable text, letters, numbers, book titles, signs, UI, watermarks, logos
- Dark horror, school-drill classroom pressure as the main vibe
- Static “kid holds book to camera” portrait as the whole idea
- Dumping random blue/green worlds that fight the orange brand`;

/** Short lock appended on the FLUX pixel prompt. */
export const LESENO_FLUX_PALETTE_LOCK =
  "Brand palette: warm orange and golden yellow on cream, soft glow, lively full situation, illustrated 2D digital art — not photorealistic, not a static book portrait.";
