package com.afgai.jarvis;

import android.accessibilityservice.AccessibilityService;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

public class AFGJarvisAccessibilityService extends AccessibilityService {
    private static volatile AFGJarvisAccessibilityService instance;

    public static boolean isConnected() { return instance != null; }

    public static boolean perform(String action) {
        AFGJarvisAccessibilityService service = instance;
        if (service == null) return false;
        switch (action) {
            case "back": return service.performGlobalAction(GLOBAL_ACTION_BACK);
            case "home": return service.performGlobalAction(GLOBAL_ACTION_HOME);
            case "notifications": return service.performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS);
            case "quickSettings": return service.performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS);
            case "scrollForward": return service.scroll(AccessibilityNodeInfo.ACTION_SCROLL_FORWARD);
            case "scrollBackward": return service.scroll(AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD);
            default: return false;
        }
    }

    public static boolean clickText(String text) {
        AFGJarvisAccessibilityService service = instance;
        if (service == null || text == null || text.trim().isEmpty()) return false;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        try {
            java.util.List<AccessibilityNodeInfo> matches = root.findAccessibilityNodeInfosByText(text.trim());
            if (matches == null) return false;
            for (AccessibilityNodeInfo node : matches) {
                if (node == null) continue;
                try {
                    AccessibilityNodeInfo target = node;
                    while (target != null && !target.isClickable()) {
                        AccessibilityNodeInfo parent = target.getParent();
                        if (target != node) target.recycle();
                        target = parent;
                    }
                    if (target != null) {
                        boolean clicked = target.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                        if (target != node) target.recycle();
                        if (clicked) return true;
                    }
                } finally {
                    if (node != null) node.recycle();
                }
            }
            return false;
        } finally {
            root.recycle();
        }
    }

    public static boolean typeText(String text) {
        AFGJarvisAccessibilityService service = instance;
        if (service == null || text == null) return false;
        AccessibilityNodeInfo root = service.getRootInActiveWindow();
        if (root == null) return false;
        try {
            AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (focused == null || !focused.isEditable()) {
                if (focused != null) focused.recycle();
                return false;
            }
            try {
                android.os.Bundle args = new android.os.Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
            } finally { focused.recycle(); }
        } finally { root.recycle(); }
    }

    private boolean scroll(int direction) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;
        try {
            return root.performAction(direction);
        } finally { root.recycle(); }
    }

    @Override public void onServiceConnected() { super.onServiceConnected(); instance = this; }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) { /* Events are not recorded or transmitted. */ }
    @Override public void onInterrupt() { }
    @Override public void onDestroy() {
        if (instance == this) instance = null;
        super.onDestroy();
    }
}
