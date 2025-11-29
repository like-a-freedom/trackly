use sqlx::PgPool;

/// Record API usage for elevation service
pub async fn record_api_usage(
    pool: &PgPool,
    service_name: &str,
    api_calls: u32,
) -> Result<(), sqlx::Error> {
    let today = chrono::Utc::now().date_naive();

    sqlx::query(
        r#"
        INSERT INTO elevation_api_usage (date, service_name, api_calls_count)
        VALUES ($1, $2, $3)
        ON CONFLICT (date, service_name)
        DO UPDATE SET api_calls_count = elevation_api_usage.api_calls_count + $3
        "#,
    )
    .bind(today)
    .bind(service_name)
    .bind(api_calls as i32)
    .execute(pool)
    .await?;

    Ok(())
}

/// Get today's API usage for a service
pub async fn get_today_api_usage(pool: &PgPool, service_name: &str) -> Result<i32, sqlx::Error> {
    let today = chrono::Utc::now().date_naive();

    let result = sqlx::query_scalar(
        r#"
        SELECT COALESCE(api_calls_count, 0)
        FROM elevation_api_usage
        WHERE date = $1 AND service_name = $2
        "#,
    )
    .bind(today)
    .bind(service_name)
    .fetch_optional(pool)
    .await?;

    Ok(result.unwrap_or(0))
}

/// Check if daily API limit is exceeded
pub async fn is_daily_limit_exceeded(
    pool: &PgPool,
    service_name: &str,
    daily_limit: u32,
) -> Result<bool, sqlx::Error> {
    let usage = get_today_api_usage(pool, service_name).await?;
    Ok(usage >= daily_limit as i32)
}

/// Get API usage statistics for the last N days
pub async fn get_api_usage_stats(
    pool: &PgPool,
    service_name: &str,
    days: i32,
) -> Result<Vec<(chrono::NaiveDate, i32)>, sqlx::Error> {
    let result = sqlx::query_as(
        r#"
        SELECT date, api_calls_count
        FROM elevation_api_usage
        WHERE service_name = $1 AND date >= CURRENT_DATE - INTERVAL '1 day' * $2
        ORDER BY date DESC
        "#,
    )
    .bind(service_name)
    .bind(days)
    .fetch_all(pool)
    .await?;

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore] // Requires database setup
    async fn test_track_api_usage_tracking() {
        // This test would verify API usage tracking functionality:
        // - record_api_usage
        // - get_today_api_usage
        // - is_daily_limit_exceeded
        // - get_api_usage_stats
        // Requires test database setup and transaction rollback
    }
}
