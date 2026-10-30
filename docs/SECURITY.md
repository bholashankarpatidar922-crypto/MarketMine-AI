# MarketMine AI — Security & Governance Architecture

## 1. Authentication & Authorization
- **Password Storage**: Passwords hashed using standard `bcrypt` via `passlib`.
- **Token Format**: Standard RFC 7519 JWT bearer tokens signed with HMAC-SHA256 (`HS256`).
- **Project Isolation**: Every database query verifies resource ownership against `Project.owner_id == user.id`. Cross-tenant data access is strictly rejected with HTTP 403 Forbidden.

## 2. SQL Lab Security & AST Validation
- **Read-Only Enforcement**: Query execution rejects all destructive keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `PRAGMA`, `ATTACH`, etc.).
- **Query Prefix**: All queries must strictly begin with `SELECT` or `WITH`.
- **Table Whitelist**: Table identifiers in `FROM` and `JOIN` clauses are validated against the user's project datasets.
- **Row Limits**: Queries without an explicit `LIMIT` automatically have `LIMIT 500` appended.
- **Audit Logging**: Every executed query is recorded in the `AuditLog` table with timestamp and user ID.

## 3. Untrusted File Upload Protection
- **File Validation**: MIME types and file extensions are strictly checked.
- **Hash Integrity**: MD5/SHA256 checksums are calculated upon upload to detect duplication.
- **No Remote Code Execution**: Uploaded files are strictly parsed as data tables (via `pandas`/`openpyxl`/`pyarrow`); macros, scripts, and executable formats are rejected.

## 4. Generative AI Privacy & Truthfulness
- **Zero Hallucination Principle**: LLMs are never used as computational calculators. Backend deterministic tools execute calculations (counts, sums, correlations, silhouette scores) and pass verified outputs to the LLM for summarization.
- **Secret Management**: API keys are injected via environment variables (`GEMINI_API_KEY`) and are never exposed to the frontend.
