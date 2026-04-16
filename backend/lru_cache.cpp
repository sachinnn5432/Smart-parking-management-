/**
 * @file lru_cache.cpp
 * @brief Implementation of LRU Cache (Doubly Linked List + Hash Map)
 *
 * VIVA EXPLANATION:
 *   The cache keeps a doubly-linked list where the FRONT is always the
 *   most-recently-used (MRU) and the BACK is the least-recently-used (LRU).
 *   Two sentinel nodes (head, tail) simplify pointer updates — we never
 *   need to handle null-neighbour edge cases.
 *
 *   Time Complexities:
 *     get()  → O(1)  [hash map look-up + list re-link]
 *     put()  → O(1)  [insert at front + possible eviction]
 *     remove()→ O(1) [hash map look-up + list detach]
 */

#include "lru_cache.h"
#include <sstream>
#include <stdexcept>

// -----------------------------------------------------------------------
// Constructor: create sentinel head and tail
// -----------------------------------------------------------------------
LRUCache::LRUCache(int cap)
    : capacity(cap), hits(0), misses(0)
{
    // Sentinel nodes – they are NEVER removed
    head = new DLLNode("__HEAD__", -1);
    tail = new DLLNode("__TAIL__", -1);
    head->next = tail;
    tail->prev = head;
}

// -----------------------------------------------------------------------
// Destructor: free all nodes (sentinels included)
// -----------------------------------------------------------------------
LRUCache::~LRUCache() {
    DLLNode* curr = head;
    while (curr) {
        DLLNode* nxt = curr->next;
        delete curr;
        curr = nxt;
    }
}

// -----------------------------------------------------------------------
// insertAtFront – place node immediately after head (MRU position)
// -----------------------------------------------------------------------
void LRUCache::insertAtFront(DLLNode* node) {
    node->next       = head->next;
    node->prev       = head;
    head->next->prev = node;
    head->next       = node;
}

// -----------------------------------------------------------------------
// removeNode – detach a node from its neighbours WITHOUT deleting it
// -----------------------------------------------------------------------
void LRUCache::removeNode(DLLNode* node) {
    node->prev->next = node->next;
    node->next->prev = node->prev;
    node->prev = nullptr;
    node->next = nullptr;
}

// -----------------------------------------------------------------------
// evictLRU – delete the node just before tail (least-recently-used)
// -----------------------------------------------------------------------
void LRUCache::evictLRU() {
    if (tail->prev == head) return;  // Cache is empty – nothing to evict
    DLLNode* lru = tail->prev;
    removeNode(lru);
    cacheMap.erase(lru->plate);
    delete lru;
}

// -----------------------------------------------------------------------
// get – look up plate; increment hit/miss counter; move to MRU on hit
// -----------------------------------------------------------------------
int LRUCache::get(const std::string& plate) {
    auto it = cacheMap.find(plate);
    if (it == cacheMap.end()) {
        misses++;          // Cache MISS
        return -1;
    }
    hits++;                // Cache HIT
    DLLNode* node = it->second;
    removeNode(node);      // Move to MRU position
    insertAtFront(node);
    return node->slotId;
}

// -----------------------------------------------------------------------
// put – insert or update an entry; evict LRU if over capacity
// -----------------------------------------------------------------------
void LRUCache::put(const std::string& plate, int slotId) {
    auto it = cacheMap.find(plate);
    if (it != cacheMap.end()) {
        // Update existing entry and move to MRU
        it->second->slotId = slotId;
        removeNode(it->second);
        insertAtFront(it->second);
        return;
    }
    // Evict if at full capacity
    if ((int)cacheMap.size() >= capacity) {
        evictLRU();
    }
    // Create and insert new node
    DLLNode* node = new DLLNode(plate, slotId);
    cacheMap[plate] = node;
    insertAtFront(node);
}

// -----------------------------------------------------------------------
// remove – explicitly evict a specific vehicle from cache
// -----------------------------------------------------------------------
void LRUCache::remove(const std::string& plate) {
    auto it = cacheMap.find(plate);
    if (it == cacheMap.end()) return;
    removeNode(it->second);
    delete it->second;
    cacheMap.erase(it);
}

// -----------------------------------------------------------------------
// toJson – serialize cache contents (MRU → LRU order) as JSON array
// -----------------------------------------------------------------------
std::string LRUCache::toJson() const {
    std::ostringstream oss;
    oss << "[";
    DLLNode* curr  = head->next;
    bool     first = true;
    while (curr != tail) {
        if (!first) oss << ",";
        oss << "{\"plate\":\"" << curr->plate
            << "\",\"slot\":"  << curr->slotId << "}";
        first = false;
        curr  = curr->next;
    }
    oss << "]";
    return oss.str();
}

// -----------------------------------------------------------------------
// loadFromTokens / saveToTokens – text-file persistence helpers
// Format: "MH12AB1234|KA01AB9999" (pipe-separated plates)
//         "5|3"                   (pipe-separated slot IDs)
// -----------------------------------------------------------------------
void LRUCache::loadFromTokens(const std::string& platesToken,
                               const std::string& slotsToken,
                               int size, int h, int m) {
    hits   = h;
    misses = m;
    if (platesToken.empty() || size == 0) return;

    // Split pipe-separated strings
    std::vector<std::string> ps, ss;
    std::istringstream pp(platesToken), sp(slotsToken);
    std::string tok;
    while (std::getline(pp, tok, '|')) ps.push_back(tok);
    while (std::getline(sp, tok, '|')) ss.push_back(tok);

    // Insert LRU → MRU so that first entry ends up at MRU after loading
    for (int i = (int)ps.size() - 1; i >= 0; i--) {
        if (!ps[i].empty()) {
            put(ps[i], std::stoi(ss[i]));
        }
    }
    // Restore counters (put() incremented nothing – it's an internal load)
    hits   = h;
    misses = m;
}

void LRUCache::saveToTokens(std::string& platesToken,
                             std::string& slotsToken) const {
    std::ostringstream pp, sp;
    DLLNode* curr  = head->next;
    bool     first = true;
    while (curr != tail) {
        if (!first) { pp << "|"; sp << "|"; }
        pp << curr->plate;
        sp << curr->slotId;
        first = false;
        curr  = curr->next;
    }
    platesToken = pp.str();
    slotsToken  = sp.str();
}
