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
  var MAP_COLS = 60;
  var MAP_ROWS = 40;
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
  var cam = { x: 0, y: 0, zoom: 1 };
  var camDragging = false, camDragStart = {}, camDragCamStart = {}, pinchDist = 0;
  var tileMap = [], furniture = [], seats = {}, mapCache = null;
  var bubbles = [], MAX_BUBBLES = 12, particles = [], officeBtns = {};
  var allHandsActive = false, allHandsTimer = 0, allHandsInterval = 60; // seconds between meetings

  // ═══ TILE MAP ═══
  function buildTileMap() {
    tileMap = [];
    for (var r = 0; r < MAP_ROWS; r++) {
      tileMap[r] = [];
      for (var c = 0; c < MAP_COLS; c++) tileMap[r][c] = TILE.VOID;
    }

    var areas = [
      { x: 2, y: 10, w: 30, h: 10, t: TILE.CARPET },
      { x: 2, y: 2, w: 6, h: 5, t: TILE.CARPET },
      { x: 9, y: 2, w: 6, h: 5, t: TILE.CARPET },
      { x: 16, y: 2, w: 6, h: 5, t: TILE.CARPET },
      { x: 23, y: 2, w: 6, h: 5, t: TILE.CARPET },
      { x: 40, y: 2, w: 8, h: 5, t: TILE.CARPET },
      { x: 50, y: 2, w: 8, h: 6, t: TILE.CARPET },
      { x: 34, y: 10, w: 14, h: 6, t: TILE.CARPET },
      { x: 2, y: 22, w: 10, h: 7, t: TILE.FLOOR },
      { x: 2, y: 30, w: 10, h: 6, t: TILE.CARPET },
      { x: 14, y: 30, w: 6, h: 6, t: TILE.FLOOR },
      { x: 22, y: 30, w: 6, h: 6, t: TILE.CARPET },
      { x: 30, y: 30, w: 8, h: 6, t: TILE.CARPET },
      { x: 44, y: 18, w: 14, h: 10, t: TILE.CARPET },
    ];
    areas.forEach(function(a) {
      for (var r = a.y; r < a.y + a.h; r++) {
        for (var c = a.x; c < a.x + a.w; c++) {
          if (r >= 0 && r < MAP_ROWS && c >= 0 && c < MAP_COLS) tileMap[r][c] = a.t;
        }
      }
    });

    // Corridors
    for (var c = 2; c < 58; c++) { tileMap[17][c] = TILE.FLOOR; tileMap[18][c] = TILE.FLOOR; }
    for (var r = 2; r < 17; r++) { tileMap[r][38] = TILE.FLOOR; tileMap[r][39] = TILE.FLOOR; }
    for (var r = 22; r < 36; r++) { tileMap[r][12] = TILE.FLOOR; tileMap[r][13] = TILE.FLOOR; }

    // Walls around perimeter
    for (var c2 = 0; c2 < MAP_COLS; c2++) {
      if (tileMap[0][c2] === TILE.VOID) tileMap[0][c2] = TILE.WALL;
      if (tileMap[MAP_ROWS-1][c2] === TILE.VOID) tileMap[MAP_ROWS-1][c2] = TILE.WALL;
    }
    for (var r2 = 0; r2 < MAP_ROWS; r2++) {
      if (tileMap[r2][0] === TILE.VOID) tileMap[r2][0] = TILE.WALL;
      if (tileMap[r2][MAP_COLS-1] === TILE.VOID) tileMap[r2][MAP_COLS-1] = TILE.WALL;
    }
  }

  // ═══ FURNITURE ═══
  function buildFurniture() {
    furniture = [];
    seats = {};

    // Workstation desks
    for (var row = 0; row < 4; row++) {
      for (var col = 0; col < 7; col++) {
        var dx = 4 + col * 4, dy = 12 + row * 2;
        furniture.push({ type: 'desk', x: dx, y: dy, w: 3, h: 1 });
        furniture.push({ type: 'chair', x: dx + 1, y: dy + 1, w: 1, h: 1 });
        seats['desk_' + row + '_' + col] = { x: dx + 1, y: dy + 1, assigned: false, facing: DIR.UP };
      }
    }

    // Focus rooms
    for (var i = 0; i < 4; i++) {
      var fx = 3 + i * 7;
      furniture.push({ type: 'desk', x: fx, y: 4, w: 2, h: 1 });
      furniture.push({ type: 'chair', x: fx, y: 5, w: 1, h: 1 });
      seats['focus_' + i] = { x: fx, y: 5, assigned: false, facing: DIR.UP };
    }

    // Meeting rooms
    furniture.push({ type: 'table', x: 42, y: 4, w: 3, h: 2 });
    furniture.push({ type: 'chair', x: 42, y: 3, w: 1, h: 1 });
    furniture.push({ type: 'chair', x: 44, y: 3, w: 1, h: 1 });
    furniture.push({ type: 'chair', x: 42, y: 6, w: 1, h: 1 });
    furniture.push({ type: 'chair', x: 44, y: 6, w: 1, h: 1 });
    seats['meet_s_1'] = { x: 42, y: 3, assigned: false, facing: DIR.DOWN };
    seats['meet_s_2'] = { x: 44, y: 3, assigned: false, facing: DIR.DOWN };
    seats['meet_s_3'] = { x: 42, y: 6, assigned: false, facing: DIR.UP };
    seats['meet_s_4'] = { x: 44, y: 6, assigned: false, facing: DIR.UP };

    furniture.push({ type: 'table', x: 52, y: 4, w: 4, h: 2 });
    for (var mc = 0; mc < 4; mc++) {
      furniture.push({ type: 'chair', x: 52 + mc, y: 3, w: 1, h: 1 });
      furniture.push({ type: 'chair', x: 52 + mc, y: 6, w: 1, h: 1 });
      seats['meet_m_' + mc + '_t'] = { x: 52 + mc, y: 3, assigned: false, facing: DIR.DOWN };
      seats['meet_m_' + mc + '_b'] = { x: 52 + mc, y: 6, assigned: false, facing: DIR.UP };
    }

    // Conference
    furniture.push({ type: 'table', x: 37, y: 12, w: 8, h: 3 });
    for (var cc = 0; cc < 8; cc++) {
      furniture.push({ type: 'chair', x: 37 + cc, y: 11, w: 1, h: 1 });
      furniture.push({ type: 'chair', x: 37 + cc, y: 15, w: 1, h: 1 });
      seats['conf_' + cc + '_t'] = { x: 37 + cc, y: 11, assigned: false, facing: DIR.DOWN };
      seats['conf_' + cc + '_b'] = { x: 37 + cc, y: 15, assigned: false, facing: DIR.UP };
    }

    // Cafeteria
    for (var tc = 0; tc < 3; tc++) {
      furniture.push({ type: 'table', x: 4 + tc * 3, y: 24, w: 2, h: 2 });
      furniture.push({ type: 'chair', x: 4 + tc * 3, y: 23, w: 1, h: 1 });
      furniture.push({ type: 'chair', x: 5 + tc * 3, y: 23, w: 1, h: 1 });
      furniture.push({ type: 'chair', x: 4 + tc * 3, y: 26, w: 1, h: 1 });
      furniture.push({ type: 'chair', x: 5 + tc * 3, y: 26, w: 1, h: 1 });
      seats['cafe_' + tc + '_1'] = { x: 4 + tc * 3, y: 23, assigned: false, facing: DIR.DOWN };
      seats['cafe_' + tc + '_2'] = { x: 5 + tc * 3, y: 23, assigned: false, facing: DIR.DOWN };
      seats['cafe_' + tc + '_3'] = { x: 4 + tc * 3, y: 26, assigned: false, facing: DIR.UP };
      seats['cafe_' + tc + '_4'] = { x: 5 + tc * 3, y: 26, assigned: false, facing: DIR.UP };
    }

    // Lounge
    furniture.push({ type: 'sofa', x: 4, y: 32, w: 3, h: 1 });
    furniture.push({ type: 'sofa', x: 4, y: 34, w: 3, h: 1 });
    furniture.push({ type: 'plant', x: 9, y: 32, w: 1, h: 1 });
    furniture.push({ type: 'plant', x: 9, y: 34, w: 1, h: 1 });

    // Mission control
    furniture.push({ type: 'screen', x: 47, y: 20, w: 8, h: 1 });
    furniture.push({ type: 'desk', x: 47, y: 23, w: 8, h: 1 });
    for (var mc2 = 0; mc2 < 4; mc2++) {
      furniture.push({ type: 'chair', x: 48 + mc2 * 2, y: 24, w: 1, h: 1 });
      seats['mc_' + mc2] = { x: 48 + mc2 * 2, y: 24, assigned: false, facing: DIR.UP };
    }

    // Recreation
    furniture.push({ type: 'arcade', x: 32, y: 32, w: 1, h: 1 });
    furniture.push({ type: 'arcade', x: 34, y: 32, w: 1, h: 1 });
    furniture.push({ type: 'table', x: 32, y: 34, w: 2, h: 2 });

    // Rest area
    furniture.push({ type: 'bed', x: 24, y: 32, w: 2, h: 1 });
    furniture.push({ type: 'bed', x: 24, y: 34, w: 2, h: 1 });
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
    "Need a quick break...", "Fresh air feels good.", "Long day today...",
    "Almost done for today...", "That bug was tricky...", "Coffee after this?"
  ];
  var REST_CHATTER = [
    "Just need a quick nap...", "Recharging batteries...", "Long night...",
    "So tired...", "Power nap time...", "Need coffee after this..."
  ];
  var RECREATION_CHATTER = [
    "Game on!", "Ping pong break!", "High score!", "Arcade time!",
    "Let's play!", "Good game!", "Almost beat the high score!"
  ];

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
        // Leadership → Mission Control or Focus Rooms (not regular workstations)
        if (agent.personality === 'manager') {
          // 60% mission control, 40% focus room
          if (Math.random() < 0.6) {
            pos = getRandomTileInArea(47, 21, 10, 5) || { x: 51, y: 23 };
          } else {
            pos = getRandomTileInArea(3, 3, 24, 4) || { x: 8, y: 5 };
          }
          return pos;
        }
        // Regular workers → assigned desk or workstation
        if (agent.seatId && seats[agent.seatId]) {
          var s = seats[agent.seatId];
          return { x: s.x, y: s.y };
        }
        pos = getRandomTileInArea(4, 12, 28, 7);
        return pos || { x: 17, y: 15 };

      case 'meeting':
        // Leadership → small/medium meeting rooms
        // Others → conference only if all-hands is active
        var teamAgents = agents.filter(function(a) { return a.team === agent.team && a.id !== agent.id; });
        if (agent.personality === 'manager') {
          // Managers go to small/medium meetings
          if (teamAgents.length >= 3) {
            pos = getRandomTileInArea(52, 4, 6, 4) || { x: 54, y: 6 };
          } else {
            pos = getRandomTileInArea(42, 4, 6, 4) || { x: 44, y: 5 };
          }
        } else {
          // Non-managers: small meeting by default
          pos = getRandomTileInArea(42, 4, 6, 4) || { x: 44, y: 5 };
        }
        return pos;

      case 'reviewing':
        // Mission control
        pos = getRandomTileInArea(47, 21, 10, 5) || { x: 51, y: 23 };
        return pos;

      case 'blocked':
        // Lounge area with other blocked agents
        pos = getRandomTileInArea(4, 31, 8, 4) || { x: 7, y: 33 };
        return pos;

      case 'idle':
      default:
        // Random idle area: cafeteria, lounge, smoking, rest, recreation
        var idleAreas = [
          { x: 4, y: 23, w: 8, h: 5 },   // Cafeteria
          { x: 4, y: 31, w: 8, h: 4 },   // Lounge
          { x: 14, y: 31, w: 5, h: 4 },  // Smoking (some agents)
          { x: 22, y: 31, w: 5, h: 4 },  // Rest
          { x: 30, y: 31, w: 7, h: 4 },  // Recreation
        ];
        // Some personalities prefer certain areas
        var area;
        var r = Math.random();
        if (agent.personality === 'social') {
          area = r < 0.5 ? idleAreas[0] : idleAreas[1]; // cafeteria or lounge
        } else if (agent.personality === 'research') {
          area = r < 0.6 ? idleAreas[0] : idleAreas[3]; // cafeteria or rest
        } else if (agent.personality === 'worker') {
          area = r < 0.4 ? idleAreas[0] : (r < 0.7 ? idleAreas[1] : idleAreas[4]);
        } else if (agent.personality === 'qa') {
          area = r < 0.5 ? idleAreas[1] : idleAreas[4]; // lounge or recreation
        } else {
          area = idleAreas[Math.floor(Math.random() * idleAreas.length)];
        }
        pos = getRandomTileInArea(area.x, area.y, area.w, area.h);
        return pos || { x: area.x + 1, y: area.y + 1 };
    }
  }

  // Get chatter text based on status
  function getChatterText(agent) {
    var pool;
    switch (agent.officeState) {
      case 'working':
        // Use actual ticket title if available
        if (agent.currentTicket && Math.random() < 0.6) {
          return agent.currentTicket.title.substring(0, 40);
        }
        pool = WORKING_CHATTER;
        break;
      case 'meeting': pool = MEETING_CHATTER; break;
      case 'blocked': pool = BLOCKED_CHATTER; break;
      case 'reviewing': pool = WORKING_CHATTER; break;
      case 'idle':
      default:
        // Idle sub-area chatter
        var subArea = agent.idleArea || 'lounge';
        if (subArea === 'smoking') pool = SMOKING_CHATTER;
        else if (subArea === 'rest') pool = REST_CHATTER;
        else if (subArea === 'recreation') pool = RECREATION_CHATTER;
        else pool = IDLE_CHATTER;
        break;
    }
    return pool[Math.floor(Math.random() * pool.length)];
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
        path: [], moveProgress: 0, dir: DIR.DOWN,
        frame: 0, frameTimer: 0, state: STATE.TYPE, // start at destination
        wanderTimer: Math.random() * 3, wanderCount: 0,
        wanderLimit: Math.floor(Math.random() * (WANDER_LIMIT_MAX - WANDER_LIMIT_MIN)) + WANDER_LIMIT_MIN,
        speechBubble: null, speechEnd: 0, nextSpeechTime: Date.now() + 2000 + Math.random() * 5000,
        celebrationTimer: 0, walking: false,
        idleArea: 'lounge'
      };
    });
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

      switch (agent.state) {
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
                if (agent.officeState === 'working' || agent.officeState === 'meeting' || agent.officeState === 'reviewing') {
                  agent.state = STATE.TYPE;
                  agent.frame = 0; agent.frameTimer = 0;
                } else {
                  // Idle — arrived at idle area
                  agent.state = STATE.IDLE; agent.frame = 0; agent.frameTimer = 0;
                  agent.wanderTimer = Math.random() * IDLE_PAUSE_MAX + IDLE_PAUSE_MIN;
                  // Track which idle area we're in
                  if (agent.tileCol >= 4 && agent.tileCol <= 11 && agent.tileRow >= 23 && agent.tileRow <= 27) agent.idleArea = 'cafeteria';
                  else if (agent.tileCol >= 4 && agent.tileCol <= 11 && agent.tileRow >= 31 && agent.tileRow <= 34) agent.idleArea = 'lounge';
                  else if (agent.tileCol >= 14 && agent.tileCol <= 18 && agent.tileRow >= 31 && agent.tileRow <= 34) agent.idleArea = 'smoking';
                  else if (agent.tileCol >= 22 && agent.tileCol <= 26 && agent.tileRow >= 31 && agent.tileRow <= 34) agent.idleArea = 'rest';
                  else if (agent.tileCol >= 30 && agent.tileCol <= 36 && agent.tileRow >= 31 && agent.tileRow <= 34) agent.idleArea = 'recreation';
                  else agent.idleArea = 'lounge';
                }
              }
            }
          } else { agent.state = STATE.IDLE; agent.walking = false; }
          break;

        case STATE.IDLE:
          agent.walking = false; agent.frame = 0;
          agent.wanderTimer -= dt;
          if (agent.wanderTimer <= 0) {
            // IMPORTANT: If agent should be working/meeting/reviewing, route them to WORK area — NOT idle
            if (agent.officeState === 'working' || agent.officeState === 'meeting' || agent.officeState === 'reviewing') {
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
              if (loungePath.length > 0 && (agent.tileCol < 4 || agent.tileCol > 11 || agent.tileRow < 31 || agent.tileRow > 34)) {
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
                  case 'cafeteria': area = { x: 4, y: 23, w: 8, h: 5 }; break;
                  case 'lounge': area = { x: 4, y: 31, w: 8, h: 4 }; break;
                  case 'smoking': area = { x: 14, y: 31, w: 5, h: 4 }; break;
                  case 'rest': area = { x: 22, y: 31, w: 5, h: 4 }; break;
                  case 'recreation': area = { x: 30, y: 31, w: 7, h: 4 }; break;
                  default: area = { x: 4, y: 31, w: 8, h: 4 };
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
      if (!allHandsActive && frameCount % (60 * 90) === 0 && agents.length > 5) {
        allHandsActive = true;
        allHandsTimer = 30; // 30 seconds meeting duration
        // Route all agents to conference room
        agents.forEach(function(a) {
          if (a.state !== STATE.WALK || a.path.length === 0) {
            var confDest = getRandomTileInArea(37, 12, 12, 5) || { x: 41, y: 14 };
            var confPath = findPath(a.tileCol, a.tileRow, confDest.x, confDest.y);
            if (confPath.length > 0) {
              a.path = confPath;
              a.state = STATE.WALK;
              a.wasOfficeState = a.officeState; // remember where to return
            }
          }
        });
      }

      // During all-hands meeting
      if (allHandsActive) {
        allHandsTimer -= dt;
        if (allHandsTimer <= 0) {
          allHandsActive = false;
          // Return all agents to their proper places
          agents.forEach(function(a) {
            if (a.state !== STATE.WALK || a.path.length === 0) {
              var returnDest = getDestinationForStatus({ officeState: a.wasOfficeState || a.officeState, personality: a.personality, seatId: a.seatId, team: a.team, id: a.id });
              var returnPath = findPath(a.tileCol, a.tileRow, returnDest.x, returnDest.y);
              if (returnPath.length > 0) {
                a.path = returnPath;
                a.state = STATE.WALK;
              }
            }
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
          mc.fillStyle = '#b58e63';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.fillStyle = '#cda57e';
          mc.fillRect(x, y, TILE_SIZE, 3);
          mc.fillRect(x, y, 3, TILE_SIZE);
          mc.fillStyle = '#8c6a45';
          mc.fillRect(x + TILE_SIZE - 3, y, 3, TILE_SIZE);
          mc.fillRect(x, y + TILE_SIZE - 3, TILE_SIZE, 3);
          mc.fillStyle = 'rgba(0,0,0,0.10)';
          mc.fillRect(x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10);
        } else if (tile === TILE.FLOOR) {
          // warm oak planks
          mc.fillStyle = (r % 2 === 0) ? '#c79a6b' : '#c0925f';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.fillStyle = '#a87d50';
          mc.fillRect(x, y, TILE_SIZE, 1);
          mc.fillStyle = 'rgba(255,255,255,0.05)';
          mc.fillRect(x, y + 1, TILE_SIZE, 1);
          mc.fillStyle = 'rgba(120,80,45,0.25)';
          mc.fillRect(x + ((r % 2) ? TILE_SIZE - 1 : 0), y, 1, TILE_SIZE);
        } else if (tile === TILE.CARPET) {
          // cozy woven warm carpet
          mc.fillStyle = ((c + r) % 2 === 0) ? '#cbb892' : '#c3ad83';
          mc.fillRect(x, y, TILE_SIZE, TILE_SIZE);
          mc.fillStyle = 'rgba(120,90,55,0.14)';
          mc.fillRect(x + 3, y + 3, 2, 2);
          mc.fillRect(x + 12, y + 10, 2, 2);
          mc.fillRect(x + 8, y + 15, 2, 2);
          mc.fillStyle = 'rgba(255,255,255,0.05)';
          mc.fillRect(x + 4, y + 4, 1, 1);
          mc.fillRect(x + 13, y + 11, 1, 1);
        }
      }
    }

    // Furniture
    furniture.forEach(function(f) { drawFurnitureSprite(mc, f); });

    // Labels
    mc.font = 'bold 8px monospace';
    mc.textAlign = 'center';
    [
      { x: 17, y: 15, t: 'WORKSTATIONS', c: '#3b82f6' },
      { x: 5, y: 5, t: 'FOCUS ROOMS', c: '#a855f7' },
      { x: 44, y: 5, t: 'MEETING', c: '#22c55e' },
      { x: 41, y: 13, t: 'CONFERENCE', c: '#22c55e' },
      { x: 7, y: 26, t: 'CAFETERIA', c: '#f59e0b' },
      { x: 7, y: 33, t: 'LOUNGE', c: '#06b6d4' },
      { x: 17, y: 33, t: 'SMOKING', c: '#94a3b8' },
      { x: 25, y: 33, t: 'REST', c: '#64748b' },
      { x: 34, y: 33, t: 'RECREATION', c: '#ec4899' },
      { x: 51, y: 23, t: 'MISSION CTRL', c: '#e2e8f0' },
    ].forEach(function(l) {
      mc.fillStyle = 'rgba(13,17,23,0.7)';
      var w = mc.measureText(l.t).width + 8;
      mc.fillRect(l.x * TILE_SIZE - w / 2, l.y * TILE_SIZE - 6, w, 12);
      mc.fillStyle = l.c;
      mc.fillText(l.t, l.x * TILE_SIZE, l.y * TILE_SIZE + 2);
    });
  }

  function drawFurnitureSprite(mc, f) {
    var x = f.x * TILE_SIZE, y = f.y * TILE_SIZE, s = TILE_SIZE;
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
    }
  }

  // ═══ CHARACTER RENDERER ═══
  function drawCharacter(agent) {
    var px = Math.floor(agent.x), py = Math.floor(agent.y);
    var OUT = '#241c14';
    function shadeHex(hex, amt) { var n = parseInt(hex.slice(1), 16); function cl(v){return Math.max(0,Math.min(255,v));} return 'rgb(' + cl((n>>16&255)+amt) + ',' + cl((n>>8&255)+amt) + ',' + cl((n&255)+amt) + ')'; }
    function oR(x, y, w, h, col) { ctx.fillStyle = OUT; ctx.fillRect(x-1, y, w+2, h); ctx.fillRect(x, y-1, w, h+2); ctx.fillStyle = col; ctx.fillRect(x, y, w, h); }
    var bodyColor = (agent.color && agent.color.charAt(0) === '#') ? agent.color : '#6b7a99';
    var bodyDk = shadeHex(bodyColor, -34), bodyHi = shadeHex(bodyColor, 28);
    var skinColor = (agent.skin && agent.skin.charAt(0) === '#') ? agent.skin : '#f3cda3';
    var skinDk = shadeHex(skinColor, -22);
    var hairColors = ['#2d1b0e', '#4a3728', '#8b6914', '#15131a', '#c9462f', '#caa24a', '#e8e8e8', '#5a3a1a'];
    var styles = ['short', 'long', 'pony', 'bun', 'bob', 'spiky'];
    var hcode = Math.abs(agent.id.charCodeAt(0) * 7 + (agent.id.charCodeAt(1) || 0) * 13);
    var hairColor = hairColors[hcode % hairColors.length];
    var hairStyle = styles[hcode % styles.length];
    var glasses = (hcode % 3) === 0;
    var bob = agent.walking ? Math.sin(agent.frameTimer * 8) * 1.4 : Math.sin(frameCount * 0.03 + agent.id.charCodeAt(0)) * 0.4;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.ellipse(px, py + 8, 6, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs (walk cycle)
    var ll = 0, lr = 0;
    if (agent.walking) { var lf = Math.floor(agent.frameTimer * 6) % 4; if (lf === 0) { ll = 1; lr = -1; } else if (lf === 2) { ll = -1; lr = 1; } }
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(px - 4 + ll, py + 2 + bob, 3, 5);
    ctx.fillRect(px + 1 + lr, py + 2 + bob, 3, 5);
    ctx.fillStyle = OUT;
    ctx.fillRect(px - 4 + ll, py + 6 + bob, 3, 1);
    ctx.fillRect(px + 1 + lr, py + 6 + bob, 3, 1);

    // Body (outlined + two-tone shading)
    oR(px - 5, py - 8 + bob, 10, 10, bodyColor);
    ctx.fillStyle = bodyDk; ctx.fillRect(px - 5, py - 8 + bob, 3, 10);
    ctx.fillStyle = bodyHi; ctx.fillRect(px + 3, py - 8 + bob, 2, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.20)'; ctx.fillRect(px - 1, py - 8 + bob, 2, 2); // collar

    // Arms (outlined) + typing flutter
    var as = agent.walking ? Math.sin(agent.frameTimer * 6) : 0;
    var typing = agent.state === STATE.TYPE;
    var tA = typing ? (Math.floor(frameCount * 0.25) % 2 ? 1 : 0) : 0;
    oR(px - 7, py - 7 + as + bob, 2, 6, bodyColor);
    oR(px + 5, py - 7 - as + bob, 2, 6, bodyColor);
    ctx.fillStyle = skinColor;
    ctx.fillRect(px - 7, py - 2 + as + bob - tA, 2, 2);
    ctx.fillRect(px + 5, py - 2 - as + bob - (typing ? (tA ? 0 : 1) : 0), 2, 2);

    // Head (outlined) + face shade
    oR(px - 4, py - 14 + bob, 8, 7, skinColor);
    ctx.fillStyle = skinDk; ctx.fillRect(px - 4, py - 14 + bob, 2, 7);

    // Hair (varied styles)
    ctx.fillStyle = hairColor;
    if (hairStyle === 'long' || hairStyle === 'bob') {
      var hl = hairStyle === 'bob' ? 8 : 11;
      ctx.fillRect(px - 5, py - 15 + bob, 10, 3); ctx.fillRect(px - 5, py - 15 + bob, 2, hl); ctx.fillRect(px + 3, py - 15 + bob, 2, hl); ctx.fillRect(px - 3, py - 16 + bob, 6, 1);
    } else if (hairStyle === 'pony') {
      ctx.fillRect(px - 5, py - 15 + bob, 10, 3); ctx.fillRect(px - 5, py - 15 + bob, 2, 5); ctx.fillRect(px + 3, py - 15 + bob, 2, 5); ctx.fillRect(px + 4, py - 14 + bob, 2, 8);
    } else if (hairStyle === 'bun') {
      ctx.fillRect(px - 5, py - 15 + bob, 10, 3); ctx.fillRect(px - 5, py - 15 + bob, 2, 5); ctx.fillRect(px + 3, py - 15 + bob, 2, 4); ctx.fillRect(px - 2, py - 18 + bob, 5, 3);
    } else if (hairStyle === 'spiky') {
      ctx.fillRect(px - 5, py - 15 + bob, 10, 3); ctx.fillRect(px - 4, py - 17 + bob, 2, 3); ctx.fillRect(px - 1, py - 18 + bob, 2, 3); ctx.fillRect(px + 2, py - 17 + bob, 2, 3); ctx.fillRect(px - 5, py - 15 + bob, 2, 4); ctx.fillRect(px + 3, py - 15 + bob, 2, 4);
    } else {
      ctx.fillRect(px - 5, py - 15 + bob, 10, 3); ctx.fillRect(px - 5, py - 15 + bob, 2, 5); ctx.fillRect(px + 3, py - 15 + bob, 2, 4); ctx.fillRect(px - 3, py - 16 + bob, 6, 1);
    }

    // Eyes (+ optional glasses)
    var blink = frameCount % 180 > 175 ? 1 : 2;
    if (glasses) {
      ctx.fillStyle = OUT; ctx.fillRect(px - 3, py - 11 + bob, 3, 3); ctx.fillRect(px + 1, py - 11 + bob, 3, 3); ctx.fillRect(px, py - 10 + bob, 1, 1);
      ctx.fillStyle = '#bfe4f2'; ctx.fillRect(px - 2, py - 10 + bob, 1, 1); ctx.fillRect(px + 2, py - 10 + bob, 1, 1);
    } else {
      ctx.fillStyle = OUT;
      ctx.fillRect(px - 2, py - 11 + bob, 2, blink);
      ctx.fillRect(px + 1, py - 11 + bob, 2, blink);
      if (blink > 1) { ctx.fillStyle = '#fff'; ctx.fillRect(px - 1, py - 11 + bob, 1, 1); ctx.fillRect(px + 2, py - 11 + bob, 1, 1); }
    }

    // Cheeks + mouth
    ctx.fillStyle = 'rgba(230,120,120,0.45)'; ctx.fillRect(px - 3, py - 9 + bob, 1, 1); ctx.fillRect(px + 2, py - 9 + bob, 1, 1);
    ctx.fillStyle = agent.isBlocked ? '#e67e22' : '#9c4a3a';
    ctx.fillRect(px - 1, py - 8 + bob, 2, 1);

    // Status
    var sc = STATUS_COLORS[agent.officeState] || '#64748b';
    ctx.fillStyle = sc;
    ctx.beginPath(); ctx.arc(px, py - 17 + bob, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#0d1117'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py - 17 + bob, 5, 0, Math.PI * 2);
    ctx.fillStyle = sc + '20'; ctx.fill();

    // Typing glow
    if (agent.state === STATE.TYPE) {
      var g = Math.sin(frameCount * 0.1) * 0.3 + 0.7;
      ctx.fillStyle = 'rgba(59,130,246,' + (g * 0.4) + ')';
      ctx.fillRect(px - 8, py + 9 + bob, 16, 2);
    }

    // Celebration
    if (agent.celebrationTimer > 0) {
      ctx.globalAlpha = Math.min(1, agent.celebrationTimer);
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★ DONE!', px, py - 22 + bob);
      ctx.globalAlpha = 1;
    }

    // Blocked
    if (agent.isBlocked) {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', px, py - 22 + bob);
    }

    // Name + Role label
    var roleText = agent.title || agent.role || '';
    // Shorten long role text for display
    if (roleText.length > 20) roleText = roleText.substring(0, 18) + '…';
    ctx.font = 'bold 7px monospace';
    var nameW = ctx.measureText(agent.name).width + 6;
    ctx.font = '6px monospace';
    var roleW = ctx.measureText(roleText).width + 6;
    var labelW = Math.max(nameW, roleW);
    var labelX = px - labelW / 2;
    var labelY = py + 9 + bob;
    // Background pill
    ctx.fillStyle = 'rgba(13,17,23,0.85)';
    ctx.beginPath();
    ctx.roundRect(labelX, labelY, labelW, roleText ? 18 : 9, 3);
    ctx.fill();
    // Name
    ctx.font = 'bold 7px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, px, labelY + 8 + bob);
    // Role (under name)
    if (roleText) {
      ctx.font = '6px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(roleText, px, labelY + 16 + bob);
    }

    // Speech bubble
    if (agent.speechBubble) drawSpeechBubble(px, py - 28 + bob, agent.speechBubble.text, agent.speechBubble.type || 'normal');
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
