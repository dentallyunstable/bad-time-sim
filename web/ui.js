"use strict";
// Page layout (portrait / landscape), touch controls, settings and the main loop.

(function () {
  var canvas = document.getElementById("game");
  var g = canvas.getContext("2d");
  var controls = document.getElementById("controls");
  var joyBase = document.getElementById("joyBase"), joyKnob = document.getElementById("joyKnob"), joyDz = document.getElementById("joyDz");
  var btnZ = document.getElementById("btnZ"), btnX = document.getElementById("btnX"), btnJ = document.getElementById("btnJ");
  var BUTTONS = [[btnZ, "confirm"], [btnX, "cancel"], [btnJ, "jump"]];

  // ------------------------------------------------------------ settings
  var DEFAULTS = { joySize: "m", deadzone: "med", joyMode: "float", opacity: "0.55", showControls: "auto", hitbox: "4" };
  var settings = Object.assign({}, DEFAULTS);
  try {
    var saved = JSON.parse(localStorage.getItem("badtime-settings") || "{}");
    Object.keys(DEFAULTS).forEach(function (k) { if (saved[k] !== undefined) settings[k] = saved[k]; });
  } catch (e) { /* storage unavailable */ }
  function saveSettings() {
    try { localStorage.setItem("badtime-settings", JSON.stringify(settings)); } catch (e) { /* ignore */ }
  }
  var JOY_RADIUS = { s: 55, m: 75, l: 95 };
  var DEADZONE = { low: 0.2, med: 0.35, high: 0.5 };
  function applySettings() {
    document.documentElement.style.setProperty("--ctl-opacity", settings.opacity);
    Settings.hitbox = Number(settings.hitbox);
    document.querySelectorAll(".seg").forEach(function (seg) {
      var key = seg.getAttribute("data-key");
      seg.querySelectorAll("button").forEach(function (b) {
        b.classList.toggle("on", b.getAttribute("data-v") === String(settings[key]));
      });
    });
    layout();
  }
  document.querySelectorAll(".seg button").forEach(function (b) {
    b.addEventListener("click", function () {
      settings[b.parentNode.getAttribute("data-key")] = b.getAttribute("data-v");
      saveSettings();
      applySettings();
    });
  });
  var settingsPanel = document.getElementById("settingsPanel");
  document.getElementById("btnSettings").addEventListener("click", function () { settingsPanel.classList.remove("hidden"); });
  document.getElementById("closeSettings").addEventListener("click", function () { settingsPanel.classList.add("hidden"); });

  // ------------------------------------------------------------ fullscreen
  function goFullscreen() {
    var el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: "hide" }).catch(function () { /* not allowed here */ });
      }
    } catch (e) { /* ignore */ }
  }
  document.getElementById("btnFull").addEventListener("click", function () {
    if (document.fullscreenElement) document.exitFullscreen(); else goFullscreen();
  });
  var wakeLock = null;
  function keepAwake() {
    try {
      if (navigator.wakeLock && !wakeLock) navigator.wakeLock.request("screen").then(function (l) {
        wakeLock = l;
        l.addEventListener("release", function () { wakeLock = null; });
      }).catch(function () { /* ignore */ });
    } catch (e) { /* ignore */ }
  }

  // ------------------------------------------------------------ custom attack file
  var filePanel = document.getElementById("filePanel");
  var fileInput = document.getElementById("filechooser");
  window.showFilePicker = function () { fileInput.value = ""; filePanel.classList.remove("hidden"); };
  fileInput.addEventListener("change", function () {
    if (fileInput.files && fileInput.files[0]) onCustomFile(fileInput.files[0]);
    filePanel.classList.add("hidden");
  });
  document.getElementById("closeFile").addEventListener("click", function () { filePanel.classList.add("hidden"); });

  // ------------------------------------------------------------ layout
  var isTouch = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0) || window.matchMedia("(pointer: coarse)").matches;
  var L = { joyRest: { x: 0, y: 0 }, R: 75, leftZone: 0, btnR: 40 };
  function controlsOn() {
    if (settings.showControls === "on") return true;
    if (settings.showControls === "off") return false;
    return isTouch;
  }
  function place(el, x, y, r) {
    el.style.left = (x - r) + "px"; el.style.top = (y - r) + "px";
    el.style.width = (2 * r) + "px"; el.style.height = (2 * r) + "px";
  }
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var on = controlsOn();
    controls.classList.toggle("hidden", !on);
    var cw, ch, cx, cy;
    var R = JOY_RADIUS[settings.joySize] || 75;
    if (!on) {
      var s = Math.min(vw / GAME_W, vh / GAME_H);
      cw = GAME_W * s; ch = GAME_H * s; cx = (vw - cw) / 2; cy = (vh - ch) / 2;
    } else if (vw >= vh) {
      // Landscape: game in the middle at full height, joystick on the left, buttons on the right
      ch = vh; cw = ch * 4 / 3;
      if (cw > vw) { cw = vw; ch = cw * 3 / 4; }
      cx = (vw - cw) / 2; cy = (vh - ch) / 2;
      var side = Math.max(cx, 0);
      R = Math.min(R, Math.max(45, vh * 0.3));
      var jx = Math.max(R + 10, side / 2);
      L.joyRest = { x: jx, y: vh - Math.max(R + 20, vh * 0.32) };
      L.btnR = Math.max(34, Math.min(R * 0.62, vh * 0.15));
      L.btnR = Math.max(32, Math.min(L.btnR, vh * 0.13));
      var r = L.btnR, bx = vw - Math.max(r * 1.6 + 10, side / 2);
      // JUMP at the bottom where the thumb rests, Z above it, X to the left
      var jy = vh - r - Math.max(14, vh * 0.06);
      placeButtons(bx + r * 0.6, jy - r * 2.35, bx - r * 1.45, jy - r * 1.05, bx + r * 0.6, jy);
    } else {
      // Portrait: game at the top, controls underneath
      cw = vw; ch = cw * 3 / 4;
      cx = 0; cy = Math.min(Math.max(0, (vh - ch) * 0.12), 60);
      var below = vh - (cy + ch);
      R = Math.min(R, Math.max(45, below * 0.38), vw * 0.22);
      var midY = cy + ch + below / 2;
      if (below < R * 2 + 20) midY = vh - R - 20; // not enough room: overlap the bottom of the game
      L.joyRest = { x: Math.max(R + 16, vw * 0.27), y: midY };
      L.btnR = Math.max(34, Math.min(R * 0.62, vw * 0.11));
      var pr = L.btnR;
      placeButtons(vw - pr - 16, midY - pr * 1.25, vw - pr * 3.3, midY, vw - pr - 16, midY + pr * 1.25);
    }
    L.R = R;
    canvas.style.width = cw + "px"; canvas.style.height = ch + "px";
    canvas.style.left = cx + "px"; canvas.style.top = cy + "px";
    L.leftZone = vw * 0.5;
    if (!joy.active) drawJoy(L.joyRest.x, L.joyRest.y, 0, 0);
  }
  function placeButtons(zx, zy, xx, xy, jx, jy) {
    [[btnZ, zx, zy], [btnX, xx, xy], [btnJ, jx, jy]].forEach(function (b) {
      place(b[0], b[1], b[2], L.btnR);
      b[0].style.fontSize = (L.btnR * 0.42) + "px";
      b[0].rect = { x: b[1], y: b[2] };
    });
  }

  // ------------------------------------------------------------ joystick
  var joy = { active: false, id: null, ox: 0, oy: 0, dx: 0, dy: 0, dirs: {} };
  function drawJoy(ox, oy, dx, dy) {
    var R = L.R;
    place(joyBase, ox, oy, R);
    place(joyDz, ox, oy, R * (DEADZONE[settings.deadzone] || 0.35));
    place(joyKnob, ox + dx, oy + dy, R * 0.45);
  }
  function updateJoy(px, py) {
    var R = L.R;
    var dx = px - joy.ox, dy = py - joy.oy;
    var d = Math.hypot(dx, dy);
    if (d > R) {
      if (settings.joyMode === "float") {
        // drag the base along so changing direction never needs a long swipe back
        joy.ox = px - dx / d * R; joy.oy = py - dy / d * R;
      }
      dx = dx / d * R; dy = dy / d * R; d = R;
    }
    joy.dx = dx; joy.dy = dy;
    var dirs = {};
    if (d >= R * (DEADZONE[settings.deadzone] || 0.35)) {
      // 8 directions: each diagonal gets a 45 degree slice
      var a = Math.atan2(dy, dx) * 180 / Math.PI;
      if (a > -67.5 && a < 67.5) dirs.right = 1;
      if (a > 112.5 || a < -112.5) dirs.left = 1;
      if (a > 22.5 && a < 157.5) dirs.down = 1;
      if (a < -22.5 && a > -157.5) dirs.up = 1;
    }
    joy.dirs = dirs;
    drawJoy(joy.ox, joy.oy, dx, dy);
  }
  function startJoy(id, px, py) {
    joy.active = true; joy.id = id;
    if (settings.joyMode === "float") {
      var R = L.R;
      joy.ox = Math.max(R + 4, Math.min(window.innerWidth - R - 4, px));
      joy.oy = Math.max(R + 4, Math.min(window.innerHeight - R - 4, py));
    } else {
      joy.ox = L.joyRest.x; joy.oy = L.joyRest.y;
    }
    updateJoy(px, py);
  }
  function endJoy() {
    joy.active = false; joy.id = null; joy.dirs = {};
    drawJoy(L.joyRest.x, L.joyRest.y, 0, 0);
  }

  // ------------------------------------------------------------ buttons
  var btnPointers = {}; // pointerId -> "confirm" | "cancel"
  function buttonAt(x, y) {
    var best = null, bestD = Infinity;
    BUTTONS.forEach(function (b) {
      var r = b[0].rect;
      if (!r) return;
      var d = Math.hypot(x - r.x, y - r.y);
      if (d < L.btnR * 1.15 && d < bestD) { best = b[1]; bestD = d; }
    });
    return best;
  }

  function onDown(e) {
    if (!controlsOn() || e.target.closest(".panel") || e.target.closest(".topbtn")) return;
    Audio2.unlock();
    keepAwake();
    var b = buttonAt(e.clientX, e.clientY);
    if (b) btnPointers[e.pointerId] = b;
    else if (!joy.active && (e.clientX < L.leftZone || settings.joyMode === "fixed" && Math.hypot(e.clientX - L.joyRest.x, e.clientY - L.joyRest.y) < L.R * 1.5)) startJoy(e.pointerId, e.clientX, e.clientY);
    e.preventDefault();
  }
  function onMove(e) {
    if (joy.active && e.pointerId === joy.id) { updateJoy(e.clientX, e.clientY); e.preventDefault(); return; }
    if (btnPointers[e.pointerId]) {
      var b = buttonAt(e.clientX, e.clientY);
      if (b) btnPointers[e.pointerId] = b; // allow sliding from one button to the other
    }
  }
  function onUp(e) {
    if (joy.active && e.pointerId === joy.id) endJoy();
    delete btnPointers[e.pointerId];
  }
  window.addEventListener("pointerdown", onDown, { passive: false });
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onUp);
  window.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  document.addEventListener("touchmove", function (e) { if (!e.target.closest(".panel")) e.preventDefault(); }, { passive: false });

  VPad.sources.push(function () {
    var s = Object.assign({}, joy.dirs);
    for (var id in btnPointers) s[btnPointers[id]] = 1;
    BUTTONS.forEach(function (b) { b[0].classList.toggle("down", !!s[b[1]]); });
    return s;
  });

  window.addEventListener("resize", layout);
  window.addEventListener("orientationchange", function () { setTimeout(layout, 200); });

  // ------------------------------------------------------------ boot + main loop
  var running = false, last = 0, acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running) return;
    var dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    acc += dt;
    var steps = 0;
    while (acc >= DT && steps < 8) { tick(); acc -= DT; steps++; }
    if (steps === 8) acc = 0;
    draw(g);
  }
  document.addEventListener("visibilitychange", function () {
    if (!Audio2.ctx) return;
    if (document.hidden) Audio2.ctx.suspend(); else if (running) Audio2.ctx.resume();
    last = performance.now();
  });

  Audio2.init();
  applySettings();
  var startPanel = document.getElementById("startPanel"), startBtn = document.getElementById("startBtn");
  var bar = document.querySelector("#progress div"), loadText = document.getElementById("loadText");
  loadAssets(function (done, total) { bar.style.width = (100 * done / total) + "%"; }).then(function () {
    loadText.textContent = "Ready!";
    startBtn.classList.remove("hidden");
  }).catch(function (e) {
    loadText.textContent = "Loading failed: " + e.message;
  });
  startBtn.addEventListener("click", function () {
    Audio2.unlock();
    if (isTouch) goFullscreen();
    keepAwake();
    startPanel.classList.add("hidden");
    changeScene("menu");
    running = true;
    last = performance.now();
  });
  requestAnimationFrame(frame);
})();
