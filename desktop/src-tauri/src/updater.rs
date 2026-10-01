use crate::Lifecycle;
use std::sync::Arc;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_updater::UpdaterExt;

pub(crate) fn check_once<R: tauri::Runtime>(app: tauri::AppHandle<R>, lifecycle: Arc<Lifecycle>) {
    tauri::async_runtime::spawn(async move {
        let update = match app.updater() {
            Ok(updater) => match updater.check().await {
                Ok(update) => update,
                Err(error) => {
                    eprintln!("Crewspan update check failed: {error}");
                    return;
                }
            },
            Err(error) => {
                eprintln!("Crewspan update check failed: {error}");
                return;
            }
        };

        let Some(update) = update else {
            return;
        };

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

        lifecycle.stop_for_update();
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
    });
}
