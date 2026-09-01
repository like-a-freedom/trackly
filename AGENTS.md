# AGENTS.md — Trackly Project Instructions

## Product Overview
Simple web application for storing GPS tracks and displaying them on a map with filters. Unauthenticated users can upload tracks, receive a permanent link, delete tracks within their session, and assign categories (hiking, walking, running, cycling). Track deduplication is required for 100% matches. Track details include: length, elevation profile, speed, heart rate, time (if available).

## Tech Stack
<EXTREMELY_IMPORTANT>
1. Strictly use bun for JavaScript/TypeScript runtime environment related instead of npm.
2. Always respond in language which the question was asked.
</EXTREMELY_IMPORTANT>
- Frontend: **Vue** (+ Leaflet / OpenStreetMap) 
- Backend: **Rust (Axum)**
- DB: **PostgreSQL + PostGIS**, SQLx migrations via **sqlx migrate**
- API: **REST**
- Containerization: **Docker** (no Kubernetes)

## Core Rules (must/never)
- Always respond in user's language.
- For JS/TS commands use **bun** (not npm).
- For Git questions, use **@terminal** prefix.
- Do not start frontend/backend/database (already running on: 81/8080/5432).
- Make minimal, surgical changes only - no unnecessary refactoring.
- Follow SOLID/DRY/KISS/YAGNI and 12-factor app methodology.
- Use environment variables for configuration.
- All DB schema changes must go through **sqlx migrate**.
- For dependency info, use **#context7**.
- Prefer ready-made libraries/solutions (see https://github.com/pka/awesome-georust).
- Ask user only about security, performance, or architectural trade-offs; resolve everything else autonomously.
- If user needs to do something (e.g., AWS/Supabase config), state it clearly.

## Architecture

### General Principles
- Follow SOLID, DRY, KISS, YAGNI and 12-factor app methodology
- Use well-structured monolithic architecture with modular services
- Keep services modular within the monolith to facilitate future refactoring if needed

### Frontend
- Use Vue.js for building the user interface
- Use Axios for making HTTP requests to the backend
- Use Leaflet for map rendering and geospatial data visualization
- Ensure the frontend is responsive and works well on different devices

### Backend
- Use Rust with Axum for building the RESTful API
- Use SQLx for database interactions
- Implement proper error handling and logging
- Ensure the backend is stateless and can scale horizontally
- Use Docker for containerization

### Database
- Use PostgreSQL with PostGIS for geospatial data storage
- Use SQLx for database migrations and interactions
- Ensure the database schema is well-defined and normalized
- Implement proper indexing for performance optimization

### Development Practices
- Use TDD (Test Driven Development) for writing tests before implementing features
- Write unit tests for both frontend and backend components
- Use integration tests to ensure the components work together as expected
- Use Git for version control, with clear commit messages and branching strategies
- Document the API endpoints using OpenAPI or Swagger

## Browser Automation & E2E Testing

### agent-browser (development / exploratory)
- Use `agent-browser` for dev-time exploration, debugging, and reproducing UI issues.
- Quick commands:
  - `agent-browser open <url>` — navigate to a page
  - `agent-browser snapshot -i --json` — interactive elements with refs (recommended for AI)
  - `agent-browser click @e1` / `agent-browser fill @e2 "text"` — interact using refs
  - `agent-browser screenshot [path]` — capture screenshots
- Best for: reproducing flows, finding stable refs/selectors, interactive debugging, and generating quick checks.

### Playwright (automated E2E / regressions / CI)
- Use **Playwright** for formal end-to-end tests, regression suites, and CI test runs.
- Tests live in `frontend/e2e`; run locally with project script:
  - `bun run test:e2e` — run full Playwright suite
  - `bun run test:e2e -- --grep "name"` — run filtered tests
- Workflow: reproduce flow with `agent-browser` → add stable selectors / `data-testid` → implement Playwright test → run locally and in CI.
- Best practices: prefer deterministic selectors (`data-testid`), use semantic locators, add `expect`/wait checks to avoid flakiness, keep tests focused and independent.

## Coding Standards

### Naming Conventions
- PascalCase: component names, interfaces, type aliases
- snake_case/camelCase: variables, functions, methods (depending on language conventions)
- _underscore prefix: private class members
- ALL_CAPS: constants
- Comments: English only

### Error Handling
- Use try/catch blocks for async operations
- Always log errors with contextual information
- Handle errors gracefully and return appropriate error messages
- Never expose sensitive data in error messages

### Code Quality
- Write minimal, necessary code only
- Minimize dependencies and coupling
- Keep abstractions simple and focused
- Write clear, self-documenting code
- No sweeping changes or unrelated edits
- Make code precise, modular, testable
- Don't break existing functionality
- Leave NO TODOs, placeholders, or missing pieces
- Ensure code is complete and fully implemented
- All code MUST be fully optimized: maximize algorithmic efficiency (big-O), follow style conventions, maximize code reuse (DRY), no technical debt
- Cover code with unit tests (TDD approach preferred)
- Run specific tests related to code changes

## Rust (Backend)

### Key Principles
- Write clear, concise, and idiomatic Rust code
- Use async programming with `tokio` for concurrency
- snake_case for variables/functions, PascalCase for types/structs
- Prefer Result and Option over unwrap() or panicking
- Use pattern matching and ? for error handling
- Favor immutability—use let before let mut
- Use clippy, rustfmt, and cargo check regularly
- Document public functions and modules with /// doc comments

### Async Programming
- Use `tokio` for async runtime and task management
- Implement async functions using `async fn` syntax
- Leverage `tokio::spawn` for task spawning
- Use `tokio::select!` for managing multiple async tasks and cancellations
- Favor structured concurrency with scoped tasks and clean cancellation paths

### Error Handling
- Embrace Result and Option types
- Use `?` operator to propagate errors in async functions
- Implement custom error types using `thiserror` or `anyhow`
- Handle errors and edge cases early

### Testing
- Write unit tests with `tokio::test` for async tests
- Use #[cfg(test)] and #[test] annotations
- Use test modules alongside the code they test (mod tests { ... })
- Use mockall, fake, or trait-based mocking for services
- Write integration tests in tests/ with descriptive filenames

### Security Rules
1. **Avoid Unsafe Code** - Do not use `unsafe` unless absolutely necessary
2. **Validate All External Input** - Validate type, length, and format before use
3. **Handle Errors Explicitly** - No unwrap() or expect() on values that may error
4. **Prevent Integer Overflows** - Use checked arithmetic
5. **Avoid Panics in Production** - Handle errors gracefully
6. **Do Not Expose Sensitive Data** - Never log secrets or credentials
7. **Use Strong Types** - Use newtype wrappers for sensitive data
8. **Limit Third-Party Crates** - Only use well-maintained and trusted crates
9. **Avoid Dynamic Code Execution** - No eval-like behavior with untrusted input
10. **Prefer Immutability** - Reduce risk of unintended side effects

### References
- [The Rust Book](https://doc.rust-lang.org/book/)
- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Tokio Documentation](https://docs.rs/tokio/latest/tokio/)
- [Axum Web Framework](https://docs.rs/axum/latest/axum/)

## SQL Security

All SQL code must follow these security rules:

1. **Always Use Parameterized Queries** - Never concatenate user input into SQL strings. Always use prepared statements with SQLx.
   ```rust
   // UNSAFE - Never do this
   let query = format!("SELECT * FROM users WHERE username = '{}'", username);
   
   // SAFE - Always do this
   sqlx::query!("SELECT * FROM users WHERE username = $1", username)
   ```

2. **Validate and Sanitize All Input** - Validate type, length, and format. Use allow-lists where possible.

3. **Avoid Dynamic SQL** - Do not build table or column names from user input. If unavoidable, strictly validate and allow-list all dynamic parts.

4. **Use Least Privilege Database Accounts** - Never use admin or superuser accounts for application queries.

5. **Do Not Expose Database Errors to Users** - Log errors securely and show generic error messages.

6. **Avoid Storing Sensitive Data in Plaintext** - Use strong, salted hashing for passwords and encryption for sensitive fields.

7. **Close Database Connections Properly** - Always close connections to avoid resource leaks.

## Vue (Frontend)

### TypeScript Guidelines
- Use TypeScript for all new code
- Follow functional programming principles where possible
- Use interfaces for data structures and type definitions
- Prefer immutable data (const, readonly)
- Use optional chaining (?.) and nullish coalescing (??) operators

### Component Guidelines
- Use functional components with composition API
- Keep components small and focused
- Use descriptive variable and function names
- Event handlers should be named with "handle" prefix (e.g., handleClick)
- Implement accessibility features (tabindex, aria-label, etc.)
- Use consts instead of functions where appropriate

### Code Implementation
- Use early returns whenever possible for readability
- Always use Tailwind classes for styling
- Write clear, self-documenting code
- Fully implement all requested functionality - no TODOs or placeholders
- Include all required imports
- Ensure code is complete and verified

## Documentation
- Before making changes, review specifications in `docs/`
- Do not break existing UI/UX
- Respect already implemented logic
- Study specifications before starting development
