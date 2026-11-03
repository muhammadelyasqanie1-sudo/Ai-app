#include <jni.h>
#include <android/log.h>
#include <llama.h>
#include <ggml-backend.h>
#include <json.hpp>

#include <algorithm>
#include <mutex>
#include <string>
#include <vector>
#include <cstring>
#include <atomic>

#define AFG_TAG "AFG-Llama"
#define AFG_LOGE(...) __android_log_print(ANDROID_LOG_ERROR, AFG_TAG, __VA_ARGS__)

using nlohmann::json;

static std::mutex g_mutex;
static std::atomic<bool> g_cancel_requested{false};
static llama_model * g_model = nullptr;
static llama_context * g_context = nullptr;
static const llama_vocab * g_vocab = nullptr;
static bool g_backend_initialized = false;
static std::string g_last_error;

static std::string from_jstring(JNIEnv * env, jstring value) {
    if (value == nullptr) return {};
    const char * chars = env->GetStringUTFChars(value, nullptr);
    if (chars == nullptr) return {};
    std::string result(chars);
    env->ReleaseStringUTFChars(value, chars);
    return result;
}

static void unload_locked() {
    if (g_context) { llama_free(g_context); g_context = nullptr; }
    if (g_model) { llama_model_free(g_model); g_model = nullptr; }
    g_vocab = nullptr;
    if (g_backend_initialized) { llama_backend_free(); g_backend_initialized = false; }
}

extern "C" JNIEXPORT jboolean JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeLoadModel(
    JNIEnv * env, jobject, jstring jpath, jstring jnative_lib_dir, jint context_size, jint threads) {
    std::lock_guard<std::mutex> lock(g_mutex);
    unload_locked();
    g_last_error.clear();
    const std::string path = from_jstring(env, jpath);
    if (path.empty()) { g_last_error = "Model file path is empty."; return JNI_FALSE; }

    llama_backend_init();
    const std::string native_lib_dir = from_jstring(env, jnative_lib_dir);
    if (!native_lib_dir.empty()) ggml_backend_load_all_from_path(native_lib_dir.c_str());
    g_backend_initialized = true;

    llama_model_params model_params = llama_model_default_params();
    model_params.n_gpu_layers = 0;
    g_model = llama_model_load_from_file(path.c_str(), model_params);
    if (!g_model) {
        g_last_error = "llama.cpp could not load this GGUF model. Check its architecture and file integrity.";
        unload_locked();
        return JNI_FALSE;
    }

    llama_context_params context_params = llama_context_default_params();
    const uint32_t ctx = static_cast<uint32_t>(std::max(512, std::min(4096, static_cast<int>(context_size))));
    const int32_t thread_count = std::max(1, std::min(4, static_cast<int>(threads)));
    context_params.n_ctx = ctx;
    context_params.n_batch = std::min<uint32_t>(ctx, 512);
    context_params.n_ubatch = std::min<uint32_t>(ctx, 512);
    context_params.n_threads = thread_count;
    context_params.n_threads_batch = thread_count;
    g_context = llama_init_from_model(g_model, context_params);
    if (!g_context) {
        g_last_error = "llama.cpp could not allocate the inference context. This model may exceed available RAM.";
        unload_locked();
        return JNI_FALSE;
    }
    g_vocab = llama_model_get_vocab(g_model);
    if (!g_vocab) {
        g_last_error = "The GGUF model does not expose a supported tokenizer.";
        unload_locked();
        return JNI_FALSE;
    }
    return JNI_TRUE;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeGenerateStream(
    JNIEnv * env, jobject, jstring jmessages, jint max_tokens, jobject callback) {
    std::lock_guard<std::mutex> lock(g_mutex);
    g_last_error.clear();
    if (callback == nullptr) { g_last_error = "A native streaming callback is required."; return nullptr; }
    jclass callback_class = env->GetObjectClass(callback);
    if (callback_class == nullptr) { g_last_error = "Unable to resolve the streaming callback."; return nullptr; }
    jmethodID on_token = env->GetMethodID(callback_class, "onNativeToken", "(Ljava/lang/String;)V");
    if (on_token == nullptr) { env->DeleteLocalRef(callback_class); g_last_error = "The Java streaming callback method is unavailable."; return nullptr; }

    if (!g_model || !g_context || !g_vocab) {
        g_last_error = "No GGUF model is loaded.";
        return nullptr;
    }

    try {
        const std::string raw = from_jstring(env, jmessages);
        const json input = json::parse(raw);
        if (!input.is_array() || input.empty()) {
            g_last_error = "A non-empty chat message array is required.";
            return nullptr;
        }

        std::vector<std::string> roles;
        std::vector<std::string> contents;
        roles.reserve(input.size());
        contents.reserve(input.size());
        size_t total_chars = 0;
        for (const auto & item : input) {
            if (!item.is_object()) continue;
            const std::string role = item.value("role", std::string("user"));
            const std::string content = item.value("content", std::string(""));
            if (content.empty()) continue;
            roles.push_back(role);
            contents.push_back(content);
            total_chars += role.size() + content.size();
        }
        if (contents.empty()) {
            g_last_error = "No readable text messages were supplied.";
            return nullptr;
        }

        std::vector<llama_chat_message> chat;
        chat.reserve(contents.size());
        for (size_t i = 0; i < contents.size(); ++i) {
            chat.push_back({ roles[i].c_str(), contents[i].c_str() });
        }

        const char * model_template = llama_model_chat_template(g_model, nullptr);
        if (model_template == nullptr) model_template = "chatml";
        std::string prompt;
        std::vector<char> prompt_buffer(std::max<size_t>(4096, total_chars * 4 + 2048));
        int32_t prompt_size = llama_chat_apply_template(model_template, chat.data(), chat.size(), true, prompt_buffer.data(), static_cast<int32_t>(prompt_buffer.size()));
        if (prompt_size < 0) {
            model_template = "chatml";
            prompt_size = llama_chat_apply_template(model_template, chat.data(), chat.size(), true, prompt_buffer.data(), static_cast<int32_t>(prompt_buffer.size()));
        }
        if (prompt_size > 0 && static_cast<size_t>(prompt_size) >= prompt_buffer.size()) {
            prompt_buffer.resize(static_cast<size_t>(prompt_size) + 1);
            prompt_size = llama_chat_apply_template(model_template, chat.data(), chat.size(), true, prompt_buffer.data(), static_cast<int32_t>(prompt_buffer.size()));
        }
        if (prompt_size <= 0 || static_cast<size_t>(prompt_size) > prompt_buffer.size()) {
            g_last_error = "The model chat template is not supported by this llama.cpp build.";
            return nullptr;
        }
        prompt.assign(prompt_buffer.data(), static_cast<size_t>(prompt_size));

        std::vector<llama_token> tokens(std::max<size_t>(4096, prompt.size() * 2));
        int32_t token_count = llama_tokenize(
            g_vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()),
            tokens.data(), static_cast<int32_t>(tokens.size()), true, true);
        if (token_count < 0) {
            tokens.resize(static_cast<size_t>(-token_count) + 16);
            token_count = llama_tokenize(
                g_vocab, prompt.c_str(), static_cast<int32_t>(prompt.size()),
                tokens.data(), static_cast<int32_t>(tokens.size()), true, true);
        }
        if (token_count <= 0 || static_cast<uint32_t>(token_count) > llama_n_ctx(g_context) - 8) {
            g_last_error = "The conversation is too long for this model context. Clear some history or use a shorter prompt.";
            return nullptr;
        }
        tokens.resize(static_cast<size_t>(token_count));

        llama_memory_clear(llama_get_memory(g_context), true);
        const int32_t prompt_batch_size = static_cast<int32_t>(std::min<uint32_t>(llama_n_batch(g_context), 512));
        for (int32_t offset = 0; offset < token_count; offset += prompt_batch_size) {
            const int32_t count = std::min(prompt_batch_size, token_count - offset);
            llama_batch prompt_batch = llama_batch_get_one(tokens.data() + offset, count);
            if (llama_decode(g_context, prompt_batch) < 0) {
                g_last_error = "llama.cpp failed while processing the prompt.";
                return nullptr;
            }
        }

        const int32_t vocab_size = llama_vocab_n_tokens(g_vocab);
        const int32_t limit = std::max(1, std::min(512, static_cast<int>(max_tokens)));
        std::string output;
        output.reserve(static_cast<size_t>(limit) * 6);
        for (int32_t step = 0; step < limit; ++step) {
            if (g_cancel_requested.load(std::memory_order_acquire)) break;
            float * logits = llama_get_logits_ith(g_context, -1);
            if (!logits || vocab_size <= 0) {
                g_last_error = "llama.cpp did not return generation logits.";
                return nullptr;
            }
            llama_token best = 0;
            for (int32_t i = 1; i < vocab_size; ++i) {
                if (logits[i] > logits[best]) best = i;
            }
            if (llama_vocab_is_eog(g_vocab, best)) break;

            char piece[4096];
            const int32_t piece_size = llama_token_to_piece(g_vocab, best, piece, sizeof(piece), 0, false);
            if (piece_size > 0) {
                const std::string token_piece(piece, static_cast<size_t>(piece_size));
                output.append(token_piece);
                jstring java_piece = env->NewStringUTF(token_piece.c_str());
                if (java_piece != nullptr) {
                    env->CallVoidMethod(callback, on_token, java_piece);
                    env->DeleteLocalRef(java_piece);
                }
                if (env->ExceptionCheck()) {
                    env->ExceptionClear();
                    g_last_error = "The JavaScript streaming listener failed.";
                    env->DeleteLocalRef(callback_class);
                    return nullptr;
                }
            }

            llama_batch next_batch = llama_batch_get_one(&best, 1);
            if (llama_decode(g_context, next_batch) < 0) break;
        }
        env->DeleteLocalRef(callback_class);
        return env->NewStringUTF(output.c_str());
    } catch (const std::exception & error) {
        g_last_error = error.what();
        AFG_LOGE("Generation failed: %s", error.what());
        return nullptr;
    } catch (...) {
        g_last_error = "Unknown native inference error.";
        return nullptr;
    }
}

extern "C" JNIEXPORT void JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeResetGeneration(JNIEnv *, jobject) {
    g_cancel_requested.store(false, std::memory_order_release);
}

extern "C" JNIEXPORT void JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeCancelGeneration(JNIEnv *, jobject) {
    g_cancel_requested.store(true, std::memory_order_release);
}

extern "C" JNIEXPORT void JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeUnloadModel(JNIEnv *, jobject) {
    std::lock_guard<std::mutex> lock(g_mutex);
    unload_locked();
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_afgai_offlinemodels_AFGOfflineModelsPlugin_nativeGetLastError(JNIEnv * env, jobject) {
    std::lock_guard<std::mutex> lock(g_mutex);
    return env->NewStringUTF(g_last_error.c_str());
}
