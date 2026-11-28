package es.repostaycarga.app;

import android.Manifest;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    private PuenteApp puente;
    private ActivityResultLauncher<String> permissionLauncher;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Se registra antes de crear la actividad (Android lo exige)
        permissionLauncher = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (puente != null) puente.onPermissionResult(granted);
        });
        super.onCreate(savedInstanceState);
        AvisosService.createChannel(this);
        WebView wv = getBridge().getWebView();
        puente = new PuenteApp(this, wv);
        wv.addJavascriptInterface(puente, "RepostaApp");
        openFromNotification(getIntent(), false);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        openFromNotification(intent, true);
    }

    /** Al tocar un aviso: se abre su página (solo rutas de nuestra web) */
    private void openFromNotification(Intent intent, boolean now) {
        if (intent == null) return;
        String path = intent.getStringExtra("url");
        if (path == null || !path.matches("^/[A-Za-z0-9/?=&%._-]*$")) return;
        intent.removeExtra("url");
        String target = "https://" + PuenteApp.HOST + path;
        WebView wv = getBridge().getWebView();
        if (now) wv.loadUrl(target);
        else wv.postDelayed(() -> wv.loadUrl(target), 300);
    }

    boolean permissionAsked() {
        return getPreferences(MODE_PRIVATE).getBoolean("pushAsked", false);
    }

    void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) {
            puente.onPermissionResult(true);
            return;
        }
        SharedPreferences.Editor e = getPreferences(MODE_PRIVATE).edit();
        e.putBoolean("pushAsked", true).apply();
        permissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
    }
}
