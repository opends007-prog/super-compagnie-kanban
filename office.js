/* ═══════════════════════════════════════════════════════════════
   OFFICE SIMULATOR — AI Company Virtual Office
   Pixel-art management game style dashboard
   ═══════════════════════════════════════════════════════════════ */
var Office = (function() {
  'use strict';

  // ═══ STATE ═══
  var canvas, ctx;
  var animId = null;
  var officeData = null;
  var agents = [];
  var frameCount = 0;
  var lastLogicUpdate = 0;

  // Camera
  var cam = { x: 0, y: 0, zoom: 1 };
  var camDragging = false;
  var camDragStart = { x: 0, y: 0 };
  var camDragCamStart = { x: 0, y: 0 };
  var pinchDist = 0;

  // Map dimensions
  var MAP_W = 2400, MAP_H = 1600;
  var TILE = 40;

  // Offscreen cache for static map
  var mapCache = null;

  // Speech bubbles
  var bubbles = [];
  var MAX_BUBBLES = 12;

  // Particles (confetti, etc.)
  var particles = [];

  // ═══ OFFICE AREAS ═══
  // Each area: {id, name, gx, gy, gw, gh, color, textColor}
  var AREAS = [
    { id: 'workstation', name: 'Workstations', gx: 2, gy: 8, gw: 56, gh: 12, color: '#1a2332', text: '#3b82f6' },
    { id: 'focus1', name: 'Focus Room 1', gx: 2, gy: 2, gw: 10, gh: 5, color: '#1a1a2e', text: '#a855f7' },
    { id: 'focus2', name: 'Focus Room 2', gx: 13, gy: 2, gw: 10, gh: 5, color: '#1a1a2e', text: '#a855f7' },
    { id: 'focus3', name: 'Focus Room 3', gx: 24, gy: 2, gw: 10, gh: 5, color: '#1a1a2e', text: '#a855f7' },
    { id: 'focus4', name: 'Focus Room 4', gx: 35, gy: 2, gw: 10, gh: 5, color: '#1a1a2e', text: '#a855f7' },
    { id: 'meeting_small', name: 'Small Meeting', gx: 46, gy: 2, gw: 12, gh: 6, color: '#1e2a1e', text: '#22c55e' },
    { id: 'meeting_med', name: 'Medium Meeting', gx: 46, gy: 9, gw: 12, gh: 8, color: '#1e2a1e', text: '#22c55e' },
    { id: 'meeting_large', name: 'Conference Room', gx: 14, gy: 21, gw: 28, gh: 9, color: '#1e2a1e', text: '#22c55e' },
    { id: 'cafeteria', name: 'Cafeteria', gx: 2, gy: 22, gw: 12, gh: 8, color: '#2a1e1e', text: '#f59e0b' },
    { id: 'lounge', name: 'Lounge', gx: 2, gy: 31, gw: 12, gh: 7, color: '#1e2a2a', text: '#06b6d4' },
    { id: 'smoking', name: 'Smoking Area', gx: 15, gy: 31, gw: 8, gh: 7, color: '#2a2a1e', text: '#94a3b8' },
    { id: 'rest', name: 'Rest Area', gx: 24, gy: 31, gw: 8, gh: 7, color: '#1a1a2e', text: '#64748b' },
    { id: 'recreation', name: 'Recreation', gx: 33, gy: 31, gw: 10, gh: 7, color: '#2a1e2a', text: '#ec4899' },
    { id: 'mission_ctrl', name: 'Mission Control', gx: 44, gy: 21, gw: 14, gh: 17, color: '#1a2332', text: '#e2e8f0' },
  ];

  // Area centers (computed)
  var areaCenters = {};
  AREAS.forEach(function(a) {
    areaCenters[a.id] = { x: (a.gx + a.gw / 2) * TILE, y: (a.gy + a.gh / 2) * TILE };
  });

  // ═══ PERSONALITY SYSTEM ═══
  var PERSONALITY_WEIGHTS = {
    worker:  { coffee: 25, walking: 10, phone: 10, reading: 5, gaming: 5, lunch: 10, smoking: 5, napping: 5, talking: 5, focus: 10 },
    social:  { coffee: 15, talking: 25, lunch: 20, phone: 15, walking: 10, gaming: 5, smoking: 5, napping: 0, reading: 5, focus: 0 },
    research: { coffee: 20, reading: 25, walking: 15, focus: 20, phone: 5, talking: 5, lunch: 5, gaming: 0, smoking: 0, napping: 5 },
    manager: { meeting: 20, walking: 20, phone: 20, coffee: 10, talking: 10, lunch: 10, reading: 5, gaming: 0, smoking: 0, napping: 0 },
    qa:      { visiting: 25, coffee: 15, reading: 10, walking: 20, talking: 10, phone: 5, lunch: 10, gaming: 0, smoking: 5, napping: 0 }
  };

  var ACTIVITY_AREA = {
    coffee: 'cafeteria', talking: 'lounge', lunch: 'cafeteria', reading: 'lounge',
    walking: 'workstation', phone: 'lounge', gaming: 'recreation', napping: 'rest',
    smoking: 'smoking', visiting: 'workstation', meeting: 'meeting_small', focus: 'focus1'
  };

  // ═══ DIALOGUE POOLS ═══
  var CHATTER = {
    worker: [
      "Ship it!", "Tests are green", "Refactoring...", "PR is up", "Merging now",
      "Debugging...", "Code review done", "Building...", "Deploying...", "Fixed!",
      "Writing tests...", "Optimizing...", "Clean code!", "Feature complete", "Pushing..."
    ],
    social: [
      "Did you see the metrics?", "Let's sync up", "How's the project?", "Coffee break?",
      "Great work team!", "Check this out", "Nice progress!", "Team meeting soon",
      "Any blockers?", "Good morning!", "TGIF!", "Let's celebrate!", "Status update?"
    ],
    research: [
      "Interesting data...", "Found a pattern", "Need to dig deeper", "Check this out",
      "New insight!", "Analyzing trends...", "Correlation found", "Deep dive time",
      "Research notes...", "Hypothesis confirmed", "Data doesn't lie", "Fascinating..."
    ],
    manager: [
      "Status update?", "Let's align", "Good progress", "Next sprint?",
      "Priority check", "Resource allocation", "Timeline review", "Stakeholder update",
      "Team sync needed", "Roadmap check", "Budget review", "Great work everyone"
    ],
    qa: [
      "Found a bug", "Test coverage?", "Edge case...", "Looks solid",
      "Regression test", "Verified!", "Needs testing", "QA approved",
      "Test plan ready", "Scenario covered", "Boundary test", "Stress test"
    ]
  };

  var IDLE_CHATTER = [
    "Waiting for new assignment", "Checking company updates", "Taking a quick break",
    "Let's see what the team is doing", "Hmm...", "Browsing...", "Relaxing...",
    "Almost done...", "Need coffee...", "Good vibes", "Focused...", "Thinking..."
  ];

  // ═══ STATUS COLORS ═══
  var STATUS_COLORS = {
    working: '#22c55e',
    idle: '#eab308',
    waiting: '#f59e0b',
    meeting: '#3b82f6',
    reviewing: '#a855f7',
    blocked: '#ef4444'
  };

  // ═══ UI BUTTONS ═══
  var officeBtns = {};

  function recenterCamera() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    cam.x = MAP_W / 2 - vw / 2 / cam.zoom;
    cam.y = MAP_H / 2 - vh / 2 / cam.zoom;
    clampCam();
  }

  function officeHandleClick(mx, my) {
    // Check re-center button
    var rb = officeBtns.recenter;
    if (rb && mx >= rb.x && mx <= rb.x + rb.w && my >= rb.y && my <= rb.y + rb.h) {
      recenterCamera();
      return true;
    }
    // Check zoom button — click to cycle zoom levels
    var zb = officeBtns.zoom;
    if (zb && mx >= zb.x && mx <= zb.x + zb.w && my >= zb.y && my <= zb.y + zb.h) {
      var zoomLevels = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
      var currentIdx = 0;
      for (var i = 0; i < zoomLevels.length; i++) {
        if (Math.abs(cam.zoom - zoomLevels[i]) < 0.05) { currentIdx = i; break; }
      }
      cam.zoom = zoomLevels[(currentIdx + 1) % zoomLevels.length];
      recenterCamera();
      return true;
    }
    return false;
  }

  // ═══ PUBLIC API ═══
  function officeInit(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    resizeCanvas();
    buildMapCache();
    setupInputHandlers();

    if (!animId) {
      animId = requestAnimationFrame(renderLoop);
    }
  }

  function officeDestroy() {
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    agents = [];
    bubbles = [];
    particles = [];
  }

  function officeRefresh(data) {
    officeData = data;
    updateAgentStates();
  }

  // ═══ CANVAS SETUP ═══
  function resizeCanvas() {
    if (!canvas || !canvas.parentElement) return;
    // Use window dimensions (works even when parent is display:none)
    var w = window.innerWidth;
    var h = window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ═══ MAP CACHE ═══
  function buildMapCache() {
    mapCache = document.createElement('canvas');
    mapCache.width = MAP_W;
    mapCache.height = MAP_H;
    var mctx = mapCache.getContext('2d');

    // Background
    mctx.fillStyle = '#0d1117';
    mctx.fillRect(0, 0, MAP_W, MAP_H);

    // Floor grid
    mctx.strokeStyle = '#141c28';
    mctx.lineWidth = 1;
    for (var x = 0; x <= MAP_W; x += TILE) {
      mctx.beginPath(); mctx.moveTo(x, 0); mctx.lineTo(x, MAP_H); mctx.stroke();
    }
    for (var y = 0; y <= MAP_H; y += TILE) {
      mctx.beginPath(); mctx.moveTo(0, y); mctx.lineTo(MAP_W, y); mctx.stroke();
    }

    // Draw areas
    AREAS.forEach(function(a) {
      var ax = a.gx * TILE, ay = a.gy * TILE, aw = a.gw * TILE, ah = a.gh * TILE;

      // Area background
      mctx.fillStyle = a.color;
      mctx.fillRect(ax + 2, ay + 2, aw - 4, ah - 4);

      // Area border
      mctx.strokeStyle = a.text + '40';
      mctx.lineWidth = 2;
      mctx.strokeRect(ax + 4, ay + 4, aw - 8, ah - 8);

      // Area label
      mctx.fillStyle = a.text;
      mctx.font = 'bold 11px monospace';
      mctx.textAlign = 'center';
      mctx.fillText(a.name, ax + aw / 2, ay + 18);

      // Draw furniture hints
      drawFurniture(mctx, a);
    });

    // Corridor paths between areas
    mctx.strokeStyle = '#1a233280';
    mctx.lineWidth = TILE * 0.8;
    mctx.setLineDash([8, 8]);
    // Main horizontal corridor
    mctx.beginPath(); mctx.moveTo(0, 20 * TILE); mctx.lineTo(MAP_W, 20 * TILE); mctx.stroke();
    // Main vertical corridor
    mctx.beginPath(); mctx.moveTo(14 * TILE, 0); mctx.lineTo(14 * TILE, MAP_H); mctx.stroke();
    mctx.setLineDash([]);
  }

  function drawFurniture(mctx, area) {
    var ax = area.gx * TILE, ay = area.gy * TILE;
    mctx.fillStyle = area.text + '30';

    if (area.id === 'workstation') {
      // Draw desk grid
      for (var row = 0; row < 5; row++) {
        for (var col = 0; col < 13; col++) {
          var dx = ax + 20 + col * (TILE * 4);
          var dy = ay + 30 + row * (TILE * 2.2);
          if (dx + TILE * 3 < ax + area.gw * TILE && dy + TILE < ay + area.gh * TILE) {
            mctx.fillRect(dx, dy, TILE * 3, TILE * 0.8);
            // Monitor
            mctx.fillStyle = area.text + '20';
            mctx.fillRect(dx + TILE, dy - TILE * 0.6, TILE * 1.2, TILE * 0.6);
            mctx.fillStyle = area.text + '30';
          }
        }
      }
    } else if (area.id.indexOf('meeting') >= 0) {
      // Table
      var tw = area.gw * TILE * 0.6, th = area.gh * TILE * 0.4;
      mctx.fillRect(ax + (area.gw * TILE - tw) / 2, ay + (area.gh * TILE - th) / 2, tw, th);
    } else if (area.id === 'cafeteria') {
      // Tables
      for (var i = 0; i < 3; i++) {
        mctx.fillRect(ax + 30 + i * 120, ay + 60, 60, 30);
        mctx.fillRect(ax + 30 + i * 120, ay + 140, 60, 30);
      }
    } else if (area.id === 'lounge') {
      // Couches
      mctx.fillRect(ax + 20, ay + 50, 80, 20);
      mctx.fillRect(ax + 120, ay + 50, 80, 20);
      mctx.fillRect(ax + 20, ay + 130, 80, 20);
    } else if (area.id === 'mission_ctrl') {
      // Big screen
      mctx.fillRect(ax + 40, ay + 30, area.gw * TILE - 80, 40);
      // Workstations
      for (var j = 0; j < 4; j++) {
        mctx.fillRect(ax + 50 + j * 80, ay + 90, 50, 25);
      }
    }
  }

  // ═══ INPUT HANDLERS ═══
  function setupInputHandlers() {
    // Mouse drag to pan
    canvas.addEventListener('mousedown', function(e) {
      camDragging = true;
      camDragStart.x = e.clientX;
      camDragStart.y = e.clientY;
      camDragCamStart.x = cam.x;
      camDragCamStart.y = e.clientY;
      canvas.style.cursor = 'grabbing';
    });

    window.addEventListener('mousemove', function(e) {
      if (!camDragging) return;
      var dx = e.clientX - camDragStart.x;
      var dy = e.clientY - camDragStart.y;
      cam.x = camDragCamStart.x - dx / cam.zoom;
      cam.y = camDragCamStart.y - dy / cam.zoom;
      clampCam();
    });

    window.addEventListener('mouseup', function() {
      camDragging = false;
      canvas.style.cursor = 'grab';
    });

    // Scroll to zoom
    canvas.addEventListener('wheel', function(e) {
      e.preventDefault();
      var zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      var newZoom = Math.max(0.3, Math.min(3, cam.zoom * zoomFactor));

      // Zoom toward mouse position
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;
      var worldX = cam.x + mx / cam.zoom;
      var worldY = cam.y + my / cam.zoom;

      cam.zoom = newZoom;
      cam.x = worldX - mx / cam.zoom;
      cam.y = worldY - my / cam.zoom;
      clampCam();
    }, { passive: false });

    // Touch support
    canvas.addEventListener('touchstart', function(e) {
      if (e.touches.length === 1) {
        camDragging = true;
        camDragStart.x = e.touches[0].clientX;
        camDragStart.y = e.touches[0].clientY;
        camDragCamStart.x = cam.x;
        camDragCamStart.y = cam.y;
      } else if (e.touches.length === 2) {
        camDragging = false;
        pinchDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', function(e) {
      e.preventDefault();
      if (e.touches.length === 1 && camDragging) {
        var dx = e.touches[0].clientX - camDragStart.x;
        var dy = e.touches[0].clientY - camDragStart.y;
        cam.x = camDragCamStart.x - dx / cam.zoom;
        cam.y = camDragCamStart.y - dy / cam.zoom;
        clampCam();
      } else if (e.touches.length === 2) {
        var newDist = Math.hypot(
          e.touches[0].clientX - e.touches[1].clientX,
          e.touches[0].clientY - e.touches[1].clientY
        );
        if (pinchDist > 0) {
          var scale = newDist / pinchDist;
          cam.zoom = Math.max(0.3, Math.min(3, cam.zoom * scale));
        }
        pinchDist = newDist;
        clampCam();
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function() {
      camDragging = false;
      pinchDist = 0;
    }, { passive: true });

    // Click on agent
    canvas.addEventListener('click', function(e) {
      var rect = canvas.getBoundingClientRect();
      var mx = e.clientX - rect.left;
      var my = e.clientY - rect.top;

      // Check UI buttons first (screen-space coords)
      if (typeof officeHandleClick === 'function' && officeHandleClick(mx, my)) {
        return;
      }

      var worldX = cam.x + mx / cam.zoom;
      var worldY = cam.y + my / cam.zoom;

      // Check agents in reverse order (topmost first)
      for (var i = agents.length - 1; i >= 0; i--) {
        var a = agents[i];
        var dx = worldX - a.x, dy = worldY - a.y;
        if (Math.abs(dx) < 20 && Math.abs(dy) < 25) {
          // Open agent detail panel
          if (typeof openAD === 'function') {
            openAD(a.id);
          }
          return;
        }
      }
    });

    // Resize
    window.addEventListener('resize', resizeCanvas);
    canvas.style.cursor = 'grab';
  }

  function clampCam() {
    if (!canvas || !canvas.parentElement) return;
    var rect = canvas.parentElement.getBoundingClientRect();
    var vw = rect.width / cam.zoom;
    var vh = rect.height / cam.zoom;
    cam.x = Math.max(0, Math.min(MAP_W - vw, cam.x));
    cam.y = Math.max(0, Math.min(MAP_H - vh, cam.y));
  }

  // ═══ AGENT STATE MANAGEMENT ═══
  function derivePersonality(agent) {
    var title = (agent.title || '').toLowerCase();
    var team = (agent.team || '').toLowerCase();
    var role = (agent.role || '').toLowerCase();

    if (team === 'leadership' || title.indexOf('lead') >= 0 || title.indexOf('director') >= 0 || title.indexOf('coo') >= 0 || title.indexOf('pm') >= 0) return 'manager';
    if (team === 'research' || title.indexOf('intel') >= 0 || title.indexOf('analytics') >= 0 || title.indexOf('analyst') >= 0 || title.indexOf('strategy') >= 0) return 'research';
    if (title.indexOf('qa') >= 0 || role.indexOf('test') >= 0 || role.indexOf('qa') >= 0) return 'qa';
    if (title.indexOf('senior') >= 0 || team === 'project' || title.indexOf('engineer') >= 0 || title.indexOf('developer') >= 0) return 'worker';
    return 'social';
  }

  function updateAgentStates() {
    if (!officeData) return;
    var tickets = officeData.tickets || [];
    var dataAgents = officeData.agents || [];

    // Build agent list from data
    var newAgents = dataAgents.map(function(da) {
      var myTickets = tickets.filter(function(t) { return t.assigned_to === da.id; });
      var inProgress = myTickets.find(function(t) { return t.status === 'in_progress'; });
      var inValidation = myTickets.find(function(t) { return t.status === 'in_validation'; });
      var blocked = myTickets.find(function(t) { return t.blockedBy; });

      var newState;
      if (inProgress) newState = 'working';
      else if (inValidation) newState = 'reviewing';
      else if (blocked) newState = 'blocked';
      else newState = 'idle';

      // Find existing agent to preserve position/state
      var existing = agents.find(function(a) { return a.id === da.id; });

      var personality = derivePersonality(da);

      if (existing) {
        // State transition?
        var prevState = existing.officeState;
        existing.officeState = newState;
        existing.currentTicket = inProgress || inValidation || myTickets[0] || null;
        existing.isBlocked = !!blocked;
        existing.tickets = myTickets;
        existing.personality = personality;
        existing.emoji = da.emoji || '🤖';
        existing.name = da.name;
        existing.title = da.title;
        existing.team = da.team;

        if (prevState !== newState) {
          onStateTransition(existing, prevState, newState);
        }
        return existing;
      } else {
        // New agent — place at a random position in the lounge
        return {
          id: da.id,
          name: da.name,
          title: da.title,
          team: da.team,
          emoji: da.emoji || '🤖',
          personality: personality,
          officeState: newState,
          currentTicket: inProgress || inValidation || myTickets[0] || null,
          isBlocked: !!blocked,
          tickets: myTickets,
          x: 60 + Math.random() * 200,
          y: 700 + Math.random() * 100,
          targetX: 60 + Math.random() * 200,
          targetY: 700 + Math.random() * 100,
          speed: 1.2 + Math.random() * 0.6,
          direction: Math.random() > 0.5 ? 1 : -1,
          animFrame: 0,
          celebrationTimer: 0,
          activity: null,
          activityEnd: 0,
          speechBubble: null,
          speechEnd: 0,
          nextSpeechTime: Date.now() + 2000 + Math.random() * 5000,
          walking: false
        };
      }
    });

    agents = newAgents;
  }

  function onStateTransition(agent, fromState, toState) {
    // Set target based on new state
    switch (toState) {
      case 'working':
        assignDesk(agent);
        break;
      case 'reviewing':
        setTarget(agent, areaCenters.mission_ctrl.x + (Math.random() - 0.5) * 100, areaCenters.mission_ctrl.y + (Math.random() - 0.5) * 80);
        break;
      case 'blocked':
        // Stay near desk but pace
        setTarget(agent, agent.x + (Math.random() - 0.5) * 80, agent.y + (Math.random() - 0.5) * 40);
        break;
      case 'idle':
        // Will pick an idle activity
        pickIdleActivity(agent);
        break;
    }

    // Celebration on completion
    if (fromState === 'working' && toState === 'idle') {
      agent.celebrationTimer = 180; // 3 seconds at 60fps
      spawnConfetti(agent.x, agent.y - 20);
    }
  }

  // ═══ DESK ASSIGNMENT ═══
  var deskPositions = [];
  var deskIndex = 0;

  function initDesks() {
    if (deskPositions.length > 0) return;
    // Generate desk positions in the workstation area
    var area = AREAS.find(function(a) { return a.id === 'workstation'; });
    for (var row = 0; row < 6; row++) {
      for (var col = 0; col < 13; col++) {
        var dx = (area.gx + 1 + col * 4) * TILE;
        var dy = (area.gy + 1 + row * 2) * TILE;
        if (dx + 3 * TILE < (area.gx + area.gw) * TILE && dy + TILE < (area.gy + area.gh) * TILE) {
          deskPositions.push({ x: dx + TILE * 1.5, y: dy + TILE * 0.5 });
        }
      }
    }
  }

  function assignDesk(agent) {
    initDesks();
    if (deskPositions.length === 0) return;
    var desk = deskPositions[deskIndex % deskPositions.length];
    deskIndex++;
    setTarget(agent, desk.x, desk.y);
  }

  function setTarget(agent, tx, ty) {
    agent.targetX = tx;
    agent.targetY = ty;
    agent.walking = true;
  }

  // ═══ IDLE ACTIVITY SYSTEM ═══
  function pickIdleActivity(agent) {
    var weights = PERSONALITY_WEIGHTS[agent.personality] || PERSONALITY_WEIGHTS.worker;
    var activities = Object.keys(weights);
    var totalWeight = 0;
    activities.forEach(function(a) { totalWeight += weights[a]; });

    var r = Math.random() * totalWeight;
    var chosen = activities[0];
    for (var i = 0; i < activities.length; i++) {
      r -= weights[activities[i]];
      if (r <= 0) { chosen = activities[i]; break; }
    }

    var areaId = ACTIVITY_AREA[chosen] || 'lounge';
    var center = areaCenters[areaId] || areaCenters.lounge;

    agent.activity = { type: chosen, startTime: Date.now() };
    agent.activityEnd = Date.now() + 5000 + Math.random() * 15000; // 5-20 seconds
    setTarget(agent, center.x + (Math.random() - 0.5) * 60, center.y + (Math.random() - 0.5) * 40);
  }

  // ═══ UPDATE LOOP ═══
  function updateAgents() {
    var now = Date.now();

    agents.forEach(function(agent) {
      // Movement
      if (agent.walking) {
        var dx = agent.targetX - agent.x;
        var dy = agent.targetY - agent.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 3) {
          agent.walking = false;
          agent.x = agent.targetX;
          agent.y = agent.targetY;
        } else {
          var step = agent.speed;
          agent.x += (dx / dist) * step;
          agent.y += (dy / dist) * step;
          agent.direction = dx > 0 ? 1 : -1;
          agent.animFrame++;
        }
      } else {
        // Idle micro-movement (subtle bobbing)
        agent.animFrame++;
      }

      // Idle activity management
      if (agent.officeState === 'idle' && !agent.walking) {
        if (now > agent.activityEnd) {
          pickIdleActivity(agent);
        }
      }

      // Blocked pacing
      if (agent.officeState === 'blocked' && !agent.walking) {
        if (Math.random() < 0.01) {
          setTarget(agent, agent.x + (Math.random() - 0.5) * 100, agent.y + (Math.random() - 0.5) * 40);
        }
      }

      // Speech bubbles
      if (now > agent.nextSpeechTime && !agent.speechBubble) {
        generateSpeech(agent);
        agent.nextSpeechTime = now + 8000 + Math.random() * 20000; // 8-28 seconds
      }

      if (agent.speechBubble && now > agent.speechEnd) {
        agent.speechBubble = null;
      }

      // Celebration timer
      if (agent.celebrationTimer > 0) {
        agent.celebrationTimer--;
      }
    });

    // Update particles
    updateParticles();

    // Update bubbles (remove expired)
    bubbles = bubbles.filter(function(b) { return now < b.expires; });
  }

  function generateSpeech(agent) {
    var text = '';
    var type = 'normal';

    if (agent.officeState === 'working' && agent.currentTicket) {
      text = agent.currentTicket.title.substring(0, 40);
      type = 'working';
    } else if (agent.officeState === 'blocked') {
      text = 'Waiting for...';
      type = 'blocked';
    } else if (agent.officeState === 'reviewing') {
      text = 'Reviewing...';
      type = 'reviewing';
    } else if (agent.activity) {
      var chatter = CHATTER[agent.personality] || CHATTER.worker;
      if (Math.random() < 0.5) {
        text = chatter[Math.floor(Math.random() * chatter.length)];
      } else {
        text = IDLE_CHATTER[Math.floor(Math.random() * IDLE_CHATTER.length)];
      }
    } else {
      var chatter2 = CHATTER[agent.personality] || CHATTER.worker;
      text = chatter2[Math.floor(Math.random() * chatter2.length)];
    }

    if (!text) return;

    agent.speechBubble = { text: text, type: type };
    agent.speechEnd = Date.now() + 3000 + Math.random() * 2000;

    // Add to global bubble list for rendering
    if (bubbles.length >= MAX_BUBBLES) {
      bubbles.shift();
    }
    bubbles.push({
      agentId: agent.id,
      text: text,
      x: agent.x,
      y: agent.y - 30,
      expires: agent.speechEnd,
      type: type
    });
  }

  // ═══ PARTICLES ═══
  function spawnConfetti(x, y) {
    var colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4'];
    for (var i = 0; i < 15; i++) {
      particles.push({
        x: x,
        y: y,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 4 - 1,
        life: 60 + Math.random() * 30,
        maxLife: 90,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 3 + Math.random() * 3
      });
    }
  }

  function updateParticles() {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // gravity
      p.life--;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  // ═══ RENDER LOOP ═══
  function renderLoop() {
    animId = requestAnimationFrame(renderLoop);
    frameCount++;

    if (!canvas || !ctx) return;

    var cw = window.innerWidth;
    var ch = window.innerHeight;

    // Logic update at 2Hz
    if (frameCount % 30 === 0) {
      updateAgents();
    }

    // Clear
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cw, ch);

    // Apply camera
    ctx.save();
    ctx.translate(cw / 2, ch / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);

    // Draw cached map
    if (mapCache) {
      ctx.drawImage(mapCache, 0, 0);
    }

    // Draw agents (sorted by y for depth)
    var sortedAgents = agents.slice().sort(function(a, b) { return a.y - b.y; });
    sortedAgents.forEach(function(agent) {
      drawAgent(agent);
    });

    // Draw particles
    drawParticles();

    ctx.restore();

    // Draw UI overlay (not affected by camera)
    drawOverlay(cw, ch);
  }

  function drawAgent(agent) {
    var x = agent.x, y = agent.y;
    var bob = agent.walking ? Math.sin(agent.animFrame * 0.3) * 2 : Math.sin(frameCount * 0.05 + agent.id.charCodeAt(0)) * 0.5;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(x, y + 14, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body (pixel-style rectangle)
    var bodyX = x - 8, bodyY = y - 12 + bob;
    ctx.fillStyle = getAgentColor(agent);
    ctx.fillRect(bodyX, bodyY, 16, 20);

    // Head
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(bodyX + 2, bodyY - 6, 12, 8);

    // Emoji face
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(agent.emoji || '🤖', x, bodyY + 2);

    // Status circle
    var statusColor = STATUS_COLORS[agent.officeState] || '#64748b';
    ctx.fillStyle = statusColor;
    ctx.beginPath();
    ctx.arc(x, bodyY - 12, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0d1117';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Name label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(agent.name, x, y + 22);

    // Working: typing animation
    if (agent.officeState === 'working') {
      var typingOffset = Math.floor(frameCount / 10) % 2;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(bodyX + 4, bodyY + 22 + typingOffset, 8, 2);
    }

    // Celebration
    if (agent.celebrationTimer > 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('★ DONE!', x, bodyY - 20);
    }

    // Blocked: red exclamation
    if (agent.officeState === 'blocked') {
      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 12px monospace';
      ctx.fillText('!', x, bodyY - 18);
    }

    // Speech bubble
    if (agent.speechBubble) {
      drawSpeechBubble(x, bodyY - 28, agent.speechBubble.text, agent.speechBubble.type);
    }
  }

  function getAgentColor(agent) {
    var teamColors = {
      'Leadership': '#3b82f6',
      'Project': '#22c55e',
      'Research': '#a855f7',
      'Finance': '#f59e0b',
      'Security': '#ef4444',
      'Operations': '#06b6d4'
    };
    return teamColors[agent.team] || '#64748b';
  }

  function drawSpeechBubble(cx, cy, text, type) {
    var maxW = 120;
    var padding = 5;
    ctx.font = '9px monospace';

    // Word wrap
    var words = text.split(' ');
    var lines = [];
    var currentLine = '';
    words.forEach(function(word) {
      var test = currentLine ? currentLine + ' ' + word : word;
      if (ctx.measureText(test).width > maxW - padding * 2) {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    });
    if (currentLine) lines.push(currentLine);

    var lineHeight = 12;
    var maxLineWidth = 0;
    lines.forEach(function(l) { var w = ctx.measureText(l).width; if (w > maxLineWidth) maxLineWidth = w; });
    var bubbleW = Math.min(maxW, maxLineWidth + padding * 2);
    var bubbleH = lines.length * lineHeight + padding * 2;
    var bx = cx - bubbleW / 2;
    var by = cy - bubbleH - 5;

    // Bubble background
    ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
    ctx.strokeStyle = type === 'blocked' ? '#ef4444' : (type === 'working' ? '#22c55e' : '#3b82f6');
    ctx.lineWidth = 1;

    // Rounded rect
    var r = 5;
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bubbleW - r, by);
    ctx.quadraticCurveTo(bx + bubbleW, by, bx + bubbleW, by + r);
    ctx.lineTo(bx + bubbleW, by + bubbleH - r);
    ctx.quadraticCurveTo(bx + bubbleW, by + bubbleH, bx + bubbleW - r, by + bubbleH);
    ctx.lineTo(bx + r, by + bubbleH);
    ctx.quadraticCurveTo(bx, by + bubbleH, bx, by + bubbleH - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Tail
    ctx.fillStyle = 'rgba(13, 17, 23, 0.9)';
    ctx.beginPath();
    ctx.moveTo(cx - 4, by + bubbleH);
    ctx.lineTo(cx, by + bubbleH + 6);
    ctx.lineTo(cx + 4, by + bubbleH);
    ctx.closePath();
    ctx.fill();

    // Text
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    lines.forEach(function(line, i) {
      ctx.fillText(line, cx, by + padding + 9 + i * lineHeight);
    });
  }

  function drawParticles() {
    particles.forEach(function(p) {
      var alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
  }

  // ═══ OVERLAY UI ═══
  function drawOverlay(cw, ch) {
    // Stats panel (top-left)
    var working = agents.filter(function(a) { return a.officeState === 'working'; }).length;
    var idle = agents.filter(function(a) { return a.officeState === 'idle'; }).length;
    var blocked = agents.filter(function(a) { return a.officeState === 'blocked'; }).length;
    var reviewing = agents.filter(function(a) { return a.officeState === 'reviewing'; }).length;

    var statsX = 10, statsY = 10;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(statsX, statsY, 130, 72);
    ctx.strokeStyle = '#1e2d3d';
    ctx.lineWidth = 1;
    ctx.strokeRect(statsX, statsY, 130, 72);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText('🏢 OFFICE', statsX + 8, statsY + 14);

    ctx.font = '9px monospace';
    ctx.fillStyle = '#22c55e';
    ctx.fillText('● Working: ' + working, statsX + 8, statsY + 28);
    ctx.fillStyle = '#eab308';
    ctx.fillText('● Idle: ' + idle, statsX + 8, statsY + 40);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('● Blocked: ' + blocked, statsX + 8, statsY + 52);
    ctx.fillStyle = '#a855f7';
    ctx.fillText('● Review: ' + reviewing, statsX + 8, statsY + 64);

    // Legend (bottom-left)
    var legX = 10, legY = ch - 50;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(legX, legY, 120, 42);
    ctx.strokeStyle = '#1e2d3d';
    ctx.strokeRect(legX, legY, 120, 42);

    ctx.font = '8px monospace';
    var legendItems = [
      { color: '#22c55e', label: 'Working' },
      { color: '#eab308', label: 'Idle' },
      { color: '#ef4444', label: 'Blocked' },
      { color: '#a855f7', label: 'Review' }
    ];
    legendItems.forEach(function(item, i) {
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.arc(legX + 10, legY + 10 + i * 10, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(item.label, legX + 18, legY + 13 + i * 10);
    });

    // Minimap (bottom-right)
    var mmW = 160, mmH = 100;
    var mmX = cw - mmW - 10, mmY = ch - mmH - 10;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(mmX, mmY, mmW, mmH);
    ctx.strokeStyle = '#1e2d3d';
    ctx.strokeRect(mmX, mmY, mmW, mmH);

    var scaleX = mmW / MAP_W, scaleY = mmH / MAP_H;

    // Areas on minimap
    AREAS.forEach(function(a) {
      ctx.fillStyle = a.color + '80';
      ctx.fillRect(mmX + a.gx * TILE * scaleX, mmY + a.gy * TILE * scaleY, a.gw * TILE * scaleX, a.gh * TILE * scaleY);
    });

    // Agents on minimap
    agents.forEach(function(a) {
      ctx.fillStyle = STATUS_COLORS[a.officeState] || '#64748b';
      ctx.fillRect(mmX + a.x * scaleX - 1, mmY + a.y * scaleY - 1, 3, 3);
    });

    // Camera viewport on minimap
    var vpW = (cw / cam.zoom) * scaleX;
    var vpH = (ch / cam.zoom) * scaleY;
    var vpX = mmX + cam.x * scaleX;
    var vpY = mmY + cam.y * scaleY;
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(vpX, vpY, vpW, vpH);

    // Re-center button (top-right, below zoom)
    var rcX = cw - 100, rcY = 10, rcW = 90, rcH = 24;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(rcX, rcY, rcW, rcH);
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1;
    ctx.strokeRect(rcX, rcY, rcW, rcH);
    ctx.fillStyle = '#e2e8f0';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⌖ Recenter', rcX + rcW / 2, rcY + 16);
    // Store button bounds for click detection
    officeBtns.recenter = { x: rcX, y: rcY, w: rcW, h: rcH };

    // Zoom controls (top-right, below recenter)
    var zX = cw - 100, zY = 40, zW = 90, zH = 24;
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.fillRect(zX, zY, zW, zH);
    ctx.strokeStyle = '#1e2d3d';
    ctx.strokeRect(zX, zY, zW, zH);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🔍 ' + Math.round(cam.zoom * 100) + '%', zX + zW / 2, zY + 16);
    officeBtns.zoom = { x: zX, y: zY, w: zW, h: zH };

    // Zoom indicator (bottom-right above minimap)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '8px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Scroll to zoom · Drag to pan', cw - 14, ch - 116);
    ctx.textAlign = 'left';
  }

  // ═══ INIT CAMERA ═══
  var cameraInitialized = false;
  function initCamera() {
    if (!canvas) return;
    // Use window dimensions since parent may be hidden (display:none)
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    cam.x = MAP_W / 2 - vw / 2;
    cam.y = MAP_H / 2 - vh / 2;
    cam.zoom = Math.min(vw / MAP_W, vh / MAP_H) * 0.85;
    clampCam();
    cameraInitialized = true;
  }

  // Override officeInit to include camera init
  var _officeInit = officeInit;
  officeInit = function(canvasEl) {
    _officeInit(canvasEl);
    // Defer camera init to next frame so layout is settled
    requestAnimationFrame(function() {
      initCamera();
      resizeCanvas();
    });
  };

  // ═══ EXPOSE PUBLIC API ═══
  return {
    init: officeInit,
    destroy: officeDestroy,
    refresh: officeRefresh
  };

})();

// Global functions for HTML integration
function officeInit(canvasEl) { Office.init(canvasEl); }
function officeDestroy() { Office.destroy(); }
function officeRefresh(data) { Office.refresh(data); }
