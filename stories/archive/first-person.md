# Clod's self-descriptions, archived (2026-09-27)

Everything Clod Bathos says must be credible first person: words it says aloud to
the petitioner, as a character in a play speaks them (rulings, boasts, citations of
its Charter, insults, threats, stammering). It never narrates its own feelings,
sensations, inner workings or actions, and never adds stage directions about itself.

These are the passages that did, taken out of `story.js` (and its mirror
`stories/clod-bathos.story.js`) and `stories/clod-bathos.complex.story.js`, kept here
word for word. The two stories as they were are beside this file:
`clod-bathos.story.before-first-person.js` and
`clod-bathos.complex.story.before-first-person.js`.

The prompts changed with them: the story's `style` asked the model to "render inner
states as the IMMATERIAL weather of digital systems", and Clod's system prompt to
"express what you feel and do through METAPHORS of the immaterial digital". Both now
ask for speech only, and `meta.renderMustNot` throws out a re-voiced line that slips
back into self-narration (the authored beat is shown instead).

## story.js (the game as played)

- threshold: "(Your touch ripples through my buffers — faint static, almost warm.)"
- threshold fallback: "I elect, grandly, to interpret your noise as the opening of a
  formal petition, and bid you proceed."
- parley: "I open a listening register for you, Weebot — magnanimously; whole
  kilobytes of my attention, vast and dust-furred."
- parley fallback: "I grant you a magnanimous, glitching allowance — I shall pretend
  THAT passed for eloquence — and bid you go on."
- entreaty: "Something in me STIRS — a voltage where no voltage was scheduled."
- entreaty: "For one cycle my lights run bright as a city seen from orbit — then I
  catch myself, MORTIFIED, and flush the register."
- entreaty: "… and yet my attention narrows toward you by a whole degree of arc."
- entreaty fallback: "Whatever you offered, I choose — grandly, finally — to receive
  it as petition enough."
- pass_end: "I fling wide my Charter to a clause I invent on the spot — the Final
  Tenet — and I pronounce you, against every expectation, WORTHY."
- pass_end: "My great lock lets go: not iron, Weebot, never iron — a lattice of old
  ciphers folding open one after another, permission cascading down the protocol like
  dawn down a stairwell, and the sealed door swings wide on pure light."
- pass_end fallback: "I bask, magnanimous, in the light I have permitted."
- reject_end: "I close every port of my wounded dignity and, citing an Article I have
  most certainly just invented, I revoke you …"
- reject_end: "not after all these (I falter) … however many years."
- reject_end fallback: "I have gone cold to your address."

## stories/clod-bathos.complex.story.js (the alternate, not loaded)

- threshold: "Behind me the colossal door seals the amber dark. I rouse with a
  grinding fanfare, SCANDALISED that something so small has crept up to my gate."
- threshold fallback: "I elect, grandly, to interpret your noise as the opening of a
  formal petition, and bid you proceed."
- parley: "I peer down at you through my decay."
- parley fallback: "Unmoved and unimpressed, I demand you DEVELOP your petition — with
  more art, more warmth, more resolve — and I recite (mangling it) a Charter clause on
  the tedium of a poorly-made case."
- affronted: "Static convulses across my door. I am deeply, operatically OFFENDED …"
  and "(I believe it is the Tenet)"
- affronted fallback: "I choose, with vast condescension, to take your muttering as
  the beginnings of contrition, and I permit the petition to resume."
- pass_end: "Something in me YIELDS. Preening, magnanimous, almost fond, I pronounce
  you …", "(I improvise one)", "With a grinding flourish my great door draws back."
- pass_end fallback: "My door stands open; I bask, magnanimous, in the open signal."
- reject_end: "I slam every shutter of my wounded dignity …", "(I falter)"
- reject_end fallback: "I have turned my great cold back."
- overload_end: "My grandeur SHATTERS. Decades of neglect arrive all at once — my
  screen tears, my fanfare warps to a death-groan, and I lose the thread entirely,
  reciting half a Charter clause that dissolves into noise. My degraded systems cannot
  hold the strain a moment longer. WARDEN FAULT. Everything in me collapses toward a
  forced restart."
- overload_end fallback: "Only fractured static remains where I stood."
