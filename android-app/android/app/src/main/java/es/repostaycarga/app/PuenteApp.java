package es.repostaycarga.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.google.firebase.messaging.FirebaseMessaging;
import org.json.JSONObject;

/**
 * Lo poco que la web necesita de Android, como objeto "RepostaApp" en JavaScript:
 * permiso y código de avisos (Firebase) y el menú de compartir.
 * Solo responde si la página que lo pide es de repostaycarga.es.
 * Las respuestas vuelven a la web llamando a window.__repostaApp(id, json).
 */
public class PuenteApp {

    static final String HOST = "www.repostaycarga.es";

    private final MainActivity activity;
    private final WebView webView;
    private String pendingPermissionId = null;

    PuenteApp(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
    }

    /** ¿La página abierta es la nuestra? (se mira en el hilo principal) */
    private void onOwnPage(Runnable action) {
        activity.runOnUiThread(() -> {
            String url = webView.getUrl();
            Uri u = url == null ? null : Uri.parse(url);
            if (u != null && "https".equals(u.getScheme()) && HOST.equals(u.getHost())) action.run();
        });
    }

    private void reply(String id, JSONObject body) {
        String js = "window.__repostaApp && window.__repostaApp(" + JSONObject.quote(id) + "," + body.toString() + ")";
        activity.runOnUiThread(() -> webView.evaluateJavascript(js, null));
    }

    private static JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
        } catch (Exception ignored) {}
        return o;
    }

    private boolean hasPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return ContextCompat.checkSelfPermission(activity, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return NotificationManagerCompat.from(activity).areNotificationsEnabled();
    }

    /** "granted", "denied" o "prompt" (aún no se ha preguntado) */
    @JavascriptInterface
    public String pushPermission() {
        if (hasPermission()) return "granted";
        if (Build.VERSION.SDK_INT >= 33 && !activity.permissionAsked()) return "prompt";
        return "denied";
    }

    /** Pide permiso (si ask y hace falta) y devuelve el código de avisos de Firebase */
    @JavascriptInterface
    public void pushToken(String id, boolean ask) {
        onOwnPage(() -> {
            if (hasPermission()) {
                fetchToken(id);
            } else if (ask && Build.VERSION.SDK_INT >= 33) {
                pendingPermissionId = id;
                activity.askNotificationPermission();
            } else {
                reply(id, obj("ok", false, "denied", true));
            }
        });
    }

    /** Lo llama la actividad cuando el usuario contesta al permiso */
    void onPermissionResult(boolean granted) {
        String id = pendingPermissionId;
        pendingPermissionId = null;
        if (id == null) return;
        if (granted) fetchToken(id);
        else reply(id, obj("ok", false, "denied", true));
    }

    private void fetchToken(String id) {
        AvisosService.createChannel(activity);
        FirebaseMessaging.getInstance()
            .getToken()
            .addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) reply(id, obj("ok", true, "token", task.getResult()));
                else {
                    Exception e = task.getException();
                    reply(id, obj("ok", false, "error", e == null ? "sin código" : String.valueOf(e.getMessage())));
                }
            });
    }

    /** Al desactivar los avisos: Firebase olvida el código de este móvil */
    @JavascriptInterface
    public void pushUnregister() {
        onOwnPage(() -> FirebaseMessaging.getInstance().deleteToken());
    }

    /** Menú de compartir de Android */
    @JavascriptInterface
    public void share(String title, String text, String url) {
        onOwnPage(() -> {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_SUBJECT, title == null ? "" : title);
            String body = (text == null || text.isEmpty() ? "" : text + " ") + (url == null ? "" : url);
            send.putExtra(Intent.EXTRA_TEXT, body.trim());
            activity.startActivity(Intent.createChooser(send, "Compartir"));
        });
    }

    /** Versión de la app (para el formulario de opinión) */
    @JavascriptInterface
    public String version() {
        try {
            return activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "";
        }
    }
}
