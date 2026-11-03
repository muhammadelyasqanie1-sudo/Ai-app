package com.afgai.offlinemodels;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public final class AFGDownloadStore {
    private static final String PREFS = "afg_ai_range_downloads";
    private static final String NEXT_ID = "next_download_id";
    private static final String PREFIX = "download_";

    private AFGDownloadStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static synchronized int nextId(Context context) {
        SharedPreferences preferences = prefs(context);
        int id = preferences.getInt(NEXT_ID, 1000) + 1;
        preferences.edit().putInt(NEXT_ID, id).apply();
        return id;
    }

    public static JSONObject get(Context context, int id) {
        String raw = prefs(context).getString(PREFIX + id, null);
        if (raw == null) return null;
        try { return new JSONObject(raw); }
        catch (JSONException ignored) { return null; }
    }

    public static void put(Context context, int id, JSONObject value) {
        prefs(context).edit().putString(PREFIX + id, value.toString()).apply();
    }

    public static void update(Context context, int id, String key, Object value) {
        JSONObject metadata = get(context, id);
        if (metadata == null) return;
        try {
            metadata.put(key, value);
            metadata.put("updatedAt", System.currentTimeMillis());
            put(context, id, metadata);
        } catch (JSONException ignored) { }
    }

    public static List<JSONObject> all(Context context) {
        List<JSONObject> result = new ArrayList<>();
        Map<String, ?> values = prefs(context).getAll();
        for (Map.Entry<String, ?> entry : values.entrySet()) {
            if (!entry.getKey().startsWith(PREFIX) || !(entry.getValue() instanceof String)) continue;
            try { result.add(new JSONObject((String) entry.getValue())); }
            catch (JSONException ignored) { }
        }
        return result;
    }

    public static void remove(Context context, int id) {
        prefs(context).edit().remove(PREFIX + id).apply();
    }
}
