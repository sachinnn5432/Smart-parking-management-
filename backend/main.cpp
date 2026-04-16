/**
 * @file main.cpp
 * @brief Entry point for Smart Parking System C++ backend
 *
 * Usage (called by Node.js server via child_process):
 *   parking.exe PARK    <plate> <db_path>
 *   parking.exe REMOVE  <plate> <db_path>
 *   parking.exe STATUS  <db_path>
 *   parking.exe DFS     <db_path>
 *
 * Output:  A single JSON string printed to stdout.
 *          Node.js reads this and forwards to the frontend.
 *
 * Compilation (Windows with MinGW):
 *   g++ -o parking.exe main.cpp parking_system.cpp graph.cpp lru_cache.cpp -std=c++14
 *
 * Compilation (Linux / macOS):
 *   g++ -o parking main.cpp parking_system.cpp graph.cpp lru_cache.cpp -std=c++14
 */

#include "parking_system.h"
#include <iostream>
#include <string>

// Helper: print a JSON error message and exit
static void exitWithError(const std::string& msg) {
    std::cout << "{\"success\":false,\"message\":\"" << msg << "\"}"
              << std::endl;
}

int main(int argc, char* argv[]) {

    // ── Validate argument count ──────────────────────────────────────
    if (argc < 2) {
        exitWithError("Usage: parking COMMAND [plate] db_path");
        return 1;
    }

    std::string command = argv[1];

    // Determine db_path (always the LAST argument)
    std::string dbPath = (argc >= 3) ? argv[argc - 1]
                                     : "../database/parking_state.txt";

    // ── Initialise and load state ────────────────────────────────────
    ParkingSystem ps;
    ps.loadState(dbPath);   // No error if file doesn't exist (fresh start)

    std::string output;

    // ── Dispatch command ─────────────────────────────────────────────
    if (command == "PARK") {
        if (argc < 4) { exitWithError("PARK requires <plate> and <db_path>"); return 1; }
        std::string plate = argv[2];
        output = ps.parkVehicle(plate);
        ps.saveState(dbPath);   // Persist updated state
    }
    else if (command == "REMOVE") {
        if (argc < 4) { exitWithError("REMOVE requires <plate> and <db_path>"); return 1; }
        std::string plate = argv[2];
        output = ps.removeVehicle(plate);
        ps.saveState(dbPath);
    }
    else if (command == "STATUS") {
        output = ps.getStatus();
        // No state change → no need to save
    }
    else if (command == "DFS") {
        output = ps.runDFS();
    }
    else {
        exitWithError("Unknown command: " + command);
        return 1;
    }

    // ── Print JSON result to stdout ──────────────────────────────────
    std::cout << output << std::endl;
    return 0;
}
