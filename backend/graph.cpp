/**
 * @file graph.cpp
 * @brief Implementation of ParkingGraph (Adjacency Matrix, BFS, DFS)
 *
 * VIVA EXPLANATION:
 *   The parking lot is modelled as an undirected graph.
 *   Each node represents a parking slot; edges connect adjacent slots.
 *
 *   BFS (Breadth-First Search):
 *     Uses a queue (CO4) to explore nodes level by level.
 *     The first unoccupied node found is the NEAREST available slot —
 *     this is the "smart allocation" feature of the system.
 *
 *   DFS (Depth-First Search):
 *     Uses recursion (implicit call stack) to explore as deep as possible
 *     before backtracking. Useful for full lot visualization/traversal.
 *
 *   Adjacency Matrix:
 *     adjMatrix[u][v] = 1  ↔  there is an edge from slot u to slot v.
 *     Space: O(V²) — acceptable since total slots ≤ 25.
 */

#include "graph.h"
#include <queue>       // CO4: Queue for BFS
#include <sstream>
#include <algorithm>   // std::reverse
#include <cstring>     // memset

// -----------------------------------------------------------------------
// Constructor: build grid graph (rows × cols), connecting neighbours
// -----------------------------------------------------------------------
ParkingGraph::ParkingGraph(int slots, int rows, int cols)
    : numSlots(slots)
{
    // Initialise every cell of the adjacency matrix to 0
    memset(adjMatrix, 0, sizeof(adjMatrix));

    // Connect each slot to its right and bottom neighbour in the grid
    for (int r = 0; r < rows; r++) {
        for (int c = 0; c < cols; c++) {
            int curr = r * cols + c;

            // Right neighbour
            if (c + 1 < cols)
                addEdge(curr, curr + 1);

            // Bottom neighbour
            if (r + 1 < rows)
                addEdge(curr, curr + cols);
        }
    }
}

// -----------------------------------------------------------------------
// addEdge – undirected edge: mark both directions in matrix
// -----------------------------------------------------------------------
void ParkingGraph::addEdge(int u, int v) {
    if (u >= 0 && u < numSlots && v >= 0 && v < numSlots) {
        adjMatrix[u][v] = 1;
        adjMatrix[v][u] = 1;
    }
}

// -----------------------------------------------------------------------
// BFS: nearest available slot  (CO4 – Queue)
// Returns slot index of nearest free slot, or -1 if lot is full.
// -----------------------------------------------------------------------
int ParkingGraph::bfsNearestSlot(int startNode,
                                  const std::vector<bool>& occupied) const
{
    std::vector<bool> visited(numSlots, false);
    std::queue<int>   q;       // <-- CO4: Queue data structure

    q.push(startNode);
    visited[startNode] = true;

    while (!q.empty()) {
        int curr = q.front();
        q.pop();

        // If this slot is free, we found the nearest one
        if (!occupied[curr])
            return curr;

        // Enqueue unvisited neighbours
        for (int i = 0; i < numSlots; i++) {
            if (adjMatrix[curr][i] == 1 && !visited[i]) {
                visited[i] = true;
                q.push(i);
            }
        }
    }
    return -1;  // No available slot found → lot is full
}

// -----------------------------------------------------------------------
// BFS: reconstruct shortest path from start to target
// Returns ordered list of slot indices; empty if unreachable.
// -----------------------------------------------------------------------
std::vector<int> ParkingGraph::bfsPath(int start, int target) const {
    std::vector<int>  parent(numSlots, -1);
    std::vector<bool> visited(numSlots, false);
    std::queue<int>   q;

    q.push(start);
    visited[start] = true;

    while (!q.empty()) {
        int curr = q.front();
        q.pop();

        if (curr == target) break;

        for (int i = 0; i < numSlots; i++) {
            if (adjMatrix[curr][i] == 1 && !visited[i]) {
                visited[i] = true;
                parent[i]  = curr;
                q.push(i);
            }
        }
    }

    // Reconstruct path by following parent[] from target back to start
    std::vector<int> path;
    if (parent[target] == -1 && target != start)
        return path;   // Unreachable

    for (int at = target; at != -1; at = parent[at])
        path.push_back(at);

    std::reverse(path.begin(), path.end());
    return path;
}

// -----------------------------------------------------------------------
// DFS: full traversal from start  (CO5 – Graphs)
// -----------------------------------------------------------------------
std::vector<int> ParkingGraph::dfsTraversal(int start) const {
    std::vector<bool> visited(numSlots, false);
    std::vector<int>  result;
    dfsHelper(start, visited, result);
    return result;
}

void ParkingGraph::dfsHelper(int node,
                              std::vector<bool>& visited,
                              std::vector<int>&  result) const {
    visited[node] = true;
    result.push_back(node);

    // Recurse into unvisited neighbours
    for (int i = 0; i < numSlots; i++) {
        if (adjMatrix[node][i] == 1 && !visited[i]) {
            dfsHelper(i, visited, result);
        }
    }
}

// -----------------------------------------------------------------------
// serializeMatrix – return adjacency matrix as JSON 2-D array
// -----------------------------------------------------------------------
std::string ParkingGraph::serializeMatrix() const {
    std::ostringstream oss;
    oss << "[";
    for (int i = 0; i < numSlots; i++) {
        oss << "[";
        for (int j = 0; j < numSlots; j++) {
            oss << adjMatrix[i][j];
            if (j < numSlots - 1) oss << ",";
        }
        oss << "]";
        if (i < numSlots - 1) oss << ",";
    }
    oss << "]";
    return oss.str();
}
