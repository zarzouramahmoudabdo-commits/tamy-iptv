#!/usr/bin/env python3
"""يضيف مشغّل ExoPlayer الأصلي (Media3) كـ Capacitor plugin داخل مشروع أندرويد المولَّد."""
import re, sys, pathlib

root = pathlib.Path("android/app")
if not root.exists():
    sys.exit("android/app not found - run `npx cap add android` first")

pkg_dir = root / "src/main/java/com/tamy/iptv"
pkg_dir.mkdir(parents=True, exist_ok=True)

ACTIVITY = r'''package com.tamy.iptv;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.List;

public class NativePlayerActivity extends Activity {
    public static String[] URLS = new String[0];
    public static String[] TITLES = new String[0];

    private ExoPlayer player;
    private PlayerView pv;
    private TextView title;
    private boolean live = true;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        pv = new PlayerView(this);
        pv.setBackgroundColor(Color.BLACK);
        setContentView(pv);
        goImmersive();

        Intent in = getIntent();
        live = in.getBooleanExtra("live", true);
        int index = in.getIntExtra("index", 0);
        int pos = in.getIntExtra("pos", 0);
        String ua = in.getStringExtra("ua");
        if (ua == null) ua = "VLC/3.0.20 LibVLC/3.0.20";

        DefaultHttpDataSource.Factory f = new DefaultHttpDataSource.Factory()
                .setUserAgent(ua)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(15000)
                .setReadTimeoutMs(30000);
        player = new ExoPlayer.Builder(this)
                .setMediaSourceFactory(new DefaultMediaSourceFactory(f))
                .build();
        pv.setPlayer(player);

        title = new TextView(this);
        title.setTextColor(Color.WHITE);
        title.setTextSize(18);
        title.setPadding(40, 30, 40, 10);
        title.setShadowLayer(6, 0, 0, Color.BLACK);
        FrameLayout overlay = pv.getOverlayFrameLayout();
        if (overlay != null) {
            overlay.addView(title, new FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        }

        List<MediaItem> items = new ArrayList<>();
        for (int i = 0; i < URLS.length; i++) {
            String t = i < TITLES.length ? TITLES[i] : "";
            items.add(new MediaItem.Builder()
                    .setUri(URLS[i])
                    .setMediaMetadata(new MediaMetadata.Builder().setTitle(t).build())
                    .build());
        }
        if (items.isEmpty()) { finish(); return; }
        int start = Math.min(Math.max(index, 0), items.size() - 1);
        long startPos = pos > 0 ? (long) pos : C.TIME_UNSET;
        player.setMediaItems(items, start, startPos);
        player.addListener(new Player.Listener() {
            @Override
            public void onMediaItemTransition(MediaItem m, int reason) { updateTitle(); }

            @Override
            public void onPlayerError(PlaybackException e) {
                Toast.makeText(NativePlayerActivity.this,
                        "تعذّر تشغيل البث (" + e.getErrorCodeName() + ")", Toast.LENGTH_LONG).show();
            }
        });
        player.prepare();
        player.setPlayWhenReady(true);
        updateTitle();
    }

    private void updateTitle() {
        if (player == null || title == null) return;
        int i = player.getCurrentMediaItemIndex();
        if (i < 0 || i >= TITLES.length) return;
        title.setText((URLS.length > 1 ? (i + 1) + "/" + URLS.length + "   " : "") + TITLES[i]);
    }

    private void zap(int d) {
        if (player == null) return;
        int n = player.getMediaItemCount();
        if (n < 2) return;
        int i = (player.getCurrentMediaItemIndex() + d + n) % n;
        player.seekTo(i, C.TIME_UNSET);
        player.prepare();
        player.play();
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && player != null) {
            int k = e.getKeyCode();
            boolean hidden = !pv.isControllerFullyVisible();
            if (k == KeyEvent.KEYCODE_CHANNEL_UP || k == KeyEvent.KEYCODE_PAGE_UP
                    || (live && hidden && k == KeyEvent.KEYCODE_DPAD_UP)) { zap(-1); return true; }
            if (k == KeyEvent.KEYCODE_CHANNEL_DOWN || k == KeyEvent.KEYCODE_PAGE_DOWN
                    || (live && hidden && k == KeyEvent.KEYCODE_DPAD_DOWN)) { zap(1); return true; }
        }
        return super.dispatchKeyEvent(e);
    }

    private void goImmersive() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) goImmersive();
    }

    @Override
    public void finish() {
        if (player != null) {
            Intent r = new Intent();
            r.putExtra("index", player.getCurrentMediaItemIndex());
            r.putExtra("pos", (int) Math.max(0L, player.getCurrentPosition()));
            long d = player.getDuration();
            r.putExtra("dur", d == C.TIME_UNSET ? 0 : (int) d);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (player != null) player.pause();
    }

    @Override
    protected void onDestroy() {
        if (player != null) { player.release(); player = null; }
        super.onDestroy();
    }
}
'''

PLUGIN = r'''package com.tamy.iptv;

import android.content.Intent;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TamyPlayer")
public class NativePlayerPlugin extends Plugin {

    @PluginMethod
    public void play(PluginCall call) {
        try {
            JSArray u = call.getArray("urls");
            JSArray t = call.getArray("titles");
            if (u == null || u.length() == 0) { call.reject("no urls"); return; }
            String[] urls = new String[u.length()];
            String[] titles = new String[u.length()];
            for (int i = 0; i < urls.length; i++) {
                urls[i] = u.getString(i);
                titles[i] = (t != null && i < t.length()) ? t.getString(i) : "";
            }
            NativePlayerActivity.URLS = urls;
            NativePlayerActivity.TITLES = titles;

            int index = call.getInt("index", 0);
            int pos = call.getInt("pos", 0);
            boolean live = call.getBoolean("live", true);
            String ua = call.getString("ua", "VLC/3.0.20 LibVLC/3.0.20");

            Intent it = new Intent(getContext(), NativePlayerActivity.class);
            it.putExtra("index", index);
            it.putExtra("pos", pos);
            it.putExtra("live", live);
            it.putExtra("ua", ua);
            startActivityForResult(call, it, "onPlayerResult");
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @PluginMethod
    public void openExternal(PluginCall call) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(call.getString("url", "")));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject(String.valueOf(e.getMessage()));
        }
    }

    @ActivityCallback
    private void onPlayerResult(PluginCall call, ActivityResult result) {
        JSObject o = new JSObject();
        Intent d = result.getData();
        if (d != null) {
            o.put("index", d.getIntExtra("index", 0));
            o.put("pos", d.getIntExtra("pos", 0));
            o.put("dur", d.getIntExtra("dur", 0));
        }
        call.resolve(o);
    }
}
'''

MAIN = r'''package com.tamy.iptv;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativePlayerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
'''

(pkg_dir / "NativePlayerActivity.java").write_text(ACTIVITY, encoding="utf-8")
(pkg_dir / "NativePlayerPlugin.java").write_text(PLUGIN, encoding="utf-8")
(pkg_dir / "MainActivity.java").write_text(MAIN, encoding="utf-8")

# manifest: تسجيل الـ Activity
mp = root / "src/main/AndroidManifest.xml"
m = mp.read_text(encoding="utf-8")
if "NativePlayerActivity" not in m:
    act = ('    <activity\n'
           '            android:name=".NativePlayerActivity"\n'
           '            android:exported="false"\n'
           '            android:configChanges="orientation|screenSize|keyboardHidden|smallestScreenSize|screenLayout|uiMode"\n'
           '            android:screenOrientation="sensorLandscape"\n'
           '            android:theme="@android:style/Theme.Black.NoTitleBar.Fullscreen" />\n    ')
    assert "</application>" in m
    m = m.replace("</application>", act + "</application>", 1)
    mp.write_text(m, encoding="utf-8")

# gradle: مكتبات Media3
gp = root / "build.gradle"
g = gp.read_text(encoding="utf-8")
if "media3-exoplayer" not in g:
    deps = ('dependencies {\n'
            '    implementation "androidx.media3:media3-exoplayer:1.5.1"\n'
            '    implementation "androidx.media3:media3-exoplayer-hls:1.5.1"\n'
            '    implementation "androidx.media3:media3-ui:1.5.1"\n')
    g, n = re.subn(r"^dependencies \{\n", deps, g, count=1, flags=re.M)
    assert n == 1, "dependencies block not found in app/build.gradle"
    gp.write_text(g, encoding="utf-8")

print("native ExoPlayer plugin patched")
