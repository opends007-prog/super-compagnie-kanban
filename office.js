/* ═══════════════════════════════════════════════════════════════
   OFFICE SIMULATOR — AI Company Virtual Office
   Pixel-art management game inspired by Pixel Agents HQ
   ═══════════════════════════════════════════════════════════════

   Architecture:
   - Tile-based map system (VOID/WALL/FLOOR/CARPET)
   - Sprite-based character rendering (pixel characters)
   - BFS pathfinding for natural agent movement
   - Z-sorted rendering for proper depth
   - Furniture catalog with pixel art sprites
   - Seat assignment system

   ═══════════════════════════════════════════════════════════════ */

var Office = (function() {
  'use strict';

  // ═══ CONSTANTS ═══
  var TILE_SIZE = 20;
  var MAP_COLS = 72;
  var MAP_ROWS = 50;
  var MAP_W = MAP_COLS * TILE_SIZE;
  var MAP_H = MAP_ROWS * TILE_SIZE;

  var WALK_SPEED = 60;
  var TYPE_FRAME_DURATION = 0.4;
  var IDLE_PAUSE_MIN = 2;
  var IDLE_PAUSE_MAX = 6;
  var WANDER_LIMIT_MIN = 3;
  var WANDER_LIMIT_MAX = 8;

  var TILE = { VOID: 255, WALL: 0, FLOOR: 1, CARPET: 2 };
  var STATE = { IDLE: 'idle', WALK: 'walk', TYPE: 'type' };
  var DIR = { DOWN: 0, LEFT: 1, RIGHT: 2, UP: 3 };

  var STATUS_COLORS = {
    working: '#22c55e', idle: '#eab308', waiting: '#f59e0b',
    meeting: '#3b82f6', reviewing: '#a855f7', blocked: '#ef4444'
  };

  var TEAM_COLORS = {
    'Leadership': '#3b82f6', 'Project': '#22c55e', 'Research': '#a855f7',
    'Finance': '#f59e0b', 'Security': '#ef4444', 'Operations': '#06b6d4'
  };

  // ═══ STATE ═══
  var canvas, ctx, animId = null, officeData = null, agents = [], frameCount = 0, lastTime = 0;

  // ═══ METROCITY SPRITES (assets/metro/*.png) ═══
  var SPR = {}, sprReady = false;
  var CFW = 16, CFH = 32;                 // character frame size
  var WALK_FRAMES = [0, 1, 2, 1], TYPE_FRAMES = [3, 4];
  var DIR_ROW = { 0: 0, 3: 1, 2: 2, 1: 2 }; // DIR.DOWN=0 -> row0, UP=3 -> row1, RIGHT=2 -> row2, LEFT=1 -> row2(flipped)
  var FURN_FILE = {
    desk: 'DESK_FRONT', table: 'TABLE', stable: 'STABLE', sofa: 'SOFA', plant: 'PLANT',
    lplant: 'LPLANT', plant2: 'PLANT2', whiteboard: 'WHITEBOARD', screen: 'WHITEBOARD',
    pcOn: 'PC_ON', pcOff: 'PC_OFF', bookshelf: 'BOOKSHELF', dshelf: 'DSHELF',
    coffeeTable: 'COFFEE_TABLE', cbench: 'CBENCH', bed: 'CBENCH', coffeeM: 'COFFEE',
    cactus: 'CACTUS', clock: 'CLOCK', lpaint: 'LPAINT', spaint: 'SPAINT', hplant: 'HPLANT',
    wchair: 'WCHAIR', cchair: 'CCHAIR', arcade: 'BOOKSHELF'
  };
  function preloadSprites(done) {
    var srcs = { char0: 'char_0', char1: 'char_1', char2: 'char_2', char3: 'char_3', char4: 'char_4', char5: 'char_5' };
    for (var k in FURN_FILE) srcs[k] = FURN_FILE[k];
    var keys = Object.keys(srcs), n = keys.length, count = 0;
    if (n === 0) { sprReady = true; if (done) done(); return; }
    keys.forEach(function(k) {
      var img = new Image();
      img.onload = img.onerror = function() { if (++count === n) { sprReady = true; if (done) done(); } };
      img.src = 'assets/metro/' + srcs[k] + '.png';
      SPR[k] = img;
    });
  }
  function agentPalette(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0; return Math.abs(h) % 6; }

  // ═══ CEO NPC (not a real agent — the boss, cycling lines) ═══
  var CEO_LINES = ['We need to make money.', 'Lucy, come see me.', "What's the budget?", 'Great — we are making money!', 'Ship it. Now.', 'Numbers up. I love it.'];
  var ceoAgent = null;
  function makeCEO() {
    var col = 10, row = 8;
    return {
      id: '__ceo__', name: 'CEO', title: '(You)', team: 'Leadership',
      emoji: '', personality: 'manager', color: '#3b82f6', skin: '#e8b98c',
      officeState: 'working', currentTicket: null, isBlocked: false, tickets: [], seatId: null,
      x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2,
      tileCol: col, tileRow: row, path: [], moveProgress: 0, dir: DIR.DOWN,
      frame: 0, frameTimer: 0, state: STATE.TYPE,
      wanderTimer: 1e9, wanderCount: 0, wanderLimit: 1e9,
      speechBubble: null, speechEnd: 0, nextSpeechTime: Date.now() + 1500,
      celebrationTimer: 0, walking: false, idleArea: 'ceo', ceo: true, vip: true, palOverride: 0
    };
  }

  // ═══ Custom Lucy sprite (Asian woman, long auburn hair, black blazer + white top) ═══
  function drawLucySprite(px, py, bob) {
    var topY = py + 9 + bob - 44;
    function p(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(px - 11 + x, topY + y, w, h); }
    var SK = '#f2d2b0', SKd = '#e0b894', HA = '#6e3a26', HAh = '#9a5034', BL = '#1b1b22', WH = '#f1f1f4', LIP = '#c45a6e';
    p(3, 8, 16, 4, HA); p(2, 10, 3, 30, HA); p(17, 10, 3, 30, HA); p(3, 12, 2, 12, HAh);     // long hair
    p(4, 24, 14, 18, BL); p(8, 24, 6, 18, WH); p(4, 24, 3, 18, '#111118'); p(15, 24, 3, 18, '#26262e'); // blazer + blouse
    p(1, 26, 3, 10, BL); p(18, 26, 3, 10, BL); p(1, 34, 3, 3, SK); p(18, 34, 3, 3, SK);       // arms
    p(6, 11, 10, 11, SK); p(6, 11, 3, 11, SKd);                                                // head
    p(4, 8, 14, 5, HA); p(6, 8, 10, 2, HAh);                                                   // hair top
    p(8, 15, 2, 2, '#2a1c12'); p(13, 15, 2, 2, '#2a1c12'); p(10, 19, 3, 1, LIP);               // eyes + lips
    p(6, 17, 1, 1, 'rgba(220,120,120,.4)'); p(15, 17, 1, 1, 'rgba(220,120,120,.4)');           // cheeks
  }

  // ═══ Mission Control access (only these may enter; they STAND, spread out) ═══
  var MC_ALLOWED = ['lucy', 'zeus', 'iris', 'plutus', 'fortuna', 'juno'];
  var MC_STANDS = [{ x: 50, y: 14 }, { x: 53, y: 14 }, { x: 56, y: 14 }, { x: 59, y: 14 }, { x: 62, y: 14 }, { x: 65, y: 14 }];
  function mcAllowed(agent) { return MC_ALLOWED.indexOf((agent.name || '').toLowerCase()) >= 0; }
  function mcStandFor(agent) { var i = MC_ALLOWED.indexOf((agent.name || '').toLowerCase()); return MC_STANDS[i >= 0 ? i : 0]; }
  function inMissionControl(agent) { return agent.tileRow >= 12 && agent.tileRow <= 16 && agent.tileCol >= 49 && agent.tileCol <= 68; }

  var CONFERENCE_CHATTER = ['Great point.', 'Interesting…', 'I agree.', 'Good progress!', "Let's ship it.", 'Makes sense.', 'Noted.', 'Solid plan.', 'Nice numbers.', 'Agreed.'];
  var LUCY_CHECK = ["How's it going?", 'On track?', 'Need anything?', 'Doing good?', 'Great work!', 'Any blockers?', 'Keep it up!'];
  // Rooms an agent may pop into for a ~1-min break even while working
  var BREAK_ROOMS = [
    { x: 4, y: 37, w: 15, h: 7 },   // cafeteria
    { x: 23, y: 37, w: 12, h: 7 },  // lounge
    { x: 63, y: 37, w: 5, h: 7 },   // smoking
    { x: 39, y: 38, w: 7, h: 6 },   // rest
    { x: 50, y: 37, w: 9, h: 7 }    // recreation
  ];
  function randomBreakRoom() { var a = BREAK_ROOMS[(Math.random() * BREAK_ROOMS.length) | 0]; return getRandomTileInArea(a.x, a.y, a.w, a.h) || { x: a.x + 1, y: a.y + 1 }; }
  // Pick a break destination: half the time head to the cafeteria table (with a snack/coffee in hand), else another break room.
  function planBreakDest(agent) {
    agent.breakProp = null; agent.breakStage = null; agent.foodTimer = 0; agent.eatSeat = null; agent.breakSmoke = false;
    var roll = Math.random();
    if (roll < 0.42) {
      // CAFETERIA: choose the fridge / vending / coffee machine, grab the item, then sit (coffee may go outside).
      var keys = Object.keys(seats).filter(function(k) { return k.indexOf('cafe_') === 0; });
      var seat = keys.length ? seats[keys[(Math.random() * keys.length) | 0]] : { x: 10, y: 39, facing: DIR.UP };
      var c = Math.random();
      if (c < 0.4) { agent.breakStage = 'getFood'; agent.eatSeat = seat; agent.idleArea = 'cafeteria'; return { x: 4, y: 37 }; }   // fridge
      if (c < 0.7) { agent.breakStage = 'getDrink'; agent.eatSeat = seat; agent.idleArea = 'cafeteria'; return { x: 8, y: 37 }; }  // vending
      agent.breakStage = 'getCoffee'; agent.breakSmoke = Math.random() < 0.45;                                                    // coffee
      agent.eatSeat = agent.breakSmoke ? { x: 64, y: 41, facing: DIR.DOWN } : seat;
      agent.idleArea = agent.breakSmoke ? 'smoking' : 'cafeteria';
      return { x: 6, y: 37 };
    }
    if (roll < 0.6) {
      // REST: go to a bed and nap.
      var bkeys = Object.keys(seats).filter(function(k) { return k.indexOf('bed_') === 0; });
      if (bkeys.length) { agent.breakStage = 'toBed'; agent.idleArea = 'rest'; agent.eatSeat = seats[bkeys[(Math.random() * bkeys.length) | 0]]; return { x: agent.eatSeat.x, y: agent.eatSeat.y }; }
    }
    // LOUNGE / OUTSIDE / RECREATION — just hang out
    var rooms = [{ x: 23, y: 37, w: 12, h: 7 }, { x: 63, y: 37, w: 5, h: 7 }, { x: 50, y: 37, w: 9, h: 7 }];
    var rm = rooms[(Math.random() * rooms.length) | 0];
    return getRandomTileInArea(rm.x, rm.y, rm.w, rm.h) || { x: rm.x + 1, y: rm.y + 1 };
  }

  // ═══ VIP AI — CEO + Lucy (custom behavior, bypasses the generic state machine) ═══
  var ceoMode = 'office', ceoSmoke = 1200, ceoModeT = 30, congratsT = 5;
  var lucyMode = 'follow', lucyT = 25, lucyTarget = null;
  function vipGoto(agent, tx, ty, faceDir, dt) {
    var arrived = moveAgentToward(agent, tx * TILE_SIZE + TILE_SIZE / 2, ty * TILE_SIZE + TILE_SIZE / 2, dt);
    if (arrived) { agent.walking = false; agent.tileCol = tx; agent.tileRow = ty; agent.state = STATE.IDLE; if (faceDir != null) agent.dir = faceDir; }
    else { agent.state = STATE.WALK; if (agent.frameTimer > 0.15) { agent.frameTimer = 0; agent.frame = (agent.frame + 1) % 4; } }
    return arrived;
  }
  function vipStep(agent, dt) {
    if (allHandsActive) {
      // CEO + Lucy stand at the front of the conference and present
      vipGoto(agent, agent.ceo ? 32 : 34, 6, DIR.DOWN, dt);
      agent.idleArea = 'conf';
      if (agent.ceo) {
        congratsT -= dt;
        if (congratsT <= 0) {
          congratsT = 6 + Math.random() * 4;
          var aud = agents.filter(function(a) { return !a.vip && a.confSeat; });
          if (aud.length) {
            var who = aud[(Math.random() * aud.length) | 0];
            agent.speechBubble = { text: pick(CEO_CONGRATS).replace('{AGENT}', (who.name || 'team').toUpperCase()) };
            agent.speechEnd = Date.now() + 3800;
            who.speechBubble = { text: pick(AGENT_THANKS) };
            who.speechEnd = Date.now() + 3800;
          }
        }
      }
      return;
    }
    if (agent.ceo) {
      ceoSmoke -= dt;
      if (ceoMode !== 'smoking' && ceoMode !== 'cafe2smoke' && ceoSmoke <= 0) { ceoMode = 'cafe2smoke'; ceoModeT = 12; ceoSmoke = 1200; }
      if (ceoMode === 'cafe2smoke') { vipGoto(agent, 6, 39, DIR.UP, dt); agent.idleArea = 'cafeteria'; ceoModeT -= dt; if (ceoModeT <= 0) { ceoMode = 'smoking'; ceoModeT = 60; } }
      else if (ceoMode === 'smoking') { vipGoto(agent, 64, 41, DIR.DOWN, dt); agent.idleArea = 'smoking'; ceoModeT -= dt; if (ceoModeT <= 0) ceoMode = 'office'; }
      else if (ceoMode === 'mc') { vipGoto(agent, 55, 14, DIR.UP, dt); agent.idleArea = 'mc'; ceoModeT -= dt; if (ceoModeT <= 0) ceoMode = 'office'; }
      else { vipGoto(agent, 10, 8, DIR.DOWN, dt); agent.idleArea = 'ceo'; ceoModeT -= dt; if (ceoModeT <= 0) { if (Math.random() < 0.35) { ceoMode = 'mc'; ceoModeT = 35; } else ceoModeT = 30 + Math.random() * 40; } }
      return;
    }
    // Lucy
    lucyT -= dt;
    var ceo = ceoAgent;
    if (ceoMode === 'cafe2smoke') { vipGoto(agent, 8, 39, DIR.UP, dt); agent.idleArea = 'cafeteria'; return; }
    if (ceoMode === 'smoking') { vipGoto(agent, 66, 41, DIR.DOWN, dt); agent.idleArea = 'smoking'; return; }
    if (lucyMode === 'roam' && lucyTarget) {
      var arr = vipGoto(agent, lucyTarget.tileCol, lucyTarget.tileRow + 1, DIR.UP, dt);
      if (arr && !agent.speechBubble) { agent.speechBubble = { text: LUCY_CHECK[(Math.random() * LUCY_CHECK.length) | 0] }; agent.speechEnd = Date.now() + 3000; }
      if (lucyT <= 0) { lucyMode = 'follow'; lucyTarget = null; }
    } else {
      var tx = ceo ? ceo.tileCol + 2 : 12, ty = ceo ? ceo.tileRow : 8;
      vipGoto(agent, tx, ty, ceo ? ceo.dir : DIR.DOWN, dt);
      if (lucyT <= 0) {
        if (Math.random() < 0.2) {
          var cands = agents.filter(function(a) { return !a.vip && (a.officeState === 'working' || a.officeState === 'reviewing'); });
          if (cands.length) { lucyTarget = cands[(Math.random() * cands.length) | 0]; lucyMode = 'roam'; lucyT = 18; } else lucyT = 25;
        } else lucyT = 18 + Math.random() * 25;
      }
    }
  }
  var cam = { x: 0, y: 0, zoom: 1 };
  var camDragging = false, camDragStart = {}, camDragCamStart = {}, pinchDist = 0;
  // Layout: a fixed left info column + a fixed map "frame" (viewport). The map zooms/pans INSIDE
  // the frame (clipped); the frame itself never moves.
  var frame = { x: 0, y: 0, w: 0, h: 0 };
  var SB_W = 190;  // left info column width (stats + agent cards + buttons)
  var sbScroll = 0;  // agent-roster scroll offset (px)
  function ofEmoji(name) {
    var m = { lucy: '👩‍💼', zeus: '⚡', gladiator: '⚔️', thor: '🔨', athena: '🛡️', hades: '💀',
      iris: '🌈', hermes: '📡', minerva: '🔮', clio: '📊', vulcan: '🔥', plutus: '💰', hestia: '📒',
      juno: '⚖️', fortuna: '🍀', nemesis: '👁️', argus: '🔭', metis: '🧠', claude: '🤖', ada: '💻', prometheus: '💻' };
    return m[(name || '').toLowerCase()] || '🤖';
  }
  function computeLayout(cw, ch) {
    frame.x = SB_W + 10; frame.y = 10;
    frame.w = Math.max(80, cw - frame.x - 10);
    frame.h = Math.max(80, ch - 20);
  }
  function mapOffset() {
    var mapW = MAP_W * cam.zoom, mapH = MAP_H * cam.zoom;
    return { x: frame.x + Math.floor((frame.w - mapW) / 2) + Math.round(cam.x),
             y: frame.y + Math.floor((frame.h - mapH) / 2) + Math.round(cam.y) };
  }
  var sbHits = [];      // clickable agent-card rects in the sidebar (rebuilt each frame)
  var focus = null;     // brief "spotlight this agent" effect (zoom in, arrow, then back)
  function focusOnAgent(id) {
    var a = agents.find(function(x) { return x.id === id; });
    if (!a) return;
    focus = { id: id, t: 0, saved: { x: cam.x, y: cam.y, zoom: cam.zoom } };
  }
  var tileMap = [], furniture = [], seats = {}, mapCache = null, blockedGrid = null;
  var bubbles = [], MAX_BUBBLES = 12, particles = [], officeBtns = {};
  var allHandsActive = false, allHandsEndMs = 0, nextAllHandsMs = 0;
  var ALLHANDS_EVERY_MS = 300000, ALLHANDS_LEN_MS = 60000; // all-hands every 5 min, 1 min long

  // ═══ TILE MAP ═══
  // Open walkable interior (zones are colored rugs, not blocking walls — guarantees
  // pathfinding stays fully connected, matching the office-metro-full preview).
  function buildTileMap() {
    tileMap = [];
    for (var r = 0; r < MAP_ROWS; r++) {
      tileMap[r] = [];
      for (var c = 0; c < MAP_COLS; c++) {
        tileMap[r][c] = (r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1) ? TILE.WALL : TILE.FLOOR;
      }
    }
  }

  // Zone rects (tile coords) — used for floor coloring + room labels (matches preview)
  var ZONES = [
    { x: 3,  y: 3,  w: 17, h: 12, c: 'rgba(180,150,224,0.55)', n: 'CEO OFFICE' },
    { x: 22, y: 3,  w: 24, h: 13, c: 'rgba(150,195,225,0.55)', n: 'CONFERENCE' },
    { x: 48, y: 3,  w: 21, h: 14, c: 'rgba(28,40,58,0.85)',    n: 'MISSION CONTROL', dark: 1 },
    { x: 3,  y: 19, w: 30, h: 12, c: 'rgba(240,200,120,0.50)', n: 'WORKSTATION' },
    { x: 35, y: 19, w: 34, h: 12, c: 'rgba(150,195,225,0.50)', n: 'FOCUS AREA' },
    { x: 3,  y: 34, w: 18, h: 12, c: 'rgba(240,200,120,0.50)', n: 'CAFETERIA' },
    { x: 22, y: 34, w: 14, h: 12, c: 'rgba(180,150,224,0.50)', n: 'LOUNGE' },
    { x: 38, y: 34, w: 9,  h: 12, c: 'rgba(150,160,172,0.30)', n: 'REST' },
    { x: 49, y: 34, w: 11, h: 12, c: 'rgba(150,160,172,0.30)', n: 'RECREATION' },
    { x: 62, y: 34, w: 7,  h: 12, c: 'rgba(110,180,100,0.55)', n: 'OUTSIDE' }
  ];

  // ═══ FURNITURE ═══
  function buildFurniture() {
    furniture = [];
    seats = {};

    // WORKSTATION — desks (amber zone); 3 rows so chairs stay inside the room
    for (var row = 0; row < 3; row++) {
      for (var col = 0; col < 5; col++) {
        var dx = 5 + col * 6, dy = 21 + row * 3;
        furniture.push({ type: 'desk', x: dx, y: dy, w: 3, h: 1 });
        furniture.push({ type: 'pc', x: dx + 1, y: dy, w: 1, h: 1 });
        furniture.push({ type: 'chair', x: dx + 1, y: dy + 1, w: 1, h: 1 });
        seats['desk_' + row + '_' + col] = { x: dx + 1, y: dy + 1, assigned: false, facing: DIR.UP };
      }
    }

    // FOCUS AREA (blue zone) — desks (expanded to fill the now-larger focus area)
    for (var fr = 0; fr < 3; fr++) {
      for (var fc = 0; fc < 7; fc++) {
        var ax = 36 + fc * 5, ay = 21 + fr * 3;
        furniture.push({ type: 'desk', x: ax, y: ay, w: 3, h: 1 });
        furniture.push({ type: 'pc', x: ax + 1, y: ay, w: 1, h: 1 });
        furniture.push({ type: 'chair', x: ax + 1, y: ay + 1, w: 1, h: 1 });
        seats['focus_' + fr + '_' + fc] = { x: ax + 1, y: ay + 1, assigned: false, facing: DIR.UP };
      }
    }

    // CONFERENCE — front whiteboard + audience chairs facing the presenter (UP)
    furniture.push({ type: 'whiteboard', x: 32, y: 3, w: 2, h: 1 });
    furniture.push({ type: 'lpaint', x: 24, y: 3, w: 1, h: 1 });
    furniture.push({ type: 'lpaint', x: 43, y: 3, w: 1, h: 1 });
    for (var crow = 0; crow < 4; crow++) {
      for (var ccol = 0; ccol < 10; ccol++) {
        var chx = 24 + ccol * 2, chy = 8 + crow * 2;
        furniture.push({ type: 'cchair', x: chx, y: chy, w: 1, h: 1 });
        seats['conf_' + crow + '_' + ccol] = { x: chx, y: chy, assigned: false, facing: DIR.UP };
      }
    }

    // CEO OFFICE
    furniture.push({ type: 'desk', x: 9, y: 7, w: 3, h: 1 });
    furniture.push({ type: 'pc', x: 10, y: 7, w: 1, h: 1 });
    furniture.push({ type: 'sofa', x: 4, y: 5, w: 2, h: 1 });
    furniture.push({ type: 'dshelf', x: 16, y: 4, w: 1, h: 1 });
    furniture.push({ type: 'lplant', x: 4, y: 12, w: 1, h: 1 });
    furniture.push({ type: 'lpaint', x: 11, y: 3, w: 1, h: 1 });

    // MISSION CONTROL — chairs at the console (console + board drawn live each frame)
    for (var m = 0; m < 4; m++) {
      furniture.push({ type: 'cchair', x: 52 + m * 4, y: 13, w: 1, h: 1 });
      seats['mc_' + m] = { x: 52 + m * 4, y: 13, assigned: false, facing: DIR.UP };
    }
    furniture.push({ type: 'dshelf', x: 49, y: 15, w: 1, h: 1 });

    // CAFETERIA — fridge, coffee machine, long school-style table with chairs to sit + eat
    furniture.push({ type: 'fridge', x: 4, y: 36, w: 1, h: 1 });
    furniture.push({ type: 'coffeestand', x: 6, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'vending', x: 8, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'spaint', x: 9, y: 34, w: 1, h: 1 });
    for (var lt = 0; lt < 6; lt++) {
      furniture.push({ type: 'stable', x: 6 + lt * 2, y: 40, w: 1, h: 1 });
      furniture.push({ type: 'cchair', x: 6 + lt * 2, y: 39, w: 1, h: 1 });
      furniture.push({ type: 'cchair', x: 6 + lt * 2, y: 41, w: 1, h: 1 });
      seats['cafe_t' + lt] = { x: 6 + lt * 2, y: 39, assigned: false, facing: DIR.DOWN };
      seats['cafe_b' + lt] = { x: 6 + lt * 2, y: 41, assigned: false, facing: DIR.UP };
    }
    furniture.push({ type: 'lplant', x: 18, y: 44, w: 1, h: 1 });

    // LOUNGE — two couches with a coffee table between them + extra chairs & side table
    furniture.push({ type: 'sofa', x: 23, y: 37, w: 2, h: 1 });
    furniture.push({ type: 'sofa', x: 23, y: 41, w: 2, h: 1 });
    furniture.push({ type: 'coffeeTable', x: 23, y: 39, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 27, y: 39, w: 1, h: 1 });
    furniture.push({ type: 'stable', x: 30, y: 39, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 30, y: 38, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 30, y: 40, w: 1, h: 1 });
    furniture.push({ type: 'lplant', x: 34, y: 44, w: 1, h: 1 });
    furniture.push({ type: 'lpaint', x: 24, y: 34, w: 1, h: 1 });

    // REST — nap room with beds (agents come here to sleep)
    [[39, 36], [43, 36], [39, 40], [43, 40]].forEach(function(b, i) {
      furniture.push({ type: 'napbed', x: b[0], y: b[1], w: 2, h: 1 });
      seats['bed_' + i] = { x: b[0], y: b[1], assigned: false, facing: DIR.DOWN };
    });
    furniture.push({ type: 'hplant', x: 45, y: 43, w: 1, h: 1 });

    // RECREATION — arcade, wall TV, sofa + chairs (fun room)
    furniture.push({ type: 'arcade', x: 50, y: 37, w: 1, h: 1 });
    furniture.push({ type: 'whiteboard', x: 53, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'sofa', x: 52, y: 40, w: 2, h: 1 });
    furniture.push({ type: 'cchair', x: 51, y: 41, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 55, y: 41, w: 1, h: 1 });
    furniture.push({ type: 'coffeeTable', x: 53, y: 42, w: 1, h: 1 });
    furniture.push({ type: 'bookshelf', x: 58, y: 37, w: 1, h: 1 });

    // (DAILY STANDUP table + chairs removed — standups now happen in the CONFERENCE room;
    //  a meetings clock board occupies this spot instead.)

    // SMOKING (outdoor)
    furniture.push({ type: 'cbench', x: 64, y: 40, w: 1, h: 1 });
    furniture.push({ type: 'cactus', x: 63, y: 37, w: 1, h: 1 });
    furniture.push({ type: 'plant2', x: 67, y: 38, w: 1, h: 1 });

    // scattered plants
    furniture.push({ type: 'lplant', x: 3, y: 17, w: 1, h: 1 });
    furniture.push({ type: 'plant', x: 47, y: 17, w: 1, h: 1 });
  }

  // ═══ PATHFINDING (BFS) ═══
  function isWalkable(col, row) {
    if (row < 0 || row >= MAP_ROWS || col < 0 || col >= MAP_COLS) return false;
    if (blockedGrid && blockedGrid[row] && blockedGrid[row][col]) return false; // furniture + CEO office
    return tileMap[row][col] !== TILE.VOID && tileMap[row][col] !== TILE.WALL;
  }
  // Mark furniture footprints + the CEO office as non-walkable for normal agents' pathfinding
  // (visuals untouched; CEO/Lucy use direct movement so they ignore this). Seats stay reachable.
  function applyObstacles() {
    blockedGrid = [];
    for (var r = 0; r < MAP_ROWS; r++) { blockedGrid[r] = []; for (var c = 0; c < MAP_COLS; c++) blockedGrid[r][c] = 0; }
    var SOLID = { desk: 1, table: 1, stable: 1, fridge: 1, coffeeM: 1, coffeestand: 1, vending: 1, sofa: 1, bookshelf: 1, dshelf: 1, coffeeTable: 1, whiteboard: 1, bed: 1, napbed: 1 };
    furniture.forEach(function(f) {
      if (!SOLID[f.type]) return;
      for (var rr = 0; rr < (f.h || 1); rr++) for (var cc = 0; cc < (f.w || 1); cc++) {
        var tr = f.y + rr, tc = f.x + cc;
        if (blockedGrid[tr] && tc >= 0 && tc < MAP_COLS) blockedGrid[tr][tc] = 1;
      }
    });
    for (var r2 = 3; r2 <= 14; r2++) for (var c2 = 3; c2 <= 19; c2++) if (blockedGrid[r2]) blockedGrid[r2][c2] = 1; // CEO office off-limits
    Object.keys(seats).forEach(function(k) { var s = seats[k]; if (blockedGrid[s.y]) blockedGrid[s.y][s.x] = 0; }); // keep every seat reachable
  }

  function findPath(sx, sy, ex, ey) {
    if (sx === ex && sy === ey) return [];
    if (!isWalkable(ex, ey)) return [];
    var key = function(c, r) { return c + ',' + r; };
    var visited = new Set([key(sx, sy)]);
    var queue = [{ x: sx, y: sy, path: [] }];
    var dirs = [[0,-1],[0,1],[-1,0],[1,0]];
    while (queue.length > 0) {
      var cur = queue.shift();
      for (var i = 0; i < 4; i++) {
        var nx = cur.x + dirs[i][0], ny = cur.y + dirs[i][1], k = key(nx, ny);
        if (visited.has(k) || !isWalkable(nx, ny)) continue;
        var newPath = cur.path.concat([{ x: nx, y: ny }]);
        if (nx === ex && ny === ey) return newPath;
        visited.add(k);
        queue.push({ x: nx, y: ny, path: newPath });
      }
    }
    return [];
  }

  function getRandomWalkableTile() {
    var tiles = [];
    for (var r = 0; r < MAP_ROWS; r++)
      for (var c = 0; c < MAP_COLS; c++)
        if (isWalkable(c, r)) tiles.push({ x: c, y: r });
    return tiles.length > 0 ? tiles[Math.floor(Math.random() * tiles.length)] : { x: 30, y: 20 };
  }

  function findNearestWalkable(col, row) {
    for (var radius = 1; radius <= 5; radius++) {
      for (var dr = -radius; dr <= radius; dr++) {
        for (var dc = -radius; dc <= radius; dc++) {
          if (Math.abs(dr) !== radius && Math.abs(dc) !== radius) continue;
          if (isWalkable(col + dc, row + dr)) return { x: col + dc, y: row + dr };
        }
      }
    }
    return null;
  }

  // ═══ DIALOGUE POOLS ═══
  var WORKING_CHATTER = [
    "Implementing feature...", "Reviewing code...", "Fixing bugs...", "Writing tests...",
    "Deploying to staging...", "Checking logs...", "Refactoring module...", "Optimizing queries...",
    "Updating docs...", "Merging PR...", "Running build...", "Debugging issue...",
    "Writing report...", "Analyzing data...", "Configuring server...", "Testing edge cases..."
  ];
  var MEETING_CHATTER = [
    "Let's review sprint progress.", "We need a solution for this task.", "This depends on another agent.",
    "What's the status update?", "Let's align on priorities.", "Any blockers?", "Good progress team!",
    "Next sprint planning.", "Let's discuss the architecture.", "Who can help with this?"
  ];
  var BLOCKED_CHATTER = [
    "Waiting for API credentials.", "Database migration failed.", "Need review approval.",
    "Waiting for deployment.", "Need more information.", "Stuck on this bug...",
    "Waiting for dependency.", "Access request pending.", "Need clarification..."
  ];
  var IDLE_CHATTER = [
    "Waiting for new assignment.", "Checking company updates.", "Taking a quick break.",
    "Let's see what the team is doing.", "Coffee time!", "Browsing documentation...",
    "Almost done with that task...", "Need more coffee...", "Relaxing for a moment...",
    "Checking the task board...", "Good vibes today!", "TGIF!", "Interesting data pattern...",
    "Found a new approach...", "Let me think about this...", "Nice weather today!",
    "Team is productive!", "Great work everyone!", "Learning something new...", "Just chilling..."
  ];
  var SMOKING_CHATTER = [
    "I need a smoke.", "Just a small break.", "This feels good.",
    "Fresh air, finally.", "Ahh, that's better.", "Back to it in a sec."
  ];
  var REST_CHATTER = [
    "Just need a quick nap...", "Recharging batteries...", "Long night...",
    "So tired...", "Power nap time...", "Need coffee after this..."
  ];
  var RECREATION_CHATTER = ["High score, baby!", "Rematch? You're going down.", "Game on!", "Boss level, let's gooo!", "Pew pew pew!", "New record!", "Just one more round.", "Combo streak unstoppable!", "GG everyone!", "Respawn and revenge!", "Clutch save!", "Victory dance time!"];
  var CAFETERIA_CHATTER = ["Mmm, donut breach detected.", "Coffee first, code later.", "This sandwich slaps, honestly.", "Tacos beat tickets today.", "Refueling my CPU with snacks.", "Is it lunch o'clock yet?", "Crumbs in the keyboard again.", "Second coffee, no regrets.", "Snack break, deeply earned.", "Leftover pizza tastes like victory.", "Caffeine levels critically low.", "One more cookie won't hurt."];
  var LOUNGE_CHATTER = ["Comfy couch life.", "Best seat in the house.", "Just vibing.", "Loading: maximum relaxation.", "My battery says lounge mode.", "Shhh, I'm buffering.", "This pixel sun feels nice.", "No tasks, just snacks.", "Soft mode activated.", "I live here now.", "Idle, but make it cozy."];
  var FOCUS_CHATTER = ["In the zone.", "Almost shipped this.", "Tests are green!", "Deep work, do not disturb.", "Just one more commit.", "Crushing this task.", "Flow state achieved.", "Ship it!", "Heads down, brain on.", "Compiling my genius.", "So close to merging."];
  var STANDUP_CHATTER = ["Standup time!", "Morning, Lucy!", "What's the plan?", "On it, boss.", "Coffee first, then chaos.", "Ready to ship today.", "Sprint goals, here we go!", "Assign me the fun one!", "Copy that, Lucy.", "Let's crush this backlog!"];
  var CEO_SPEECH = ["Alright team, eyes up front!", "This quarter, we go big.", "Our objectives are crystal clear.", "Ship it fast, ship it right.", "I believe in every one of you.", "Let's crush these targets together.", "Work in progress means progress!", "The roadmap starts today.", "Dream big, deliver bigger.", "No blockers we can't break.", "Best sprint yet, let's go!", "Excellence is the only standard."];
  var CEO_CONGRATS = ["Amazing work, {AGENT}!", "{AGENT}, you crushed it!", "Big shoutout to {AGENT}.", "{AGENT} saved the sprint.", "Take a bow, {AGENT}!", "{AGENT}, absolute legend today.", "{AGENT} carried the team!", "Give it up for {AGENT}!", "Outstanding effort, {AGENT}.", "Round of applause for {AGENT}!"];
  var AGENT_THANKS = ["Thank you very much!", "Aw, you're too kind!", "Just doing my job, boss!", "Means a lot, thank you!", "Happy to help out!", "All in a day's work!", "You made my day, boss!", "Glad I could deliver!", "Honored, truly!"];
  var CEO_TO_LUCY = ["Lucy, where are we on Q3?", "Get me that report by noon.", "Push the standup back an hour.", "Lucy, any fires this morning?", "Coffee, then we strategize.", "Did the board reply yet?", "Clear my afternoon, Lucy.", "What's first on the agenda?", "Lucy, hold all my calls.", "Numbers looking good today?", "Great work catching that, Lucy."];
  var LUCY_TO_CEO = ["On it, sir.", "Already handled.", "Numbers look great.", "Meeting's at three.", "Consider it done.", "Inbox is clear.", "Calendar's all set.", "Right away, sir.", "I'll brief the team.", "Two steps ahead.", "Anything else, sir?"];

  // ═══ AGENT SYSTEM ═══
  function derivePersonality(da) {
    var t = (da.title || '').toLowerCase();
    var tm = (da.team || '').toLowerCase();
    var r = (da.role || '').toLowerCase();
    if (tm === 'leadership' || t.indexOf('lead') >= 0 || t.indexOf('director') >= 0) return 'manager';
    if (tm === 'research' || t.indexOf('intel') >= 0 || t.indexOf('analytic') >= 0) return 'research';
    if (t.indexOf('qa') >= 0 || r.indexOf('test') >= 0) return 'qa';
    if (t.indexOf('senior') >= 0 || tm === 'project' || t.indexOf('engineer') >= 0) return 'worker';
    return 'social';
  }

  function getAgentColor(da) { return TEAM_COLORS[da.team] || '#64748b'; }

  function getAgentSkin(da) {
    var tones = ['#f8d5b4', '#e8b89a', '#d4a574', '#c49060', '#a87850', '#8b6040'];
    var h = 0;
    for (var i = 0; i < da.id.length; i++) { h = ((h << 5) - h) + da.id.charCodeAt(i); h |= 0; }
    return tones[Math.abs(h) % tones.length];
  }

  // Get a random tile in a specific area
  function getRandomTileInArea(areaX, areaY, areaW, areaH) {
    for (var attempts = 0; attempts < 20; attempts++) {
      var c = areaX + Math.floor(Math.random() * areaW);
      var r = areaY + Math.floor(Math.random() * areaH);
      if (isWalkable(c, r)) return { x: c, y: r };
    }
    return null;
  }

  // Get destination tile based on agent status
  function getDestinationForStatus(agent) {
    var pos;
    switch (agent.officeState) {
      case 'working':
        if (mcAllowed(agent)) { var ms = mcStandFor(agent); return { x: ms.x, y: ms.y }; } // mission control (restricted)
        if (agent.seatId && seats[agent.seatId]) { var s = seats[agent.seatId]; return { x: s.x, y: s.y }; }
        pos = getRandomTileInArea(4, 20, 28, 10); // team collaboration
        return pos || { x: 12, y: 24 };

      case 'meeting':
        pos = getRandomTileInArea(24, 8, 18, 6) || { x: 33, y: 10 }; // conference audience
        return pos;

      case 'reviewing':
        if (mcAllowed(agent)) { var ms2 = mcStandFor(agent); return { x: ms2.x, y: ms2.y }; }
        if (agent.seatId && seats[agent.seatId]) { var sr = seats[agent.seatId]; return { x: sr.x, y: sr.y }; } // sit on their chair, aligned
        pos = getRandomTileInArea(50, 20, 18, 10) || { x: 56, y: 24 }; // focus area fallback
        return pos;

      case 'blocked':
        pos = getRandomTileInArea(23, 37, 12, 7) || { x: 27, y: 40 }; // lounge
        return pos;

      case 'idle':
      default:
        // Idle areas: cafeteria, lounge, smoking, rest, recreation
        var idleAreas = [
          { x: 4,  y: 37, w: 15, h: 7 }, // cafeteria
          { x: 23, y: 37, w: 12, h: 7 }, // lounge
          { x: 63, y: 37, w: 5,  h: 7 }, // smoking
          { x: 39, y: 38, w: 7,  h: 6 }, // rest
          { x: 50, y: 37, w: 9,  h: 7 }  // recreation
        ];
        var area;
        var r = Math.random();
        if (agent.personality === 'social') area = r < 0.5 ? idleAreas[0] : idleAreas[1];
        else if (agent.personality === 'research') area = r < 0.6 ? idleAreas[0] : idleAreas[3];
        else if (agent.personality === 'worker') area = r < 0.35 ? idleAreas[0] : (r < 0.6 ? idleAreas[1] : (r < 0.8 ? idleAreas[2] : idleAreas[4]));
        else if (agent.personality === 'qa') area = r < 0.4 ? idleAreas[1] : (r < 0.7 ? idleAreas[4] : idleAreas[2]);
        else area = idleAreas[Math.floor(Math.random() * idleAreas.length)];
        pos = getRandomTileInArea(area.x, area.y, area.w, area.h);
        return pos || { x: area.x + 1, y: area.y + 1 };
    }
  }

  // Get chatter text based on status
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function getChatterText(agent) {
    if (agent.ceo) return allHandsActive ? pick(CEO_SPEECH) : pick(CEO_TO_LUCY);
    if (agent.lucy) return pick(LUCY_TO_CEO);
    if (allHandsActive && agent.confSeat) return pick(CONFERENCE_CHATTER);
    if (agent.state === STATE.IDLE || agent.onBreak) {
      switch (agent.idleArea) {
        case 'smoking': return pick(SMOKING_CHATTER);
        case 'cafeteria': return pick(CAFETERIA_CHATTER);
        case 'lounge': return pick(LOUNGE_CHATTER);
        case 'rest': return pick(REST_CHATTER);
        case 'recreation': return pick(RECREATION_CHATTER);
        case 'focus': return pick(FOCUS_CHATTER);
        case 'standup': return pick(STANDUP_CHATTER);
        default: return pick(IDLE_CHATTER);
      }
    }
    switch (agent.officeState) {
      case 'working':
        if (agent.currentTicket && agent.currentTicket.title && liveAgents[(agent.name || '').toLowerCase()] && Math.random() < 0.5) return agent.currentTicket.title.substring(0, 40);
        return pick(FOCUS_CHATTER);
      case 'meeting': return pick(MEETING_CHATTER);
      case 'blocked': return pick(BLOCKED_CHATTER);
      case 'reviewing': return pick(WORKING_CHATTER);
      default: return pick(IDLE_CHATTER);
    }
  }

  function updateAgentStates() {
    if (!officeData) return;
    var tickets = officeData.tickets || [];
    var dataAgents = officeData.agents || [];
    var availSeats = Object.keys(seats).filter(function(k) { return !seats[k].assigned; });

    agents = dataAgents.map(function(da) {
      var myT = tickets.filter(function(t) { return t.assigned_to === da.id; });
      var inP = myT.find(function(t) { return t.status === 'in_progress'; });
      var inV = myT.find(function(t) { return t.status === 'in_validation'; });
      var blk = myT.find(function(t) { return t.blockedBy; });

      // Determine office status based on ticket state
      var officeStatus;
      if (inP) officeStatus = 'working';
      else if (inV) officeStatus = 'reviewing';
      else if (blk) officeStatus = 'blocked';
      else officeStatus = 'idle';

      var exist = agents.find(function(a) { return a.id === da.id; });
      var personality = derivePersonality(da);
      var color = getAgentColor(da);
      var skin = getAgentSkin(da);
      var seatId = (exist && exist.seatId) || (availSeats.length > 0 ? availSeats.shift() : null);

      if (exist) {
        var prevStatus = exist.officeState;
        exist.officeState = officeStatus;
        exist.currentTicket = inP || inV || myT[0] || null;
        exist.isBlocked = !!blk;
        exist.tickets = myT;
        exist.personality = personality;
        exist.seatId = seatId;
        exist.color = color;
        exist.skin = skin;
        exist.emoji = da.emoji || '';
        exist.name = da.name;
        exist.title = da.title;
        exist.team = da.team;

        // Status changed — route to new destination
        if (prevStatus !== officeStatus && !allHandsActive && !exist.onBreak) {  // don't yank agents out of a meeting or a break
          var dest = getDestinationForStatus(exist);
          var path = findPath(exist.tileCol, exist.tileRow, dest.x, dest.y);
          if (path.length > 0) {
            exist.path = path;
            exist.state = STATE.WALK;
          }
          // Celebration when task completed
          if (prevStatus === 'working' && officeStatus === 'idle') {
            exist.celebrationTimer = 3;
          }
        }
        return exist;
      }

      // New agent — start at their destination (not random tile)
      var dest = getDestinationForStatus({ officeState: officeStatus, personality: personality, seatId: seatId, team: da.team, id: da.id });
      var startPos = { x: dest.x, y: dest.y };
      // If destination is occupied, find nearby tile
      if (!isWalkable(startPos.x, startPos.y)) {
        var nearby = findNearestWalkable(dest.x, dest.y);
        startPos = nearby || getRandomWalkableTile();
      }

      return {
        id: da.id, name: da.name, title: da.title, team: da.team,
        emoji: da.emoji || '', personality: personality,
        color: color, skin: skin,
        officeState: officeStatus, currentTicket: inP || inV || myT[0] || null,
        isBlocked: !!blk, tickets: myT, seatId: seatId,
        x: startPos.x * TILE_SIZE + TILE_SIZE / 2, y: startPos.y * TILE_SIZE + TILE_SIZE / 2,
        tileCol: startPos.x, tileRow: startPos.y,
        path: [], moveProgress: 0, dir: (seatId && seats[seatId]) ? seats[seatId].facing : DIR.UP,
        frame: 0, frameTimer: 0, state: STATE.TYPE, // start at destination
        wanderTimer: Math.random() * 3, wanderCount: 0,
        wanderLimit: Math.floor(Math.random() * (WANDER_LIMIT_MAX - WANDER_LIMIT_MIN)) + WANDER_LIMIT_MIN,
        speechBubble: null, speechEnd: 0, nextSpeechTime: Date.now() + 2000 + Math.random() * 5000,
        celebrationTimer: 0, walking: false,
        idleArea: 'lounge', onBreak: false, breakTimer: 40 + Math.random() * 80, breakEnd: 0
      };
    });
    agents.forEach(function(a) { if (/lucy/i.test(a.name || '')) { a.vip = true; a.lucy = true; } });
    if (!ceoAgent) ceoAgent = makeCEO();
    agents.push(ceoAgent); // CEO NPC always present in the CEO office
  }

  // ═══ AGENT MOVEMENT ═══
  function moveAgentToward(agent, tx, ty, dt) {
    var dx = tx - agent.x, dy = ty - agent.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 2) return true;
    var speed = WALK_SPEED * dt;
    if (speed > dist) speed = dist;
    agent.x += (dx / dist) * speed;
    agent.y += (dy / dist) * speed;
    if (Math.abs(dx) > Math.abs(dy)) agent.dir = dx > 0 ? DIR.RIGHT : DIR.LEFT;
    else agent.dir = dy > 0 ? DIR.DOWN : DIR.UP;
    agent.walking = true;
    return false;
  }

  function updateAgents(dt) {
    var now = Date.now();

    agents.forEach(function(agent) {
      agent.frameTimer += dt;

      // Break/eat timing (state-independent, so eating agents are freed correctly). Skipped during all-hands.
      if (!allHandsActive && agent.onBreak) {
        agent.breakEnd -= dt;
        if (agent.foodTimer > 0) { agent.foodTimer -= dt; if (agent.foodTimer <= 0) agent.breakProp = null; } // food gone after 30s
        if (agent.breakEnd <= 0) {
          agent.onBreak = false; agent.breakStage = null; agent.breakProp = null; agent.foodTimer = 0;
          var _rd = getDestinationForStatus(agent);
          var _rp = findPath(agent.tileCol, agent.tileRow, _rd.x, _rd.y);
          if (_rp.length > 0) { agent.path = _rp; agent.state = STATE.WALK; } else { agent.state = STATE.IDLE; }
        }
      }
      // Nap timing (rest room) — wake and return after the nap.
      if (!allHandsActive && agent.sleeping) {
        agent.sleepTimer -= dt;
        if (agent.sleepTimer <= 0) {
          agent.sleeping = false; agent.breakProp = null;
          var _nd = getDestinationForStatus(agent);
          var _np = findPath(agent.tileCol, agent.tileRow, _nd.x, _nd.y);
          if (_np.length > 0) { agent.path = _np; agent.state = STATE.WALK; } else { agent.state = STATE.IDLE; }
        }
      }

      if (agent.vip) vipStep(agent, dt);
      if (!agent.vip) switch (agent.state) {
        case STATE.TYPE:
          // Typing animation at desk/meeting/reviewing
          if (agent.frameTimer >= TYPE_FRAME_DURATION) { agent.frameTimer -= TYPE_FRAME_DURATION; agent.frame = (agent.frame + 1) % 2; }
          agent.walking = false;
          // Check if status changed while typing — if no longer working/meeting/reviewing, leave
          if (agent.officeState !== 'working' && agent.officeState !== 'meeting' && agent.officeState !== 'reviewing') {
            agent.state = STATE.IDLE; agent.frame = 0; agent.frameTimer = 0;
            agent.wanderTimer = 0; // trigger immediate reroute
            agent.wanderCount = 0;
            agent.wanderLimit = Math.floor(Math.random() * (WANDER_LIMIT_MAX - WANDER_LIMIT_MIN)) + WANDER_LIMIT_MIN;
            // Walk to appropriate area (idle area, lounge for blocked, etc.)
            var dest = getDestinationForStatus(agent);
            var path = findPath(agent.tileCol, agent.tileRow, dest.x, dest.y);
            if (path.length > 0) { agent.path = path; agent.state = STATE.WALK; }
          } else if (!allHandsActive && !agent.onBreak && !agent.sleeping) {
            // Occasionally take a short break to a room even while working
            agent.breakTimer -= dt;
            if (agent.breakTimer <= 0) {
              agent.onBreak = true; agent.breakEnd = 45 + Math.random() * 20; agent.breakTimer = 80 + Math.random() * 130;
              var bd = planBreakDest(agent);
              var bp = findPath(agent.tileCol, agent.tileRow, bd.x, bd.y);
              if (bp.length > 0) { agent.path = bp; agent.state = STATE.WALK; }
            }
          }
          break;

        case STATE.WALK:
          if (agent.path.length > 0) {
            var tgt = agent.path[0];
            var arrived = moveAgentToward(agent, tgt.x * TILE_SIZE + TILE_SIZE / 2, tgt.y * TILE_SIZE + TILE_SIZE / 2, dt);
            if (arrived) {
              agent.path.shift();
              agent.tileCol = tgt.x; agent.tileRow = tgt.y;
              if (agent.path.length === 0) {
                agent.walking = false;
                // Arrived — what now?
                if (allHandsActive && agent.confSeat) {
                  agent.state = STATE.TYPE; agent.frame = 0; agent.frameTimer = 0; agent.dir = DIR.UP; // sit facing the presenter
                } else if (agent.onBreak && (agent.breakStage === 'getFood' || agent.breakStage === 'getDrink' || agent.breakStage === 'getCoffee')) {
                  agent.breakProp = agent.breakStage === 'getFood' ? ['🍔', '🍕', '🍩', '🥪', '🌮'][agent.id.charCodeAt(0) % 5]
                                  : agent.breakStage === 'getDrink' ? '🥤' : '☕';
                  agent.breakStage = 'toSeat';
                  var _sp = agent.eatSeat || { x: agent.tileCol, y: agent.tileRow };
                  var _pp = findPath(agent.tileCol, agent.tileRow, _sp.x, _sp.y);
                  if (_pp.length > 0) { agent.path = _pp; agent.state = STATE.WALK; }
                  else { agent.breakStage = 'eating'; agent.foodTimer = 30; agent.state = STATE.TYPE; agent.frame = 0; agent.frameTimer = 0; }
                } else if (agent.onBreak && agent.breakStage === 'toBed') {
                  agent.breakStage = 'sleeping'; agent.sleeping = true; agent.sleepTimer = 30; agent.breakProp = '💤';
                  agent.state = STATE.TYPE; agent.frame = 0; agent.frameTimer = 0; agent.dir = DIR.DOWN;
                } else if (agent.onBreak && agent.breakStage === 'toSeat') {
                  agent.breakStage = 'eating'; agent.foodTimer = 30; // sit and eat; item clears after 30s
                  agent.state = STATE.TYPE; agent.frame = 0; agent.frameTimer = 0;
                  agent.dir = (agent.eatSeat && agent.eatSeat.facing != null) ? agent.eatSeat.facing : DIR.UP;
                } else if ((agent.officeState === 'working' || agent.officeState === 'meeting' || agent.officeState === 'reviewing') && !agent.onBreak) {
                  agent.state = STATE.TYPE;
                  agent.frame = 0; agent.frameTimer = 0;
                  agent.dir = (agent.seatId && seats[agent.seatId]) ? seats[agent.seatId].facing : DIR.UP; // face desk/PC
                } else if (agent.tileCol >= 38 && agent.tileCol <= 47 && agent.tileRow >= 34 && agent.tileRow <= 45) {
                  // Arrived in the rest room — lie down and nap (any agent who enters sleeps)
                  agent.sleeping = true; agent.sleepTimer = 25 + Math.random() * 15; agent.breakProp = '💤';
                  agent.state = STATE.TYPE; agent.frame = 0; agent.frameTimer = 0; agent.dir = DIR.DOWN; agent.idleArea = 'rest';
                } else {
                  // Idle — arrived at idle area
                  agent.state = STATE.IDLE; agent.frame = 0; agent.frameTimer = 0;
                  agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
                  // Track which idle area we're in
                  if (agent.tileCol >= 3 && agent.tileCol <= 20 && agent.tileRow >= 34) agent.idleArea = 'cafeteria';
                  else if (agent.tileCol >= 22 && agent.tileCol <= 36 && agent.tileRow >= 34) agent.idleArea = 'lounge';
                  else if (agent.tileCol >= 62 && agent.tileRow >= 34) agent.idleArea = 'smoking';
                  else if (agent.tileCol >= 38 && agent.tileCol <= 47 && agent.tileRow >= 34) agent.idleArea = 'rest';
                  else if (agent.tileCol >= 49 && agent.tileCol <= 60 && agent.tileRow >= 34) agent.idleArea = 'recreation';
                  else if (agent.tileCol >= 49 && agent.tileRow >= 19 && agent.tileRow <= 31) agent.idleArea = 'focus';
                  else if (agent.tileCol >= 35 && agent.tileCol <= 47 && agent.tileRow >= 19 && agent.tileRow <= 31) agent.idleArea = 'lounge';
                  else agent.idleArea = 'lounge';
                }
              }
            }
          } else { agent.state = STATE.IDLE; agent.walking = false; }
          break;

        case STATE.IDLE:
          agent.walking = false; agent.frame = 0;
          // (break timing handled at the top of the update loop)
          agent.wanderTimer -= dt;
          if (agent.wanderTimer <= 0) {
            // IMPORTANT: If agent should be working/meeting/reviewing, route them to WORK area — NOT idle
            if ((agent.officeState === 'working' || agent.officeState === 'meeting' || agent.officeState === 'reviewing') && !agent.onBreak) {
              var workDest = getDestinationForStatus(agent);
              var workPath = findPath(agent.tileCol, agent.tileRow, workDest.x, workDest.y);
              if (workPath.length > 0) {
                agent.path = workPath;
                agent.state = STATE.WALK;
              } else {
                // Can't reach work area — stay idle and try again later
                agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
              }
            } else if (agent.officeState === 'blocked') {
              // Blocked agents stay in lounge
              var loungeDest = getDestinationForStatus(agent);
              var loungePath = findPath(agent.tileCol, agent.tileRow, loungeDest.x, loungeDest.y);
              if (loungePath.length > 0 && (agent.tileCol < 22 || agent.tileCol > 35 || agent.tileRow < 34)) {
                agent.path = loungePath;
                agent.state = STATE.WALK;
              } else {
                agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
              }
            } else {
              // TRULY IDLE — wander within idle areas only
              if (agent.wanderCount >= agent.wanderLimit) {
                // Pick a new idle area
                agent.wanderCount = 0;
                agent.wanderLimit = Math.floor(Math.random() * (WANDER_LIMIT_MAX - WANDER_LIMIT_MIN)) + WANDER_LIMIT_MIN;
                var newDest = getDestinationForStatus(agent);
                var newPath = findPath(agent.tileCol, agent.tileRow, newDest.x, newDest.y);
                if (newPath.length > 0) { agent.path = newPath; agent.state = STATE.WALK; }
                agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
              } else {
                // Wander within current idle area
                var area;
                switch (agent.idleArea) {
                  case 'cafeteria': area = { x: 4, y: 37, w: 15, h: 7 }; break;
                  case 'lounge': area = { x: 23, y: 37, w: 12, h: 7 }; break;
                  case 'smoking': area = { x: 63, y: 37, w: 5, h: 7 }; break;
                  case 'rest': area = { x: 39, y: 38, w: 7, h: 6 }; break;
                  case 'recreation': area = { x: 50, y: 37, w: 9, h: 7 }; break;
                  case 'focus': area = { x: 50, y: 20, w: 18, h: 10 }; break;
                  case 'standup': area = { x: 22, y: 34, w: 14, h: 12 }; break;  // (standup removed → lounge)
                  default: area = { x: 23, y: 37, w: 12, h: 7 };
                }
                var wanderDest = getRandomTileInArea(area.x, area.y, area.w, area.h);
                if (wanderDest) {
                  var wanderPath = findPath(agent.tileCol, agent.tileRow, wanderDest.x, wanderDest.y);
                  if (wanderPath.length > 0) { agent.path = wanderPath; agent.state = STATE.WALK; agent.wanderCount++; }
                }
                agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
              }
            }
          }
          break;
      }

      // ═══ MEETINGS — all-hands every 5 min for 1 min; everyone gathers in the CONFERENCE room ═══
      if (nextAllHandsMs === 0) nextAllHandsMs = now + ALLHANDS_EVERY_MS;
      if (!allHandsActive && now >= nextAllHandsMs && agents.length > 5) {
        allHandsActive = true;
        allHandsEndMs = now + ALLHANDS_LEN_MS;
        nextAllHandsMs = now + ALLHANDS_EVERY_MS;
        var confKeys = Object.keys(seats).filter(function(k) { return k.indexOf('conf_') === 0; });
        var si = 0;
        agents.forEach(function(a) {
          if (a.vip) return; // CEO + Lucy keep their own routine
          var ss = seats[confKeys[si++ % confKeys.length]];
          a.confSeat = ss; a.wasOfficeState = a.officeState; a.onBreak = false; a.sleeping = false; a.breakStage = null; a.breakProp = null; // pulled into meeting — cancel break/nap
          var confPath = findPath(a.tileCol, a.tileRow, ss.x, ss.y);
          if (confPath.length > 0) { a.path = confPath; a.state = STATE.WALK; }
          else { a.tileCol = ss.x; a.tileRow = ss.y; a.x = ss.x * TILE_SIZE + TILE_SIZE / 2; a.y = ss.y * TILE_SIZE + TILE_SIZE / 2; a.state = STATE.TYPE; a.dir = DIR.UP; }
        });
      }
      if (allHandsActive && now >= allHandsEndMs) {
        allHandsActive = false;
        agents.forEach(function(a) {
          if (a.vip) return;
          a.confSeat = null;
          var returnDest = getDestinationForStatus({ officeState: a.wasOfficeState || a.officeState, personality: a.personality, seatId: a.seatId, team: a.team, id: a.id, name: a.name });
          var returnPath = findPath(a.tileCol, a.tileRow, returnDest.x, returnDest.y);
          if (returnPath.length > 0) { a.path = returnPath; a.state = STATE.WALK; }
        });
      }

      // Speech bubbles
      if (agent.speechBubble && now > agent.speechEnd) {
        agent.speechBubble = null;
      }

      if (now > agent.nextSpeechTime && !agent.speechBubble) {
        // Only show speech when agent is stationary (typing or idle at area)
        if (agent.state === STATE.TYPE || (agent.state === STATE.IDLE && !agent.walking)) {
          agent.speechBubble = { text: getChatterText(agent) };
          agent.speechEnd = now + 3000 + Math.random() * 2000;
          agent.nextSpeechTime = now + 8000 + Math.random() * 15000;
          if (bubbles.length >= MAX_BUBBLES) bubbles.shift();
          bubbles.push({
            agentId: agent.id, text: agent.speechBubble.text,
            x: agent.x, y: agent.y - 30, expires: agent.speechEnd,
            type: agent.officeState === 'blocked' ? 'blocked' : (agent.officeState === 'working' ? 'working' : 'normal')
          });
        }
      }

      if (agent.celebrationTimer > 0) agent.celebrationTimer -= dt;
    });

    // Particles
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
    bubbles = bubbles.filter(function(b) { return now < b.expires; });
  }

  // ═══ MAP CACHE ═══
  function buildMapCache() {
    mapCache = document.createElement('canvas');
    mapCache.width = MAP_W;
    mapCache.height = MAP_H;
    var mc = mapCache.getContext('2d');

    for (var r = 0; r < MAP_ROWS; r++) {
      for (var c = 0; c < MAP_COLS; c++) {
        var tile = tileMap[r][c];
        var x = c * TILE_SIZE, y = r * TILE_SIZE;
        if (tile === TILE.VOID) continue;
        if (tile === TILE.WALL) {
          mc.fillStyle = '#cdd3da';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.fillStyle = '#e6ebf0';
          mc.fillRect(x, y, TILE_SIZE, 3); mc.fillRect(x, y, 3, TILE_SIZE);
          mc.fillStyle = '#99a2ad';
          mc.fillRect(x + TILE_SIZE - 3, y, 3, TILE_SIZE); mc.fillRect(x, y + TILE_SIZE - 3, TILE_SIZE, 3);
        } else if (tile === TILE.FLOOR) {
          mc.fillStyle = ((c + r) % 2 === 0) ? '#d7dce2' : '#d1d6dc';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.strokeStyle = 'rgba(150,160,172,0.30)'; mc.lineWidth = 1; mc.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        } else if (tile === TILE.CARPET) {
          mc.fillStyle = ((c + r) % 2 === 0) ? '#cdd3da' : '#c7cdd4';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.strokeStyle = 'rgba(150,160,172,0.25)'; mc.lineWidth = 1; mc.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
        }
      }
    }

    // Zone-colored floors (dashboard look) from ZONES
    ZONES.forEach(function(z) {
      mc.fillStyle = z.c;
      mc.fillRect(z.x * TILE_SIZE, z.y * TILE_SIZE, z.w * TILE_SIZE, z.h * TILE_SIZE);
      mc.strokeStyle = z.dark ? 'rgba(20,30,45,0.9)' : 'rgba(255,255,255,0.30)';
      mc.lineWidth = 2;
      mc.strokeRect(z.x * TILE_SIZE, z.y * TILE_SIZE, z.w * TILE_SIZE, z.h * TILE_SIZE);
    });

    // Furniture
    furniture.forEach(function(f) { drawFurnitureSprite(mc, f); });

    // Zone labels (bottom-center of each room)
    mc.font = 'bold 8px monospace';
    mc.textAlign = 'center';
    ZONES.forEach(function(z) {
      var lx = (z.x + z.w / 2) * TILE_SIZE, ly = (z.y + z.h - 0.6) * TILE_SIZE;
      var w = mc.measureText(z.n).width + 10;
      mc.fillStyle = 'rgba(13,17,23,0.6)';
      mc.fillRect(lx - w / 2, ly - 9, w, 14);
      mc.fillStyle = '#ffffff';
      mc.fillText(z.n, lx, ly + 1);
    });
  }

  function drawFurnitureSprite(mc, f) {
    var x = f.x * TILE_SIZE, y = f.y * TILE_SIZE, s = TILE_SIZE;
    if (sprReady) {
      var fk = f.type === 'chair' ? 'wchair' : (f.type === 'pc' ? 'pcOn' : f.type);
      var fi = SPR[fk];
      if (fi && fi.complete && fi.width) {
        var fsc = TILE_SIZE / 16, fdw = fi.width * fsc, fdh = fi.height * fsc;
        mc.drawImage(fi, x, y - (fdh - f.h * TILE_SIZE), fdw, fdh);
        return;
      }
    }
    function ol(ox, oy, ow, oh) { mc.fillStyle = '#3a2c1c'; mc.fillRect(ox - 1, oy - 1, ow + 2, oh + 2); }
    switch (f.type) {
      case 'desk': {
        var dw = f.w * s, dh = f.h * s;
        ol(x, y, dw, dh);
        mc.fillStyle = '#9c6b3f'; mc.fillRect(x, y, dw, dh);
        mc.fillStyle = '#b07d4f'; mc.fillRect(x, y, dw, 3);
        mc.fillStyle = '#6f4a28'; mc.fillRect(x, y + dh - 4, dw, 4);
        var mw = s * 1.1, mxx = x + dw / 2 - mw / 2, myy = y + 1;
        mc.fillStyle = '#1a1f30'; mc.fillRect(mxx - 1, myy - 1, mw + 2, s * 0.6 + 2);
        mc.fillStyle = '#bfe6ff'; mc.fillRect(mxx + 1, myy + 1, mw - 2, s * 0.6 - 2);
        mc.fillStyle = '#7fc6ff'; mc.fillRect(mxx + 2, myy + 2, mw * 0.5, 1);
        mc.fillStyle = '#cdbfa6'; mc.fillRect(x + dw / 2 - s * 0.4, y + dh - 6, s * 0.8, 3);
        break;
      }
      case 'chair': {
        mc.fillStyle = '#241c14'; mc.fillRect(x + 2, y + 3, s - 4, s - 5);
        mc.fillStyle = '#414a5e'; mc.fillRect(x + 3, y + 4, s - 6, s - 7);
        mc.fillStyle = '#586378'; mc.fillRect(x + 4, y + 4, s - 8, 3);
        mc.fillStyle = '#2b313f'; mc.fillRect(x + 4, y + s - 5, s - 8, 2);
        break;
      }
      case 'table': {
        var tw = f.w * s, th = f.h * s;
        ol(x, y, tw, th);
        mc.fillStyle = '#9c6b3f'; mc.fillRect(x, y, tw, th);
        mc.fillStyle = '#b07d4f'; mc.fillRect(x, y, tw, 3);
        mc.fillStyle = 'rgba(120,80,45,0.4)';
        for (var gx = x + 6; gx < x + tw - 4; gx += 8) mc.fillRect(gx, y + 3, 1, th - 6);
        break;
      }
      case 'sofa': {
        var sw = f.w * s;
        ol(x, y, sw, s);
        mc.fillStyle = '#7a4a3e'; mc.fillRect(x, y, sw, s);
        mc.fillStyle = '#90594a'; mc.fillRect(x, y, sw, s * 0.35);
        mc.fillRect(x, y, 3, s); mc.fillRect(x + sw - 3, y, 3, s);
        mc.fillStyle = 'rgba(0,0,0,0.18)';
        for (var cu = x + 4; cu < x + sw - 4; cu += s) mc.fillRect(cu, y + s * 0.4, 1, s * 0.5);
        break;
      }
      case 'plant': {
        mc.fillStyle = '#241c14'; mc.fillRect(x + 3, y + 9, s - 6, s - 9);
        mc.fillStyle = '#b4623a'; mc.fillRect(x + 4, y + 10, s - 8, s - 11);
        mc.fillStyle = '#8f4a2b'; mc.fillRect(x + 4, y + 10, s - 8, 2);
        mc.fillStyle = '#3f8350'; mc.fillRect(x + 3, y, s - 6, s * 0.6);
        mc.fillStyle = '#5aa86a'; mc.fillRect(x + 5, y + 1, s - 12, s * 0.45);
        mc.fillStyle = '#6fbf7e'; mc.fillRect(x + 7, y + 1, 3, 3);
        break;
      }
      case 'screen': {
        var ww = f.w * s;
        ol(x, y, ww, s);
        mc.fillStyle = '#10141c'; mc.fillRect(x, y, ww, s);
        mc.fillStyle = '#1f4a6a'; mc.fillRect(x + 2, y + 2, ww - 4, s - 4);
        mc.fillStyle = '#7fc6ff'; for (var i = 0; i < 3; i++) mc.fillRect(x + 8 + i * 16, y + s * 0.3, 10, 2);
        mc.fillStyle = '#3ec46d'; mc.fillRect(x + 8, y + s * 0.6, 24, 2);
        break;
      }
      case 'bed': {
        var bw2 = f.w * s;
        ol(x, y, bw2, s);
        mc.fillStyle = '#8a5a34'; mc.fillRect(x, y, bw2, s);
        mc.fillStyle = '#5b7798'; mc.fillRect(x + 2, y + 2, bw2 - 4, s - 4);
        mc.fillStyle = '#46607e'; mc.fillRect(x + 2, y + 2, bw2 - 4, 3);
        mc.fillStyle = '#eef2f7'; mc.fillRect(x + 3, y + 4, s * 0.7, s * 0.5);
        break;
      }
      case 'arcade': {
        ol(x, y, s, s);
        mc.fillStyle = '#2a2440'; mc.fillRect(x, y, s, s);
        mc.fillStyle = '#bfe6ff'; mc.fillRect(x + 2, y + 2, s - 4, s * 0.5);
        mc.fillStyle = '#e0913a'; mc.fillRect(x + 3, y + s * 0.6, s - 6, 2);
        mc.fillStyle = '#c0392b'; mc.fillRect(x + s * 0.5 - 1, y + s * 0.75, 3, 3);
        break;
      }
      case 'fridge': {
        var fy = y - s; // stands a tile taller
        ol(x, fy, s, s * 2);
        mc.fillStyle = '#e6edf3'; mc.fillRect(x, fy, s, s * 2);
        mc.fillStyle = '#c3ccd4'; mc.fillRect(x, fy + s, s, 3);
        mc.fillStyle = '#9aa6b2'; mc.fillRect(x + s * 0.7, fy + s * 0.2, 2, s * 0.5); mc.fillRect(x + s * 0.7, fy + s * 1.2, 2, s * 0.5);
        break;
      }
      case 'vending': {
        var vy = y - s;
        ol(x, vy, s, s * 2);
        mc.fillStyle = '#c1121f'; mc.fillRect(x, vy, s, s * 2);
        mc.fillStyle = '#0b1422'; mc.fillRect(x + 2, vy + 2, s - 6, s);
        mc.fillStyle = '#3b82f6'; for (var vr = 0; vr < 3; vr++) { for (var vc = 0; vc < 2; vc++) { mc.fillRect(x + 3 + vc * 4, vy + 3 + vr * 4, 3, 3); } }
        mc.fillStyle = '#1b2430'; mc.fillRect(x + 2, vy + s + 4, s - 6, 4);
        break;
      }
      case 'coffeeM': {
        ol(x, y, s, s);
        mc.fillStyle = '#5a4636'; mc.fillRect(x, y, s, s);                              // wood counter
        var cyy = y - s * 0.7;
        mc.fillStyle = '#d2d8df'; mc.fillRect(x + 1, cyy, s - 2, s);                    // steel machine body
        mc.fillStyle = '#aeb6bf'; mc.fillRect(x + 1, cyy, s - 2, 3);
        mc.fillStyle = '#0b1422'; mc.fillRect(x + 3, cyy + 3, s - 8, 4);                // display
        mc.fillStyle = '#22d3ee'; mc.fillRect(x + 4, cyy + 4, 5, 2);
        mc.fillStyle = '#3a2c1c'; mc.fillRect(x + s * 0.35, cyy + s * 0.55, s * 0.3, 4); // group head
        mc.fillStyle = '#6f4a28'; mc.fillRect(x + s * 0.42, y - 3, s * 0.16, 4);        // cup
        break;
      }
      case 'napbed': {
        var bw = f.w * s;
        ol(x, y, bw, s);
        mc.fillStyle = '#6b4a2f'; mc.fillRect(x, y, bw, s);                             // bed frame
        mc.fillStyle = '#8fb0d6'; mc.fillRect(x + 2, y + 2, bw - 4, s - 4);             // blanket
        mc.fillStyle = '#eef2f7'; mc.fillRect(x + 2, y + 2, s * 0.55, s - 4);           // pillow
        break;
      }
      case 'coffeestand': {
        ol(x, y, s, s);
        mc.fillStyle = '#7a5230'; mc.fillRect(x, y, s, s);                              // small coffee table
        mc.fillStyle = '#8a6038'; mc.fillRect(x, y, s, 3);
        var myy = y - s * 0.75;
        mc.fillStyle = '#e2e8f0'; mc.fillRect(x + 2, myy, s - 4, s);                    // espresso machine body
        mc.fillStyle = '#9aa6b2'; mc.fillRect(x + 2, myy, s - 4, 3);
        mc.fillStyle = '#0b1422'; mc.fillRect(x + 4, myy + 4, s - 9, 4);                // display
        mc.fillStyle = '#22d3ee'; mc.fillRect(x + 5, myy + 5, 5, 2);
        mc.fillStyle = '#3a2c1c'; mc.fillRect(x + s * 0.4, myy + s * 0.62, s * 0.22, 4); // spout
        mc.fillStyle = '#caa46a'; mc.fillRect(x + s * 0.42, y - 2, s * 0.16, 3);        // coffee cup
        break;
      }
    }
  }

  // ═══ CHARACTER RENDERER ═══
  function drawCharacter(agent) {
    var px = Math.floor(agent.x), py = Math.floor(agent.y);
    var bob = agent.walking ? Math.sin(agent.frameTimer * 8) * 1.2 : Math.sin(frameCount * 0.03 + agent.id.charCodeAt(0)) * 0.4;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(px, py + 9, 7, 2.5, 0, 0, Math.PI * 2); ctx.fill();

    // MetroCity sprite (fallback to a simple block until sprites load)
    var pal = (agent.palOverride != null) ? agent.palOverride : agentPalette(agent.id);
    if (/lucy/i.test(agent.name || '')) { var _clio = agents.find(function(a){ return /clio/i.test(a.name || ''); }); pal = _clio ? agentPalette(_clio.id) : 2; }
    var dirRow = (DIR_ROW[agent.dir] != null) ? DIR_ROW[agent.dir] : 0;
    var flip = (agent.dir === DIR.LEFT);
    var col = (agent.state === STATE.TYPE) ? TYPE_FRAMES[agent.frame % 2]
            : (agent.walking ? WALK_FRAMES[agent.frame % 4] : 0);
    var cimg = SPR['char' + pal];
    if (inMissionControl(agent) && !agent.walking) { col = 0; dirRow = DIR_ROW[DIR.UP]; flip = false; } // stand facing the board
    var dw = 22, dh = 44, dx = px - dw / 2, dy = py + 9 + bob - dh;
    if (sprReady && cimg && cimg.complete && cimg.width) {
      var sx = col * CFW, sy = dirRow * CFH;
      if (flip) { ctx.save(); ctx.translate(dx + dw, 0); ctx.scale(-1, 1); ctx.drawImage(cimg, sx, sy, CFW, CFH, 0, dy, dw, dh); ctx.restore(); }
      else ctx.drawImage(cimg, sx, sy, CFW, CFH, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = agent.color || '#6b7a99'; ctx.fillRect(px - 5, py - 6 + bob, 10, 14);
      ctx.fillStyle = agent.skin || '#f3cda3'; ctx.fillRect(px - 4, py - 14 + bob, 8, 7);
    }
    // Smoking visual — cigarette + rising smoke when idling in the smoking area
    if (agent.idleArea === 'smoking' && agent.state === STATE.IDLE) {
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(px + 6, py - 6 + bob, 3, 1);
      ctx.fillStyle = '#ff7a3c'; ctx.fillRect(px + 9, py - 6 + bob, 1, 1);
      var sm = (frameCount * 0.5 + Math.abs(px)) % 18;
      ctx.fillStyle = 'rgba(210,210,210,' + Math.max(0, 0.5 - sm / 36) + ')';
      ctx.fillRect(px + 9, Math.floor(py - 8 - sm * 0.6 + bob), 2, 2);
    }

    // Status orb (above head). Green "working" only if the agent logged real activity
    // recently (liveAgents); a merely-assigned agent between work bursts shows amber.
    var orbLive = liveAgents[(agent.name || '').toLowerCase()];
    var sc = (agent.isBlocked || agent.officeState === 'blocked') ? '#ef4444'
           : orbLive ? '#3b82f6'
           : (agent.officeState === 'working' || agent.officeState === 'reviewing' || agent.officeState === 'meeting') ? '#22c55e'
           : '#eab308';
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(px, py - 40 + bob, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(px - 1, py - 41 + bob, 1.2, 0, Math.PI * 2); ctx.fill();

    // Food/coffee/drink held while on a cafeteria break
    if (agent.breakProp && (agent.onBreak || agent.sleeping)) { ctx.textAlign = 'center'; ctx.font = '9px serif'; ctx.fillText(agent.breakProp, px + 6, py - 3 + bob); }

    // Celebration / Blocked markers
    if (agent.celebrationTimer > 0) {
      ctx.globalAlpha = Math.min(1, agent.celebrationTimer);
      ctx.fillStyle = '#f59e0b'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
      ctx.fillText('★ DONE!', px, py - 46 + bob); ctx.globalAlpha = 1;
    }
    if (agent.isBlocked) {
      ctx.fillStyle = '#ef4444'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText('!', px + 9, py - 40 + bob);
    }

    // Name + Role label (under feet)
    var roleText = agent.title || agent.role || '';
    if (roleText.length > 20) roleText = roleText.substring(0, 18) + '…';
    ctx.font = 'bold 7px monospace';
    var nameW = ctx.measureText(agent.name).width + 6;
    ctx.font = '6px monospace';
    var roleW = ctx.measureText(roleText).width + 6;
    var labelW = Math.max(nameW, roleW);
    var labelX = px - labelW / 2, labelY = py + 11 + bob;
    ctx.fillStyle = 'rgba(13,17,23,0.85)';
    ctx.beginPath(); ctx.roundRect(labelX, labelY, labelW, roleText ? 18 : 9, 3); ctx.fill();
    ctx.font = 'bold 7px monospace'; ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    ctx.fillText(agent.name, px, labelY + 8);
    if (roleText) { ctx.font = '6px monospace'; ctx.fillStyle = '#94a3b8'; ctx.fillText(roleText, px, labelY + 16); }

    // Speech bubble
    if (agent.speechBubble) drawSpeechBubble(px, py - 48 + bob, agent.speechBubble.text, agent.speechBubble.type || 'normal');
  }

  function drawSpeechBubble(cx, cy, text, type) {
    var maxW = 100, pad = 4;
    ctx.font = '7px monospace';
    var words = text.split(' '), lines = [], cur = '';
    words.forEach(function(w) {
      var test = cur ? cur + ' ' + w : w;
      if (ctx.measureText(test).width > maxW - pad * 2) { if (cur) lines.push(cur); cur = w; } else cur = test;
    });
    if (cur) lines.push(cur);
    var lh = 10;
    var bw = Math.min(maxW, Math.max.apply(null, lines.map(function(l) { return ctx.measureText(l).width; })) + pad * 2);
    var bh = lines.length * lh + pad * 2;
    var bx = cx - bw / 2, by = cy - bh - 4;

    ctx.fillStyle = 'rgba(13,17,23,0.9)';
    ctx.strokeStyle = type === 'blocked' ? '#ef4444' : '#3b82f6';
    ctx.lineWidth = 1;
    var r = 4;
    ctx.beginPath();
    ctx.moveTo(bx + r, by); ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(bx + r, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(13,17,23,0.9)';
    ctx.beginPath(); ctx.moveTo(cx - 3, by + bh); ctx.lineTo(cx, by + bh + 5); ctx.lineTo(cx + 3, by + bh); ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center';
    lines.forEach(function(l, i) { ctx.fillText(l, cx, by + pad + 7 + i * lh); });
  }

  function drawParticles() {
    particles.forEach(function(p) {
      ctx.globalAlpha = Math.max(0, p.life / 60);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  // ═══ LIVE ROOM RENDERERS (drawn each frame in world coords) ═══
  var standupSec = 312;
  function drawWallOfWork(t) {
    var bx = 24 * TILE_SIZE, by = 1 * TILE_SIZE, bw = 22 * TILE_SIZE, bh = 1.4 * TILE_SIZE;
    ctx.fillStyle = '#1b2430'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#3a4a5a'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#e2e8f0'; ctx.textAlign = 'center'; ctx.font = 'bold 8px monospace';
    ctx.fillText('WALL OF WORK', bx + bw / 2, by + 9);
    var cols = ['#64748b', '#3b82f6', '#eab308', '#22c55e'];
    for (var i = 0; i < 18; i++) { ctx.fillStyle = cols[(i + (t | 0)) % 4]; ctx.fillRect(bx + 8 + i * (bw - 16) / 18, by + 13, (bw - 16) / 22, bh - 18); }
  }
  function drawMissionControl(t) {
    var zx = 48, zy = 3, zw = 21;
    var bx = (zx + 2) * TILE_SIZE, by = (zy + 1) * TILE_SIZE, bw = 16 * TILE_SIZE, bh = 5 * TILE_SIZE;
    ctx.fillStyle = '#0b1422'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#2f6ea0'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    for (var b = 0; b < 12; b++) { var hh = (Math.sin(t * 1.5 + b) * 0.5 + 0.5) * bh * 0.5 + 4; ctx.fillStyle = ['#22d3ee', '#34d399', '#f59e0b'][b % 3]; ctx.fillRect(bx + 8 + b * (bw * 0.045), by + bh - hh - 6, bw * 0.028, hh); }
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.beginPath();
    for (var p = 0; p <= 24; p++) { var qx = bx + bw * 0.55 + p * (bw * 0.017), qy = by + bh * 0.45 + Math.sin(t * 2 + p * 0.5) * bh * 0.16; p ? ctx.lineTo(qx, qy) : ctx.moveTo(qx, qy); }
    ctx.stroke();
    ctx.fillStyle = '#bfe6ff'; ctx.textAlign = 'left'; ctx.font = 'bold 7px monospace'; ctx.fillText('● LIVE OPS', bx + 6, by + 12);
    // ── meeting clocks integrated into the LIVE OPS big display ──
    var nowTxt = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false });
    var ah; if (allHandsActive) ah = '● LIVE'; else { var ms = Math.max(0, nextAllHandsMs - Date.now()); ah = ('0' + Math.floor(ms / 60000)).slice(-2) + ':' + ('0' + (Math.floor(ms / 1000) % 60)).slice(-2); }
    var sm = msToNext7amET(), sh = Math.floor(sm / 3600000), smi = Math.floor(sm / 60000) % 60;
    var mcClocks = [['NOW ET', nowTxt, '#e2e8f0'], ['MEETING', ah, allHandsActive ? '#34d399' : '#fbbf24'], ['STANDUP', sh + 'h' + ('0' + smi).slice(-2), '#a5b4fc']];
    ctx.textAlign = 'center';
    mcClocks.forEach(function(c, i) {
      var cxp = bx + bw * (0.42 + i * 0.20);
      ctx.fillStyle = '#7d8794'; ctx.font = '6px monospace'; ctx.fillText(c[0], cxp, by + 9);
      ctx.fillStyle = c[2]; ctx.font = 'bold 9px monospace'; ctx.fillText(c[1], cxp, by + 20);
    });
    ctx.textAlign = 'left';
    var ccx = (zx + zw / 2) * TILE_SIZE, ccy = (zy + 11) * TILE_SIZE, rw = 7 * TILE_SIZE;
    ctx.fillStyle = '#1d2733'; ctx.beginPath(); ctx.ellipse(ccx, ccy, rw, 2.6 * TILE_SIZE, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2b3a4a'; ctx.beginPath(); ctx.ellipse(ccx, ccy - 4, rw * 0.9, 2.1 * TILE_SIZE, 0, Math.PI, 0); ctx.fill();
    for (var mI = 0; mI < 5; mI++) { var a = Math.PI * (0.18 + mI * 0.16), sxp = ccx + Math.cos(a) * rw * 0.78, syp = ccy - Math.sin(a) * 2 * TILE_SIZE - 6; ctx.fillStyle = '#0b1422'; ctx.fillRect(sxp - 7, syp - 10, 14, 10); ctx.fillStyle = ['#22d3ee', '#34d399', '#f59e0b', '#22d3ee', '#a855f7'][mI]; ctx.fillRect(sxp - 5, syp - 8, 10, 6); }
  }
  // Cubicle partitions around each focus desk so it feels like a private closed station.
  function drawFocusCubicles() {
    ctx.fillStyle = 'rgba(120,150,180,0.30)';
    for (var fr = 0; fr < 3; fr++) {
      for (var fc = 0; fc < 7; fc++) {
        var ax = 36 + fc * 5, ay = 21 + fr * 3;
        var x0 = ax * TILE_SIZE, y0 = ay * TILE_SIZE, w = 3 * TILE_SIZE, hh = 2 * TILE_SIZE, t = 3;
        ctx.fillRect(x0 - t, y0 - t, w + 2 * t, t);  // back wall
        ctx.fillRect(x0 - t, y0 - t, t, hh + t);     // left wall
        ctx.fillRect(x0 + w, y0 - t, t, hh + t);     // right wall
      }
    }
  }
  function msToNext7amET() {
    var p = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour12: false, hour: '2-digit', minute: '2-digit' }).split(':');
    var mins = (+p[0]) * 60 + (+p[1]);
    var diff = 7 * 60 - mins; if (diff <= 0) diff += 24 * 60;
    return diff * 60000;
  }
  // Meetings display — the big command-center screen in Mission Control.
  function drawStandup(dt) {
    var bx = 49 * TILE_SIZE, by = 3.5 * TILE_SIZE, bw = 19 * TILE_SIZE, bh = 3 * TILE_SIZE;
    ctx.fillStyle = '#0a0f16'; ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 2; ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(34,211,238,0.25)'; ctx.lineWidth = 1; ctx.strokeRect(bx + 3, by + 3, bw - 6, bh - 6);
    ctx.textAlign = 'left'; ctx.fillStyle = '#22d3ee'; ctx.font = 'bold 7px monospace';
    ctx.fillText('📋 MEETINGS', bx + 7, by + 11);
    var nowTxt = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Toronto', hour: '2-digit', minute: '2-digit', hour12: false });
    var ah;
    if (allHandsActive) ah = '● LIVE';
    else { var ms = Math.max(0, nextAllHandsMs - Date.now()); ah = ('0' + Math.floor(ms / 60000)).slice(-2) + ':' + ('0' + (Math.floor(ms / 1000) % 60)).slice(-2); }
    var sm = msToNext7amET(), sh = Math.floor(sm / 3600000), smi = Math.floor(sm / 60000) % 60;
    var cols = [
      { l: 'NOW (ET)', v: nowTxt, c: '#e2e8f0' },
      { l: 'ALL-HANDS', v: ah, c: allHandsActive ? '#34d399' : '#fbbf24' },
      { l: 'STANDUP', v: sh + 'h' + ('0' + smi).slice(-2), c: '#a5b4fc' }
    ];
    var colW = (bw - 14) / 3;
    ctx.textAlign = 'center';
    cols.forEach(function(c, i) {
      var cxp = bx + 7 + colW * (i + 0.5);
      ctx.fillStyle = '#7d8794'; ctx.font = '6px monospace'; ctx.fillText(c.l, cxp, by + 30);
      ctx.fillStyle = c.c; ctx.font = 'bold 11px monospace'; ctx.fillText(c.v, cxp, by + 46);
    });
    ctx.textAlign = 'left';
  }

  // ═══ RENDER LOOP ═══
  function renderLoop(ts) {
    animId = requestAnimationFrame(renderLoop);
    frameCount++;
    if (!canvas || !ctx) return;
    var dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.1) : 0.016;
    lastTime = ts;
    var cw = canvas.clientWidth || window.innerWidth, ch = canvas.clientHeight || window.innerHeight;
    computeLayout(cw, ch);

    if (frameCount % 6 === 0) updateAgents(dt * 6);

    if (focus) {
      var fa = agents.find(function(x) { return x.id === focus.id; });
      if (!fa) { focus = null; }
      else {
        focus.t += dt;
        var FZ = Math.min(2.4, Math.max(1.7, focus.saved.zoom * 1.8));
        var ftx = (MAP_W / 2 - fa.x) * FZ, fty = (MAP_H / 2 - fa.y) * FZ;
        var IN = 0.4, HOLD = 0.9, OUT = 0.45, T = focus.t;
        var ez = function(k) { k = k < 0 ? 0 : k > 1 ? 1 : k; return k * k * (3 - 2 * k); };
        if (T < IN) { var k = ez(T / IN); cam.x = focus.saved.x + (ftx - focus.saved.x) * k; cam.y = focus.saved.y + (fty - focus.saved.y) * k; cam.zoom = focus.saved.zoom + (FZ - focus.saved.zoom) * k; }
        else if (T < IN + HOLD) { cam.x = ftx; cam.y = fty; cam.zoom = FZ; }
        else if (T < IN + HOLD + OUT) { var k2 = ez((T - IN - HOLD) / OUT); cam.x = ftx + (focus.saved.x - ftx) * k2; cam.y = fty + (focus.saved.y - fty) * k2; cam.zoom = FZ + (focus.saved.zoom - FZ) * k2; }
        else { cam.x = focus.saved.x; cam.y = focus.saved.y; cam.zoom = focus.saved.zoom; focus = null; }
        clampCam();
      }
    }

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    var off = mapOffset();

    ctx.save();
    ctx.beginPath(); ctx.rect(frame.x, frame.y, frame.w, frame.h); ctx.clip();  // map stays inside the frame
    ctx.translate(off.x, off.y);
    ctx.scale(cam.zoom, cam.zoom);
    if (mapCache) ctx.drawImage(mapCache, 0, 0);
    drawFocusCubicles();
    drawWallOfWork(ts / 1000);
    drawMissionControl(ts / 1000);
    var sorted = agents.slice().sort(function(a, b) { return a.y - b.y; });
    sorted.forEach(function(a) { drawCharacter(a); });
    if (focus) {
      var ff = agents.find(function(x) { return x.id === focus.id; });
      if (ff) {
        var fbob = Math.sin(ts / 120) * 3;
        ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ff.x, ff.y, 13 + (Math.sin(ts / 150) + 1) * 3, 0, Math.PI * 2); ctx.stroke();
        var axx = ff.x, ayy = ff.y - 34 + fbob;
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath(); ctx.moveTo(axx - 5, ayy - 8); ctx.lineTo(axx + 5, ayy - 8); ctx.lineTo(axx, ayy); ctx.closePath(); ctx.fill();
        ctx.fillRect(axx - 2, ayy - 16, 4, 8);
      }
    }
    drawParticles();
    ctx.restore();

    drawOverlay(cw, ch);
  }

  // ═══ OVERLAY ═══
  var liveAgents = {};
  function drawOverlay(cw, ch) {
    // ── Left info column: stats + legend + agent statuses + buttons ──
    function _st(a) {
      if (a.isBlocked || a.officeState === 'blocked') return 'blocked';
      if (liveAgents[(a.name || '').toLowerCase()]) return 'live';
      if (a.officeState === 'working' || a.officeState === 'reviewing' || a.officeState === 'meeting') return 'working';
      return 'idle';
    }
    var COL = { live: '#3b82f6', working: '#22c55e', idle: '#eab308', blocked: '#ef4444' };
    ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, SB_W, ch);
    ctx.strokeStyle = '#1e2d3d'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(SB_W + 0.5, 0); ctx.lineTo(SB_W + 0.5, ch); ctx.stroke();

    var pad = 12, y = 20;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 11px monospace';
    ctx.fillText('🏢 OFFICE', pad, y); y += 18;

    var cnt = { live: 0, working: 0, idle: 0, blocked: 0 };
    agents.forEach(function(a) { cnt[_st(a)]++; });
    ctx.font = '9px monospace';
    [['live', 'Live'], ['working', 'Working'], ['idle', 'Idle'], ['blocked', 'Blocked']].forEach(function(s) {
      ctx.fillStyle = COL[s[0]]; ctx.beginPath(); ctx.arc(pad + 3, y - 3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#cbd5e1'; ctx.fillText(s[1] + ': ' + cnt[s[0]], pad + 12, y); y += 14;
    });
    y += 6;

    // Controls — kept near the TOP so they're always visible regardless of window height
    var bw = SB_W - 2 * pad, bx = pad;
    function _btn(label, yy, stroke, fill) {
      ctx.fillStyle = 'rgba(13,17,23,0.95)'; ctx.fillRect(bx, yy, bw, 20);
      ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.strokeRect(bx, yy, bw, 20);
      ctx.fillStyle = fill; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, bx + bw / 2, yy + 14); ctx.textAlign = 'left';
      return { x: bx, y: yy, w: bw, h: 20 };
    }
    officeBtns.recenter = _btn('⌖ Recenter', y, '#3b82f6', '#e2e8f0'); y += 24;
    officeBtns.zoom = _btn('🔍 ' + Math.round(cam.zoom * 100) + '%', y, '#1e2d3d', '#94a3b8'); y += 24;
    officeBtns.exit = _btn('✕ Exit Office', y, '#ef4444', '#ef4444'); y += 28;

    ctx.strokeStyle = '#1e2d3d'; ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(SB_W - pad, y); ctx.stroke(); y += 12;
    ctx.fillStyle = '#64748b'; ctx.font = '7px monospace'; ctx.fillText('TEAM', pad, y); y += 6;

    // Agent roster — grouped by team, avatar + name + role, scrollable (wheel over the column)
    var listTop = y, listBottom = ch - 6, viewH = listBottom - listTop;
    var teamOrder = ['Leadership', 'Project', 'Research', 'Finance', 'Security', 'Operations'];
    var roster = agents.slice().sort(function(a, b) {
      var ta = teamOrder.indexOf(a.team); ta = ta < 0 ? 99 : ta;
      var tb = teamOrder.indexOf(b.team); tb = tb < 0 ? 99 : tb;
      return ta - tb || (a.name || '').localeCompare(b.name || '');
    });
    function activeTix(a) {
      return (a.tickets || []).filter(function(t) { return t && t.status && t.status !== 'done'; }).slice(0, 4);
    }
    var HROW = 15, CARD_BASE = 36, TIX_H = 13, PAD_B = 7;
    var rows = [], lastTeam = null;
    roster.forEach(function(a) {
      if (a.team !== lastTeam) { rows.push({ h: a.team || 'Team', hh: HROW }); lastTeam = a.team; }
      var tix = activeTix(a);
      rows.push({ a: a, tix: tix, hh: CARD_BASE + tix.length * TIX_H + PAD_B });
    });
    var totalH = rows.reduce(function(s, r) { return s + r.hh; }, 0);
    var maxScroll = Math.max(0, totalH - viewH);
    sbScroll = Math.max(0, Math.min(maxScroll, sbScroll));
    sbHits = [];
    ctx.save();
    ctx.beginPath(); ctx.rect(0, listTop - 2, SB_W, viewH + 4); ctx.clip();
    var yy = listTop - sbScroll;
    rows.forEach(function(r) {
      var visible = (yy + r.hh >= listTop - 2 && yy <= listBottom);
      if (r.h) {
        if (visible) {
          ctx.fillStyle = TEAM_COLORS[r.h] || '#64748b';
          ctx.font = 'bold 8px monospace'; ctx.textAlign = 'left';
          ctx.fillText(r.h.toUpperCase(), pad, yy + 9);
        }
      } else if (visible) {
        var a = r.a, st = _st(a);
        // button-style card box
        var bx0 = pad - 5, bw0 = SB_W - 2 * (pad - 5), by0 = yy, bh0 = r.hh - 6;
        ctx.fillStyle = 'rgba(30,41,59,0.55)'; ctx.strokeStyle = '#2b3a4a'; ctx.lineWidth = 1;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(bx0, by0, bw0, bh0, 6); ctx.fill(); ctx.stroke(); }
        else { ctx.fillRect(bx0, by0, bw0, bh0); ctx.strokeRect(bx0, by0, bw0, bh0); }
        ctx.fillStyle = COL[st]; ctx.fillRect(bx0, by0 + 4, 3, bh0 - 8);  // status accent stripe
        ctx.textAlign = 'left'; ctx.font = '17px serif';
        ctx.fillText(ofEmoji(a.name), pad + 2, yy + 23);
        ctx.fillStyle = '#e2e8f0'; ctx.font = 'bold 10px monospace';
        ctx.fillText((a.name || '').slice(0, 14), pad + 26, yy + 16);
        ctx.fillStyle = '#94a3b8'; ctx.font = '8px monospace';
        ctx.fillText((a.title || a.team || '').slice(0, 19), pad + 26, yy + 28);
        ctx.fillStyle = COL[st]; ctx.beginPath(); ctx.arc(bx0 + bw0 - 9, yy + 16, 4, 0, Math.PI * 2); ctx.fill();
        var ty = yy + CARD_BASE;
        r.tix.forEach(function(t) {
          ctx.fillStyle = COL[st]; ctx.font = '9px monospace'; ctx.fillText('•', pad + 9, ty + 8);
          ctx.fillStyle = '#9fb4cc'; ctx.font = '8px monospace';
          ctx.fillText((t.id + ' ' + (t.title || '')).slice(0, 26), pad + 19, ty + 8);
          ty += TIX_H;
        });
        sbHits.push({ x: bx0, y: by0, w: bw0, h: bh0, id: a.id });  // click card → spotlight on map
      }
      yy += r.hh;
    });
    ctx.restore();
    if (maxScroll > 0 && sbScroll < maxScroll - 1) {
      ctx.fillStyle = '#475569'; ctx.font = '7px monospace'; ctx.textAlign = 'center';
      ctx.fillText('▾', SB_W / 2, listBottom + 2);
    }

    // ── Map frame border ──
    ctx.strokeStyle = '#2b3a4a'; ctx.lineWidth = 2;
    ctx.strokeRect(frame.x - 1, frame.y - 1, frame.w + 2, frame.h + 2);

    // ── All-hands banner (centered over the frame) ──
    if (allHandsActive) {
      var bnW = 220, bnH = 28, bnX = frame.x + frame.w / 2 - bnW / 2, bnY = frame.y + 8;
      ctx.fillStyle = 'rgba(59,130,246,0.92)'; ctx.fillRect(bnX, bnY, bnW, bnH);
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1; ctx.strokeRect(bnX, bnY, bnW, bnH);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('📢 GENERAL MEETING', bnX + bnW / 2, bnY + 12);
      ctx.font = '8px monospace'; ctx.fillStyle = '#dbeafe';
      ctx.fillText('All agents in conference room', bnX + bnW / 2, bnY + 23);
      ctx.textAlign = 'left';
    }

    // ── Minimap (bottom-right inside the frame) ──
    var mmW = 120, mmH = 70, mmX = frame.x + frame.w - mmW - 8, mmY = frame.y + frame.h - mmH - 8;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#1e2d3d'; ctx.lineWidth = 1; ctx.strokeRect(mmX, mmY, mmW, mmH);
    var sx = mmW / MAP_W, sy = mmH / MAP_H;
    agents.forEach(function(a) {
      ctx.fillStyle = COL[_st(a)];
      ctx.fillRect(mmX + a.x * sx - 1, mmY + a.y * sy - 1, 2, 2);
    });
  }

  // ═══ CAMERA ═══
  function clampCam() {
    // cam.x/y are SCREEN-pixel pan offsets (the render adds them straight to the centered map
    // origin). Allow panning until any edge reaches the screen edge, + a margin, so every corner
    // is reachable at any zoom.
    var mapW = MAP_W * cam.zoom, mapH = MAP_H * cam.zoom;
    var m = 60;
    var maxX = Math.abs(mapW - frame.w) / 2 + m;
    var maxY = Math.abs(mapH - frame.h) / 2 + m;
    cam.x = Math.max(-maxX, Math.min(maxX, cam.x));
    cam.y = Math.max(-maxY, Math.min(maxY, cam.y));
  }

  function recenterCamera() { cam.x = 0; cam.y = 0; clampCam(); }

  function initCamera() {
    computeLayout(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight);
    cam.zoom = Math.min(frame.w / MAP_W, frame.h / MAP_H) * 0.95;
    cam.x = 0; cam.y = 0;
    clampCam();
  }

  // ═══ UI BUTTONS ═══
  function officeHandleClick(mx, my) {
    var eb = officeBtns.exit;
    if (eb && mx >= eb.x && mx <= eb.x + eb.w && my >= eb.y && my <= eb.y + eb.h) {
      if (typeof goView === 'function') goView('kanban');
      return true;
    }
    var rb = officeBtns.recenter;
    if (rb && mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) {
      recenterCamera(); return true;
    }
    var zb = officeBtns.zoom;
    if (zb && mx >= zb.x && mx <= zb.x + zb.w && my >= zb.y && my <= zb.y + zb.h) {
      var levels = [0.5, 0.75, 1.0, 1.5, 2.0], idx = 0;
      for (var i = 0; i < levels.length; i++) if (Math.abs(cam.zoom - levels[i]) < 0.05) idx = i;
      cam.zoom = levels[(idx + 1) % levels.length];
      recenterCamera(); return true;
    }
    return false;
  }

  // ═══ INPUT ═══
  function setupInputHandlers() {
    canvas.addEventListener('mousedown', function(e) {
      camDragging = true;
      camDragStart = { x: e.clientX, y: e.clientY };
      camDragCamStart = { x: cam.x, y: cam.y };
      canvas.style.cursor = 'grabbing';
    });
    window.addEventListener('mousemove', function(e) {
      if (!camDragging) return;
      // cam is in screen px → 1:1 with the cursor (grab-and-drag the map)
      cam.x = camDragCamStart.x + (e.clientX - camDragStart.x);
      cam.y = camDragCamStart.y + (e.clientY - camDragStart.y);
      clampCam();
    });
    window.addEventListener('mouseup', function() { camDragging = false; canvas.style.cursor = 'grab'; });
    // WASD / arrow-key panning (only while the Office tab is active)
    if (!window._officeKeysBound) {
      window._officeKeysBound = true;
      window.addEventListener('keydown', function(e) {
        if (typeof CV === 'undefined' || CV !== 'office') return;
        var step = 70, k = (e.key || '').toLowerCase();
        if (k === 'w' || e.key === 'ArrowUp') cam.y += step;
        else if (k === 's' || e.key === 'ArrowDown') cam.y -= step;
        else if (k === 'a' || e.key === 'ArrowLeft') cam.x += step;
        else if (k === 'd' || e.key === 'ArrowRight') cam.x -= step;
        else return;
        e.preventDefault();
        clampCam();
      });
    }
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (mx < SB_W) { sbScroll += (e.deltaY > 0 ? 26 : -26); if (sbScroll < 0) sbScroll = 0; return; }  // scroll roster, not map
      var oz = cam.zoom;
      var nz = Math.max(0.3, Math.min(3, oz * (e.deltaY > 0 ? 0.9 : 1.1)));
      var off = mapOffset();                                 // map origin before zoom
      var wx = (mx - off.x) / oz, wy = (my - off.y) / oz;    // world point under the cursor
      cam.zoom = nz;
      // keep that same world point under the cursor after zooming
      cam.x = mx - wx * nz - frame.x - (frame.w - MAP_W * nz) / 2;
      cam.y = my - wy * nz - frame.y - (frame.h - MAP_H * nz) / 2;
      clampCam();
    }, { passive: false });
    canvas.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        camDragging = true;
        camDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        camDragCamStart = { x: cam.x, y: cam.y };
      } else if (e.touches.length === 2) {
        camDragging = false;
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
    }, { passive: true });
    canvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
      if (e.touches.length === 1 && camDragging) {
        cam.x = camDragCamStart.x + (e.touches[0].clientX - camDragStart.x);
        cam.y = camDragCamStart.y + (e.touches[0].clientY - camDragStart.y);
        clampCam();
      } else if (e.touches.length === 2) {
        var nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist > 0) cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * (nd / pinchDist)));
        pinchDist = nd; clampCam();
      }
    }, { passive: false });
    canvas.addEventListener('touchend', function() { camDragging = false; pinchDist = 0; }, { passive: true });
    canvas.addEventListener('click', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      if (typeof officeHandleClick === 'function' && officeHandleClick(mx, my)) return;
      if (mx < SB_W) {
        for (var s = sbHits.length - 1; s >= 0; s--) {
          var hh = sbHits[s];
          if (mx >= hh.x && mx <= hh.x + hh.w && my >= hh.y && my <= hh.y + hh.h) { focusOnAgent(hh.id); return; }
        }
        return;  // clicks in the sidebar never select map agents
      }
      var off = mapOffset(); var wx = (mx - off.x) / cam.zoom, wy = (my - off.y) / cam.zoom;
      for (var i = agents.length - 1; i >= 0; i--) {
        var a = agents[i];
        if (Math.abs(wx - a.x) < 12 && Math.abs(wy - a.y) < 18) {
          if (typeof openAD === 'function') openAD(a.id);
          return;
        }
      }
    });
    window.addEventListener('resize', resizeCanvas);
    canvas.style.cursor = 'grab';
  }

  function resizeCanvas() {
    // size to the ACTUAL visible container (office-view = 100dvh), not window.innerHeight —
    // otherwise the canvas overflows its container and the bottom of the sidebar gets clipped.
    var w = canvas.clientWidth || window.innerWidth;
    var h = canvas.clientHeight || window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ═══ PUBLIC API ═══
  function officeInit(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    resizeCanvas();
    buildTileMap();
    buildFurniture();
    applyObstacles();
    buildMapCache();
    setupInputHandlers();
    preloadSprites(function() { buildMapCache(); }); // rebuild with MetroCity furniture once loaded
    requestAnimationFrame(function() { initCamera(); resizeCanvas(); });
    if (!animId) animId = requestAnimationFrame(renderLoop);
  }

  function officeDestroy() {
    if (animId) { cancelAnimationFrame(animId); animId = null; }
    agents = []; bubbles = []; particles = [];
  }

  function officeRefresh(data) {
    officeData = data; updateAgentStates();
    fetch('agent-logs.json?t=' + Date.now()).then(function(r) { return r.json(); }).then(function(l) {
      liveAgents = {};
      (l && l.active || []).forEach(function(a) { liveAgents[(a.agent || '').toLowerCase()] = true; });
    }).catch(function() {});
  }

  return { init: officeInit, destroy: officeDestroy, refresh: officeRefresh };
})();

function officeInit(canvasEl) { Office.init(canvasEl); }
function officeDestroy() { Office.destroy(); }
function officeRefresh(data) { Office.refresh(data); }
