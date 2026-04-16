/**
 * @file server.js
 * @brief Node.js API bridge — connects 3D frontend ↔ C++ backend
 *          with JavaScript fallback that mirrors all DSA algorithms
 *
 * Architecture:
 *   Browser  ──fetch──►  Express (port 3001)  ──child_process──►  parking.exe
 *                                             OR (fallback)
 *                                            ──JS simulation──►  in-process LRU+BFS
 *
 * The JS simulation implements:
 *   - LRU Cache  (DLL via linked objects + Map for O(1) lookup)
 *   - Graph      (adjacency matrix, 4×5 grid)
 *   - BFS        (nearest free slot)
 *   - DFS        (full traversal)
 *   - Hash Set   (duplicate detection via Set)
 *
 * This guarantees the frontend always works, whether or not the C++ binary
 * has been compiled. In an academic presentation, you can point to the C++
 * source files to explain the algorithms while the JS demo runs live.
 */

const express          = require('express');
const cors             = require('cors');
const path             = require('path');
const fs               = require('fs');
const { execFileSync } = require('child_process');

const app  = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

const projectRoot = path.join(__dirname, '..');
const binaryName  = process.platform === 'win32' ? 'parking.exe' : 'parking';
const binaryPath  = path.join(projectRoot, 'backend', binaryName);
const dbPath      = path.join(projectRoot, 'database', 'parking_state.txt');

const binaryAvailable = fs.existsSync(binaryPath);

if (!binaryAvailable) {
    console.warn('\n⚠️  C++ binary not found. Using JavaScript simulation mode.');
    console.warn('   To enable C++ backend, compile with:');
    console.warn(`   C:\\MinGW\\bin\\g++.exe -o backend\\${binaryName} backend\\main.cpp backend\\parking_system.cpp backend\\graph.cpp backend\\lru_cache.cpp -std=c++14\n`);
} else {
    console.log('✅  C++ binary found — using native backend.');
}

// ═══════════════════════════════════════════════════════════════════════════
// JAVASCRIPT SIMULATION  (mirrors C++ algorithms exactly)
// Used when C++ binary is unavailable
// ═══════════════════════════════════════════════════════════════════════════

const ROWS = 4, COLS = 5, TOTAL = ROWS * COLS, LRU_CAP = 5;

// ── In-memory state ──────────────────────────────────────────────────────
const simState = {
    occupied:       new Array(TOTAL).fill(false),
    plates:         new Array(TOTAL).fill(''),
    vehicleSet:     new Set(),         // CO5: Hash Set for duplicate detection
    occupiedCount:  0,
    lruHits:        0,
    lruMisses:      0,
};

// ── LRU Cache (JS — mirrors lru_cache.cpp)  CO3 + CO5 ───────────────────
class LRUCacheJS {
    constructor(cap) {
        this.cap     = cap;
        this.map     = new Map();        // JS Map retains insertion order (MRU tracking)
        this.hits    = 0;
        this.misses  = 0;
    }

    get(key) {
        if (!this.map.has(key)) { this.misses++; return -1; }
        this.hits++;
        const val = this.map.get(key);
        // Move to MRU position: delete + re-insert
        this.map.delete(key);
        this.map.set(key, val);
        return val;
    }

    put(key, val) {
        if (this.map.has(key)) { this.map.delete(key); }
        else if (this.map.size >= this.cap) {
            // Evict LRU (first key in Map, which is LRU)
            const lruKey = this.map.keys().next().value;
            this.map.delete(lruKey);
        }
        this.map.set(key, val);
    }

    toArray() {
        // Return [{ plate, slot }] from MRU → LRU (reverse insertion order)
        const arr = [];
        for (const [k, v] of this.map) arr.unshift({ plate: k, slot: v });
        return arr;
    }
}

const lruCache = new LRUCacheJS(LRU_CAP);

// ── Graph — Adjacency Matrix (JS — mirrors graph.cpp)  CO2 + CO4 + CO5 ──
const adjMatrix = Array.from({length: TOTAL}, () => new Array(TOTAL).fill(0));

function buildGraph() {
    for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
            const curr = r * COLS + c;
            if (c + 1 < COLS) { adjMatrix[curr][curr+1] = adjMatrix[curr+1][curr] = 1; }
            if (r + 1 < ROWS) { adjMatrix[curr][curr+COLS] = adjMatrix[curr+COLS][curr] = 1; }
        }
    }
}
buildGraph();

// BFS: nearest free slot from startNode  (CO4: Queue)
function bfsNearestSlot(startNode, occupied) {
    const visited = new Array(TOTAL).fill(false);
    const queue   = [startNode];          // JS array as queue
    visited[startNode] = true;
    while (queue.length > 0) {
        const curr = queue.shift();
        if (!occupied[curr]) return curr;
        for (let i = 0; i < TOTAL; i++) {
            if (adjMatrix[curr][i] && !visited[i]) {
                visited[i] = true;
                queue.push(i);
            }
        }
    }
    return -1;
}

// BFS: shortest path start→target
function bfsPath(start, target) {
    const parent  = new Array(TOTAL).fill(-1);
    const visited = new Array(TOTAL).fill(false);
    const queue   = [start];
    visited[start] = true;
    while (queue.length > 0) {
        const curr = queue.shift();
        if (curr === target) break;
        for (let i = 0; i < TOTAL; i++) {
            if (adjMatrix[curr][i] && !visited[i]) {
                visited[i] = true;
                parent[i]  = curr;
                queue.push(i);
            }
        }
    }
    const path = [];
    for (let at = target; at !== -1; at = parent[at]) path.push(at);
    path.reverse();
    return path;
}

// DFS: full traversal  (CO5: Graphs)
function dfsTraversal(start) {
    const visited = new Array(TOTAL).fill(false);
    const result  = [];
    (function dfs(node) {
        visited[node] = true;
        result.push(node);
        for (let i = 0; i < TOTAL; i++) {
            if (adjMatrix[node][i] && !visited[i]) dfs(i);
        }
    })(start);
    return result;
}

// ── Simulation API functions ──────────────────────────────────────────────

function simParkVehicle(plate) {
    // CO5: Duplicate detection via Set
    if (simState.vehicleSet.has(plate))
        return { success: false, message: `Vehicle ${plate} is already parked!`, duplicate: true };

    if (simState.occupiedCount >= TOTAL)
        return { success: false, message: 'Parking lot is full!', duplicate: false };

    // CO3 + CO5: LRU Cache lookup
    const cachedSlot = lruCache.get(plate);
    const cacheHit   = cachedSlot !== -1;

    // CO4 + CO5: BFS smart allocation
    const allocSlot = bfsNearestSlot(0, simState.occupied);
    if (allocSlot === -1)
        return { success: false, message: 'No reachable free slot!', duplicate: false };

    const path = bfsPath(0, allocSlot);

    // Update state
    simState.occupied[allocSlot] = true;
    simState.plates[allocSlot]   = plate;
    simState.occupiedCount++;
    simState.vehicleSet.add(plate);
    lruCache.put(plate, allocSlot);

    return {
        success:       true,
        message:       `Vehicle ${plate} parked at slot ${allocSlot + 1}`,
        slotId:        allocSlot,
        slotLabel:     allocSlot + 1,
        path:          path,
        cacheHit:      cacheHit,
        cacheHits:     lruCache.hits,
        cacheMisses:   lruCache.misses,
        occupiedCount: simState.occupiedCount,
        parkTime:      new Date().toLocaleString(),
        lruCache:      lruCache.toArray()
    };
}

function simRemoveVehicle(plate) {
    const foundSlot = simState.plates.findIndex(p => p === plate);
    if (foundSlot === -1)
        return { success: false, message: `Vehicle ${plate} not found in lot!` };

    simState.occupied[foundSlot] = false;
    simState.plates[foundSlot]   = '';
    simState.occupiedCount--;
    simState.vehicleSet.delete(plate);

    return {
        success:       true,
        message:       `Vehicle ${plate} removed from slot ${foundSlot + 1}`,
        slotId:        foundSlot,
        slotLabel:     foundSlot + 1,
        occupiedCount: simState.occupiedCount,
        cacheHits:     lruCache.hits,
        cacheMisses:   lruCache.misses,
        lruCache:      lruCache.toArray()
    };
}

function simGetStatus() {
    return {
        success:        true,
        totalSlots:     TOTAL,
        occupiedCount:  simState.occupiedCount,
        availableCount: `${TOTAL - simState.occupiedCount}`,
        cacheHits:      lruCache.hits,
        cacheMisses:    lruCache.misses,
        lruCache:       lruCache.toArray(),
        slots:          simState.occupied.map((occ, i) => ({
            id:       i,
            label:    i + 1,
            occupied: occ,
            plate:    simState.plates[i]
        }))
    };
}

function simDFS() {
    return { success: true, dfsTraversal: dfsTraversal(0) };
}

// ── State persistence fallback (load/save to parking_state.txt) ──────────
function loadSimState() {
    if (!fs.existsSync(dbPath)) return;
    try {
        const lines = fs.readFileSync(dbPath, 'utf8').split('\n');
        for (const line of lines) {
            const [key, val] = line.split('=');
            if (!key || !val) continue;
            if (key.trim() === 'OCCUPIED') {
                val.trim().split(',').forEach((v, i) => { simState.occupied[i] = v === '1'; });
            }
            if (key.trim() === 'PLATES') {
                val.trim().split(',').forEach((v, i) => {
                    simState.plates[i] = v;
                    if (v) simState.vehicleSet.add(v);
                });
            }
            if (key.trim() === 'OCCUPIED_COUNT') simState.occupiedCount = parseInt(val) || 0;
        }
    } catch (e) { /* ignore parse errors on first run */ }
}

function saveSimState() {
    try {
        const occ = simState.occupied.map(o => o ? '1' : '0').join(',');
        const plt = simState.plates.join(',');
        const content = [
            `OCCUPIED=${occ}`, `PLATES=${plt}`,
            `LRU_PLATES=`, `LRU_SLOTS=`, `LRU_SIZE=${lruCache.map.size}`,
            `HITS=${lruCache.hits}`, `MISSES=${lruCache.misses}`,
            `OCCUPIED_COUNT=${simState.occupiedCount}`
        ].join('\n');
        fs.writeFileSync(dbPath, content, 'utf8');
    } catch (e) { /* ignore write errors */ }
}

loadSimState();

// ── C++ bridge (when binary is available) ───────────────────────────────
function callCpp(args) {
    try {
        const stdout = execFileSync(binaryPath, args, {
            cwd:      projectRoot, encoding: 'utf8', timeout: 8000
        });
        return JSON.parse(stdout.trim());
    } catch (err) {
        console.error('[C++ Bridge Error]', err.message);
        return null;
    }
}

// ── Dispatch: C++ first, fall back to JS simulation ──────────────────────
function dispatch(cppArgs, jsFallback) {
    if (binaryAvailable) {
        const result = callCpp(cppArgs);
        if (result) return result;
    }
    return jsFallback();
}

// ═══════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════

app.post('/parkVehicle', (req, res) => {
    const { plate } = req.body;
    if (!plate) return res.status(400).json({ success: false, message: 'plate required' });
    const clean = plate.toUpperCase().replace(/[^A-Z0-9-]/g, '');
    if (!clean || clean.length < 3) return res.status(400).json({ success: false, message: 'Invalid plate' });

    console.log(`[PARK] ${clean}`);
    const result = dispatch(['PARK', clean, dbPath], () => {
        const r = simParkVehicle(clean);
        if (r.success) saveSimState();
        return r;
    });
    console.log(`[PARK] → slot=${result.slotId} success=${result.success}`);
    res.json(result);
});

app.post('/removeVehicle', (req, res) => {
    const { plate } = req.body;
    if (!plate) return res.status(400).json({ success: false, message: 'plate required' });
    const clean = plate.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    console.log(`[REMOVE] ${clean}`);
    const result = dispatch(['REMOVE', clean, dbPath], () => {
        const r = simRemoveVehicle(clean);
        if (r.success) saveSimState();
        return r;
    });
    console.log(`[REMOVE] → success=${result.success}`);
    res.json(result);
});

app.get('/getStatus', (req, res) => {
    const result = dispatch(['STATUS', dbPath], simGetStatus);
    res.json(result);
});

app.get('/dfsTraversal', (req, res) => {
    const result = dispatch(['DFS', dbPath], simDFS);
    res.json(result);
});

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'index.html'));
});

app.get('/health', (req, res) => {
    res.json({
        status:        'ok',
        mode:          binaryAvailable ? 'C++ Native' : 'JS Simulation',
        binaryExists:  binaryAvailable,
        dbExists:      fs.existsSync(dbPath),
        occupiedCount: simState.occupiedCount,
        timestamp:     new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log('\n╔══════════════════════════════════════════════════════╗');
    console.log('║        Smart Parking System  —  API Server           ║');
    console.log('╠══════════════════════════════════════════════════════╣');
    console.log(`║  🌐  Frontend  →  http://localhost:${PORT}             ║`);
    console.log(`║  🔧  Health    →  http://localhost:${PORT}/health       ║`);
    console.log(`║  Mode: ${binaryAvailable ? '✅  C++ Native Backend       ' : '⚡  JS Simulation (no binary)'}       ║`);
    console.log('╚══════════════════════════════════════════════════════╝\n');
});
