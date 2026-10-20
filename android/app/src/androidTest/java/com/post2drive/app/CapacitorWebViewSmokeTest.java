package com.post2drive.app;

import android.view.View;
import android.view.ViewGroup;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.ext.junit.rules.ActivityScenarioRule;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public class CapacitorWebViewSmokeTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
        new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void launchesCapacitorWebViewOnAndroid() {
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        activityRule.getScenario().onActivity(activity -> {
            View decor = activity.getWindow().getDecorView();
            View bridgeWebView = findBridgeWebView(decor);
            assertNotNull("Capacitor BridgeWebView should be attached to the activity", bridgeWebView);
            assertTrue("Capacitor BridgeWebView should be visible", bridgeWebView.isShown());
        });
    }

    private static View findBridgeWebView(View view) {
        if (view.getClass().getName().contains("BridgeWebView")) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View match = findBridgeWebView(group.getChildAt(i));
                if (match != null) return match;
            }
        }
        return null;
    }
}
