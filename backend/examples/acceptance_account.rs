//! Create a disposable local acceptance account, or delete only an account with the acceptance prefix.
use backend::{
    auth::{OAuthUser, create_refresh_token},
    db,
};
use std::{error::Error, fs, sync::Arc};
#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let args: Vec<String> = std::env::args().collect();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../.env");
    dotenvy::from_path(root).ok();
    let url = std::env::var("DATABASE_URL")?.replace("@db:", "@127.0.0.1:");
    let pool = Arc::new(sqlx::PgPool::connect(&url).await?);
    if args.get(1).map(String::as_str) == Some("cleanup") {
        let ids: Vec<uuid::Uuid> =
            sqlx::query_scalar("SELECT user_id FROM users WHERE google_sub LIKE 'acceptance-%'")
                .fetch_all(&*pool)
                .await?;
        for id in &ids {
            db::delete_user_account(&pool, *id).await?;
        }
        println!("Removed {} disposable acceptance accounts", ids.len());
    } else if args.get(1).map(String::as_str) == Some("delete") {
        let id = uuid::Uuid::parse_str(args.get(2).ok_or("Missing fixture ID")?)?;
        if let Some(user) = db::get_user_by_id(&pool, id).await? {
            if !user.google_sub.starts_with("acceptance-") {
                return Err("Not an acceptance fixture".into());
            }
            db::delete_user_account(&pool, id).await?;
        }
    } else {
        let identity = format!("acceptance-{}", uuid::Uuid::new_v4());
        let (user, _) = db::upsert_user(
            &pool,
            &OAuthUser {
                google_sub: identity.clone(),
                email: format!("{identity}@example.invalid"),
                email_verified: true,
                name: Some("Acceptance user".into()),
                given_name: None,
                family_name: None,
                picture: None,
            },
        )
        .await?;
        let (token, _) = create_refresh_token(&pool, user.id, None).await?;
        let target = args.get(1).ok_or("Missing private output path")?;
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(target)?;
        file.write_all(
            serde_json::to_string(&serde_json::json!({"id":user.id,"refresh":token}))?.as_bytes(),
        )?;
    }
    Ok(())
}
