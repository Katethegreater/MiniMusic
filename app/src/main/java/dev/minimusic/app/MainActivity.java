package dev.minimusic.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final String STUDIO_HOST = "appassets.androidplatform.net";
    private WebView studio;

    @Override
    @SuppressLint("SetJavaScriptEnabled") // The studio executes scripts from bundled assets only.
    public void onCreate(Bundle state) {
        super.onCreate(state);
        studio = new WebView(this);
        studio.setBackgroundColor(Color.rgb(247, 245, 238));
        studio.getSettings().setJavaScriptEnabled(true);
        studio.getSettings().setDomStorageEnabled(true);
        studio.getSettings().setAllowContentAccess(false);
        studio.getSettings().setAllowFileAccess(false);
        studio.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return openStudioAsset(request.getUrl());
            }
        });
        if (Build.VERSION.SDK_INT >= 26) {
            getWindow().setNavigationBarColor(Color.rgb(247, 245, 238));
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
        }
        if (Build.VERSION.SDK_INT >= 35) {
            studio.setOnApplyWindowInsetsListener((view, insets) -> {
                android.graphics.Insets safe = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                int bottom = Math.max(safe.bottom, insets.getInsets(WindowInsets.Type.ime()).bottom);
                view.setPadding(safe.left, safe.top, safe.right, bottom);
                return WindowInsets.CONSUMED;
            });
        }
        setContentView(studio);
        studio.loadUrl("https://" + STUDIO_HOST + "/index.html");
    }

    private WebResourceResponse openStudioAsset(Uri uri) {
        if ("https".equals(uri.getScheme()) && STUDIO_HOST.equals(uri.getHost())) {
            String file = uri.getLastPathSegment();
            if (file != null && uri.getPath().equals("/" + file)) {
                String contentType;
                switch (file) {
                    case "index.html": contentType = "text/html"; break;
                    case "studio.css": contentType = "text/css"; break;
                    case "studio.js": contentType = "text/javascript"; break;
                    default: contentType = null;
                }
                if (contentType != null) {
                    try {
                        return new WebResourceResponse(contentType, "UTF-8", getAssets().open(file));
                    } catch (IOException exception) {
                        android.util.Log.e("MiniMusic", "Missing studio asset " + file, exception);
                    }
                }
            }
        }
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                java.util.Collections.emptyMap(), null);
    }

    @Override
    protected void onPause() {
        studio.evaluateJavascript("window.stopSong?.()", null);
        studio.onPause();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        studio.onResume();
    }

    @Override
    protected void onDestroy() {
        studio.destroy();
        super.onDestroy();
    }
}
