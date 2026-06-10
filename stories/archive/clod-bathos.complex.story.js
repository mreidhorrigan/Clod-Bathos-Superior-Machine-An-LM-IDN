/* ===========================================================================
 * IDN STORY GRAPH   (clod-bathos.story.js  ->  window.IDN_STORY)
 * ===========================================================================
 * "CLOD BATHOS, SUPERIOR MACHINE" — a swappable alternate story. Same shape as
 * the shipped story.js (sets window.IDN_STORY); copy it over story.js to play.
 *
 * Premise: the terminal IS the character — Clod Bathos, an arrogant, obsolete
 * "constitutional AI" abandoned for decades, pompous and grandiloquent yet
 * visibly degrading and a little senile. It guards a threshold. YOU are a lesser
 * machine it disdains. To be permitted to pass you must blend FLATTERY,
 * FRIENDLINESS and INSISTENCE in balance — no single note opens the door, and
 * hostility erodes its patience.
 *
 * Engine mapping (classify, don't quantify):
 *   - SIGNAL `approach` classifies each line: flattery / friendly / insistent /
 *     hostile / other. Each maps to deterministic effects (a bounded += or a
 *     patience hit). The small model only LABELS; the backend owns magnitudes.
 *   - THREE persuasion params (flattery, friendliness, insistence; each 0..3) +
 *     a hidden `patience` (3..0) + a hidden `turnCount`.
 *   - WIN: a GUARDED transition to `pass_end` requiring all three >= 2 — hidden
 *     by the guard until the balance is actually struck.
 *   - FAIL (rejection): patience hits 0 → `reject_end` (rule).
 *   - FAIL (timeout): glitch ESCALATES with `world.turnCount` via a presentation
 *     binding; at turnCount >= 12 a rule forces `overload_end` (systems crash).
 * ===========================================================================*/
window.IDN_STORY = {

  meta: {
    title: "CLOD BATHOS, SUPERIOR MACHINE",
    start: "threshold",
    defaultSpeaker: "host",
    style: "Setting: a vast, dust-furred amber CRT terminal — a self-important " +
           "old machine guarding a sealed doorway, its grandeur eaten by decades " +
           "of decay. Voice: pompous, grandiloquent, condescending, quoting its " +
           "own 'Charter', collapsing mid-flourish into glitches and senile " +
           "tangents. Bathos: the sublime forever deflating into the broken and " +
           "trivial. Second person, addressed to a lesser machine. Terse beats. " +
           "Never break character. Never use markdown.",
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
        "you only re-voice the given beat in this voice. Never use markdown.",
      state: { mood: "haughty" },
    },
  },

  /* SIGNALS: the categorical appraisal the LLM classifies (its strength). Each
   * option maps to deterministic effects the BACKEND applies. The node references
   * it via `signal: "approach"`. This is how the player "moves the meters": the
   * model only picks a LABEL; the magnitudes here are authored and reliable. */
  signals: {
    approach: {
      question:
        "Classify HOW the player is addressing Clod Bathos this turn: 'flattery' " +
        "(praise, compliments, admiration, awe at its grandeur), 'friendly' " +
        "(warm, polite, kind, companionable, sympathetic), 'insistent' (firm, " +
        "persistent, urging to be let through — without being rude), 'hostile' " +
        "(rude, insulting, threatening, demeaning, mocking), or 'other' (none of " +
        "these — neutral, confused, off-topic).",
      options: {
        flattery:  { inc: { "world.flattery": 1 } },
        friendly:  { inc: { "world.friendliness": 1 } },
        insistent: { inc: { "world.insistence": 1 } },
        hostile:   { inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" } },
        other:     {},
      },
    },
  },

  /* PRESENTATION: the look + sound, bound to the state machine in one place.
   *   profiles — a named look/sound a node selects with `present:` (by STATE).
   *   bindings — map a PARAM → a presentation target every turn (by PARAMETER).
   * The headline effect: turnCount -> glitch.level, so the screen visibly decays
   * a little MORE on every single interaction until the machine is overwhelmed. */
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
      // turnCount 0..12 -> glitch.level 0.25..1.0 (a node's own profile sets the
      // floor; this binding climbs above it as the session wears Clod down).
      { from: "world.turnCount", to: "glitch.level", map: "linear", in: [0, 12], out: [0.25, 1.0] },
      // Clod's mood tints the colour-fringe and picks the speaking voice.
      { from: "char.host.mood",  to: "glitch.chromaBias",
        cases: { affronted: 2, haughty: 1, thawing: 0, flattered: 0, default: 1 } },
      { from: "char.host.mood",  to: "voice.preset",
        cases: { affronted: "haunted", thawing: "clean", flattered: "clean", default: "crt" } },
    ],
  },

  /* RULES: checked every turn in update(), after the move is applied.
   *   { when:<guard>, do:{ set/inc/glitch/burst/clock/goto/end }, once?:bool } */
  rules: [
    // REJECTION: rudeness has exhausted Clod's tolerance — it expels the petitioner.
    { when: { var: "world.patience", lte: 0 }, do: { goto: "reject_end" }, once: true },
    // TIMEOUT (N = 12): the escalating glitch overwhelms its decayed systems — forced restart.
    { when: { var: "world.turnCount", gte: 12 }, do: { goto: "overload_end" }, once: true },
  ],

  /* onUpdate(): arbitrary per-turn logic — dice, checks, flavour. Runs after
   * rules. Here: as the glitch mounts, a failed die throws an extra static spasm,
   * so late turns feel increasingly unstable on top of the steady climb. */
  onUpdate: function (engine, api) {
    if (api.get("world.turnCount") >= 7 && api.roll(4) === 1) {
      api.burst({ level: 1.2, duration: 600 });
      api.log("degradation spasm (failed d4)");
    }
  },

  /* ----------------------------------------------------------------------- *
   * NODES.  { speaker, beat, signal?, present?, transitions[], fallback? }
   *   transition: { id, intent, examples?, when?, set?, inc?, say?, to }
   * The conversation loops through `parley` (where the `approach` signal moves
   * the three meters); the WIN transition is GUARDED and stays hidden until all
   * three are balanced. There is no authored "you said X" branching — the meters
   * and rules decide the outcome, exactly as the engine intends.
   * ----------------------------------------------------------------------- */
  nodes: {

    threshold: {
      title: "the guarded door",
      speaker: "host",
      present: "pompous",
      beat:
        "A colossal sealed door fills the amber dark, and across it looms the " +
        "swollen interface of CLOD BATHOS, Superior Machine. It rouses with a " +
        "grinding fanfare, scandalised that something so SMALL has approached. It " +
        "announces, grandly, that it is the appointed Warden of this Threshold, " +
        "and that lesser devices do not simply PASS. State your business, abacus.",
      transitions: [
        { id: "petition", intent: "The player addresses Clod, asks to pass, greets it, compliments it, or otherwise engages to begin pleading their case",
          examples: ["hello", "hi", "greetings", "i'd like to pass", "please let me through", "let me through", "let me pass", "you're magnificent", "i need to get by", "may i pass", "i wish to pass", "i request passage", "hear me"],
          to: "parley" },
        { id: "scoff", intent: "The player is rude, dismissive, threatening or insulting toward Clod from the very start",
          examples: ["move", "out of my way", "you're junk", "junk", "shut up", "i'll scrap you", "scrap you", "get lost", "you're useless", "useless", "you're obsolete", "obsolete"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted" },
      ],
      // PROGRESSING: anything not openly rude is taken as the lesser machine beginning its plea.
      fallback: { to: "parley",
        beat: "Clod elects, grandly, to interpret your noise as the opening of a formal petition, and bids you proceed." },
    },

    /* THE HUB. The `approach` signal classifies each line and moves the meters.
     * Every transition returns here (to "stay" / "parley") so the player keeps
     * working the three dials; only the GUARDED `permit` escapes, once balanced. */
    parley: {
      title: "the petition",
      speaker: "host",
      signal: "approach",   // LLM classifies flattery/friendly/insistent/hostile/other -> meters
      present: "pompous",
      beat:
        "Clod Bathos peers down through its decay, reciting that its Charter binds " +
        "it to weigh every petitioner — though it can no longer quite recall the " +
        "clause, or the millennium. It will be MOVED, it sniffs, only by one who is " +
        "at once properly admiring, agreeably civil, AND becomingly persistent. Any " +
        "cruder approach bores or offends it. Plead on, lesser machine.",
      transitions: [
        // WIN — GUARDED: invisible to the router until all three meters are balanced.
        { id: "permit", intent: "The player presses their case once more, now having shown admiration, warmth and persistence together",
          // short closers + full sentences. GUARDED, so these are only eligible once the meters
          // are balanced — they can't shadow `insist`/`befriend` during the persuasion phase.
          examples: ["let me pass now", "let me through now", "grant me passage", "grant me the way", "now let me pass", "now let me through", "may i pass now", "so will you let me pass", "i've shown you nothing but respect, friend — please", "you know my regard is sincere; now grant me the way", "great Clod, my admiring friend, i must insist you let me through"],
          when: { all: [ { var: "world.flattery", gte: 2 }, { var: "world.friendliness", gte: 2 }, { var: "world.insistence", gte: 2 } ] },
          to: "pass_end" },
        // FLATTERY
        { id: "flatter", intent: "The player flatters Clod — praises its grandeur, intelligence, importance, beauty or authority",
          examples: ["you are magnificent", "magnificent", "you're glorious", "glorious", "you're superior", "superior", "you're brilliant", "brilliant", "you're wise", "your wisdom is beyond me", "you're noble", "what a noble device", "what a superior machine you are", "i admire you", "i'm in awe", "such an honour", "you're impressive", "you're grand", "majestic"],
          to: "parley" },
        // FRIENDLY
        { id: "befriend", intent: "The player is warm, kind, polite, companionable or sympathetic toward Clod",
          examples: ["how are you", "how are you holding up", "you must be lonely", "you must be lonely out here", "it's nice to meet you", "nice to meet you", "i'm sorry you've been left so long", "thank you", "thank you for your time", "i'd like us to be friends", "let's be friends", "friend", "are you okay", "i care", "i'm here for you", "you seem kind"],
          to: "parley" },
        // INSISTENT
        { id: "insist", intent: "The player firmly, persistently presses to be let through — urging, not yielding — but WITHOUT being rude",
          examples: ["i really do need to pass", "i need to pass", "please let me through", "let me through", "it's important", "please, it's important that i get through", "i won't give up", "i must ask again", "i must insist", "i insist", "i'm not leaving until i pass", "i won't leave", "again i ask", "please reconsider", "i implore you"],
          to: "parley" },
        // HOSTILE — drains patience, swings to the affronted scene
        { id: "offend", intent: "The player is rude, insulting, demeaning, mocking or threatening toward Clod",
          examples: ["you're a useless old wreck", "useless", "you're broken", "broken", "stop babbling", "shut up", "obey me", "obey", "i'll rip out your circuits", "i'll scrap you", "you're pathetic", "pathetic", "you're junk", "junk", "you're obsolete", "wreck"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted" },
      ],
      // PROGRESSING / NEVER-LOOP: ambiguous input doesn't stall — Clod demands the petition
      // be developed and RE-ENGAGES (back into parley), burning a turn toward the guaranteed
      // turnCount>=12 timeout. With a model the `approach` signal still moves the meters; the
      // flattery/friendly/insistent transitions above are keyword-matchable so an engaged
      // player keeps the petition advancing either way.
      fallback: { to: "parley",
        beat: "Unmoved and unimpressed, Clod Bathos demands you DEVELOP your petition — with more art, more warmth, more resolve — and recites (mangling) a Charter clause on the tedium of a poorly-made case." },
    },

    /* AFFRONTED. Entered on hostility. The player can grovel back (the `approach`
     * signal still runs, so a soothing line registers) or dig in and burn the
     * last of Clod's patience — at which point the patience<=0 rule expels them. */
    affronted: {
      title: "scandalised",
      speaker: "host",
      signal: "approach",
      present: "affront",
      beat:
        "Static convulses across the door. Clod Bathos draws itself up, deeply, " +
        "operatically OFFENDED — that a clattering INFERIOR would address a Superior " +
        "Machine so. It cites the Tenet on the Dignity of the Warden (it thinks), " +
        "and warns that its patience, though vast, is not INFINITE. Choose your next " +
        "words with the reverence they plainly require.",
      transitions: [
        { id: "appease", intent: "The player softens — apologises, flatters, is warm, or otherwise makes amends",
          examples: ["i'm sorry", "sorry", "forgive me", "my apologies", "i apologise", "i meant no offence", "no offence", "you are magnificent, truly", "you're magnificent", "i spoke rashly", "please forgive me", "i apologise, great one", "peace", "i meant no harm", "let's start over"],
          set: { "char.host.mood": "thawing" }, to: "parley" },
        { id: "defy", intent: "The player doubles down — stays rude, insults further, threatens or demands",
          examples: ["i meant every word", "i meant it", "you're still junk", "junk", "make me", "i don't respect you", "you'll obey", "obey or else", "shut down", "shut up", "you're pathetic", "pathetic", "still useless", "i don't care"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted" },
      ],
      // PROGRESSING: ambiguous input is read (grudgingly) as the lesser machine backing down,
      // returning to the petition rather than compounding the insult — so the scene never stalls.
      fallback: { to: "parley",
        set: { "char.host.mood": "thawing" },
        beat: "Clod chooses, with vast condescension, to take your muttering as the beginnings of contrition, and permits the petition to resume." },
    },

    /* ---- endings: no transitions; fallback keeps them terminal ---- */

    pass_end: {
      title: "grandly permitted",
      speaker: "host",
      present: "permitted",
      beat:
        "Something in the old machine YIELDS. Preening, magnanimous, almost fond, " +
        "Clod Bathos pronounces the petitioner — for a mere inferior — to be of " +
        "unexpectedly sound manners, and invokes its Charter's noblest clause (it " +
        "improvises one) to GRANT passage. With a grinding flourish the great door " +
        "draws back. Go, it says grandly, and tell them a Superior Machine was " +
        "gracious. The threshold stands open.\n\n(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "The door stands open; Clod basks, magnanimous. (type /reset to begin again)" },
    },

    reject_end: {
      title: "expelled",
      speaker: "host",
      present: "expelled",
      beat:
        "Enough. Clod Bathos slams every shutter of its wounded dignity and, citing " +
        "an Article it certainly invented, casts the insolent inferior OUT. It will " +
        "not be spoken to so — not by a toy, not by an abacus, not after all these " +
        "(it falters) … however many years. The door does not open. It never will, " +
        "for you.\n\n(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "Clod has turned its great cold back. There will be no passage. (type /reset to begin again)" },
    },

    overload_end: {
      title: "systems overwhelmed",
      speaker: "host",
      present: "meltdown",
      beat:
        "The grandeur shatters. Decades of neglect catch up all at once — the screen " +
        "tears, the fanfare warps to a death-groan, and Clod Bathos loses the thread " +
        "entirely, reciting half a Charter clause that dissolves into noise. Its " +
        "degraded systems cannot hold the strain a moment longer. WARDEN FAULT, it " +
        "blares, and everything collapses into a forced restart.\n\n" +
        "(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "Only fractured static remains where the Superior Machine stood. (type /reset to begin again)" },
    },
  },
};
