use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use ed25519_dalek::{Signer, SigningKey};
use rand_core::OsRng;

fn print_usage() {
    eprintln!("urordo License Key Generator");
    eprintln!();
    eprintln!("Generate a new signing keypair:");
    eprintln!("  cargo run --bin keygen -- generate-keypair");
    eprintln!();
    eprintln!("Generate a license key with a private key from the environment:");
    eprintln!("  $env:URORDO_LICENSE_PRIVATE_KEY=\"<base64 32-byte private key>\"");
    eprintln!("  cargo run --bin keygen -- <tier> <expiry> <machine_id>");
    eprintln!();
    eprintln!("  tier       - pro | free");
    eprintln!("  expiry     - never | YYYY-MM-DD");
    eprintln!("  machine_id - target machine id");
}

fn load_signing_key_from_env() -> Result<SigningKey, String> {
    let raw = std::env::var("URORDO_LICENSE_PRIVATE_KEY")
        .map_err(|_| "URORDO_LICENSE_PRIVATE_KEY is not set".to_string())?;
    let bytes = BASE64_STANDARD
        .decode(raw.trim())
        .map_err(|_| "URORDO_LICENSE_PRIVATE_KEY must be base64".to_string())?;
    let private_key_bytes: [u8; 32] = bytes
        .try_into()
        .map_err(|_| "URORDO_LICENSE_PRIVATE_KEY must decode to 32 bytes".to_string())?;
    Ok(SigningKey::from_bytes(&private_key_bytes))
}

fn generate_keypair() {
    let signing_key = SigningKey::generate(&mut OsRng);
    let verifying_key = signing_key.verifying_key();

    println!("Store the private key outside the repository.");
    println!("Public key (base64):");
    println!("{}", BASE64_STANDARD.encode(verifying_key.to_bytes()));
    println!();
    println!("Private key (base64, seed only):");
    println!("{}", BASE64_STANDARD.encode(signing_key.to_bytes()));
}

fn main() {
    let args: Vec<String> = std::env::args().collect();

    if args.len() < 2 {
        print_usage();
        std::process::exit(1);
    }

    if args[1] == "generate-keypair" {
        generate_keypair();
        return;
    }

    let tier = args.get(1).map(|value| value.as_str()).unwrap_or("pro");
    let expiry = args.get(2).map(|value| value.as_str()).unwrap_or("never");
    let machine_id = args
        .get(3)
        .map(|value| value.as_str())
        .unwrap_or("test-machine");

    if tier != "pro" && tier != "free" {
        eprintln!("Error: tier must be 'pro' or 'free', got '{}'", tier);
        std::process::exit(1);
    }

    if expiry != "never" && expiry.len() != 10 {
        eprintln!(
            "Error: expiry must be 'never' or 'YYYY-MM-DD', got '{}'",
            expiry
        );
        std::process::exit(1);
    }

    let signing_key = match load_signing_key_from_env() {
        Ok(signing_key) => signing_key,
        Err(error) => {
            eprintln!("Error: {}", error);
            std::process::exit(1);
        }
    };

    let message = format!("{}:{}:{}", tier, expiry, machine_id);
    let signature = signing_key.sign(message.as_bytes());

    println!(
        "{}:{}:{}",
        tier,
        expiry,
        BASE64_STANDARD.encode(signature.to_bytes())
    );
}
