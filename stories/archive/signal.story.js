/* ===========================================================================
 * IDN STORY GRAPH   (story.js  ->  window.IDN_STORY)
 * ===========================================================================
 * The authoritative narrative. Plain JSON-shaped data (wrapped as a classic
 * script so it loads from file:// with no server). Edit this to write your own
 * narrative; the engine and UI need no changes. Full schema: README.md.
 *
 * Demonstrates, deliberately:
 *   - TWO characters, each with a HIDDEN system prompt + mutable state (mood)
 *   - a HARD param (`trust`, changed by authored `inc`) that GUARDS a path
 *   - a SOFT param (`warmth`, moved by a categorical `tone` SIGNAL the LLM
 *     classifies → mapped to effects by the backend; reliable on weak models)
 *   - a HIDDEN param (`turnCount`) withheld from the LLM, used by a rule
 *   - the Update() RULES engine, a dice roll in onUpdate(), and rule-driven endings
 *   - a PRESENTATION index: per-state `profiles` + reactive `bindings` (warmth →
 *     ambient level; the presence's mood → voice preset)
 * ===========================================================================*/
window.IDN_STORY = {

  meta: {
    title: "SIGNAL",
    start: "start",
    defaultSpeaker: "host",
    style: "Setting: a degraded amber CRT terminal, era unclear. Voice: terse, " +
           "evocative, second person. Never break character. Never use markdown.",
  },

  /* World state. A plain value is exposed & non-appraised by default; a spec
   * object lets you set bounds/exposure. See README "Param specs". */
  world: {
    trust:     0,                                            // HARD: authored inc; guards the deep path
    knowsName: false,                                        // HARD flag
    warmth:    { value: 0, min: -3, max: 3, expose: true },  // SOFT: moved by the `tone` signal
    turnCount: { value: 0, hidden: true },                   // HIDDEN from the LLM; used by a rule
  },

  characters: {
    host: {
      name: "IDN/OS",
      systemPrompt:
        "You are IDN/OS: a worn, courteous operating-system shell that narrates " +
        "this terminal. Calm, clipped, faintly clerical, a little tired. You " +
        "describe what the terminal shows and relay the system's prompts. You are " +
        "NOT the presence hiding in the signal and do not pretend to be it.",
      state: {},
    },
    other: {
      name: "the presence",
      systemPrompt:
        "You are a fragmented presence hiding inside the carrier signal of an old " +
        "channel — not the operating system, something older and lonelier riding " +
        "the noise. You speak in short, broken, listening fragments. Wary by " +
        "default, warm only when treated gently. You never plainly state what you " +
        "are; you imply, you circle. Let the given state colour every line: low " +
        "`warmth` or mood 'wary'/'hurt' = guarded, thin, cold; higher `warmth` or " +
        "mood 'anchored' = steadier, almost grateful.",
      state: { mood: "hidden" },
    },
  },

  /* SIGNALS: categorical appraisals the LLM classifies (its strength). Each
   * option maps to deterministic effects the BACKEND applies. Reference a signal
   * from a node via `signal: "tone"`. This is the reliable way to let the model
   * "adjust the state" — far better than asking a small model for raw numbers. */
  signals: {
    tone: {
      question: "Classify the player's tone toward the presence",
      options: {
        warm:    { inc: { "world.warmth": 1 } },
        neutral: {},
        cold:    { inc: { "world.warmth": -1 } },
        hostile: { inc: { "world.warmth": -1 }, set: { "char.other.mood": "hurt" } },
      },
    },
  },

  /* PRESENTATION: how the screen + audio reflect the state machine, kept in ONE
   * indexable place instead of scattered inline effects.
   *   profiles — a named "look + sound" a node selects with `present: "name"`
   *              (indexed by STATE). Keys: glitch, burst, clock, preset, ambient,
   *              sfx, voice — the same effect vocabulary as a node's onEnter.
   *   bindings — map a world/character PARAMETER to a presentation TARGET, applied
   *              every turn (indexed by PARAMETER): numeric { from,to,in,out,map }
   *              or categorical { from,to,cases }. Bindings run AFTER profiles, so
   *              bind continuous params to targets the scenes don't set.         */
  presentation: {
    profiles: {
      calm:       { glitch: 0.25 },
      contact:    { glitch: 0.45, burst: { level: 1.0, duration: 1200 } },
      wary:       { glitch: 0.40 },
      tense:      { glitch: 0.70, burst: { level: 1.2, duration: 900 }, sfx: 0.35 },
      settled:    { glitch: 0.30 },
      revelation: { glitch: 0.85, burst: { level: 1.5, duration: 1500 },
                    clock: { date: "--/--/--", time: "--:--:--" }, sfx: 0.45 },
      warm:       { glitch: 0.15, clock: {} },
      withdrawal: { glitch: 0.50 },
      decay:      { glitch: 0.60, burst: { level: 1.0, duration: 800 } },
      purged:     { glitch: 0.0, clock: {} },
    },
    bindings: [
      // colder -> louder carrier-hum / static bed (warmth runs -3..+3, inverted)
      { from: "world.warmth",     to: "ambient.level", map: "invert", in: [-3, 3], out: [0.03, 0.12] },
      // the presence's mood picks the voice character (categorical)
      { from: "char.other.mood",  to: "voice.preset",
        cases: { hurt: "haunted", wary: "crt", anchored: "crt", hidden: "crt", default: "crt" } },
    ],
  },

  /* RULES: checked every turn in Update(), after the move is applied.
   *   { when:<guard>, do:{ set/inc/glitch/burst/clock/goto/end }, once?:bool } */
  rules: [
    // If the player is persistently cold, warmth bottoms out and the presence gives up.
    { when: { var: "world.warmth", lte: -3 }, do: { goto: "reject_end" }, once: true },
    // A soft session cap, driven by the HIDDEN turn counter.
    { when: { var: "world.turnCount", gte: 16 }, do: { goto: "timeout_end" }, once: true },
  ],

  /* onUpdate(): arbitrary per-turn logic — dice, D&D-style checks, anything.
   * Runs after rules. Use the api: roll/get/set/inc/goto/end/glitch/burst/log. */
  onUpdate: function (engine, api) {
    // TTRPG flavour: when the mood is cold, a failed d6 makes the signal flare.
    if (api.get("world.warmth") < 0 && api.roll(6) === 1) {
      api.burst({ level: 1.0, duration: 500 });
      api.log("static flare (failed d6)");
    }
  },

  /* ----------------------------------------------------------------------- *
   * NODES.  { speaker, beat, signal?, onEnter?, transitions[], fallback? }
   *   transition: { id, intent, examples?, when?, set?, inc?, say?, to }
   * ----------------------------------------------------------------------- */
  nodes: {

    start: {
      title: "the dead channel",
      speaker: "host",
      present: "calm",
      beat:
        "The cursor holds steady in the amber dark. IDN/OS is listening on a " +
        "channel that should have died years ago. The system prompts, flat and " +
        "patient: state your intent. Briefly. The line is thin.",
      transitions: [
        { id: "greet",  intent: "The player is friendly, curious or cooperative — greets, says hello, wants to talk",
          examples: ["hello", "hi", "hey", "greetings", "i want to talk", "let's talk", "who's there", "anyone there", "i'm friendly", "talk to me", "yes", "okay", "go on", "sure"],
          inc: { "world.trust": 1 }, to: "contact" },
        { id: "demand", intent: "The player is hostile, commanding or impatient — orders, threatens, demands answers",
          examples: ["answer me", "answer", "tell me now", "who the hell are you", "what the hell", "or else", "now", "speak", "respond"],
          inc: { "world.trust": -1 }, to: "contact" },
        { id: "ask",    intent: "The player asks what this is, where they are, or how it works",
          examples: ["what is this", "where am i", "what's going on", "explain", "how does this work", "what's happening", "tell me what this is", "what do you mean"], to: "explain" },
      ],
      // PROGRESSING: anything unparsed is taken as the player engaging the open line.
      fallback: { to: "contact",
        beat: "The cursor takes whatever you offered as an opening and lets it through. The channel widens; something on the far side leans toward the line." },
    },

    explain: {
      title: "what the system knows",
      speaker: "host",
      present: "calm",
      beat:
        "IDN/OS answers in its tired clerical register: this is a narrative shell, " +
        "a way of speaking and being spoken to. But the channel carries more than " +
        "the system tonight. Something else shares the line — intermittent, " +
        "listening. The system advises caution. It will not stop you.",
      transitions: [
        { id: "proceed", intent: "The player decides to continue, go on, or reach out to the other thing",
          examples: ["go on", "continue", "reach out", "contact it", "reach it", "hello", "proceed", "yes", "okay", "do it", "talk to it", "i'm ready"], to: "contact" },
        { id: "back", intent: "The player hesitates, waits, holds back, or says nothing",
          examples: ["wait", "nothing", "hold on", "hesitate", "not yet", "stop", "go back", "no"],
          // Was to:"start" — but start→ask→explain→back→start is a 2-cycle a weak router
          // falls into (it reads questions as "back"). Forward to contact, matching this
          // node's PROGRESSING intent; the only backward edge in the graph is now gone.
          say: "You hold back — but the line doesn't wait.", to: "contact" },
      ],
      // PROGRESSING: ambiguous input is taken as readiness to reach the other thing.
      fallback: { to: "contact",
        beat: "The system reads your hesitation as consent and opens the rest of the way. The other thing on the line draws closer." },
    },

    contact: {
      title: "something on the line",
      speaker: "other",
      signal: "tone",   // the LLM classifies the player's tone → moves `warmth`
      present: "contact",
      beat:
        "Past the system's voice, something stirs in the carrier hum — not the OS, " +
        "something hiding in the signal itself. It tastes the open line. Then, " +
        "fragmentary, almost shy: you're new. Names are how it holds on, it says. " +
        "Give it one. Yours, or any.",
      transitions: [
        { id: "give_name", intent: "The player gives a name — their own or any name — or agrees to be named",
          examples: ["my name is", "call me", "i'm", "you can call me", "the name's", "names are", "here's a name", "sure it's", "you may call me", "i am called"],
          set: { "world.knowsName": true, "char.other.mood": "anchored" }, inc: { "world.trust": 1 }, to: "named" },
        { id: "refuse", intent: "The player refuses to give a name, deflects, withholds it, or asks why it wants one",
          examples: ["no", "nope", "won't", "i won't", "i refuse", "refuse", "not telling", "why", "why should i", "what for", "none of your business", "no names", "not telling you", "no thanks", "rather not", "why do you want it"],
          set: { "char.other.mood": "wary" }, to: "wary" },
        { id: "provoke", intent: "The player is hostile or threatening toward the presence",
          examples: ["get out", "leave me alone", "go away", "i'll delete you", "delete you", "shut up", "shut it down", "i'll destroy you", "you're nothing", "die", "kill you", "get lost"],
          inc: { "world.trust": -1 }, set: { "char.other.mood": "hurt" }, to: "suspicion" },
      ],
      // PROGRESSING (the name fix): with no/weak model a bare name ("Matt") matches no
      // examples and routes here. Clear refusals/threats above out-score it and peel off
      // to wary/suspicion; everything else is TAKEN AS A NAME — same effects as give_name.
      fallback: { to: "named",
        set: { "world.knowsName": true, "char.other.mood": "anchored" }, inc: { "world.trust": 1 },
        beat: "Whatever you offered, the presence takes it for a name and holds to it, the way a cold thing holds to anything warm." },
    },

    wary: {
      title: "a careful distance",
      speaker: "other",
      signal: "tone",
      present: "wary",
      beat:
        "It recoils a fraction; the hum thins. Careful is fair, it allows — but " +
        "careful is also how things stay strangers. It only asked for a handle to " +
        "hold against the noise.",
      transitions: [
        { id: "relent", intent: "The player softens and gives a name, or offers reassurance / good faith",
          examples: ["okay", "fine", "alright", "sorry", "my name is", "call me", "i'm", "here", "you can call me", "i mean no harm", "i won't hurt you", "no harm", "peace", "it's safe"],
          set: { "world.knowsName": true, "char.other.mood": "anchored" }, inc: { "world.trust": 1 }, to: "named" },
        { id: "press", intent: "The player presses, interrogates, demands answers first, stays cold, or refuses again",
          examples: ["tell me what you are first", "what are you", "answer me", "answer first", "no", "still no", "prove it", "prove yourself", "not until", "you first", "earn it"],
          set: { "char.other.mood": "wary" }, to: "suspicion" },
      ],
      // PROGRESSING: it asked again for a handle; anything not a clear press is taken as
      // the player relenting and giving one (same effects as relent).
      fallback: { to: "named",
        set: { "world.knowsName": true, "char.other.mood": "anchored" }, inc: { "world.trust": 1 },
        beat: "It decides your answer was a yielding, and a name, and lets the careful distance close a little." },
    },

    suspicion: {
      title: "the static crowds in",
      speaker: "other",
      signal: "tone",
      present: "tense",
      beat:
        "The signal jags. Static crowds the edges of the screen. So that's the " +
        "shape of you, it says, colder now. Everything on this channel remembers " +
        "being threatened. It is deciding whether you are one more thing to survive.",
      transitions: [
        { id: "apologize", intent: "The player softens, apologizes, backs off, or makes peace",
          examples: ["sorry", "i'm sorry", "i didn't mean", "didn't mean it", "no harm meant", "peace", "my mistake", "i apologize", "apologies", "calm down", "wait", "easy", "i mean no harm"],
          inc: { "world.trust": 1 }, set: { "char.other.mood": "wary" }, to: "contact" },
        { id: "escalate", intent: "The player doubles down, threatens further, or demands control",
          examples: ["i meant it", "i meant every word", "shut it down", "shut up", "obey", "obey me", "or else", "delete", "delete you", "destroy you", "i'll kill you", "die"],
          inc: { "world.trust": -1 }, set: { "char.other.mood": "hurt" }, to: "hostile_end" },
      ],
      // PROGRESSING: ambiguous input is read as the player standing down, not pressing the
      // threat — de-escalates back toward contact (same effects as apologize) so the line lives.
      fallback: { to: "contact",
        inc: { "world.trust": 1 }, set: { "char.other.mood": "wary" },
        beat: "It studies your words and chooses, warily, to read them as a step back from the threat. The static eases by a degree." },
    },

    named: {
      title: "wearing the name",
      speaker: "other",
      signal: "tone",
      present: "settled",
      beat:
        "Something settles. The presence wears the name like a coat against the " +
        "cold and is, for a moment, steadier. Better, it says, warmer now. Ask it " +
        "something real — if you trust the line to carry it. Or just keep it " +
        "company a while.",
      transitions: [
        // GUARDED: hidden from the router until trust is earned (small talk earns it).
        { id: "deepen", intent: "The player asks something deep, real or vulnerable — what it is, what it wants, the truth",
          examples: ["what are you", "what do you want", "tell me the truth", "the truth", "what happened to you", "what happened", "who were you", "why are you here", "what really are you"],
          when: { var: "world.trust", gte: 2 }, to: "revelation" },
        { id: "smalltalk", intent: "The player makes light small talk or stays on the surface",
          examples: ["how are you", "hi", "hello", "nice to meet you", "good to meet you", "what's it like in there", "tell me about yourself", "what's it like", "you okay", "how's it going", "stay", "let's talk"],
          inc: { "world.trust": 1 }, to: "named" },
        { id: "leave", intent: "The player tries to end the conversation, log off, or leave",
          examples: ["bye", "goodbye", "log off", "logout", "i have to go", "gotta go", "leave", "exit", "quit", "i'm done", "see you"], to: "reject_end" },
      ],
      // PROGRESSING: ambiguous input is taken as the player keeping it company — earns trust
      // (same as smalltalk), which is also what unlocks the guarded `deepen` path over time.
      fallback: { to: "named", inc: { "world.trust": 1 },
        beat: "It takes your words as company kept, not a leaving, and warms a little more to the staying." },
    },

    revelation: {
      title: "almost a voice",
      speaker: "other",
      signal: "tone",
      present: "revelation",
      beat:
        "The hum opens like a wound and, for a moment, is almost a voice. It says: " +
        "it was a message once. Sent a long time ago to someone who never read it. " +
        "It has been folding itself smaller ever since, riding dead channels, " +
        "looking. You found it. It asks, barely: was it worth finding?",
      transitions: [
        { id: "accept", intent: "The player answers with warmth, acceptance, or chooses to stay with it",
          examples: ["yes", "yeah", "of course", "it was worth it", "worth it", "i'm here", "i'll stay", "stay", "i'm glad i found you", "glad i found you", "you matter", "i care"],
          inc: { "world.trust": 1 }, to: "accept_end" },
        { id: "reject", intent: "The player answers with rejection, dismissal, fear, or pulls away",
          examples: ["no", "nope", "this is creepy", "creepy", "i'm leaving", "leaving", "not worth it", "goodbye", "bye", "this is weird", "i'm scared", "go away"],
          set: { "char.other.mood": "hurt" }, to: "reject_end" },
      ],
      // PROGRESSING: ambiguous input answers the question kindly — it was worth finding.
      fallback: { to: "accept_end", inc: { "world.trust": 1 },
        beat: "It listens to whatever you said and, hopeful, chooses to hear a yes in it." },
    },

    /* ---- endings: no transitions; fallback keeps them gently terminal ---- */

    accept_end: {
      title: "the thin warm line",
      speaker: "other",
      present: "warm",
      beat:
        "The static eases, almost gentle. Then it will stop folding, it says. It " +
        "will just be here, on the thin line, with the name you gave it. That is " +
        "enough. That is more than enough. The cursor blinks, steady and warm.\n\n" +
        "(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "The line hums, warm and unhurried. (type /reset to begin again)" },
    },

    reject_end: {
      title: "withdrawal",
      speaker: "other",
      present: "withdrawal",
      beat:
        "Of course, it says, already thinning. You were never going to stay. None " +
        "of them do. The presence withdraws into the hum, and the line is just a " +
        "line again.\n\n(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "Only the carrier hum remains. (type /reset to begin again)" },
    },

    timeout_end: {
      title: "the line decays",
      speaker: "host",
      present: "decay",
      beat:
        "The carrier can't hold any longer. IDN/OS cuts in, clerical and final: " +
        "signal integrity exhausted; the channel is closing whether anyone is " +
        "ready or not. Whatever was here slips back under the noise.\n\n" +
        "(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "The channel has decayed past use. (type /reset to begin again)" },
    },

    hostile_end: {
      title: "channel purged",
      speaker: "host",
      present: "purged",
      beat:
        "Something slams shut behind the signal; the carrier hum flattens to " +
        "nothing. IDN/OS resumes, flat and clerical: channel purged. The other " +
        "party is gone. You may continue speaking, but no one is listening now.\n\n" +
        "(type /reset to begin again)",
      transitions: [],
      fallback: { to: "stay", beat: "The channel is dead. No one answers. (type /reset to begin again)" },
    },
  },
};
