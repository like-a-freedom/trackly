# Extract auth cookie helpers to eliminate 5x duplication

The auth handler builds cookies identically in 5 places (login, refresh, logout, logout-all, delete-account). Each site repeats the same `.http_only(true).secure(true).same_site(Strict)` chain. We extract `set_auth_cookies(headers, access, refresh, config)` and `clear_auth_cookies(headers)` as private helpers.
