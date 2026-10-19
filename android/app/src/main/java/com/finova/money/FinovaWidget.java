package com.finova.money;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/** ویجت دسکتاپ: موجودی + اقساط پیش‌رو (بروزرسانی از داخل اپ) */
public class FinovaWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, build(context));
    }

    static void pushAll(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, FinovaWidget.class));
        for (int id : ids) mgr.updateAppWidget(id, build(ctx));
    }

    private static RemoteViews build(Context ctx) {
        android.content.SharedPreferences p = ctx.getSharedPreferences("finova_widget", Context.MODE_PRIVATE);
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_main);
        v.setTextViewText(R.id.wBalance, p.getString("balance", "—"));
        v.setTextViewText(R.id.wL1, p.getString("l1", "اقساط پیش‌رو ندارید"));
        v.setTextViewText(R.id.wL2, p.getString("l2", ""));
        v.setTextViewText(R.id.wStamp, p.getString("stamp", ""));
        return v;
    }
}
