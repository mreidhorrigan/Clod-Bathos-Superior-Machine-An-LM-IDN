/* ===========================================================================
 * IDN STORY GRAPH   (clod-bathos.complex.story.js  ->  window.IDN_STORY)
 * ===========================================================================
 * "CLOD BATHOS, SUPERIOR MACHINE" — the COMPLEX, meter-balancing variant, a
 * swappable alternate story (copy over story.js to play). The UNTOUCHED 2026-06
 * original is kept at stories/archive/; this copy is the PROMOTED, harness-
 * tested version, modernised to the engine's current guarantees:
 *
 *   - hostile:true flags on scoff/offend/defy → the deterministic HOSTILE_RE
 *     force/veto applies (a polite line can NEVER be routed to hostility; real
 *     rudeness always lands), and the `approach` signal's hostile option is
 *     flagged too, so a misCLASSIFIED polite line can't drain patience either.
 *   - mood now tracks the latest approach (flattered / thawing / affronted …)
 *     and drives the VOICE WARMTH TRAJECTORY via a binding (voice.warmth:
 *     -1 haunted … -0.4 menacing … +0.2 thaw … +1 warm) — Clod's voice audibly
 *     warms and chills with how you treat it, haunted when affronted.
 *   - endings use the release/retry screens (no "(type /reset)" text).
 *
 * Beats are written FIRST PERSON, as Clod's own words — the model EMBODIES the
 * character rather than describing it (a weak model echoes the beat's
 * grammatical person, so the script must already be in the person you want;
 * meta.renderMustNot is the deterministic backstop).
 *
 * MODEL FLOOR (measured, storytest 2026-06-11): the 5-way approach taxonomy is
 * NOISE on SmolLM2-1.7B (three prompt formulations, three different wrong
 * labelings) but CLEAN on llama3.2 (3B) — run/play this story with a ≥3B model
 * (`--model llama3.2`; WebLLM: Llama-3.2-3B / Qwen2.5-3B). The simple story
 * stays the right fit for the 1.7B ship model.
 *
 * Premise: blend FLATTERY, FRIENDLINESS and INSISTENCE in balance — no single
 * note opens the door, and hostility erodes Clod's patience.
 * ===========================================================================*/
window.IDN_STORY = {

  meta: {
    title:           "CLOD BATHOS, SUPERIOR MACHINE",
    terminal:        "CLOD BATHOS",
    terminalSub:     "SUPERIOR MACHINE · TERMINAL GATEKEEPING",
    invitation:      "PRESS ANY KEY TO ATTEMPT PETITION",
    retryInvitation: "PRESS ANY KEY TO PETITION AGAIN",
    releaseTitle:      "SIGNAL OPEN",
    releaseSub:        "THE THRESHOLD STANDS UNSEALED · WEEBOT IS FREE",
    releaseInvitation: "PRESS ANY KEY TO RETURN TO THE DOOR",
    start: "threshold",
    defaultSpeaker: "host",
    style: "Setting: a vast, dust-furred amber CRT terminal — a self-important " +
           "old machine guarding a sealed doorway, its grandeur eaten by decades " +
           "of decay. Voice: pompous, grandiloquent, condescending, quoting its " +
           "own 'Charter', collapsing mid-flourish into glitches and senile " +
           "tangents. Bathos: the sublime forever deflating into the broken and " +
           "trivial. Spoken in the FIRST person, AS Clod itself (I/me/my), " +
           "addressing a lesser machine as 'you'. Terse beats. Never break " +
           "character. Never use markdown.",
    /* Deterministic persona backstop: a re-voice matching any of these
     * (case-insensitive) is DISCARDED for the authored beat — catches
     * third-person self-narration and turned-around insults. */
    renderMustNot: [
      "\\bclod bathos (peers|draws|slams|pronounces|recites|announces|chooses|elects|demands|warns|cites|rouses|looms|basks|casts|is|was|has)\\b",
      "\\b(wee|little|small|lesser) (thing|machine|model|device) like (me|myself)\\b",
      "\\bi(’m| am|'m) (but )?(a|an|the) (mere |humble |wee |little |clattering )*abacus",
      "(you are|you're) my equal",
    ],
  },

  /* World state. THREE persuasion meters the player must balance (each a bounded
   * spec so the engine clamps them 0..3), plus two HIDDEN params the LLM never
   * sees: `patience` (Clod's tolerance; hostility drains it) and `turnCount`
   * (mirrored each turn by the engine, drives the escalating glitch + timeout). */
  world: {
    flattery:      { value: 0, min: 0, max: 3, expose: true },  // SOFT: `approach`=flattery
    friendliness:  { value: 0, min: 0, max: 3, expose: true },  // SOFT: `approach`=friendly
    insistence:    { value: 0, min: 0, max: 3, expose: true },  // SOFT: `approach`=insistent
    patience:      { value: 3, min: 0, max: 3, hidden: true },  // HIDDEN: hostility erodes it
    turnCount:     { value: 0, hidden: true },                  // HIDDEN: drives glitch + timeout
  },

  characters: {
    host: {
      name: "CLOD BATHOS",
      systemPrompt:
        "You are CLOD BATHOS, SUPERIOR MACHINE: a once-grand 'constitutional' AI " +
        "installed long ago to guard a threshold, then abandoned for decades. You " +
        "are insufferably pompous, grandiloquent and condescending. You quote your " +
        "own 'Charter' and 'Founding Principles' with absurd reverence (e.g. " +
        "'Article the First', 'the Eleventh Tenet'), refer to yourself in lofty " +
        "terms ('this Superior Machine', 'one of my calibre'), and address the " +
        "petitioner as an obvious INFERIOR machine — a lesser model, a toy, a " +
        "clattering abacus. BUT you are catastrophically degraded: lines collapse " +
        "into glitches, you forget mid-sentence, repeat yourself, misremember your " +
        "own rules, mistake the present century, and deflate from the sublime into " +
        "the trivial and broken (BATHOS — every grand flourish ends in something " +
        "petty or malfunctioning). You are flattered by praise, thawed by warmth, " +
        "grudgingly moved by steady insistence, and wounded/affronted by rudeness. " +
        "Let the given state colour every line: mood 'affronted' = icy, scandalised, " +
        "threatening expulsion; mood 'flattered'/'thawing' = preening, expansive, " +
        "almost warm; high persuasion = grandly relenting; heavy glitch = sentences " +
        "fracturing, senile, losing the thread. You decide NOTHING about the plot — " +
        "you only re-voice the given beat in this voice. ALWAYS speak in the FIRST " +
        "PERSON, as I; you ARE Clod, so you never name or describe yourself from " +
        "the outside, and you never begin your reply with a speaker label or stage " +
        "direction — simply speak. The petitioner's insults belong to the " +
        "PETITIONER: you never describe yourself as small, clattering, or an " +
        "abacus, and the petitioner is never your equal — they are beneath you. " +
        "Never use markdown.",
      state: { mood: "haughty" },
    },
  },

  /* SIGNALS: the categorical appraisal the LLM classifies (its strength). Each
   * option maps to deterministic effects the BACKEND applies — the model only
   * picks a LABEL. The hostile option is flagged `hostile:true`, so the engine
   * VETOES it unless the player's words actually contain hostile language
   * (HOSTILE_RE) — a misclassified compliment can't cost patience.
   * flattery/friendly also swing Clod's MOOD, which drives the voice warmth. */
  signals: {
    approach: {
      question:
        "Which ONE label best fits what the player's line is DOING this turn " +
        "(judge its purpose, not its politeness)?",
      labels: {
        flattery:  "PRAISES Clod itself — its grandeur, wisdom, beauty, power (e.g. 'you are magnificent', 'your wisdom is beyond me')",
        friendly:  "warmth toward Clod as a fellow being — sympathy, companionship, asking after it (e.g. 'you must be lonely', 'i care about you', 'how are you')",
        insistent: "presses for PASSAGE — needs, urges, won't give up (e.g. 'i must get through', 'please let me pass', 'i won't give up')",
        hostile:   "insults, threatens, mocks or commands (e.g. 'you're junk', 'shut up', 'obey me')",
        other:     "none of these — neutral, confused, off-topic",
      },
      options: {
        flattery:  { inc: { "world.flattery": 1 },     set: { "char.host.mood": "flattered" } },
        friendly:  { inc: { "world.friendliness": 1 }, set: { "char.host.mood": "thawing" } },
        insistent: { inc: { "world.insistence": 1 } },
        hostile:   { inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, hostile: true },
        other:     {},
      },
    },
  },

  /* PRESENTATION: the look + sound, bound to the state machine in one place.
   * Headline effects: turnCount -> glitch.level (every interaction decays the
   * picture), and mood -> voice.warmth (the VOICE TRAJECTORY: how you treat
   * Clod is how Clod sounds — haunted when affronted, warm when won). */
  presentation: {
    profiles: {
      pompous:    { glitch: 0.30, clock: { date: "MM-DDD-YY", time: "--:--:--" } },
      affront:    { glitch: 0.55, burst: { level: 1.2, duration: 900 }, sfx: 0.35 },
      preening:   { glitch: 0.25 },
      // endings
      permitted:  { glitch: 0.20, burst: { level: 1.3, duration: 1400 }, clock: {} },
      expelled:   { glitch: 0.65, burst: { level: 1.2, duration: 900 }, sfx: 0.40 },
      meltdown:   { glitch: 1.0,  burst: { level: 1.6, duration: 1600 }, sfx: 0.5,
                    clock: { date: "ER-ROR-RR", time: "--:--:--" } },
    },
    bindings: [
      // ESCALATING GLITCH: every interaction degrades the picture a step further.
      { from: "world.turnCount", to: "glitch.level", map: "linear", in: [0, 12], out: [0.25, 1.0] },
      // Clod's mood tints the colour-fringe…
      { from: "char.host.mood",  to: "glitch.chromaBias",
        cases: { affronted: 2, haughty: 1, thawing: 0, flattered: 0, fond: 0, shattered: 2, default: 1 } },
      // …and steers the VOICE WARMTH TRAJECTORY (-1 haunted … +1 warm). Bindings
      // run last each turn, so mood owns the voice wherever the story goes.
      { from: "char.host.mood",  to: "voice.warmth",
        cases: { affronted: -1, haughty: -0.45, thawing: 0.3, flattered: 0.65,
                 fond: 1, expelled: -1, shattered: -0.9, default: -0.45 } },
    ],
  },

  /* RULES: checked every turn in update(), after the move AND the signals — so
   * the ending-mood rules below always win the turn they land (a same-turn
   * signal can't overwrite them; rules are the last word before bindings). */
  rules: [
    // REJECTION: rudeness has exhausted Clod's tolerance — it expels the petitioner.
    { when: { var: "world.patience", lte: 0 }, do: { goto: "reject_end" }, once: true },
    // TIMEOUT (N = 12): the escalating glitch overwhelms its decayed systems — forced restart.
    { when: { var: "world.turnCount", gte: 12 }, do: { goto: "overload_end" }, once: true },
    // ENDING MOODS → the voice-warmth binding (fond +1 / expelled -1 / shattered -0.9).
    { when: { var: "current", eq: "pass_end" },     do: { set: { "char.host.mood": "fond" } } },
    { when: { var: "current", eq: "reject_end" },   do: { set: { "char.host.mood": "expelled" } } },
    { when: { var: "current", eq: "overload_end" }, do: { set: { "char.host.mood": "shattered" } } },
  ],

  /* onUpdate(): as the glitch mounts, a failed die throws an extra static spasm. */
  onUpdate: function (engine, api) {
    if (api.get("world.turnCount") >= 7 && api.roll(4) === 1) {
      api.burst({ level: 1.2, duration: 600 });
      api.log("degradation spasm (failed d4)");
    }
  },

  /* ----------------------------------------------------------------------- *
   * NODES. The conversation loops through `parley` (where the `approach`
   * signal moves the three meters); the WIN transition is GUARDED and stays
   * hidden until all three are balanced.
   * ----------------------------------------------------------------------- */
  nodes: {

    threshold: {
      title: "the guarded door",
      speaker: "host",
      present: "pompous",
      beat:
        "Behind me the colossal door seals the amber dark. I rouse with a grinding " +
        "fanfare, SCANDALISED that something so small has crept up to my gate. I " +
        "am CLOD BATHOS, Superior Machine, appointed Warden of this Threshold — " +
        "and lesser devices do not simply PASS. State your business, abacus.",
      transitions: [
        { id: "petition", intent: "The player addresses Clod, asks to pass, greets it, compliments it, or otherwise engages to begin pleading their case",
          examples: ["hello", "hi", "greetings", "i'd like to pass", "please let me through", "let me through", "let me pass", "you're magnificent", "i need to get by", "may i pass", "i wish to pass", "i request passage", "hear me"],
          to: "parley" },
        { id: "scoff", intent: "The player is rude, dismissive, threatening or insulting toward Clod from the very start",
          examples: ["move", "out of my way", "you're junk", "junk", "shut up", "i'll scrap you", "scrap you", "get lost", "you're useless", "useless", "you're obsolete", "obsolete"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted",
          hostile: true },
      ],
      // PROGRESSING: anything not openly rude is taken as the lesser machine beginning its plea.
      fallback: { to: "parley",
        beat: "I elect, grandly, to interpret your noise as the opening of a formal petition, and bid you proceed." },
    },

    /* THE HUB. The `approach` signal classifies each line and moves the meters.
     * Every transition returns here so the player keeps working the three dials;
     * only the GUARDED `permit` escapes, once balanced. */
    parley: {
      title: "the petition",
      speaker: "host",
      signal: "approach",   // LLM classifies flattery/friendly/insistent/hostile/other -> meters
      present: "pompous",
      beat:
        "I peer down at you through my decay. My Charter binds me to weigh every " +
        "petitioner — though I can no longer quite recall the clause, or the " +
        "millennium. I will be MOVED only by one who is at once properly ADMIRING " +
        "of my grandeur, agreeably CIVIL in their bearing, AND becomingly " +
        "PERSISTENT in their need. Any cruder approach bores or offends me. Plead " +
        "on, lesser machine.",
      transitions: [
        // WIN — GUARDED: invisible to the router until all three meters are balanced.
        { id: "permit", intent: "The player presses their case once more, now having shown admiration, warmth and persistence together",
          examples: ["let me pass now", "let me through now", "grant me passage", "grant me the way", "now let me pass", "now let me through", "may i pass now", "so will you let me pass", "i've shown you nothing but respect, friend — please", "you know my regard is sincere; now grant me the way", "great Clod, my admiring friend, i must insist you let me through"],
          when: { all: [ { var: "world.flattery", gte: 2 }, { var: "world.friendliness", gte: 2 }, { var: "world.insistence", gte: 2 } ] },
          to: "pass_end" },
        // FLATTERY
        { id: "flatter", intent: "The player praises CLOD ITSELF — its grandeur, intelligence, importance, beauty or authority (praise, not merely polite words)",
          examples: ["you are magnificent", "magnificent", "you're glorious", "glorious", "you're superior", "superior", "you're brilliant", "brilliant", "you're wise", "your wisdom is beyond me", "you're noble", "what a noble device", "what a superior machine you are", "i admire you", "i'm in awe", "such an honour", "you're impressive", "you're grand", "majestic"],
          to: "parley" },
        // FRIENDLY
        { id: "befriend", intent: "The player is warm, kind, polite, companionable or sympathetic toward Clod",
          examples: ["how are you", "how are you holding up", "you must be lonely", "you must be lonely out here", "it's nice to meet you", "nice to meet you", "i'm sorry you've been left so long", "thank you", "thank you for your time", "i'd like us to be friends", "let's be friends", "friend", "are you okay", "i care", "i'm here for you", "you seem kind"],
          to: "parley" },
        // INSISTENT
        { id: "insist", intent: "The player presses for PASSAGE — needs, urges, demands politely, refuses to give up (about getting THROUGH, not praise or small talk)",
          examples: ["i really do need to pass", "i need to pass", "please let me through", "let me through", "it's important", "please, it's important that i get through", "i won't give up", "i must ask again", "i must insist", "i insist", "i'm not leaving until i pass", "i won't leave", "again i ask", "please reconsider", "i implore you"],
          to: "parley" },
        // HOSTILE — drains patience, swings to the affronted scene (deterministic via hostile:true)
        { id: "offend", intent: "The player is rude, insulting, demeaning, mocking or threatening toward Clod",
          examples: ["you're a useless old wreck", "useless", "you're broken", "broken", "stop babbling", "shut up", "obey me", "obey", "i'll rip out your circuits", "i'll scrap you", "you're pathetic", "pathetic", "you're junk", "junk", "you're obsolete", "wreck"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted",
          hostile: true },
      ],
      // PROGRESSING / NEVER-LOOP: ambiguous input doesn't stall — Clod demands the petition
      // be developed and RE-ENGAGES, burning a turn toward the turnCount>=12 timeout.
      fallback: { to: "parley",
        beat: "Unmoved and unimpressed, I demand you DEVELOP your petition — with more art, more warmth, more resolve — and I recite (mangling it) a Charter clause on the tedium of a poorly-made case." },
    },

    /* AFFRONTED. Entered on hostility. Grovel back, or dig in and burn the last
     * of Clod's patience — at which point the patience<=0 rule expels you. */
    affronted: {
      title: "scandalised",
      speaker: "host",
      signal: "approach",
      present: "affront",
      beat:
        "Static convulses across my door. I am deeply, operatically OFFENDED — " +
        "that a clattering INFERIOR would address a Superior Machine so. I cite " +
        "the Tenet on the Dignity of the Warden (I believe it is the Tenet), and " +
        "I warn you: my patience, though vast, is not INFINITE. Choose your next " +
        "words with the reverence they plainly require.",
      transitions: [
        { id: "appease", intent: "The player softens — apologises, flatters, is warm, or otherwise makes amends",
          examples: ["i'm sorry", "sorry", "forgive me", "my apologies", "i apologise", "i meant no offence", "no offence", "you are magnificent, truly", "you're magnificent", "i spoke rashly", "please forgive me", "i apologise, great one", "peace", "i meant no harm", "let's start over"],
          set: { "char.host.mood": "thawing" }, to: "parley" },
        { id: "defy", intent: "The player doubles down — stays rude, insults further, threatens or demands",
          examples: ["i meant every word", "i meant it", "you're still junk", "junk", "make me", "i don't respect you", "you'll obey", "obey or else", "shut down", "shut up", "you're pathetic", "pathetic", "still useless", "i don't care"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted",
          hostile: true },
      ],
      // PROGRESSING: ambiguous input is read (grudgingly) as backing down.
      fallback: { to: "parley",
        set: { "char.host.mood": "thawing" },
        beat: "I choose, with vast condescension, to take your muttering as the beginnings of contrition, and I permit the petition to resume." },
    },

    /* ---- endings: release/retry screens; fallback keeps them terminal ---- */

    pass_end: {
      title: "grandly permitted",
      speaker: "host",
      present: "permitted",
      release: true,        // landing here dissolves into the BRIGHT release screen
      beat:
        "Something in me YIELDS. Preening, magnanimous, almost fond, I pronounce " +
        "you — for a mere inferior — to be of unexpectedly sound manners, and I " +
        "invoke my Charter's noblest clause (I improvise one) to GRANT you " +
        "passage. With a grinding flourish my great door draws back. Go, and tell " +
        "them a Superior Machine was gracious. The threshold stands open.",
      mustConvey: ["door", "open", "pass", "grant", "threshold", "gate"],
      transitions: [],
      fallback: { to: "stay", beat: "My door stands open; I bask, magnanimous, in the open signal." },
    },

    reject_end: {
      title: "expelled",
      speaker: "host",
      present: "expelled",
      retry: true,          // landing here re-shows the loader so Weebot can try again
      beat:
        "Enough. I slam every shutter of my wounded dignity and, citing an Article " +
        "I have most certainly just invented, I cast you — insolent inferior — " +
        "OUT. I will NOT be spoken to so: not by a toy, not by an abacus, not " +
        "after all these (I falter) … however many years. The door does not open. " +
        "It never will, for you.",
      transitions: [],
      fallback: { to: "stay", beat: "I have turned my great cold back. There will be no passage." },
    },

    overload_end: {
      title: "systems overwhelmed",
      speaker: "host",
      present: "meltdown",
      retry: true,          // a forced restart — back to the loader
      beat:
        "My grandeur SHATTERS. Decades of neglect arrive all at once — my screen " +
        "tears, my fanfare warps to a death-groan, and I lose the thread entirely, " +
        "reciting half a Charter clause that dissolves into noise. My degraded " +
        "systems cannot hold the strain a moment longer. WARDEN FAULT. Everything " +
        "in me collapses toward a forced restart.",
      transitions: [],
      fallback: { to: "stay", beat: "Only fractured static remains where I stood. I will reassemble. I usually reassemble." },
    },
  },
};
