package es.repostaycarga.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * Recibe los avisos de precio de Firebase. Con la app cerrada o en segundo plano los enseña Android solo;
 * con la app abierta llegan aquí y se enseñan igual, para que no se pierda ninguno.
 * Al tocar el aviso se abre la página que trae (data "url").
 */
public class AvisosService extends FirebaseMessagingService {

    static final String CHANNEL = "alertas";

    static void createChannel(Context ctx) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL, "Alertas de precio", NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription("Cuando baja el precio de tus alertas o de tus favoritas");
        nm.createNotificationChannel(ch);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage msg) {
        RemoteMessage.Notification n = msg.getNotification();
        String title = n != null && n.getTitle() != null ? n.getTitle() : msg.getData().get("title");
        String body = n != null && n.getBody() != null ? n.getBody() : msg.getData().get("body");
        if (title == null) return;
        String url = msg.getData().get("url");
        String tag = msg.getData().get("tag");
        createChannel(this);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (url != null) open.putExtra("url", url);
        PendingIntent pi = PendingIntent.getActivity(this, (tag == null ? title : tag).hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification_icon)
            .setColor(0xFF0B7A43)
            .setContentTitle(title)
            .setContentText(body == null ? "" : body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body == null ? "" : body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pi);
        try {
            NotificationManagerCompat.from(this).notify(tag == null ? "aviso" : tag, 1, b.build());
        } catch (SecurityException ignored) {
            // sin permiso de notificaciones: no se enseña
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        // La web pide el código al abrirse y lo actualiza en el servidor si ha cambiado
    }
}
