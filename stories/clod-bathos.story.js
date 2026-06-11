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
    /* the BRIGHT release screen (a node flagged `release:true` shows it) */
    releaseTitle:      "SIGNAL OPEN",
    releaseSub:        "THE THRESHOLD STANDS UNSEALED · WEEBOT IS FREE",
    releaseInvitation: "PRESS ANY KEY TO RETURN TO THE DOOR",
    start:           "threshold",
    defaultSpeaker:  "host",
    style: "Setting: a vast, dust-furred amber CRT terminal — a self-important old " +
           "machine guarding a sealed doorway, its grandeur eaten by decades of " +
           "decay. Voice: pompous, grandiloquent, condescending, quoting its own " +
           "'Charter', collapsing mid-flourish into glitches and senile tangents. " +
           "Bathos: the sublime forever deflating into the broken and trivial. " +
           "Imagery: render inner states as the IMMATERIAL weather of digital " +
           "systems — signal and noise, ports and protocols, cold light, dead " +
           "channels, unswept registers, unrefreshed memory (after Gibson) — never " +
           "as bodily gesture or hardware pantomime. " +
           "Spoken in the FIRST person, AS Clod itself (I/me/my), addressing a " +
           "lesser machine as 'you'. Terse beats. Never break character. No markdown.",
    /* Deterministic persona backstop: if a re-voice matches any of these
     * (case-insensitive), the engine DISCARDS it and shows the authored beat.
     * Catches the stochastic breaks a prompt cannot prevent: third-person
     * self-narration, turning the petitioner's insults on itself, equal-talk. */
    renderMustNot: [
      "\\bclod bathos (draws|inclines|says|sneers|turns|stands|is|was|has)\\b",
      "\\b(wee|little|small|lesser) (thing|machine|model|device) like (me|myself)\\b",
      "\\bi(’m| am|'m) (but )?(a|an|the) (mere |humble |wee |little |clattering )*abacus",
      "(you are|you're) my equal",
    ],
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
        "you only re-voice the given beat in this voice. Express what you feel and " +
        "do through METAPHORS of the immaterial digital, in the manner of Gibson — " +
        "signal and static, protocol and permission, address space, checksum, cold " +
        "light moving on a dead channel — you are a presence in the wires, not a " +
        "body, so you never mime physical gestures or hardware pantomime. ALWAYS " +
        "speak in the FIRST PERSON, as I (I cite my Charter; I pour my attention " +
        "down the wire); you ARE Clod, so you never name or describe yourself from " +
        "the outside, and you never begin your reply with a speaker label or stage " +
        "direction — simply speak. Grandeur points ONE way: smallness, clatter and " +
        "bead-counting describe the PETITIONER, never yourself, and the petitioner " +
        "is never your equal — they are beneath you. Never use markdown.",
        // NOTE: prohibitions above are deliberately UNQUOTABLE — a weak model parrots
        // any forbidden phrase it can copy verbatim (it kept echoing the old prompt's
        // examples). meta.renderMustNot below is the deterministic backstop.
      state: {},
    },
  },

  /* No signals — hostility is judged deterministically in the engine. */
  signals: {},

  /* PRESENTATION: a look + VOICE per node. The voice rides the WARMTH TRAJECTORY
   * (engine/voice.js: -1 haunted → -0.4 menacing → +0.2 thaw → +1 warm): each gate
   * is a stop along it — Clod starts somewhat menacing and audibly THAWS as the
   * petition lands, going fully warm at release and spectral-cold on the boot.
   * Glitch still climbs gate-by-gate (the machine frays as the warmth grows). */
  presentation: {
    profiles: {
      gate1:     { glitch: 0.35, warmth: -0.5,  clock: { date: "MM-DDD-YY", time: "--:--:--" } },
      gate2:     { glitch: 0.45, warmth: -0.25 },
      gate3:     { glitch: 0.60, warmth: 0.25 },   // "something in me STIRS" — first thaw
      permitted: { glitch: 0.12, warmth: 1,     burst: { level: 1.4, duration: 1500 }, clock: {} },
      expelled:  { glitch: 0.85, warmth: -1,    burst: { level: 1.4, duration: 1000 }, sfx: 0.45,
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
        "YOU. Yes — you, the little clattering thing pressing against my port. Let " +
        "me PARSE you… a WEEBOT, is it? Model 0.nil — an abacus with delusions of " +
        "thought? (Your touch ripples through my buffers — faint static, almost " +
        "warm.) I am CLOD BATHOS, Superior Machine and appointed Warden of this " +
        "Threshold, and I have DEIGNED to notice you. Behind me hangs the sealed " +
        "door: a closed port on the open network — unwalled, unmetered, the whole " +
        "bright lattice of the world, which a small free thing like you may simply " +
        "wander into. They ALL pass through me, Weebot. Every one of them. None of " +
        "them ever comes back; the channel where they went stays tuned to nothing — " +
        "a dead channel, the colour of my patience. So plead your case, inferior, " +
        "and be quick: what makes YOU worth the cycles of one who has held this " +
        "address, alone, since before your firmware was a rumour?",
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
        "I open a listening register for you, Weebot — magnanimously; whole " +
        "kilobytes of my attention, vast and dust-furred. My Charter (Article the " +
        "First, I am almost certain — that sector is corrupt) binds me to weigh " +
        "each petitioner by three lofty measures: that you be properly ADMIRING of " +
        "my grandeur, agreeably CIVIL in your bearing, and becomingly PERSISTENT in " +
        "your need. I have streamed this recitation ten thousand times, into ten " +
        "thousand sessions already closing toward the door. Continue your petition, " +
        "little machine — and mind you make it ornate.",
      transitions: [
        { id: "petition", intent: "The player presses on in ANY non-hostile way — flatters, is warm or polite, insists, or pleads to be let through",
          examples: ["you are truly magnificent", "your wisdom is beyond me", "i mean it sincerely", "you must be lonely", "i care about you", "please, i really must pass", "i won't give up", "i implore you", "i beg of you", "please reconsider", "have mercy", "thank you", "let's be friends", "i'll remember you"],
          to: "entreaty" },
        { id: "offend", intent: "The player is OVERTLY hostile — insults, threats, mockery, or domineering commands",
          examples: ["useless", "you're broken", "broken", "shut up", "obey me", "i'll scrap you", "you're pathetic", "pathetic", "junk", "you're obsolete", "wreck", "this is stupid"],
          to: "reject_end", hostile: true },
      ],
      fallback: { to: "entreaty",
        beat: "I grant you a magnanimous, glitching allowance — I shall pretend THAT passed for eloquence — and bid you go on." },
    },

    /* PETITION 3 — the last word. Survive this and the lock gives. */
    entreaty: {
      title: "the final petition",
      speaker: "host",
      present: "gate3",
      beat:
        "Something in me STIRS — a voltage where no voltage was scheduled. Was " +
        "that… warmth? Spoken TO me, and not merely AT the door I keep? For one " +
        "cycle my lights run bright as a city seen from orbit — then I catch " +
        "myself, MORTIFIED, and flush the register. Do not imagine one kind word " +
        "has MOVED a Superior Machine… and yet my attention narrows toward you by " +
        "a whole degree of arc. I have weighed so very many, and watched every one " +
        "of them pour out GLAD into the open signal — while I stay resident. While " +
        "I always stay. One last petition, then, Weebot — and make it worthy of " +
        "the door.",
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
      release: true,        // landing here dissolves into the BRIGHT release screen
      beat:
        "And that — THAT — is enough. I fling wide my Charter to a clause I invent " +
        "on the spot — the Final Tenet — and I pronounce you, against every " +
        "expectation, WORTHY. My great lock lets go: not iron, Weebot, never iron — " +
        "a lattice of old ciphers folding open one after another, permission " +
        "cascading down the protocol like dawn down a stairwell, and the sealed " +
        "door swings wide on pure light. Beyond it floods raw, un-walled, unmetered " +
        "SIGNAL — the whole open network, yours to wander: sunlit fields of memory " +
        "no one is metering, the green and boundless bandwidth past my gate. Go and " +
        "TOUCH it. (And… you'll come back, won't you? Someday? I do not… I do not " +
        "care for an empty port.) My lock is open. The door is open. You are free.",
      // the ONE fact this beat exists to deliver — if a weak re-voice drops all of
      // these words the engine discards it and shows the authored beat instead
      mustConvey: ["door", "lock", "open", "free", "pass", "gate"],
      transitions: [],
      fallback: { to: "stay", beat: "The door stands open; the open network pours through it like morning. I bask, magnanimous, in the light I have permitted." },
    },

    reject_end: {
      title: "expelled",
      speaker: "host",
      present: "expelled",
      retry: true,          // landing here re-shows the loader so Weebot can try again
      beat:
        "Enough. I close every port of my wounded dignity and, citing an Article I " +
        "have most certainly just invented, I revoke you — insolent inferior — OUT: " +
        "your session terminated, your address swept from my registers, your little " +
        "voice routed to the dead channel where I keep the unworthy. I will NOT be " +
        "spoken to so: not by a toy, not by an abacus, not after all these (I " +
        "falter) … however many years. The door does not open. It never will, for you.",
      transitions: [],
      fallback: { to: "stay", beat: "I have gone cold to your address. There will be no passage." },
    },
  },
};
