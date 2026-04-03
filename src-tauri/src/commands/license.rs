use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use sha2::{Digest, Sha256};
use tauri::State;

use crate::contracts::AuthResult;
use crate::db::DbPool;

const LICENSE_PUBLIC_KEY_BASE64: &str = include_str!("../../license_public_key.txt");

fn load_public_key() -> Result<VerifyingKey, String> {
    let public_key = LICENSE_PUBLIC_KEY_BASE64.trim();
    if public_key.is_empty() {
        return Err("LICENSE_NOT_CONFIGURED".to_string());
    }

    let bytes = BASE64_STANDARD
        .decode(public_key)
        .map_err(|_| "LICENSE_NOT_CONFIGURED".to_string())?;
    let public_key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "LICENSE_NOT_CONFIGURED".to_string())?;

    VerifyingKey::from_bytes(&public_key_bytes).map_err(|_| "LICENSE_NOT_CONFIGURED".to_string())
}

fn decode_signature(signature: &str) -> Result<Signature, String> {
    let bytes = BASE64_STANDARD
        .decode(signature)
        .map_err(|_| "INVALID_KEY".to_string())?;
    Signature::from_slice(&bytes).map_err(|_| "INVALID_KEY".to_string())
}

fn verify_license_key_with_public_key(
    key: &str,
    machine_id: &str,
    public_key: &VerifyingKey,
) -> Result<(String, String), String> {
    let parts: Vec<&str> = key.splitn(3, ':').collect();
    if parts.len() != 3 {
        return Err("INVALID_FORMAT".to_string());
    }

    let tier = parts[0];
    let expiry = parts[1];

    if tier != "pro" && tier != "free" {
        return Err("INVALID_TIER".to_string());
    }

    if expiry != "never" {
        let today = chrono::Utc::now().format("%Y-%m-%d").to_string();
        if expiry < today.as_str() {
            return Err("EXPIRED_KEY".to_string());
        }
    }

    let signature = decode_signature(parts[2])?;
    let message = format!("{}:{}:{}", tier, expiry, machine_id);
    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| "INVALID_KEY".to_string())?;

    Ok((tier.to_string(), expiry.to_string()))
}

fn verify_license_key(key: &str, machine_id: &str) -> Result<(String, String), String> {
    let public_key = load_public_key()?;
    verify_license_key_with_public_key(key, machine_id, &public_key)
}

#[tauri::command]
pub async fn validate_license_cmd(
    pool: State<'_, DbPool>,
    key: String,
) -> Result<AuthResult, String> {
    let machine_id = machine_uid::get().map_err(|e| format!("Cannot get machine ID: {}", e))?;

    match verify_license_key(&key, &machine_id) {
        Ok((tier, expiry)) => {
            let key_hash = hex::encode(Sha256::digest(key.as_bytes()));

            let conn = pool.get().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT INTO license_key (id, key_hash, tier, expiry, is_valid, validated_at)
                 VALUES (1, ?1, ?2, ?3, 1, CURRENT_TIMESTAMP)
                 ON CONFLICT(id) DO UPDATE SET
                   key_hash     = excluded.key_hash,
                   tier         = excluded.tier,
                   expiry       = excluded.expiry,
                   is_valid     = 1,
                   validated_at = CURRENT_TIMESTAMP",
                rusqlite::params![&key_hash, &tier, &expiry],
            )
            .map_err(|e| e.to_string())?;

            Ok(AuthResult {
                is_valid: true,
                message: "License activated".to_string(),
                tier: Some(tier),
                expiry: Some(expiry),
            })
        }
        Err(error_code) => {
            let message = match error_code.as_str() {
                "LICENSE_NOT_CONFIGURED" => {
                    "License verification is not configured for this build."
                }
                "INVALID_FORMAT" => "Invalid key format. Please check your purchase email.",
                "INVALID_TIER" => "Unknown license tier in key.",
                "EXPIRED_KEY" => "This license key has expired.",
                "INVALID_KEY" => "Invalid key. Please check your purchase confirmation.",
                _ => "License validation failed.",
            };

            Ok(AuthResult {
                is_valid: false,
                message: message.to_string(),
                tier: None,
                expiry: None,
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ed25519_dalek::{Signer, SigningKey};

    fn test_signing_key() -> SigningKey {
        SigningKey::from_bytes(&[7u8; 32])
    }

    fn sign_license(tier: &str, expiry: &str, machine_id: &str) -> String {
        let signing_key = test_signing_key();
        let message = format!("{}:{}:{}", tier, expiry, machine_id);
        let signature = signing_key.sign(message.as_bytes());
        format!(
            "{}:{}:{}",
            tier,
            expiry,
            BASE64_STANDARD.encode(signature.to_bytes())
        )
    }

    #[test]
    fn test_invalid_format_rejected() {
        let verifying_key = test_signing_key().verifying_key();
        let result = verify_license_key_with_public_key("tooshort", "test-machine", &verifying_key);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "INVALID_FORMAT");
    }

    #[test]
    fn test_invalid_tier_rejected() {
        let verifying_key = test_signing_key().verifying_key();
        let result = verify_license_key_with_public_key(
            "enterprise:never:abcd",
            "test-machine",
            &verifying_key,
        );
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "INVALID_TIER");
    }

    #[test]
    fn test_expired_key_rejected() {
        let verifying_key = test_signing_key().verifying_key();
        let key = sign_license("pro", "2020-01-01", "test-machine");
        let result = verify_license_key_with_public_key(&key, "test-machine", &verifying_key);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "EXPIRED_KEY");
    }

    #[test]
    fn test_wrong_signature_rejected() {
        let verifying_key = test_signing_key().verifying_key();
        let bad_key = "pro:never:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
        let result = verify_license_key_with_public_key(bad_key, "test-machine", &verifying_key);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "INVALID_KEY");
    }

    #[test]
    fn test_valid_key_accepted() {
        let signing_key = test_signing_key();
        let verifying_key = signing_key.verifying_key();
        let key = sign_license("pro", "never", "test-machine");

        let result = verify_license_key_with_public_key(&key, "test-machine", &verifying_key);
        assert!(result.is_ok());

        let (tier, expiry) = result.unwrap();
        assert_eq!(tier, "pro");
        assert_eq!(expiry, "never");
    }
}
