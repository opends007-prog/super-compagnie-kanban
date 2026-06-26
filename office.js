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
    { x: 50, y: 37, w: 9, h: 7 },   // recreation
    { x: 50, y: 20, w: 18, h: 10 }, // focus
    { x: 36, y: 21, w: 10, h: 8 }   // standup
  ];
  function randomBreakRoom() { var a = BREAK_ROOMS[(Math.random() * BREAK_ROOMS.length) | 0]; return getRandomTileInArea(a.x, a.y, a.w, a.h) || { x: a.x + 1, y: a.y + 1 }; }

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
      if (ceoMode !== 'smoking' && ceoSmoke <= 0) { ceoMode = 'smoking'; ceoModeT = 60; ceoSmoke = 1200; }
      if (ceoMode === 'smoking') { vipGoto(agent, 64, 41, DIR.DOWN, dt); agent.idleArea = 'smoking'; ceoModeT -= dt; if (ceoModeT <= 0) ceoMode = 'office'; }
      else if (ceoMode === 'mc') { vipGoto(agent, 55, 14, DIR.UP, dt); agent.idleArea = 'mc'; ceoModeT -= dt; if (ceoModeT <= 0) ceoMode = 'office'; }
      else { vipGoto(agent, 10, 8, DIR.DOWN, dt); agent.idleArea = 'ceo'; ceoModeT -= dt; if (ceoModeT <= 0) { if (Math.random() < 0.35) { ceoMode = 'mc'; ceoModeT = 35; } else ceoModeT = 30 + Math.random() * 40; } }
      return;
    }
    // Lucy
    lucyT -= dt;
    var ceo = ceoAgent;
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
  var tileMap = [], furniture = [], seats = {}, mapCache = null;
  var bubbles = [], MAX_BUBBLES = 12, particles = [], officeBtns = {};
  var allHandsActive = false, allHandsTimer = 0, allHandsInterval = 60; // seconds between meetings

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
    { x: 3,  y: 19, w: 30, h: 12, c: 'rgba(240,200,120,0.50)', n: 'TEAM COLLABORATION' },
    { x: 35, y: 19, w: 12, h: 12, c: 'rgba(150,160,172,0.30)', n: 'DAILY STANDUP' },
    { x: 49, y: 19, w: 20, h: 12, c: 'rgba(150,195,225,0.50)', n: 'FOCUS AREA' },
    { x: 3,  y: 34, w: 18, h: 12, c: 'rgba(240,200,120,0.50)', n: 'CAFETERIA' },
    { x: 22, y: 34, w: 14, h: 12, c: 'rgba(180,150,224,0.50)', n: 'LOUNGE' },
    { x: 38, y: 34, w: 9,  h: 12, c: 'rgba(150,160,172,0.30)', n: 'REST' },
    { x: 49, y: 34, w: 11, h: 12, c: 'rgba(150,160,172,0.30)', n: 'RECREATION' },
    { x: 62, y: 34, w: 7,  h: 12, c: 'rgba(110,180,100,0.55)', n: 'SMOKING' }
  ];

  // ═══ FURNITURE ═══
  function buildFurniture() {
    furniture = [];
    seats = {};

    // TEAM COLLABORATION — workstations (amber zone)
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 5; col++) {
        var dx = 5 + col * 6, dy = 21 + row * 3;
        furniture.push({ type: 'desk', x: dx, y: dy, w: 3, h: 1 });
        furniture.push({ type: 'pc', x: dx + 1, y: dy, w: 1, h: 1 });
        furniture.push({ type: 'chair', x: dx + 1, y: dy + 1, w: 1, h: 1 });
        seats['desk_' + row + '_' + col] = { x: dx + 1, y: dy + 1, assigned: false, facing: DIR.UP };
      }
    }

    // FOCUS AREA (blue zone) — desks
    for (var fr = 0; fr < 3; fr++) {
      for (var fc = 0; fc < 4; fc++) {
        var ax = 51 + fc * 5, ay = 21 + fr * 3;
        furniture.push({ type: 'desk', x: ax, y: ay, w: 2, h: 1 });
        furniture.push({ type: 'pc', x: ax, y: ay, w: 1, h: 1 });
        furniture.push({ type: 'chair', x: ax, y: ay + 1, w: 1, h: 1 });
        seats['focus_' + fr + '_' + fc] = { x: ax, y: ay + 1, assigned: false, facing: DIR.UP };
      }
    }

    // CONFERENCE — front whiteboard + audience chairs facing the presenter (UP)
    furniture.push({ type: 'whiteboard', x: 32, y: 3, w: 2, h: 1 });
    furniture.push({ type: 'lpaint', x: 24, y: 3, w: 1, h: 1 });
    furniture.push({ type: 'lpaint', x: 43, y: 3, w: 1, h: 1 });
    for (var crow = 0; crow < 3; crow++) {
      for (var ccol = 0; ccol < 9; ccol++) {
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
    furniture.push({ type: 'coffeeM', x: 6, y: 35, w: 1, h: 1 });
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

    // REST — quiet library: bookshelves + reading tables and chairs
    furniture.push({ type: 'dshelf', x: 38, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'dshelf', x: 40, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'bookshelf', x: 45, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'stable', x: 39, y: 39, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 39, y: 38, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 39, y: 40, w: 1, h: 1 });
    furniture.push({ type: 'stable', x: 43, y: 42, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 43, y: 41, w: 1, h: 1 });
    furniture.push({ type: 'hplant', x: 45, y: 43, w: 1, h: 1 });

    // RECREATION — arcade, wall TV, sofa + chairs (fun room)
    furniture.push({ type: 'arcade', x: 50, y: 37, w: 1, h: 1 });
    furniture.push({ type: 'whiteboard', x: 53, y: 35, w: 1, h: 1 });
    furniture.push({ type: 'sofa', x: 52, y: 40, w: 2, h: 1 });
    furniture.push({ type: 'cchair', x: 51, y: 41, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 55, y: 41, w: 1, h: 1 });
    furniture.push({ type: 'coffeeTable', x: 53, y: 42, w: 1, h: 1 });
    furniture.push({ type: 'bookshelf', x: 58, y: 37, w: 1, h: 1 });

    // DAILY STANDUP — chairs around the central standup table
    furniture.push({ type: 'cchair', x: 38, y: 23, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 44, y: 23, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 38, y: 27, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 44, y: 27, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 41, y: 22, w: 1, h: 1 });
    furniture.push({ type: 'cchair', x: 41, y: 28, w: 1, h: 1 });

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
    return tileMap[row][col] !== TILE.VOID && tileMap[row][col] !== TILE.WALL;
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
        pos = getRandomTileInArea(50, 20, 18, 10) || { x: 56, y: 24 }; // focus area (non-MC)
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
        if (agent.currentTicket && agent.currentTicket.title && Math.random() < 0.5) return agent.currentTicket.title.substring(0, 40);
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
        if (prevStatus !== officeStatus) {
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
          } else if (!allHandsActive && !agent.onBreak) {
            // Occasionally take a short break to a room even while working
            agent.breakTimer -= dt;
            if (agent.breakTimer <= 0) {
              agent.onBreak = true; agent.breakEnd = 45 + Math.random() * 20; agent.breakTimer = 80 + Math.random() * 130;
              var bd = randomBreakRoom();
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
                } else if ((agent.officeState === 'working' || agent.officeState === 'meeting' || agent.officeState === 'reviewing') && !agent.onBreak) {
                  agent.state = STATE.TYPE;
                  agent.frame = 0; agent.frameTimer = 0;
                  agent.dir = (agent.seatId && seats[agent.seatId]) ? seats[agent.seatId].facing : DIR.UP; // face desk/PC
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
                  else if (agent.tileCol >= 35 && agent.tileCol <= 47 && agent.tileRow >= 19 && agent.tileRow <= 31) agent.idleArea = 'standup';
                  else agent.idleArea = 'lounge';
                }
              }
            }
          } else { agent.state = STATE.IDLE; agent.walking = false; }
          break;

        case STATE.IDLE:
          agent.walking = false; agent.frame = 0;
          if (agent.onBreak) { agent.breakEnd -= dt; if (agent.breakEnd <= 0) agent.onBreak = false; }
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
                  case 'standup': area = { x: 36, y: 21, w: 10, h: 8 }; break;
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

      // ═══ ALL-HANDS MEETING SYSTEM ═══
      // Every ~90 seconds, trigger a 30-second general meeting in conference room
      if (!allHandsActive && frameCount % (60 * 600) === 0 && agents.length > 5) {
        allHandsActive = true;
        allHandsTimer = 60; // 1-minute all-hands, every 10 min
        // Assign each agent their OWN conference chair (no clumping)
        var confKeys = Object.keys(seats).filter(function(k) { return k.indexOf('conf_') === 0; });
        var si = 0;
        agents.forEach(function(a) {
          if (a.vip) return; // CEO + Lucy keep their own routine
          var ss = seats[confKeys[si++ % confKeys.length]];
          a.confSeat = ss; a.wasOfficeState = a.officeState;
          var confPath = findPath(a.tileCol, a.tileRow, ss.x, ss.y);
          if (confPath.length > 0) { a.path = confPath; a.state = STATE.WALK; }
          else { a.tileCol = ss.x; a.tileRow = ss.y; a.x = ss.x * TILE_SIZE + TILE_SIZE / 2; a.y = ss.y * TILE_SIZE + TILE_SIZE / 2; a.state = STATE.TYPE; a.dir = DIR.UP; }
        });
      }

      // During all-hands meeting
      if (allHandsActive) {
        allHandsTimer -= dt;
        if (allHandsTimer <= 0) {
          allHandsActive = false;
          // Return all agents to their proper places
          agents.forEach(function(a) {
            if (a.vip) return;
            a.confSeat = null;
            var returnDest = getDestinationForStatus({ officeState: a.wasOfficeState || a.officeState, personality: a.personality, seatId: a.seatId, team: a.team, id: a.id, name: a.name });
            var returnPath = findPath(a.tileCol, a.tileRow, returnDest.x, returnDest.y);
            if (returnPath.length > 0) { a.path = returnPath; a.state = STATE.WALK; }
          });
        }
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

    // Status orb (above head)
    var sc = STATUS_COLORS[agent.officeState] || '#64748b';
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(px, py - 40 + bob, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(px - 1, py - 41 + bob, 1.2, 0, Math.PI * 2); ctx.fill();

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
    var ccx = (zx + zw / 2) * TILE_SIZE, ccy = (zy + 11) * TILE_SIZE, rw = 7 * TILE_SIZE;
    ctx.fillStyle = '#1d2733'; ctx.beginPath(); ctx.ellipse(ccx, ccy, rw, 2.6 * TILE_SIZE, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#2b3a4a'; ctx.beginPath(); ctx.ellipse(ccx, ccy - 4, rw * 0.9, 2.1 * TILE_SIZE, 0, Math.PI, 0); ctx.fill();
    for (var mI = 0; mI < 5; mI++) { var a = Math.PI * (0.18 + mI * 0.16), sxp = ccx + Math.cos(a) * rw * 0.78, syp = ccy - Math.sin(a) * 2 * TILE_SIZE - 6; ctx.fillStyle = '#0b1422'; ctx.fillRect(sxp - 7, syp - 10, 14, 10); ctx.fillStyle = ['#22d3ee', '#34d399', '#f59e0b', '#22d3ee', '#a855f7'][mI]; ctx.fillRect(sxp - 5, syp - 8, 10, 6); }
  }
  function drawStandup(dt) {
    standupSec -= dt; if (standupSec < 0) standupSec = 312;
    var cx = 41 * TILE_SIZE, cy = 25 * TILE_SIZE;
    ctx.fillStyle = 'rgba(240,200,120,0.85)'; ctx.beginPath(); ctx.ellipse(cx, cy, 5 * TILE_SIZE, 3.6 * TILE_SIZE, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#d9a93f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1b2430'; ctx.fillRect(cx - 18, cy - 12, 36, 20);
    ctx.fillStyle = '#0b1422'; ctx.fillRect(cx - 15, cy - 9, 30, 14);
    var mm = ('0' + Math.floor(standupSec / 60)).slice(-2), ss = ('0' + (Math.floor(standupSec) % 60)).slice(-2);
    ctx.fillStyle = '#34d399'; ctx.textAlign = 'center'; ctx.font = 'bold 10px monospace'; ctx.fillText(mm + ':' + ss, cx, cy);
    ctx.fillStyle = '#bfe6ff'; ctx.font = '6px monospace'; ctx.fillText('DAILY STANDUP', cx, cy - 14);
  }

  // ═══ RENDER LOOP ═══
  function renderLoop(ts) {
    animId = requestAnimationFrame(renderLoop);
    frameCount++;
    if (!canvas || !ctx) return;
    var dt = lastTime ? Math.min((ts - lastTime) / 1000, 0.1) : 0.016;
    lastTime = ts;
    var cw = window.innerWidth, ch = window.innerHeight;

    if (frameCount % 6 === 0) updateAgents(dt * 6);

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    var mapW = MAP_W * cam.zoom, mapH = MAP_H * cam.zoom;
    var offX = Math.floor((cw - mapW) / 2) + Math.round(cam.x);
    var offY = Math.floor((ch - mapH) / 2) + Math.round(cam.y);

    ctx.save();
    ctx.translate(offX, offY);
    ctx.scale(cam.zoom, cam.zoom);
    if (mapCache) ctx.drawImage(mapCache, 0, 0);
    drawWallOfWork(ts / 1000);
    drawMissionControl(ts / 1000);
    drawStandup(dt);
    var sorted = agents.slice().sort(function(a, b) { return a.y - b.y; });
    sorted.forEach(function(a) { drawCharacter(a); });
    drawParticles();
    ctx.restore();

    drawOverlay(cw, ch);
  }

  // ═══ OVERLAY ═══
  function drawOverlay(cw, ch) {
    // Exit
    var exX = 10, exY = 10, exW = 100, exH = 26;
    ctx.fillStyle = 'rgba(13,17,23,0.9)';
    ctx.fillRect(exX, exY, exW, exH);
    ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1;
    ctx.strokeRect(exX, exY, exW, exH);
    ctx.fillStyle = '#ef4444';
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('✕ Exit Office', exX + exW / 2, exY + 17);
    officeBtns.exit = { x: exX, y: exY, w: exW, h: exH };

    // Stats
    var working = agents.filter(function(a) { return a.officeState === 'working' || a.officeState === 'reviewing'; }).length;
    var idle = agents.filter(function(a) { return a.officeState === STATE.IDLE; }).length;
    var stX = 10, stY = 42, stW = 120, stH = 46;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(stX, stY, stW, stH);
    ctx.strokeStyle = '#1e2d3d'; ctx.strokeRect(stX, stY, stW, stH);
    ctx.font = 'bold 9px monospace'; ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0'; ctx.fillText('🏢 OFFICE', stX + 6, stY + 12);
    ctx.font = '8px monospace';
    ctx.fillStyle = '#22c55e'; ctx.fillText('● Working: ' + working, stX + 6, stY + 22);
    ctx.fillStyle = '#eab308'; ctx.fillText('● Idle: ' + idle, stX + 6, stY + 32);
    var blocked = agents.filter(function(a) { return a.officeState === 'blocked'; }).length;
    ctx.fillStyle = '#ef4444'; ctx.fillText('● Blocked: ' + blocked, stX + 6, stY + 42);

    // All-hands meeting banner
    if (allHandsActive) {
      var bannerW = 200, bannerH = 28;
      var bannerX = cw / 2 - bannerW / 2, bannerY = 10;
      ctx.fillStyle = 'rgba(59,130,246,0.9)';
      ctx.fillRect(bannerX, bannerY, bannerW, bannerH);
      ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1;
      ctx.strokeRect(bannerX, bannerY, bannerW, bannerH);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
      ctx.fillText('📢 GENERAL MEETING', cw / 2, bannerY + 12);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#dbeafe';
      ctx.fillText('All agents in conference room', cw / 2, bannerY + 23);
    }

    // Recenter
    var rcX = cw - 100, rcY = 10, rcW = 90, rcH = 22;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(rcX, rcY, rcW, rcH);
    ctx.strokeStyle = '#3b82f6'; ctx.strokeRect(rcX, rcY, rcW, rcH);
    ctx.fillStyle = '#e2e8f0'; ctx.font = '9px monospace'; ctx.textAlign = 'center';
    ctx.fillText('⌖ Recenter', rcX + rcW / 2, rcY + 15);
    officeBtns.recenter = { x: rcX, y: rcY, w: rcW, h: rcH };

    // Zoom
    var zX = cw - 100, zY = 38, zW = 90, zH = 22;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(zX, zY, zW, zH);
    ctx.strokeStyle = '#1e2d3d'; ctx.strokeRect(zX, zY, zW, zH);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('🔍 ' + Math.round(cam.zoom * 100) + '%', zX + zW / 2, zY + 15);
    officeBtns.zoom = { x: zX, y: zY, w: zW, h: zH };

    // Legend
    var lgX = 10, lgY = ch - 40;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(lgX, lgY, 90, 32);
    ctx.strokeStyle = '#1e2d3d'; ctx.strokeRect(lgX, lgY, 90, 32);
    ctx.font = '7px monospace'; ctx.textAlign = 'left';
    [{ c: '#22c55e', l: 'Working' }, { c: '#eab308', l: 'Idle' }, { c: '#ef4444', l: 'Blocked' }].forEach(function(it, i) {
      ctx.fillStyle = it.c; ctx.beginPath(); ctx.arc(lgX + 8, lgY + 10 + i * 10, 2.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#94a3b8'; ctx.fillText(it.l, lgX + 14, lgY + 13 + i * 10);
    });

    // Minimap
    var mmW = 140, mmH = 80, mmX = cw - mmW - 10, mmY = ch - mmH - 10;
    ctx.fillStyle = 'rgba(13,17,23,0.85)'; ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#1e2d3d'; ctx.strokeRect(mmX, mmY, mmW, mmH);
    var sx = mmW / MAP_W, sy = mmH / MAP_H;
    agents.forEach(function(a) {
      ctx.fillStyle = STATUS_COLORS[a.officeState] || '#64748b';
      ctx.fillRect(mmX + a.x * sx - 1, mmY + a.y * sy - 1, 2, 2);
    });
  }

  // ═══ CAMERA ═══
  function clampCam() {
    var vw = window.innerWidth / cam.zoom, vh = window.innerHeight / cam.zoom;
    cam.x = Math.max(-MAP_W * 0.3, Math.min(MAP_W * 1.3 - vw, cam.x));
    cam.y = Math.max(-MAP_H * 0.3, Math.min(MAP_H * 1.3 - vh, cam.y));
  }

  function recenterCamera() { cam.x = 0; cam.y = 0; clampCam(); }

  function initCamera() {
    var vw = window.innerWidth, vh = window.innerHeight;
    cam.zoom = Math.min(vw / MAP_W, vh / MAP_H) * 0.9;
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
      cam.x = camDragCamStart.x - (e.clientX - camDragStart.x) / cam.zoom;
      cam.y = camDragCamStart.y - (e.clientY - camDragStart.y) / cam.zoom;
      clampCam();
    });
    window.addEventListener('mouseup', function() { camDragging = false; canvas.style.cursor = 'grab'; });
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var f = e.deltaY > 0 ? 0.9 : 1.1;
      var nz = Math.max(0.3, Math.min(3, cam.zoom * f));
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left, my = e.clientY - rect.top;
      var wx = cam.x + mx / cam.zoom, wy = cam.y + my / cam.zoom;
      cam.zoom = nz;
      cam.x = wx - mx / cam.zoom; cam.y = wy - my / cam.zoom;
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
        cam.x = camDragCamStart.x - (e.touches[0].clientX - camDragStart.x) / cam.zoom;
        cam.y = camDragCamStart.y - (e.touches[0].clientY - camDragStart.y) / cam.zoom;
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
      var wx = cam.x + mx / cam.zoom, wy = cam.y + my / cam.zoom;
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
    var w = window.innerWidth, h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
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

  function officeRefresh(data) { officeData = data; updateAgentStates(); }

  return { init: officeInit, destroy: officeDestroy, refresh: officeRefresh };
})();

function officeInit(canvasEl) { Office.init(canvasEl); }
function officeDestroy() { Office.destroy(); }
function officeRefresh(data) { Office.refresh(data); }
