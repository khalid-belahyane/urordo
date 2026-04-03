pub mod boundary;
pub mod folders;
pub mod launchers;
pub mod patterns;
pub mod projects;
pub mod resources;
pub mod system;

pub enum ClassifyResult {
    Protected(&'static str),
    Standard(String),
}
