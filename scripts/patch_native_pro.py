#!/usr/bin/env python3
"""Replaces the basic ExoPlayer activity with the advanced one:
multi-screen (up to 4), channel list panel, PiP, auto-reconnect, jump-to-live on resume."""
import pathlib, sys

root = pathlib.Path("android/app")
pkg = root / "src/main/java/com/tamy/iptv"
if not (pkg / "NativePlayerActivity.java").exists():
    sys.exit("run patch_native.py first")

ACT = r'''package com.tamy.iptv;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.Editable;
import android.text.TextWatcher;
import android.util.Rational;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class NativePlayerActivity extends Activity {
    public static String[] URLS = new String[0];
    public static String[] TITLES = new String[0];

    private static final int ACCENT = Color.parseColor("#6C5CE7");
    private static final int MAX_SLOTS = 4;

    private class Slot {
        ExoPlayer p;
        PlayerView v;
        FrameLayout box;
        TextView tag;
        int idx;
        int retries = 0;
        long readySince = 0, lastRefresh = 0, bufSince = 0, pausedAt = 0;
        boolean wantPlay = true;
    }

    private final List<Slot> slots = new ArrayList<>();
    private int sel = 0;
    private boolean live = true;
    private int resizeMode = 0;
    private boolean muted = false;
    private boolean listOpen = false;
    private boolean addMode = false;

    private final Handler hd = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private LinearLayout stage;
    private LinearLayout panel;
    private ListView listView;
    private EditText search;
    private TextView panelHead;
    private FrameLayout topBar, botBar;
    private TextView titleTv, infoTv, playBtn, muteBtn;
    private DefaultHttpDataSource.Factory httpf;
    private DefaultLoadControl loadControl;
    private final List<Integer> shown = new ArrayList<>();
    private ArrayAdapter<String> adapter;
    private boolean controlsVisible = true;
    private float downY = 0, downX = 0;
    private long startedAt = 0;

    private int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density + 0.5f); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        Intent in = getIntent();
        live = in.getBooleanExtra("live", true);
        int index = in.getIntExtra("index", 0);
        int pos = in.getIntExtra("pos", 0);
        String ua = in.getStringExtra("ua");
        if (ua == null) ua = "VLC/3.0.20 LibVLC/3.0.20";
        if (URLS.length == 0) { finish(); return; }

        Map<String, String> hdrs = new HashMap<>();
        hdrs.put("Accept", "*/*");
        httpf = new DefaultHttpDataSource.Factory()
                .setUserAgent(ua)
                .setDefaultRequestProperties(hdrs)
                .setAllowCrossProtocolRedirects(true)
                .setConnectTimeoutMs(12000)
                .setReadTimeoutMs(20000);
        loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(15000, 40000, 1500, 4000)
                .build();

        buildUi();
        goImmersive();
        int start = Math.min(Math.max(index, 0), URLS.length - 1);
        addSlot(start, live ? 0 : pos);
        startedAt = SystemClock.elapsedRealtime();
        hd.postDelayed(watch, 2000);
        scheduleHide();
    }

    // ───────────── UI ─────────────
    private TextView btn(String glyph, View.OnClickListener l) {
        TextView t = new TextView(this);
        t.setText(glyph);
        t.setTextColor(Color.WHITE);
        t.setTextSize(20);
        t.setGravity(Gravity.CENTER);
        GradientDrawable g = new GradientDrawable();
        g.setColor(Color.parseColor("#88101530"));
        g.setCornerRadius(dp(22));
        t.setBackground(g);
        t.setFocusable(true);
        t.setClickable(true);
        t.setOnClickListener(l);
        t.setOnFocusChangeListener(new View.OnFocusChangeListener() {
            @Override
            public void onFocusChange(View v, boolean f) { v.setScaleX(f ? 1.15f : 1f); v.setScaleY(f ? 1.15f : 1f); }
        });
        return t;
    }

    private void addTo(FrameLayout parent, View v, int w, int h, int gravity, int mx, int my) {
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, gravity);
        lp.setMargins(mx, my, mx, my);
        parent.addView(v, lp);
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        setContentView(root);

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(body, new FrameLayout.LayoutParams(-1, -1));

        stage = new LinearLayout(this);
        stage.setOrientation(LinearLayout.VERTICAL);
        stage.setBackgroundColor(Color.BLACK);
        body.addView(stage, new LinearLayout.LayoutParams(0, -1, 1f));

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setBackgroundColor(Color.parseColor("#F00B1024"));
        panel.setVisibility(View.GONE);
        panel.setPadding(dp(8), dp(8), dp(8), dp(8));
        body.addView(panel, new LinearLayout.LayoutParams(dp(300), -1));

        panelHead = new TextView(this);
        panelHead.setTextColor(Color.WHITE);
        panelHead.setTextSize(15);
        panelHead.setPadding(dp(6), dp(4), dp(6), dp(6));
        panel.addView(panelHead, new LinearLayout.LayoutParams(-1, -2));

        search = new EditText(this);
        search.setHint("🔍 بحث عن قناة");
        search.setHintTextColor(Color.parseColor("#99FFFFFF"));
        search.setTextColor(Color.WHITE);
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_ACTION_DONE);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b2, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b2, int c) {}
            @Override public void afterTextChanged(Editable s) { refreshList(); }
        });
        panel.addView(search, new LinearLayout.LayoutParams(-1, -2));

        listView = new ListView(this);
        listView.setDividerHeight(0);
        adapter = new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, new ArrayList<String>());
        listView.setAdapter(adapter);
        listView.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            @Override
            public void onItemClick(AdapterView<?> p, View v, int position, long id) {
                if (position < 0 || position >= shown.size()) return;
                pick(shown.get(position));
            }
        });
        panel.addView(listView, new LinearLayout.LayoutParams(-1, 0, 1f));

        // top bar
        topBar = new FrameLayout(this);
        GradientDrawable tg = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM, new int[]{0xCC000000, 0x00000000});
        topBar.setBackground(tg);
        topBar.setPadding(dp(10), dp(8), dp(10), dp(24));
        addTo(root, topBar, -1, -2, Gravity.TOP, 0, 0);

        TextView close = btn("✕", new View.OnClickListener() { @Override public void onClick(View v) { finish(); } });
        addTo(topBar, close, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, 0, 0);
        TextView pip = btn("⧉", new View.OnClickListener() { @Override public void onClick(View v) { enterPip(); } });
        addTo(topBar, pip, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(56), 0);
        TextView asp = btn("⛶", new View.OnClickListener() { @Override public void onClick(View v) { cycleResize(); } });
        addTo(topBar, asp, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(112), 0);
        muteBtn = btn("🔊", new View.OnClickListener() { @Override public void onClick(View v) { muted = !muted; applyAudio(); } });
        addTo(topBar, muteBtn, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(168), 0);

        titleTv = new TextView(this);
        titleTv.setTextColor(Color.WHITE);
        titleTv.setTextSize(17);
        titleTv.setShadowLayer(6, 0, 0, Color.BLACK);
        titleTv.setSingleLine(true);
        titleTv.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        FrameLayout.LayoutParams tl = new FrameLayout.LayoutParams(-2, dp(44), Gravity.RIGHT | Gravity.TOP);
        tl.setMargins(dp(230), 0, dp(4), 0);
        topBar.addView(titleTv, tl);

        // bottom bar
        botBar = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0x00000000});
        botBar.setBackground(bg);
        botBar.setPadding(dp(10), dp(24), dp(10), dp(10));
        addTo(root, botBar, -1, -2, Gravity.BOTTOM, 0, 0);

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.HORIZONTAL);
        mid.setGravity(Gravity.CENTER);
        TextView prev = btn("⏮", new View.OnClickListener() { @Override public void onClick(View v) { zap(-1); } });
        playBtn = btn("⏸", new View.OnClickListener() { @Override public void onClick(View v) { togglePlay(); } });
        TextView next = btn("⏭", new View.OnClickListener() { @Override public void onClick(View v) { zap(1); } });
        mid.addView(prev, new LinearLayout.LayoutParams(dp(52), dp(52)));
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(dp(60), dp(60));
        pl.setMargins(dp(14), 0, dp(14), 0);
        mid.addView(playBtn, pl);
        mid.addView(next, new LinearLayout.LayoutParams(dp(52), dp(52)));
        addTo(botBar, mid, -2, -2, Gravity.CENTER_HORIZONTAL | Gravity.BOTTOM, 0, 0);

        LinearLayout left = new LinearLayout(this);
        left.setOrientation(LinearLayout.HORIZONTAL);
        TextView lst = btn("☰", new View.OnClickListener() { @Override public void onClick(View v) { openList(false); } });
        TextView add = btn("＋", new View.OnClickListener() { @Override public void onClick(View v) { openList(true); } });
        TextView rem = btn("－", new View.OnClickListener() { @Override public void onClick(View v) { removeSlot(sel); } });
        left.addView(lst, new LinearLayout.LayoutParams(dp(48), dp(48)));
        LinearLayout.LayoutParams al = new LinearLayout.LayoutParams(dp(48), dp(48));
        al.setMargins(dp(8), 0, 0, 0);
        left.addView(add, al);
        left.addView(rem, al);
        addTo(botBar, left, -2, -2, Gravity.LEFT | Gravity.BOTTOM, 0, 0);

        infoTv = new TextView(this);
        infoTv.setTextColor(Color.parseColor("#FFE0E0FF"));
        infoTv.setTextSize(13);
        infoTv.setShadowLayer(6, 0, 0, Color.BLACK);
        infoTv.setGravity(Gravity.CENTER);
        infoTv.setVisibility(View.GONE);
        FrameLayout.LayoutParams il = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        root.addView(infoTv, il);
    }

    private void relayout() {
        for (Slot s : slots) { if (s.box.getParent() != null) ((ViewGroup) s.box.getParent()).removeView(s.box); }
        stage.removeAllViews();
        int n = slots.size();
        int per = n <= 1 ? 1 : 2;
        int rows = (n + per - 1) / per;
        int k = 0;
        for (int r = 0; r < rows; r++) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            stage.addView(row, new LinearLayout.LayoutParams(-1, 0, 1f));
            for (int c = 0; c < per && k < n; c++, k++) {
                Slot s = slots.get(k);
                row.addView(s.box, new LinearLayout.LayoutParams(0, -1, 1f));
            }
        }
        int pad = n > 1 ? dp(2) : 0;
        for (int i = 0; i < n; i++) {
            Slot s = slots.get(i);
            s.box.setPadding(pad, pad, pad, pad);
            s.box.setBackgroundColor(n > 1 && i == sel ? ACCENT : Color.BLACK);
            s.tag.setVisibility(n > 1 ? View.VISIBLE : View.GONE);
        }
        applyAudio();
        applyQuality();
        updateTitle();
    }

    // ───────────── slots ─────────────
    private MediaItem itemFor(int i) {
        String t = i < TITLES.length ? TITLES[i] : "";
        return new MediaItem.Builder().setUri(URLS[i])
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(t).build()).build();
    }

    private void addSlot(int idx, long pos) {
        if (slots.size() >= MAX_SLOTS) return;
        final Slot s = new Slot();
        s.idx = idx;
        DefaultMediaSourceFactory msf = new DefaultMediaSourceFactory(httpf)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(8));
        s.p = new ExoPlayer.Builder(this).setMediaSourceFactory(msf).setLoadControl(loadControl).build();
        s.v = new PlayerView(this);
        s.v.setUseController(false);
        s.v.setKeepContentOnPlayerReset(true);
        s.v.setShutterBackgroundColor(Color.TRANSPARENT);
        s.v.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        s.v.setResizeMode(modeConst());
        s.v.setPlayer(s.p);
        s.box = new FrameLayout(this);
        s.box.addView(s.v, new FrameLayout.LayoutParams(-1, -1));
        s.tag = new TextView(this);
        s.tag.setTextColor(Color.WHITE);
        s.tag.setTextSize(12);
        s.tag.setShadowLayer(5, 0, 0, Color.BLACK);
        s.tag.setPadding(dp(8), dp(4), dp(8), 0);
        s.box.addView(s.tag, new FrameLayout.LayoutParams(-2, -2, Gravity.LEFT | Gravity.BOTTOM));
        s.box.setClickable(true);
        s.box.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                int i = slots.indexOf(s);
                if (i >= 0 && i != sel) { sel = i; relayout(); showControls(); }
                else toggleControls();
            }
        });
        s.p.addListener(new Player.Listener() {
            @Override
            public void onPlaybackStateChanged(int st) {
                long now = SystemClock.elapsedRealtime();
                if (st == Player.STATE_READY) { if (s.readySince == 0) s.readySince = now; s.bufSince = 0; hideInfo(); }
                else if (st == Player.STATE_BUFFERING) { if (s.bufSince == 0) s.bufSince = now; }
                updatePlayIcon();
            }

            @Override
            public void onPlayerError(PlaybackException e) { onSlotError(s, e); }
        });
        slots.add(s);
        sel = slots.size() - 1;
        startItem(s, idx, pos);
        relayout();
    }

    private void startItem(Slot s, int idx, long pos) {
        s.idx = idx;
        s.retries = 0;
        s.readySince = 0;
        s.bufSince = 0;
        s.lastRefresh = SystemClock.elapsedRealtime();
        s.wantPlay = true;
        s.tag.setText(idx < TITLES.length ? TITLES[idx] : "");
        if (pos > 0 && !live) s.p.setMediaItem(itemFor(idx), pos); else s.p.setMediaItem(itemFor(idx));
        s.p.prepare();
        s.p.setPlayWhenReady(true);
        updateTitle();
    }

    private void removeSlot(int i) {
        if (slots.size() <= 1 || i < 0 || i >= slots.size()) return;
        Slot s = slots.remove(i);
        try { s.v.setPlayer(null); s.p.release(); } catch (Exception ignored) {}
        if (sel >= slots.size()) sel = slots.size() - 1;
        relayout();
    }

    private void refresh(Slot s) {
        if (s.p == null) return;
        s.lastRefresh = SystemClock.elapsedRealtime();
        s.bufSince = 0;
        s.readySince = 0;
        s.p.seekToDefaultPosition();
        s.p.prepare();
        s.p.setPlayWhenReady(true);
    }

    private void onSlotError(final Slot s, PlaybackException e) {
        long now = SystemClock.elapsedRealtime();
        if (s.readySince > 0 && now - s.readySince > 15000) s.retries = 0;
        s.readySince = 0;
        String why = e.getErrorCodeName();
        Throwable c = e.getCause();
        if (c instanceof HttpDataSource.InvalidResponseCodeException) {
            HttpDataSource.InvalidResponseCodeException h = (HttpDataSource.InvalidResponseCodeException) c;
            String u = String.valueOf(h.dataSpec.uri);
            int q = u.indexOf('?'); if (q > 0) u = u.substring(0, q);
            if (u.length() > 60) u = "…" + u.substring(u.length() - 60);
            why = "HTTP " + h.responseCode + "  " + u;
        }
        if (live && s.retries < 40) {
            s.retries++;
            showInfo("↻ إعادة اتصال (" + s.retries + ")\n" + why);
            hd.postDelayed(new Runnable() { @Override public void run() { if (slots.contains(s)) refresh(s); } }, 150);
        } else {
            showInfo("تعذّر تشغيل البث\n" + why);
        }
    }

    // ───────────── watchdog / lifecycle ─────────────
    private final Runnable watch = new Runnable() {
        @Override
        public void run() {
            long now = SystemClock.elapsedRealtime();
            for (Slot s : slots) {
                if (s.p == null || !live || !s.wantPlay) continue;
                int st = s.p.getPlaybackState();
                long dur = s.p.getDuration();
                long left = dur == C.TIME_UNSET ? Long.MAX_VALUE : dur - s.p.getCurrentPosition();
                if (st == Player.STATE_READY && left < 15000 && now - s.lastRefresh > 20000) refresh(s);
                else if (st == Player.STATE_BUFFERING && s.bufSince > 0 && now - s.bufSince > 12000 && now - s.lastRefresh > 8000) refresh(s);
            }
            hd.postDelayed(this, 1000);
        }
    };

    @Override
    protected void onStart() {
        super.onStart();
        if (live && SystemClock.elapsedRealtime() - startedAt > 3000) {
            for (Slot s : slots) if (s.wantPlay) refresh(s);
        }
    }

    @Override
    protected void onStop() {
        super.onStop();
        if (isInPip()) return;
        for (Slot s : slots) { if (s.p != null) { s.pausedAt = SystemClock.elapsedRealtime(); s.p.pause(); } }
    }

    @Override
    protected void onDestroy() {
        hd.removeCallbacksAndMessages(null);
        for (Slot s : slots) { try { s.v.setPlayer(null); s.p.release(); } catch (Exception ignored) {} }
        slots.clear();
        super.onDestroy();
    }

    @Override
    public void finish() {
        if (!slots.isEmpty() && sel < slots.size() && slots.get(sel).p != null) {
            Slot s = slots.get(sel);
            Intent r = new Intent();
            r.putExtra("index", s.idx);
            r.putExtra("pos", (int) Math.max(0L, s.p.getCurrentPosition()));
            long d = s.p.getDuration();
            r.putExtra("dur", d == C.TIME_UNSET ? 0 : (int) d);
            setResult(RESULT_OK, r);
        }
        super.finish();
    }

    // ───────────── actions ─────────────
    private int modeConst() {
        return resizeMode == 0 ? AspectRatioFrameLayout.RESIZE_MODE_FIT
                : resizeMode == 1 ? AspectRatioFrameLayout.RESIZE_MODE_ZOOM : AspectRatioFrameLayout.RESIZE_MODE_FILL;
    }

    private void cycleResize() {
        resizeMode = (resizeMode + 1) % 3;
        for (Slot s : slots) s.v.setResizeMode(modeConst());
        showInfo(resizeMode == 0 ? "ملائم للشاشة" : resizeMode == 1 ? "تكبير (قص)" : "ملء الشاشة (تمديد)");
        hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 1200);
    }

    private void applyAudio() {
        for (int i = 0; i < slots.size(); i++) slots.get(i).p.setVolume(i == sel && !muted ? 1f : 0f);
        if (muteBtn != null) muteBtn.setText(muted ? "🔇" : "🔊");
    }

    private void applyQuality() {
        boolean multi = slots.size() > 1;
        for (int i = 0; i < slots.size(); i++) {
            Slot s = slots.get(i);
            int w = (multi && i != sel) ? 854 : Integer.MAX_VALUE;
            int h = (multi && i != sel) ? 480 : Integer.MAX_VALUE;
            try {
                s.p.setTrackSelectionParameters(s.p.getTrackSelectionParameters().buildUpon().setMaxVideoSize(w, h).build());
            } catch (Exception ignored) {}
        }
    }

    private void togglePlay() {
        if (slots.isEmpty()) return;
        Slot s = slots.get(sel);
        long now = SystemClock.elapsedRealtime();
        if (s.p.getPlayWhenReady()) {
            s.wantPlay = false;
            s.pausedAt = now;
            s.p.pause();
        } else {
            s.wantPlay = true;
            if (live && now - s.pausedAt > 4000) refresh(s); else s.p.play();
        }
        updatePlayIcon();
        showControls();
    }

    private void updatePlayIcon() {
        if (playBtn == null || slots.isEmpty() || sel >= slots.size()) return;
        playBtn.setText(slots.get(sel).p.getPlayWhenReady() ? "⏸" : "▶");
    }

    private void zap(int d) {
        if (slots.isEmpty()) return;
        Slot s = slots.get(sel);
        int n = URLS.length;
        if (n < 2) return;
        int i = (s.idx + d + n) % n;
        startItem(s, i, 0);
        relayout();
        showControls();
    }

    private void updateTitle() {
        if (titleTv == null || slots.isEmpty() || sel >= slots.size()) return;
        int i = slots.get(sel).idx;
        titleTv.setText((URLS.length > 1 ? (i + 1) + "/" + URLS.length + "   " : "") + (i < TITLES.length ? TITLES[i] : ""));
        updatePlayIcon();
    }

    private void openList(boolean add) {
        if (listOpen && addMode == add) { closeList(); return; }
        addMode = add;
        listOpen = true;
        panel.setVisibility(View.VISIBLE);
        panelHead.setText(add ? "＋ أضف قناة في شاشة جديدة (حتى 4)" : "☰ غيّر القناة الحالية");
        search.setText("");
        refreshList();
        int cur = slots.isEmpty() ? 0 : slots.get(sel).idx;
        int at = shown.indexOf(cur);
        if (at >= 0) listView.setSelection(Math.max(0, at - 3));
        showControls();
    }

    private void closeList() {
        listOpen = false;
        panel.setVisibility(View.GONE);
        search.clearFocus();
        goImmersive();
    }

    private void refreshList() {
        String q = search.getText().toString().trim().toLowerCase();
        shown.clear();
        List<String> rows = new ArrayList<>();
        int cur = slots.isEmpty() ? -1 : slots.get(sel).idx;
        for (int i = 0; i < URLS.length; i++) {
            String t = i < TITLES.length ? TITLES[i] : "";
            if (!q.isEmpty() && !t.toLowerCase().contains(q)) continue;
            shown.add(i);
            rows.add((i == cur ? "▶ " : "") + (i + 1) + ".  " + t);
        }
        adapter.clear();
        adapter.addAll(rows);
        adapter.notifyDataSetChanged();
    }

    private void pick(int idx) {
        if (addMode) {
            if (slots.size() >= MAX_SLOTS) { showInfo("الحد الأقصى 4 شاشات"); hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 1500); return; }
            addSlot(idx, 0);
        } else if (!slots.isEmpty()) {
            startItem(slots.get(sel), idx, 0);
            relayout();
        }
        closeList();
    }

    private boolean isInPip() {
        return Build.VERSION.SDK_INT >= 24 && isInPictureInPictureMode();
    }

    private void enterPip() {
        if (Build.VERSION.SDK_INT < 26) return;
        try {
            enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational(16, 9)).build());
        } catch (Exception e) {
            showInfo("الصورة المصغّرة غير مدعومة");
        }
    }

    @Override
    protected void onUserLeaveHint() {
        super.onUserLeaveHint();
        boolean playing = !slots.isEmpty() && slots.get(sel).p != null && slots.get(sel).p.getPlayWhenReady();
        if (playing) enterPip();
    }

    @Override
    public void onPictureInPictureModeChanged(boolean in, Configuration c) {
        super.onPictureInPictureModeChanged(in, c);
        if (in) { closeList(); topBar.setVisibility(View.GONE); botBar.setVisibility(View.GONE); }
        else { showControls(); }
    }

    // ───────────── controls visibility ─────────────
    private final Runnable hideCtl = new Runnable() {
        @Override
        public void run() {
            if (listOpen) return;
            controlsVisible = false;
            topBar.setVisibility(View.GONE);
            botBar.setVisibility(View.GONE);
        }
    };

    private void scheduleHide() { hd.removeCallbacks(hideCtl); hd.postDelayed(hideCtl, 4500); }

    private void showControls() {
        controlsVisible = true;
        if (!isInPip()) { topBar.setVisibility(View.VISIBLE); botBar.setVisibility(View.VISIBLE); }
        scheduleHide();
    }

    private void toggleControls() {
        if (controlsVisible && topBar.getVisibility() == View.VISIBLE) { hd.removeCallbacks(hideCtl); hideCtl.run(); }
        else showControls();
    }

    private void showInfo(String m) { infoTv.setText(m); infoTv.setVisibility(View.VISIBLE); }
    private void hideInfo() { infoTv.setVisibility(View.GONE); }

    // ───────────── input ─────────────
    @Override
    public boolean dispatchTouchEvent(MotionEvent e) {
        if (e.getAction() == MotionEvent.ACTION_DOWN) { downX = e.getX(); downY = e.getY(); }
        else if (e.getAction() == MotionEvent.ACTION_UP && !listOpen && live) {
            float dy = e.getY() - downY, dx = e.getX() - downX;
            if (Math.abs(dy) > dp(120) && Math.abs(dy) > Math.abs(dx) * 2) { zap(dy < 0 ? 1 : -1); return true; }
        }
        return super.dispatchTouchEvent(e);
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        if (e.getAction() == KeyEvent.ACTION_DOWN && !slots.isEmpty()) {
            int k = e.getKeyCode();
            boolean hidden = topBar.getVisibility() != View.VISIBLE;
            if (k == KeyEvent.KEYCODE_CHANNEL_UP || k == KeyEvent.KEYCODE_PAGE_UP || (live && hidden && !listOpen && k == KeyEvent.KEYCODE_DPAD_UP)) { zap(-1); return true; }
            if (k == KeyEvent.KEYCODE_CHANNEL_DOWN || k == KeyEvent.KEYCODE_PAGE_DOWN || (live && hidden && !listOpen && k == KeyEvent.KEYCODE_DPAD_DOWN)) { zap(1); return true; }
            if (k == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE) { togglePlay(); return true; }
            if (hidden && !listOpen && (k == KeyEvent.KEYCODE_DPAD_CENTER || k == KeyEvent.KEYCODE_ENTER)) { showControls(); return true; }
            if (k != KeyEvent.KEYCODE_BACK) scheduleHide();
        }
        return super.dispatchKeyEvent(e);
    }

    @Override
    public void onBackPressed() {
        if (listOpen) { closeList(); return; }
        finish();
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
        if (hasFocus && !listOpen) goImmersive();
    }
}
'''
(pkg / "NativePlayerActivity.java").write_text(ACT, encoding="utf-8")

mp = root / "src/main/AndroidManifest.xml"
m = mp.read_text(encoding="utf-8")
if "supportsPictureInPicture" not in m:
    m = m.replace('android:name=".NativePlayerActivity"', 'android:name=".NativePlayerActivity"\n            android:supportsPictureInPicture="true"\n            android:resizeableActivity="true"\n            android:windowSoftInputMode="adjustResize"', 1)
    mp.write_text(m, encoding="utf-8")
print("advanced native player installed")
