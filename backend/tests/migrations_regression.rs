use std::fs;
use std::path::PathBuf;

fn load_migrations() -> Vec<(String, String)> {
    let migrations_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("migrations");
    let mut migrations: Vec<(String, String)> = fs::read_dir(&migrations_dir)
        .expect("migrations directory must exist")
        .filter_map(|entry| entry.ok())
        .map(|entry| {
            let path = entry.path();
            let file_name = path
                .file_name()
                .and_then(|name| name.to_str())
                .expect("migration file name must be valid unicode")
                .to_owned();
            let content = fs::read_to_string(&path)
                .unwrap_or_else(|err| panic!("failed to read {file_name}: {err}"));
            (file_name, content)
        })
        .collect();

    migrations.sort_by(|left, right| left.0.cmp(&right.0));
    migrations
}

fn creates_users_table(sql: &str) -> bool {
    sql.contains("create table users") || sql.contains("create table if not exists users")
}

fn touches_users_table(sql: &str) -> bool {
    [
        "alter table users",
        "update users",
        "insert into users",
        "delete from users",
        "comment on table users",
        "comment on column users.",
        "create index idx_users",
        "create unique index idx_users",
        "drop trigger if exists set_users_updated_at on users",
        "create trigger set_users_updated_at",
    ]
    .iter()
    .any(|fragment| sql.contains(fragment))
}

fn guards_missing_users_table(sql: &str) -> bool {
    sql.contains("alter table if exists users")
        || sql.contains("to_regclass('public.users')")
        || sql.contains("to_regclass('users')")
        || sql.contains("information_schema.tables")
}

#[test]
fn migrations_do_not_assume_users_table_before_it_exists() {
    let migrations = load_migrations();
    let mut users_table_known_to_exist = false;

    for (file_name, content) in migrations {
        let normalized = content.to_lowercase();
        let creates_users = creates_users_table(&normalized);
        let touches_users = touches_users_table(&normalized);
        let guards_missing_users = guards_missing_users_table(&normalized);

        assert!(
            users_table_known_to_exist || creates_users || !touches_users || guards_missing_users,
            "migration {file_name} touches users before it is created or guarded against absence"
        );

        if creates_users {
            users_table_known_to_exist = true;
        }
    }
}
