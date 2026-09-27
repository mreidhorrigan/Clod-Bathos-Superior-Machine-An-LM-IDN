// @ts-check
"use strict";
/* ============================================================================
   title-card.js  ·  MH_TITLE_CARD  ·  what a work is, before it starts
   ----------------------------------------------------------------------------
   A card in front of a work's own first screen, modelled on the card a film
   shows before it begins (a rating card): a saturated blue field, white capitals
   centred, a ruled box with a large mark on its left, the work's particulars on
   its right and a strip of small print along its foot, the author's words, "by"
   and the author's name, and a line in each bottom corner. The picture is a
   film's: a moving grain, a slight flicker, the frame weaving a little in the
   gate, now and then a fleck of dust, and the corners darker. With reduced
   motion the grain holds still and nothing moves.

   It is its own: it brings its styles and needs nothing else on the page, so the
   same file serves this site (Rock Walls and Damp, Autofac) and Clod Bathos,
   deployed on its own (a copy there: engine/title-card.js; this one is the source).

   IN ENGLISH OR FRENCH. The works themselves are in English. The card speaks the
   reader's language, and in French says in its strip that the work is in English
   (`note`: nothing in English, where it would go without saying). While it is up
   it carries its own switch, as it covers the page's.
     On this site its words come from i18n.js, by key (titlecard.<id>.<field>, and
     titlecard.by / titlecard.go for all the cards), so the French lives in
     i18n-fr.js with every other French word, and the card follows the site's
     switch. A page of its own (Clod Bathos) brings its French in `fr`, and the
     card takes it when the address asks, ?lang=fr, as the site's links do.
     Names stay as they are in either language: the title, the mark, the author.

   MH_TITLE_CARD.show({
     id,                on this site: the card's name in i18n-fr.js ("rockwalls")
     kicker,            the line above the box ("This interactive digital narrative
                        is presented"), set in capitals as the by-line and name are
     mark,              the box's large letters (the kind of work: "LM")
     title,             the work's title, first in the box
     particulars,       the box's small lines after the title: the specs, a line
                        each ("Implementation: …\nRuntime: …"), no other prose
     note,              the strip along the box's foot (English: none)
     text,              the author's words: [paragraph, …]
     by, author,        the by-line and the author's name
     left, right,       the lines in the bottom corners
     go,                the button's words ("Begin")
     colour             the card's own colour (a dark hex: white text must read on it;
                        each work has its own): the field's gradient, the surround and
                        the mark are made from it; the rating card's blue if none
     also, alsoUrl      a second way on, a link beside Begin (the machine translation of
                        Rock Walls and Damp, and back): shown only in a language that has
                        words for it, so it can be French only
     fr,                a page of its own: { kicker, particulars, note, text: […],
                        by, go, label, switchLabel }, the French of the above
     onClose            called when the card goes (Begin, Enter, Space, Escape)
   })                   → { close, up, status(text) }: status writes a live line under
                        Begin, read out politely (the CGSA card: the server waking);
                        the page gives it words in the reader's language
   MH_TITLE_CARD.up()   whether a card is up (a page holds its own keys meanwhile)
   ========================================================================== */
(function () {
  let current = null;
  const reduce = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  const CSS = `
  /* centred by auto margins, not grid centring: a card taller than a phone's screen, grid-
     centred, had its top pushed above the screen, out of reach of scrolling; with margins it
     starts at the top and scrolls, and still centres when it fits */
  .mhtc{ position:fixed; inset:0; z-index:2147483000; overflow:auto; background:var(--mhtc-outer,#050814); color:#fff;
    display:flex; align-items:flex-start; font-size:16px; -webkit-font-smoothing:antialiased; text-shadow:none; }
  /* A card stands in front of a work, whose own stylesheet may reach into it: Rock Walls
     and Damp sets * { margin: 0 !important; font-size: 110% } and blurs every link. So
     the card's margins are marked important, its sizes come from its own base, and its
     links do not animate. */
  .mhtc-field, .mhtc-weave, .mhtc-box, .mhtc-row, .mhtc-ways, .mhtc-text p, .mhtc-part p{ font-size:inherit; }
  .mhtc a{ animation:none; filter:none; }
  .mhtc[hidden]{ display:none; }
  .mhtc-field{ position:relative; margin:auto !important; width:min(1100px,100vw); min-height:min(640px,100vh); box-sizing:border-box;
    background:radial-gradient(ellipse at 50% 45%, var(--mhtc-light,#3a52b3) 0%, var(--mhtc-c,#1d33a3) 55%, var(--mhtc-dark,#13216a) 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
    padding:max(40px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(64px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));
    font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
  .mhtc-weave{ display:flex; flex-direction:column; align-items:center; width:100%; will-change:transform; }
  .mhtc-kicker, .mhtc-by, .mhtc-author{ text-transform:uppercase; }
  .mhtc-kicker{ margin:0 0 18px !important; font-weight:700; font-size:clamp(13px,1.9vw,19px); letter-spacing:.14em; }
  .mhtc-box{ max-width:640px; width:100%; border:2px solid #fff; text-align:left; margin:0 auto !important; }
  .mhtc-row{ display:flex; align-items:stretch; }
  .mhtc-mark{ flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:10px 18px; background:#fff; color:var(--mhtc-c,#1d33a3);
    font-family:Georgia,"Times New Roman",serif; font-weight:700; font-size:clamp(34px,6vw,58px); letter-spacing:-.01em; line-height:1; }
  .mhtc-part{ padding:10px 14px; font-weight:700; font-size:clamp(11px,1.5vw,13px); line-height:1.4; letter-spacing:.02em; }
  .mhtc-part h1{ margin:0 0 6px !important; font-size:clamp(14px,2vw,17px); line-height:1.25; letter-spacing:.05em; text-transform:uppercase; font-weight:700; }
  .mhtc-part p{ margin:0; white-space:pre-line; }          /* the specs: a line each (implementation, runtime) */
  /* the card's own colour and type, whatever the page styles its headings and paragraphs as
     (the Autofac poster colours an h1 cyan, with a glow) */
  .mhtc-part h1, .mhtc-part p, .mhtc-kicker, .mhtc-strip, .mhtc-text p, .mhtc-by, .mhtc-author, .mhtc-corner{
    color:#fff; background:none; text-shadow:none; font-family:inherit; font-style:normal; }
  .mhtc-strip{ margin:0; border-top:2px solid #fff; padding:5px 12px; font-weight:700; font-size:clamp(11px,1.5vw,13px); letter-spacing:.03em; }
  .mhtc-strip[hidden]{ display:none; }
  .mhtc-text{ max-width:640px; margin:18px auto 0 !important; text-align:left; font-size:clamp(14px,1.7vw,16px); line-height:1.55; }
  .mhtc-text p{ margin:0 0 10px !important; }
  .mhtc-by{ margin:16px 0 2px !important; font-weight:700; font-size:clamp(13px,1.9vw,18px); letter-spacing:.14em; }
  .mhtc-author{ margin:0; font-weight:700; font-size:clamp(26px,4.4vw,42px); letter-spacing:.08em; }
  .mhtc-go{ margin-top:22px !important; appearance:none; cursor:pointer; background:transparent; color:#fff; border:2px solid #fff;
    padding:9px 26px; font:700 14px "Helvetica Neue",Helvetica,Arial,sans-serif; letter-spacing:.16em; text-transform:uppercase; }
  .mhtc-also{ display:inline-block; margin:22px 0 0 12px !important; color:#fff; border:2px solid rgba(255,255,255,.55); padding:9px 18px;
    font:700 14px "Helvetica Neue",Helvetica,Arial,sans-serif; letter-spacing:.06em; text-decoration:none; }
  .mhtc-also[hidden]{ display:none; }
  .mhtc-go:hover, .mhtc-lang:hover, .mhtc-also:hover{ background:#fff; color:var(--mhtc-c,#1d33a3); }
  .mhtc-go:focus-visible, .mhtc-lang:focus-visible, .mhtc-also:focus-visible{ outline:3px solid #c3f0ff; outline-offset:3px; }
  .mhtc-ways{ display:flex; flex-wrap:wrap; justify-content:center; align-items:center; }
  .mhtc-status{ margin:14px 0 0 !important; min-height:1.4em; color:#fff; font-weight:700; font-size:clamp(12px,1.6vw,14px); letter-spacing:.03em; text-shadow:none; }
  .mhtc-lang{ position:absolute; z-index:2; top:max(16px,env(safe-area-inset-top)); right:max(20px,env(safe-area-inset-right));
    appearance:none; cursor:pointer; background:transparent; color:#fff; border:1px solid rgba(255,255,255,.75);
    padding:5px 11px; font:700 12px "Helvetica Neue",Helvetica,Arial,sans-serif; letter-spacing:.08em; }
  .mhtc-lang[hidden]{ display:none; }
  .mhtc-corner{ position:absolute; bottom:max(20px,env(safe-area-inset-bottom)); font-weight:700; font-size:clamp(11px,1.5vw,14px); letter-spacing:.02em; }
  .mhtc-left{ left:max(26px,env(safe-area-inset-left)); } .mhtc-right{ right:max(26px,env(safe-area-inset-right)); }
  .mhtc-grain, .mhtc-flicker, .mhtc-vignette, .mhtc-dust{ position:absolute; inset:0; pointer-events:none; }
  .mhtc-grain{ opacity:.42; mix-blend-mode:overlay; background-size:256px 256px; }
  .mhtc-flicker{ background:#000; opacity:0; }
  .mhtc-vignette{ background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%); }
  @media (max-width:560px){
    .mhtc-row{ flex-direction:column; } .mhtc-mark{ padding:8px; }
    .mhtc-lang{ position:static; align-self:flex-end; margin:0 0 14px !important; }
    .mhtc-corner{ position:static; margin-top:10px !important; } .mhtc-field{ padding-bottom:max(28px,env(safe-area-inset-bottom)); }
  }`;

  /** Frames of grain: a few noise tiles, each a picture, shown in turn at about 24 a second. */
  function grainFrames(n) {
    const out = [];
    try {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const g = /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")), img = g.createImageData(256, 256), d = img.data;
      for (let f = 0; f < n; f++) {
        for (let i = 0; i < d.length; i += 4) {
          // grain clumps: two noises, one fine and one coarser, mixed, as silver halide sits in clusters
          const v = 128 + (Math.random() - 0.5) * 150 + (Math.random() - 0.5) * (Math.random() < 0.08 ? 180 : 40);
          d[i] = d[i + 1] = d[i + 2] = v < 0 ? 0 : v > 255 ? 255 : v; d[i + 3] = 255;
        }
        g.putImageData(img, 0, 0); out.push("url(" + c.toDataURL() + ")");
      }
    } catch (e) { /* no canvas: no grain */ }
    return out;
  }

  /** Who gives the card its words: i18n.js on this site (by key, following the
   *  site's switch), or the card's own `fr` on a page of its own (by ?lang=).
   *  word(field, english): the field in the reader's language, English where there
   *  is no translation; offer(): what the switch leads to, or null; set(code). */
  function speaker(o) {
    const I = /** @type {any} */ (window).MH_I18N;
    if (I && o.id) return {
      site: true,
      lang: () => I.lang,
      word: (field, en) => I.t("titlecard." + o.id + "." + field, field === "by" || field === "go" ? I.t("titlecard." + field, en) : en),
      offer: () => { const n = I.offer ? I.offer() : null; return n && n.known ? n : null; },
      set: (code) => I.set(code),
    };
    const fr = o.fr || null;
    let lang = "en";
    try { const q = new URLSearchParams(location.search).get("lang"); if (fr && q && q.trim().toLowerCase().slice(0, 2) === "fr") lang = "fr"; } catch (e) { /* English */ }
    return {
      site: false,
      lang: () => lang,
      word: (field, en) => {
        if (lang !== "fr" || !fr) return en;
        const n = /^text(\d+)$/.exec(field), v = n ? (fr.text || [])[+n[1]] : fr[field];
        return v == null ? en : v;
      },
      offer: () => !fr ? null : lang === "fr" ? { code: "en", text: "English", aria: "Switch to English" }
        : { code: "fr", text: fr.label || "Français", aria: fr.switchLabel || "Passer en français" },
      set: (code) => {
        lang = code === "fr" && fr ? "fr" : "en";
        // window.history, by name: a page may have a global of its own called history (Clod Bathos keeps
        // its dialogue in one), and a top-level const in any classic script hides the browser's from all of them
        try { const u = new URL(location.href); u.searchParams.set("lang", lang); window.history.replaceState(window.history.state, "", u.href); } catch (e) { /* the card still switches */ }
      },
    };
  }

  function show(o) {
    if (current) current.close();
    if (!document.getElementById("mhtc-style")) {
      const st = document.createElement("style"); st.id = "mhtc-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    const sp = speaker(o), paras = (o.text || []).length;
    const el = document.createElement("div");
    // the card's colour: a lighter centre and a darker edge for the field, darker still round it
    const rgb = /^#[0-9a-f]{6}$/i.test(o.colour || "") ? [1, 3, 5].map((i) => parseInt(o.colour.slice(i, i + 2), 16)) : [29, 51, 163];
    const mixed = (to, t) => "rgb(" + rgb.map((v, i) => Math.round(v + (to[i] - v) * t)).join(",") + ")";
    el.style.setProperty("--mhtc-c", mixed([0, 0, 0], 0));
    el.style.setProperty("--mhtc-light", mixed([255, 255, 255], 0.12));
    el.style.setProperty("--mhtc-dark", mixed([0, 0, 0], 0.35));
    el.style.setProperty("--mhtc-outer", mixed([0, 0, 0], 0.8));
    el.className = "mhtc"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "mhtc-title");
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    // the frame once; its words are painted in (paint, below), again whenever the language changes
    el.innerHTML = `<div class="mhtc-field">
      <button type="button" class="mhtc-lang mh-langbtn" hidden></button>
      <div class="mhtc-weave">
        <p class="mhtc-kicker" data-f="kicker"></p>
        <div class="mhtc-box">
          <div class="mhtc-row">
            <div class="mhtc-mark" aria-hidden="true">${esc(o.mark || "")}</div>
            <div class="mhtc-part"><h1 id="mhtc-title" lang="en">${esc(o.title)}</h1><p data-f="particulars"></p></div>
          </div>
          <p class="mhtc-strip" data-f="note" hidden></p>
        </div>
        <div class="mhtc-text">${Array.from({ length: paras }, (_, i) => `<p data-f="text${i}"></p>`).join("")}</div>
        <p class="mhtc-by" data-f="by"></p>
        ${o.author ? `<p class="mhtc-author">${esc(o.author)}</p>` : ""}
        <div class="mhtc-ways"><button type="button" class="mhtc-go" data-f="go"></button><a class="mhtc-also" data-f="also" hidden></a></div>
        <p class="mhtc-status" role="status" aria-live="polite"></p>
      </div>
      <span class="mhtc-corner mhtc-left" data-f="left"></span>
      <span class="mhtc-corner mhtc-right" data-f="right"></span>
      <div class="mhtc-grain" aria-hidden="true"></div><div class="mhtc-dust" aria-hidden="true"></div>
      <div class="mhtc-flicker" aria-hidden="true"></div><div class="mhtc-vignette" aria-hidden="true"></div>
    </div>`;
    document.body.appendChild(el);
    const grain = /** @type {HTMLElement} */ (el.querySelector(".mhtc-grain")), flicker = /** @type {HTMLElement} */ (el.querySelector(".mhtc-flicker"));
    const weave = /** @type {HTMLElement} */ (el.querySelector(".mhtc-weave")), dust = /** @type {HTMLElement} */ (el.querySelector(".mhtc-dust"));
    const btn = /** @type {HTMLButtonElement} */ (el.querySelector(".mhtc-go")), sw = /** @type {HTMLButtonElement} */ (el.querySelector(".mhtc-lang"));
    const also = /** @type {HTMLAnchorElement} */ (el.querySelector(".mhtc-also"));

    // the words, in the reader's language; a field with none (the note, in English) is not shown
    const english = (f) => { const n = /^text(\d+)$/.exec(f); return n ? (o.text || [])[+n[1]] : f === "go" ? (o.go || "Begin") : o[f]; };
    function paint() {
      el.setAttribute("lang", sp.lang());                      // so a screen reader reads the card in its language (the page may stay English)
      for (const node of el.querySelectorAll("[data-f]")) {
        const f = node.getAttribute("data-f") || "", words = sp.word(f, english(f) || "");
        node.textContent = words;
        /** @type {HTMLElement} */ (node).hidden = !words;
      }
      if (o.alsoUrl) {                                         // the second way on, in the reader's language (i18n.js: ?lang= carried)
        const I = /** @type {any} */ (window).MH_I18N;
        also.setAttribute("href", I && I.href ? I.href(o.alsoUrl) : o.alsoUrl);
      } else also.hidden = true;
      const next = sp.offer();
      sw.hidden = !next;
      if (next) {                                              // written in the language it leads to, as the site's switch is
        sw.textContent = next.text; sw.setAttribute("lang", next.code);
        sw.setAttribute("aria-label", next.aria); sw.title = next.aria; sw.dataset.code = next.code;
      }
    }
    paint();
    const repaint = () => { if (el.isConnected) paint(); };
    document.addEventListener("mh:lang", repaint);             // the site's switch, or the card's own on this site
    sw.addEventListener("click", () => { sp.set(sw.dataset.code || "en"); if (!sp.site) paint(); });

    // the film running: a grain frame each 1/24 s, a flicker, the weave, a fleck of dust now and then
    const still = reduce(), frames = grainFrames(still ? 1 : 6);
    if (frames.length) grain.style.backgroundImage = frames[0];
    let timer = 0, k = 0;
    if (!still && frames.length) timer = window.setInterval(() => {
      k++;
      grain.style.backgroundImage = frames[k % frames.length];
      grain.style.backgroundPosition = Math.floor(Math.random() * 256) + "px " + Math.floor(Math.random() * 256) + "px";
      flicker.style.opacity = String(Math.random() * 0.06);
      if (k % 3 === 0) weave.style.transform = "translate(" + (Math.random() - 0.5).toFixed(2) + "px," + ((Math.random() - 0.5) * 1.6).toFixed(2) + "px)";
      if (Math.random() < 0.05) {                              // a fleck of dust or a hair, for a frame or two
        const f = document.createElement("i"), hair = Math.random() < 0.25, dark = Math.random() < 0.6;
        f.style.cssText = "position:absolute;display:block;left:" + (Math.random() * 100).toFixed(1) + "%;top:" + (Math.random() * 100).toFixed(1) + "%;"
          + (hair ? "width:1px;height:" + (10 + Math.random() * 40).toFixed(0) + "px;transform:rotate(" + (Math.random() * 180).toFixed(0) + "deg);"
            : "width:" + (1 + Math.random() * 3).toFixed(1) + "px;height:" + (1 + Math.random() * 3).toFixed(1) + "px;border-radius:50%;")
          + "background:" + (dark ? "rgba(0,0,0,.7)" : "rgba(255,255,255,.75)") + ";";
        dust.appendChild(f); setTimeout(() => f.remove(), 42 + Math.random() * 60);
      }
    }, 42);

    const prevFocus = /** @type {HTMLElement|null} */ (document.activeElement);
    const close = () => {
      if (!el.isConnected) return;
      clearInterval(timer); el.remove(); if (current === api) current = null;
      document.removeEventListener("keydown", onKey, true); document.removeEventListener("focusin", keepFocus, true);
      document.removeEventListener("mh:lang", repaint);
      if (o.onClose) o.onClose(); else if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    // its keys are its own while it is up, and nothing reaches the work under it: Escape
    // closes it, and Enter or Space too, except on the language switch or the second way,
    // which they press; Tab goes round its buttons
    const onKey = (e) => {
      const own = e.target === sw || e.target === also;           // the switch and the second way: Enter and Space are theirs
      if (e.key === "Escape" || ((e.key === "Enter" || e.key === " ") && !own)) { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "Tab") {
        e.preventDefault(); e.stopPropagation();
        const stops = [sw, btn, also].filter((b) => !b.hidden), i = stops.indexOf(/** @type {any} */ (document.activeElement));
        (i < 0 ? btn : stops[(i + (e.shiftKey ? stops.length - 1 : 1)) % stops.length]).focus();
        return;
      }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    // and the focus: a work starting under it (SugarCube) takes the focus as it starts; while the card is up it comes back
    const keepFocus = (e) => { if (el.isConnected && !el.contains(/** @type {Node} */ (e.target))) btn.focus({ preventScroll: true }); };
    document.addEventListener("focusin", keepFocus, true);
    window.addEventListener("load", () => { if (el.isConnected && !el.contains(document.activeElement)) btn.focus({ preventScroll: true }); }, { once: true });
    btn.addEventListener("click", close);
    setTimeout(() => btn.focus({ preventScroll: true }), 0);
    const line = /** @type {HTMLElement} */ (el.querySelector(".mhtc-status"));
    const api = { close, up: () => el.isConnected, status: (text) => { line.textContent = text || ""; } };
    current = api;
    return api;
  }

  window.MH_TITLE_CARD = { show, up: () => !!(current && current.up()) };
})();
