/**
 * @file main.js  (2D Canvas Edition)
 * @brief Top-down animated parking lot — no Three.js, pure Canvas 2D + GSAP
 *
 * Features:
 *  - 2D top-down parking lot drawn on HTML Canvas
 *  - Car animation: drives down entrance lane → turns right into row → parks in slot
 *  - Remove animation: reverses out → turns left → exits up
 *  - BFS path highlighted in yellow before car follows it
 *  - DFS traversal: slots flash purple in order
 *  - Live dashboard with GSAP animated counters
 */

'use strict';

const API_BASE = 'http://localhost:3001';

// ═══════════════════════════════════════════════════════════════════
// LAYOUT: all pixel dimensions for the 680×470 canvas
// ═══════════════════════════════════════════════════════════════════
const ROWS = 4, COLS = 5, TOTAL = 20;

// Slot dimensions
const SLOT_W   = 103;   // pixel width  of one slot
const SLOT_H   = 56;    // pixel height of one slot
const SLOT_GAP = 6;     // gap between adjacent slots (H)
const AISLE_H  = 34;    // height of each horizontal driving aisle

// Grid origin (top-left of first parking slot)
const LOT_X   = 68;     // x = left edge of slot 0
const TOP_OFF  = 88;    // y offset where aisles+rows begin

// Left entrance lane
const LANE_CX  = 28;    // center-x of the vertical entrance lane
const LANE_W   = 24;    // visual width of entrance lane
const ENTRY_Y  = 18;    // y where cars first appear (entrance arrow)

// Derived slot helper
function slotRect(id) {
    const col = id % COLS;
    const row = Math.floor(id / COLS);
    return {
        x: LOT_X + col * (SLOT_W + SLOT_GAP),
        y: TOP_OFF + row * (AISLE_H + SLOT_H) + AISLE_H,
        w: SLOT_W,
        h: SLOT_H
    };
}
function slotCenter(id) {
    const r = slotRect(id);
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}
// Center Y of the horizontal aisle above row `row`
function aisleCenter(row) {
    return TOP_OFF + row * (AISLE_H + SLOT_H) + AISLE_H / 2;
}

// ═══════════════════════════════════════════════════════════════════
// APP STATE
// ═══════════════════════════════════════════════════════════════════
const state = {
    slots:         Array(TOTAL).fill(false),
    plates:        Array(TOTAL).fill(''),
    occupiedCount: 0,
    cacheHits:     0,
    cacheMisses:   0,
    lruCache:      []
};

// Parked cars stored by slotId  →  { color, plate }
const parkedCars = {};

// Slots currently highlighted for BFS path (yellow) or DFS flash (purple)
const bfsHighlight = new Set();   // yellow path preview
const dfsFlash     = new Set();   // purple DFS flash

// Car animation object (only one car animates at a time)
let animCar = null;

// Canvas references
let canvas, ctx;
const CANVAS_W = 680, CANVAS_H = 470;

// Colour palette for arriving cars
const CAR_PALETTE = [
    '#3b82f6', '#a855f7', '#ec4899', '#f97316',
    '#10b981', '#f59e0b', '#06b6d4', '#84cc16'
];
let carColorIdx = 0;

// ═══════════════════════════════════════════════════════════════════
// HELPER: smooth rounded-rect path
// ═══════════════════════════════════════════════════════════════════
function rrect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x,     y + h, x,     y + h - r, r);
    ctx.lineTo(x,     y + r);
    ctx.arcTo(x,     y,     x + r, y,         r);
    ctx.closePath();
}

// ═══════════════════════════════════════════════════════════════════
// DRAWING: Background, grid, aisles, entrance
// ═══════════════════════════════════════════════════════════════════
function drawBackground() {
    // Canvas fill
    ctx.fillStyle = '#070c18';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Subtle dot-grid
    ctx.fillStyle = 'rgba(255,255,255,0.025)';
    for (let x = 0; x < CANVAS_W; x += 36) {
        for (let y = 0; y < CANVAS_H; y += 36) {
            ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
        }
    }

    // Lot floor
    const lotH = ROWS * (AISLE_H + SLOT_H) + 4;
    rrect(ctx, LOT_X - 8, TOP_OFF - 4, COLS * (SLOT_W + SLOT_GAP) - SLOT_GAP + 16, lotH, 12);
    ctx.fillStyle = '#0b1220';
    ctx.fill();

    // Horizontal aisle lanes
    for (let r = 0; r < ROWS; r++) {
        const ay = TOP_OFF + r * (AISLE_H + SLOT_H);
        ctx.fillStyle = '#0f1828';
        ctx.fillRect(LOT_X - 6, ay, COLS * (SLOT_W + SLOT_GAP) - SLOT_GAP + 12, AISLE_H);

        // Dashed centre line in aisle
        ctx.save();
        ctx.setLineDash([10, 12]);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(LOT_X - 5, ay + AISLE_H / 2);
        ctx.lineTo(LOT_X + COLS * (SLOT_W + SLOT_GAP) - SLOT_GAP + 5, ay + AISLE_H / 2);
        ctx.stroke();
        ctx.restore();
    }

    // Vertical entrance lane (left side)
    rrect(ctx, LANE_CX - LANE_W / 2, ENTRY_Y - 6, LANE_W,
          TOP_OFF + ROWS * (AISLE_H + SLOT_H) - ENTRY_Y + 10, 7);
    ctx.fillStyle = '#101a2a';
    ctx.fill();

    // Lane dashed centre line
    ctx.save();
    ctx.setLineDash([8, 10]);
    ctx.strokeStyle = 'rgba(245,158,11,0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(LANE_CX, ENTRY_Y + 2);
    ctx.lineTo(LANE_CX, TOP_OFF + ROWS * (AISLE_H + SLOT_H));
    ctx.stroke();
    ctx.restore();

    // Entrance arrow + label
    drawEntrance();
}

function drawEntrance() {
    // Arrow pointing DOWN into the lane
    ctx.save();
    ctx.fillStyle = '#f59e0b';
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 12;

    ctx.beginPath();
    ctx.moveTo(LANE_CX,      ENTRY_Y + 2);
    ctx.lineTo(LANE_CX - 7,  ENTRY_Y - 12);
    ctx.lineTo(LANE_CX + 7,  ENTRY_Y - 12);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 8px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ENTRANCE', LANE_CX, ENTRY_Y - 16);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════
// DRAWING: Parking Slots
// ═══════════════════════════════════════════════════════════════════
function drawSlots() {
    for (let id = 0; id < TOTAL; id++) {
        const r   = slotRect(id);
        const occ = state.slots[id];
        const isBFS = bfsHighlight.has(id);
        const isDFS = dfsFlash.has(id);

        // Slot fill
        let fill, stroke, gColour;
        if (isDFS)      { fill = 'rgba(168,85,247,0.22)'; stroke = '#a855f7'; gColour = '#a855f7'; }
        else if (isBFS) { fill = 'rgba(245,158,11,0.18)'; stroke = '#f59e0b'; gColour = '#f59e0b'; }
        else if (occ)   { fill = 'rgba(239,68,68,0.14)';  stroke = '#ef4444'; gColour = '#ef4444'; }
        else            { fill = 'rgba(0,229,204,0.07)';   stroke = '#00e5cc'; gColour = '#00e5cc'; }

        ctx.save();
        ctx.shadowColor = gColour;
        ctx.shadowBlur  = (isBFS || isDFS) ? 14 : (occ ? 9 : 6);

        rrect(ctx, r.x, r.y, r.w, r.h, 5);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth   = isBFS || isDFS ? 2 : 1.2;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.restore();

        // Slot separator lines between adjacent slots
        if (id % COLS < COLS - 1) {
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth   = 1;
            const sx = r.x + r.w + SLOT_GAP / 2;
            ctx.beginPath();
            ctx.moveTo(sx, r.y + 5);
            ctx.lineTo(sx, r.y + r.h - 5);
            ctx.stroke();
        }

        // Slot number
        ctx.font = 'bold 12px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = occ ? 'rgba(239,68,68,0.75)' : 'rgba(0,229,204,0.6)';
        ctx.fillText(id + 1, r.x + r.w / 2, r.y + r.h / 2 - (occ && state.plates[id] ? 7 : 0));

        // Plate label under number
        if (occ && state.plates[id] && !parkedCars[id]) {
            ctx.font = '7px Inter, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fillText(state.plates[id].slice(0, 9), r.x + r.w / 2, r.y + r.h / 2 + 8);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════
// DRAWING: Car (top-down view, angle=0 → facing RIGHT)
// ═══════════════════════════════════════════════════════════════════
const CAR_L = 48;   // car length (front→back along X axis when angle=0)
const CAR_W = 24;   // car width

function drawCar(x, y, angle, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // Shadow / glow
    ctx.shadowColor = color;
    ctx.shadowBlur  = 18;

    // Body
    ctx.fillStyle = color;
    rrect(ctx, -CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Roof shine
    const shine = ctx.createLinearGradient(-CAR_L / 2, -CAR_W / 2, CAR_L / 2, CAR_W / 2);
    shine.addColorStop(0, 'rgba(255,255,255,0.18)');
    shine.addColorStop(1, 'rgba(255,255,255,0.03)');
    ctx.fillStyle = shine;
    rrect(ctx, -CAR_L / 2, -CAR_W / 2, CAR_L, CAR_W, 5);
    ctx.fill();

    // Windshield (front = right side when angle=0: positive X)
    ctx.fillStyle = 'rgba(155,215,255,0.55)';
    rrect(ctx, CAR_L / 2 - 17, -CAR_W / 2 + 4, 15, CAR_W - 8, 3);
    ctx.fill();

    // Rear window (left side: negative X)
    ctx.fillStyle = 'rgba(100,160,210,0.3)';
    rrect(ctx, -CAR_L / 2 + 2, -CAR_W / 2 + 4, 13, CAR_W - 8, 3);
    ctx.fill();

    // Cabin body highlight
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    rrect(ctx, -CAR_L / 2 + 16, -CAR_W / 2 + 4, CAR_L - 34, CAR_W - 8, 3);
    ctx.fill();

    // 4 Wheels (dark rects at corners)
    ctx.fillStyle = '#0a0d18';
    [
        [CAR_L / 2 - 13,  -CAR_W / 2 - 1, 11, 6],   // front-top
        [CAR_L / 2 - 13,   CAR_W / 2 - 5, 11, 6],   // front-bottom
        [-CAR_L / 2 + 2,  -CAR_W / 2 - 1, 11, 6],   // rear-top
        [-CAR_L / 2 + 2,   CAR_W / 2 - 5, 11, 6]    // rear-bottom
    ].forEach(([wx, wy, ww, wh]) => {
        rrect(ctx, wx, wy, ww, wh, 2); ctx.fill();
    });

    // Headlights (front = right: x ≈ CAR_L/2)
    ctx.shadowColor = '#fffaaa'; ctx.shadowBlur = 10;
    ctx.fillStyle   = '#fffaaa';
    ctx.beginPath(); ctx.arc(CAR_L / 2 - 1, -CAR_W / 2 + 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(CAR_L / 2 - 1,  CAR_W / 2 - 5, 3, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    // Tail lights (rear = left: x ≈ -CAR_L/2)
    ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 8;
    ctx.fillStyle   = '#ff3030';
    ctx.beginPath(); ctx.arc(-CAR_L / 2 + 2, -CAR_W / 2 + 5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(-CAR_L / 2 + 2,  CAR_W / 2 - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
}

function drawAllParkedCars() {
    Object.entries(parkedCars).forEach(([id, car]) => {
        if (!car) return;
        const c = slotCenter(parseInt(id));
        // Parked: facing down (angle = π/2) — nose into slot
        drawCar(c.x, c.y, Math.PI / 2, car.color);
    });
}

function drawAnimatingCar() {
    if (!animCar || !animCar.active) return;
    drawCar(animCar.x, animCar.y, animCar.angle, animCar.color);
}

// ═══════════════════════════════════════════════════════════════════
// ANIMATION: Waypoint-based path follower
// ═══════════════════════════════════════════════════════════════════

// Ease in-out cubic
function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function lerp(a, b, t) { return a + (b - a) * t; }

/**
 * Return waypoints for PARKING a car into `slotId`.
 * Path:  [entrance] → [left lane at row level] → [aisle at column] → [slot centre]
 */
function parkWaypoints(slotId) {
    const col  = slotId % COLS;
    const row  = Math.floor(slotId / COLS);
    const sc   = slotCenter(slotId);
    const ay   = aisleCenter(row);
    return [
        { x: LANE_CX, y: ENTRY_Y },        // 1. Appear at entrance
        { x: LANE_CX, y: ay },             // 2. Drive DOWN left lane to row level
        { x: sc.x,    y: ay },             // 3. Turn RIGHT, drive across aisle to column
        { x: sc.x,    y: sc.y }            // 4. Turn DOWN, drive into slot
    ];
}

/**
 * Return waypoints for REMOVING a car from `slotId`.
 * Path:  [slot centre] → [aisle level] → [left lane] → [exit above canvas]
 */
function removeWaypoints(slotId) {
    const sc = slotCenter(slotId);
    const ay = aisleCenter(Math.floor(slotId / COLS));
    return [
        { x: sc.x,    y: sc.y },           // 1. From slot
        { x: sc.x,    y: ay },             // 2. Reverse UP to aisle
        { x: LANE_CX, y: ay },             // 3. Drive LEFT to entrance lane
        { x: LANE_CX, y: ENTRY_Y - 10 }   // 4. Drive UP, exit canvas
    ];
}

function startAnimation(waypoints, color, speed, onComplete) {
    animCar = {
        active:     true,
        waypoints:  waypoints,
        wpIdx:      0,
        t:          0,
        speed:      speed || 0.022,
        color:      color,
        x:          waypoints[0].x,
        y:          waypoints[0].y,
        angle:      Math.PI / 2,   // start facing down
        onComplete: onComplete
    };
}

function stepAnimation() {
    if (!animCar || !animCar.active) return;
    const wp  = animCar.waypoints;
    const idx = animCar.wpIdx;

    if (idx >= wp.length - 1) {
        animCar.active = false;
        if (animCar.onComplete) animCar.onComplete();
        return;
    }

    const from = wp[idx];
    const to   = wp[idx + 1];

    animCar.t += animCar.speed;
    if (animCar.t >= 1) {
        // Snap to target waypoint, advance to next segment
        animCar.t      = 0;
        animCar.x      = to.x;
        animCar.y      = to.y;
        animCar.wpIdx++;

        if (animCar.wpIdx >= wp.length - 1) {
            animCar.active = false;
            if (animCar.onComplete) animCar.onComplete();
        }
        return;
    }

    const te       = ease(animCar.t);
    animCar.x      = lerp(from.x, to.x, te);
    animCar.y      = lerp(from.y, to.y, te);

    // Compute angle from direction of motion
    const dx = to.x - from.x, dy = to.y - from.y;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
        animCar.angle = Math.atan2(dy, dx);
    }
}

// ═══════════════════════════════════════════════════════════════════
// MAIN RENDER LOOP
// ═══════════════════════════════════════════════════════════════════
function renderLoop() {
    requestAnimationFrame(renderLoop);
    stepAnimation();

    // Clear + draw everything each frame
    drawBackground();
    drawSlots();
    drawAllParkedCars();
    drawAnimatingCar();
}

// ═══════════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════════
async function apiPark(plate) {
    const r = await fetch(`${API_BASE}/parkVehicle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate })
    });
    return r.json();
}
async function apiRemove(plate) {
    const r = await fetch(`${API_BASE}/removeVehicle`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate })
    });
    return r.json();
}
async function apiStatus() { return (await fetch(`${API_BASE}/getStatus`)).json(); }
async function apiDFS()    { return (await fetch(`${API_BASE}/dfsTraversal`)).json(); }

// ═══════════════════════════════════════════════════════════════════
// STATE SYNC
// ═══════════════════════════════════════════════════════════════════
async function syncStatus() {
    try {
        const data = await apiStatus();
        if (!data.success) return;
        data.slots.forEach(s => { state.slots[s.id] = s.occupied; state.plates[s.id] = s.plate; });
        state.occupiedCount = data.occupiedCount;
        state.cacheHits     = data.cacheHits;
        state.cacheMisses   = data.cacheMisses;
        state.lruCache      = data.lruCache || [];
        updateDashboard();
    } catch (e) { console.warn('Sync failed:', e.message); }
}

// ═══════════════════════════════════════════════════════════════════
// DASHBOARD UPDATES
// ═══════════════════════════════════════════════════════════════════
function updateDashboard() {
    animCounter('stat-occupied',   state.occupiedCount);
    animCounter('stat-available',  TOTAL - state.occupiedCount);
    animCounter('stat-hits',       state.cacheHits);
    animCounter('stat-misses',     state.cacheMisses);
    animCounter('stat-cache-size', (state.lruCache || []).length);

    const pct  = Math.round((state.occupiedCount / TOTAL) * 100);
    const fill = document.getElementById('progress-fill');
    document.getElementById('stat-occupancy-pct').textContent = pct + '%';
    gsap.to(fill, { width: pct + '%', duration: 0.7, ease: 'power2.out' });

    updateLRUList();
    updateVehiclesList();
    updateSlotGrid();
}

function animCounter(id, target) {
    const el = document.getElementById(id);
    if (!el) return;
    const curr = parseFloat(el.textContent) || 0;
    gsap.to({ v: curr }, {
        v: target, duration: 0.65, ease: 'power2.out',
        onUpdate: function () { el.textContent = Math.round(this.targets()[0].v); }
    });
}

function updateLRUList() {
    const el  = document.getElementById('lru-list');
    const lru = state.lruCache || [];
    if (!lru.length) { el.innerHTML = '<div class="no-vehicles">Cache is empty</div>'; return; }
    el.innerHTML = lru.map((item, i) => `
        <div class="lru-item">
            ${i === 0 ? '<span class="lru-badge">MRU</span>' : ''}
            <span class="lru-plate">${item.plate}</span>
            <span class="lru-slot">S${item.slot + 1}</span>
        </div>`).join('');
}

function updateVehiclesList() {
    const el     = document.getElementById('vehicles-list');
    const parked = state.plates.map((p, i) => p ? { plate: p, slot: i } : null).filter(Boolean);
    if (!parked.length) { el.innerHTML = '<div class="no-vehicles">No vehicles parked</div>'; return; }
    el.innerHTML = parked.map(v => `
        <div class="vehicle-item" onclick="_quickRemove('${v.plate}')" title="Click to remove">
            <div class="vehicle-dot"></div>
            <span class="vehicle-plate">${v.plate}</span>
            <span class="vehicle-slot">S${v.slot + 1}</span>
        </div>`).join('');
}

function updateSlotGrid() {
    const el = document.getElementById('slot-grid');
    el.innerHTML = state.slots.map((occ, i) => `
        <div style="aspect-ratio:1;border-radius:4px;
            background:${occ ? 'rgba(239,68,68,0.35)' : 'rgba(0,229,204,0.18)'};
            border:1px solid ${occ ? 'rgba(239,68,68,0.55)' : 'rgba(0,229,204,0.4)'};
            display:flex;align-items:center;justify-content:center;
            font-size:8px;font-weight:700;
            color:${occ ? '#ef4444' : '#00e5cc'};
            cursor:pointer;transition:transform 0.15s;"
            onmouseover="this.style.transform='scale(1.2)'"
            onmouseout="this.style.transform='scale(1)'" >${i + 1}</div>`).join('');
}

// ═══════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════
function showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 400); }, 3600);
}

function setLoading(on) {
    ['btn-park', 'btn-remove', 'btn-dfs'].forEach(id => {
        document.getElementById(id).disabled = on;
    });
}

// ═══════════════════════════════════════════════════════════════════
// ACTIONS
// ═══════════════════════════════════════════════════════════════════

async function handlePark() {
    const input = document.getElementById('park-input');
    const plate = input.value.trim().toUpperCase().replace(/\s/g, '');
    if (!plate || plate.length < 3) { showToast('Enter a valid license plate', 'error'); return; }

    setLoading(true);
    try {
        const data = await apiPark(plate);

        if (data.success) {
            const sid   = data.slotId;
            const color = CAR_PALETTE[carColorIdx++ % CAR_PALETTE.length];

            // Update state immediately
            state.slots[sid]   = true;
            state.plates[sid]  = plate;
            state.occupiedCount++;
            state.cacheHits    = data.cacheHits;
            state.cacheMisses  = data.cacheMisses;
            state.lruCache     = data.lruCache || [];
            input.value         = '';

            // Highlight BFS path in YELLOW for 800ms before car moves
            const path = data.path || [sid];
            path.forEach(id => bfsHighlight.add(id));

            setTimeout(() => {
                path.forEach(id => bfsHighlight.delete(id));

                // Animate car along parking waypoints
                startAnimation(parkWaypoints(sid), color, 0.02, () => {
                    parkedCars[sid] = { color, plate };
                    setLoading(false);
                    updateDashboard();
                    showToast(`✅ ${plate} parked at Slot ${data.slotLabel}`, 'success');
                    if (data.cacheHit) showToast('⚡ LRU Cache HIT — vehicle history found!', 'info');
                });
            }, 800);

            updateVehiclesList();
            updateSlotGrid();
            showToast(`🔍 BFS path: [${path.map(p => p + 1).join(' → ')}]`, 'info');

        } else {
            showToast(`❌ ${data.message}`, 'error');
            setLoading(false);
        }
    } catch (e) {
        showToast('⚠️ Server not reachable — is Node.js running?', 'error');
        setLoading(false);
    }
}

async function handleRemove() {
    const input = document.getElementById('remove-input');
    const plate = input.value.trim().toUpperCase().replace(/\s/g, '');
    if (!plate) { showToast('Enter a license plate to remove', 'error'); return; }

    setLoading(true);
    try {
        const data = await apiRemove(plate);

        if (data.success) {
            const sid    = data.slotId;
            const stored = parkedCars[sid];
            const color  = stored ? stored.color : '#3b82f6';

            // Remove from parkedCars so it's drawn by animatingCar instead
            delete parkedCars[sid];
            state.slots[sid]   = false;
            state.plates[sid]  = '';
            state.occupiedCount--;
            state.cacheHits    = data.cacheHits;
            state.cacheMisses  = data.cacheMisses;
            state.lruCache     = data.lruCache || [];
            input.value         = '';

            startAnimation(removeWaypoints(sid), color, 0.025, () => {
                setLoading(false);
                updateDashboard();
                showToast(`🚗 ${plate} left Slot ${data.slotLabel}`, 'success');
            });

            updateVehiclesList();
            updateSlotGrid();
        } else {
            showToast(`❌ ${data.message}`, 'error');
            setLoading(false);
        }
    } catch (e) {
        showToast('⚠️ Server not reachable', 'error');
        setLoading(false);
    }
}

async function handleDFS() {
    setLoading(true);
    try {
        const data = await apiDFS();
        if (data.success) {
            const order = data.dfsTraversal;

            // Flash slots sequentially in purple (DFS order)
            order.forEach((id, i) => {
                setTimeout(() => {
                    dfsFlash.add(id);
                    setTimeout(() => dfsFlash.delete(id), 380);
                }, i * 130);
            });

            // Show DFS path in panel
            const panel = document.getElementById('dfs-panel');
            panel.classList.add('active');
            document.getElementById('dfs-path-display').innerHTML = order.map((id, i) => `
                <div class="dfs-node">${id + 1}</div>
                ${i < order.length - 1 ? '<div class="dfs-arrow">›</div>' : ''}`).join('');

            showToast(`🔍 DFS visited ${order.length} slots`, 'info');
        }
    } catch (e) { showToast('⚠️ DFS failed', 'error'); }
    setLoading(false);
}

// ═══════════════════════════════════════════════════════════════════
// CANVAS CLICK — inspect or quick-select a slot
// ═══════════════════════════════════════════════════════════════════
function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_W / rect.width;
    const scaleY = CANVAS_H / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top)  * scaleY;

    for (let i = 0; i < TOTAL; i++) {
        const r = slotRect(i);
        if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
            if (state.plates[i]) {
                document.getElementById('remove-input').value = state.plates[i];
                showToast(`Slot ${i + 1}: ${state.plates[i]} — click Remove to free`, 'info');
            } else {
                showToast(`Slot ${i + 1} is available ✓`, 'success');
            }
            break;
        }
    }
}

// Global quick-remove (called from vehicle-list onclick)
window._quickRemove = (plate) => {
    document.getElementById('remove-input').value = plate;
    handleRemove();
};

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
async function init() {
    canvas = document.getElementById('parking-canvas');
    ctx    = canvas.getContext('2d');
    canvas.addEventListener('click', onCanvasClick);

    // Load initial state from server
    await syncStatus();

    // If there were vehicles already parked (from persistent state),
    // draw them as static parked cars
    state.plates.forEach((plate, id) => {
        if (plate) {
            const color = CAR_PALETTE[carColorIdx++ % CAR_PALETTE.length];
            parkedCars[id] = { color, plate };
        }
    });

    // Bind UI events
    document.getElementById('btn-park')    .addEventListener('click', handlePark);
    document.getElementById('btn-remove')  .addEventListener('click', handleRemove);
    document.getElementById('btn-dfs')     .addEventListener('click', handleDFS);
    document.getElementById('park-input')  .addEventListener('keydown', e => e.key === 'Enter' && handlePark());
    document.getElementById('remove-input').addEventListener('keydown', e => e.key === 'Enter' && handleRemove());

    // Start render loop
    renderLoop();

    // Dismiss loading screen
    const ls = document.getElementById('loading-screen');
    gsap.to(ls, {
        opacity: 0, duration: 0.8, delay: 0.5,
        onComplete: () => ls.remove()
    });

    // Entrance animations for panels
    gsap.from('#control-panel .glass-card', {
        x: -60, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.6
    });
    gsap.from('#dashboard .glass-card', {
        x: 60, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.08, delay: 0.6
    });
    gsap.from('#canvas-area', {
        opacity: 0, scale: 0.97, duration: 0.8, ease: 'power3.out', delay: 0.5
    });

    // Auto refresh every 30s
    setInterval(syncStatus, 30000);
}

init().catch(console.error);
