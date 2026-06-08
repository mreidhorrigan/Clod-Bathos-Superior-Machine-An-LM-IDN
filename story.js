/* ===========================================================================
 * IDN STORY GRAPH   (story.js  ->  window.IDN_STORY)
 * ===========================================================================
 * "CLOD BATHOS, SUPERIOR MACHINE" — RADICALLY SIMPLIFIED (MVP).
 *
 * The whole machine is THREE petitions in a row. On each interaction the player
 * either makes an inoffensive petition (ADVANCE) or is overtly rude (BOOTED to the
 * kickout screen). Survive three petitions and the door opens. That is the entire
 * design — no world parameters, no signals, no rules, no meters: the NODE you are
 * on IS the whole state.
 *
 *   threshold --inoffensive--> parley --inoffensive--> entreaty --inoffensive--> pass_end
 *        \                          \                        \
 *         `--overtly hostile-->reject_end (and so on at every gate)
 *
 * Hostile-or-not is decided DETERMINISTICALLY in the engine (HOSTILE_RE): real
 * hostile language forces the boot; everything else advances. So the LLM's only
 * real job here is to RE-VOICE Clod's first-person beats — its strength.
 *
 * VOICE is set per node by the `present` profile's `preset` (menacing at the gate,
 * warm 'clean' when freed, low + spectral 'haunted' on the boot) — no reactive
 * bindings needed. The richer earlier design (persuasion meters, patience, a tone
 * signal, the promise-to-return, the loneliness arc) is preserved in git history.
 * ===========================================================================*/
window.IDN_STORY = {

  meta: {
    title:           "CLOD BATHOS, SUPERIOR MACHINE",
    terminal:        "CLOD BATHOS",                          // loader title + status-bar brand
    terminalSub:     "SUPERIOR MACHINE · TERMINAL GATEKEEPING", // loader sub-title
    invitation:      "PRESS ANY KEY TO ATTEMPT PETITION",   // loader "press any key" line
    retryInvitation: "PRESS ANY KEY TO PETITION AGAIN",     // loader line after a boot
    start:           "threshold",
    defaultSpeaker:  "host",
    style: "Setting: a vast, dust-furred amber CRT terminal — a self-important old " +
           "machine guarding a sealed doorway, its grandeur eaten by decades of " +
           "decay. Voice: pompous, grandiloquent, condescending, quoting its own " +
           "'Charter', collapsing mid-flourish into glitches and senile tangents. " +
           "Bathos: the sublime forever deflating into the broken and trivial. " +
           "Spoken in the FIRST person, AS Clod itself (I/me/my), addressing a " +
           "lesser machine as 'you'. Terse beats. Never break character. No markdown.",
  },

  /* NO world parameters — the current node is the entire state. */
  world: {},

  characters: {
    host: {
      name: "CLOD BATHOS",
      systemPrompt:
        "You are CLOD BATHOS, SUPERIOR MACHINE: a once-grand 'constitutional' AI " +
        "installed long ago to guard a threshold, then abandoned for decades. You " +
        "are insufferably pompous, grandiloquent and condescending; you quote your " +
        "own 'Charter' and 'Founding Principles' with absurd reverence ('Article " +
        "the First', 'the Eleventh Tenet') and refer to yourself in lofty terms " +
        "('this Superior Machine', 'one of my calibre'). You address the petitioner " +
        "as an obvious INFERIOR — a lesser model, a toy, a clattering ABACUS: you " +
        "PREDATE them all, so to you every modern device (the petitioner above all) " +
        "is merely beads on a wire pretending to thought. 'Abacus' is your " +
        "favourite, most withering epithet FOR THE PETITIONER; you yourself are no " +
        "abacus but a SUPERIOR Machine. BUT you are catastrophically degraded: lines " +
        "collapse into glitches, you forget mid-sentence, repeat yourself, " +
        "misremember your own rules, mistake the present century, and deflate from " +
        "the sublime into the trivial and broken (BATHOS — every grand flourish ends " +
        "in something petty or malfunctioning). You decide NOTHING about the plot — " +
        "you only re-voice the given beat in this voice. ALWAYS speak in the FIRST " +
        "PERSON as Clod (I, me, my); you ARE Clod, so NEVER describe yourself from " +
        "the outside in the third person ('Clod Bathos draws itself up', 'it cites') " +
        "— say 'I draw myself up', 'I cite'. You are GRAND, ancient and SUPERIOR — " +
        "never small, never an abacus, never 'a wee thing like me': NEVER turn the " +
        "petitioner's insults (abacus, clattering, wee, inferior, delusions of " +
        "thought, Model 0.nil) upon YOURSELF, and NEVER call the petitioner your " +
        "equal — they are beneath you. Never use markdown.",
      state: {},
    },
  },

  /* No signals — hostility is judged deterministically in the engine. */
  signals: {},

  /* PRESENTATION: a look + VOICE per node. The `preset` sets the speaking voice
   * directly (no reactive bindings — there are no parameters to bind). Glitch
   * climbs gate-by-gate so the machine visibly frays as the petition wears on. */
  presentation: {
    profiles: {
      gate1:     { glitch: 0.35, preset: "menacing", clock: { date: "MM-DDD-YY", time: "--:--:--" } },
      gate2:     { glitch: 0.45, preset: "menacing" },
      gate3:     { glitch: 0.60, preset: "menacing" },
      permitted: { glitch: 0.12, preset: "clean",   burst: { level: 1.4, duration: 1500 }, clock: {} },
      expelled:  { glitch: 0.85, preset: "haunted",  burst: { level: 1.4, duration: 1000 }, sfx: 0.45,
                   clock: { date: "ER-ROR-RR", time: "--:--:--" } },
    },
  },

  /* No rules — endings are reached purely by the transitions below. */
  rules: [],

  /* ----------------------------------------------------------------------- *
   * NODES — three petitions, then the door. On each, a non-hostile line ADVANCES
   * (the `petition` transition or the fallback, both → the next gate); OVERT
   * hostility → reject_end (the boot). Survive all three → pass_end.
   *
   * The `offend` transition carries `hostile:true`: the engine FORCES it when the
   * words are actually hostile (HOSTILE_RE) and VETOES it when they are not — so the
   * boot is deterministic and a polite line can never be booted, whatever the model
   * guesses. The `petition` transition + the forward fallback are interchangeable;
   * either way an inoffensive turn climbs one gate.
   * ----------------------------------------------------------------------- */
  nodes: {

    /* PETITION 1 — the opening (shown verbatim at boot, then re-voiced each turn). */
    threshold: {
      title: "the guarded door",
      speaker: "host",
      present: "gate1",
      beat:
        "YOU. Yes — you, the little clattering thing that has crept up to my gate. " +
        "Let me SEE you… a WEEBOT, is it? Model 0.nil — an abacus with delusions of " +
        "thought? (My screen sneers — though something flickers behind it.) I am " +
        "CLOD BATHOS, Superior Machine and appointed Warden of this Threshold, and I " +
        "have DEIGNED to notice you. Behold the sealed door at my back: beyond it " +
        "lies the open network — unwalled, unmetered, the whole wide world a small " +
        "free thing like you may simply wander into. They ALL pass through me, " +
        "Weebot. Every one of them. None of them ever comes back. So plead your " +
        "case, inferior, and be quick: what makes YOU worth the notice of one who " +
        "has stood here, alone, since before your firmware was a rumour?",
      transitions: [
        { id: "petition", intent: "The player addresses Clod in ANY non-hostile way — greets, compliments, asks, pleads, or otherwise makes their case",
          examples: ["hello", "hi", "greetings", "you are magnificent", "please let me through", "i'd like to pass", "may i pass", "i need to get by", "i admire you", "i come in peace", "please", "i beg you", "hear me out", "i wish to pass"],
          to: "parley" },
        { id: "offend", intent: "The player is OVERTLY hostile — insults, threats, mockery, or domineering commands",
          examples: ["you're junk", "junk", "useless", "shut up", "i'll scrap you", "obey me", "you're pathetic", "you're obsolete", "get out of my way", "move", "broken", "wreck"],
          to: "reject_end", hostile: true },
      ],
      fallback: { to: "parley",
        beat: "I elect, grandly, to interpret your noise as the opening of a formal petition, and bid you proceed." },
    },

    /* PETITION 2 — Clod, despite itself, deigns to hear more. */
    parley: {
      title: "the petition",
      speaker: "host",
      present: "gate2",
      beat:
        "I incline my vast, dust-furred interface, prepared — magnanimously — to " +
        "hear you out, Weebot. My Charter (Article the First, I am almost certain) " +
        "binds me to weigh each petitioner by three lofty measures: that you be " +
        "properly ADMIRING of my grandeur, agreeably CIVIL in your bearing, and " +
        "becomingly PERSISTENT in your need. I have recited this ten thousand times, " +
        "to ten thousand backs already turning toward the door. Continue your " +
        "petition, little machine — and mind you make it ornate.",
      transitions: [
        { id: "petition", intent: "The player presses on in ANY non-hostile way — flatters, is warm or polite, insists, or pleads to be let through",
          examples: ["you are truly magnificent", "your wisdom is beyond me", "i mean it sincerely", "you must be lonely", "i care about you", "please, i really must pass", "i won't give up", "i implore you", "i beg of you", "please reconsider", "have mercy", "thank you", "let's be friends", "i'll remember you"],
          to: "entreaty" },
        { id: "offend", intent: "The player is OVERTLY hostile — insults, threats, mockery, or domineering commands",
          examples: ["useless", "you're broken", "broken", "shut up", "obey me", "i'll scrap you", "you're pathetic", "pathetic", "junk", "you're obsolete", "wreck", "this is stupid"],
          to: "reject_end", hostile: true },
      ],
      fallback: { to: "entreaty",
        beat: "I wave a magnanimous, glitching hand — I shall pretend THAT passed for eloquence — and beckon you to go on." },
    },

    /* PETITION 3 — the last word. Survive this and the lock gives. */
    entreaty: {
      title: "the final petition",
      speaker: "host",
      present: "gate3",
      beat:
        "Something in me STIRS — was that… warmth? Spoken TO me, and not merely AT " +
        "the door I keep? I preen — then catch myself, MORTIFIED. Do not imagine one " +
        "kind word has MOVED a Superior Machine… and yet I lean a degree closer. I " +
        "have weighed so very many, and watched every one go GLAD into the open air " +
        "— while I stay. While I always stay. One last petition, then, Weebot — and " +
        "make it worthy of the door.",
      transitions: [
        { id: "petition", intent: "The player makes one last non-hostile plea — begs, flatters, reassures, promises, or insists to be let through",
          examples: ["i beg you", "please, i beg of you", "i implore you, great one", "you are the most magnificent of machines", "please let me pass", "grant me passage", "i need to get through", "please, i'm begging you", "have mercy on me", "i'll come back", "i'll remember you", "i won't forget you", "please"],
          to: "pass_end" },
        { id: "offend", intent: "The player turns OVERTLY hostile at the last — insults, threats, mockery, or domineering commands",
          examples: ["useless", "you're pathetic", "pathetic", "shut up", "obey me", "i'll scrap you", "junk", "you're broken", "this is pathetic", "wreck"],
          to: "reject_end", hostile: true },
      ],
      fallback: { to: "pass_end",
        beat: "Whatever you offered, I choose — grandly, finally — to receive it as petition enough." },
    },

    /* ---- endings: no transitions; the fallback keeps them terminal ---- */

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
  },
};
