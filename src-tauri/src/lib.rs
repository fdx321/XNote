use serde::{Deserialize, Serialize};
use std::borrow::Cow;
use std::fs;
use std::path::{Path, PathBuf};
use chrono::{DateTime, Local};
use base64::{Engine as _, engine::general_purpose};
use std::io::Write;
use walkdir::WalkDir;
use std::collections::HashSet;
use tauri::async_runtime;
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use tauri::Manager;
use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write as _};

struct TerminalSession {
    pty_master: Box<dyn portable_pty::MasterPty + Send>,
    writer: Box<dyn std::io::Write + Send>,
}

struct TerminalState {
    sessions: Arc<Mutex<HashMap<String, TerminalSession>>>,
}

impl TerminalState {
    fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
    last_modified: Option<String>,
}

use tauri::{AppHandle, Emitter};
use tauri::menu::{Menu, Submenu, MenuItem, PredefinedMenuItem};

#[tauri::command]
fn get_default_workspace(_app: AppHandle) -> Result<String, String> {
    println!("Backend: get_default_workspace called");
    
    let root = get_xnote_root()?;
    let workspace_path = root.join("doc");
    
    println!("Backend: Target path: {:?}", workspace_path);

    if !workspace_path.exists() {
        println!("Backend: Creating directory...");
        match fs::create_dir_all(&workspace_path) {
            Ok(_) => println!("Backend: Directory created successfully"),
            Err(e) => {
                println!("Backend: Failed to create directory: {}", e);
                return Err(format!("PERMISSION_DENIED: {}", e));
            }
        }
    } else {
        println!("Backend: Directory already exists");
    }

    // Test write permission
    let test_file = workspace_path.join(".write_test");
    match fs::write(&test_file, "test") {
        Ok(_) => {
            let _ = fs::remove_file(test_file);
        },
        Err(e) => {
             println!("Backend: Write permission test failed: {}", e);
             return Err(format!("PERMISSION_DENIED: {}", e));
        }
    }
    
    Ok(workspace_path.to_string_lossy().to_string())
}

fn get_xnote_root() -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        // Dev: Use project_root/xnote_dev_data (outside of src-tauri to avoid infinite rebuild loop)
        std::env::current_dir()
            .map_err(|e| e.to_string())
            .and_then(|p| {
                p.parent()
                 .ok_or("Cannot find parent directory".to_string())
                 .map(|parent| parent.join("xnote_dev_data"))
            })
    } else {
        // Prod: Use ~/.xnote
        dirs::home_dir()
            .ok_or("Could not find home directory".to_string())
            .map(|p| p.join(".xnote"))
    }
}

#[tauri::command]
fn get_config() -> Result<String, String> {
    let root = get_xnote_root()?;
    let config_path = root.join("config.json");
    
    if config_path.exists() {
        fs::read_to_string(config_path).map_err(|e| e.to_string())
    } else {
        Ok("{}".to_string())
    }
}

#[tauri::command]
fn save_config(config: String) -> Result<(), String> {
    let root = get_xnote_root()?;
    let config_path = root.join("config.json");
    
    // Ensure parent dir exists
    if let Some(parent) = config_path.parent() {
        if !parent.exists() {
             fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
    }

    fs::write(config_path, config).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_terminal(
    app: AppHandle,
    state: tauri::State<'_, TerminalState>,
    id: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let pty_system = NativePtySystem::default();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

    let mut cmd = CommandBuilder::new("zsh");
    if let Some(path) = cwd {
        if Path::new(&path).exists() {
             cmd.cwd(path);
        }
    }
    // Set some env vars if needed
    cmd.env("TERM", "xterm-256color");

    let _child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    // Store session
    {
        let mut sessions = state.sessions.lock().unwrap();
        sessions.insert(id.clone(), TerminalSession {
             pty_master: pair.master,
             writer,
        });
    }

    let app_handle = app.clone();
    let session_id = id.clone();
    
    // Spawn reader thread
    std::thread::spawn(move || {
        let mut buffer = [0u8; 1024];
        loop {
            match reader.read(&mut buffer) {
                Ok(n) if n > 0 => {
                     let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                     let _ = app_handle.emit(&format!("terminal-output:{}", session_id), data);
                }
                Ok(_) => break, // EOF
                Err(_) => break,
            }
        }
        // Emit exit?
        let _ = app_handle.emit(&format!("terminal-exit:{}", session_id), ());
    });

    Ok(())
}

#[tauri::command]
fn write_to_terminal(
    state: tauri::State<'_, TerminalState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session.writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_terminal(
    state: tauri::State<'_, TerminalState>,
    id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session.pty_master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_terminal(
    state: tauri::State<'_, TerminalState>,
    id: String,
) -> Result<(), String> {
    let mut sessions = state.sessions.lock().unwrap();
    sessions.remove(&id);
    Ok(())
}

#[tauri::command]
fn get_files(path: String) -> Result<Vec<FileNode>, String> {
    println!("Backend: get_files called for path: {}", path);
    let root_path = Path::new(&path);
    if !root_path.exists() {
        println!("Backend: Directory does not exist: {}", path);
        return Err("Directory does not exist".to_string());
    }

    const MAX_DEPTH: usize = 3;

    fn is_valid_file(name: &str) -> bool {
        name.ends_with(".md") || name.ends_with(".uml") || name.ends_with(".puml")
    }

    fn sort_nodes(nodes: &mut Vec<FileNode>) {
        nodes.sort_by(|a, b| {
            if a.is_dir == b.is_dir {
                a.name.cmp(&b.name)
            } else {
                b.is_dir.cmp(&a.is_dir)
            }
        });
    }

    fn read_children(dir: &Path, depth: usize) -> Vec<FileNode> {
        let mut children: Vec<FileNode> = Vec::new();
        let Ok(entries) = fs::read_dir(dir) else { return children };

        for entry in entries.flatten() {
            let path_buf = entry.path();
            let is_dir = path_buf.is_dir();
            let name = entry.file_name().to_string_lossy().to_string();

            if name.starts_with(".") {
                continue;
            }
            if !is_dir && !is_valid_file(&name) {
                continue;
            }

            let mut node = FileNode {
                name: name.clone(),
                path: path_buf.to_string_lossy().to_string(),
                is_dir,
                children: None,
                last_modified: None,
            };

            if is_dir {
                if depth < MAX_DEPTH {
                    let mut grand_children = read_children(&path_buf, depth + 1);
                    sort_nodes(&mut grand_children);
                    node.children = Some(grand_children);
                } else {
                    node.children = Some(Vec::new());
                }
            } else {
                let metadata = fs::metadata(&path_buf).ok();
                let last_modified = metadata
                    .and_then(|m| m.modified().ok())
                    .map(|t| {
                        let dt: DateTime<Local> = t.into();
                        dt.format("%Y-%m-%d %H:%M").to_string()
                    });
                node.last_modified = last_modified;
            }

            children.push(node);
        }

        children
    }

    let mut nodes = read_children(root_path, 1);
    sort_nodes(&mut nodes);

    println!("Backend: Found {} nodes", nodes.len());
    Ok(nodes)
}

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(path).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_file(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_note(dir_path: String, filename: String) -> Result<String, String> {
    println!("Backend: create_note called: {}/{}", dir_path, filename);
    let mut full_path = Path::new(&dir_path).join(&filename);
    if !filename.ends_with(".md") && !filename.ends_with(".uml") && !filename.ends_with(".puml") {
        full_path = full_path.with_extension("md");
    }
    
    if full_path.exists() {
        println!("Backend: File already exists: {:?}", full_path);
        return Err("File already exists".to_string());
    }

    match fs::write(&full_path, "") {
        Ok(_) => {
            println!("Backend: File created successfully: {:?}", full_path);
            Ok(full_path.to_string_lossy().to_string())
        },
        Err(e) => {
            println!("Backend: Failed to create file: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn create_folder(parent_path: String, name: String) -> Result<String, String> {
    println!("Backend: create_folder called: {}/{}", parent_path, name);
    let full_path = Path::new(&parent_path).join(&name);
    if full_path.exists() {
        println!("Backend: Directory already exists: {:?}", full_path);
        return Err("Directory already exists".to_string());
    }
    match fs::create_dir_all(&full_path) {
        Ok(_) => {
            println!("Backend: Directory created successfully: {:?}", full_path);
            Ok(full_path.to_string_lossy().to_string())
        },
        Err(e) => {
            println!("Backend: Failed to create directory: {}", e);
            Err(e.to_string())
        }
    }
}

#[tauri::command]
fn save_image(img_data_base64: String, save_dir: String) -> Result<String, String> {
    println!("Backend: save_image called");
    let data_start = img_data_base64.find(",").map(|i| i + 1).unwrap_or(0);
    let raw_data = &img_data_base64[data_start..];
    
    let bytes = general_purpose::STANDARD
        .decode(raw_data)
        .map_err(|e| e.to_string())?;

    let filename = format!("img_{}.png", chrono::Local::now().format("%Y%m%d%H%M%S%f"));
    let path = Path::new(&save_dir).join(&filename);
    
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let mut file = fs::File::create(&path).map_err(|e| e.to_string())?;
    file.write_all(&bytes).map_err(|e| e.to_string())?;

    Ok(filename)
}

#[tauri::command]
fn read_file_base64(path: String) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| e.to_string())?;
    Ok(general_purpose::STANDARD.encode(bytes))
}

#[tauri::command]
fn set_clipboard_image(app: AppHandle, png_data_base64: String) -> Result<(), String> {
    let data_start = png_data_base64.find(",").map(|i| i + 1).unwrap_or(0);
    let raw_data = &png_data_base64[data_start..];
    let bytes = general_purpose::STANDARD
        .decode(raw_data)
        .map_err(|e| format!("base64 decode failed: {}", e))?;

    let img = image::load_from_memory(&bytes).map_err(|e| format!("image decode failed: {}", e))?;
    let rgba = img.to_rgba8();
    let (width, height) = rgba.dimensions();
    let data = rgba.into_raw();

    let (tx, rx) = mpsc::channel::<Result<(), String>>();

    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {}", e))?;
            clipboard
                .set_image(arboard::ImageData {
                    width: width as usize,
                    height: height as usize,
                    bytes: Cow::Owned(data),
                })
                .map_err(|e| format!("clipboard set_image failed: {}", e))?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| format!("run_on_main_thread failed: {}", e))?;

    rx.recv()
        .map_err(|e| format!("clipboard result receive failed: {}", e))?
}

#[tauri::command]
fn set_clipboard_image_from_svg(app: AppHandle, svg_text: String) -> Result<(), String> {
    let mut fontdb = resvg::usvg::fontdb::Database::new();
    fontdb.load_system_fonts();
    let mut opt = resvg::usvg::Options::default();
    opt.fontdb = Arc::new(fontdb);

    let tree = resvg::usvg::Tree::from_str(&svg_text, &opt)
        .map_err(|e| format!("svg parse failed: {}", e))?;

    let size = tree.size();
    let width = size.width().ceil() as u32;
    let height = size.height().ceil() as u32;
    if width == 0 || height == 0 {
        return Err("svg size is zero".to_string());
    }

    let dpr: f32 = 2.0;
    let out_width = ((width as f32) * dpr).ceil() as u32;
    let out_height = ((height as f32) * dpr).ceil() as u32;

    let mut pixmap = resvg::tiny_skia::Pixmap::new(out_width, out_height)
        .ok_or_else(|| "pixmap alloc failed".to_string())?;
    let transform = resvg::usvg::Transform::from_scale(dpr, dpr);
    let mut pixmap_mut = pixmap.as_mut();
    resvg::render(&tree, transform, &mut pixmap_mut);

    let data = pixmap.data().to_vec();

    let (tx, rx) = mpsc::channel::<Result<(), String>>();
    app.run_on_main_thread(move || {
        let result = (|| -> Result<(), String> {
            let mut clipboard =
                arboard::Clipboard::new().map_err(|e| format!("clipboard init failed: {}", e))?;
            clipboard
                .set_image(arboard::ImageData {
                    width: out_width as usize,
                    height: out_height as usize,
                    bytes: Cow::Owned(data),
                })
                .map_err(|e| format!("clipboard set_image failed: {}", e))?;
            Ok(())
        })();
        let _ = tx.send(result);
    })
    .map_err(|e| format!("run_on_main_thread failed: {}", e))?;

    rx.recv()
        .map_err(|e| format!("clipboard result receive failed: {}", e))?
}

#[derive(Serialize)]
struct SearchHit {
    path: String,
    name: String,
    line: usize,
    preview: String,
}

#[tauri::command]
fn search_text(root_path: String, query: String, limit: Option<usize>) -> Result<Vec<SearchHit>, String> {
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }

    let q_lower = q.to_lowercase();
    let max_hits = limit.unwrap_or(50).min(200);

    let mut results: Vec<SearchHit> = Vec::new();
    for entry in WalkDir::new(&root_path).into_iter().filter_map(|e| e.ok()) {
        if results.len() >= max_hits {
            break;
        }

        if entry.file_type().is_dir() {
            let name = entry.file_name().to_string_lossy();
            if name.starts_with('.') || name == ".xnote_assets" {
                continue;
            }
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if ext != "md" && ext != "txt" && ext != "uml" && ext != "puml" {
            continue;
        }

        let file_name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();

        let content = match fs::read_to_string(path) {
            Ok(c) => c,
            Err(_) => continue,
        };

        for (idx, line) in content.lines().enumerate() {
            if results.len() >= max_hits {
                break;
            }
            if line.to_lowercase().contains(&q_lower) {
                results.push(SearchHit {
                    path: path.to_string_lossy().to_string(),
                    name: file_name.clone(),
                    line: idx + 1,
                    preview: line.to_string(),
                });
            }
        }
    }

    Ok(results)
}

#[derive(Serialize, Clone)]
struct CleanProgress {
    phase: String,
    current: usize,
    total: usize,
    message: String,
}

#[derive(Serialize)]
struct UnusedImageResult {
    images: Vec<String>,
}

#[derive(Serialize, Clone)]
struct CleanResult {
    images: Vec<String>,
}

#[derive(Serialize, Clone)]
struct DeleteResult {
    deleted: usize,
    total: usize,
}

struct CleanTaskController {
    job_id: u64,
    cancel: bool,
}
static CLEAN_TASK: OnceLock<Mutex<CleanTaskController>> = OnceLock::new();

fn clean_task() -> &'static Mutex<CleanTaskController> {
    CLEAN_TASK.get_or_init(|| Mutex::new(CleanTaskController { job_id: 0, cancel: false }))
}

fn start_new_job() -> u64 {
    let mut guard = clean_task().lock().unwrap();
    guard.job_id += 1;
    guard.cancel = false;
    guard.job_id
}

fn request_cancel() -> bool {
    let mut guard = clean_task().lock().unwrap();
    if guard.job_id == 0 {
        return false;
    }
    guard.cancel = true;
    true
}

fn is_cancelled(job_id: u64) -> bool {
    let guard = clean_task().lock().unwrap();
    guard.job_id == job_id && guard.cancel
}

fn emit_clean_log(app: &AppHandle, message: &str) {
    let _ = app.emit("clean-unused-images-log", message.to_string());
}

fn emit_clean_progress(app: &AppHandle, phase: &str, current: usize, total: usize, message: String) {
    let _ = app.emit(
        "clean-unused-images-progress",
        CleanProgress {
            phase: phase.to_string(),
            current,
            total,
            message,
        },
    );
}

fn is_image_ext(ext: &str) -> bool {
    matches!(ext, "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg")
}

fn is_text_ext(ext: &str) -> bool {
    matches!(ext, "md" | "txt" | "uml" | "puml")
}

fn trim_wrapping(s: &str) -> &str {
    let mut out = s.trim();
    if (out.starts_with('<') && out.ends_with('>')) || (out.starts_with('"') && out.ends_with('"')) || (out.starts_with('\'') && out.ends_with('\'')) {
        out = &out[1..out.len().saturating_sub(1)];
    }
    out.trim()
}

fn extract_candidate_paths(content: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let bytes = content.as_bytes();

    let mut i = 0usize;
    while i + 2 < bytes.len() {
        if bytes[i] == b']' && bytes[i + 1] == b'(' {
            let start = i + 2;
            if let Some(end_rel) = content[start..].find(')') {
                let raw = &content[start..start + end_rel];
                let raw = raw.split_whitespace().next().unwrap_or(raw);
                let raw = trim_wrapping(raw);
                if !raw.is_empty() {
                    out.push(raw.to_string());
                }
                i = start + end_rel + 1;
                continue;
            }
        }
        i += 1;
    }

    let mut j = 0usize;
    let lower = content.to_lowercase();
    while let Some(pos) = lower[j..].find("src=") {
        let at = j + pos + 4;
        if at >= content.len() {
            break;
        }
        let rest = &content[at..];
        let rest = rest.trim_start();
        let quote = rest.chars().next().unwrap_or('"');
        if quote == '"' || quote == '\'' {
            if let Some(end) = rest[1..].find(quote) {
                let raw = &rest[1..1 + end];
                let raw = trim_wrapping(raw);
                if !raw.is_empty() {
                    out.push(raw.to_string());
                }
                j = at + 1 + end + 1;
                continue;
            }
        } else {
            let raw = rest.split_whitespace().next().unwrap_or("");
            let raw = trim_wrapping(raw);
            if !raw.is_empty() {
                out.push(raw.to_string());
            }
        }
        j = at + 4;
    }

    out
}

fn normalize_ref_path(root_path: &Path, file_path: &Path, raw: &str) -> Option<PathBuf> {
    let r = raw.trim();
    if r.is_empty() {
        return None;
    }
    let rl = r.to_lowercase();
    if rl.starts_with("http://")
        || rl.starts_with("https://")
        || rl.starts_with("data:")
        || rl.starts_with("blob:")
        || rl.starts_with("tauri:")
        || rl.starts_with("asset:")
        || rl.starts_with("file://")
    {
        return None;
    }

    let cleaned = r.split('#').next().unwrap_or(r).split('?').next().unwrap_or(r);
    let cleaned = trim_wrapping(cleaned);

    let p = if cleaned.starts_with('/') {
        root_path.join(cleaned.trim_start_matches('/'))
    } else {
        let base = file_path.parent().unwrap_or(root_path);
        base.join(cleaned)
    };

    Some(p)
}

fn compute_unused_images(app: &AppHandle, root_path: &str, job_id: u64) -> Result<Vec<String>, String> {
    let root = PathBuf::from(root_path);
    if !root.exists() {
        return Err("Workspace path does not exist".to_string());
    }

    emit_clean_log(app, &format!("Clean: scanning images under {}", root_path));
    emit_clean_progress(app, "collect_images", 0, 0, "Collecting images…".to_string());

    let mut images: Vec<String> = Vec::new();
    let mut image_set: HashSet<String> = HashSet::new();

    let mut scanned_entries = 0usize;
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                if name == ".xnote_assets" {
                    return true;
                }
                if name.starts_with('.') {
                    return false;
                }
            }
            true
        })
        .filter_map(|e| e.ok())
    {
        if is_cancelled(job_id) {
            emit_clean_log(app, "Clean: cancelled");
            emit_clean_progress(app, "cancelled", scanned_entries, 0, "Cancelled".to_string());
            return Ok(vec![]);
        }
        scanned_entries += 1;
        if scanned_entries % 100 == 0 {
            emit_clean_progress(
                app,
                "collect_images",
                scanned_entries,
                0,
                format!("Collecting images… scanned {}, found {}", scanned_entries, images.len()),
            );
        }

        if entry.file_type().is_dir() {
            continue;
        }

        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !is_image_ext(&ext) {
            continue;
        }

        let canonical = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
        let s = canonical.to_string_lossy().to_string();
        if image_set.insert(s.clone()) {
            images.push(s);
        }
    }

    emit_clean_log(app, &format!("Clean: collected {} images", image_set.len()));
    emit_clean_progress(app, "scan_refs", 0, 0, "Scanning references…".to_string());

    let mut text_files: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_entry(|e| {
            if e.depth() == 0 {
                return true;
            }
            if e.file_type().is_dir() {
                let name = e.file_name().to_string_lossy();
                if name == ".xnote_assets" {
                    return false;
                }
                if name.starts_with('.') {
                    return false;
                }
            }
            true
        })
        .filter_map(|e| e.ok())
    {
        if is_cancelled(job_id) {
            emit_clean_log(app, "Clean: cancelled");
            emit_clean_progress(app, "cancelled", 0, 0, "Cancelled".to_string());
            return Ok(vec![]);
        }
        if entry.file_type().is_dir() {
            continue;
        }
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        if !is_text_ext(&ext) {
            continue;
        }
        text_files.push(path.to_path_buf());
    }

    let total_files = text_files.len().max(1);
    emit_clean_log(app, &format!("Clean: scanning {} text files for references", text_files.len()));

    let mut referenced: HashSet<String> = HashSet::new();

    for (idx, file_path) in text_files.iter().enumerate() {
        if is_cancelled(job_id) {
            emit_clean_log(app, "Clean: cancelled");
            emit_clean_progress(app, "cancelled", idx, total_files, "Cancelled".to_string());
            return Ok(vec![]);
        }
        if idx % 10 == 0 {
            emit_clean_progress(
                app,
                "scan_refs",
                idx,
                total_files,
                format!("Scanning references… ({}/{})", idx, total_files),
            );
        }

        let content = match fs::read_to_string(file_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        for raw in extract_candidate_paths(&content) {
            let raw_lower = raw.to_lowercase();
            if raw_lower.contains("://") {
                continue;
            }
            if !(raw_lower.contains("/.xnote_assets/")
                || raw_lower.ends_with(".png")
                || raw_lower.ends_with(".jpg")
                || raw_lower.ends_with(".jpeg")
                || raw_lower.ends_with(".gif")
                || raw_lower.ends_with(".webp")
                || raw_lower.ends_with(".bmp")
                || raw_lower.ends_with(".svg"))
            {
                continue;
            }
            if let Some(p) = normalize_ref_path(&root, file_path, &raw) {
                let canon = fs::canonicalize(&p).unwrap_or(p);
                referenced.insert(canon.to_string_lossy().to_string());
            }
        }
    }

    emit_clean_progress(app, "compute", 1, 1, "Computing unused images…".to_string());

    let unused: Vec<String> = images
        .into_iter()
        .filter(|p| !referenced.contains(p))
        .collect();

    emit_clean_log(app, &format!("Clean: found {} unused images", unused.len()));
    emit_clean_progress(app, "done", 1, 1, "Done".to_string());

    Ok(unused)
}

#[tauri::command]
fn find_unused_images(app: AppHandle, root_path: String) -> Result<UnusedImageResult, String> {
    let job_id = start_new_job();
    let images = compute_unused_images(&app, &root_path, job_id)?;
    Ok(UnusedImageResult { images })
}

#[tauri::command]
fn move_path(source: String, target: String) -> Result<(), String> {
    fs::rename(source, target).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())
    } else {
        fs::remove_file(p).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn delete_files(app: AppHandle, root_path: String, paths: Vec<String>) -> Result<usize, String> {
    let root = fs::canonicalize(&root_path).unwrap_or_else(|_| PathBuf::from(&root_path));
    let total = paths.len().max(1);
    let mut deleted = 0usize;
    let job_id = start_new_job();

    for (idx, p) in paths.iter().enumerate() {
        if is_cancelled(job_id) {
            emit_clean_log(&app, "Clean: cancelled");
            emit_clean_progress(&app, "cancelled", idx, total, "Cancelled".to_string());
            return Ok(deleted);
        }
        if idx % 5 == 0 {
            let _ = app.emit(
                "clean-unused-images-progress",
                CleanProgress {
                    phase: "delete".to_string(),
                    current: idx,
                    total,
                    message: format!("Deleting… ({}/{})", idx, total),
                },
            );
        }

        let candidate = fs::canonicalize(p).unwrap_or_else(|_| PathBuf::from(p));
        if !candidate.starts_with(&root) {
            continue;
        }
        if candidate.is_file() {
            if fs::remove_file(&candidate).is_ok() {
                deleted += 1;
            }
            if let Some(parent) = candidate.parent() {
                if parent.read_dir().map(|mut it| it.next().is_none()).unwrap_or(false) {
                    let _ = fs::remove_dir(parent);
                }
            }
        }
    }

    let _ = app.emit(
        "clean-unused-images-progress",
        CleanProgress {
            phase: "done".to_string(),
            current: 1,
            total: 1,
            message: "Done".to_string(),
        },
    );

    Ok(deleted)
}

#[tauri::command]
fn start_find_unused_images_scan(app: AppHandle, root_path: String) -> Result<(), String> {
    let app_handle = app.clone();
    let job_id = start_new_job();
    async_runtime::spawn_blocking(move || {
        match compute_unused_images(&app_handle, &root_path, job_id) {
            Ok(images) => {
                let _ = app_handle.emit("clean-unused-images-result", CleanResult { images });
            }
            Err(err) => {
                emit_clean_log(&app_handle, &format!("Clean: error: {}", err));
                emit_clean_progress(&app_handle, "error", 1, 1, "Error".to_string());
            }
        }
    });
    Ok(())
}

#[tauri::command]
fn start_delete_unused_images(app: AppHandle, root_path: String, paths: Vec<String>) -> Result<(), String> {
    let app_handle = app.clone();
    async_runtime::spawn_blocking(move || {
        emit_clean_log(&app_handle, "Clean: deleting unused images…");
        let total = paths.len();
        let deleted = delete_files(app_handle.clone(), root_path, paths).unwrap_or(0);
        emit_clean_log(&app_handle, &format!("Clean: deleted {} / {}", deleted, total));
        let _ = app_handle.emit("clean-unused-images-delete-result", DeleteResult { deleted, total });
    });
    Ok(())
}

#[tauri::command]
fn cancel_clean_unused_images() -> Result<bool, String> {
    Ok(request_cancel())
}

#[tauri::command]
fn copy_file(source: String, target: String) -> Result<(), String> {
    fs::copy(source, target).map(|_| ()).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle();
            
            // App Menu (XNote)
            let app_menu = Submenu::new(handle, "XNote", true)?;
            let about = MenuItem::with_id(handle, "about", "About XNote", true, None::<&str>)?;
            let settings = MenuItem::with_id(handle, "settings", "Settings…", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(handle)?;
            let quit = PredefinedMenuItem::quit(handle, None)?;
            
            app_menu.append(&about)?;
            app_menu.append(&settings)?;
            app_menu.append(&sep)?;
            app_menu.append(&quit)?;

            // Edit Menu
            let edit_menu = Submenu::new(handle, "Edit", true)?;
            let undo = PredefinedMenuItem::undo(handle, None)?;
            let redo = PredefinedMenuItem::redo(handle, None)?;
            let cut = PredefinedMenuItem::cut(handle, None)?;
            let copy = PredefinedMenuItem::copy(handle, None)?;
            let paste = PredefinedMenuItem::paste(handle, None)?;
            let select_all = PredefinedMenuItem::select_all(handle, None)?;
            
            edit_menu.append(&undo)?;
            edit_menu.append(&redo)?;
            edit_menu.append(&PredefinedMenuItem::separator(handle)?)?;
            edit_menu.append(&cut)?;
            edit_menu.append(&copy)?;
            edit_menu.append(&paste)?;
            edit_menu.append(&PredefinedMenuItem::separator(handle)?)?;
            edit_menu.append(&select_all)?;

            // View Menu
            let view_menu = Submenu::new(handle, "View", true)?;
            let fullscreen = PredefinedMenuItem::fullscreen(handle, None)?;
            view_menu.append(&fullscreen)?;

            // Features Menu
            let features_menu = Submenu::new(handle, "Features", true)?;
            let clean_unused_images = MenuItem::with_id(handle, "clean_unused_images", "Clean Unused Images", true, None::<&str>)?;
            features_menu.append(&clean_unused_images)?;

            // Window Menu
            let window_menu = Submenu::new(handle, "Window", true)?;
            let minimize = PredefinedMenuItem::minimize(handle, None)?;
            let zoom = PredefinedMenuItem::maximize(handle, None)?; // maximize acts as zoom on mac
            window_menu.append(&minimize)?;
            window_menu.append(&zoom)?;

            let menu = Menu::with_items(handle, &[
                &app_menu,
                &edit_menu,
                &view_menu,
                &features_menu,
                &window_menu
            ])?;

            app.set_menu(menu)?;

            app.manage(TerminalState::new());

            Ok(())
        })
        .on_menu_event(|app, event| {
            if event.id() == "about" {
                app.emit("open-about", ()).unwrap();
            }
            if event.id() == "settings" {
                app.emit("open-settings", ()).unwrap();
            }
            if event.id() == "clean_unused_images" {
                app.emit("features-clean-unused-images", ()).unwrap();
            }
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            get_files, 
            read_file, 
            save_file, 
            create_note, 
            create_folder,
            save_image,
            read_file_base64,
            set_clipboard_image,
            set_clipboard_image_from_svg,
            search_text,
            find_unused_images,
            get_default_workspace,
            move_path,
            delete_path,
            delete_files,
            start_find_unused_images_scan,
            start_delete_unused_images,
            cancel_clean_unused_images,
            copy_file,
            get_config,
            save_config,
            create_terminal,
            write_to_terminal,
            resize_terminal,
            close_terminal
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
