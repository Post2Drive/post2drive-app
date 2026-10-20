package com.post2drive.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.ext.junit.rules.ActivityScenarioRule;

import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;

import static androidx.test.espresso.web.assertion.WebViewAssertions.webMatches;
import static androidx.test.espresso.web.sugar.Web.onWebView;
import static androidx.test.espresso.web.webdriver.DriverAtoms.findElement;
import static androidx.test.espresso.web.webdriver.DriverAtoms.getText;
import static androidx.test.espresso.web.webdriver.Locator.TAG_NAME;
import static org.hamcrest.Matchers.containsString;

@RunWith(AndroidJUnit4.class)
public class CapacitorWebViewSmokeTest {
    @Rule
    public ActivityScenarioRule<MainActivity> activityRule =
        new ActivityScenarioRule<>(MainActivity.class);

    @Test
    public void loadsPost2DriveWebContentFromHttpsStaging() {
        onWebView()
            .withElement(findElement(TAG_NAME, "body"))
            .check(webMatches(getText(), containsString("Post2Drive")));
    }
}
