# TimeGuard — Native Android Setup (Windows)

**You still need to add native files inside `android/`.** Lovable can't create files there — that folder only exists on your local machine. But it's streamlined below.

---

## Quick Start (3 Steps)

### Step 1: Set up the Android project

```powershell
# In your project folder (PowerShell):
npm install
npm run build
npx cap add android
npx cap sync android
```

### Step 2: Run the setup script (PowerShell)

Copy-paste this entire block into **PowerShell** from the project root. It creates ALL native files automatically:

```powershell
# Set paths
$PKG_DIR = "android\app\src\main\java\app\lovable\a1149aacd1d37483ba33873e03d9b20c6"
$PLUGINS_DIR = "$PKG_DIR\plugins"
$RES_DIR = "android\app\src\main\res"

# Create directories
New-Item -ItemType Directory -Force -Path $PLUGINS_DIR | Out-Null
New-Item -ItemType Directory -Force -Path "$RES_DIR\xml" | Out-Null

# ============================================
# 1. Accessibility Service
# ============================================
@'
package app.lovable.a1149aacd1d37483ba33873e03d9b20c6;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.AccessibilityServiceInfo;
import android.view.accessibility.AccessibilityEvent;
import android.util.Log;

public class TimeGuardAccessibilityService extends AccessibilityService {
    private static final String TAG = "TIMEGUARD_ACCESS";
    private static String currentForegroundPackage = "";

    public static String getCurrentForegroundPackage() {
        return currentForegroundPackage;
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        if (event == null || event.getPackageName() == null) return;
        String packageName = event.getPackageName().toString();
        if (event.getEventType() == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) {
            if (!packageName.equals(currentForegroundPackage)) {
                Log.d(TAG, "App Switch: " + currentForegroundPackage + " -> " + packageName);
                currentForegroundPackage = packageName;
            }
        }
    }

    @Override
    public void onInterrupt() { Log.d(TAG, "Interrupted"); }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        AccessibilityServiceInfo info = getServiceInfo();
        if (info != null) {
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED;
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC;
            info.notificationTimeout = 200;
            info.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS;
            setServiceInfo(info);
        }
        Log.d(TAG, "Service connected");
    }
}
'@ | Set-Content -Path "$PKG_DIR\TimeGuardAccessibilityService.java" -Encoding UTF8

# ============================================
# 2. Accessibility Service Config XML
# ============================================
@'
<?xml version="1.0" encoding="utf-8"?>
<accessibility-service
    xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeWindowStateChanged"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:notificationTimeout="200"
    android:canRetrieveWindowContent="false"
    android:accessibilityFlags="flagReportViewIds"
    android:description="@string/accessibility_service_description" />
'@ | Set-Content -Path "$RES_DIR\xml\accessibility_service_config.xml" -Encoding UTF8

# ============================================
# 3. App Usage Plugin
# ============================================
@'
package app.lovable.a1149aacd1d37483ba33873e03d9b20c6.plugins;

import android.app.AppOpsManager;
import android.app.usage.UsageStats;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import app.lovable.a1149aacd1d37483ba33873e03d9b20c6.TimeGuardAccessibilityService;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.SortedMap;
import java.util.TreeMap;

@CapacitorPlugin(name = "AppUsage")
public class AppUsagePlugin extends Plugin {
    private static final String TAG = "TIMEGUARD_USAGE";
    private Handler handler;
    private Runnable monitorRunnable;
    private boolean isMonitoring = false;
    private String lastForegroundApp = "";
    private List<String> workApps = new ArrayList<>();
    private List<String> distractionApps = new ArrayList<>();

    private static final String[] DEFAULT_DISTRACTION_APPS = {
        "com.whatsapp", "com.instagram.android", "com.facebook.katana",
        "com.twitter.android", "com.discord", "com.snapchat.android",
        "com.zhiliaoapp.musically", "com.google.android.youtube",
        "com.netflix.mediaclient", "com.reddit.frontpage",
        "org.telegram.messenger", "com.pinterest"
    };

    @Override
    public void load() {
        handler = new Handler(Looper.getMainLooper());
        for (String app : DEFAULT_DISTRACTION_APPS) distractionApps.add(app);
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", hasUsageStatsPermission());
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void getUsageStats(PluginCall call) {
        if (!hasUsageStatsPermission()) { call.reject("No permission"); return; }
        long startTime = call.getLong("startTime", System.currentTimeMillis() - 86400000);
        long endTime = call.getLong("endTime", System.currentTimeMillis());
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        Map<String, UsageStats> stats = usm.queryAndAggregateUsageStats(startTime, endTime);
        JSArray apps = new JSArray();
        PackageManager pm = getContext().getPackageManager();
        for (Map.Entry<String, UsageStats> entry : stats.entrySet()) {
            UsageStats us = entry.getValue();
            if (us.getTotalTimeInForeground() > 0) {
                JSObject app = new JSObject();
                app.put("packageName", us.getPackageName());
                app.put("lastTimeUsed", us.getLastTimeUsed());
                app.put("totalTimeInForeground", us.getTotalTimeInForeground());
                try {
                    ApplicationInfo ai = pm.getApplicationInfo(us.getPackageName(), 0);
                    app.put("appName", pm.getApplicationLabel(ai).toString());
                } catch (PackageManager.NameNotFoundException e) {
                    app.put("appName", us.getPackageName());
                }
                apps.put(app);
            }
        }
        JSObject result = new JSObject();
        result.put("apps", apps);
        call.resolve(result);
    }

    @PluginMethod
    public void getForegroundApp(PluginCall call) {
        String accessibilityApp = TimeGuardAccessibilityService.getCurrentForegroundPackage();
        if (!accessibilityApp.isEmpty()) {
            JSObject result = new JSObject();
            result.put("packageName", accessibilityApp);
            result.put("appName", getAppName(accessibilityApp));
            result.put("timestamp", System.currentTimeMillis());
            call.resolve(result);
            return;
        }
        if (!hasUsageStatsPermission()) { call.reject("No permission"); return; }
        String fg = getForegroundPackageViaUsageStats();
        JSObject result = new JSObject();
        result.put("packageName", fg);
        result.put("appName", getAppName(fg));
        result.put("timestamp", System.currentTimeMillis());
        call.resolve(result);
    }

    @PluginMethod
    public void startMonitoring(PluginCall call) {
        if (!hasUsageStatsPermission()) { call.reject("No permission"); return; }
        int intervalMs = call.getInt("intervalMs", 5000);
        try {
            JSArray workAppsArray = call.getArray("workApps");
            if (workAppsArray != null) {
                workApps.clear();
                for (int i = 0; i < workAppsArray.length(); i++) workApps.add(workAppsArray.getString(i));
            }
        } catch (Exception e) { Log.w(TAG, "Could not parse workApps", e); }

        isMonitoring = true;
        String initial = TimeGuardAccessibilityService.getCurrentForegroundPackage();
        lastForegroundApp = initial.isEmpty() ? getForegroundPackageViaUsageStats() : initial;

        monitorRunnable = new Runnable() {
            @Override public void run() {
                if (!isMonitoring) return;
                String currentApp = TimeGuardAccessibilityService.getCurrentForegroundPackage();
                if (currentApp.isEmpty()) currentApp = getForegroundPackageViaUsageStats();
                if (!currentApp.isEmpty() && !currentApp.equals(lastForegroundApp)) {
                    boolean isDistraction = distractionApps.contains(currentApp) && !workApps.contains(currentApp);
                    JSObject event = new JSObject();
                    event.put("fromApp", lastForegroundApp);
                    event.put("toApp", currentApp);
                    event.put("toAppName", getAppName(currentApp));
                    event.put("timestamp", System.currentTimeMillis());
                    event.put("isDistraction", isDistraction);
                    notifyListeners("appSwitched", event);
                    lastForegroundApp = currentApp;
                }
                handler.postDelayed(this, intervalMs);
            }
        };
        handler.post(monitorRunnable);
        call.resolve();
    }

    @PluginMethod
    public void stopMonitoring(PluginCall call) {
        isMonitoring = false;
        if (monitorRunnable != null) handler.removeCallbacks(monitorRunnable);
        call.resolve();
    }

    private boolean hasUsageStatsPermission() {
        AppOpsManager appOps = (AppOpsManager) getContext().getSystemService(Context.APP_OPS_SERVICE);
        int mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), getContext().getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    private String getForegroundPackageViaUsageStats() {
        UsageStatsManager usm = (UsageStatsManager) getContext().getSystemService(Context.USAGE_STATS_SERVICE);
        long time = System.currentTimeMillis();
        List<UsageStats> stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, time - 10000, time);
        if (stats != null && !stats.isEmpty()) {
            SortedMap<Long, UsageStats> sorted = new TreeMap<>();
            for (UsageStats us : stats) sorted.put(us.getLastTimeUsed(), us);
            if (!sorted.isEmpty()) return sorted.get(sorted.lastKey()).getPackageName();
        }
        return "";
    }

    private String getAppName(String packageName) {
        try {
            ApplicationInfo ai = getContext().getPackageManager().getApplicationInfo(packageName, 0);
            return getContext().getPackageManager().getApplicationLabel(ai).toString();
        } catch (PackageManager.NameNotFoundException e) { return packageName; }
    }
}
'@ | Set-Content -Path "$PLUGINS_DIR\AppUsagePlugin.java" -Encoding UTF8

# ============================================
# 4. Persistent Notification Plugin
# ============================================
@'
package app.lovable.a1149aacd1d37483ba33873e03d9b20c6.plugins;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.Bundle;

import androidx.core.app.NotificationCompat;
import androidx.core.app.RemoteInput;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "PersistentNotification")
public class PersistentNotificationPlugin extends Plugin {
    private static final String CHANNEL_ID = "persistent_chat";
    private static final int NOTIFICATION_ID = 9001;
    private static final String KEY_TEXT_REPLY = "key_text_reply";
    private static final String ACTION_REPLY = "app.lovable.a1149aacd1d37483ba33873e03d9b20c6.ACTION_REPLY";

    private NotificationManager notificationManager;
    private String currentTitle = "Quick Note";
    private String currentBody = "Tap to open or reply with what you're doing";
    private BroadcastReceiver replyReceiver;

    @Override
    public void load() {
        notificationManager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
        createNotificationChannel();
        registerReplyReceiver();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Messages", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Quick notes");
            channel.setShowBadge(false);
            notificationManager.createNotificationChannel(channel);
        }
    }

    private void registerReplyReceiver() {
        replyReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
                if (remoteInput != null) {
                    CharSequence cs = remoteInput.getCharSequence(KEY_TEXT_REPLY);
                    if (cs == null) return;
                    String replyText = cs.toString();
                    JSObject data = new JSObject();
                    data.put("text", replyText);
                    notifyListeners("notificationReply", data);
                    currentBody = "Got it: " + replyText;
                    showNotification();
                    getActivity().getWindow().getDecorView().postDelayed(() -> {
                        currentBody = "Tap to open or reply with what you're doing";
                        showNotification();
                    }, 3000);
                }
            }
        };
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(replyReceiver, new IntentFilter(ACTION_REPLY), Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(replyReceiver, new IntentFilter(ACTION_REPLY));
        }
    }

    @PluginMethod
    public void show(PluginCall call) {
        currentTitle = call.getString("title", currentTitle);
        currentBody = call.getString("body", currentBody);
        showNotification();
        call.resolve();
    }

    @PluginMethod
    public void update(PluginCall call) {
        currentBody = call.getString("body", currentBody);
        showNotification();
        call.resolve();
    }

    @PluginMethod
    public void dismiss(PluginCall call) {
        notificationManager.cancel(NOTIFICATION_ID);
        call.resolve();
    }

    private void showNotification() {
        RemoteInput remoteInput = new RemoteInput.Builder(KEY_TEXT_REPLY).setLabel("Type here...").build();
        Intent replyIntent = new Intent(ACTION_REPLY);
        PendingIntent replyPendingIntent = PendingIntent.getBroadcast(getContext(), 0, replyIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);
        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(android.R.drawable.ic_menu_edit, "Reply", replyPendingIntent).addRemoteInput(remoteInput).build();
        Intent openIntent = getContext().getPackageManager().getLaunchIntentForPackage(getContext().getPackageName());
        PendingIntent openPendingIntent = PendingIntent.getActivity(getContext(), 0, openIntent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_email)
            .setContentTitle(currentTitle)
            .setContentText(currentBody)
            .setStyle(new NotificationCompat.MessagingStyle("You").addMessage(currentBody, System.currentTimeMillis(), "Assistant"))
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(openPendingIntent)
            .addAction(replyAction)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build();

        notificationManager.notify(NOTIFICATION_ID, notification);
    }

    @Override
    protected void handleOnDestroy() {
        if (replyReceiver != null) getContext().unregisterReceiver(replyReceiver);
        super.handleOnDestroy();
    }
}
'@ | Set-Content -Path "$PLUGINS_DIR\PersistentNotificationPlugin.java" -Encoding UTF8

# ============================================
# 5. MainActivity (register plugins)
# ============================================
@'
package app.lovable.a1149aacd1d37483ba33873e03d9b20c6;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import app.lovable.a1149aacd1d37483ba33873e03d9b20c6.plugins.AppUsagePlugin;
import app.lovable.a1149aacd1d37483ba33873e03d9b20c6.plugins.PersistentNotificationPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUsagePlugin.class);
        registerPlugin(PersistentNotificationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
'@ | Set-Content -Path "$PKG_DIR\MainActivity.java" -Encoding UTF8

Write-Host "All Java files created!" -ForegroundColor Green
Write-Host "Now do the 2 manual edits below (AndroidManifest.xml + strings.xml)"
```

### Step 3: Two manual edits

#### A. Edit `android\app\src\main\AndroidManifest.xml`

Add `xmlns:tools` to the `<manifest>` tag:
```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">
```

Add these permissions **before** `<application>`:
```xml
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" tools:ignore="ProtectedPermissions" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
```

Add this **inside** `<application>` (before `</application>`):
```xml
<service
    android:name=".TimeGuardAccessibilityService"
    android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
    android:exported="true">
    <intent-filter>
        <action android:name="android.accessibilityservice.AccessibilityService" />
    </intent-filter>
    <meta-data
        android:name="android.accessibilityservice"
        android:resource="@xml/accessibility_service_config" />
</service>
```

#### B. Edit `android\app\src\main\res\values\strings.xml`

Add inside `<resources>`:
```xml
<string name="accessibility_service_description">TimeGuard detects which app is on screen to help you stay focused.</string>
```

---

## Build & Install

```powershell
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Build > Build APK
```

---

## After Installing the APK

1. **Settings → Accessibility → TimeGuard** → Toggle ON
2. Open the app → go to **Apps** tab → tap **Grant Permission** for Usage Access
3. Tap **Start** to begin monitoring
4. Allow notifications when prompted
5. In the header, tap the **Bell icon** to enable persistent notification

---

## Persistent Notification

The bell icon (🔔) in the app header toggles the persistent notification. When active:
- A permanent notification stays in your notification shade
- You can **reply directly** from the notification to log activities
- It shows your current activity
- Low priority = no sound/vibration, minimal battery

---

## Battery Optimization Notes

This app is designed to be battery-friendly:

- **Polling interval: 5 seconds** (not continuous)
- **Accessibility Service** only listens for `TYPE_WINDOW_STATE_CHANGED`
- **`canRetrieveWindowContent="false"`** — doesn't read screen content
- **`notificationTimeout="200"`** — debounces rapid events
- **Notification priority: LOW** — no vibration/sound
- **No background location or wake locks**

### Disable Battery Optimization (recommended)

After installing, go to **Settings → Battery → TimeGuard → Don't optimize**. This prevents Android from killing the accessibility service during Doze mode.

---

## Verify It's Working

```powershell
adb logcat -s TIMEGUARD_ACCESS TIMEGUARD_USAGE
```

You should see logs like:
```
TIMEGUARD_ACCESS: App Switch: com.instagram.android -> app.lovable.1149aacd...
```

---

## Already Set Up?

If you already manually created the Java files and they work in logcat, you're good! Just make sure:
1. `MainActivity.java` has both `registerPlugin(AppUsagePlugin.class)` and `registerPlugin(PersistentNotificationPlugin.class)`
2. The accessibility service and manifest entries are in place
3. Rebuild: `npm run build && npx cap sync android` then build APK in Android Studio
