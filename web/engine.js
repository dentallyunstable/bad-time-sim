"use strict";
// Low level helpers: asset loading, audio, drawing, sprite fonts and input.

var GAME_W = 640, GAME_H = 480;
var DT = 1 / 60;

var IMAGE_LIST = {
  BattleFont: "Textures/BattleFont.png",
  BoneH: "Textures/BoneH.png",
  BoneStabH: "Textures/BoneStabH.png",
  BoneStabV: "Textures/BoneStabV.png",
  BoneStabWarn: "Textures/BoneStabWarn.png",
  BoneV: "Textures/BoneV.png",
  CombatZone: "Textures/CombatZone.png",
  DamageFont: "Textures/DamageFont.png",
  DefaultFont: "Textures/DefaultFont.png",
  GasterBlast: "Textures/GasterBlast1.png",
  HPBackground: "Textures/HPBackground.png",
  HPBar: "Textures/HPBar.png",
  KRBar: "Textures/KRBar.png",
  Platform1: "Textures/Platform1.png",
  Platform2: "Textures/Platform2.png",
  SansFont: "Textures/SansFont.png"
};
// name: [frame count]
var ANIM_LIST = {
  "GasterBlaster/Default": 1, "GasterBlaster/Fire": 5,
  "HP/Default": 1, "KR/Default": 1,
  "HeartShard/Default": 4,
  "MenuBoneBottom/Default": 1, "MenuBoneLeft/Default": 1,
  "PlayerHeart/Default": 1, "PlayerHeart/Split": 1,
  "SansBody/HandDown": 4, "SansBody/HandUp": 5, "SansBody/HandLeft": 5, "SansBody/HandRight": 5,
  "SansHead/BlueEye": 2, "SansHead/ClosedEyes": 1, "SansHead/Default": 1, "SansHead/LookLeft": 1,
  "SansHead/NoEyes": 1, "SansHead/Tired1": 1, "SansHead/Tired2": 1, "SansHead/Wink": 1,
  "SansLegs/Sitting": 1, "SansLegs/Standing": 1,
  "SansSweat/Sweat1": 1, "SansSweat/Sweat2": 1, "SansSweat/Sweat3": 1,
  "SansTorso/Default": 1, "SansTorso/Shrug": 1,
  "SpeechBubble/Default": 1,
  "Strike/Default": 6, "Target/Default": 1, "TargetChoice/Default": 2,
  "UIAct/Default": 1, "UIAct/Highlight": 1, "UIFight/Default": 1, "UIFight/Highlight": 1,
  "UIItem/Default": 1, "UIItem/Highlight": 1, "UIMercy/Default": 1, "UIMercy/Highlight": 1
};
var SOUND_LIST = ["BattleText", "BoneStab", "Ding", "Flash", "GasterBlast", "GasterBlast2", "GasterBlaster",
  "HeartShatter", "HeartSplit", "MenuCursor", "MenuSelect", "PlayerDamaged", "PlayerFight", "PlayerHeal",
  "SansSpeak", "Slam", "Warning", "mus_zz_megalovania"];
var ATTACK_LIST = ["sans_bluebone", "sans_bonegap1", "sans_bonegap1fast", "sans_bonegap2", "sans_boneslideh",
  "sans_boneslidev", "sans_bonestab1", "sans_bonestab2", "sans_bonestab3", "sans_final", "sans_intro",
  "sans_multi1", "sans_multi2", "sans_multi3", "sans_platformblaster", "sans_platformblasterfast",
  "sans_platforms1", "sans_platforms2", "sans_platforms3", "sans_platforms4", "sans_platforms4hard",
  "sans_randomblaster1", "sans_randomblaster2", "sans_spare"];

var IMG = {};      // name -> Image
var ANIM = {};     // "Obj/Anim" -> [Image]
var SND = {};      // name -> AudioBuffer
var ATTACKS = {};  // name -> csv text

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var im = new Image();
    im.onload = function () { resolve(im); };
    im.onerror = function () { reject(new Error("Could not load " + src)); };
    im.src = src;
  });
}

function pad3(n) { return ("00" + n).slice(-3); }

function loadAssets(onProgress) {
  var jobs = [];
  Object.keys(IMAGE_LIST).forEach(function (k) {
    jobs.push(function () { return loadImage(IMAGE_LIST[k]).then(function (im) { IMG[k] = im; }); });
  });
  Object.keys(ANIM_LIST).forEach(function (k) {
    ANIM[k] = [];
    for (var i = 0; i < ANIM_LIST[k]; i++) {
      (function (i) {
        jobs.push(function () { return loadImage("Animations/" + k + "/" + pad3(i) + ".png").then(function (im) { ANIM[k][i] = im; }); });
      })(i);
    }
  });
  ATTACK_LIST.forEach(function (k) {
    jobs.push(function () {
      return fetch("Files/" + k + ".csv").then(function (r) {
        if (!r.ok) throw new Error("Could not load " + k);
        return r.text();
      }).then(function (t) { ATTACKS[k] = t; });
    });
  });
  SOUND_LIST.forEach(function (k) {
    jobs.push(function () {
      return fetch("Files/" + k + ".ogg").then(function (r) { return r.arrayBuffer(); })
        .then(function (buf) { return Audio2.decode(buf); })
        .then(function (b) { SND[k] = b; })
        .catch(function (e) { console.warn("sound failed", k, e); });
    });
  });
  var done = 0;
  return Promise.all(jobs.map(function (j) {
    return j().then(function () { done++; onProgress(done, jobs.length); });
  }));
}

// ---------------------------------------------------------------- Audio
var Audio2 = {
  ctx: null,
  master: null,
  playing: [],   // {src, tag, name, buffer, startedAt, offset, loop, rate, paused}
  init: function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
  },
  unlock: function () {
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume();
  },
  decode: function (buf) {
    var ctx = this.ctx;
    return new Promise(function (resolve, reject) { ctx.decodeAudioData(buf, resolve, reject); });
  },
  _start: function (h, offset) {
    var src = this.ctx.createBufferSource();
    src.buffer = h.buffer;
    src.loop = h.loop;
    src.playbackRate.value = h.rate;
    src.connect(this.master);
    src.start(0, offset % h.buffer.duration);
    h.src = src;
    h.startedAt = this.ctx.currentTime;
    h.offset = offset;
    var self = this;
    src.onended = function () {
      if (h.src === src && !h.paused) {
        var i = self.playing.indexOf(h);
        if (i >= 0) self.playing.splice(i, 1);
      }
    };
  },
  play: function (name, loop, tag, rate) {
    if (!this.ctx || !SND[name]) return null;
    var h = { name: name, buffer: SND[name], tag: tag || "", loop: !!loop, rate: rate || 1, paused: false };
    this._start(h, 0);
    this.playing.push(h);
    this.last = h;
    return h;
  },
  setRate: function (h, rate) {
    if (!h) return;
    h.rate = rate;
    if (h.src) h.src.playbackRate.value = rate;
  },
  byTag: function (tag) {
    return this.playing.filter(function (h) { return h.tag.toLowerCase() === tag.toLowerCase(); });
  },
  isTagPlaying: function (tag) {
    return this.byTag(tag).some(function (h) { return !h.paused; });
  },
  stop: function (tag) {
    var self = this;
    this.byTag(tag).forEach(function (h) { self._kill(h); });
  },
  stopAll: function () {
    var self = this;
    this.playing.slice().forEach(function (h) { self._kill(h); });
  },
  _kill: function (h) {
    h.paused = false;
    var src = h.src;
    h.src = null;
    try { if (src) src.stop(); } catch (e) { /* already stopped */ }
    var i = this.playing.indexOf(h);
    if (i >= 0) this.playing.splice(i, 1);
  },
  setPaused: function (tag, paused) {
    var self = this;
    this.byTag(tag).forEach(function (h) {
      if (paused && !h.paused) {
        h.paused = true;
        h.offset = h.offset + (self.ctx.currentTime - h.startedAt) * h.rate;
        var src = h.src; h.src = null;
        try { src.stop(); } catch (e) { /* ignore */ }
      } else if (!paused && h.paused) {
        h.paused = false;
        self._start(h, h.offset);
      }
    });
  }
};

// ---------------------------------------------------------------- Drawing helpers
var tintCache = new Map();
// Construct's "Tint" effect multiplies each channel. White art therefore becomes the tint colour.
function tinted(img, rgb) {
  if (!rgb) return img;
  var key = rgb.join(",");
  var m = tintCache.get(img);
  if (!m) { m = {}; tintCache.set(img, m); }
  if (m[key]) return m[key];
  var c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  var g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.fillStyle = "rgb(" + key + ")";
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-in";
  g.drawImage(img, 0, 0);
  m[key] = c;
  return c;
}

// Draws an image with a hotspot (0..1 of the size), rotation in degrees.
function drawSprite(g, img, x, y, w, h, hx, hy, angle, opacity, tint) {
  if (!img) return;
  if (tint) img = tinted(img, tint);
  g.save();
  if (opacity !== undefined && opacity < 1) g.globalAlpha = Math.max(0, opacity);
  g.translate(x, y);
  if (angle) g.rotate(angle * Math.PI / 180);
  g.drawImage(img, -hx * w, -hy * h, w, h);
  g.restore();
}

// Nine-patch drawing. m = [left, right, top, bottom] margins. tile: true tiles edges and centre.
function drawNinePatch(g, img, x, y, w, h, m, tile, fillCenter, tint) {
  if (!img || w <= 0 || h <= 0) return;
  if (tint) img = tinted(img, tint);
  var L = m[0], R = m[1], T = m[2], B = m[3];
  var iw = img.width, ih = img.height;
  var cw = iw - L - R, ch = ih - T - B;
  // corners shrink if the object is smaller than the margins
  var l = Math.min(L, w / 2), r = Math.min(R, w / 2), t = Math.min(T, h / 2), b = Math.min(B, h / 2);
  var mw = w - l - r, mh = h - t - b;
  function piece(sx, sy, sw, sh, dx, dy, dw, dh) {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0) return;
    if (!tile || (dw === sw && dh === sh)) { g.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    for (var yy = 0; yy < dh; yy += sh) {
      var ph = Math.min(sh, dh - yy);
      for (var xx = 0; xx < dw; xx += sw) {
        var pw = Math.min(sw, dw - xx);
        g.drawImage(img, sx, sy, pw, ph, dx + xx, dy + yy, pw, ph);
      }
    }
  }
  // corners
  piece(0, 0, L, T, x, y, l, t);
  piece(iw - R, 0, R, T, x + w - r, y, r, t);
  piece(0, ih - B, L, B, x, y + h - b, l, b);
  piece(iw - R, ih - B, R, B, x + w - r, y + h - b, r, b);
  // edges
  piece(L, 0, cw, T, x + l, y, mw, t);
  piece(L, ih - B, cw, B, x + l, y + h - b, mw, b);
  piece(0, T, L, ch, x, y + t, l, mh);
  piece(iw - R, T, R, ch, x + w - r, y + t, r, mh);
  if (fillCenter) piece(L, T, cw, ch, x + l, y + t, mw, mh);
}

// ---------------------------------------------------------------- Sprite fonts
function SpriteFont(imgName, cw, ch, charset, widths) {
  this.imgName = imgName; this.cw = cw; this.ch = ch;
  this.charset = charset;
  this.widths = {};
  var self = this;
  (widths || []).forEach(function (p) {
    for (var i = 0; i < p[0].length; i++) self.widths[p[0][i]] = p[1];
  });
}
SpriteFont.prototype.charWidth = function (c) {
  var w = this.widths[c];
  return w === undefined ? this.cw : w;
};
SpriteFont.prototype.measure = function (s) {
  var w = 0;
  for (var i = 0; i < s.length; i++) w += this.charWidth(s[i]);
  return w;
};
// Word wrap like Construct's sprite font (width in unscaled pixels)
SpriteFont.prototype.wrap = function (text, maxW) {
  var out = [];
  var self = this;
  text.split("\n").forEach(function (para) {
    if (!maxW) { out.push(para); return; }
    var words = para.split(/(\s+)/);
    var line = "";
    words.forEach(function (wd) {
      if (wd === "") return;
      var test = line + wd;
      if (line !== "" && self.measure(test.replace(/\s+$/, "")) > maxW && !/^\s+$/.test(wd)) {
        out.push(line.replace(/\s+$/, ""));
        line = wd;
      } else {
        line = test;
      }
    });
    out.push(line);
  });
  return out;
};
var CHARSET_FULL = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
var CHARSET_BATTLE = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_";
var FONTS = {
  BattleFont: new SpriteFont("BattleFont", 6, 6, CHARSET_BATTLE, [
    ["!\"#%-/0123456789<=>?ABCDEFGHIJKLNOPQRSTUVXYZ[\\]_", 5], ["\"()<>[]", 4], [" -", 3], ["',.:;", 2]]),
  DamageFont: new SpriteFont("DamageFont", 33, 32, CHARSET_FULL, [
    ["~", 29], ["\"/<>I^j{}", 25], ["(),1[]`", 21], ["!'.:;il|", 17]]),
  DefaultFont: new SpriteFont("DefaultFont", 10, 16, CHARSET_FULL, [
    ["#%&MWmw~", 9], [" $*+-./0123456789=?@ABCDEFGHIJKLNOPQRSTUVXYZ\\^abcdefghijklnopqrstuvxyz", 8],
    ["\"<>{}", 7], ["!()[]_", 6], ["`", 5], ["',:;|", 4]]),
  SansFont: new SpriteFont("SansFont", 16, 16, CHARSET_FULL, [
    ["W", 15], ["@", 14], ["%Q", 13], ["MO", 12], ["#&GNVX_", 11], [" $ACHJSTUYZmw", 10],
    ["247?BDEKdxy~", 9], ["*+/0135689FILR\\^abcefghknopqrtuvz", 8], ["-=Pjs{}", 7], ["()<>[]", 6],
    ["\";`", 5], ["!',.:il|", 4]])
};

// Draw text. opts: {scale, width (in game px, for wrapping), tint, align ('left'|'center')}
function drawText(g, fontName, text, x, y, opts) {
  opts = opts || {};
  var f = FONTS[fontName];
  var img = IMG[f.imgName];
  if (!img) return;
  if (opts.tint) img = tinted(img, opts.tint);
  var s = opts.scale || 1;
  var cols = Math.floor(img.width / f.cw);
  var lines = f.wrap(String(text), opts.width ? opts.width / s : 0);
  var ly = y;
  lines.forEach(function (line) {
    var lx = x;
    if (opts.align === "center" && opts.width) lx = x + (opts.width - f.measure(line) * s) / 2;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      var idx = f.charset.indexOf(c);
      if (idx < 0 && fontName === "BattleFont") idx = f.charset.indexOf(c.toUpperCase());
      if (idx >= 0) {
        g.drawImage(img, (idx % cols) * f.cw, Math.floor(idx / cols) * f.ch, f.cw, f.ch,
          Math.round(lx), Math.round(ly), f.cw * s, f.ch * s);
      }
      lx += f.charWidth(c) * s;
    }
    ly += f.ch * s;
  });
}

// ---------------------------------------------------------------- Input
// VPad mirrors the original game's virtual pad: each frame the previous state is kept so
// "just pressed" (value > last) and "just released" (value < last) can be detected.
var VPad = {
  keys: { up: 0, down: 0, left: 0, right: 0, confirm: 0, cancel: 0, menu: 0 },
  last: { up: 0, down: 0, left: 0, right: 0, confirm: 0, cancel: 0, menu: 0 },
  sources: [],   // functions returning partial key states
  update: function () {
    var k;
    for (k in this.keys) { this.last[k] = this.keys[k]; this.keys[k] = 0; }
    var jump = false;
    for (var i = 0; i < this.sources.length; i++) {
      var s = this.sources[i]();
      for (k in s) {
        if (!s[k]) continue;
        if (k === "jump") jump = true;
        else this.keys[k] = 1;
      }
    }
    // "jump" means "away from the floor", which depends on which way gravity pulls the blue heart
    if (jump && typeof heartJumpKey === "function") {
      var jk = heartJumpKey();
      if (jk) this.keys[jk] = 1;
    }
  },
  pressed: function (k) { return this.keys[k] > this.last[k]; },
  released: function (k) { return this.keys[k] < this.last[k]; },
  down: function (k) { return this.keys[k] === 1; }
};

var KeyboardInput = (function () {
  var held = {};
  var map = {
    ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down", ArrowLeft: "left", KeyA: "left",
    ArrowRight: "right", KeyD: "right", KeyZ: "confirm", Enter: "confirm", KeyX: "cancel",
    ShiftLeft: "cancel", ShiftRight: "cancel", KeyC: "menu", ControlLeft: "menu", ControlRight: "menu",
    Space: "jump"
  };
  window.addEventListener("keydown", function (e) {
    if (map[e.code]) {
      held[e.code] = true;
      if (e.code.indexOf("Arrow") === 0 || e.code === "Space") e.preventDefault();
    }
    Audio2.unlock();
  });
  window.addEventListener("keyup", function (e) { held[e.code] = false; });
  window.addEventListener("blur", function () { held = {}; });
  return function () {
    var s = {};
    for (var c in held) if (held[c] && map[c]) s[map[c]] = 1;
    return s;
  };
})();
VPad.sources.push(KeyboardInput);

VPad.sources.push(function () {
  var s = {};
  if (!navigator.getGamepads) return s;
  var pads = navigator.getGamepads();
  var p = pads && pads[0];
  if (!p) return s;
  var dz = 0.25;
  var b = function (i) { return p.buttons[i] && p.buttons[i].pressed; };
  if (p.axes[1] < -dz || b(12)) s.up = 1;
  if (p.axes[1] > dz || b(13)) s.down = 1;
  if (p.axes[0] < -dz || b(14)) s.left = 1;
  if (p.axes[0] > dz || b(15)) s.right = 1;
  if (b(0)) s.confirm = 1;
  if (b(2)) s.cancel = 1;
  if (b(9)) s.menu = 1;
  return s;
});

// ---------------------------------------------------------------- misc helpers
function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
function int(v) { return Math.trunc(num(v)); }
function dsin(d) { return Math.sin(d * Math.PI / 180); }
function dcos(d) { return Math.cos(d * Math.PI / 180); }
function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI; }
function angleDiff(a, b) {
  var d = ((a - b) % 360 + 360) % 360;
  return d > 180 ? 360 - d : d;
}
function choose() { return arguments[Math.floor(Math.random() * arguments.length)]; }
function rand(n) { return Math.random() * n; }
function zeropad(n, d) { var s = String(Math.trunc(n)); while (s.length < d) s = "0" + s; return s; }
