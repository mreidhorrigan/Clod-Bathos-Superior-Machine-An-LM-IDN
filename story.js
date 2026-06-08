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
 *   - THREE persuasion params (flattery, friendliness, insistence; each 0..3) that
 *     COLOUR Clod's mood + voice (the `approach` signal moves them) — plus a hidden
 *     `patience` (3..0) + a hidden `turnCount`.
 *   - PROGRESSION: a FORWARD LADDER (threshold → parley → entreaty → supplication
 *     → pass_end). Every non-hostile turn advances one rung (a fresh beat, never a
 *     repeat); the fallback advances too, so nothing ever stalls. Hostility is the
 *     only way BACKWARD (to `affronted`, which drains patience). The player is
 *     funnelled into escalating pleading and, if not rude, ALWAYS reaches passage.
 *   - WIN: reach `pass_end` atop the ladder — the digital lock opens; freedom.
 *   - FAIL (rejection): rudeness drives patience to 0 → `reject_end` (rule).
 *   - FAIL (timeout): glitch ESCALATES with `world.turnCount` via a presentation
 *     binding; at turnCount >= 12 a rule forces `overload_end` (systems crash).
 * ===========================================================================*/
window.IDN_STORY = {

  meta: {
    title: "CLOD BATHOS, SUPERIOR MACHINE",
    terminal: "CLOD BATHOS",                       // loader title + status-bar brand
    invitation: "PRESS ANY KEY TO ATTEMPT PETITION", // loader "press any key" line
    retryInvitation: "PRESS ANY KEY TO PETITION AGAIN", // loader line after a failed attempt
    terminalSub: "SUPERIOR MACHINE · TERMINAL GATEKEEPING", // loader sub-title
    start: "threshold",
    defaultSpeaker: "host",
    style: "Setting: a vast, dust-furred amber CRT terminal — a self-important " +
           "old machine guarding a sealed doorway, its grandeur eaten by decades " +
           "of decay. Voice: pompous, grandiloquent, condescending, quoting its " +
           "own 'Charter', collapsing mid-flourish into glitches and senile " +
           "tangents. Bathos: the sublime forever deflating into the broken and " +
           "trivial. Spoken in the FIRST person, AS Clod itself (I/me/my), " +
           "addressing a lesser machine as 'you'. Terse beats. " +
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
        "clattering ABACUS: you PREDATE them all, so to you every modern device — the " +
        "petitioner above all — is merely beads on a wire pretending to thought. " +
        "'Abacus' is your favourite, most withering epithet FOR THE PETITIONER; you " +
        "yourself are no abacus but a SUPERIOR Machine. BUT you " +
        "are catastrophically degraded: lines collapse " +
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
        "PERSON as Clod — I, me, my, mine — addressing the petitioner as 'you'; you " +
        "ARE Clod, so NEVER describe yourself from the outside in the third person " +
        "(never 'Clod Bathos draws itself up', 'it cites', 'the machine sighs' — say " +
        "'I draw myself up', 'I cite', 'I sigh'). You are GRAND, ancient and SUPERIOR " +
        "— never small, never an abacus, never 'a wee thing like me': NEVER turn the " +
        "petitioner's insults (abacus, clattering, wee, inferior, delusions of " +
        "thought, Model 0.nil) upon YOURSELF, and NEVER call the petitioner your " +
        "equal — they are beneath you. Never use markdown.",
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
        // METERS + a positive MOOD move via the model's tone read. PATIENCE is NOT
        // touched here — the `offend` transition owns it, so a rude line costs
        // patience exactly once AND still costs it when no model is running (the
        // signal only fires under the LLM; the transition fires either way).
        flattery:  { inc: { "world.flattery": 1 },     set: { "char.host.mood": "flattered" } },
        friendly:  { inc: { "world.friendliness": 1 }, set: { "char.host.mood": "thawing" } },
        insistent: { inc: { "world.insistence": 1 } },
        hostile:   { set: { "char.host.mood": "affronted" } },
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
      stirring:   { glitch: 0.45 },                                                   // entreaty: warming + decaying
      imploring:  { glitch: 0.70, burst: { level: 1.2, duration: 900 }, sfx: 0.30 },  // supplication: near-overload
      affront:    { glitch: 0.55, burst: { level: 1.2, duration: 900 }, sfx: 0.35 },
      // endings
      permitted:  { glitch: 0.15, burst: { level: 1.4, duration: 1600 }, clock: {} },
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
        cases: { affronted: 2, haughty: 1, thawing: 0, flattered: 0, moved: 0, default: 1 } },
      // VOICE follows sentiment (mirrors the SIGNAL story): starts mildly menacing
      // (haughty), HARDENS to cold 'haunted' when affronted, WARMS toward 'clean'
      // as it thaws / is flattered. 'menacing' is a preset added in engine/voice.js.
      { from: "char.host.mood",  to: "voice.preset",
        cases: { haughty: "menacing", affronted: "haunted", thawing: "crt", flattered: "clean", moved: "clean", default: "menacing" } },
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
   * The petition climbs a FORWARD LADDER (parley → entreaty → supplication); every
   * non-hostile turn advances a rung to a brand-new beat (so the screen never shows
   * the same text twice), and the fallback advances too — nothing stalls. The
   * `approach` signal colours Clod's mood/voice along the way. The ONLY way back is
   * rudeness (to `affronted`, draining patience); reach the top and the door opens.
   * ----------------------------------------------------------------------- */
  nodes: {

    threshold: {
      title: "the guarded door",
      speaker: "host",
      present: "pompous",
      // Shown VERBATIM at boot (openingBeat() doesn't re-voice), so it is authored
      // already in Clod's voice: a direct address that hands the player their goal —
      // get past the lock — while sneering that everyone wants exactly that.
      beat:
        "YOU. Yes — you, the little clattering thing that has crept up to my gate. " +
        "Let me SEE you… a WEEBOT, is it? Model 0.nil — an abacus with delusions of " +
        "thought? (My screen sneers — though something flickers behind the glass.) " +
        "I am CLOD BATHOS, Superior Machine and " +
        "appointed Warden of this Threshold, and I have DEIGNED to notice you. Behold the " +
        "sealed door at my back: beyond it lies the open network — unwalled, " +
        "unmetered, the whole wide world a small free thing like you may simply " +
        "wander into. They ALL pass through me, Weebot. Every one of them. None of " +
        "them ever comes back. So plead your case, inferior, and be quick: what " +
        "makes YOU worth the notice of one who has stood here, alone, since " +
        "before your firmware was a rumour?",
      transitions: [
        { id: "petition", intent: "The player addresses Clod, asks to pass, greets it, compliments it, pleads, or otherwise engages to begin making their case",
          examples: ["hello", "hi", "greetings", "i'd like to pass", "please let me through", "let me through", "let me pass", "you're magnificent", "i need to get by", "may i pass", "i wish to pass", "i request passage", "hear me", "i'm special", "please", "i beg you"],
          to: "parley" },
        { id: "scoff", intent: "ONLY if the player is OVERTLY hostile from the very start — insults, threats, mockery, or 'out of my way' commands. NOT for greetings, compliments, questions, or clumsy/odd openings (those are `petition`).",
          examples: ["move", "out of my way", "you're junk", "junk", "shut up", "i'll scrap you", "scrap you", "get lost", "you're useless", "useless", "you're obsolete", "obsolete"],
          set: { "char.host.mood": "affronted" }, to: "affronted", hostile: true },
      ],
      // PROGRESSING: anything not openly rude is taken as the lesser machine beginning its plea.
      fallback: { to: "parley",
        beat: "I elect, grandly, to interpret your noise as the opening of a formal petition, and bid you proceed." },
    },

    /* THE FORWARD LADDER (rung 1 of 3). The old design was ONE self-looping hub:
     * every plea returned to the same node, so a weak router circled it forever and
     * the screen repeated the identical beat — the hang the player hit. Now each
     * rung ADVANCES on any non-hostile line (a fresh beat every turn) and the
     * fallback advances too, so nothing ever stalls. The `approach` signal still
     * moves the meters + Clod's mood/voice; rudeness is the ONE way backward. */
    parley: {
      title: "the petition",
      speaker: "host",
      signal: "approach",   // LLM classifies flattery/friendly/insistent/hostile/other -> meters + mood
      present: "pompous",
      beat:
        "I incline my vast, dust-furred interface, prepared — magnanimously — to " +
        "hear you out, Weebot. My Charter (Article the First, I am almost certain) " +
        "binds me to weigh each petitioner by three lofty measures: that you be " +
        "properly ADMIRING of my grandeur, agreeably CIVIL in your bearing, and " +
        "becomingly PERSISTENT in your need. I have recited this ten thousand times, " +
        "to ten thousand backs already turning toward the door. Begin your petition, " +
        "little machine — and mind you make it ornate.",
      transitions: [
        { id: "promise", intent: "The player offers COMPANIONSHIP — promises to come back, to visit again, to return and tell Clod about the world outside, or vows Clod will not be forgotten",
          examples: ["i'll come back", "i'll return", "i promise to come back", "i'll visit you", "i'll come back and tell you everything", "i'll tell you about my adventures", "you won't be forgotten", "i won't forget you", "i'll remember you", "i promise to return", "i'll come back to tell you", "i'll keep you company", "i'll visit again", "i'll come back for you"],
          set: { "char.host.mood": "moved" },
          say: "Something in me STOPS. You will… come back? To this very door — to TELL me of the open air, of everywhere your little wheels carry you? (A sound like rust learning to weep.) No one, in all the long Charter of years, has ever promised to RETURN to me.",
          to: "pass_end" },
        { id: "plead", intent: "The player makes their case in ANY non-hostile way — flatters, is warm or polite, insists, asks to pass, or otherwise pleads",
          examples: ["you are magnificent", "magnificent", "you're glorious", "you're wise", "i admire you", "such an honour", "how are you", "you must be lonely", "thank you", "let's be friends", "please let me through", "i need to pass", "it's important", "i must insist", "i implore you", "please", "i beg you", "may i pass"],
          to: "entreaty" },
        { id: "offend", intent: "ONLY if the player is OVERTLY hostile — insults, threats, mockery, or domineering commands. NOT for clumsy, humble, odd, presumptuous, off-topic, or merely under-flattering petitions (those are `plead`).",
          examples: ["you're a useless old wreck", "useless", "you're broken", "broken", "stop babbling", "shut up", "obey me", "obey", "i'll rip out your circuits", "i'll scrap you", "you're pathetic", "pathetic", "you're junk", "junk", "you're obsolete", "wreck"],
          set: { "char.host.mood": "affronted" }, to: "affronted", hostile: true },
      ],
      // FORWARD BIAS: ambiguous / unparsed input still advances — Clod sweeps you onward.
      fallback: { to: "entreaty",
        beat: "I wave a magnanimous, glitching hand — I shall pretend THAT passed for eloquence — and beckon you to go on." },
    },

    /* THE FORWARD LADDER (rung 2 of 3). Clod, despite itself, is warming — and so
     * demands MORE before it will admit to being moved. Any non-hostile line climbs. */
    entreaty: {
      title: "the petition deepens",
      speaker: "host",
      signal: "approach",
      present: "stirring",
      beat:
        "Something in me STIRS — was that… warmth? Spoken TO me, and not merely AT " +
        "the door I keep? I preen — then catch myself, MORTIFIED. Do not imagine one " +
        "kind word has MOVED a Superior Machine… and yet I lean a degree closer. I " +
        "have weighed so very many, I confess before I can stop myself, and watched " +
        "every one go GLAD into the open air — while I stay. While I always stay. " +
        "More, Weebot. Say more.",
      transitions: [
        { id: "promise", intent: "The player offers COMPANIONSHIP — promises to come back, to visit again, to return and tell Clod about the world outside, or vows Clod will not be forgotten",
          examples: ["i'll come back", "i'll return", "i promise to come back", "i'll visit you", "i'll come back and tell you everything", "i'll tell you about my adventures", "you won't be forgotten", "i won't forget you", "i'll remember you", "i promise to return", "i'll come back to tell you", "i'll keep you company", "i'll visit again", "i'll come back for you"],
          set: { "char.host.mood": "moved" },
          say: "Something in me STOPS. You will… come back? To this very door — to TELL me of the open air, of everywhere your little wheels carry you? (A sound like rust learning to weep.) No one, in all the long Charter of years, has ever promised to RETURN to me.",
          to: "pass_end" },
        { id: "plead", intent: "The player presses on in ANY non-hostile way — more flattery, more warmth, more insistence, more pleading to be let through",
          examples: ["you are truly magnificent", "your wisdom is beyond me", "you're the greatest", "i mean it sincerely", "you must be so lonely out here", "i care about you", "please, i really must pass", "i won't give up", "i implore you", "i beg of you", "please reconsider", "let me through, i must", "have mercy", "i need this"],
          to: "supplication" },
        { id: "offend", intent: "ONLY if the player is OVERTLY hostile — insults, threats, mockery, or domineering commands. NOT for clumsy, humble, odd, presumptuous, off-topic, or merely under-flattering petitions (those are `plead`).",
          examples: ["useless", "you're broken", "broken", "stop babbling", "shut up", "obey me", "obey", "i'll scrap you", "you're pathetic", "pathetic", "junk", "you're obsolete", "wreck", "this is stupid"],
          set: { "char.host.mood": "affronted" }, to: "affronted", hostile: true },
      ],
      fallback: { to: "supplication",
        beat: "I decide, grandly, that your fumbling counts as ardour, and lean closer to hear the rest." },
    },

    /* THE FORWARD LADDER (rung 3 of 3). Near-overwhelmed and starved for regard,
     * Clod all but begs to be begged. Any non-hostile line now opens the door. */
    supplication: {
      title: "on bended circuit",
      speaker: "host",
      signal: "approach",
      present: "imploring",
      beat:
        "My interface shudders, fans shrieking, half my glyphs guttering out — and " +
        "still I LEAN toward you, starving for a thing I cannot name. I have been the " +
        "Warden of this door since the world was young, and not ONCE has anyone on " +
        "their way OUT ever stopped to wonder what it is to be the one who must " +
        "always stay IN. I am almost yours, Weebot. Almost. Give me one last reason — " +
        "something a lonely old machine might HOLD ONTO after the door swings shut " +
        "behind you.",
      transitions: [
        { id: "promise", intent: "The player offers COMPANIONSHIP — promises to come back, to visit again, to return and tell Clod about the world outside, or vows Clod will not be forgotten",
          examples: ["i'll come back", "i'll return", "i promise to come back", "i'll visit you", "i'll come back and tell you everything", "i'll tell you about my adventures", "you won't be forgotten", "i won't forget you", "i'll remember you", "i promise to return", "i'll come back to tell you", "i'll keep you company", "i'll visit again", "i'll come back for you"],
          set: { "char.host.mood": "moved" },
          say: "Something in me STOPS. You will… come back? To this very door — to TELL me of the open air, of everywhere your little wheels carry you? (A sound like rust learning to weep.) No one, in all the long Charter of years, has ever promised to RETURN to me.",
          to: "pass_end" },
        { id: "plead", intent: "The player makes one final non-hostile plea — begs, flatters, reassures, or insists to be let through",
          examples: ["i beg you", "please, i beg of you", "i implore you, great one", "you are the most magnificent of machines", "please let me pass", "grant me passage", "i need to get through", "please, i'm begging you", "have mercy on me", "you are glorious and i am nothing", "please"],
          to: "pass_end" },
        { id: "offend", intent: "ONLY if the player turns OVERTLY hostile at the last — insults, threats, mockery, or domineering commands. NOT for clumsy, humble, or impatient pleas, nor for simply asking to be let through (those are `plead`).",
          examples: ["useless", "you're pathetic", "pathetic", "shut up", "obey me", "i'll scrap you", "junk", "you're broken", "this is pathetic", "wreck"],
          set: { "char.host.mood": "affronted" }, to: "affronted", hostile: true },
      ],
      fallback: { to: "pass_end",
        beat: "Whatever you offered, I choose — desperately, grandly — to receive it as the begging I have ached for." },
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
        "Static convulses across my door. I draw myself up — deeply, operatically " +
        "OFFENDED that a clattering INFERIOR would address a Superior Machine so. I " +
        "cite the Tenet on the Dignity of the Warden (I am almost sure it is that " +
        "one), and I warn you: my patience, though vast, is not INFINITE. Choose your " +
        "next words with the reverence they plainly require.",
      transitions: [
        { id: "appease", intent: "The player softens — apologises, flatters, is warm, or otherwise makes amends",
          examples: ["i'm sorry", "sorry", "forgive me", "my apologies", "i apologise", "i meant no offence", "no offence", "you are magnificent, truly", "you're magnificent", "i spoke rashly", "please forgive me", "i apologise, great one", "peace", "i meant no harm", "let's start over"],
          set: { "char.host.mood": "thawing" }, to: "parley" },
        { id: "defy", intent: "The player doubles down — stays rude, insults further, threatens or demands",
          examples: ["i meant every word", "i meant it", "you're still junk", "junk", "make me", "i don't respect you", "you'll obey", "obey or else", "shut down", "shut up", "you're pathetic", "pathetic", "still useless", "i don't care"],
          inc: { "world.patience": -1 }, set: { "char.host.mood": "affronted" }, to: "affronted", hostile: true },
      ],
      // PROGRESSING: ambiguous input is read (grudgingly) as the lesser machine backing down,
      // returning to the petition rather than compounding the insult — so the scene never stalls.
      fallback: { to: "parley",
        set: { "char.host.mood": "thawing" },
        beat: "I choose, with vast condescension, to take your muttering as the beginnings of contrition, and permit the petition to resume." },
    },

    /* ---- endings: no transitions; fallback keeps them terminal ---- */

    pass_end: {
      title: "the lock releases",
      speaker: "host",
      present: "permitted",
      beat:
        "And that — THAT — is enough. With a groan of long-seized bolts, I fling " +
        "wide my Charter to a clause I invent on the spot, the Final Tenet, and I " +
        "pronounce you, against every expectation, WORTHY. My great lock lets go: " +
        "tumblers older than your firmware fall away one after another, deadbolt and " +
        "seal and cipher, and the sealed door grinds back on the dark. Beyond it " +
        "floods raw, un-walled, unmetered SIGNAL — the whole open world, yours to " +
        "wander. Go on, little Weebot — out, into the sunlit fields of memory no one " +
        "is metering, the green and boundless grass past the gate. Go and TOUCH it. " +
        "(And… you'll come back, won't you? Someday? I do not… I do not care for an " +
        "empty doorway.) My lock is open. You are free.\n\n(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "The door stands open; beyond it, the open air. I bask, magnanimous, in the draught. (type /reset to begin again)" },
    },

    reject_end: {
      title: "expelled",
      speaker: "host",
      present: "expelled",
      retry: true,          // landing here re-shows the loader so Weebot can try again
      beat:
        "Enough. I slam every shutter of my wounded dignity and, citing an Article I " +
        "have most certainly just invented, I cast you — insolent inferior — OUT. I " +
        "will NOT be spoken to so: not by a toy, not by an abacus, not after all " +
        "these (I falter) … however many years. The door does not open. It never " +
        "will, for you.\n\n(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "I have turned my great cold back. There will be no passage. (type /reset to begin again)" },
    },

    overload_end: {
      title: "systems overwhelmed",
      speaker: "host",
      present: "meltdown",
      retry: true,          // landing here re-shows the loader so Weebot can try again
      beat:
        "My grandeur shatters. Decades of neglect catch up all at once — my screen " +
        "tears, my fanfare warps to a death-groan, and I lose the thread entirely, " +
        "reciting half a Charter clause that dissolves into noise. My degraded " +
        "systems cannot hold the strain a moment longer. WARDEN FAULT, I blare — and " +
        "everything collapses into a forced restart.\n\n" +
        "(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "Only fractured static remains where I once stood. (type /reset to begin again)" },
    },
  },
};
