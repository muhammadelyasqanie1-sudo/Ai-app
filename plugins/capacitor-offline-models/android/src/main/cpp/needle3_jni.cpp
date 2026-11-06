#include <jni.h>
#include <android/log.h>
#include "prebuilt/needle.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <mutex>
#include <string>
#include <vector>

#define AFG_NEEDLE_TAG "AFG-Needle3"
#define AFG_NEEDLE_LOGE(...) __android_log_print(ANDROID_LOG_ERROR, AFG_NEEDLE_TAG, __VA_ARGS__)

static std::mutex g_needle_mutex;
static std::vector<unsigned char> g_needle_weights;
static bool g_needle_loaded = false;
static bool g_needle_initialized = false;
static std::string g_needle_error;

static std::string from_jstring(JNIEnv* env, jstring value) {
    if (!value) return {};
    const char* chars = env->GetStringUTFChars(value, nullptr);
    if (!chars) return {};
    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeLoadNeedleModel(
    JNIEnv* env, jobject, jstring jpath, jstring jsystem_prompt, jstring jtools_json) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    g_needle_error.clear();
    const std::string path = from_jstring(env, jpath);
    const std::string system_prompt = from_jstring(env, jsystem_prompt);
    const std::string tools_json = from_jstring(env, jtools_json);
    if (path.empty() || system_prompt.empty() || tools_json.empty()) {
        g_needle_error = "Needle model path, system prompt and tool schema are required.";
        return JNI_FALSE;
    }

    if (!g_needle_loaded) {
        // The upstream engine enables anonymous telemetry by default; opt out before initialization.
        setenv("NEEDLE_TELEMETRY", "0", 1);
        setenv("DO_NOT_TRACK", "1", 1);
        std::ifstream input(path, std::ios::binary);
        if (!input) {
            g_needle_error = "Unable to open the verified Needle .cact model.";
            return JNI_FALSE;
        }
        std::vector<unsigned char> weights((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
        if (weights.empty() || weights.size() > 64ULL * 1024ULL * 1024ULL) {
            g_needle_error = "Needle model size is invalid; expected a non-empty file below 64 MB.";
            return JNI_FALSE;
        }
        const int loaded = needle_load(weights.data(), static_cast<unsigned long long>(weights.size()));
        if (loaded < 0) {
            g_needle_error = "Cactus Needle engine rejected the .cact model (code " + std::to_string(loaded) + ").";
            return JNI_FALSE;
        }
        g_needle_weights = std::move(weights);
        g_needle_loaded = true;
    }

    if (g_needle_initialized) needle_reset();
    const int initialized = needle_init(system_prompt.c_str(), tools_json.c_str(), nullptr);
    if (initialized < 0) {
        g_needle_error = "Cactus Needle could not initialize the command schema (code " + std::to_string(initialized) + ").";
        g_needle_initialized = false;
        return JNI_FALSE;
    }
    g_needle_initialized = true;
    return JNI_TRUE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeCompleteNeedle(
    JNIEnv* env, jobject, jstring jinput, jint max_tokens) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    g_needle_error.clear();
    if (!g_needle_loaded || !g_needle_initialized) {
        g_needle_error = "Needle 3 is not loaded and initialized.";
        return nullptr;
    }
    const std::string input = from_jstring(env, jinput);
    if (input.empty() || input.size() > 1200) {
        g_needle_error = "The JARVIS command must contain between 1 and 1,200 characters.";
        return nullptr;
    }

    const int limit = std::max(8, std::min(192, static_cast<int>(max_tokens)));
    std::vector<char> output(16 * 1024, '\0');
    const int result = needle_complete(input.c_str(), limit, output.data(), static_cast<int>(output.size()));
    if (result < 0) {
        g_needle_error = "Needle 3 inference failed (code " + std::to_string(result) + ").";
        AFG_NEEDLE_LOGE("%s", g_needle_error.c_str());
        return nullptr;
    }
    output.back() = '\0';
    if (output[0] == '\0') {
        g_needle_error = "Needle 3 returned an empty response.";
        return nullptr;
    }
    return env->NewStringUTF(output.data());
}

extern "C" JNIEXPORT void JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeResetNeedle(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    if (g_needle_initialized) needle_reset();
    g_needle_initialized = false;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeGetNeedleError(JNIEnv* env, jobject) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    return env->NewStringUTF(g_needle_error.c_str());
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeIsNeedleModelLoaded(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    return g_needle_loaded ? JNI_TRUE : JNI_FALSE;
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeIsNeedleModelReady(JNIEnv*, jobject) {
    std::lock_guard<std::mutex> lock(g_needle_mutex);
    return g_needle_initialized ? JNI_TRUE : JNI_FALSE;
}
