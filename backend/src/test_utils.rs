//! Test utilities shared across test modules
#![allow(dead_code)]

use once_cell::sync::Lazy;
use std::sync::Mutex as StdMutex;
use tokio::sync::Mutex as TokioMutex;

static TEST_ENV_MUTEX_SYNC: Lazy<StdMutex<()>> = Lazy::new(|| StdMutex::new(()));
static TEST_ENV_MUTEX_ASYNC: Lazy<TokioMutex<()>> = Lazy::new(|| TokioMutex::new(()));

/// Temporarily set an env var for the duration of the closure. Restores previous value afterwards.
pub fn with_temp_env<K, V, F>(key: K, value: Option<V>, f: F)
where
    K: AsRef<str>,
    V: AsRef<str>,
    F: FnOnce(),
{
    // Use a blocking lock on the tokio mutex to serialize with async tests
    let _guard = TEST_ENV_MUTEX_SYNC.lock().unwrap();
    let key_ref = key.as_ref();
    let previous = std::env::var(key_ref).ok();

    match value {
        Some(v) => std::env::set_var(key_ref, v.as_ref()),
        None => std::env::remove_var(key_ref),
    }

    f();

    match previous {
        Some(prev) => std::env::set_var(key_ref, prev),
        None => std::env::remove_var(key_ref),
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
    let _guard = TEST_ENV_MUTEX_ASYNC.lock().await;
    let key_ref = key.as_ref();
    let previous = std::env::var(key_ref).ok();

    match value {
        Some(v) => std::env::set_var(key_ref, v.as_ref()),
        None => std::env::remove_var(key_ref),
    }

    let res = f().await;

    match previous {
        Some(prev) => std::env::set_var(key_ref, prev),
        None => std::env::remove_var(key_ref),
    }

    res
}

/// Helper to set multiple env vars temporarily using a list of key->Option<value>
pub fn with_temp_envs<F>(vars: &[(&str, Option<&str>)], f: F)
where
    F: FnOnce(),
{
    let _guard = TEST_ENV_MUTEX_SYNC.lock().unwrap();
    let mut previous = Vec::new();
    for (k, v) in vars.iter() {
        previous.push((*k, std::env::var(k).ok()));
        match v {
            Some(val) => std::env::set_var(k, *val),
            None => std::env::remove_var(k),
        }
    }

    f();

    for (k, v) in previous.into_iter() {
        match v {
            Some(val) => std::env::set_var(k, val),
            None => std::env::remove_var(k),
        }
    }
}

/// Async version for multiple env vars
pub async fn with_temp_envs_async<F, Fut>(vars: &[(&str, Option<&str>)], f: F) -> Fut::Output
where
    F: FnOnce() -> Fut,
    Fut: std::future::Future,
{
    let _guard = TEST_ENV_MUTEX_ASYNC.lock().await;
    let mut previous = Vec::new();
    for (k, v) in vars.iter() {
        previous.push((*k, std::env::var(k).ok()));
        match v {
            Some(val) => std::env::set_var(k, *val),
            None => std::env::remove_var(k),
        }
    }

    let res = f().await;

    for (k, v) in previous.into_iter() {
        match v {
            Some(val) => std::env::set_var(k, val),
            None => std::env::remove_var(k),
        }
    }

    res
}
