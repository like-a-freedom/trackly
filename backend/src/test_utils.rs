//! Test utilities shared across test modules
#![allow(dead_code)]

// Utilities for safely managing environment variables in tests (delegates to `temp-env`)

/// Temporarily set an env var for the duration of the closure. Restores previous value afterwards.
/// Uses the `temp-env` crate to safely set/unset environment variables for tests without
/// adding any `unsafe` code in our repo.
pub fn with_temp_env<K, V, F>(key: K, value: Option<V>, f: F)
where
    K: AsRef<str>,
    V: AsRef<str>,
    F: FnOnce(),
{
    match value {
        Some(v) => temp_env::with_var(key.as_ref(), Some(v.as_ref()), f),
        None => temp_env::with_var_unset(key.as_ref(), f),
    }
}

/// Async-aware helper to set env vars for the duration of an async closure
pub async fn with_temp_env_async<K, V, Fut, F>(key: K, value: Option<V>, f: F) -> Fut::Output
where
    K: AsRef<str>,
    V: AsRef<str>,
    F: FnOnce() -> Fut,
    Fut: std::future::Future,
{
    match value {
        Some(v) => temp_env::async_with_vars(&[(key.as_ref(), Some(v.as_ref()))], f()).await,
        None => temp_env::async_with_vars(&[(key.as_ref(), None::<&str>)], f()).await,
    }
}

/// Helper to set multiple env vars temporarily using a list of key->Option<value>
/// Delegates to `temp-env` which handles restoration and synchronization.
pub fn with_temp_envs<F>(vars: &[(&str, Option<&str>)], f: F)
where
    F: FnOnce(),
{
    temp_env::with_vars(vars, f)
}

/// Async version for multiple env vars
pub async fn with_temp_envs_async<F, Fut>(vars: &[(&str, Option<&str>)], f: F) -> Fut::Output
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future,
{
    temp_env::async_with_vars(vars, f()).await
}
