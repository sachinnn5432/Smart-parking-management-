/**
 * @file parking_system.h
 * @brief Main Parking System – orchestrates Graph, LRU Cache & vehicle records
 *
 * Syllabus Mapping:
 *   CO1 - OOP:     Classes, constructors, member functions, encapsulation
 *   CO2 - Arrays & Structures: occupied[], plates[], Vehicle struct
 *   CO3 - Linked Lists:   via embedded LRUCache
 *   CO4 - Queues:         via BFS inside ParkingGraph
 *   CO5 - Graphs/Hashing: via ParkingGraph & LRUCache
 *
 * Persistence:
 *   State is stored in a plain-text file (database/parking_state.txt).
 *   C++ reads the file at startup and writes it back on exit, keeping
 *   the system state consistent across API calls.
 */

#ifndef PARKING_SYSTEM_H
#define PARKING_SYSTEM_H

#include "lru_cache.h"
#include "graph.h"

#include <string>
#include <vector>
#include <unordered_set>   // CO5: Hash Set for O(1) duplicate detection

#define ROWS       4
#define COLS       5
#define TOTAL_SLOTS (ROWS * COLS)   // 20 slots
#define LRU_CAP    5                // LRU cache capacity

// -------------------------------------------------------------------
// Vehicle structure  (CO2: Structures)
// -------------------------------------------------------------------
struct Vehicle {
    std::string plate;    // Registration / license plate number
    int         slotId;   // Assigned parking slot index (0-based)
    std::string parkTime; // ISO timestamp when parked
};

// -------------------------------------------------------------------
// ParkingSystem class  (CO1: OOP)
// -------------------------------------------------------------------
class ParkingSystem {
private:
    // ---- Data Structures ----
    LRUCache    lruCache;           // CO3 + CO5: LRU Cache
    ParkingGraph graph;             // CO2 + CO4 + CO5: Graph + BFS/DFS

    // CO2: Arrays
    bool        occupied[TOTAL_SLOTS];        // true = slot is taken
    std::string plates[TOTAL_SLOTS];          // plate stored at each slot
    int         occupiedCount;

    // CO5: Hash Set for O(1) duplicate-vehicle detection
    std::unordered_set<std::string> vehicleSet;

    // ---- Helpers ----
    std::string currentTimestamp() const;
    std::string vectorToJson(const std::vector<int>& v) const;

public:
    ParkingSystem();

    // ---- Persistence ----
    bool loadState(const std::string& filePath);   // Read from txt file
    void saveState(const std::string& filePath) const; // Write to txt file

    // ---- Core API ----

    /**
     * parkVehicle: allocate nearest free slot via BFS
     *   - Duplicate check (CO5 hash set)
     *   - LRU cache look-up / update (CO3 + CO5)
     *   - BFS smart allocation (CO4 + CO5)
     * Returns JSON result string.
     */
    std::string parkVehicle(const std::string& plate);

    /**
     * removeVehicle: free the slot occupied by 'plate'
     * Returns JSON result string.
     */
    std::string removeVehicle(const std::string& plate);

    /**
     * getStatus: full system state as JSON
     * (slot array, stats, recent vehicles, BFS/DFS paths)
     */
    std::string getStatus();

    /**
     * runDFS: DFS traversal from slot 0, returned as JSON array
     * Useful for viva demonstration and report diagrams.
     */
    std::string runDFS();
};

#endif // PARKING_SYSTEM_H
