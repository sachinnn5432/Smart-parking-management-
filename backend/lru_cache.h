/**
 * @file lru_cache.h
 * @brief LRU (Least Recently Used) Cache using Doubly Linked List + Hash Map
 *
 * Syllabus Mapping:
 *   CO3 - Linked Lists: Doubly Linked List provides O(1) move-to-front
 *   CO5 - Hashing:      unordered_map<string, DLLNode*> gives O(1) lookup
 *
 * How it works:
 *   - Most Recently Used (MRU) item is at the FRONT of the list
 *   - Least Recently Used (LRU) item is at the BACK  of the list
 *   - get()  →  if found: move to front (cache HIT);  else: cache MISS
 *   - put()  →  insert at front; if full: evict LRU (tail) first
 *   - Sentinel head & tail nodes avoid special-case boundary checks
 */

#ifndef LRU_CACHE_H
#define LRU_CACHE_H

#include <string>
#include <unordered_map>  // CO5: Hash Map for O(1) lookup

// -------------------------------------------------------------------
// DLLNode: One node in the Doubly Linked List  (CO3: Linked Lists)
// -------------------------------------------------------------------
struct DLLNode {
    std::string plate;   // Vehicle plate number (cache key)
    int         slotId;  // Parking slot assigned  (cache value)
    DLLNode*    prev;    // Pointer to less-recently-used neighbour
    DLLNode*    next;    // Pointer to more-recently-used neighbour

    DLLNode(const std::string& p, int s)
        : plate(p), slotId(s), prev(nullptr), next(nullptr) {}
};

// -------------------------------------------------------------------
// LRUCache class
// -------------------------------------------------------------------
class LRUCache {
private:
    int capacity;      // Maximum entries allowed in cache
    int hits;          // Number of cache hits  (for dashboard)
    int misses;        // Number of cache misses (for dashboard)

    // Sentinel nodes: head->next = MRU;  tail->prev = LRU
    DLLNode* head;
    DLLNode* tail;

    // Hash Map: plate string → pointer to its DLLNode   (CO5)
    std::unordered_map<std::string, DLLNode*> cacheMap;

    // Private helpers
    void insertAtFront(DLLNode* node);  // Move/insert node to MRU position
    void removeNode(DLLNode* node);     // Detach node from list (no delete)
    void evictLRU();                    // Remove tail->prev (LRU) and free it

public:
    explicit LRUCache(int cap = 5);
    ~LRUCache();

    // Core operations
    int  get(const std::string& plate);             // Returns slotId or -1
    void put(const std::string& plate, int slotId); // Insert / update
    void remove(const std::string& plate);          // Explicit removal

    // Accessors for dashboard stats
    int getHits()   const { return hits;   }
    int getMisses() const { return misses; }
    int getSize()   const { return (int)cacheMap.size(); }

    // Serialize cache contents as a JSON array (MRU → LRU order)
    std::string toJson() const;

    // Load / save cache state from text tokens (used by ParkingSystem)
    void loadFromTokens(const std::string& platesToken,
                        const std::string& slotsToken,
                        int size, int h, int m);
    void saveToTokens(std::string& platesToken,
                      std::string& slotsToken) const;
};

#endif // LRU_CACHE_H
