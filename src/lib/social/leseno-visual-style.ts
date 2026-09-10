/**
 * Canonical leseno visual system for social image planning (Gemini → FLUX/Gemini Image).
 * Typography (Winkel title) is composited afterwards in Nunito — do NOT ask the model to paint text.
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
- Leave a slightly calmer lower third (soft dark area / less busy) so a later text overlay can sit there

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
- Static "kid holds book to camera" portrait as the whole idea
- Dumping random blue/green worlds that fight the orange brand`;

/** Short lock appended on the social pixel prompt — keep warm leseno.de look. */
export const LESENO_FLUX_PALETTE_LOCK =
  "leseno.de look: soft warm 2D digital illustration, gentle gradients and bloom, cream / warm off-white base, vivid warm orange and golden yellow highlights, cozy family energy, smooth shading — not photorealistic, not stock photo, not cool cyan/teal/purple, not muddy grey, not a static book portrait.";

/**
 * Marketing posts: same character & illustration craft as Winkel (recognition),
 * but bolder composition energy — never a photo/illustration hybrid.
 */
export const LESENO_MARKETING_STYLE_GUIDE = `leseno.de marketing illustration system (product social ads with the SAME characters as Winkel posts):

ART STYLE (critical — match Winkel craft 1:1 for people & props)
- Same clean modern 2D digital illustration as Winkel posts (children's book / edtech character art)
- Same soft gradients, gentle glow/bloom, smooth shading — professional, not a different art pipeline
- Same cream / warm off-white worlds and lived-in rooms — NOT photorealistic backgrounds
- NEVER mix photo backgrounds with illustrated cutouts (looks cheap and breaks the brand)
- Marketing difference is ENERGY + COMPOSITION, not a new art style or medium

CHARACTERS (recognition lock — must match Winkel posts)
- Lead with the familiar leseno kid when a child is the hero: messy dark-brown hair, freckles, large expressive eyes
- Same age band (~7–11), same simple solid hoodies (orange or navy), no logos or writing on clothes
- Parents/siblings/pets welcome in the same illustrated style
- Expressions: delighted / triumphant / curious — still the SAME face design, just happier staging
- Do NOT invent a flatter, more “poster-mascot” or differently styled child

COLOR PALETTE (same brand, amp the joy)
- Hero orange: vivid warm orange (brand phoenix / orange-700 energy) — use generously
- Bright golden yellow highlights, glows, and sunbursts
- Cream / warm off-white surfaces
- Optional deep navy as clothing / graphic contrast
- Avoid cool cyan, teal, purple neon, grey corporate SaaS looks

COMPOSITION (what makes it marketing)
- One clear product metaphor / benefit scene — bold and readable at a glance
- Stronger staging than cozy Winkel: glowing portals, floating icon clusters as shapes (no text), light ribbons, oversized joyful props
- Subject fills a square social crop edge-to-edge
- Leave a slightly calmer upper band for a title card and a quiet lower strip for a brand bar
- Feels like a fun product moment starring OUR kid — never a hard-sell billboard collage

NEVER
- Photoreal / stock photo / DSLR backgrounds with illustrated figures on top
- Readable text, letters, numbers, logos, URLs, UI labels, book titles
- A differently drawn child that does not match the Winkel hero look
- Horror, school-pressure, or cold tech dystopia`;

/** Palette lock for marketing — same craft as Winkel, louder staging. */
export const LESENO_MARKETING_FLUX_PALETTE_LOCK =
  "leseno.de marketing look: SAME soft warm 2D digital illustration craft as Winkel posts (gentle gradients, bloom, cream base), familiar freckled messy-hair kid hero in orange or navy hoodie, vivid warm orange and bright golden yellow energy, joyful product-benefit staging — not photorealistic, not stock photo background with illustrated cutouts, not a differently styled mascot, not cool cyan/teal/purple.";
