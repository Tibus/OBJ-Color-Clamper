// ============================================================================
// QEM Edge-Collapse Mesh Decimation (WASM)
// ============================================================================
//
// Memory layout (all floats/ints packed in a shared buffer):
//   Input:
//     vertices: [x,y,z, r,g,b, ...] * numVerts  (6 floats per vertex)
//     faces:    [i0,i1,i2, ...]      * numFaces  (3 ints per face)
//   Output:
//     Same format, written to output area
//
// Compiled with: emcc -O3 -s WASM=1 -s EXPORTED_FUNCTIONS=[...] ...

#include <emscripten.h>
#include <math.h>
#include <stdlib.h>
#include <string.h>

#define MAX_VERT_FACES 64

// ---- Data structures ----

typedef struct {
    float x, y, z;
    float r, g, b;
} Vertex;

typedef struct {
    int v[3];
} Face;

// Symmetric 4x4 quadric stored as 10 floats
typedef struct {
    double q[10];
} Quadric;

// Edge with cost
typedef struct {
    int v1, v2;
    double cost;
} Edge;

// Per-vertex adjacency: list of face indices
typedef struct {
    int* faces;
    int count;
    int capacity;
} VertAdj;

// ---- Globals (allocated on heap) ----

static Vertex* verts = NULL;
static Face* faces = NULL;
static Quadric* quadrics = NULL;
static VertAdj* vertAdj = NULL;
static unsigned char* faceDeleted = NULL;
static unsigned char* vertDeleted = NULL;
static Edge* edges = NULL;

static int numVerts = 0;
static int numFaces = 0;
static int numEdges = 0;

// Output
static Vertex* outVerts = NULL;
static Face* outFaces = NULL;
static int outNumVerts = 0;
static int outNumFaces = 0;

// Progress
static float progressValue = 0.0f;

// ---- Helpers ----

static void adjAdd(VertAdj* a, int fi) {
    if (a->count >= a->capacity) {
        a->capacity = a->capacity ? a->capacity * 2 : 8;
        a->faces = (int*)realloc(a->faces, a->capacity * sizeof(int));
    }
    a->faces[a->count++] = fi;
}

static void adjRemove(VertAdj* a, int fi) {
    for (int i = 0; i < a->count; i++) {
        if (a->faces[i] == fi) {
            a->faces[i] = a->faces[--a->count];
            return;
        }
    }
}

static int adjContains(VertAdj* a, int fi) {
    for (int i = 0; i < a->count; i++) {
        if (a->faces[i] == fi) return 1;
    }
    return 0;
}

static void computeFaceNormal(const Vertex* v0, const Vertex* v1, const Vertex* v2,
                               double* nx, double* ny, double* nz) {
    double e1x = v1->x - v0->x, e1y = v1->y - v0->y, e1z = v1->z - v0->z;
    double e2x = v2->x - v0->x, e2y = v2->y - v0->y, e2z = v2->z - v0->z;
    *nx = e1y * e2z - e1z * e2y;
    *ny = e1z * e2x - e1x * e2z;
    *nz = e1x * e2y - e1y * e2x;
    double len = sqrt((*nx)*(*nx) + (*ny)*(*ny) + (*nz)*(*nz));
    if (len > 1e-10) {
        *nx /= len; *ny /= len; *nz /= len;
    }
}

static void computeVertexQuadric(int vi) {
    Quadric* q = &quadrics[vi];
    memset(q->q, 0, sizeof(q->q));

    for (int i = 0; i < vertAdj[vi].count; i++) {
        int fi = vertAdj[vi].faces[i];
        if (faceDeleted[fi]) continue;

        Face* f = &faces[fi];
        double nx, ny, nz;
        computeFaceNormal(&verts[f->v[0]], &verts[f->v[1]], &verts[f->v[2]], &nx, &ny, &nz);

        double d = -(nx * verts[f->v[0]].x + ny * verts[f->v[0]].y + nz * verts[f->v[0]].z);

        q->q[0] += nx*nx; q->q[1] += nx*ny; q->q[2] += nx*nz; q->q[3] += nx*d;
        q->q[4] += ny*ny; q->q[5] += ny*nz; q->q[6] += ny*d;
        q->q[7] += nz*nz; q->q[8] += nz*d;
        q->q[9] += d*d;
    }
}

static double quadricError(const Quadric* q, double x, double y, double z) {
    return q->q[0]*x*x + 2*q->q[1]*x*y + 2*q->q[2]*x*z + 2*q->q[3]*x
         + q->q[4]*y*y + 2*q->q[5]*y*z + 2*q->q[6]*y
         + q->q[7]*z*z + 2*q->q[8]*z
         + q->q[9];
}

static void addQuadric(Quadric* dst, const Quadric* a, const Quadric* b) {
    for (int i = 0; i < 10; i++) dst->q[i] = a->q[i] + b->q[i];
}

static int colorsMatch(const Vertex* a, const Vertex* b) {
    float dr = a->r - b->r, dg = a->g - b->g, db = a->b - b->b;
    return (dr*dr + dg*dg + db*db) < 0.0003f; // ~0.01 per channel
}

static double computeEdgeCost(int v1, int v2, double tolerance, int preserveColorBorders) {
    Quadric q;
    addQuadric(&q, &quadrics[v1], &quadrics[v2]);

    double mx = (verts[v1].x + verts[v2].x) * 0.5;
    double my = (verts[v1].y + verts[v2].y) * 0.5;
    double mz = (verts[v1].z + verts[v2].z) * 0.5;

    double errMid = quadricError(&q, mx, my, mz);
    double err1 = quadricError(&q, verts[v1].x, verts[v1].y, verts[v1].z);
    double err2 = quadricError(&q, verts[v2].x, verts[v2].y, verts[v2].z);

    double cost = errMid;
    if (err1 < cost) cost = err1;
    if (err2 < cost) cost = err2;

    if (cost > tolerance * tolerance) {
        cost *= 100.0;
    }

    if (preserveColorBorders && !colorsMatch(&verts[v1], &verts[v2])) {
        cost += 1e6;
    }

    return cost;
}

static int wouldFlipFace(int ev1, int ev2, double mx, double my, double mz) {
    for (int i = 0; i < vertAdj[ev2].count; i++) {
        int fi = vertAdj[ev2].faces[i];
        if (faceDeleted[fi]) continue;

        Face* f = &faces[fi];
        int hasV1 = (f->v[0] == ev1 || f->v[1] == ev1 || f->v[2] == ev1);
        int hasV2 = (f->v[0] == ev2 || f->v[1] == ev2 || f->v[2] == ev2);
        if (hasV1 && hasV2) continue; // shared face, will be removed

        // Old normal
        double onx, ony, onz;
        computeFaceNormal(&verts[f->v[0]], &verts[f->v[1]], &verts[f->v[2]], &onx, &ony, &onz);

        // New positions (replace ev2 with midpoint)
        Vertex p[3];
        for (int j = 0; j < 3; j++) {
            if (f->v[j] == ev2) {
                p[j].x = mx; p[j].y = my; p[j].z = mz;
            } else {
                p[j] = verts[f->v[j]];
            }
        }

        double nnx, nny, nnz;
        computeFaceNormal(&p[0], &p[1], &p[2], &nnx, &nny, &nnz);

        double dot = onx*nnx + ony*nny + onz*nnz;
        if (dot < 0.0) return 1;
    }
    return 0;
}

// ---- Edge comparison for qsort ----
static int edgeCmp(const void* a, const void* b) {
    double ca = ((const Edge*)a)->cost;
    double cb = ((const Edge*)b)->cost;
    if (ca < cb) return -1;
    if (ca > cb) return 1;
    return 0;
}

// ---- Hash set for edge dedup ----
#define EDGE_HASH_SIZE 1048576
#define EDGE_HASH_MASK (EDGE_HASH_SIZE - 1)

static int* edgeHashTable = NULL;
typedef struct { int v1, v2, next; } EdgeEntry;
static EdgeEntry* edgeEntries = NULL;
static int edgeEntryCount = 0;
static int edgeEntryCapacity = 0;

static void edgeHashInit(void) {
    if (!edgeHashTable) {
        edgeHashTable = (int*)malloc(EDGE_HASH_SIZE * sizeof(int));
    }
    memset(edgeHashTable, -1, EDGE_HASH_SIZE * sizeof(int));
    edgeEntryCount = 0;
}

static unsigned int edgeHash(int a, int b) {
    unsigned int h = (unsigned int)(a * 2654435761u) ^ (unsigned int)(b * 40503u);
    return h & EDGE_HASH_MASK;
}

static int edgeHashInsert(int a, int b) {
    if (a > b) { int t = a; a = b; b = t; }
    unsigned int h = edgeHash(a, b);
    int idx = edgeHashTable[h];
    while (idx >= 0) {
        if (edgeEntries[idx].v1 == a && edgeEntries[idx].v2 == b) return 0; // exists
        idx = edgeEntries[idx].next;
    }
    if (edgeEntryCount >= edgeEntryCapacity) {
        edgeEntryCapacity = edgeEntryCapacity ? edgeEntryCapacity * 2 : 65536;
        edgeEntries = (EdgeEntry*)realloc(edgeEntries, edgeEntryCapacity * sizeof(EdgeEntry));
    }
    int ei = edgeEntryCount++;
    edgeEntries[ei].v1 = a;
    edgeEntries[ei].v2 = b;
    edgeEntries[ei].next = edgeHashTable[h];
    edgeHashTable[h] = ei;
    return 1; // inserted
}

// ---- Build edges from current topology ----
static void buildEdges(double tolerance, int preserveColorBorders) {
    edgeHashInit();
    numEdges = 0;

    for (int fi = 0; fi < numFaces; fi++) {
        if (faceDeleted[fi]) continue;
        Face* f = &faces[fi];
        for (int j = 0; j < 3; j++) {
            int a = f->v[j], b = f->v[(j+1)%3];
            if (vertDeleted[a] || vertDeleted[b]) continue;
            if (edgeHashInsert(a, b)) {
                numEdges++;
            }
        }
    }

    edges = (Edge*)realloc(edges, numEdges * sizeof(Edge));
    int ei = 0;
    for (int i = 0; i < edgeEntryCount; i++) {
        edges[ei].v1 = edgeEntries[i].v1;
        edges[ei].v2 = edgeEntries[i].v2;
        edges[ei].cost = computeEdgeCost(edges[ei].v1, edges[ei].v2, tolerance, preserveColorBorders);
        ei++;
    }

    qsort(edges, numEdges, sizeof(Edge), edgeCmp);
}

// ---- Collapse one edge ----
static int collapseEdge(int ev1, int ev2) {
    Quadric q;
    addQuadric(&q, &quadrics[ev1], &quadrics[ev2]);

    double mx = (verts[ev1].x + verts[ev2].x) * 0.5;
    double my = (verts[ev1].y + verts[ev2].y) * 0.5;
    double mz = (verts[ev1].z + verts[ev2].z) * 0.5;

    double errMid = quadricError(&q, mx, my, mz);
    double err1 = quadricError(&q, verts[ev1].x, verts[ev1].y, verts[ev1].z);
    double err2 = quadricError(&q, verts[ev2].x, verts[ev2].y, verts[ev2].z);

    if (err1 <= errMid && err1 <= err2) {
        // keep v1 position
    } else if (err2 <= errMid && err2 <= err1) {
        verts[ev1].x = verts[ev2].x;
        verts[ev1].y = verts[ev2].y;
        verts[ev1].z = verts[ev2].z;
        verts[ev1].r = verts[ev2].r;
        verts[ev1].g = verts[ev2].g;
        verts[ev1].b = verts[ev2].b;
    } else {
        verts[ev1].x = mx;
        verts[ev1].y = my;
        verts[ev1].z = mz;
        // Keep color from vertex with more adjacent faces
        if (vertAdj[ev2].count > vertAdj[ev1].count) {
            verts[ev1].r = verts[ev2].r;
            verts[ev1].g = verts[ev2].g;
            verts[ev1].b = verts[ev2].b;
        }
    }

    quadrics[ev1] = q;

    int removed = 0;

    // Delete faces shared by both v1 and v2
    for (int i = vertAdj[ev2].count - 1; i >= 0; i--) {
        int fi = vertAdj[ev2].faces[i];
        if (faceDeleted[fi]) continue;

        Face* f = &faces[fi];
        int hasV1 = (f->v[0] == ev1 || f->v[1] == ev1 || f->v[2] == ev1);
        if (hasV1) {
            faceDeleted[fi] = 1;
            removed++;
            adjRemove(&vertAdj[f->v[0]], fi);
            adjRemove(&vertAdj[f->v[1]], fi);
            adjRemove(&vertAdj[f->v[2]], fi);
        }
    }

    // Repoint ev2 -> ev1 in remaining faces
    for (int i = vertAdj[ev2].count - 1; i >= 0; i--) {
        int fi = vertAdj[ev2].faces[i];
        if (faceDeleted[fi]) continue;

        Face* f = &faces[fi];
        for (int j = 0; j < 3; j++) {
            if (f->v[j] == ev2) f->v[j] = ev1;
        }
        adjAdd(&vertAdj[ev1], fi);
    }

    vertAdj[ev2].count = 0;
    vertDeleted[ev2] = 1;

    return removed;
}

// ============================================================================
// Exported API
// ============================================================================

EMSCRIPTEN_KEEPALIVE
float getProgress(void) {
    return progressValue;
}

EMSCRIPTEN_KEEPALIVE
int getOutputVertexCount(void) { return outNumVerts; }

EMSCRIPTEN_KEEPALIVE
int getOutputFaceCount(void) { return outNumFaces; }

EMSCRIPTEN_KEEPALIVE
float* getOutputVertices(void) { return (float*)outVerts; }

EMSCRIPTEN_KEEPALIVE
int* getOutputFaces(void) { return (int*)outFaces; }

EMSCRIPTEN_KEEPALIVE
void decimate(float* vertexData, int vertCount,
              int* faceData, int faceCount,
              int targetCount, float tolerance, int preserveColorBorders)
{
    progressValue = 0.0f;
    numVerts = vertCount;
    numFaces = faceCount;

    // Allocate
    verts = (Vertex*)realloc(verts, numVerts * sizeof(Vertex));
    faces = (Face*)realloc(faces, numFaces * sizeof(Face));
    quadrics = (Quadric*)realloc(quadrics, numVerts * sizeof(Quadric));
    vertDeleted = (unsigned char*)realloc(vertDeleted, numVerts);
    faceDeleted = (unsigned char*)realloc(faceDeleted, numFaces);

    if (vertAdj) {
        for (int i = 0; i < numVerts; i++) {
            if (vertAdj[i].faces) free(vertAdj[i].faces);
        }
    }
    vertAdj = (VertAdj*)realloc(vertAdj, numVerts * sizeof(VertAdj));

    memset(vertDeleted, 0, numVerts);
    memset(faceDeleted, 0, numFaces);

    // Copy input
    for (int i = 0; i < numVerts; i++) {
        verts[i].x = vertexData[i*6+0];
        verts[i].y = vertexData[i*6+1];
        verts[i].z = vertexData[i*6+2];
        verts[i].r = vertexData[i*6+3];
        verts[i].g = vertexData[i*6+4];
        verts[i].b = vertexData[i*6+5];

        vertAdj[i].faces = NULL;
        vertAdj[i].count = 0;
        vertAdj[i].capacity = 0;
    }

    for (int i = 0; i < numFaces; i++) {
        faces[i].v[0] = faceData[i*3+0];
        faces[i].v[1] = faceData[i*3+1];
        faces[i].v[2] = faceData[i*3+2];
    }

    // Build adjacency
    for (int fi = 0; fi < numFaces; fi++) {
        adjAdd(&vertAdj[faces[fi].v[0]], fi);
        adjAdd(&vertAdj[faces[fi].v[1]], fi);
        adjAdd(&vertAdj[faces[fi].v[2]], fi);
    }

    // Compute initial quadrics
    for (int i = 0; i < numVerts; i++) {
        computeVertexQuadric(i);
    }

    // Iterative decimation
    int activeFaces = numFaces;
    // targetCount <= 0 means "auto" mode: remove triangles until cost > tolerance²
    int autoMode = (targetCount <= 0);
    if (!autoMode && targetCount < 4) targetCount = 4;

    double tolSq = (double)tolerance * (double)tolerance;

    if (!autoMode) {
        int totalToRemove = activeFaces - targetCount;
        if (totalToRemove <= 0) {
            progressValue = 1.0f;
            goto output;
        }
    }

    int startFaces = activeFaces;
    int maxPasses = 100;

    for (int pass = 0; pass < maxPasses; pass++) {
        // Recompute quadrics and rebuild sorted edge list
        if (pass > 0) {
            for (int i = 0; i < numVerts; i++) {
                if (!vertDeleted[i] && vertAdj[i].count > 0) {
                    computeVertexQuadric(i);
                }
            }
        }
        buildEdges(tolerance, preserveColorBorders);

        // Update progress and yield to browser
        if (pass > 0) {
            if (autoMode) {
                float ratio = 1.0f - (float)activeFaces / (float)startFaces;
                progressValue = ratio * 0.95f;
            } else {
                progressValue = (float)(numFaces - activeFaces) / (float)(numFaces - targetCount);
                if (progressValue > 0.95f) progressValue = 0.95f;
            }
            emscripten_sleep(0);
        }

        // Collapse all valid cheap edges in one pass through sorted list
        int collapsedThisPass = 0;
        int costExceeded = 0;
        for (int ei = 0; ei < numEdges; ei++) {
            Edge* e = &edges[ei];
            if (vertDeleted[e->v1] || vertDeleted[e->v2]) continue;
            if (vertAdj[e->v1].count == 0 || vertAdj[e->v2].count == 0) continue;

            // In auto mode, stop when edge cost exceeds tolerance threshold
            if (autoMode && e->cost > tolSq) {
                costExceeded = 1;
                break;
            }

            // In target mode, stop when we've reached the target
            if (!autoMode && activeFaces <= targetCount) break;

            double mx = (verts[e->v1].x + verts[e->v2].x) * 0.5;
            double my = (verts[e->v1].y + verts[e->v2].y) * 0.5;
            double mz = (verts[e->v1].z + verts[e->v2].z) * 0.5;

            if (wouldFlipFace(e->v1, e->v2, mx, my, mz)) continue;

            int removed = collapseEdge(e->v1, e->v2);
            activeFaces -= removed;
            collapsedThisPass++;
        }

        // Stop conditions
        if (costExceeded) break;
        if (!autoMode && activeFaces <= targetCount) break;
        if (collapsedThisPass == 0) break;
        if (activeFaces <= 4) break;
    }

output:
    progressValue = 1.0f;

    // Build output
    int* indexMap = (int*)malloc(numVerts * sizeof(int));
    memset(indexMap, -1, numVerts * sizeof(int));

    outNumVerts = 0;
    for (int i = 0; i < numVerts; i++) {
        if (!vertDeleted[i] && vertAdj[i].count > 0) {
            indexMap[i] = outNumVerts++;
        }
    }

    outVerts = (Vertex*)realloc(outVerts, outNumVerts * sizeof(Vertex));
    int vi = 0;
    for (int i = 0; i < numVerts; i++) {
        if (indexMap[i] >= 0) {
            outVerts[vi++] = verts[i];
        }
    }

    outNumFaces = 0;
    for (int fi = 0; fi < numFaces; fi++) {
        if (faceDeleted[fi]) continue;
        Face* f = &faces[fi];
        int a = indexMap[f->v[0]], b = indexMap[f->v[1]], c = indexMap[f->v[2]];
        if (a >= 0 && b >= 0 && c >= 0 && a != b && b != c && a != c) {
            outNumFaces++;
        }
    }

    outFaces = (Face*)realloc(outFaces, outNumFaces * sizeof(Face));
    int oi = 0;
    for (int fi = 0; fi < numFaces; fi++) {
        if (faceDeleted[fi]) continue;
        Face* f = &faces[fi];
        int a = indexMap[f->v[0]], b = indexMap[f->v[1]], c = indexMap[f->v[2]];
        if (a >= 0 && b >= 0 && c >= 0 && a != b && b != c && a != c) {
            outFaces[oi].v[0] = a;
            outFaces[oi].v[1] = b;
            outFaces[oi].v[2] = c;
            oi++;
        }
    }

    free(indexMap);
}
