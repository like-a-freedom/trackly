use std::io::{self, Write};
use tracing_subscriber::fmt::time::SystemTime;
use tracing_subscriber::{fmt, util::SubscriberInitExt, EnvFilter};

const DEFAULT_DIRECTIVES: &str = "info,backend=info,sqlx=warn,tower=info";

/// Initialize tracing subscriber with sane defaults and optional env overrides.
///
/// Environment variables:
/// - `RUST_LOG`    : overrides filter directives (e.g. `debug,backend=trace`).
/// - `LOG_FORMAT`  : `json` (default) or `pretty` (compact, human-friendly).
pub fn init() {
    let env_filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new(DEFAULT_DIRECTIVES));

    let log_format = std::env::var("LOG_FORMAT")
        .unwrap_or_else(|_| "json".to_string())
        .to_lowercase();

    // Sanitizing writer wraps the STDOUT writer and collapses multiline fields
    // and whitespace so logs appear as single-line, easier to read.
    struct SanitizingWriter<W>(W);

    impl<W: Write> Write for SanitizingWriter<W> {
        fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
            let s = String::from_utf8_lossy(buf).to_string();
            // Replace escaped/newline/tab sequences with spaces
            let mut s = s.replace("\\n", " ");
            s = s.replace('\n', " ");
            s = s.replace('\t', " ");
            // Collapse multiple whitespace into a single space
            let mut collapsed = String::with_capacity(s.len());
            let mut last_was_space = false;
            for ch in s.chars() {
                if ch.is_whitespace() {
                    if !last_was_space {
                        collapsed.push(' ');
                        last_was_space = true;
                    }
                } else {
                    collapsed.push(ch);
                    last_was_space = false;
                }
            }
            let mut trimmed = collapsed.trim().to_string();
            // Preserve trailing newline from original buffer
            if buf.ends_with(&b"\n"[..]) {
                trimmed.push('\n');
            }
            // Truncate long db.statement content for readability (handles JSON and non-JSON logs)
            fn truncate_db_statement_line(s: &mut String, max_len: usize) {
                // try JSON pattern: "db.statement":"..."
                if let Some(pos) = s.find("\"db.statement\"") {
                    if let Some(colon_pos) = s[pos..].find(':') {
                        let start = pos + colon_pos + 1;
                        // skip whitespace
                        let mut i = start;
                        while i < s.len() && s.as_bytes()[i].is_ascii_whitespace() {
                            i += 1;
                        }
                        if i < s.len() && &s[i..i + 1] == "\"" {
                            // string value starts at i+1
                            let mut j = i + 1;
                            let mut escaped = false;
                            while j < s.len() {
                                let ch = s.as_bytes()[j] as char;
                                if ch == '\\' && !escaped {
                                    escaped = true;
                                } else if ch == '"' && !escaped {
                                    break;
                                } else {
                                    escaped = false;
                                }
                                j += 1;
                            }
                            if j < s.len() && j > i + 1 {
                                let content_len = j - (i + 1);
                                if content_len > max_len {
                                    let end = i + 1 + max_len;
                                    let info =
                                        format!("... (truncated {} bytes)", content_len - max_len);
                                    s.replace_range(end..j, &info);
                                }
                            }
                        }
                    }
                }
                // fallback: plain text 'db.statement=' pattern
                if let Some(pos) = s.find("db.statement=") {
                    let start = pos + "db.statement=".len();
                    if start < s.len() {
                        let mut end = start;
                        while end < s.len() && s.as_bytes()[end] != b' ' {
                            end += 1;
                        }
                        if end - start > max_len {
                            let info = format!("... (truncated {} bytes)", end - start - max_len);
                            s.replace_range(start + max_len..end, &info);
                        }
                    }
                }
            }
            truncate_db_statement_line(&mut trimmed, 800);
            self.0.write_all(trimmed.as_bytes())?;
            Ok(buf.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            self.0.flush()
        }
    }

    if matches!(log_format.as_str(), "pretty" | "compact") {
        fmt::Subscriber::builder()
            .with_env_filter(env_filter)
            .with_target(true)
            .with_thread_ids(true)
            .with_level(true)
            .with_file(true)
            .with_line_number(true)
            .with_timer(SystemTime)
            .with_writer(|| SanitizingWriter(std::io::stdout()))
            .finish()
            .init();
    } else {
        fmt::Subscriber::builder()
            .with_env_filter(env_filter)
            .with_target(true)
            .with_thread_ids(true)
            .with_level(true)
            .with_file(true)
            .with_line_number(true)
            .with_timer(SystemTime)
            .with_writer(|| SanitizingWriter(std::io::stdout()))
            .finish()
            .init();
    }
}
