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
import android.app.AlertDialog;
import android.app.PictureInPictureParams;
import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.Editable;
import android.text.TextUtils;
import android.text.TextWatcher;
import android.util.Rational;
import android.view.Gravity;
import android.view.GestureDetector;
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
import android.widget.SeekBar;
import android.widget.TextView;

import androidx.media3.common.C;
import androidx.media3.common.Format;
import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.PlaybackParameters;
import androidx.media3.common.Player;
import androidx.media3.common.Tracks;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.datasource.DataSource;
import androidx.media3.datasource.DataSpec;
import androidx.media3.datasource.DefaultHttpDataSource;
import androidx.media3.datasource.HttpDataSource;
import androidx.media3.datasource.TransferListener;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory;
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy;
import androidx.media3.ui.AspectRatioFrameLayout;
import androidx.media3.ui.PlayerView;

import java.io.IOException;
import java.io.InterruptedIOException;
import java.net.CookieHandler;
import java.net.CookieManager;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.Semaphore;

public class NativePlayerActivity extends Activity {
    public static String[] URLS = new String[0];
    public static String[] TITLES = new String[0];
    public static String[] GROUPS = new String[0];
    private String curGroup = "";
    private TextView catBtn;

    private static final int ACCENT = Color.parseColor("#6C5CE7");
    private static final int MAX_SLOTS = 4;

    // Serializes HTTP requests: many IPTV panels answer 406 when two connections hit one line at once
    // (e.g. playlist reload during a segment download).
    private static final Semaphore LOCK = new Semaphore(1, true);
    // any playlist URL we saw -> the original entry URL that produced it (the provider redirects to short-lived edge URLs)
    private static final java.util.concurrent.ConcurrentHashMap<String, String> ROOT = new java.util.concurrent.ConcurrentHashMap<>();

    private static final java.util.ArrayList<String> LOG = new java.util.ArrayList<>();
    private static long T0 = 0;

    private static synchronized void log(String m) {
        long now = SystemClock.elapsedRealtime();
        if (T0 == 0) T0 = now;
        long t = (now - T0) / 1000;
        LOG.add(String.format("%02d:%02d %s", t / 60, t % 60, m));
        while (LOG.size() > 16) LOG.remove(0);
    }

    private static synchronized String dump() {
        StringBuilder sb = new StringBuilder();
        for (String l : LOG) sb.append(l).append('\n');
        return sb.toString();
    }

    private static String tail(String u) {
        int q = u.indexOf('?');
        String x = q > 0 ? u.substring(0, q) : u;
        String host = "";
        try { host = Uri.parse(u).getHost(); } catch (Exception ignored) {}
        if (host == null) host = "";
        int d = host.lastIndexOf('.');
        if (d > 0 && host.matches("[0-9.]+")) { int d2 = host.lastIndexOf('.', d - 1); if (d2 > 0) host = host.substring(d2 + 1); }
        return host + " …" + (x.length() > 20 ? x.substring(x.length() - 20) : x);
    }

    private static class SerialSource implements DataSource {
        private final DataSource up;
        private boolean held = false;
        SerialSource(DataSource u) { up = u; }
        @Override public void addTransferListener(TransferListener l) { up.addTransferListener(l); }
        @Override
        public long open(DataSpec ds) throws IOException {
            // continuous live TS (one long connection): never serialize it, it would hold the lock for hours
            String u0 = ds.uri.toString(); int q0 = u0.indexOf('?'); String p0 = q0 > 0 ? u0.substring(0, q0) : u0;
            if (p0.endsWith(".ts") && p0.contains("/live/")) {
                long t1 = SystemClock.elapsedRealtime();
                try { long n0 = openRetry(ds, "TS " + tail(u0)); log("TS " + tail(u0) + " ok " + (SystemClock.elapsedRealtime() - t1) + "ms"); return n0; }
                catch (IOException | RuntimeException e) { log("TS " + tail(u0) + " ERR " + code(e)); throw e; }
            }
            try { LOCK.acquire(); } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new InterruptedIOException(); }
            held = true;
            String cur = ds.uri.toString();
            boolean pl = isPlaylist(cur);
            long t0 = SystemClock.elapsedRealtime();
            String kind = (pl ? "PL " : "SEG ") + tail(cur);
            try {
                long n;
                try {
                    n = openRetry(ds, kind);
                } catch (IOException e) {
                    String root = pl ? ROOT.get(cur) : null;
                    if (root == null || root.equals(cur)) throw e;
                    // the short-lived edge URL was refused: go back through the entry URL to get a fresh one
                    log(kind + " ERR " + code(e) + " -> entry");
                    n = openRetry(ds.withUri(Uri.parse(root)), kind);
                }
                if (pl) {
                    Uri fin = up.getUri();
                    String root = ROOT.get(cur);
                    if (root == null) root = cur;
                    ROOT.put(cur, root);
                    if (fin != null) ROOT.put(fin.toString(), root);
                }
                log(kind + " ok " + (SystemClock.elapsedRealtime() - t0) + "ms");
                return n;
            } catch (IOException | RuntimeException e) { log(kind + " ERR " + code(e)); release(); throw e; }
        }
        private static final long[] BACKOFF = {400, 900};
        // provider throttling (429/509/5xx): wait and retry quietly instead of failing the whole load
        private long openRetry(DataSpec ds, String kind) throws IOException {
            int tries = 0;
            while (true) {
                try {
                    return up.open(ds);
                } catch (HttpDataSource.InvalidResponseCodeException e) {
                    int c = e.responseCode;
                    boolean soft = c == 429 || c == 509 || c == 503 || c == 502 || c == 500 || c == 504 || c == 520 || c == 521;
                    if (!soft || tries >= BACKOFF.length) throw e;
                    log(kind + " " + c + " wait " + BACKOFF[tries] + "ms");
                    // let other loads (e.g. the playlist that carries a fresh edge server) go first while we wait
                    release();
                    try { Thread.sleep(BACKOFF[tries]); LOCK.acquire(); held = true; }
                    catch (InterruptedException ie) { Thread.currentThread().interrupt(); throw new InterruptedIOException(); }
                    tries++;
                }
            }
        }
        private static boolean isPlaylist(String u) {
            int q = u.indexOf('?');
            String path = q > 0 ? u.substring(0, q) : u;
            return path.endsWith(".m3u8");
        }
        private static String code(Exception e) {
            if (e instanceof HttpDataSource.InvalidResponseCodeException) return String.valueOf(((HttpDataSource.InvalidResponseCodeException) e).responseCode);
            return e.getClass().getSimpleName();
        }
        @Override public int read(byte[] b, int o, int l) throws IOException { return up.read(b, o, l); }
        @Override public Uri getUri() { return up.getUri(); }
        @Override public Map<String, List<String>> getResponseHeaders() { return up.getResponseHeaders(); }
        @Override public void close() throws IOException { try { up.close(); } finally { release(); } }
        private synchronized void release() { if (held) { held = false; LOCK.release(); } }
    }

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
    private TextView titleTv, infoTv, playBtn, muteBtn, dbgTv;
    private boolean dbgOn = false;
    private SeekBar seek;
    private TextView curT, durT, rewBtn, fwdBtn, speedBtn;
    private LinearLayout seekRow;
    private boolean dragging = false;
    private final float[] SPEEDS = {0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f};
    private int speedIdx = 2;
    private GestureDetector gd;
    private Runnable sleepRun = null;
    private DefaultHttpDataSource.Factory httpf;
    private DataSource.Factory serial;
    private FrameLayout stageFrame;
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
        serial = new DataSource.Factory() {
            @Override public DataSource createDataSource() { return new SerialSource(httpf.createDataSource()); }
        };
        if (CookieHandler.getDefault() == null) CookieHandler.setDefault(new CookieManager());
        loadControl = new DefaultLoadControl.Builder()
                .setBufferDurationsMs(25000, 60000, 1500, 4000)
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
        root.setLayoutDirection(View.LAYOUT_DIRECTION_LTR);
        setContentView(root);

        LinearLayout body = new LinearLayout(this);
        body.setOrientation(LinearLayout.HORIZONTAL);
        root.addView(body, new FrameLayout.LayoutParams(-1, -1));

        stageFrame = new FrameLayout(this);
        body.addView(stageFrame, new LinearLayout.LayoutParams(0, -1, 1f));
        stage = new LinearLayout(this);
        stage.setOrientation(LinearLayout.VERTICAL);
        stage.setBackgroundColor(Color.BLACK);
        stageFrame.addView(stage, new FrameLayout.LayoutParams(-1, -1));

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
        search.setBackgroundColor(Color.parseColor("#26FFFFFF"));
        search.setPadding(dp(10), dp(8), dp(10), dp(8));
        search.setImeOptions(EditorInfo.IME_FLAG_NO_EXTRACT_UI | EditorInfo.IME_ACTION_DONE);
        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b2, int c) {}
            @Override public void onTextChanged(CharSequence s, int a, int b2, int c) {}
            @Override public void afterTextChanged(Editable s) { refreshList(); }
        });
        panel.addView(search, new LinearLayout.LayoutParams(-1, -2));
        catBtn = new TextView(this);
        catBtn.setText("📂 كل التصنيفات ▾");
        catBtn.setTextColor(Color.WHITE);
        catBtn.setTextSize(13);
        catBtn.setPadding(dp(10), dp(8), dp(10), dp(8));
        catBtn.setBackgroundColor(Color.parseColor("#336C5CE7"));
        catBtn.setOnClickListener(new View.OnClickListener() { @Override public void onClick(View v) { showCategories(); } });
        LinearLayout.LayoutParams cbl = new LinearLayout.LayoutParams(-1, -2);
        cbl.setMargins(0, dp(6), 0, dp(6));
        panel.addView(catBtn, cbl);

        listView = new ListView(this);
        listView.setDividerHeight(0);
        adapter = new ArrayAdapter<String>(this, android.R.layout.simple_list_item_1, new ArrayList<String>()) {
            @Override
            public View getView(int position, View convertView, ViewGroup parent) {
                TextView t = (TextView) super.getView(position, convertView, parent);
                t.setTextSize(14);
                t.setTextColor(Color.WHITE);
                t.setSingleLine(true);
                t.setEllipsize(TextUtils.TruncateAt.END);
                t.setPadding(dp(8), dp(10), dp(8), dp(10));
                return t;
            }
        };
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
        addTo(stageFrame, topBar, -1, -2, Gravity.TOP, 0, 0);

        TextView close = btn("✕", new View.OnClickListener() { @Override public void onClick(View v) { finish(); } });
        addTo(topBar, close, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, 0, 0);
        TextView pip = btn("⧉", new View.OnClickListener() { @Override public void onClick(View v) { enterPip(); } });
        addTo(topBar, pip, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(56), 0);
        TextView asp = btn("⛶", new View.OnClickListener() { @Override public void onClick(View v) { cycleResize(); } });
        addTo(topBar, asp, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(112), 0);
        muteBtn = btn("🔊", new View.OnClickListener() { @Override public void onClick(View v) { muted = !muted; applyAudio(); } });
        addTo(topBar, muteBtn, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(168), 0);

        TextView dbg = btn("🐞", new View.OnClickListener() { @Override public void onClick(View v) { dbgOn = !dbgOn; dbgTv.setVisibility(dbgOn ? View.VISIBLE : View.GONE); dbgTv.setText(dump()); } });
        addTo(topBar, dbg, dp(44), dp(44), Gravity.LEFT | Gravity.TOP, dp(224), 0);

        titleTv = new TextView(this);
        titleTv.setTextColor(Color.WHITE);
        titleTv.setTextSize(17);
        titleTv.setShadowLayer(6, 0, 0, Color.BLACK);
        titleTv.setSingleLine(true);
        titleTv.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        FrameLayout.LayoutParams tl = new FrameLayout.LayoutParams(-2, dp(44), Gravity.RIGHT | Gravity.TOP);
        tl.setMargins(dp(290), 0, dp(4), 0);
        topBar.addView(titleTv, tl);

        // bottom bar
        botBar = new FrameLayout(this);
        GradientDrawable bg = new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP, new int[]{0xCC000000, 0x00000000});
        botBar.setBackground(bg);
        botBar.setPadding(dp(10), dp(24), dp(10), dp(10));
        addTo(stageFrame, botBar, -1, -2, Gravity.BOTTOM, 0, 0);

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.HORIZONTAL);
        mid.setGravity(Gravity.CENTER);
        TextView prev = btn("⏮", new View.OnClickListener() { @Override public void onClick(View v) { zap(-1); } });
        rewBtn = btn("−10", new View.OnClickListener() { @Override public void onClick(View v) { seekBy(-10000); } });
        rewBtn.setTextSize(15);
        fwdBtn = btn("+10", new View.OnClickListener() { @Override public void onClick(View v) { seekBy(10000); } });
        fwdBtn.setTextSize(15);
        playBtn = btn("⏸", new View.OnClickListener() { @Override public void onClick(View v) { togglePlay(); } });
        TextView next = btn("⏭", new View.OnClickListener() { @Override public void onClick(View v) { zap(1); } });
        LinearLayout.LayoutParams sm = new LinearLayout.LayoutParams(dp(52), dp(52));
        sm.setMargins(dp(6), 0, dp(6), 0);
        mid.addView(prev, sm);
        mid.addView(rewBtn, sm);
        LinearLayout.LayoutParams pl = new LinearLayout.LayoutParams(dp(60), dp(60));
        pl.setMargins(dp(10), 0, dp(10), 0);
        mid.addView(playBtn, pl);
        mid.addView(fwdBtn, sm);
        mid.addView(next, sm);
        if (live) { rewBtn.setVisibility(View.GONE); fwdBtn.setVisibility(View.GONE); }
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

        LinearLayout right = new LinearLayout(this);
        right.setOrientation(LinearLayout.HORIZONTAL);
        speedBtn = btn("1x", new View.OnClickListener() { @Override public void onClick(View v) { cycleSpeed(); } });
        speedBtn.setTextSize(14);
        TextView trk = btn("⚙", new View.OnClickListener() { @Override public void onClick(View v) { showSettings(); } });
        TextView slp = btn("⏲", new View.OnClickListener() { @Override public void onClick(View v) { sleepDialog(); } });
        LinearLayout.LayoutParams rl = new LinearLayout.LayoutParams(dp(48), dp(48));
        rl.setMargins(dp(8), 0, 0, 0);
        right.addView(speedBtn, rl);
        right.addView(trk, rl);
        right.addView(slp, rl);
        addTo(botBar, right, -2, -2, Gravity.RIGHT | Gravity.BOTTOM, 0, 0);
        if (live) speedBtn.setVisibility(View.GONE);

        seekRow = new LinearLayout(this);
        seekRow.setOrientation(LinearLayout.HORIZONTAL);
        seekRow.setGravity(Gravity.CENTER_VERTICAL);
        curT = new TextView(this); curT.setTextColor(Color.WHITE); curT.setTextSize(12); curT.setText("0:00");
        durT = new TextView(this); durT.setTextColor(Color.WHITE); durT.setTextSize(12); durT.setText("--:--");
        seek = new SeekBar(this);
        seek.setMax(1000);
        try { seek.getProgressDrawable().setTint(ACCENT); seek.getThumb().setTint(Color.WHITE); } catch (Exception ignored) {}
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int prog, boolean fromUser) { if (fromUser) curT.setText(fmt(prog * 1000L)); }
            @Override public void onStartTrackingTouch(SeekBar sb) { dragging = true; hd.removeCallbacks(hideCtl); }
            @Override public void onStopTrackingTouch(SeekBar sb) {
                dragging = false;
                if (!slots.isEmpty()) slots.get(sel).p.seekTo(sb.getProgress() * 1000L);
                scheduleHide();
            }
        });
        seekRow.addView(curT, new LinearLayout.LayoutParams(-2, -2));
        seekRow.addView(seek, new LinearLayout.LayoutParams(0, -2, 1f));
        seekRow.addView(durT, new LinearLayout.LayoutParams(-2, -2));
        FrameLayout.LayoutParams sl = new FrameLayout.LayoutParams(-1, -2, Gravity.BOTTOM);
        sl.setMargins(dp(8), 0, dp(8), dp(66));
        botBar.addView(seekRow, sl);
        if (live) seekRow.setVisibility(View.GONE);

        gd = new GestureDetector(this, new GestureDetector.SimpleOnGestureListener() {
            @Override
            public boolean onDoubleTap(MotionEvent e) {
                if (live || slots.isEmpty() || listOpen) return false;
                float w = root.getWidth(), x = e.getX();
                if (x < w * 0.4f) seekBy(-10000); else if (x > w * 0.6f) seekBy(10000); else togglePlay();
                return true;
            }
        });

        infoTv = new TextView(this);
        infoTv.setTextColor(Color.parseColor("#FFE0E0FF"));
        infoTv.setTextSize(13);
        infoTv.setShadowLayer(6, 0, 0, Color.BLACK);
        infoTv.setGravity(Gravity.CENTER);
        infoTv.setVisibility(View.GONE);
        FrameLayout.LayoutParams il = new FrameLayout.LayoutParams(-2, -2, Gravity.CENTER);
        stageFrame.addView(infoTv, il);

        dbgTv = new TextView(this);
        dbgTv.setTextColor(0xFF9CFF9C);
        dbgTv.setTextSize(10);
        dbgTv.setTypeface(android.graphics.Typeface.MONOSPACE);
        dbgTv.setBackgroundColor(0xBB000000);
        dbgTv.setPadding(dp(6), dp(4), dp(6), dp(4));
        dbgTv.setVisibility(View.GONE);
        FrameLayout.LayoutParams dl = new FrameLayout.LayoutParams(-2, -2, Gravity.LEFT | Gravity.TOP);
        dl.setMargins(dp(8), dp(64), 0, 0);
        stageFrame.addView(dbgTv, dl);
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
                .setLiveConfiguration(new MediaItem.LiveConfiguration.Builder().setTargetOffsetMs(8000).setMinOffsetMs(3000).setMaxOffsetMs(40000).build())
                .setMediaMetadata(new MediaMetadata.Builder().setTitle(t).build()).build();
    }

    private void addSlot(int idx, long pos) {
        if (slots.size() >= MAX_SLOTS) return;
        final Slot s = new Slot();
        s.idx = idx;
        DefaultMediaSourceFactory msf = new DefaultMediaSourceFactory(serial)
                .setLoadErrorHandlingPolicy(new DefaultLoadErrorHandlingPolicy(1));
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
                if (st == Player.STATE_ENDED && live) {
                    hd.postDelayed(new Runnable() { @Override public void run() { if (slots.contains(s)) refresh(s); } }, 300);
                    return;
                }
                if (st == Player.STATE_ENDED && !live) {
                    if (URLS.length > 1 && slots.size() == 1 && s.idx < URLS.length - 1) zap(1); else finish();
                    return;
                }
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
                if (st == Player.STATE_BUFFERING && s.bufSince > 0 && now - s.bufSince > 8000 && now - s.lastRefresh > 6000) refresh(s);
            }
            if (dbgOn && dbgTv != null) dbgTv.setText(dump());
            tickSeek();
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
            if (!curGroup.isEmpty() && !(i < GROUPS.length && curGroup.equals(GROUPS[i]))) continue;
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

    // ───────────── VOD controls ─────────────
    private String fmt(long ms) {
        long t = Math.max(0, ms) / 1000;
        long h = t / 3600, m = (t % 3600) / 60, sc = t % 60;
        return h > 0 ? String.format(Locale.US, "%d:%02d:%02d", h, m, sc) : String.format(Locale.US, "%d:%02d", m, sc);
    }

    private void seekBy(long d) {
        if (slots.isEmpty() || live) return;
        ExoPlayer p = slots.get(sel).p;
        long dur = p.getDuration();
        long to = p.getCurrentPosition() + d;
        if (to < 0) to = 0;
        if (dur != C.TIME_UNSET && to > dur - 1000) to = Math.max(0, dur - 1000);
        p.seekTo(to);
        showInfo((d < 0 ? "⏪ " : "⏩ ") + fmt(to));
        hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 900);
        showControls();
    }

    private void tickSeek() {
        if (live || slots.isEmpty() || sel >= slots.size() || seek == null || dragging) return;
        ExoPlayer p = slots.get(sel).p;
        long dur = p.getDuration();
        if (dur == C.TIME_UNSET || dur <= 0) return;
        seek.setMax((int) (dur / 1000));
        seek.setProgress((int) (p.getCurrentPosition() / 1000));
        seek.setSecondaryProgress((int) (p.getBufferedPosition() / 1000));
        curT.setText(fmt(p.getCurrentPosition()));
        durT.setText(fmt(dur));
    }

    private void cycleSpeed() {
        if (slots.isEmpty()) return;
        speedIdx = (speedIdx + 1) % SPEEDS.length;
        float sp = SPEEDS[speedIdx];
        slots.get(sel).p.setPlaybackParameters(new PlaybackParameters(sp));
        speedBtn.setText((sp == (int) sp ? String.valueOf((int) sp) : String.valueOf(sp)) + "x");
        showControls();
    }

    private void showCategories() {
        final List<String> g = new ArrayList<>();
        for (String x : GROUPS) if (x != null && !x.isEmpty() && !g.contains(x)) g.add(x);
        if (g.isEmpty()) { showInfo("لا توجد تصنيفات"); hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 1500); return; }
        final CharSequence[] names = new CharSequence[g.size() + 1];
        names[0] = "📂 كل التصنيفات" + (curGroup.isEmpty() ? "  ✓" : "");
        for (int i = 0; i < g.size(); i++) names[i + 1] = g.get(i) + (g.get(i).equals(curGroup) ? "  ✓" : "");
        new AlertDialog.Builder(this).setTitle("التصنيفات")
                .setItems(names, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) {
                        curGroup = which == 0 ? "" : g.get(which - 1);
                        catBtn.setText("📂 " + (curGroup.isEmpty() ? "كل التصنيفات" : curGroup) + " ▾");
                        refreshList();
                    }
                }).show();
    }

    private String resName() {
        if (slots.isEmpty()) return "";
        Format f = slots.get(sel).p.getVideoFormat();
        return f == null || f.height <= 0 ? "" : f.height + "p";
    }

    // one place for everything the viewer may want to change
    private void showSettings() {
        if (slots.isEmpty()) return;
        final ExoPlayer p = slots.get(sel).p;
        final List<String> names = new ArrayList<>();
        final List<Runnable> acts = new ArrayList<>();
        names.add("🎞 جودة الفيديو" + (resName().isEmpty() ? "" : "  ·  " + resName()));
        acts.add(new Runnable() { @Override public void run() { showQuality(); } });
        names.add("🔊 المسار الصوتي");
        acts.add(new Runnable() { @Override public void run() { showTrackType(C.TRACK_TYPE_AUDIO, "المسار الصوتي"); } });
        names.add("💬 الترجمة");
        acts.add(new Runnable() { @Override public void run() { showTrackType(C.TRACK_TYPE_TEXT, "الترجمة"); } });
        names.add("⛶ نسبة العرض  ·  " + (resizeMode == 0 ? "ملائم" : resizeMode == 1 ? "تكبير" : "تمديد"));
        acts.add(new Runnable() { @Override public void run() { cycleResize(); hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 1500); } });
        if (!live) {
            names.add("⏩ سرعة التشغيل  ·  " + SPEEDS[speedIdx] + "x");
            acts.add(new Runnable() { @Override public void run() { speedDialog(); } });
        }
        names.add("ℹ معلومات البث");
        acts.add(new Runnable() { @Override public void run() { showStreamInfo(); } });
        names.add("⏲ مؤقت النوم");
        acts.add(new Runnable() { @Override public void run() { sleepDialog(); } });
        new AlertDialog.Builder(this).setTitle("إعدادات المشغّل")
                .setItems(names.toArray(new CharSequence[0]), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) { acts.get(which).run(); }
                }).show();
    }

    private void speedDialog() {
        CharSequence[] l = new CharSequence[SPEEDS.length];
        for (int i = 0; i < l.length; i++) l[i] = SPEEDS[i] + "x" + (i == speedIdx ? "  ✓" : "");
        new AlertDialog.Builder(this).setTitle("سرعة التشغيل")
                .setItems(l, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) {
                        speedIdx = which;
                        float sp = SPEEDS[which];
                        if (!slots.isEmpty()) slots.get(sel).p.setPlaybackParameters(new PlaybackParameters(sp));
                        speedBtn.setText((sp == (int) sp ? String.valueOf((int) sp) : String.valueOf(sp)) + "x");
                    }
                }).show();
    }

    private void showQuality() {
        final ExoPlayer p = slots.get(sel).p;
        final List<String> names = new ArrayList<>();
        final List<Runnable> acts = new ArrayList<>();
        names.add("تلقائي");
        acts.add(new Runnable() { @Override public void run() {
            p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().clearOverridesOfType(C.TRACK_TYPE_VIDEO).build()); } });
        for (final Tracks.Group g : p.getCurrentTracks().getGroups()) {
            if (g.getType() != C.TRACK_TYPE_VIDEO) continue;
            for (int i = 0; i < g.length; i++) {
                final int ti = i;
                Format f = g.getTrackFormat(i);
                if (f.height <= 0) continue;
                names.add(f.height + "p" + (f.bitrate > 0 ? "  ·  " + (f.bitrate / 1000) + " kbps" : "") + (g.isTrackSelected(i) ? "  ✓" : ""));
                acts.add(new Runnable() { @Override public void run() {
                    p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon()
                            .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), ti)).build()); } });
            }
        }
        String title = names.size() <= 2 ? "جودة الفيديو (البث ده بجودة واحدة فقط)" : "جودة الفيديو";
        new AlertDialog.Builder(this).setTitle(title)
                .setItems(names.toArray(new CharSequence[0]), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) { acts.get(which).run(); }
                }).show();
    }

    private void showTrackType(final int type, String title) {
        final ExoPlayer p = slots.get(sel).p;
        final List<String> names = new ArrayList<>();
        final List<Runnable> acts = new ArrayList<>();
        for (final Tracks.Group g : p.getCurrentTracks().getGroups()) {
            if (g.getType() != type) continue;
            for (int i = 0; i < g.length; i++) {
                final int ti = i;
                Format f = g.getTrackFormat(i);
                String nm = f.label != null ? f.label : (f.language != null ? f.language : "#" + (i + 1));
                names.add(nm + (g.isTrackSelected(i) ? "  ✓" : ""));
                acts.add(new Runnable() { @Override public void run() {
                    p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon()
                            .setTrackTypeDisabled(type, false)
                            .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), ti)).build()); } });
            }
        }
        if (type == C.TRACK_TYPE_TEXT) {
            names.add("إيقاف الترجمة");
            acts.add(new Runnable() { @Override public void run() {
                p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build()); } });
        }
        if (names.isEmpty()) { showInfo("لا توجد مسارات متاحة"); hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 1500); return; }
        new AlertDialog.Builder(this).setTitle(title)
                .setItems(names.toArray(new CharSequence[0]), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) { acts.get(which).run(); }
                }).show();
    }

    private void showStreamInfo() {
        ExoPlayer p = slots.get(sel).p;
        Format v = p.getVideoFormat(), a = p.getAudioFormat();
        StringBuilder sb = new StringBuilder();
        if (v != null) {
            sb.append("الفيديو: ").append(v.width).append("×").append(v.height);
            if (v.frameRate > 0) sb.append("  ").append(Math.round(v.frameRate)).append("fps");
            if (v.sampleMimeType != null) sb.append("\n").append(v.sampleMimeType.replace("video/", "")).append(v.codecs != null ? "  (" + v.codecs + ")" : "");
            if (v.bitrate > 0) sb.append("\nمعدل البيانات: ").append(v.bitrate / 1000).append(" kbps");
        } else sb.append("الفيديو: —");
        if (a != null) {
            sb.append("\n\nالصوت: ").append(a.sampleMimeType != null ? a.sampleMimeType.replace("audio/", "") : "—");
            if (a.channelCount > 0) sb.append("  ").append(a.channelCount).append("ch");
            if (a.sampleRate > 0) sb.append("  ").append(a.sampleRate / 1000).append("kHz");
        }
        sb.append("\n\nالمخزّن مسبقًا: ").append(p.getTotalBufferedDuration() / 1000).append(" ث");
        try { sb.append("\nالسيرفر: ").append(Uri.parse(URLS[slots.get(sel).idx]).getHost()); } catch (Exception ignored) {}
        new AlertDialog.Builder(this).setTitle("معلومات البث").setMessage(sb.toString()).setPositiveButton("حسناً", null).show();
    }

    private void showTracks() {
        if (slots.isEmpty()) return;
        final ExoPlayer p = slots.get(sel).p;
        final List<String> names = new ArrayList<>();
        final List<Runnable> acts = new ArrayList<>();
        Tracks tr = p.getCurrentTracks();
        for (final Tracks.Group g : tr.getGroups()) {
            if (g.getType() != C.TRACK_TYPE_AUDIO && g.getType() != C.TRACK_TYPE_TEXT) continue;
            final boolean audio = g.getType() == C.TRACK_TYPE_AUDIO;
            for (int i = 0; i < g.length; i++) {
                final int ti = i;
                Format f = g.getTrackFormat(i);
                String nm = f.label != null ? f.label : (f.language != null ? f.language : "#" + (i + 1));
                names.add((audio ? "🔊 " : "💬 ") + nm + (g.isTrackSelected(i) ? "  ✓" : ""));
                acts.add(new Runnable() {
                    @Override public void run() {
                        p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon()
                                .setTrackTypeDisabled(g.getType(), false)
                                .setOverrideForType(new TrackSelectionOverride(g.getMediaTrackGroup(), ti)).build());
                    }
                });
            }
        }
        names.add("💬 إيقاف الترجمة");
        acts.add(new Runnable() {
            @Override public void run() {
                p.setTrackSelectionParameters(p.getTrackSelectionParameters().buildUpon().setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true).build());
            }
        });
        new AlertDialog.Builder(this).setTitle("الصوت والترجمة")
                .setItems(names.toArray(new CharSequence[0]), new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) { acts.get(which).run(); }
                }).show();
    }

    private void sleepDialog() {
        final int[] mins = {0, 15, 30, 45, 60, 90};
        CharSequence[] labels = {"إيقاف المؤقت", "15 دقيقة", "30 دقيقة", "45 دقيقة", "ساعة", "ساعة ونصف"};
        new AlertDialog.Builder(this).setTitle("⏲ مؤقت النوم")
                .setItems(labels, new android.content.DialogInterface.OnClickListener() {
                    @Override public void onClick(android.content.DialogInterface d, int which) {
                        if (sleepRun != null) { hd.removeCallbacks(sleepRun); sleepRun = null; }
                        if (mins[which] > 0) {
                            sleepRun = new Runnable() { @Override public void run() { finish(); } };
                            hd.postDelayed(sleepRun, mins[which] * 60000L);
                            showInfo("⏲ سيُغلق البث بعد " + mins[which] + " دقيقة");
                            hd.postDelayed(new Runnable() { @Override public void run() { hideInfo(); } }, 2000);
                        } else showInfo("تم إيقاف المؤقت");
                    }
                }).show();
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
        if (gd != null) gd.onTouchEvent(e);
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
