/**
 * @file graph.h
 * @brief Graph of parking slots using Adjacency Matrix + BFS / DFS traversal
 *
 * Syllabus Mapping:
 *   CO2 - Arrays:   2-D adjacency matrix (int[MAX][MAX])
 *   CO4 - Queues:   BFS uses std::queue
 *   CO5 - Graphs:   Adjacency-matrix graph, BFS, DFS
 *
 * Layout: slots are numbered in row-major order on a ROWS×COLS grid.
 *         Adjacent slots (horizontal or vertical) share an edge.
 *
 *   Slot 0  Slot 1  Slot 2  Slot 3  Slot 4
 *   Slot 5  Slot 6  Slot 7  Slot 8  Slot 9
 *   Slot 10 Slot 11 Slot 12 Slot 13 Slot 14
 *   Slot 15 Slot 16 Slot 17 Slot 18 Slot 19
 *
 * BFS from slot 0 finds the NEAREST available slot (smart allocation).
 * DFS is provided for full-lot traversal / debugging / report generation.
 */

#ifndef GRAPH_H
#define GRAPH_H

#include <vector>
#include <string>

#define MAX_SLOTS 25   // Upper bound for adjacency matrix dimensions

// -------------------------------------------------------------------
// ParkingGraph class
// -------------------------------------------------------------------
class ParkingGraph {
private:
    int numSlots;                          // Total parking slots
    int adjMatrix[MAX_SLOTS][MAX_SLOTS];   // CO2: 2-D adjacency matrix

    // Recursive DFS helper
    void dfsHelper(int node,
                   std::vector<bool>& visited,
                   std::vector<int>& result) const;

public:
    // Constructor: builds grid graph of (rows × cols) slots
    ParkingGraph(int slots, int rows, int cols);

    // Add undirected edge between slot u and slot v
    void addEdge(int u, int v);

    // BFS: find nearest AVAILABLE slot reachable from startNode  (CO4)
    // occupied[i] = true  means slot i is taken
    // Returns slot index, or -1 if lot is full
    int bfsNearestSlot(int startNode,
                       const std::vector<bool>& occupied) const;

    // BFS: return ordered list of slots on shortest path start→target
    std::vector<int> bfsPath(int start, int target) const;

    // DFS: full traversal from start node  (CO5)
    std::vector<int> dfsTraversal(int start) const;

    int getNumSlots() const { return numSlots; }

    // Serialize adjacency matrix as JSON 2-D array (for report / viva)
    std::string serializeMatrix() const;
};

#endif // GRAPH_H
