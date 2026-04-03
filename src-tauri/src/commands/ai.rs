use reqwest::Client;
use std::time::Duration;

// The Gemini API endpoint — model name is a constant so it can be updated in one place
const GEMINI_MODEL: &str = "gemini-1.5-flash";
const GEMINI_BASE: &str = "https://generativelanguage.googleapis.com/v1beta/models";

use crate::contracts::ValidateKeyResult;

/// Asks Gemini to classify a filename into a 1-2 word category.
/// The API key is sent as an `x-goog-api-key` header — NOT in the URL.
/// Returns the trimmed classification string, or an empty string on failure.
pub async fn ask_gemini(api_key: &str, file_name: &str) -> String {
    let client = match Client::builder().timeout(Duration::from_secs(5)).build() {
        Ok(c) => c,
        Err(_) => return String::new(),
    };

    let url = format!("{}/{}:generateContent", GEMINI_BASE, GEMINI_MODEL);
    let prompt = format!(
        "You are a file organiser. Classify the filename below into ONE of these folder names:\n\
         Documents/Finance, Documents/Legal, Documents/Career, Documents/General, Documents/Manuals,\n\
         Documents/Presentations, Documents/Spreadsheets, Documents/Text,\n\
         Images/Photos, Images/Screenshots, Images/RAW, Design,\n\
         Video, Audio, Applications, Archives, Fonts, Books, Data,\n\
         Email, Code, Logs, Downloads, 3D Models, Other.\n\n\
         Rules:\n\
         - Reply with ONLY the folder name. No explanation, no punctuation, no extra text.\n\
         - Choose the most specific category that fits.\n\
         - If truly ambiguous, reply with: Other\n\n\
         Filename: {}",
        file_name
    );
    let payload = serde_json::json!({
        "contents": [{
            "parts": [{ "text": prompt }]
        }],
        "generationConfig": {
            "temperature": 0.0,
            "maxOutputTokens": 16
        }
    });

    if let Ok(resp) = client
        .post(&url)
        .header("x-goog-api-key", api_key)
        .json(&payload)
        .send()
        .await
    {
        if resp.status().is_success() {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(text) = json
                    .get("candidates")
                    .and_then(|c| c.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|first| first.get("content"))
                    .and_then(|c| c.get("parts"))
                    .and_then(|p| p.as_array())
                    .and_then(|arr| arr.first())
                    .and_then(|f| f.get("text"))
                    .and_then(|t| t.as_str())
                {
                    return text.trim().to_string();
                }
            }
        }
    }
    String::new()
}

/// Validates a Gemini API key by making a minimal test request.
/// The key is sent as an `x-goog-api-key` header — NOT in the URL.
#[tauri::command]
pub async fn validate_gemini_key_cmd(key: String) -> Result<ValidateKeyResult, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to build HTTP client: {}", e))?;

    let url = format!("{}/{}:generateContent", GEMINI_BASE, GEMINI_MODEL);
    let payload = serde_json::json!({
        "contents": [{"parts": [{"text": "Hello"}]}]
    });

    let resp = client
        .post(&url)
        .header("x-goog-api-key", &key)
        .json(&payload)
        .send()
        .await;

    match resp {
        Ok(response) => {
            if response.status().is_success() {
                Ok(ValidateKeyResult {
                    is_valid: true,
                    message: "Valid API Key".to_string(),
                })
            } else {
                Ok(ValidateKeyResult {
                    is_valid: false,
                    message: "Invalid API Key".to_string(),
                })
            }
        }
        Err(e) => Ok(ValidateKeyResult {
            is_valid: false,
            message: e.to_string(),
        }),
    }
}
