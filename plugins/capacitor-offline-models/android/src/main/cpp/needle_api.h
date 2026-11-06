#ifndef AFG_NEEDLE_API_H
#define AFG_NEEDLE_API_H

#ifdef __cplusplus
extern "C" {
#endif

int needle_init(const char* system_prompt, const char* tools_json, const char* tool_index_path);
int needle_complete(const char* input, int max_new_tokens, char* out, int out_capacity);
int needle_embed(const char* input, float* out, int out_capacity);
void needle_reset(void);
int needle_load(const unsigned char* cact, unsigned long long n);

#ifdef __cplusplus
}
#endif
#endif
