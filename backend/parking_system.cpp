/**
 * @file parking_system.cpp
 * @brief ParkingSystem – reads/writes state file, orchestrates all DSA modules
 *
 * State file format (database/parking_state.txt):
 * -----------------------------------------------
 * OCCUPIED=0,0,1,0,...         (20 comma-separated 0/1 values)
 * PLATES=,,MH12AB1234,,,...    (20 comma-separated plate strings; empty if free)
 * LRU_PLATES=MH12AB1234|KA01  (pipe-separated, MRU first)
 * LRU_SLOTS=2|7                (pipe-separated slot IDs)
 * LRU_SIZE=2
 * HITS=3
 * MISSES=1
 * OCCUPIED_COUNT=1
 */

#include "parking_system.h"
#include <fstream>
#include <sstream>
#include <iostream>
#include <algorithm>
#include <ctime>

// -----------------------------------------------------------------------
// Constructor:  initialise all slots as free and set up graph
// -----------------------------------------------------------------------
ParkingSystem::ParkingSystem()
    : lruCache(LRU_CAP),
      graph(TOTAL_SLOTS, ROWS, COLS),
      occupiedCount(0)
{
    for (int i = 0; i < TOTAL_SLOTS; i++) {
        occupied[i] = false;
        plates[i]   = "";
    }
}

// -----------------------------------------------------------------------
// Timestamp helper – returns current time as "DD-MM-YYYY HH:MM:SS"
// -----------------------------------------------------------------------
std::string ParkingSystem::currentTimestamp() const {
    std::time_t t = std::time(nullptr);
    char buf[32];
    std::strftime(buf, sizeof(buf), "%d-%m-%Y %H:%M:%S", std::localtime(&t));
    return std::string(buf);
}

// -----------------------------------------------------------------------
// vectorToJson – convert int vector to JSON array string "[1,2,3]"
// -----------------------------------------------------------------------
std::string ParkingSystem::vectorToJson(const std::vector<int>& v) const {
    std::ostringstream oss;
    oss << "[";
    for (int i = 0; i < (int)v.size(); i++) {
        if (i) oss << ",";
        oss << v[i];
    }
    oss << "]";
    return oss.str();
}

// -----------------------------------------------------------------------
// loadState – read parking_state.txt into memory
// Returns false if file doesn't exist (fresh start).
// -----------------------------------------------------------------------
bool ParkingSystem::loadState(const std::string& filePath) {
    std::ifstream file(filePath);
    if (!file.is_open()) return false;   // No state file yet – fresh start

    std::string line;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') continue;

        // Find the '=' separator
        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;

        std::string key = line.substr(0, eq);
        std::string val = line.substr(eq + 1);

        if (key == "OCCUPIED") {
            // Parse 20 comma-separated 0/1 values
            std::istringstream ss(val);
            std::string tok;
            int i = 0;
            while (std::getline(ss, tok, ',') && i < TOTAL_SLOTS) {
                occupied[i++] = (tok == "1");
            }
        }
        else if (key == "PLATES") {
            // Parse 20 comma-separated plate strings (may be empty)
            std::istringstream ss(val);
            std::string tok;
            int i = 0;
            while (std::getline(ss, tok, ',') && i < TOTAL_SLOTS) {
                plates[i] = tok;
                if (!tok.empty()) vehicleSet.insert(tok);
                i++;
            }
        }
        else if (key == "LRU_PLATES") {
            // Stored alongside LRU_SLOTS; handled below
            line.clear();
            continue;
        }
        else if (key == "OCCUPIED_COUNT") {
            occupiedCount = std::stoi(val);
        }
    }

    // Reload the file a second pass (to get LRU together)
    file.clear(); file.seekg(0);
    std::string lruPlates, lruSlots;
    int lruSize = 0, h = 0, m = 0;
    while (std::getline(file, line)) {
        if (line.empty() || line[0] == '#') continue;
        size_t eq = line.find('=');
        if (eq == std::string::npos) continue;
        std::string key = line.substr(0, eq);
        std::string val = line.substr(eq + 1);
        if (key == "LRU_PLATES")  lruPlates = val;
        if (key == "LRU_SLOTS")   lruSlots  = val;
        if (key == "LRU_SIZE")    lruSize   = std::stoi(val);
        if (key == "HITS")        h         = std::stoi(val);
        if (key == "MISSES")      m         = std::stoi(val);
    }
    lruCache.loadFromTokens(lruPlates, lruSlots, lruSize, h, m);
    return true;
}

// -----------------------------------------------------------------------
// saveState – write current state back to parking_state.txt
// -----------------------------------------------------------------------
void ParkingSystem::saveState(const std::string& filePath) const {
    std::ofstream file(filePath);
    if (!file.is_open()) {
        std::cerr << "ERROR: Cannot write state file: " << filePath << "\n";
        return;
    }

    // OCCUPIED row
    file << "OCCUPIED=";
    for (int i = 0; i < TOTAL_SLOTS; i++) {
        file << (occupied[i] ? "1" : "0");
        if (i < TOTAL_SLOTS - 1) file << ",";
    }
    file << "\n";

    // PLATES row (comma-separated, empty string for free slots)
    file << "PLATES=";
    for (int i = 0; i < TOTAL_SLOTS; i++) {
        file << plates[i];
        if (i < TOTAL_SLOTS - 1) file << ",";
    }
    file << "\n";

    // LRU data
    std::string lruPlates, lruSlots;
    lruCache.saveToTokens(lruPlates, lruSlots);
    file << "LRU_PLATES="    << lruPlates            << "\n";
    file << "LRU_SLOTS="     << lruSlots             << "\n";
    file << "LRU_SIZE="      << lruCache.getSize()   << "\n";
    file << "HITS="          << lruCache.getHits()   << "\n";
    file << "MISSES="        << lruCache.getMisses() << "\n";
    file << "OCCUPIED_COUNT="<< occupiedCount         << "\n";
}

// -----------------------------------------------------------------------
// parkVehicle – main parking algorithm
// -----------------------------------------------------------------------
std::string ParkingSystem::parkVehicle(const std::string& plate) {
    std::ostringstream result;

    // ---------- Step 1: Duplicate vehicle detection (CO5 – Hash Set) ----------
    if (vehicleSet.count(plate)) {
        result << "{\"success\":false,"
               << "\"message\":\"Vehicle " << plate << " is already parked!\","
               << "\"duplicate\":true}";
        return result.str();
    }

    // ---------- Step 2: Check if lot is full ----------
    if (occupiedCount >= TOTAL_SLOTS) {
        result << "{\"success\":false,"
               << "\"message\":\"Parking lot is full!\","
               << "\"duplicate\":false}";
        return result.str();
    }

    // ---------- Step 3: LRU Cache lookup (CO3 + CO5) ----------
    int cachedSlot = lruCache.get(plate);  // -1 = miss
    bool cacheHit  = (cachedSlot != -1);

    // BFS starts from entrance (slot 0); if cache-hit, consider preferred slot
    // We always use BFS to get the NEAREST free slot from entrance.
    std::vector<bool> occ(occupied, occupied + TOTAL_SLOTS);

    // ---------- Step 4: BFS smart allocation (CO4 + CO5) ----------
    int allocSlot = graph.bfsNearestSlot(0, occ);

    if (allocSlot == -1) {
        result << "{\"success\":false,"
               << "\"message\":\"No reachable free slot!\","
               << "\"duplicate\":false}";
        return result.str();
    }

    // BFS path from entrance to allocated slot (for car animation)
    std::vector<int> path = graph.bfsPath(0, allocSlot);

    // ---------- Step 5: Update structures ----------
    occupied[allocSlot] = true;
    plates[allocSlot]   = plate;
    occupiedCount++;
    vehicleSet.insert(plate);

    // Update LRU cache
    lruCache.put(plate, allocSlot);

    // ---------- Step 6: Build JSON response ----------
    result << "{"
           << "\"success\":true,"
           << "\"message\":\"Vehicle " << plate << " parked at slot " << (allocSlot + 1) << "\","
           << "\"slotId\":"    << allocSlot   << ","
           << "\"slotLabel\":" << (allocSlot + 1) << ","
           << "\"path\":"      << vectorToJson(path) << ","
           << "\"cacheHit\":"  << (cacheHit ? "true" : "false") << ","
           << "\"cacheHits\":" << lruCache.getHits()   << ","
           << "\"cacheMisses\":"<< lruCache.getMisses() << ","
           << "\"occupiedCount\":"<< occupiedCount << ","
           << "\"parkTime\":\""   << currentTimestamp()  << "\","
           << "\"lruCache\":"     << lruCache.toJson()
           << "}";
    return result.str();
}

// -----------------------------------------------------------------------
// removeVehicle – free the slot occupied by this plate
// -----------------------------------------------------------------------
std::string ParkingSystem::removeVehicle(const std::string& plate) {
    std::ostringstream result;

    // Find which slot this plate is in  (CO2: Array search)
    int foundSlot = -1;
    for (int i = 0; i < TOTAL_SLOTS; i++) {
        if (plates[i] == plate) { foundSlot = i; break; }
    }

    if (foundSlot == -1) {
        result << "{\"success\":false,"
               << "\"message\":\"Vehicle " << plate << " not found in lot!\"}";
        return result.str();
    }

    // Free the slot
    occupied[foundSlot] = false;
    plates[foundSlot]   = "";
    occupiedCount--;
    vehicleSet.erase(plate);
    // Note: we keep the vehicle in LRU cache (history of recently used vehicles)

    result << "{"
           << "\"success\":true,"
           << "\"message\":\"Vehicle " << plate << " removed from slot " << (foundSlot + 1) << "\","
           << "\"slotId\":"      << foundSlot << ","
           << "\"slotLabel\":"   << (foundSlot + 1) << ","
           << "\"occupiedCount\":"<< occupiedCount << ","
           << "\"cacheHits\":"   << lruCache.getHits()   << ","
           << "\"cacheMisses\":" << lruCache.getMisses() << ","
           << "\"lruCache\":"    << lruCache.toJson()
           << "}";
    return result.str();
}

// -----------------------------------------------------------------------
// getStatus – full system state as JSON
// -----------------------------------------------------------------------
std::string ParkingSystem::getStatus() {
    std::ostringstream result;

    // Build slots array
    result << "{\"success\":true,\"totalSlots\":" << TOTAL_SLOTS
           << ",\"occupiedCount\":"  << occupiedCount
           << ",\"availableCount\":\"" << (TOTAL_SLOTS - occupiedCount) << "\""
           << ",\"cacheHits\":"     << lruCache.getHits()
           << ",\"cacheMisses\":"   << lruCache.getMisses()
           << ",\"lruCache\":"      << lruCache.toJson()
           << ",\"slots\":[";

    for (int i = 0; i < TOTAL_SLOTS; i++) {
        if (i) result << ",";
        result << "{\"id\":"      << i
               << ",\"label\":"   << (i + 1)
               << ",\"occupied\":" << (occupied[i] ? "true" : "false")
               << ",\"plate\":\""  << plates[i] << "\""
               << "}";
    }
    result << "]}";
    return result.str();
}

// -----------------------------------------------------------------------
// runDFS – DFS traversal from slot 0, returned as JSON
// -----------------------------------------------------------------------
std::string ParkingSystem::runDFS() {
    std::vector<int> dfsOrder = graph.dfsTraversal(0);
    std::ostringstream result;
    result << "{\"success\":true,\"dfsTraversal\":"
           << vectorToJson(dfsOrder) << "}";
    return result.str();
}
