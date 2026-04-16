# 🅿 Smart Parking System
### 3D Animated Web Interface + C++ Backend

> **Academic Project** — C, C++ & Data Structures (CO1–CO5)
> Final-year / technical training submission | Industry-level code

---

## 🗂 Project Structure

```
smart-parking-system/
├── backend/
│   ├── lru_cache.h          # LRU Cache header (DLL + HashMap)
│   ├── lru_cache.cpp        # LRU Cache implementation
│   ├── graph.h              # Graph (Adjacency Matrix) header
│   ├── graph.cpp            # BFS / DFS implementation
│   ├── parking_system.h     # Main system header
│   ├── parking_system.cpp   # Core parking logic
│   └── main.cpp             # CLI entry point
├── api/
│   ├── server.js            # Node.js Express API (child_process bridge)
│   └── package.json
├── frontend/
│   ├── index.html           # UI layout
│   ├── style.css            # Glassmorphism design system
│   └── main.js              # Three.js 3D scene + GSAP animations
├── database/
│   └── parking_state.txt    # Persistent state file
├── report/
│   └── report.md            # 15-18 page academic report
└── README.md
```

---

## 🧠 Algorithms & DSA Concepts

| CO | Concept | Where Used |
|----|---------|-----------|
| CO1 | OOP – Classes, Constructors | `LRUCache`, `ParkingGraph`, `ParkingSystem` |
| CO2 | Arrays, Structures, Pointers | `occupied[]`, `plates[]`, `Vehicle`, Adjacency Matrix |
| CO3 | Doubly Linked List | LRU Cache (DLL nodes with prev/next) |
| CO4 | Queue (BFS) | Smart slot allocation, car path finding |
| CO5 | Graph + Hashing | Adjacency matrix graph, `unordered_map`, `unordered_set` |

---

## 🔧 Prerequisites

| Software | Version | Purpose |
|----------|---------|---------|
| g++ (MinGW on Windows) | ≥ 9.0 | Compile C++ backend |
| Node.js | ≥ 14.0 | Run API server |
| npm | ≥ 6.0 | Install dependencies |
| Modern browser | Any | View 3D frontend |

**Check if installed:**
```powershell
g++ --version
node --version
npm --version
```

---

## ⚙️ Setup Instructions

### Step 1 — Compile the C++ Backend

```powershell
cd "c:\Users\sachi\Desktop\technical training project\smart-parking-system\backend"
g++ -o parking.exe main.cpp parking_system.cpp graph.cpp lru_cache.cpp -std=c++14
```

✅ You should see `parking.exe` created in the `backend/` folder.

**Test it manually:**
```powershell
.\parking.exe STATUS "..\database\parking_state.txt"
```
Expected: JSON output with all 20 slots free.

---

### Step 2 — Install Node.js Dependencies

```powershell
cd "..\api"
npm install
```

---

### Step 3 — Start the API Server

```powershell
node server.js
```

You should see:
```
╔══════════════════════════════════════════════════════╗
║        Smart Parking System  —  API Server           ║
╠══════════════════════════════════════════════════════╣
║  🌐  Frontend  →  http://localhost:3001             ║
╚══════════════════════════════════════════════════════╝
```

---

### Step 4 — Open the 3D Frontend

Open your browser and navigate to:
```
http://localhost:3001
```

The 3D parking lot will load automatically.

---

## 🚀 How to Use

| Action | How |
|--------|-----|
| **Park a vehicle** | Type plate (e.g. `MH12AB1234`) in "Park Vehicle" panel → click **Park Vehicle** |
| **Remove a vehicle** | Type plate OR click a red car in the "Parked Vehicles" list → click **Remove Vehicle** |
| **View LRU Cache** | Right dashboard → **LRU Cache** card (updates live) |
| **Run DFS** | Click **Run DFS Traversal** → see highlighted traversal order |
| **Click a slot** | Click any slot in the 3D view to see its details |
| **Rotate view** | Click-drag on the 3D canvas |
| **Zoom** | Scroll wheel on canvas |

---

## 🌐 API Endpoints

| Method | Route | Body / Params | Description |
|--------|-------|---------------|-------------|
| `POST` | `/parkVehicle` | `{ "plate": "MH12AB1234" }` | Park a vehicle |
| `POST` | `/removeVehicle` | `{ "plate": "MH12AB1234" }` | Remove a vehicle |
| `GET`  | `/getStatus` | — | Full system status JSON |
| `GET`  | `/dfsTraversal` | — | DFS order JSON |
| `GET`  | `/health` | — | Server + binary health check |

**Test with curl:**
```powershell
curl -X POST http://localhost:3001/parkVehicle -H "Content-Type: application/json" -d "{\"plate\":\"KA01AB1234\"}"
curl http://localhost:3001/getStatus
```

---

## 🏗 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    BROWSER (3D UI)                      │
│  Three.js Scene  +  GSAP Animations  +  Fetch API       │
└──────────────────────────┬──────────────────────────────┘
                           │ HTTP (fetch)
                           ▼
┌─────────────────────────────────────────────────────────┐
│              Node.js API  (Express, port 3001)          │
│  /parkVehicle  /removeVehicle  /getStatus  /dfs         │
│       ↕ child_process.execFileSync                      │
└──────────────────────────┬──────────────────────────────┘
                           │ CLI args + stdout JSON
                           ▼
┌─────────────────────────────────────────────────────────┐
│              C++ Backend  (parking.exe)                 │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  LRU Cache  │  │ ParkingGraph │  │ ParkingSystem │  │
│  │ DLL+HashMap │  │ AdjMatrix    │  │ (Orchestrator)│  │
│  │  (CO3+CO5)  │  │  BFS / DFS   │  │   (CO1 OOP)   │  │
│  │             │  │  (CO4+CO5)   │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│         ↕ Read / Write                                  │
└──────────────────────────┬──────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│         database/parking_state.txt  (State file)        │
└─────────────────────────────────────────────────────────┘
```

---

## 📊 Data Flow — Park Vehicle

```
User types plate "MH12AB1234"
        ↓
Frontend validates & sends POST /parkVehicle
        ↓
Node.js sanitises plate → calls parking.exe PARK MH12AB1234 <dbPath>
        ↓
C++ loads state from parking_state.txt
        ↓
  [1] Duplicate check via unordered_set  (CO5)
  [2] LRU Cache lookup                   (CO3+CO5)
  [3] BFS from slot 0 → nearest free     (CO4)
  [4] Mark slot occupied, update LRU     (CO2+CO3)
        ↓
C++ writes updated state → outputs JSON
        ↓
Node.js forwards JSON to browser
        ↓
Three.js: car model animates along BFS path
GSAP:     dashboard counters update
Slot:     turns RED
LRU panel updated
```

---

## 🌟 Key Features Summary

- ✅ **LRU Cache** (Doubly Linked List + Hash Map, O(1) ops)
- ✅ **Smart slot allocation** via BFS shortest path
- ✅ **DFS traversal** for full lot visualization
- ✅ **Duplicate vehicle detection** (O(1) hash set)
- ✅ **3D parking lot** (Three.js, OrbitControls)
- ✅ **Animated car** moving along BFS path (GSAP)
- ✅ **Live dashboard** (hits/misses/occupancy)
- ✅ **Glassmorphism UI** with dark theme
- ✅ **State persistence** across server restarts
- ✅ **Beginner-friendly code** with detailed comments

---

## 📝 Report

See [`report/report.md`](report/report.md) for the complete 15-18 page academic report covering:
- Abstract, Introduction, Background Study
- Design & Algorithms (with code snippets)
- Result Analysis, Conclusion, References

---

## 🎓 Viva Quick Reference

| Question | Answer |
|----------|--------|
| Why LRU Cache? | O(1) get/put using DLL + HashMap; vehicles entering/leaving frequently |
| Why BFS over DFS for slot finding? | BFS guarantees shortest path (nearest slot); DFS may explore far slots first |
| Time complexity of LRU get/put? | O(1) amortised |
| Space complexity of adjacency matrix? | O(V²) = O(400) for 20 nodes |
| What triggers cache eviction? | Cache full (capacity=5) + new vehicle → LRU node (tail→prev) evicted |
| How is duplicate prevented? | `unordered_set<string> vehicleSet` checked before any allocation |

---

*Built with ❤️  — Smart Parking System | Academic Final Year Project*
