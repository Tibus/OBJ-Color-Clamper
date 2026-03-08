#!/bin/bash
# Build decimation WASM module
# Requires: Emscripten SDK (source ~/emsdk/emsdk_env.sh first)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

emcc "$SCRIPT_DIR/decimation.c" \
  -O3 \
  -s WASM=1 \
  -s ASYNCIFY \
  -s ASYNCIFY_STACK_SIZE=65536 \
  -s EXPORTED_FUNCTIONS='["_decimate","_getProgress","_getOutputVertexCount","_getOutputFaceCount","_getOutputVertices","_getOutputFaces","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPF32","HEAP32"]' \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s MODULARIZE=1 \
  -s EXPORT_NAME='DecimationModule' \
  -s ENVIRONMENT='web' \
  -o "$SCRIPT_DIR/decimation.js"

echo "Built: decimation.js + decimation.wasm"
