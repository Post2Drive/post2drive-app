package com.post2drive.app;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.concurrent.atomic.AtomicReference;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class CapacitorWebViewSmokeTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
        new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void launchesCapacitorWebViewOnAndroid() throws InterruptedException {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();

        // Capacitor initializes its bridge asynchronously after Activity launch.
        // Poll from the instrumentation thread so the main thread remains free to
        // attach the WebView; avoid asserting on a transient pre-bridge layout.
        AtomicReference<WebView> webView = new AtomicReference<>();
        long deadline = System.currentTimeMillis() + 20_000L;
        while (System.currentTimeMillis() < deadline && webView.get() == null) {
            activityRule.getScenario().onActivity(activity -> {
                View found = findWebView(activity.getWindow().getDecorView());
                if (found instanceof WebView) {
                    webView.set((WebView) found);
                }
            });
            if (webView.get() == null) {
                Thread.sleep(250L);
            }
        }

        assertNotNull("Capacitor WebView should attach after bridge initialization", webView.get());
        assertTrue("Capacitor WebView should be visible", webView.get().isShown());
    }

    private static View findWebView(View view) {
        if (view instanceof WebView) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View match = findWebView(group.getChildAt(i));
                if (match != null) return match;
            }
        }
        return null;
    }
}
