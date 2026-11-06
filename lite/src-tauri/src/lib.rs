//! INIMD Lite — الخلفية الأصلية (Tauri + WebView2).
//!
//! تُنفّذ هذه الوحدة نفس واجهة `window.api` التي يستخدمها كود الواجهة المشترك
//! مع نسخة Electron، لكن عبر أوامر Rust خفيفة بدل Electron/Node.

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};

const VERSION: &str = env!("CARGO_PKG_VERSION");

/* ------------------------------------------------------------------ */
/* الأنواع المشتركة مع الواجهة                                        */
/* ------------------------------------------------------------------ */

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OpenedFile {
    pub path: String,
    pub name: String,
    pub content: String,
    pub mtime_ms: f64,
    pub dir: String,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RecentFile {
    pub path: String,
    pub name: String,
    pub opened_at: f64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub mtime_ms: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub canceled: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl ExportResult {
    fn ok(path: String) -> Self {
        Self { ok: true, canceled: None, path: Some(path), error: None }
    }
    fn canceled() -> Self {
        Self { ok: false, canceled: Some(true), path: None, error: None }
    }
    fn error(message: impl Into<String>) -> Self {
        Self { ok: false, canceled: None, path: None, error: Some(message.into()) }
    }
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: String,
    pub theme: String,
    pub font_family: String,
    pub font_size: f64,
    pub line_height: f64,
    pub autosave: bool,
    pub default_direction: String,
    pub page_size: String,
    pub margin: f64,
    pub page_numbers: bool,
    pub show_toc: bool,
    pub editor_width: f64,
    pub spellcheck: bool,
    pub auto_update: bool,
    pub update_token: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "ar".into(),
            theme: "light".into(),
            font_family: "Segoe UI".into(),
            font_size: 16.0,
            line_height: 1.9,
            autosave: false,
            default_direction: "auto".into(),
            page_size: "A4".into(),
            margin: 20.0,
            page_numbers: true,
            show_toc: true,
            editor_width: 50.0,
            spellcheck: true,
            auto_update: true,
            update_token: String::new(),
        }
    }
}

#[derive(Deserialize, Clone)]
#[serde(rename_all = "camelCase", default)]
pub struct ExportPdfPayload {
    pub html: String,
    pub default_name: String,
    pub page_size: String,
    pub page_numbers: bool,
    pub margin: f64,
    pub suggested_dir: Option<String>,
    pub language: Option<String>,
}

impl Default for ExportPdfPayload {
    fn default() -> Self {
        Self {
            html: String::new(),
            default_name: "document".into(),
            page_size: "A4".into(),
            page_numbers: true,
            margin: 20.0,
            suggested_dir: None,
            language: None,
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    pub mtime_ms: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatResult {
    pub mtime_ms: f64,
    pub exists: bool,
}

/* ------------------------------------------------------------------ */
/* حالة التطبيق                                                       */
/* ------------------------------------------------------------------ */

pub struct AppState {
    allow_close: AtomicBool,
    close_requested: AtomicBool,
    watchers: Mutex<HashMap<String, Arc<AtomicBool>>>,
    last_dir: Mutex<Option<PathBuf>>,
    pending_open: Mutex<Option<OpenedFile>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            allow_close: AtomicBool::new(false),
            close_requested: AtomicBool::new(false),
            watchers: Mutex::new(HashMap::new()),
            last_dir: Mutex::new(None),
            pending_open: Mutex::new(None),
        }
    }
}

/* ------------------------------------------------------------------ */
/* أدوات مساعدة                                                       */
/* ------------------------------------------------------------------ */

fn config_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("inimd-lite"))
}

fn settings_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("settings.json")
}

fn recent_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join("recent.json")
}

fn clamp_number(value: f64, min: f64, max: f64, fallback: f64) -> f64 {
    if !value.is_finite() || value == 0.0 {
        fallback
    } else {
        value.clamp(min, max)
    }
}

fn normalize(mut settings: Settings) -> Settings {
    settings.font_size = clamp_number(settings.font_size, 11.0, 28.0, 16.0);
    settings.line_height = clamp_number(settings.line_height, 1.3, 2.6, 1.9);
    settings.margin = clamp_number(settings.margin, 5.0, 40.0, 20.0);
    settings.editor_width = clamp_number(settings.editor_width, 20.0, 80.0, 50.0);
    if settings.language != "ar" && settings.language != "en" {
        settings.language = "ar".into();
    }
    if !matches!(settings.theme.as_str(), "light" | "dark" | "system") {
        settings.theme = "light".into();
    }
    if !matches!(settings.page_size.as_str(), "A4" | "Letter") {
        settings.page_size = "A4".into();
    }
    if !matches!(settings.default_direction.as_str(), "auto" | "rtl" | "ltr") {
        settings.default_direction = "auto".into();
    }
    settings
}

fn load_settings(app: &AppHandle) -> Settings {
    match fs::read_to_string(settings_path(app)) {
        Ok(raw) => match serde_json::from_str::<Settings>(&raw) {
            Ok(parsed) => normalize(parsed),
            Err(_) => Settings::default(),
        },
        Err(_) => Settings::default(),
    }
}

fn write_settings(app: &AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn mtime_of(path: &Path) -> Option<f64> {
    let meta = fs::metadata(path).ok()?;
    let modified = meta.modified().ok()?;
    let since = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(since.as_secs_f64() * 1000.0)
}

fn decode_buffer(bytes: &[u8]) -> String {
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    if bytes.len() >= 2 && bytes[0] == 0xFE && bytes[1] == 0xFF {
        let units: Vec<u16> = bytes[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect();
        return String::from_utf16_lossy(&units);
    }
    let text = String::from_utf8_lossy(bytes).into_owned();
    match text.strip_prefix('\u{feff}') {
        Some(stripped) => stripped.to_string(),
        None => text,
    }
}

fn read_document(path: &str) -> Result<OpenedFile, String> {
    let file_path = Path::new(path);
    let meta = fs::metadata(file_path).map_err(|e| e.to_string())?;
    if meta.is_dir() {
        return Err("لا يمكن فتح مجلد — اختر ملف Markdown.".into());
    }
    let bytes = fs::read(file_path).map_err(|e| e.to_string())?;
    let name = file_path
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let dir = file_path
        .parent()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_default();
    Ok(OpenedFile {
        path: path.to_string(),
        name,
        content: decode_buffer(&bytes),
        mtime_ms: mtime_of(file_path).unwrap_or(0.0),
        dir,
    })
}

fn is_markdown(path: &Path) -> bool {
    match path.extension() {
        Some(ext) => matches!(
            ext.to_string_lossy().to_lowercase().as_str(),
            "md" | "markdown" | "mdown" | "mkd" | "mdx"
        ),
        None => false,
    }
}

fn markdown_arg(args: &[String]) -> Option<String> {
    args.iter()
        .skip(1)
        .filter(|arg| !arg.is_empty() && !arg.starts_with('-'))
        .map(|arg| arg.trim_matches('"').to_string())
        .find(|arg| is_markdown(Path::new(arg)))
}

fn read_recent(app: &AppHandle) -> Vec<RecentFile> {
    let raw = match fs::read_to_string(recent_path(app)) {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };
    let list: Vec<RecentFile> = serde_json::from_str(&raw).unwrap_or_default();
    list.into_iter().filter(|item| Path::new(&item.path).is_file()).collect()
}

fn write_recent(app: &AppHandle, list: &[RecentFile]) -> Result<(), String> {
    let path = recent_path(app);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let trimmed: Vec<&RecentFile> = list.iter().take(20).collect();
    let json = serde_json::to_string_pretty(&trimmed).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

fn add_recent_internal(app: &AppHandle, path: &str) -> Vec<RecentFile> {
    let mut list = read_recent(app);
    let name = Path::new(path)
        .file_name()
        .map(|value| value.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs_f64() * 1000.0)
        .unwrap_or(0.0);
    list.retain(|item| item.path.to_lowercase() != path.to_lowercase());
    list.insert(0, RecentFile { path: path.to_string(), name, opened_at: now });
    let _ = write_recent(app, &list);
    read_recent(app)
}

fn last_directory(app: &AppHandle, state: &AppState) -> Option<PathBuf> {
    if let Some(dir) = state.last_dir.lock().ok().and_then(|value| value.clone()) {
        if dir.is_dir() {
            return Some(dir);
        }
    }
    app.path().document_dir().ok()
}

fn remember_directory(state: &AppState, path: &Path) {
    if let Some(parent) = path.parent() {
        if let Ok(mut guard) = state.last_dir.lock() {
            *guard = Some(parent.to_path_buf());
        }
    }
}

/* ------------------------------------------------------------------ */
/* الأوامر                                                            */
/* ------------------------------------------------------------------ */

#[tauri::command]
fn open_file_dialog(app: AppHandle, state: State<'_, AppState>) -> Result<Option<OpenedFile>, String> {
    let mut dialog = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mdx"])
        .add_filter("كل الملفات", &["*"]);
    if let Some(dir) = last_directory(&app, &state) {
        dialog = dialog.set_directory(dir);
    }
    let picked = dialog.pick_file();
    match picked {
        Some(path) => {
            let text = path.to_string_lossy().to_string();
            remember_directory(&state, &path);
            let file = read_document(&text)?;
            add_recent_internal(&app, &text);
            Ok(Some(file))
        }
        None => Ok(None),
    }
}

#[tauri::command]
fn open_path(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<OpenedFile, String> {
    let file = read_document(&path)?;
    add_recent_internal(&app, &path);
    remember_directory(&state, Path::new(&path));
    Ok(file)
}

#[tauri::command]
fn read_doc(path: String) -> Result<OpenedFile, String> {
    read_document(&path)
}

#[tauri::command]
fn read_bytes(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<StatResult, String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| e.to_string())?;
    Ok(StatResult {
        mtime_ms: mtime_of(Path::new(&path)).unwrap_or(0.0),
        exists: true,
    })
}

#[tauri::command]
fn save_file_as(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_name: String,
    content: String,
) -> Result<Option<SaveResult>, String> {
    let mut dialog = rfd::FileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter("Markdown", &["md", "markdown", "mdown", "mkd", "mdx"]);
    if let Some(dir) = last_directory(&app, &state) {
        dialog = dialog.set_directory(dir);
    }
    let Some(target) = dialog.save_file() else {
        return Ok(None);
    };
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, content).map_err(|e| e.to_string())?;
    remember_directory(&state, &target);
    let path = target.to_string_lossy().to_string();
    add_recent_internal(&app, &path);
    Ok(Some(SaveResult {
        mtime_ms: mtime_of(&target).unwrap_or(0.0),
        path,
    }))
}

#[tauri::command]
fn stat_file(path: String) -> StatResult {
    match fs::metadata(&path) {
        Ok(meta) => StatResult {
            mtime_ms: mtime_of(Path::new(&path)).unwrap_or(0.0),
            exists: meta.is_file(),
        },
        Err(_) => StatResult { mtime_ms: 0.0, exists: false },
    }
}

#[tauri::command]
fn pick_save_path(
    app: AppHandle,
    state: State<'_, AppState>,
    suggested_name: String,
    extension: String,
) -> Result<Option<String>, String> {
    if let Ok(forced) = std::env::var("INIMD_SAVE_OUT") {
        if !forced.trim().is_empty() {
            return Ok(Some(forced));
        }
    }
    let mut dialog = rfd::FileDialog::new()
        .set_file_name(&suggested_name)
        .add_filter(extension.to_uppercase(), &[extension.as_str()]);
    if let Some(dir) = last_directory(&app, &state) {
        dialog = dialog.set_directory(dir);
    }
    let picked = dialog.save_file();
    if let Some(path) = &picked {
        remember_directory(&state, path);
    }
    Ok(picked.map(|path| path.to_string_lossy().to_string()))
}

#[tauri::command]
fn write_bytes(path: String, bytes: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_settings(app: AppHandle) -> Settings {
    load_settings(&app)
}

#[tauri::command]
fn set_settings(app: AppHandle, settings: Settings) -> Result<(), String> {
    let previous = load_settings(&app);
    let next = normalize(settings);
    write_settings(&app, &next)?;
    if next.language != previous.language {
        let handle = app.clone();
        let language = next.language.clone();
        let _ = app.run_on_main_thread(move || {
            let _ = build_menu(&handle, &language);
        });
    }
    Ok(())
}

#[tauri::command]
fn get_recent(app: AppHandle) -> Vec<RecentFile> {
    read_recent(&app)
}

#[tauri::command]
fn add_recent(app: AppHandle, path: String) -> Vec<RecentFile> {
    add_recent_internal(&app, &path)
}

#[tauri::command]
fn clear_recent(app: AppHandle) -> Result<(), String> {
    write_recent(&app, &[])
}

#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let lower = url.to_lowercase();
    if !(lower.starts_with("https://") || lower.starts_with("http://") || lower.starts_with("mailto:")) {
        return Err("رابط غير مسموح".into());
    }
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_with_system(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn show_in_folder(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        Command::new("explorer")
            .raw_arg(format!("/select,\"{}\"", path))
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
    #[cfg(not(windows))]
    {
        let _ = path;
        Err("غير مدعوم".into())
    }
}

#[tauri::command]
fn get_version() -> String {
    VERSION.to_string()
}

#[tauri::command]
fn watch_file(app: AppHandle, state: State<'_, AppState>, path: String) {
    let key = path.to_lowercase();
    let mut watchers = match state.watchers.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    if watchers.contains_key(&key) {
        return;
    }
    let flag = Arc::new(AtomicBool::new(true));
    watchers.insert(key, flag.clone());
    drop(watchers);

    let handle = app.clone();
    thread::spawn(move || {
        let target = PathBuf::from(&path);
        let mut last = mtime_of(&target);
        while flag.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(450));
            if !flag.load(Ordering::Relaxed) {
                break;
            }
            let current = mtime_of(&target);
            if current.is_some() && current != last {
                last = current;
                let _ = handle.emit(
                    "file-changed",
                    FileChange {
                        path: path.clone(),
                        mtime_ms: current.unwrap_or(0.0),
                    },
                );
            }
        }
    });
}

#[tauri::command]
fn unwatch_file(state: State<'_, AppState>, path: String) {
    if let Ok(mut watchers) = state.watchers.lock() {
        if let Some(flag) = watchers.remove(&path.to_lowercase()) {
            flag.store(false, Ordering::Relaxed);
        }
    }
}

#[tauri::command]
fn confirm_close(app: AppHandle, state: State<'_, AppState>, allow: bool) {
    if allow {
        state.allow_close.store(true, Ordering::SeqCst);
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.close();
        }
    } else {
        state.close_requested.store(false, Ordering::SeqCst);
    }
}

#[tauri::command]
fn take_startup_file(state: State<'_, AppState>) -> Option<OpenedFile> {
    state.pending_open.lock().ok().and_then(|mut guard| guard.take())
}

#[tauri::command]
fn export_pdf(app: AppHandle, state: State<'_, AppState>, payload: ExportPdfPayload) -> ExportResult {
    let language = payload.language.clone().unwrap_or_else(|| load_settings(&app).language);

    let target: PathBuf = match std::env::var("INIMD_PDF_OUT") {
        Ok(value) if !value.trim().is_empty() => PathBuf::from(value),
        _ => {
            let default_name = format!("{}.pdf", payload.default_name);
            let mut dialog = rfd::FileDialog::new()
                .set_file_name(&default_name)
                .add_filter("PDF", &["pdf"]);
            let dir = payload
                .suggested_dir
                .clone()
                .filter(|value| !value.trim().is_empty())
                .map(PathBuf::from)
                .or_else(|| last_directory(&app, &state));
            if let Some(dir) = dir {
                dialog = dialog.set_directory(dir);
            }
            match dialog.save_file() {
                Some(path) => path,
                None => return ExportResult::canceled(),
            }
        }
    };

    remember_directory(&state, &target);

    let browser = match find_browser() {
        Some(path) => path,
        None => {
            return ExportResult::error(if language == "ar" {
                "تعذّر العثور على Microsoft Edge أو Google Chrome لتصدير PDF."
            } else {
                "Microsoft Edge or Google Chrome was not found for PDF export."
            })
        }
    };

    if let Some(parent) = target.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0);
    let work_dir = std::env::temp_dir().join(format!("inimd-lite-pdf-{}-{}", std::process::id(), stamp));
    if fs::create_dir_all(&work_dir).is_err() {
        return ExportResult::error("تعذّر إنشاء مجلد مؤقت لتصدير PDF.");
    }

    let html_path = work_dir.join("document.html");
    if let Err(error) = fs::write(&html_path, payload.html.as_bytes()) {
        let _ = fs::remove_dir_all(&work_dir);
        return ExportResult::error(error.to_string());
    }
    if let Ok(value) = std::env::var("INIMD_HTML_OUT") {
        if !value.trim().is_empty() {
            let _ = fs::write(value, payload.html.as_bytes());
        }
    }

    let profile_dir = work_dir.join("profile");
    let mut command = Command::new(&browser);
    command
        .arg("--headless=new")
        .arg("--disable-gpu")
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("--disable-extensions")
        .arg("--no-pdf-header-footer")
        .arg("--print-to-pdf-no-header")
        .arg(format!("--user-data-dir={}", profile_dir.to_string_lossy()))
        .arg(format!("--print-to-pdf={}", target.to_string_lossy()))
        .arg(file_url(&html_path))
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    // لا نريد أن تظهر نافذة كونسول عابرة أثناء تصدير PDF.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
    }

    let mut child = match command.spawn() {
        Ok(child) => child,
        Err(error) => {
            let _ = fs::remove_dir_all(&work_dir);
            return ExportResult::error(error.to_string());
        }
    };

    let started = Instant::now();
    let mut finished = false;
    while started.elapsed() < Duration::from_secs(90) {
        match child.try_wait() {
            Ok(Some(_)) => {
                finished = true;
                break;
            }
            Ok(None) => thread::sleep(Duration::from_millis(150)),
            Err(_) => break,
        }
    }
    if !finished {
        let _ = child.kill();
        let _ = child.wait();
    }

    let written = fs::metadata(&target).map(|meta| meta.len()).unwrap_or(0);
    let _ = fs::remove_dir_all(&work_dir);

    if written > 0 {
        ExportResult::ok(target.to_string_lossy().to_string())
    } else {
        ExportResult::error(if language == "ar" {
            "فشل إنشاء ملف PDF. تأكد من تثبيت Microsoft Edge."
        } else {
            "PDF generation failed. Make sure Microsoft Edge is installed."
        })
    }
}

fn find_browser() -> Option<PathBuf> {
    if let Ok(value) = std::env::var("INIMD_BROWSER") {
        let path = PathBuf::from(value);
        if path.is_file() {
            return Some(path);
        }
    }

    let mut roots: Vec<PathBuf> = Vec::new();
    for key in ["ProgramFiles(x86)", "ProgramFiles", "LOCALAPPDATA"] {
        if let Ok(value) = std::env::var(key) {
            if !value.trim().is_empty() {
                roots.push(PathBuf::from(value));
            }
        }
    }
    roots.push(PathBuf::from(r"C:\Program Files (x86)"));
    roots.push(PathBuf::from(r"C:\Program Files"));

    let relative = [
        r"Microsoft\Edge\Application\msedge.exe",
        r"Google\Chrome\Application\chrome.exe",
    ];
    for root in &roots {
        for suffix in relative {
            let candidate = root.join(suffix);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

fn file_url(path: &Path) -> String {
    let mut normalized = path.to_string_lossy().replace('\\', "/");
    if let Some(stripped) = normalized.strip_prefix("//?/") {
        normalized = stripped.to_string();
    }
    let mut encoded = String::from("file:///");
    for ch in normalized.chars() {
        match ch {
            ' ' => encoded.push_str("%20"),
            '#' => encoded.push_str("%23"),
            '?' => encoded.push_str("%3F"),
            '%' => encoded.push_str("%25"),
            other => encoded.push(other),
        }
    }
    encoded
}

/* ------------------------------------------------------------------ */
/* القائمة الأصلية                                                    */
/* ------------------------------------------------------------------ */

fn tr(lang: &str, key: &str) -> &'static str {
    let ar = lang == "ar";
    match key {
        "menu.file" => if ar { "ملف" } else { "File" },
        "menu.edit" => if ar { "تحرير" } else { "Edit" },
        "menu.view" => if ar { "عرض" } else { "View" },
        "menu.settings" => if ar { "إعدادات" } else { "Settings" },
        "menu.help" => if ar { "مساعدة" } else { "Help" },
        "menu.new" => if ar { "جديد" } else { "New" },
        "menu.open" => if ar { "فتح…" } else { "Open…" },
        "menu.save" => if ar { "حفظ" } else { "Save" },
        "menu.saveAs" => if ar { "حفظ باسم…" } else { "Save as…" },
        "menu.exportPdf" => if ar { "تصدير إلى PDF…" } else { "Export to PDF…" },
        "menu.exportWord" => if ar { "تصدير إلى Word…" } else { "Export to Word…" },
        "menu.closeTab" => if ar { "إغلاق التبويب" } else { "Close tab" },
        "menu.quit" => if ar { "خروج" } else { "Quit" },
        "menu.undo" => if ar { "تراجع" } else { "Undo" },
        "menu.redo" => if ar { "إعادة" } else { "Redo" },
        "menu.cut" => if ar { "قص" } else { "Cut" },
        "menu.copy" => if ar { "نسخ" } else { "Copy" },
        "menu.paste" => if ar { "لصق" } else { "Paste" },
        "menu.selectAll" => if ar { "تحديد الكل" } else { "Select all" },
        "menu.find" => if ar { "بحث…" } else { "Find…" },
        "menu.togglePreview" => if ar { "عرض المعاينة" } else { "Toggle preview" },
        "menu.sidebar" => if ar { "الشريط الجانبي" } else { "Sidebar" },
        "menu.fullscreen" => if ar { "ملء الشاشة" } else { "Full screen" },
        "menu.appSettings" => if ar { "الإعدادات…" } else { "Settings…" },
        "menu.checkUpdates" => if ar { "التحقق من التحديثات…" } else { "Check for updates…" },
        "menu.guide" => if ar { "دليل الاستخدام" } else { "User guide" },
        "menu.about" => if ar { "حول INIMD Lite" } else { "About INIMD Lite" },
        "menu.aboutTitle" => if ar { "حول INIMD Lite" } else { "About INIMD Lite" },
        "menu.aboutDetail" => {
            if ar {
                "محرر وعارض Markdown عربي لويندوز — النسخة الخفيفة.\nيدعم الاتجاه من اليمين إلى اليسار وتصدير PDF وWord.\n\nتطوير: INI\nالبريد: ibrahim.noshy@hotmail.com\n\nصُنع بـ Tauri وReact."
            } else {
                "A lightweight Arabic Markdown editor and viewer for Windows.\nSupports right-to-left text plus PDF and Word export.\n\nDeveloped by INI\nEmail: ibrahim.noshy@hotmail.com\n\nBuilt with Tauri and React."
            }
        }
        "menu.ok" => if ar { "حسناً" } else { "OK" },
        _ => "",
    }
}

fn build_menu(app: &AppHandle, lang: &str) -> tauri::Result<()> {
    let file = SubmenuBuilder::new(app, tr(lang, "menu.file"))
        .item(
            &MenuItemBuilder::with_id("new", tr(lang, "menu.new"))
                .accelerator("CmdOrCtrl+N")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("open", tr(lang, "menu.open"))
                .accelerator("CmdOrCtrl+O")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("save", tr(lang, "menu.save"))
                .accelerator("CmdOrCtrl+S")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("save-as", tr(lang, "menu.saveAs"))
                .accelerator("CmdOrCtrl+Shift+S")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("export-pdf", tr(lang, "menu.exportPdf"))
                .accelerator("CmdOrCtrl+Alt+P")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("export-docx", tr(lang, "menu.exportWord"))
                .accelerator("CmdOrCtrl+Alt+W")
                .build(app)?,
        )
        .separator()
        .item(
            &MenuItemBuilder::with_id("close-tab", tr(lang, "menu.closeTab"))
                .accelerator("CmdOrCtrl+W")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("quit", tr(lang, "menu.quit"))
                .accelerator("Alt+F4")
                .build(app)?,
        )
        .build()?;

    let edit = SubmenuBuilder::new(app, tr(lang, "menu.edit"))
        .item(&PredefinedMenuItem::undo(app, Some(tr(lang, "menu.undo")))?)
        .item(&PredefinedMenuItem::redo(app, Some(tr(lang, "menu.redo")))?)
        .separator()
        .item(&PredefinedMenuItem::cut(app, Some(tr(lang, "menu.cut")))?)
        .item(&PredefinedMenuItem::copy(app, Some(tr(lang, "menu.copy")))?)
        .item(&PredefinedMenuItem::paste(app, Some(tr(lang, "menu.paste")))?)
        .item(&PredefinedMenuItem::select_all(app, Some(tr(lang, "menu.selectAll")))?)
        .separator()
        .item(
            &MenuItemBuilder::with_id("find", tr(lang, "menu.find"))
                .accelerator("CmdOrCtrl+F")
                .build(app)?,
        )
        .build()?;

    let view = SubmenuBuilder::new(app, tr(lang, "menu.view"))
        .item(
            &MenuItemBuilder::with_id("toggle-preview", tr(lang, "menu.togglePreview"))
                .accelerator("CmdOrCtrl+Shift+V")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("toggle-toc", tr(lang, "menu.sidebar"))
                .accelerator("CmdOrCtrl+B")
                .build(app)?,
        )
        .separator()
        .item(&PredefinedMenuItem::fullscreen(
            app,
            Some(tr(lang, "menu.fullscreen")),
        )?)
        .build()?;

    let settings_menu = SubmenuBuilder::new(app, tr(lang, "menu.settings"))
        .item(
            &MenuItemBuilder::with_id("settings", tr(lang, "menu.appSettings"))
                .accelerator("CmdOrCtrl+Comma")
                .build(app)?,
        )
        .item(
            &MenuItemBuilder::with_id("check-updates", tr(lang, "menu.checkUpdates"))
                .build(app)?,
        )
        .build()?;

    let help = SubmenuBuilder::new(app, tr(lang, "menu.help"))
        .item(&MenuItemBuilder::with_id("guide", tr(lang, "menu.guide")).build(app)?)
        .item(&MenuItemBuilder::with_id("about", tr(lang, "menu.about")).build(app)?)
        .build()?;

    let menu = Menu::with_items(app, &[&file, &edit, &view, &settings_menu, &help])?;
    app.set_menu(menu)?;
    Ok(())
}

fn show_about(app: &AppHandle) {
    let settings = load_settings(app);
    let lang = settings.language;
    rfd::MessageDialog::new()
        .set_level(rfd::MessageLevel::Info)
        .set_title(format!("{} {}", tr(&lang, "menu.aboutTitle"), VERSION))
        .set_description(tr(&lang, "menu.aboutDetail"))
        .set_buttons(rfd::MessageButtons::Ok)
        .show();
}

/* ------------------------------------------------------------------ */
/* التشغيل                                                            */
/* ------------------------------------------------------------------ */

fn focus_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            focus_main(app);
            if let Some(path) = markdown_arg(&argv) {
                if let Ok(file) = read_document(&path) {
                    add_recent_internal(app, &path);
                    let _ = app.emit("open-file", file);
                }
            }
        }))
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_file_dialog,
            open_path,
            read_doc,
            read_bytes,
            save_file,
            save_file_as,
            stat_file,
            pick_save_path,
            write_bytes,
            get_settings,
            set_settings,
            get_recent,
            add_recent,
            clear_recent,
            open_external,
            open_with_system,
            show_in_folder,
            get_version,
            watch_file,
            unwatch_file,
            confirm_close,
            take_startup_file,
            export_pdf
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            let settings = load_settings(&handle);
            build_menu(&handle, &settings.language)?;

            let argv: Vec<String> = std::env::args().collect();
            if let Some(path) = markdown_arg(&argv) {
                if let Ok(file) = read_document(&path) {
                    add_recent_internal(&handle, &path);
                    if let Ok(mut pending) = handle.state::<AppState>().pending_open.lock() {
                        *pending = Some(file);
                    }
                }
            }

            let window = app
                .get_webview_window("main")
                .expect("main window must exist");

            let close_handle = handle.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    let state = close_handle.state::<AppState>();
                    if !state.allow_close.load(Ordering::SeqCst) {
                        api.prevent_close();
                        if !state.close_requested.swap(true, Ordering::SeqCst) {
                            let _ = close_handle.emit("before-close", ());
                        }
                    }
                }
            });

            handle.on_menu_event(move |app, event| {
                match event.id().as_ref() {
                    "about" => show_about(app),
                    "quit" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.close();
                        }
                    }
                    other => {
                        let action = other.to_string();
                        let _ = app.emit("menu", action);
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running INIMD Lite");
}
