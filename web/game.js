"use strict";
// Port of the Construct 2 event sheets (Battle, Timeline, Menus, MainMenu, RPGText...) to plain JavaScript.
// Coordinates, speeds and timings are kept identical to the original project.

var HEARTMODE_RED = 0, HEARTMODE_BLUE = 1;
var MODE_NORMAL = 0, MODE_ENDLESS = 1, MODE_SINGLE = 2, MODE_PRACTICE = 3;
var HEART_JUMP_STRENGTH = 180, HEART_JUMPHOLD_CUTOFF = 30;
var STATE_ENTER = 0, STATE_WAIT = 1, STATE_FIRE = 2, STATE_LEAVE = 3;

var TINT_RED = [255, 0, 0], TINT_BLUE = [0, 60, 255];
var TINT_BONE_BLUE = [20, 169, 255], TINT_BONE_ORANGE = [255, 160, 64];
var TINT_GREY = [191, 191, 191], TINT_DISABLED = [128, 128, 128];

// Settings that the options panel can change
var Settings = {
  // Half size of the heart's damage hitbox. 4 = 8x8 box (closer to Undertale). 0 = original simulator (centre point only)
  hitbox: 4
};

// Globals (Globals.xml)
var Glob = {
  SimulatorMode: 0, EndlessStage: 0, PracticeTarget: 60, SingleAttack: "", Name: "Chara",
  HP: 92, MaxHP: 92, KR: 0, KR_T: 0
};

var ITEM_DB = [ // type, amount, full name, short name
  [0, 99, "Butterscotch Pie", "Pie"],
  [0, 90, "Instant Noodles", "I.Noodles"],
  [0, 60, "Face Steak", "Steak"],
  [0, 40, "Legendary Hero", "L. Hero"]
];

var Game = {
  scene: null,       // "menu" | "battle"
  nextScene: null,
  time: 0,
  waits: [],
  camX: 320, camY: 240,
  S: null            // per-scene state
};

function after(sec, fn) { Game.waits.push({ t: Game.time + sec, fn: fn }); }
function gotoScene(name) { Game.nextScene = name; }

// ---------------------------------------------------------------- function registry (Construct "Function" object)
var FN = {};
function def(name, f) { FN[name.toLowerCase()] = f; }
function callFn(name, args) {
  if (!name) return undefined;
  var f = FN[String(name).toLowerCase()];
  if (!f) return undefined;
  return f.apply(null, args || []);
}

// ---------------------------------------------------------------- Text objects (RPGText family)
function makeText(o) {
  var t = {
    font: o.font, layer: o.layer || "background", x: o.x || 0, y: o.y || 0,
    width: o.width || 0, scale: o.scale || 1, align: o.align || "left",
    text: o.text || "", fullText: o.fullText || "", curChar: 0, t: 0,
    voice: o.voice !== undefined ? o.voice : (o.font === "DefaultFont" ? "BattleText" : (o.font === "SansFont" ? "SansSpeak" : "")),
    interactive: !!o.interactive, timeout: o.timeout || 0, endFunc: o.endFunc || "", name: o.name || "",
    tint: o.tint || null, visible: o.visible !== false, dead: false
  };
  Game.S.texts.push(t);
  return t;
}
function destroyText(t) {
  if (t.dead) return;
  t.dead = true;
  if (t.endFunc) callFn(t.endFunc);
}
function destroyTexts(font) {
  Game.S.texts.forEach(function (t) { if (t.font === font) destroyText(t); });
}
function findText(name) {
  for (var i = 0; i < Game.S.texts.length; i++) if (!Game.S.texts[i].dead && Game.S.texts[i].name === name) return Game.S.texts[i];
  return null;
}
function updateTexts() {
  var texts = Game.S.texts.slice();
  texts.forEach(function (t) {
    if (t.dead) return;
    t.t += DT;
    if (t.curChar < t.fullText.length && t.t >= 1 / 30) {
      t.t -= 1 / 30;
      t.curChar++;
      t.text = t.fullText.slice(0, t.curChar);
      if (t.voice) Audio2.play(t.voice);
    }
    if (t.interactive) {
      if (VPad.pressed("confirm") && t.curChar === t.fullText.length) { destroyText(t); return; }
      if (VPad.pressed("cancel")) { t.curChar = t.fullText.length; t.text = t.fullText; t.t = 0; }
    } else if (t.curChar === t.fullText.length && t.timeout > 0) {
      t.timeout -= Math.min(DT, t.timeout);
      if (t.timeout === 0) destroyText(t);
    }
  });
  Game.S.texts = Game.S.texts.filter(function (t) { return !t.dead; });
}
function drawTexts(g, layer) {
  Game.S.texts.forEach(function (t) {
    if (t.dead || !t.visible || t.layer !== layer) return;
    drawText(g, t.font, t.text, t.x, t.y, { scale: t.scale, width: t.width, tint: t.tint, align: t.align });
  });
}

// ---------------------------------------------------------------- Menus (Menus.xml)
// MenuStack: array of {sel, back}. "Back" in the original is the selection of the top entry.
function menuTop() { var st = Game.S.menuStack; return st[st.length - 1]; }
function menuBack() { return menuTop().sel; }
def("MenuBackAction", function (a) { menuTop().back = a || ""; });
function findMenuItem(id) {
  var items = Game.S.menuItems;
  for (var i = 0; i < items.length; i++) if (items[i].id === id) return items[i];
  return null;
}
function createMenuItem(layer, x, y, id, text, action) {
  var it = { x: num(x), y: num(y), id: id, text: text, action: action || "" };
  Game.S.menuItems.push(it);
  it.font = makeText({
    font: "DefaultFont", layer: "background", x: it.x + 32, y: it.y, width: 512, scale: 2, text: text,
    name: "Menu" + id, tint: it.action === "" ? TINT_DISABLED : null
  });
  return it;
}
function destroyMenuItems() { Game.S.menuItems = []; }
def("MenuSelect", function (dir) {
  var cur = findMenuItem(menuBack());
  if (!cur) return;
  var targetID = -1, targetDist = Infinity;
  var others = Game.S.menuItems.filter(function (m) { return m.id !== cur.id; });
  others.forEach(function (m) {
    var ang = angleTo(cur.x, cur.y, m.x, m.y);
    if (angleDiff(ang, dir * 90) <= 0.5) {
      var d = Math.hypot(m.x - cur.x, m.y - cur.y);
      if (d < targetDist) { targetDist = d; targetID = m.id; }
    }
  });
  if (targetID === -1) {
    // wrap around: farthest item in the opposite direction
    targetDist = -Infinity;
    others.forEach(function (m) {
      var ang = angleTo(cur.x, cur.y, m.x, m.y);
      if (angleDiff(ang, dir * 90 - 180) <= 0.5) {
        var d = Math.hypot(m.x - cur.x, m.y - cur.y);
        if (d > targetDist) { targetDist = d; targetID = m.id; }
      }
    });
  }
  if (targetID !== -1) {
    menuTop().sel = targetID;
    Audio2.play("MenuCursor");
  }
});
function runMenu() {
  var cur = findMenuItem(menuBack());
  if (VPad.pressed("confirm") && cur && cur.action !== "") {
    Game.S.menuStack.push({ sel: 0, back: "" });
    callFn(cur.action);
    Audio2.play("MenuSelect");
  } else if (VPad.pressed("cancel") && menuTop().back !== "") {
    var f = menuTop().back;
    Game.S.menuStack.pop();
    callFn(f);
    Audio2.play("MenuSelect");
  } else if (VPad.pressed("right")) callFn("MenuSelect", [0]);
  else if (VPad.pressed("down")) callFn("MenuSelect", [1]);
  else if (VPad.pressed("left")) callFn("MenuSelect", [2]);
  else if (VPad.pressed("up")) callFn("MenuSelect", [3]);
  Game.S.menuItems.forEach(function (m) {
    if (m.font) { m.font.x = m.x + 32; m.font.y = m.y; }
  });
}

// ================================================================= MAIN MENU (MainMenu.xml)
var customAttackLoaded = false;
var firstStart = true;

function startMainMenu() {
  Game.S = { texts: [], menuItems: [], menuStack: [{ sel: 0, back: "" }], heart: { x: 0, y: 0 } };
  Game.camX = 320; Game.camY = 240;
  Glob.HP = Glob.MaxHP;
  callFn("MenuMain");
  if (firstStart) {
    firstStart = false;
    var q = new URLSearchParams(location.search);
    var mode = q.get("mode");
    if (mode === "normal") { Glob.SimulatorMode = MODE_NORMAL; gotoScene("battle"); }
    if (mode === "endless1") { Glob.SimulatorMode = MODE_ENDLESS; Glob.EndlessStage = 0; gotoScene("battle"); }
    if (mode === "endless2") { Glob.SimulatorMode = MODE_ENDLESS; Glob.EndlessStage = 1; gotoScene("battle"); }
    if (mode === "single" && ATTACKS[q.get("attack")]) {
      Glob.SimulatorMode = MODE_SINGLE; Glob.SingleAttack = q.get("attack"); gotoScene("battle");
    }
  }
}
function menuTitle(text) {
  makeText({ font: "DefaultFont", x: 0, y: 32, width: 640, scale: 2, text: text, align: "center" });
}
def("MenuMain", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", [""]);
  menuTitle("Select your bad time");
  createMenuItem(0, 192, 96, 0, "Normal", "MenuModeNormal");
  createMenuItem(0, 192, 128, 1, "Practice", "MenuModePractice");
  createMenuItem(0, 192, 160, 2, "Endless", "MenuModeEndless");
  createMenuItem(0, 192, 192, 3, "Single attack", "MenuModeSingle");
  createMenuItem(0, 192, 224, 4, "Custom attack", "MenuModeCustom");
});
def("MenuModeNormal", function () { Glob.SimulatorMode = MODE_NORMAL; gotoScene("battle"); });
def("MenuModePractice", function () { Glob.SimulatorMode = MODE_PRACTICE; gotoScene("battle"); });
def("MenuModeEndless", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuMain"]);
  Glob.SimulatorMode = MODE_ENDLESS;
  for (var i = 0; i <= 1; i++) createMenuItem(0, 192, 96 + i * 32, i, "Phase " + (i + 1), "MenuEndless");
});
def("MenuEndless", function () {
  var st = Game.S.menuStack;
  Glob.EndlessStage = st[st.length - 2].sel;
  gotoScene("battle");
});
def("MenuModeSingle", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuMain"]);
  Glob.SimulatorMode = MODE_SINGLE;
  menuTitle("Choose an attack");
  for (var i = 0; i < ATTACK_LIST.length; i++) createMenuItem(0, 192, 96 + i * 32, i, ATTACK_LIST[i], "MenuSingleAttack");
});
def("MenuSingleAttack", function () {
  var st = Game.S.menuStack;
  Glob.SingleAttack = ATTACK_LIST[st[st.length - 2].sel];
  gotoScene("battle");
});
def("MenuModeCustom", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuMain"]);
  menuTitle("Custom attack");
  Glob.SimulatorMode = MODE_SINGLE;
  createMenuItem(0, 192, 96, 0, "Documentation", "MenuCustomDocs");
  createMenuItem(0, 192, 128, 1, "Load file", "MenuCustomSelect");
  createMenuItem(0, 192, 160, 2, "Run attack", customAttackLoaded ? "MenuCustomRun" : "");
});
def("MenuCustomDocs", function () {
  // The selection pushed a menu level; undo that so the menu stays where it is.
  Game.S.menuStack.pop();
  window.open("https://github.com/dentallyunstable/bad-time-sim/tree/master/Documentation", "_blank");
});
def("MenuCustomSelect", function () {
  Game.S.menuStack.pop();
  window.showFilePicker();
});
def("MenuCustomRun", function () { Glob.SingleAttack = "custom"; gotoScene("battle"); });
function onCustomFile(file) {
  var r = new FileReader();
  r.onload = function () {
    ATTACKS.custom = String(r.result);
    customAttackLoaded = true;
    if (Game.scene === "menu") {
      makeText({ font: "BattleFont", x: 8, y: 8, width: 640, scale: 3, text: "CUSTOM ATTACK LOADED", timeout: 1 });
      var it = findMenuItem(2);
      if (it && it.text === "Run attack") { it.action = "MenuCustomRun"; it.font.tint = null; }
    }
  };
  r.readAsText(file);
}

function tickMainMenu() {
  updateTexts();
  runMenu();
  var it = findMenuItem(menuBack());
  if (it) {
    Game.S.heart.x = it.x + 8;
    Game.S.heart.y = it.y + 12;
    var maxY = 0;
    Game.S.menuItems.forEach(function (m) { maxY = Math.max(maxY, m.y); });
    var layoutH = Math.max(480, maxY + 64);
    Game.camY = Math.max(240, Math.min(layoutH - 240, it.y - 16));
  }
}
function drawMainMenu(g) {
  g.fillStyle = "#000"; g.fillRect(0, 0, GAME_W, GAME_H);
  g.save();
  g.translate(320 - Game.camX, 240 - Game.camY);
  drawTexts(g, "background");
  drawSprite(g, ANIM["PlayerHeart/Default"][0], Game.S.heart.x, Game.S.heart.y, 16, 16, 0.5, 0.5, 90, 1, TINT_RED);
  g.restore();
}

// ================================================================= BATTLE (Battle.xml)
var B; // shortcut to Game.S during battle

function startBattle() {
  B = Game.S = {
    texts: [], menuItems: [], menuStack: [{ sel: 0, back: "" }],
    zone: { x: 32, y: 240, w: 576, h: 144, l: 32, t: 240, r: 608, b: 384, tl: 33, tt: 251, tr: 608, tb: 391, visible: false, infoText: "" },
    resizeSpeed: 480, endResize: "",
    heart: { x: 320, y: 320, vx: 0, vy: 0, angle: 90, mode: 0, slammed: false, slamDamage: false,
      visible: false, move: true, overlay: false, anim: "Default" },
    maxFall: 750,
    bones: [], stabs: [], warns: [], platforms: [], blasters: [], menuBonesLeft: [], menuBonesBottom: [],
    bottomBones: false, bottomBoneTimer: 0, bottomBoneAlt: 0,
    shards: [],
    sans: {
      x: 320, y: 224, xspeed: 0, nextAttack: 0, hitAttempts: 0, dodgeState: 0, dodgeTimer: 0,
      anim: "", torso: { anim: "Default", t: 0, ox: 0, oy: 0 }, head: { anim: "Default", frame: 0, t: 0, ox: 0, oy: 0 },
      body: { visible: false, anim: "HandDown", frame: 0, t: 0 }, sweat: { visible: false, anim: "Sweat1" }
    },
    bubble: null,
    target: null, targetChoice: null, strike: null,
    overlayOpaque: false,
    shake: { intensity: 0, timer: 0, ox: 0, oy: 0 },
    menuState: 0,
    uiButtons: [
      { id: 0, name: "UIFight", x: 32, y: 432, action: "MenuFight", anim: "Default" },
      { id: 1, name: "UIAct", x: 184, y: 432, action: "MenuAct", anim: "Default" },
      { id: 2, name: "UIItem", x: 344, y: 432, action: "MenuItem", anim: "Default" },
      { id: 3, name: "UIMercy", x: 496, y: 432, action: "MenuMercy", anim: "Default" }
    ],
    lastDamageTime: -1,
    items: [0, 1, 2, 3, 3, 3, 3, 3],
    tl: { running: false, line: 0, t: 0, lines: [], labels: {}, vars: {}, cur: [] },
    practiceAttack: 0, failed: false,
    dead: false
  };
  Game.camX = 320; Game.camY = 240;
  Glob.KR = 0; Glob.KR_T = 0;
  callFn("SansAnimation", [""]);
  B.sans.head.anim = "ClosedEyes";
  B.hpText = makeText({ font: "BattleFont", x: 416, y: 400, scale: 3, text: "92 / 92", name: "HP" });
  makeText({ font: "BattleFont", x: 32, y: 402, scale: 3, text: Glob.Name.toUpperCase() + "   LV 19", name: "PlayerName" });
  if (Glob.SimulatorMode !== MODE_NORMAL) Audio2.play("mus_zz_megalovania", true, "Music");
  if (Glob.SimulatorMode === MODE_ENDLESS && Glob.EndlessStage === 1) {
    B.sans.hitAttempts = 15;
    callFn("SansHead", ["Default"]);
    callFn("SansAnimation", ["Idle"]);
  }
  if (Glob.SimulatorMode === MODE_SINGLE) {
    makeText({ font: "BattleFont", x: 0, y: 32, width: 640, scale: 3, text: "PRESS 'X' TO QUIT", name: "QuitMessage" });
  }
  callFn("StartAttack");
}

def("BattlePanic", function (msg) {
  B.texts.forEach(function (t) { if (t.name === "Error") t.dead = true; });
  makeText({ font: "BattleFont", layer: "overlay", x: 0, y: 0, width: 640, scale: 3, text: String(msg).toUpperCase(), name: "Error", timeout: 3 });
  callFn("EndAttack");
});

def("ResetVars", function () {
  callFn("CombatZoneSpeed", [480]);
  callFn("HeartMode", [B.heart.mode]);
  callFn("HeartMaxFallSpeed", [750]);
  callFn("SansSlamDamage", [0]);
  B.sans.xspeed = 0;
  B.sans.x = 320;
});
def("RunAttack", function (name) { callFn("TLPlay", [ATTACKS[name] || ""]); });

var PHASE1 = ["sans_intro", "sans_bonegap1", "sans_bluebone", "sans_bonegap2", "sans_platforms1", "sans_platforms2",
  "sans_platforms3", "sans_platforms4", "sans_platformblaster", "sans_platforms4hard", "sans_bonegap1fast",
  "sans_boneslideh", "sans_bonegap2", "sans_platformblasterfast"];
var PHASE2 = ["sans_multi1", "sans_randomblaster1", "sans_multi2", "sans_bonestab1", "sans_bonestab2",
  "sans_randomblaster2", "sans_boneslidev", "sans_multi3", "sans_bonestab3"];

def("StartAttack", function () {
  var s = B.sans;
  if (Glob.SimulatorMode === MODE_PRACTICE) {
    s.nextAttack = B.practiceAttack;
    Glob.HP = Glob.MaxHP; Glob.KR = 0; B.failed = false;
  }
  B.heart.move = true;
  B.heart.vx = 0; B.heart.vy = 0;
  callFn("ResetVars");
  callFn("MenuBonesOff");
  if (Glob.SimulatorMode !== MODE_SINGLE) {
    if (s.hitAttempts < 13) {
      if (s.nextAttack < 14) { callFn("RunAttack", [PHASE1[s.nextAttack]]); s.nextAttack++; }
      else callFn("RunAttack", [choose("sans_bonegap1fast", "sans_bonegap2", "sans_boneslideh", "sans_platformblasterfast")]);
    }
    if (s.hitAttempts === 13) {
      callFn("RunAttack", ["sans_spare"]);
      callFn("SansSweat", [2]);
      s.nextAttack = 0;
      Audio2.setPaused("Music", true);
    }
    if (s.hitAttempts > 13 && s.hitAttempts <= 22) {
      Audio2.stop("Music2");
      if (s.nextAttack < 9) { callFn("RunAttack", [PHASE2[s.nextAttack]]); s.nextAttack++; }
      else callFn("RunAttack", [choose("sans_bonestab3", "sans_multi3", "sans_randomblaster2")]);
    }
    if (s.hitAttempts > 22) callFn("RunAttack", ["sans_final"]);
  } else {
    callFn("SansAnimation", ["Idle"]);
    s.head.anim = "Default";
    callFn("RunAttack", [Glob.SingleAttack]);
  }
});

def("EndAttack", function () {
  var s = B.sans;
  B.bones = []; B.stabs = []; B.warns = []; B.platforms = []; B.blasters = [];
  B.menuBonesLeft = []; B.menuBonesBottom = [];
  callFn("BattleMenuEnable", [1]);
  B.heart.visible = true;
  B.heart.move = false;
  callFn("ResetVars");
  B.overlayOpaque = false;
  callFn("SansAnimation", ["Idle"]);
  s.head.anim = "Default";
  s.torso.anim = "Default";
  if (Glob.KR >= 0) B.zone.infoText = "* You felt your sins crawling\n  on your back.";
  if (Glob.KR >= 10) B.zone.infoText = "* You felt your sins weighing\n  on your neck.";
  if (Glob.KR >= 20) B.zone.infoText = "* KARMA coursing through your\n  veins.";
  if (s.hitAttempts < 13 && s.nextAttack === 1) {
    B.zone.infoText = "* You feel like you're going to\n  have a bad time.";
    if (!Audio2.isTagPlaying("Music")) Audio2.play("mus_zz_megalovania", true, "Music");
  }
  if (s.hitAttempts !== 13) Audio2.setPaused("Music", false);
  if (s.hitAttempts === 13) B.zone.infoText = "* Sans is taking a break.";
  if (s.hitAttempts === 15) B.zone.infoText = "* The REAL battle finally begins.";
  if (s.hitAttempts === 19) B.zone.infoText = "* Reading this doesn't seem\n  like the best use of time.";
  if (s.hitAttempts === 20) B.zone.infoText = "* Sans is starting to look\n  really tired.";
  if (s.hitAttempts === 21) B.zone.infoText = "* Sans is preparing something.";
  if (s.hitAttempts === 22) B.zone.infoText = "* Sans is getting ready to\n  use his special attack.";
  if (s.hitAttempts > 22) {
    callFn("BattleMenuEnable", [0]);
    callFn("CombatZoneResize", [zoneLeft(), zoneTop(), zoneRight(), zoneBottom()]);
    callFn("SansAnimation", ["Tired"]);
    s.head.anim = "Tired2";
    Audio2.stopAll();
    callFn("SansText", ["huff... puff...", "Win1"]);
  }
  if (s.hitAttempts > 13 && s.hitAttempts !== 16 && s.hitAttempts !== 17 && s.hitAttempts <= 22) callFn("MenuBoneLeft");
  if (s.hitAttempts > 15 && s.hitAttempts <= 22) callFn("MenuBoneBottom");
  practiceOnEndAttack();
});
def("Win1", function () { callFn("SansText", ["alright, i guess\nyou win.", "Win2"]); });
def("Win2", function () { gotoScene("menu"); });
def("Sound", function (name, rate) {
  var h = Audio2.play(name);
  if (rate !== undefined && rate !== "") Audio2.setRate(h, num(rate));
});
def("Music", function (name) { Audio2.play(name, true, "Music"); });
def("BlackScreen", function (on) {
  if (int(on) === 1) {
    B.overlayOpaque = true;
    B.zone.visible = false;
    Audio2.setPaused("Music", true);
    B.blasters = []; B.menuBonesLeft = []; B.menuBonesBottom = [];
    B.bones = []; B.stabs = []; B.warns = []; B.platforms = [];
  }
  if (int(on) === 0) {
    B.overlayOpaque = false;
    Audio2.setPaused("Music", false);
    B.zone.visible = true;
  }
});

// ---------------------------------------------------------------- Battle menu
def("BattleMenuEnable", function (on) {
  if (int(on) === 1) {
    B.menuStack = [B.menuStack[0]];
    B.menuStack[0].back = "";
    B.menuState = 1;
    callFn("CombatZoneResize", [33, 251, 608, 391, "MenuBattle"]);
  } else {
    B.menuState = 0;
  }
});
def("MenuBattle", function () {
  if (Glob.SimulatorMode === MODE_NORMAL) {
    destroyMenuItems(); destroyTexts("DefaultFont");
    callFn("MenuBackAction", [""]);
    B.menuState = 2;
    makeText({ font: "DefaultFont", layer: "zone", x: 48, y: 272, width: 544, scale: 2, fullText: B.zone.infoText, name: "InfoText" });
    B.uiButtons.forEach(function (u) { B.menuItems.push({ x: u.x, y: u.y, id: u.id, action: u.action, text: "" }); });
  } else {
    after(0, function () { B.menuState = 0; callFn("StartAttack"); });
  }
});
def("MenuEnemyList", function () {
  var action = "";
  if (B.menuStack[0].sel === 0) action = "MenuFightEnemy";
  if (B.menuStack[0].sel === 1) action = "MenuActEnemy";
  createMenuItem("zone", 64, 272, 0, "* Sans", action);
});
def("MenuFight", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuBattle"]);
  B.menuState = 3;
  callFn("MenuEnemyList");
});
def("MenuFightEnemy", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  B.menuState = 0;
  B.heart.visible = false;
  B.target = { state: 0, w: 548, opacity: 100 };
  // Move the left menu bone in front of the target
  B.menuBonesLeft.forEach(function (m) { m.top = true; });
  if (Math.floor(rand(2)) === 0) B.targetChoice = { x: zoneLeft(), dir: 0, playing: false, t: 0 };
  else B.targetChoice = { x: zoneRight(), dir: 2, playing: false, t: 0 };
});
function damageText(text, x, y, timeout, layer, tint) {
  return makeText({ font: "DamageFont", layer: layer || "enemies", x: x, y: y, text: text, timeout: timeout, tint: tint });
}
function updateFightTarget() {
  var tg = B.target, tc = B.targetChoice;
  if (tg && tg.state === 0 && tc) {
    tc.x += dcos(tc.dir * 90) * DT * 360;
    if (tc.dir === 0 && tc.x > zoneRight() || tc.dir === 2 && tc.x < zoneLeft()) {
      B.targetChoice = null;
      tg.state = 2;
      damageText("MISS", 272, 76, 1, "enemies", TINT_GREY);
      callFn("StartAttack");
    } else if (VPad.pressed("confirm")) {
      tg.state = 1;
      tc.playing = true;
      B.strike = { x: B.sans.x, y: B.sans.y - 96, frame: 0, t: 0 };
      Audio2.play("PlayerFight");
      B.sans.dodgeState = 1;
    }
  }
  if (tg && tg.state === 2) {
    tg.w -= DT * 960;
    tg.opacity -= DT * 240;
    if (tg.opacity <= 0) B.target = null;
  }
  if (tc && tc.playing) tc.t += DT;
  if (B.strike) {
    B.strike.t += DT;
    B.strike.frame = Math.floor(B.strike.t * 10);
    if (B.strike.frame >= 6) B.strike = null;
  }
}
def("MenuAct", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuBattle"]);
  B.menuState = 3;
  callFn("MenuEnemyList");
});
def("MenuActEnemy", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuAct"]);
  B.menuState = 3;
  createMenuItem("zone", 64, 272, 0, "* Check", "MenuCheckSans");
});
function infoText(text, endFunc) {
  return makeText({ font: "DefaultFont", layer: "zone", x: 48, y: 272, width: 544, scale: 2, fullText: text,
    name: "InfoText", endFunc: endFunc, interactive: true });
}
def("MenuCheckSans", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  B.menuState = 0;
  var t = infoText("* SANS 1 ATK 1 DEF\n* The easiest enemy.\n* Can only deal 1 damage.", "StartAttack");
  B.heart.visible = false;
  if (B.sans.hitAttempts > 0) t.endFunc = "MenuCheckSans2";
});
def("MenuCheckSans2", function () { infoText("* Can't keep dodging forever.\n* Keep attacking.", "StartAttack"); });
def("MenuItem", function () {
  if (B.items.length === 0) { B.menuStack.pop(); return; }
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuBattle"]);
  B.menuState = 3;
  makeText({ font: "DefaultFont", layer: "zone", x: 384, y: 336, width: 256, scale: 2, text: "PAGE 1", name: "Page" });
  for (var i = 0; i < B.items.length; i++) {
    var page = Math.floor(i / 4), k = i % 4;
    createMenuItem("zone", page * 640 + 64 + (k % 2) * 256, 272 + Math.floor(k / 2) * 32, i, "* " + ITEM_DB[B.items[i]][3], "MenuUseItem");
  }
});
def("MenuUseItem", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  B.heart.visible = false;
  B.menuState = 0;
  var slot = B.menuStack[B.menuStack.length - 2].sel;
  var id = B.items[slot];
  if (ITEM_DB[id][0] === 0) {
    Glob.HP += ITEM_DB[id][1];
    Audio2.play("PlayerHeal");
    var maxed = Glob.HP >= Glob.MaxHP;
    infoText("* You eat the " + ITEM_DB[id][2] + ".\n* " + (maxed ? "Your HP was maxed out." : "You recovered " + ITEM_DB[id][1] + " HP!"), "StartAttack");
    B.items.splice(slot, 1);
    // the item menu remembers the selected slot; keep it inside the shorter list
    B.menuStack[B.menuStack.length - 2].sel = Math.max(0, Math.min(slot, B.items.length - 1));
  }
});
def("MenuMercy", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  callFn("MenuBackAction", ["MenuBattle"]);
  B.menuState = 3;
  createMenuItem("zone", 64, 272, 0, "* Spare", "MenuSpare");
});
def("MenuSpare", function () {
  destroyMenuItems(); destroyTexts("DefaultFont");
  B.menuState = 0;
  B.heart.visible = false;
  callFn("StartAttack");
});
function uiHeartPoint(u) { return { x: u.x + 0.145455 * 110, y: u.y + 21 }; }
function tickBattleMenu() {
  updateFightTarget();
  if (B.menuState >= 2) runMenu();
  if (B.menuState === 3 && B.menuStack[0].sel === 2) {
    var sel = findMenuItem(menuBack());
    if (sel) {
      if (sel.x > 640) B.menuItems.forEach(function (m) { m.x -= 640; });
      if (sel.x < 0) B.menuItems.forEach(function (m) { m.x += 640; });
    }
    B.menuItems.forEach(function (m) { if (m.font) { m.font.x = m.x + 32; m.font.y = m.y; } });
    var p = findText("Page");
    if (p) p.text = "PAGE " + (Math.floor(menuBack() / 4) + 1);
  }
  if (B.menuState === 0) B.uiButtons.forEach(function (u) { u.anim = "Default"; });
  var top = menuBack();
  if (B.menuState === 1 || B.menuState === 2) {
    if (B.menuState === 2) B.uiButtons.forEach(function (u) { u.anim = "Default"; });
    B.uiButtons.forEach(function (u) {
      if (u.id === top) {
        var hp = uiHeartPoint(u);
        B.heart.x = hp.x; B.heart.y = hp.y;
        if (B.menuState === 2) u.anim = "Highlight";
      }
    });
  }
  if (B.menuState === 3) {
    var it = findMenuItem(top);
    if (it) { B.heart.x = it.x + 8; B.heart.y = it.y + 12; }
  }
}

// ---------------------------------------------------------------- Combat zone
function zoneLeft() { return B.zone.x; }
function zoneTop() { return B.zone.y; }
function zoneRight() { return B.zone.x + B.zone.w; }
function zoneBottom() { return B.zone.y + B.zone.h; }
def("CombatZoneSpeed", function (s) { B.resizeSpeed = int(s); });
def("CombatZoneResize", function (l, t, r, b, fin) {
  var z = B.zone;
  z.tl = num(l); z.tt = num(t); z.tr = num(r); z.tb = num(b);
  B.endResize = fin || "";
  z.visible = true;
});
def("CombatZoneResizeInstant", function (l, t, r, b) {
  var z = B.zone;
  z.tl = num(l); z.tt = num(t); z.tr = num(r); z.tb = num(b);
  z.l = z.tl; z.t = z.tt; z.r = z.tr; z.b = z.tb;
  syncZone();
  combatZoneTick();
  z.visible = true;
});
def("CombatZoneResizeAuto", function (l, t, r, b) { callFn("CombatZoneResizeInstant", [l, t, r, b]); });
function syncZone() {
  var z = B.zone;
  z.x = z.l; z.y = z.t; z.w = z.r - z.l; z.h = z.b - z.t;
}
function toward(v, target, step) {
  if (Math.abs(target - v) <= step) return target;
  return v + (target > v ? step : -step);
}
function combatZoneTick() {
  var z = B.zone, sp = B.resizeSpeed * DT;
  z.l = toward(z.l, z.tl, sp); z.t = toward(z.t, z.tt, sp);
  z.r = toward(z.r, z.tr, sp); z.b = toward(z.b, z.tb, sp);
  syncZone();
  if (B.endResize !== "" && z.l === z.tl && z.t === z.tt && z.r === z.tr && z.b === z.tb) {
    var f = B.endResize;
    B.endResize = "";
    callFn(f);
  }
  var h = B.heart;
  if (rectsOverlap(h.x - 8, h.y - 8, 16, 16, z.x, z.y, z.w, z.h)) {
    if (zoneLeft() + 5 > h.x - 8) h.x = zoneLeft() + 5 + 8;
    if (zoneTop() + 5 > h.y - 8) h.y = zoneTop() + 5 + 8;
    if (zoneRight() - 5 < h.x + 8) h.x = zoneRight() - 5 - 8;
    if (zoneBottom() - 5 < h.y + 8) h.y = zoneBottom() - 5 - 8;
  }
}
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// ---------------------------------------------------------------- Heart movement
def("HeartMode", function (m) {
  var mode = int(m);
  if (mode === HEARTMODE_RED) { B.heart.mode = HEARTMODE_RED; B.heart.angle = 90; }
  if (mode === HEARTMODE_BLUE) { B.heart.mode = HEARTMODE_BLUE; B.heart.angle = 90; }
});
def("HeartTeleport", function (x, y) { B.heart.x = int(x); B.heart.y = int(y); B.heart.visible = true; });
def("HeartMaxFallSpeed", function (s) { B.maxFall = int(s); });
def("SansSlam", function (d) {
  d = num(d);
  if (!(d >= 0 && d <= 3)) return;
  callFn("HeartMode", [HEARTMODE_BLUE]);
  var h = B.heart;
  h.slammed = true;
  h.angle = Math.floor(d) * 90;
  h.vx = Math.round(dcos(h.angle)) * B.maxFall;
  h.vy = Math.round(dsin(h.angle)) * B.maxFall;
});
def("SansSlamDamage", function (on) { B.heart.slamDamage = int(on) !== 0; });

function heartDir() { var h = B.heart; return { x: Math.round(dcos(h.angle)), y: Math.round(dsin(h.angle)) }; }
function platformSolidFor(p, ox, oy) {
  var h = B.heart;
  if (!rectsOverlap(h.x - 8 + ox, h.y - 8 + oy, 16, 16, p.x, p.y, p.w, p.h)) return false;
  var a = ((Math.round(h.angle) % 360) + 360) % 360;
  if (a === 0 && p.x > h.x && h.vx >= p.vx && h.x + 8 <= p.x + 2) return true;
  if (a === 90 && p.y > h.y && h.vy >= p.vy && h.y + 8 <= p.y + 2) return true;
  if (a === 180 && p.x < h.x && h.vx <= p.vx && h.x - 8 >= p.x + p.w - 2) return true;
  if (a === 270 && p.y < h.y && h.vy <= p.vy && h.y - 8 >= p.y + p.h - 2) return true;
  return false;
}
function heartCheckSolid(ox, oy) {
  var h = B.heart, z = B.zone;
  var hx = h.x - 8 + ox, hy = h.y - 8 + oy;
  // the four 5px borders of the combat zone
  if (rectsOverlap(hx, hy, 16, 16, z.x, z.y, z.w, 5) || rectsOverlap(hx, hy, 16, 16, z.x, z.y, 5, z.h) ||
    rectsOverlap(hx, hy, 16, 16, z.x, z.y + z.h - 5, z.w, 5) || rectsOverlap(hx, hy, 16, 16, z.x + z.w - 5, z.y, 5, z.h)) return true;
  for (var i = 0; i < B.platforms.length; i++) if (platformSolidFor(B.platforms[i], ox, oy)) return true;
  return false;
}
function onHeartStepHit(axis) {
  var h = B.heart;
  var v = axis === "x" ? h.vx : h.vy;
  if (h.slammed) {
    h.slammed = false;
    if (Math.abs(v) >= 330) {
      Audio2.play("PlayerDamaged");
      Audio2.play("Slam");
      callFn("SansShake", [Math.floor(Math.abs(v) / 30 / 3)]);
      if (h.slamDamage && Glob.HP > 1) Glob.HP -= 1;
    }
  }
  if (axis === "x") h.vx = 0; else h.vy = 0;
}
// Custom Movement behaviour, "Horizontal then vertical" stepping with 1px steps.
function moveHeart() {
  var h = B.heart;
  if (!h.move) return;
  var axes = ["x", "y"];
  for (var a = 0; a < 2; a++) {
    var ax = axes[a];
    var dist = (ax === "x" ? h.vx : h.vy) * DT;
    if (dist === 0) continue;
    var sign = dist > 0 ? 1 : -1, left = Math.abs(dist);
    while (left > 0) {
      var step = Math.min(1, left);
      h[ax] += step * sign;
      left -= step;
      if (heartCheckSolid(0, 0)) {
        h[ax] -= step * sign; // back to the previous step
        onHeartStepHit(ax);
        break;
      }
    }
  }
}
// The direction key that makes the blue heart jump, or null when jumping is not possible.
var JUMP_KEYS = { 0: "left", 90: "up", 180: "right", 270: "down" };
function heartJumpKey() {
  if (Game.scene !== "battle" || !B) return null;
  var h = B.heart;
  if (h.mode !== HEARTMODE_BLUE || !h.move) return null;
  return JUMP_KEYS[((Math.round(h.angle) % 360) + 360) % 360] || null;
}
function controlHeart() {
  var h = B.heart;
  if (!h.move) return;
  var speed = VPad.down("cancel") ? 75 : 150;
  if (h.mode === HEARTMODE_RED) {
    if (VPad.keys.up === VPad.keys.down) h.vy = 0;
    else { if (VPad.down("up")) h.vy = -speed; if (VPad.down("down")) h.vy = speed; }
    if (VPad.keys.left === VPad.keys.right) h.vx = 0;
    else { if (VPad.down("left")) h.vx = -speed; if (VPad.down("right")) h.vx = speed; }
    return;
  }
  if (h.mode !== HEARTMODE_BLUE) return;
  var a = ((Math.round(h.angle) % 360) + 360) % 360;
  var jumpKey = JUMP_KEYS[a];
  var d = heartDir();
  if (jumpKey) {
    if (VPad.pressed(jumpKey) && heartCheckSolid(d.x, d.y)) {
      h.vx -= d.x * HEART_JUMP_STRENGTH;
      h.vy -= d.y * HEART_JUMP_STRENGTH;
    }
    if (VPad.released(jumpKey)) {
      // letting go of jump early cuts the jump short
      var along = h.vx * d.x + h.vy * d.y;
      if (along < -HEART_JUMPHOLD_CUTOFF) {
        if (d.x) h.vx = -d.x * HEART_JUMPHOLD_CUTOFF; else h.vy = -d.y * HEART_JUMPHOLD_CUTOFF;
      }
    }
  }
  var down = h.vx * d.x + h.vy * d.y;
  var grav = 0;
  if (down < 240 && down > 15) grav = 540;
  if (down <= 15 && down > -30) grav = 180;
  if (down <= -30 && down > -120) grav = 450;
  if (down <= -120) grav = 180;
  if (!heartCheckSolid(d.x * 0.2, d.y * 0.2)) {
    h.vx += d.x * grav * DT;
    h.vy += d.y * grav * DT;
    if (a === 0 && h.vx > B.maxFall) h.vx = B.maxFall;
    if (a === 90 && h.vy > B.maxFall) h.vy = B.maxFall;
    if (a === 180 && h.vx < -B.maxFall) h.vx = -B.maxFall;
    if (a === 270 && h.vy < -B.maxFall) h.vy = -B.maxFall;
  }
  var i, p;
  if (a === 0 || a === 180) {
    h.vy = 0;
    for (i = 0; i < B.platforms.length; i++) {
      p = B.platforms[i];
      if (rectsOverlap(h.x - 8 + d.x * 0.2, h.y - 8 + d.y * 0.2, 16, 16, p.x, p.y, p.w, p.h)) { h.vx = p.vx; h.vy = p.vy; }
    }
    if (VPad.keys.up !== VPad.keys.down) {
      if (VPad.down("up")) h.vy -= speed;
      if (VPad.down("down")) h.vy += speed;
    }
  }
  if (a === 90 || a === 270) {
    h.vx = 0;
    for (i = 0; i < B.platforms.length; i++) {
      p = B.platforms[i];
      if (!rectsOverlap(h.x - 8 + d.x * 0.5, h.y - 8 + d.y * 0.5, 16, 16, p.x, p.y, p.w, p.h)) continue;
      if (a === 90 && p.y > h.y && h.vy >= p.vy && h.y + 8 <= p.y + 2) {
        h.vx = p.vx; h.vy = p.vy; h.y = p.y - 8.05;
      }
      if (a === 270 && p.y < h.y && h.vy <= p.vy && h.y - 8 >= p.y + p.h - 2) {
        h.vx = p.vx; h.vy = p.vy; h.y = p.y + p.h + 8.05;
      }
    }
    if (VPad.keys.left !== VPad.keys.right) {
      if (VPad.down("left")) h.vx -= speed;
      if (VPad.down("right")) h.vx += speed;
    }
  }
}

// ---------------------------------------------------------------- Platforms
// Optional 7th argument: acceleration in px/s^2. The platform then starts still and speeds up to Speed.
def("Platform", function (x, y, w, dir, speed, reverse, accel) {
  var p = { x: int(x), y: int(y), w: int(w), h: 7, dir: int(dir), speed: int(speed), reverse: int(reverse) > 0,
    accel: num(accel), vx: 0, vy: 0 };
  p.cur = p.accel > 0 ? 0 : p.speed;
  setPlatformVel(p);
  B.platforms.unshift(p); // "Move to bottom"
});
function setPlatformVel(p) {
  p.vx = Math.round(dcos(p.dir * 90)) * p.cur;
  p.vy = Math.round(dsin(p.dir * 90)) * p.cur;
}
def("PlatformRepeat", function (sx, sy, w, dir, speed, count, spacing) {
  var d = num(dir);
  for (var i = 0; i < int(count); i++) {
    callFn("Platform", [num(sx) - dcos(d * 90) * int(spacing) * i, num(sy) - dsin(d * 90) * int(spacing) * i, w, dir, speed]);
  }
});
function movePlatforms() {
  B.platforms.forEach(function (p) {
    if (p.accel > 0 && p.cur < p.speed) {
      p.cur = Math.min(p.speed, p.cur + p.accel * DT);
      setPlatformVel(p);
    }
    p.x += p.vx * DT; p.y += p.vy * DT;
  });
}
function reversePlatforms() {
  B.platforms.forEach(function (p) {
    if (!p.reverse) return;
    var old = p.dir;
    if (p.dir === 0 && p.x + p.w >= zoneRight()) p.dir = 2;
    else if (p.dir === 1 && p.y + p.h >= zoneBottom()) p.dir = 3;
    else if (p.dir === 2 && p.x <= zoneLeft()) p.dir = 0;
    else if (p.dir === 3 && p.y <= zoneTop()) p.dir = 1;
    if (p.dir !== old) setPlatformVel(p);
  });
}

// ---------------------------------------------------------------- Bones
def("BoneH", function (x, y, w, dir, speed, color) {
  B.bones.push({ kind: "H", x: int(x), y: int(y), w: int(w), h: 10, dir: int(dir), speed: int(speed), color: int(color), damage: 1, karma: 6 });
});
def("BoneV", function (x, y, h, dir, speed, color) {
  // "Move to bottom": newer vertical bones are drawn below older ones
  B.bones.unshift({ kind: "V", x: int(x), y: int(y), w: 10, h: int(h), dir: int(dir), speed: int(speed), color: int(color), damage: 1, karma: 6 });
});
def("BoneHRepeat", function (sx, sy, w, dir, speed, count, spacing) {
  var d = num(dir);
  for (var i = 0; i < int(count); i++)
    callFn("BoneH", [num(sx) - dcos(d * 90) * int(spacing) * i, num(sy) - dsin(d * 90) * int(spacing) * i, w, dir, speed]);
});
def("BoneVRepeat", function (sx, sy, h, dir, speed, count, spacing) {
  var d = num(dir);
  for (var i = 0; i < int(count); i++)
    callFn("BoneV", [num(sx) - dcos(d * 90) * int(spacing) * i, num(sy) - dsin(d * 90) * int(spacing) * i, h, dir, speed]);
});
def("SineBones", function (count, spacing, speed, height) {
  count = int(count); spacing = int(spacing); speed = int(speed); height = int(height);
  for (var i = 0; i < count; i++) {
    var x = 0, dir = 0;
    if (spacing > 0) { x = zoneRight() + spacing * i; dir = 2; }
    if (spacing < 0) { x = zoneLeft() + spacing * i; dir = 0; }
    var sine = Math.floor(Math.sin(i / 3) * 28);
    var y = zoneTop() + 6;
    callFn("BoneV", [x, y, height + sine, dir, speed]);
    y = zoneTop() + 6 + height + sine + 39;
    callFn("BoneV", [x, y, zoneBottom() - 5 - y, dir, speed]);
  }
});
function moveBones() {
  B.bones.forEach(function (b) {
    b.x += Math.round(dcos(b.dir * 90)) * DT * b.speed;
    b.y += Math.round(dsin(b.dir * 90)) * DT * b.speed;
  });
  B.bones = B.bones.filter(function (b) {
    if (b.dir === 0 && b.x > GAME_W) return false;
    if (b.dir === 1 && b.y > GAME_H) return false;
    if (b.dir === 2 && b.x < -b.w) return false;
    if (b.dir === 3 && b.y < -b.h) return false;
    return true;
  });
}

// ---------------------------------------------------------------- Bone stab
def("BoneStab", function (dir, dist, warn, stay) {
  dir = num(dir);
  if (!(dir >= 0 && dir <= 3)) return;
  var w = { dir: int(dir), dist: int(dist), warn: num(warn), stay: num(stay) };
  Audio2.play("Warning");
  var z = B.zone;
  if (w.dir === 0) { w.w = w.dist - 3; w.h = z.h - 16; w.x = zoneRight() - w.w - 8; w.y = zoneTop() + 8; }
  if (w.dir === 1) { w.w = z.w - 16; w.h = w.dist - 3; w.x = zoneLeft() + 8; w.y = zoneBottom() - w.h - 8; }
  if (w.dir === 2) { w.w = w.dist - 3; w.h = z.h - 16; w.x = zoneLeft() + 8; w.y = zoneTop() + 8; }
  if (w.dir === 3) { w.w = z.w - 16; w.h = w.dist - 3; w.x = zoneLeft() + 8; w.y = zoneTop() + 8; }
  B.warns.push(w);
});
function tickBoneStabs() {
  var z = B.zone;
  B.warns = B.warns.filter(function (w) {
    if (w.warn !== 0) return true;
    Audio2.play("BoneStab");
    var s = { dir: w.dir, dist: w.dist, stay: w.stay, reverse: false, damage: 1, karma: 6 };
    if (w.dir === 1 || w.dir === 3) {
      s.kind = "V"; s.x = z.x; s.w = z.w; s.h = w.dist + 8; s.destX = s.x;
      if (w.dir === 1) { s.y = zoneBottom() - 5; s.destY = zoneBottom() - 5 - w.dist; }
      else { s.y = z.y + 5 - s.h; s.destY = z.y + 5 - s.h + w.dist; }
    } else {
      s.kind = "H"; s.y = z.y; s.w = w.dist + 8; s.h = z.h; s.destY = s.y;
      if (w.dir === 0) { s.x = zoneRight() - 5; s.destX = zoneRight() - 5 - w.dist; }
      else { s.x = z.x + 5 - s.w; s.destX = z.x + 5 - s.w + w.dist; }
    }
    B.stabs.unshift(s);
    return false;
  });
  B.warns.forEach(function (w) { if (w.warn > 0) w.warn -= Math.min(DT, w.warn); });
  B.stabs.forEach(function (s) {
    var speed = s.dist * 10;
    var cx = Math.round(dcos(s.dir * 90)), cy = Math.round(dsin(s.dir * 90));
    if (s.reverse) { s.x += cx * DT * speed; s.y += cy * DT * speed; }
    else {
      s.x -= cx * DT * speed; s.y -= cy * DT * speed;
      if (angleDiff(s.dir * 90, angleTo(s.x, s.y, s.destX, s.destY)) <= 0.5) { s.x = s.destX; s.y = s.destY; }
      if (s.x === s.destX && s.y === s.destY) {
        s.stay -= Math.min(DT, s.stay);
        if (s.stay === 0) s.reverse = true;
      }
    }
  });
  B.stabs = B.stabs.filter(function (s) {
    return !(s.x > GAME_W || s.y > GAME_H || s.x + s.w < 0 || s.y + s.h < 0);
  });
}

// ---------------------------------------------------------------- Gaster blasters
def("GasterBlaster", function (size, sx, sy, ex, ey, eang, spin, blast) {
  size = int(size);
  var g = { x: int(sx), y: int(sy), endX: int(ex), endY: int(ey), endAng: int(eang), ang: 90, timer: num(spin),
    state: STATE_ENTER, leaveSpeed: 0, anim: "Default", animT: 0,
    beam: { visible: false, timer: 0, blastTime: num(blast), baseSize: 0, sine: 0, opacity: 100 },
    hitDamage: 0, hitKarma: 0 };
  if (g.x === g.endX && g.y === g.endY) g.ang = g.endAng;
  g.w = 57; g.h = 44;
  if (size === 0) g.w = 57 * 2;
  if (size === 1) { g.w = 57 * 2; g.h = 44 * 2; }
  if (size === 2) { g.w = 57 * 3; g.h = 44 * 3; }
  Audio2.stop("GasterBlaster");
  Audio2.setRate(Audio2.play("GasterBlaster", false, "GasterBlaster"), 1.2);
  B.blasters.push(g);
});
function blasterOutside(g) {
  var r = Math.max(g.w, g.h) / 2;
  return g.x + r < 0 || g.x - r > GAME_W || g.y + r < 0 || g.y - r > GAME_H;
}
function tickBlasters() {
  B.blasters.forEach(function (g) {
    if (g.timer > 0 && (g.state === STATE_WAIT || g.state === STATE_FIRE)) g.timer -= Math.min(DT, g.timer);
    if (g.state === STATE_ENTER) {
      if (Math.abs(g.x - g.endX) >= 3) g.x += (g.endX - g.x) * DT * 10; else g.x = g.endX;
      if (Math.abs(g.y - g.endY) >= 3) g.y += (g.endY - g.y) * DT * 10; else g.y = g.endY;
      if (Math.abs(g.ang - g.endAng) >= 3) g.ang += (g.endAng - g.ang) * DT * 10; else g.ang = g.endAng;
      if (g.x === g.endX && g.y === g.endY && g.ang === g.endAng) g.state = STATE_WAIT;
    }
    if (g.state === STATE_WAIT && g.timer === 0) {
      g.anim = "Fire"; g.animT = 0;
      g.state = STATE_FIRE;
      g.timer = 0.1;
    }
    if (g.state === STATE_FIRE && g.timer === 0) {
      g.state = STATE_LEAVE;
      g.beam.visible = true;
      g.hitVisible = true;
      g.hitDamage = 1; g.hitKarma = 10;
      Audio2.stop("GasterBlast"); Audio2.stop("GasterBlast2");
      Audio2.setRate(Audio2.play("GasterBlast", false, "GasterBlast"), 1.2);
      Audio2.setRate(Audio2.play("GasterBlast2", false, "GasterBlast2"), 1.2);
      if (g.h > 44) callFn("SansShake", [5]);
    }
    if (g.state === STATE_LEAVE) {
      g.leaveSpeed += 30 * DT * 60;
      if (blasterOutside(g)) g.leaveSpeed = 0;
      g.x -= dcos(g.ang) * DT * g.leaveSpeed;
      g.y -= dsin(g.ang) * DT * g.leaveSpeed;
    }
    g.animT += DT;
    var bm = g.beam, scale = g.h / 44;
    if (bm.visible) {
      bm.timer += DT;
      if (bm.timer < 4 / 30) bm.baseSize += Math.floor(35 * scale / 4) * DT * 30;
      if (bm.timer >= 4 / 30 && bm.timer < 4 / 30 + DT) bm.baseSize = 35 * scale;
      if (bm.timer > 5 / 30 + bm.blastTime) {
        bm.baseSize *= Math.pow(0.8, DT * 30);
        bm.opacity = 100 - ((bm.timer - bm.blastTime) * 30 - 5) * 10;
        if (bm.baseSize <= 2) g.dead = true;
      }
      if (bm.opacity <= 80) { g.hitDamage = 0; g.hitVisible = false; }
      bm.sine = Math.sin(bm.timer * 30 / 1.5) * bm.baseSize / 4;
    }
  });
  B.blasters = B.blasters.filter(function (g) { return !g.dead; });
}
function blasterFrame(g) {
  if (g.anim === "Default") return 0;
  var f = Math.floor(g.animT * 30);
  if (f < 5) return f;
  return 3 + ((f - 5) % 2);
}

// ---------------------------------------------------------------- Menu bones
def("MenuBonesOff", function () {
  B.menuBonesLeft.forEach(function (m) { m.destroy = true; });
  B.bottomBones = false;
});
def("MenuBoneLeft", function () { B.menuBonesLeft.push({ x: -10, y: 270, timer: 0, destroy: false, damage: 1, karma: 0 }); });
def("MenuBoneBottom", function () { B.bottomBones = true; B.bottomBoneTimer = 0; B.bottomBoneAlt = 0; });
function tickMenuBones() {
  B.menuBonesLeft.forEach(function (m) {
    m.timer += DT;
    m.x = -30 + Math.abs(Math.sin(600 * m.timer / Math.PI * Math.PI / 180)) * 105;
    if (m.x > 64) m.timer -= DT * 0.72;
  });
  B.menuBonesLeft = B.menuBonesLeft.filter(function (m) { return !(m.destroy && m.x <= -8); });
  if (B.bottomBones) {
    B.bottomBoneTimer += DT;
    if (B.bottomBoneTimer >= 0.6) {
      B.bottomBoneTimer -= 0.6;
      [0 + B.bottomBoneAlt, 2 + B.bottomBoneAlt].forEach(function (btn) {
        var u = B.uiButtons[btn];
        B.menuBonesBottom.push({ x: u.x + 110, y: GAME_H, state: 0, button: btn, damage: 1, karma: 0 });
      });
      B.bottomBoneAlt = B.bottomBoneAlt === 0 ? 1 : 0;
    }
  }
  B.menuBonesBottom.forEach(function (m) {
    if (m.state === 0) { m.y -= 300 * DT; if (m.y <= 440) { m.y = 440; m.state = 1; } }
    else if (m.state === 1) {
      m.x -= 150 * DT;
      var u = B.uiButtons[m.button];
      if (m.x <= u.x - 14) { m.x = u.x - 14; m.state = 2; }
    } else if (m.state === 2) m.y += 300 * DT;
  });
  B.menuBonesBottom = B.menuBonesBottom.filter(function (m) { return m.y <= GAME_H; });
}

// ---------------------------------------------------------------- Sans
def("SansAnimation", function (name) {
  var s = B.sans;
  s.body.visible = false;
  s.anim = name || "";
});
def("SansBody", function (name) {
  var s = B.sans;
  s.anim = "";
  s.body.visible = true;
  s.body.anim = name; s.body.frame = 0; s.body.t = 0;
});
def("SansTorso", function (name) { B.sans.body.visible = false; B.sans.torso.anim = name; });
def("SansHead", function (name) { B.sans.head.anim = name; B.sans.head.frame = 0; });
def("SansSweat", function (n) {
  n = int(n);
  if (n === 0) B.sans.sweat.visible = false;
  if (n > 0) { B.sans.sweat.visible = true; B.sans.sweat.anim = "Sweat" + n; }
});
def("SansX", function (x) { B.sans.x = int(x); });
def("SansRepeat", function () { B.sans.xspeed = -900; });
def("SansEndRepeat", function () { B.sans.xspeed = 0; });
def("SansShake", function (n) { B.shake.intensity = int(n); B.shake.timer = 0; });
def("SansText", function (text, endFunc) {
  var s = B.sans;
  if (B.bubble) B.bubble.font.dead = true;
  var bx = s.x + 64, by = s.y - 128;
  var f = makeText({ font: "SansFont", layer: "enemies", x: bx + 32, y: by + 16, width: 256, scale: 1, fullText: String(text),
    tint: [0, 0, 0], voice: "SansSpeak", interactive: true, endFunc: endFunc ? endFunc : "EndSansText" });
  B.bubble = { x: bx, y: by, font: f };
  callFn("TLPause");
});
def("EndSansText", function () { B.bubble = null; callFn("TLResume"); });

function tickSans() {
  var s = B.sans;
  if (s.xspeed !== 0) {
    s.y = zoneTop() - 16;
    s.x += s.xspeed * DT;
    s.xspeed -= 45 * DT;
    if (s.x <= -100) {
      s.x = 740;
      s.head.anim = choose("Default", "LookLeft", "Wink", "ClosedEyes", "NoEyes");
      s.torso.anim = choose("Default", "Default", "Default", "Shrug");
    }
  } else {
    s.y = B.zone.tt - 16;
  }
  if (s.dodgeState !== 0) s.dodgeTimer += DT;
  if (s.dodgeState === 1) {
    s.x = 320 - dsin(s.dodgeTimer * 225) * 100;
    if (s.dodgeTimer >= 0.4) {
      s.x = 220; s.dodgeState = 2; s.dodgeTimer = 0;
      after(0.6, function () { damageText("MISS", 272, 50, 1.5, "enemies", TINT_GREY); });
    }
  }
  if (s.dodgeState === 2 && s.dodgeTimer >= 1.1) { s.dodgeState = 3; s.dodgeTimer = 0; }
  if (s.dodgeState === 3) {
    s.x = 320 - dcos(s.dodgeTimer * 225) * 100;
    if (s.dodgeTimer >= 0.4) {
      s.x = 320; s.dodgeState = 0; s.dodgeTimer = 0;
      s.hitAttempts++;
      B.targetChoice = null;
      if (B.target) B.target.state = 2;
      callFn("StartAttack");
    }
  }
  var T = s.torso, H = s.head;
  if (s.anim !== "") { T.t += DT; H.t += DT; }
  if (s.anim === "Idle") {
    if (T.t > 1.2) T.t -= 1.2;
    if (H.t > 1.2) H.t -= 1.2;
    T.ox = dsin(360 * T.t / 1.2); T.oy = dsin(720 * T.t / 1.2);
    H.oy = -dsin(720 * H.t / 1.2) * 0.4;
  }
  if (s.anim === "HeadBob") {
    if (H.t > 1.1) H.t -= 1.1;
    H.ox = dsin(360 * H.t / 1.1); H.oy = dsin(720 * H.t / 1.1);
  }
  if (s.anim === "Tired") {
    if (T.t > 3.8) T.t -= 3.8;
    if (H.t > 3.8) H.t -= 3.8;
    T.oy = dsin(360 * T.t / 3.8); H.oy = dsin(360 * H.t / 3.8);
  }
  if (s.anim === "") { T.t = 0; T.ox = 0; T.oy = 0; H.t = 0; H.ox = 0; H.oy = 0; }
  if (H.anim === "BlueEye") H.frame = Math.floor(rand(2));
  if (s.body.visible) {
    s.body.t += DT;
    s.body.frame = Math.min(ANIM["SansBody/" + s.body.anim].length - 1, Math.floor(s.body.t * 15));
  }
}
var SANS_BODY = { // hotspot x, head image points per frame [x,y]
  HandDown: { hx: 0.46875, head: [[0.46875, 0.4], [0.46875, 0.385714], [0.46875, 0.428571], [0.46875, 0.442857]] },
  HandUp: { hx: 0.46875, head: [[0.46875, 0.428571], [0.46875, 0.442857], [0.46875, 0.4], [0.46875, 0.385714], [0.46875, 0.4]] },
  HandRight: { hx: 0.34375, head: [[0.34375, 0.125], [0.322917, 0.125], [0.3125, 0.125], [0.375, 0.125], [0.354167, 0.125]] },
  HandLeft: { hx: 0.34375, head: [[0.354167, 0.125], [0.375, 0.125], [0.3125, 0.125], [0.322917, 0.125], [0.34375, 0.125]] }
};
function drawSans(g) {
  var s = B.sans, headX, headY;
  if (s.body.visible) {
    var info = SANS_BODY[s.body.anim];
    var img = ANIM["SansBody/" + s.body.anim][s.body.frame];
    var w = img.width * 2, h = img.height * 2;
    drawSprite(g, img, s.x, s.y, w, h, info.hx, 1);
    var ip = info.head[s.body.frame] || info.head[0];
    headX = s.x + (ip[0] - info.hx) * w;
    headY = s.y + (ip[1] - 1) * h;
  } else {
    var legs = ANIM["SansLegs/Standing"][0];
    drawSprite(g, legs, s.x, s.y, 88, 46, 0.477273, 1);
    var tx = s.x + s.torso.ox, ty = s.y - 46 + s.torso.oy;
    var timg = ANIM["SansTorso/" + s.torso.anim][0];
    var tw = timg.width * 2, th = timg.height * 2;
    drawSprite(g, timg, tx, ty, tw, th, 0.5, 1);
    var hp = s.torso.anim === "Shrug" ? 0.208333 : 0.24;
    headX = tx + s.head.ox;
    headY = ty + (hp - 1) * th + s.head.oy;
  }
  var himg = ANIM["SansHead/" + s.head.anim][s.head.frame] || ANIM["SansHead/" + s.head.anim][0];
  drawSprite(g, himg, headX, headY, 64, 60, 0.5, 1);
  if (s.sweat.visible) drawSprite(g, ANIM["SansSweat/" + s.sweat.anim][0], headX, headY - 60, 64, 18, 0.5, 0);
}

// ---------------------------------------------------------------- Damage and KARMA
def("DamagePlayer", function (dmg, kr) {
  B.lastDamageTime = Game.time;
  Glob.HP -= num(dmg);
  Glob.KR += num(kr);
  Audio2.play("PlayerDamaged");
});
// Point tests for the heart hitbox. hb = half size; 0 means the original single centre point.
function hitPoints() {
  var h = B.heart, hb = Settings.hitbox;
  if (!hb) return [[h.x, h.y]];
  var pts = [];
  for (var i = -1; i <= 1; i++) for (var j = -1; j <= 1; j++) pts.push([h.x + i * hb, h.y + j * hb]);
  return pts;
}
function heartTouchesRect(x, y, w, h) {
  var hb = Settings.hitbox, H = B.heart;
  if (!hb) return H.x >= x && H.x <= x + w && H.y >= y && H.y <= y + h;
  return rectsOverlap(H.x - hb, H.y - hb, hb * 2, hb * 2, x, y, w, h);
}
function heartTouchesRotRect(cx, cy, ang, len, thick) {
  // rectangle starting at (cx,cy) going along ang for len, thickness thick centred on the axis
  var c = dcos(ang), s = dsin(ang);
  return hitPoints().some(function (p) {
    var dx = p[0] - cx, dy = p[1] - cy;
    var along = dx * c + dy * s, across = -dx * s + dy * c;
    return along >= 0 && along <= len && Math.abs(across) <= thick / 2;
  });
}
function checkDamage() {
  var h = B.heart;
  if (!(B.lastDamageTime < Game.time - 0.033) || !h.visible || B.dead) return;
  var moving = h.move && (h.vx !== 0 || h.vy !== 0);
  var hit = null;
  function test9(o) {
    if (hit || o.damage <= 0) return;
    if (!heartTouchesRect(o.x, o.y, o.w, o.h)) return;
    var col = o.color || 0;
    if (col === 0 || (col === 1 && moving) || (col === 2 && !moving)) hit = o;
  }
  B.menuBonesLeft.forEach(function (m) {
    if (!hit && heartTouchesRect(m.x + 2, m.y + 2, 10, 40)) hit = m;
  });
  B.menuBonesBottom.forEach(function (m) {
    if (!hit && heartTouchesRect(m.x + 2, m.y + 2, 10, 40)) hit = m;
  });
  if (hit) {
    callFn("DamagePlayer", [hit.damage, hit.karma]);
    if (Glob.HP <= 0) Glob.HP = 1; // menu bones can never kill
    return;
  }
  B.blasters.forEach(function (g) {
    if (hit || g.hitDamage <= 0) return;
    var sc = g.h / 44 / 2;
    var cx = g.x + dcos(g.ang) * 70 * sc, cy = g.y + dsin(g.ang) * 70 * sc;
    if (heartTouchesRotRect(cx, cy, g.ang, 1000, g.beam.baseSize * 3 / 4)) hit = { damage: g.hitDamage, karma: g.hitKarma, src: g };
  });
  B.bones.forEach(test9);
  B.stabs.forEach(test9);
  if (hit) {
    callFn("DamagePlayer", [hit.damage, hit.karma]);
    var src = hit.src || hit;
    if (src.karma !== undefined && src.karma >= 3) src.karma = 2;
    if (src.hitKarma !== undefined && src.hitKarma >= 3) src.hitKarma = 2;
  }
}
function tickKarma() {
  if (Glob.KR > 40) Glob.KR = 40;
  if (Glob.KR >= Glob.HP) Glob.KR = Glob.HP - 1;
  if (Glob.KR > 0 && Glob.HP > 1) {
    Glob.KR_T += DT;
    var drain = false;
    if (Glob.KR >= 40 && Glob.KR_T >= 0.033) drain = true;
    else if (Glob.KR >= 30 && Glob.KR_T >= 0.066) drain = true;
    else if (Glob.KR >= 20 && Glob.KR_T >= 0.166) drain = true;
    else if (Glob.KR >= 10 && Glob.KR_T >= 0.5) drain = true;
    else if (Glob.KR_T >= 1) drain = true;
    if (drain) { Glob.KR -= 1; Glob.HP -= 1; Glob.KR_T = 0; }
  }
  if (Glob.HP > Glob.MaxHP) Glob.HP = Glob.MaxHP;
  if (Glob.KR < 0) Glob.KR = 0;
  if (Glob.HP <= 0 && !B.dead) die();
}
function die() {
  var h = B.heart;
  B.dead = true;
  h.mode = -1; h.move = false; h.angle = 90; h.overlay = true; h.visible = true;
  callFn("TLStop");
  callFn("BlackScreen", [1]);
  Audio2.stopAll();
  B.bones = []; B.stabs = []; B.warns = []; B.platforms = []; B.blasters = []; B.menuBonesLeft = []; B.menuBonesBottom = [];
  B.bottomBones = false;
  after(20 / 30, function () {
    h.anim = "Split";
    Audio2.play("HeartSplit");
    after(40 / 30, function () {
      h.visible = false;
      Audio2.play("HeartShatter");
      for (var i = 0; i < 6; i++) {
        var a = rand(360);
        B.shards.push({ x: h.x, y: h.y, vx: dcos(a) * 180, vy: dsin(a) * 180, t: 0 });
      }
      after(2, function () { gotoScene("menu"); });
    });
  });
}

// ---------------------------------------------------------------- Practice mode
function practiceOnEndAttack() {
  if (Glob.SimulatorMode !== MODE_PRACTICE) return;
  var s = B.sans;
  if (!B.failed) {
    B.practiceAttack++;
    damageText("SUCCESS", 16, 16, 1, "background", [0, 255, 0]);
    if (s.hitAttempts < 13 && B.practiceAttack === 14) { s.hitAttempts = 14; B.practiceAttack = 0; }
    if (s.hitAttempts > 13 && B.practiceAttack > 9) B.practiceAttack = 9;
  } else {
    damageText("FAILURE", 16, 16, 1, "background", [255, 0, 0]);
  }
  if (s.hitAttempts > 13 && B.practiceAttack === 9) s.hitAttempts = 23;
}
function tickPractice() {
  if (Glob.SimulatorMode !== MODE_PRACTICE) return;
  if (!B.heart.slamDamage && B.tl.running) {
    var target = Glob.PracticeTarget;
    if (B.sans.hitAttempts > 22) target = 2;
    if (Glob.HP - Glob.KR < target) {
      if (B.sans.hitAttempts > 22) B.sans.hitAttempts = 22;
      B.failed = true;
      callFn("TLStop");
      callFn("EndAttack");
    }
  }
}

// ---------------------------------------------------------------- Timeline (Timeline.xml)
def("TLPlay", function (text) {
  var tl = B.tl;
  tl.lines = String(text).replace(/\r/g, "").split("\n");
  if (tl.lines.length && tl.lines[tl.lines.length - 1] === "") tl.lines.pop();
  tl.labels = {}; tl.vars = { pi: Math.PI };
  tl.lines.forEach(function (ln, i) {
    var tok = ln.split(",")[1] || "";
    if (tok[0] === ":") tl.labels[tok.slice(1)] = i + 1;
  });
  tl.t = 0; tl.line = 1;
  tlLoadLine();
  tl.running = true;
});
function tlLoadLine() {
  var tl = B.tl;
  var text = tl.lines[tl.line - 1];
  if (text === undefined) { tl.cur = []; return; }
  tl.cur = text.split(",").map(function (tok) {
    if (tok[0] === "$") { var v = tl.vars[tok.slice(1)]; return v === undefined ? 0 : v; }
    return tok;
  });
}
def("TLPause", function () { B.tl.running = false; });
def("TLResume", function () { B.tl.running = true; });
def("TLIsRunning", function () { return B.tl.running; });
def("TLStop", function () { var tl = B.tl; tl.lines = []; tl.cur = []; tl.running = false; });
function tickTimeline() {
  var tl = B.tl, runCount = 0;
  while (tl.running && tl.line > 0 && tl.line <= tl.lines.length && tl.t >= num(tl.cur[0])) {
    var fn = String(tl.cur[1] === undefined ? "" : tl.cur[1]);
    if (fn[0] !== ":") callFn(fn, tl.cur.slice(2).map(function (v) { return v === undefined ? "" : v; }));
    tl.t -= num(tl.cur[0]);
    tl.line += 1;
    tlLoadLine();
    runCount++;
    if (runCount >= 1000) {
      tl.running = false;
      callFn("BattlePanic", ["Infinite loop detected line " + tl.line]);
    }
  }
  if (tl.running) tl.t += DT;
}
function setVar(n, v) { B.tl.vars[n] = v; }
def("SET", function (n, v) { setVar(n, v); });
def("ADD", function (n, a, b) { setVar(n, num(a) + num(b)); });
def("SUB", function (n, a, b) { setVar(n, num(a) - num(b)); });
def("MUL", function (n, a, b) { setVar(n, num(a) * num(b)); });
def("DIV", function (n, a, b) { setVar(n, num(a) / num(b)); });
def("MOD", function (n, a, b) { setVar(n, num(a) % num(b)); });
def("FLOOR", function (n, a) { setVar(n, Math.floor(num(a))); });
def("DEG", function (n, a) { setVar(n, num(a) * 180 / Math.PI); });
def("RAD", function (n, a) { setVar(n, num(a) * Math.PI / 180); });
def("SIN", function (n, a) { setVar(n, dsin(num(a))); });
def("COS", function (n, a) { setVar(n, dcos(num(a))); });
def("ANGLE", function (n, x1, y1, x2, y2) { setVar(n, angleTo(num(x1), num(y1), num(x2), num(y2))); });
def("RND", function (n, a) { setVar(n, Math.floor(rand(int(a)))); });
def("JMPABS", function (target) {
  var tl = B.tl;
  target = String(target);
  if (/^[0-9]+$/.test(target)) tl.line = int(target) - 1;
  else if (tl.labels[target] !== undefined) tl.line = tl.labels[target] - 1;
  else {
    tl.running = false;
    callFn("BattlePanic", ["Label " + target + " does not exist line " + tl.line]);
  }
});
def("JMPREL", function (n) { B.tl.line += int(n) - 1; });
def("JMPZ", function (l, v) { if (num(v) === 0) callFn("JMPABS", [l]); });
def("JMPNZ", function (l, v) { if (num(v) !== 0) callFn("JMPABS", [l]); });
def("JMPE", function (l, a, b) { if (num(a) === num(b)) callFn("JMPABS", [l]); });
def("JMPNE", function (l, a, b) { if (num(a) !== num(b)) callFn("JMPABS", [l]); });
def("JMPL", function (l, a, b) { if (num(a) < num(b)) callFn("JMPABS", [l]); });
def("JMPNL", function (l, a, b) { if (num(a) >= num(b)) callFn("JMPABS", [l]); });
def("JMPG", function (l, a, b) { if (num(a) > num(b)) callFn("JMPABS", [l]); });
def("JMPNG", function (l, a, b) { if (num(a) <= num(b)) callFn("JMPABS", [l]); });
def("GetHeartPos", function (xn, yn) { setVar(xn, B.heart.x); setVar(yn, B.heart.y); });

// ---------------------------------------------------------------- Battle tick
function tickBattle() {
  // behaviours run before events in Construct
  movePlatforms();
  moveHeart();
  B.shards.forEach(function (s) { s.vy += 300 * DT; s.x += s.vx * DT; s.y += s.vy * DT; s.t += DT; });

  tickTimeline();
  updateTexts();
  if (Glob.SimulatorMode === MODE_SINGLE && VPad.pressed("cancel")) {
    callFn("TLStop");
    Audio2.stopAll();
    gotoScene("menu");
    return;
  }
  tickBattleMenu();
  reversePlatforms();
  controlHeart();
  moveBones();
  tickBoneStabs();
  tickBlasters();
  tickMenuBones();
  combatZoneTick();
  tickSans();
  checkDamage();
  tickKarma();
  if (B.hpText) {
    B.hpText.text = zeropad(Math.max(0, Glob.HP), 2) + " / " + Glob.MaxHP;
    B.hpText.tint = Glob.KR > 0 ? [255, 0, 255] : null;
  }
  var sh = B.shake;
  if (sh.intensity > 0) {
    sh.timer += DT;
    if (sh.timer >= 1 / 30) {
      sh.timer -= 1 / 30;
      sh.intensity -= 1;
      sh.ox = sh.intensity * choose(1, -1);
      sh.oy = sh.intensity * choose(1, -1);
    }
  } else { sh.ox = 0; sh.oy = 0; }
  tickPractice();
}

// ---------------------------------------------------------------- Battle drawing
function boneTint(c) { return c === 1 ? TINT_BONE_BLUE : (c === 2 ? TINT_BONE_ORANGE : null); }
function drawHeart(g) {
  var h = B.heart;
  if (!h.visible) return;
  var img = ANIM["PlayerHeart/" + h.anim][0];
  // the heart is always red in the menus, like in Undertale
  var tint = h.mode === HEARTMODE_BLUE && h.move ? TINT_BLUE : TINT_RED;
  drawSprite(g, img, h.x, h.y, img.width, img.height, 0.5, 0.5, h.anim === "Split" ? 90 : h.angle, 1, tint);
}
function drawBattle(g) {
  var z = B.zone;
  g.fillStyle = "#000"; g.fillRect(0, 0, GAME_W, GAME_H);
  g.save();
  g.translate(B.shake.ox, B.shake.oy);
  // Background layer
  var bgW = Math.floor(Glob.MaxHP * 1.2);
  g.drawImage(IMG.HPBackground, 0, 0, 1, 1, 256, 400, bgW, 21);
  g.drawImage(IMG.HPBar, 0, 0, 1, 1, 256, 400, bgW * Math.max(0, Glob.HP) / Glob.MaxHP, 21);
  if (Glob.KR > 0) g.drawImage(IMG.KRBar, 0, 0, 1, 1, 256 + bgW * (Glob.HP - Glob.KR) / Glob.MaxHP, 400, Math.ceil(bgW * Glob.KR / Glob.MaxHP), 21);
  drawSprite(g, ANIM["HP/Default"][0], 224, 416, 23, 10, 0, 1);
  drawSprite(g, ANIM["KR/Default"][0], 400, 416, 23, 10, 1, 1);
  drawTexts(g, "background");
  // Enemies layer
  drawSans(g);
  if (B.strike) {
    var STRIKE_HOT = [[-1, 5.66667], [-0.5, 1.36364], [0, 0.428571], [0, 0.15625], [0, -0.75], [-0.142857, -4]];
    var si = ANIM["Strike/Default"][B.strike.frame];
    var hs = STRIKE_HOT[B.strike.frame];
    if (si) drawSprite(g, si, B.strike.x, B.strike.y, si.width * 1.5, si.height * 1.5, hs[0], hs[1]);
  }
  if (B.bubble) drawSprite(g, ANIM["SpeechBubble/Default"][0], B.bubble.x, B.bubble.y, 237, 104, 0, 0);
  drawTexts(g, "enemies");
  // Buttons layer
  B.uiButtons.forEach(function (u) { drawSprite(g, ANIM[u.name + "/" + u.anim][0], u.x, u.y, 110, 42, 0, 0); });
  // CombatZone layer
  g.save();
  g.beginPath(); g.rect(z.x, z.y, z.w, z.h); g.clip();
  B.platforms.forEach(function (p) {
    drawNinePatch(g, IMG.Platform1, p.x, p.y, p.w, 7, [4, 4, 2, 2], false, true);
    drawNinePatch(g, IMG.Platform2, p.x, p.y - 4, p.w, 7, [4, 4, 2, 2], false, true);
  });
  g.restore();
  if (!B.heart.overlay) drawHeart(g);
  B.blasters.forEach(function (bl) {
    var sc = bl.h / 44 / 2, bm = bl.beam;
    if (bm.visible) {
      g.save();
      g.globalAlpha = Math.max(0, Math.min(1, bm.opacity / 100));
      g.fillStyle = "#fff";
      [[50, 20 * sc, bm.baseSize / 2 + bm.sine], [60, 10 * sc, bm.baseSize / 1.25 + bm.sine], [70, 1000, bm.baseSize + bm.sine]].forEach(function (b) {
        g.save();
        g.translate(bl.x + dcos(bl.ang) * b[0] * sc, bl.y + dsin(bl.ang) * b[0] * sc);
        g.rotate(bl.ang * Math.PI / 180);
        g.fillRect(0, -b[2] / 2, b[1], b[2]);
        g.restore();
      });
      g.restore();
    }
    var img = ANIM["GasterBlaster/" + bl.anim][blasterFrame(bl)];
    drawSprite(g, img, bl.x, bl.y, bl.w, bl.h, bl.anim === "Default" ? 0.491228 : 0.508772, 0.5, bl.ang);
  });
  B.warns.forEach(function (w) { drawNinePatch(g, IMG.BoneStabWarn, w.x, w.y, w.w, w.h, [4, 4, 4, 4], false, false); });
  if (B.target) {
    drawSprite(g, ANIM["Target/Default"][0], 320, 320, Math.max(0, B.target.w), 117, 0.5, 0.504274, 0, B.target.opacity / 100);
  }
  if (B.targetChoice) {
    var tc = B.targetChoice;
    var fr = tc.playing ? (Math.floor(tc.t * 30) % 5 < 3 ? 0 : 1) : 0;
    drawSprite(g, ANIM["TargetChoice/Default"][fr], tc.x, 320, 14, 128, 0.5, 0.5);
  }
  B.menuBonesLeft.forEach(function (m) { drawSprite(g, ANIM["MenuBoneLeft/Default"][0], m.x, m.y, 14, 44, 0, 0); });
  B.menuBonesBottom.forEach(function (m) { drawSprite(g, ANIM["MenuBoneBottom/Default"][0], m.x, m.y, 14, 44, 0, 0); });
  drawTexts(g, "zone");
  // CombatZoneClipped layer: everything here is only visible inside the box
  g.save();
  g.beginPath(); g.rect(z.x, z.y, z.w, z.h); g.clip();
  B.bones.forEach(function (b) {
    if (b.kind === "V") drawNinePatch(g, IMG.BoneV, b.x, b.y, 10, b.h, [0, 0, 6, 6], true, true, boneTint(b.color));
    else drawNinePatch(g, IMG.BoneH, b.x, b.y, b.w, 10, [6, 6, 0, 0], true, true, boneTint(b.color));
  });
  B.stabs.forEach(function (s) {
    if (s.kind === "V") drawNinePatch(g, IMG.BoneStabV, s.x, s.y, s.w, s.h, [0, 0, 6, 6], true, true);
    else drawNinePatch(g, IMG.BoneStabH, s.x, s.y, s.w, s.h, [6, 6, 0, 0], true, true);
  });
  g.restore();
  // Overlay layer
  if (B.overlayOpaque) { g.fillStyle = "#000"; g.fillRect(-20, -20, GAME_W + 40, GAME_H + 40); }
  if (z.visible) drawNinePatch(g, IMG.CombatZone, z.x, z.y, z.w, z.h, [5, 5, 5, 5], false, false);
  if (B.heart.overlay) drawHeart(g);
  B.shards.forEach(function (s) {
    drawSprite(g, ANIM["HeartShard/Default"][Math.floor(s.t * 15) % 4], s.x, s.y, 16, 16, 0.5, 0.5);
  });
  drawTexts(g, "overlay");
  g.restore();
}

// ================================================================= main loop
function changeScene(name) {
  Game.waits = [];
  Game.scene = name;
  if (name === "menu") startMainMenu();
  else startBattle();
}
function tick() {
  VPad.update();
  if (Game.scene === "menu") tickMainMenu();
  else tickBattle();
  Game.time += DT;
  var due = Game.waits.filter(function (w) { return w.t <= Game.time; });
  Game.waits = Game.waits.filter(function (w) { return w.t > Game.time; });
  due.forEach(function (w) { w.fn(); });
  if (Game.nextScene) {
    var n = Game.nextScene;
    Game.nextScene = null;
    changeScene(n);
  }
}
function draw(g) {
  g.imageSmoothingEnabled = false;
  if (Game.scene === "menu") drawMainMenu(g);
  else drawBattle(g);
}
