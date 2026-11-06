cmake_minimum_required(VERSION 3.22.1)
project(afg_offline_models LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_FLAGS "${CMAKE_C_FLAGS} -O3")
set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -O3")

set(BUILD_SHARED_LIBS ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_APP OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_OPENSSL OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_BACKEND_DL ON CACHE BOOL "" FORCE)
set(GGML_VULKAN OFF CACHE BOOL "" FORCE)
set(GGML_OPENCL OFF CACHE BOOL "" FORCE)
set(GGML_RPC OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)

include(FetchContent)
FetchContent_Declare(llama_cpp
  URL https://github.com/ggml-org/llama.cpp/archive/ca8daad199a9c12c5b54643b974c640939a0f7bd.tar.gz
)
FetchContent_MakeAvailable(llama_cpp)

# The CI/local helper downloads the official ARM64 archive. Verify it again at configure time.
set(NEEDLE_ARCHIVE "${CMAKE_CURRENT_SOURCE_DIR}/prebuilt/libneedle.a")
set(NEEDLE_ARCHIVE_SHA256 "7aa6de6132a22bf45f5e903425feb66f159ad46f47fa558921bc4fd02c3a2fa0")
if(NOT EXISTS "${NEEDLE_ARCHIVE}")
  message(FATAL_ERROR "Missing Needle 3 Android ARM64 engine. Run scripts/download-needle-android.sh first.")
endif()
if(NOT EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/prebuilt/needle.h")
  message(FATAL_ERROR "Missing official Needle C API header. Run scripts/download-needle-android.sh first.")
endif()
file(SHA256 "${NEEDLE_ARCHIVE}" ACTUAL_NEEDLE_SHA256)
if(NOT ACTUAL_NEEDLE_SHA256 STREQUAL NEEDLE_ARCHIVE_SHA256)
  message(FATAL_ERROR "Needle 3 Android engine SHA-256 mismatch; refusing to link.")
endif()

add_library(needle3_engine STATIC IMPORTED GLOBAL)
set_target_properties(needle3_engine PROPERTIES IMPORTED_LOCATION "${NEEDLE_ARCHIVE}")

add_library(afg_llama_jni SHARED afg_llama_jni.cpp)
target_include_directories(afg_llama_jni PRIVATE
  ${llama_cpp_SOURCE_DIR}/include
  ${llama_cpp_SOURCE_DIR}/ggml/include
  ${llama_cpp_SOURCE_DIR}/vendor/nlohmann
)
target_link_libraries(afg_llama_jni PRIVATE llama ggml android log)

add_library(afg_needle_jni SHARED needle3_jni.cpp)
target_include_directories(afg_needle_jni PRIVATE ${CMAKE_CURRENT_SOURCE_DIR} ${CMAKE_CURRENT_SOURCE_DIR}/prebuilt)
target_link_libraries(afg_needle_jni PRIVATE needle3_engine c++_shared android log m dl)
