use std::path::Path;

pub fn classify_semantic_bucket(path: &Path) -> String {
    let name = path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();
    let ext = path
        .extension()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase();

    // ── Documents — semantic name matching takes priority over extension ──────
    if ext == "pdf" {
        if name.contains("invoice")
            || name.contains("receipt")
            || name.contains("bill")
            || name.contains("payment")
            || name.contains("statement")
            || name.contains("tax")
        {
            return "Documents/Finance".to_string();
        }
        if name.contains("contract")
            || name.contains("agreement")
            || name.contains("nda")
            || name.contains("terms")
            || name.contains("legal")
        {
            return "Documents/Legal".to_string();
        }
        if name.contains("manual")
            || name.contains("guide")
            || name.contains("handbook")
            || name.contains("tutorial")
            || name.contains("instruction")
        {
            return "Documents/Manuals".to_string();
        }
        if name.contains("resume") || name.contains("curriculum") || name.contains("portfolio") {
            return "Documents/Career".to_string();
        }
        return "Documents/General".to_string();
    }

    // ── Spreadsheets ─────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "xls" | "xlsx" | "xlsm" | "xlsb" | "ods" | "numbers" | "csv" | "tsv"
    ) {
        if name.contains("budget")
            || name.contains("finance")
            || name.contains("expense")
            || name.contains("invoice")
            || name.contains("payroll")
            || name.contains("tax")
            || name.contains("accounting")
        {
            return "Documents/Finance".to_string();
        }
        return "Documents/Spreadsheets".to_string();
    }

    // ── Presentations ─────────────────────────────────────────────────────────
    if matches!(ext.as_str(), "ppt" | "pptx" | "pptm" | "odp" | "key") {
        return "Documents/Presentations".to_string();
    }

    // ── Word-processing documents ─────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "doc" | "docx" | "docm" | "odt" | "rtf" | "wpd"
    ) {
        if name.contains("contract")
            || name.contains("agreement")
            || name.contains("nda")
            || name.contains("legal")
        {
            return "Documents/Legal".to_string();
        }
        if name.contains("resume") || name.contains("cv") || name.contains("curriculum") {
            return "Documents/Career".to_string();
        }
        return "Documents/General".to_string();
    }

    // ── Plain text / markup ───────────────────────────────────────────────────
    if matches!(ext.as_str(), "txt" | "md" | "markdown" | "rst" | "adoc") {
        return "Documents/Text".to_string();
    }

    // ── Images ───────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "jpg"
            | "jpeg"
            | "png"
            | "gif"
            | "webp"
            | "bmp"
            | "tiff"
            | "tif"
            | "heic"
            | "heif"
            | "avif"
            | "jfif"
    ) {
        if name.contains("screenshot")
            || name.contains("screen shot")
            || name.contains("capture")
            || name.starts_with("screenshot")
        {
            return "Images/Screenshots".to_string();
        }
        if name.contains("wallpaper") || name.contains("background") {
            return "Images/Wallpapers".to_string();
        }
        return "Images/Photos".to_string();
    }

    // ── RAW camera files ──────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "raw" | "cr2" | "cr3" | "nef" | "nrw" | "arw" | "orf" | "rw2" | "dng" | "pef"
    ) {
        return "Images/RAW".to_string();
    }

    // ── Design / vector ───────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "psd"
            | "psb"
            | "ai"
            | "eps"
            | "indd"
            | "indb"
            | "xd"
            | "fig"
            | "sketch"
            | "svg"
            | "afdesign"
            | "afphoto"
            | "afpub"
    ) {
        return "Design".to_string();
    }

    // ── Video ─────────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "mp4"
            | "mkv"
            | "mov"
            | "avi"
            | "wmv"
            | "flv"
            | "webm"
            | "m4v"
            | "3gp"
            | "3g2"
            | "ts"
            | "mts"
            | "m2ts"
            | "vob"
            | "ogv"
            | "rm"
            | "rmvb"
            | "divx"
    ) {
        return "Video".to_string();
    }

    // ── Audio ─────────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "mp3"
            | "wav"
            | "flac"
            | "aac"
            | "ogg"
            | "oga"
            | "opus"
            | "m4a"
            | "wma"
            | "aiff"
            | "aif"
            | "alac"
            | "mid"
            | "midi"
            | "ape"
            | "wv"
            | "mka"
    ) {
        return "Audio".to_string();
    }

    // ── Installers / applications ─────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "exe"
            | "msi"
            | "msix"
            | "appx"
            | "appxbundle"
            | "dmg"
            | "pkg"
            | "deb"
            | "rpm"
            | "apk"
            | "ipa"
            | "appimage"
            | "snap"
    ) {
        return "Applications".to_string();
    }

    // ── Archives & compressed ─────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "zip"
            | "rar"
            | "7z"
            | "tar"
            | "gz"
            | "bz2"
            | "xz"
            | "zst"
            | "lz4"
            | "tgz"
            | "tbz2"
            | "txz"
            | "cab"
            | "lzma"
    ) {
        return "Archives".to_string();
    }

    // ── Disk images ───────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "iso" | "img" | "vmdk" | "vhd" | "vhdx" | "ova" | "ovf" | "qcow2"
    ) {
        return "Disk Images".to_string();
    }

    // ── Fonts ─────────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "ttf" | "otf" | "woff" | "woff2" | "eot" | "fon" | "pfb" | "pfm"
    ) {
        return "Fonts".to_string();
    }

    // ── eBooks ────────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "epub" | "mobi" | "azw" | "azw3" | "fb2" | "lit" | "djvu"
    ) {
        return "Books".to_string();
    }

    // ── Data / database ───────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "db" | "sqlite" | "sqlite3" | "sql" | "mdb" | "accdb" | "bak"
    ) {
        return "Data".to_string();
    }

    // ── Torrents / downloads ──────────────────────────────────────────────────
    if matches!(ext.as_str(), "torrent") {
        return "Downloads".to_string();
    }

    // ── Email ─────────────────────────────────────────────────────────────────
    if matches!(ext.as_str(), "eml" | "msg" | "mbox" | "emlx") {
        return "Email".to_string();
    }

    // ── 3D / CAD ─────────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "stl"
            | "obj"
            | "fbx"
            | "dae"
            | "3ds"
            | "blend"
            | "max"
            | "c4d"
            | "dwg"
            | "dxf"
            | "step"
            | "stp"
            | "iges"
            | "igs"
    ) {
        return "3D Models".to_string();
    }

    // ── Logs / system ─────────────────────────────────────────────────────────
    if matches!(ext.as_str(), "log" | "evt" | "evtx" | "dmp" | "crash") {
        return "Logs".to_string();
    }

    // ── Code / scripts ────────────────────────────────────────────────────────
    if matches!(
        ext.as_str(),
        "js" | "ts"
            | "jsx"
            | "tsx"
            | "py"
            | "rb"
            | "go"
            | "rs"
            | "java"
            | "c"
            | "cpp"
            | "cc"
            | "h"
            | "hpp"
            | "cs"
            | "swift"
            | "kt"
            | "kts"
            | "php"
            | "lua"
            | "r"
            | "sh"
            | "bash"
            | "zsh"
            | "ps1"
            | "bat"
            | "cmd"
            | "asm"
            | "dart"
            | "scala"
            | "clj"
            | "hs"
            | "vb"
            | "vbs"
            | "json"
            | "yaml"
            | "yml"
            | "toml"
            | "xml"
            | "ini"
            | "cfg"
            | "conf"
            | "env"
            | "properties"
            | "plist"
            | "html"
            | "htm"
            | "xhtml"
            | "css"
            | "scss"
            | "sass"
            | "less"
    ) {
        return "Code".to_string();
    }

    "Other".to_string()
}
