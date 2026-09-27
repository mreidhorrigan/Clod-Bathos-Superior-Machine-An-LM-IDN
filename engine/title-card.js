// @ts-check
"use strict";
/* ============================================================================
   title-card.js  ·  MH_TITLE_CARD  ·  what a work is, before it starts
   ----------------------------------------------------------------------------
   A card in front of a work's own first screen, modelled on the card a film
   shows before it begins (a rating card): a saturated blue field, white capitals
   centred, a ruled box with a large mark on its left and the work's particulars
   on its right, the author's words, "by" and the author's name, and a line in
   each bottom corner. The picture is a film's: a moving grain, a slight flicker,
   the frame weaving a little in the gate, now and then a fleck of dust, and the
   corners darker. With reduced motion the grain holds still and nothing moves.

   It is its own: it brings its styles and needs nothing else on the page, so the
   same file serves this site (Rock Walls and Damp) and Clod Bathos, deployed on
   its own (a copy there: engine/title-card.js; this one is the source).

   MH_TITLE_CARD.show({
     kicker,            the line above the box ("This interactive digital narrative
                        is presented"), set in capitals as the by-line and name are
     mark,              the box's large letters (the kind of work: "LM")
     title,             the work's title, first in the box
     particulars,       the box's small lines after it (a string)
     text,              the author's words: [paragraph, …]
     by, author,        the by-line and the author's name
     left, right,       the lines in the bottom corners
     go,                the button's words ("Begin")
     onClose            called when the card goes (Begin, Enter, Space, Escape)
   })                   → { close, up }
   MH_TITLE_CARD.up()   whether a card is up (a page holds its own keys meanwhile)
   ========================================================================== */
(function () {
  let current = null;
  const reduce = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  const CSS = `
  .mhtc{ position:fixed; inset:0; z-index:2147483000; overflow:auto; background:#050814; color:#fff;
    display:grid; place-items:center; -webkit-font-smoothing:antialiased; text-shadow:none; }
  .mhtc[hidden]{ display:none; }
  .mhtc-field{ position:relative; width:min(1100px,100vw); min-height:min(640px,100vh); box-sizing:border-box;
    background:radial-gradient(ellipse at 50% 45%, #2a45c2 0%, #1d33a3 55%, #142477 100%);
    display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;
    padding:max(40px,env(safe-area-inset-top)) max(22px,env(safe-area-inset-right)) max(64px,env(safe-area-inset-bottom)) max(22px,env(safe-area-inset-left));
    font-family:"Helvetica Neue",Helvetica,Arial,sans-serif; }
  .mhtc-weave{ display:flex; flex-direction:column; align-items:center; width:100%; will-change:transform; }
  .mhtc-kicker, .mhtc-by, .mhtc-author{ text-transform:uppercase; }
  .mhtc-kicker{ margin:0 0 18px; font-weight:700; font-size:clamp(13px,1.9vw,19px); letter-spacing:.14em; }
  .mhtc-box{ display:flex; align-items:stretch; max-width:640px; width:100%; border:2px solid #fff; text-align:left; margin:0 auto; }
  .mhtc-mark{ flex:0 0 auto; display:flex; align-items:center; justify-content:center; padding:10px 18px; background:#fff; color:#1d33a3;
    font-family:Georgia,"Times New Roman",serif; font-weight:700; font-size:clamp(34px,6vw,58px); letter-spacing:-.01em; line-height:1; }
  .mhtc-part{ padding:10px 14px; font-weight:700; font-size:clamp(11px,1.5vw,13px); line-height:1.35; letter-spacing:.06em; text-transform:uppercase; }
  .mhtc-part h1{ margin:0 0 6px; font-size:clamp(14px,2vw,17px); line-height:1.25; letter-spacing:.05em; }
  .mhtc-part p{ margin:0; }
  .mhtc-text{ max-width:640px; margin:18px auto 0; text-align:left; font-size:clamp(14px,1.7vw,16px); line-height:1.55; }
  .mhtc-text p{ margin:0 0 10px; }
  .mhtc-by{ margin:16px 0 2px; font-weight:700; font-size:clamp(13px,1.9vw,18px); letter-spacing:.14em; }
  .mhtc-author{ margin:0; font-weight:700; font-size:clamp(26px,4.4vw,42px); letter-spacing:.08em; }
  .mhtc-go{ margin-top:22px; appearance:none; cursor:pointer; background:transparent; color:#fff; border:2px solid #fff;
    padding:9px 26px; font:700 14px "Helvetica Neue",Helvetica,Arial,sans-serif; letter-spacing:.16em; text-transform:uppercase; }
  .mhtc-go:hover{ background:#fff; color:#1d33a3; }
  .mhtc-go:focus-visible{ outline:3px solid #c3f0ff; outline-offset:3px; }
  .mhtc-corner{ position:absolute; bottom:max(20px,env(safe-area-inset-bottom)); font-weight:700; font-size:clamp(11px,1.5vw,14px); letter-spacing:.02em; }
  .mhtc-left{ left:max(26px,env(safe-area-inset-left)); } .mhtc-right{ right:max(26px,env(safe-area-inset-right)); }
  .mhtc-grain, .mhtc-flicker, .mhtc-vignette, .mhtc-dust{ position:absolute; inset:0; pointer-events:none; }
  .mhtc-grain{ opacity:.42; mix-blend-mode:overlay; background-size:256px 256px; }
  .mhtc-flicker{ background:#000; opacity:0; }
  .mhtc-vignette{ background:radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,.45) 100%); }
  @media (max-width:560px){
    .mhtc-box{ flex-direction:column; } .mhtc-mark{ padding:8px; }
    .mhtc-corner{ position:static; margin-top:10px; } .mhtc-field{ padding-bottom:28px; }
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

  function show(o) {
    if (current) current.close();
    if (!document.getElementById("mhtc-style")) {
      const st = document.createElement("style"); st.id = "mhtc-style"; st.textContent = CSS; document.head.appendChild(st);
    }
    const el = document.createElement("div");
    el.className = "mhtc"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "mhtc-title");
    const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    el.innerHTML = `<div class="mhtc-field">
      <div class="mhtc-weave">
        ${o.kicker ? `<p class="mhtc-kicker">${esc(o.kicker)}</p>` : ""}
        <div class="mhtc-box">
          <div class="mhtc-mark" aria-hidden="true">${esc(o.mark || "")}</div>
          <div class="mhtc-part"><h1 id="mhtc-title">${esc(o.title)}</h1>${o.particulars ? `<p>${esc(o.particulars)}</p>` : ""}</div>
        </div>
        <div class="mhtc-text">${(o.text || []).map((p) => `<p>${esc(p)}</p>`).join("")}</div>
        ${o.by ? `<p class="mhtc-by">${esc(o.by)}</p>` : ""}
        ${o.author ? `<p class="mhtc-author">${esc(o.author)}</p>` : ""}
        <button type="button" class="mhtc-go">${esc(o.go || "Begin")}</button>
      </div>
      ${o.left ? `<span class="mhtc-corner mhtc-left">${esc(o.left)}</span>` : ""}
      ${o.right ? `<span class="mhtc-corner mhtc-right">${esc(o.right)}</span>` : ""}
      <div class="mhtc-grain" aria-hidden="true"></div><div class="mhtc-dust" aria-hidden="true"></div>
      <div class="mhtc-flicker" aria-hidden="true"></div><div class="mhtc-vignette" aria-hidden="true"></div>
    </div>`;
    document.body.appendChild(el);
    const grain = /** @type {HTMLElement} */ (el.querySelector(".mhtc-grain")), flicker = /** @type {HTMLElement} */ (el.querySelector(".mhtc-flicker"));
    const weave = /** @type {HTMLElement} */ (el.querySelector(".mhtc-weave")), dust = /** @type {HTMLElement} */ (el.querySelector(".mhtc-dust"));
    const btn = /** @type {HTMLButtonElement} */ (el.querySelector(".mhtc-go"));

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
      if (o.onClose) o.onClose(); else if (prevFocus && prevFocus.focus) prevFocus.focus();
    };
    // its keys are its own while it is up: Enter, Space or Escape close it, and nothing reaches the work under it
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); close(); return; }
      if (e.key === "Tab") { e.preventDefault(); btn.focus(); return; }
      if (!e.metaKey && !e.ctrlKey && !e.altKey) e.stopPropagation();
    };
    document.addEventListener("keydown", onKey, true);
    // and the focus: a work starting under it (SugarCube) takes the focus as it starts; while the card is up it comes back
    const keepFocus = (e) => { if (el.isConnected && !el.contains(/** @type {Node} */ (e.target))) btn.focus({ preventScroll: true }); };
    document.addEventListener("focusin", keepFocus, true);
    window.addEventListener("load", () => { if (el.isConnected) btn.focus({ preventScroll: true }); }, { once: true });
    btn.addEventListener("click", close);
    setTimeout(() => btn.focus({ preventScroll: true }), 0);
    const api = { close, up: () => el.isConnected };
    current = api;
    return api;
  }

  window.MH_TITLE_CARD = { show, up: () => !!(current && current.up()) };
})();
