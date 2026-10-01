use crate::Lifecycle;
use std::sync::Arc;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub(crate) fn start_periodic_checks<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    lifecycle: Arc<Lifecycle>,
) {
    tauri::async_runtime::spawn(async move {
        loop {
            if lifecycle.is_quitting() {
                return;
            }
            check_once(app.clone(), Arc::clone(&lifecycle)).await;
            if lifecycle.is_quitting() {
                return;
            }
            tokio::time::sleep(std::time::Duration::from_secs(24 * 60 * 60)).await;
        }
    });
}

async fn check_once<R: tauri::Runtime>(app: tauri::AppHandle<R>, lifecycle: Arc<Lifecycle>) {
    if lifecycle.is_quitting() {
        return;
    }
    let update = match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(update) => update,
            Err(error) => {
                if lifecycle.is_quitting() {
                    return;
                }
                eprintln!("Crewspan update check failed: {error}");
                return;
            }
        },
        Err(error) => {
            if lifecycle.is_quitting() {
                return;
            }
            eprintln!("Crewspan update check failed: {error}");
            return;
        }
    };

    let Some(update) = update else {
        return;
    };
    if lifecycle.is_quitting() {
        return;
    }

    let install = app
        .dialog()
        .message(format!(
            "Crewspan {} is available. Install now? The app will restart.",
            update.version
        ))
        .title("Crewspan update available")
        .kind(MessageDialogKind::Info)
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install".into(),
            "Later".into(),
        ))
        .blocking_show();

    if !install {
        return;
    }

    if !lifecycle.stop_for_update() {
        return;
    }
    match update.download_and_install(|_, _| {}, || {}).await {
        Ok(()) => app.restart(),
        Err(error) => {
            eprintln!("Crewspan update installation failed: {error}");
            app.dialog()
                    .message(format!(
                        "Crewspan could not install the update. Restart the app to continue.\n\n{error}"
                    ))
                    .title("Crewspan update failed")
                    .kind(MessageDialogKind::Error)
                    .buttons(MessageDialogButtons::Ok)
                    .blocking_show();
            app.restart();
        }
    }
}
