# Database change safety

Before changing the `content_writer` database schema or loading data in bulk, present the proposed change and wait for explicit user approval.

The preview must include:

- the table name and purpose;
- every column, type, default, and nullability rule;
- primary keys, foreign keys, unique constraints, checks, indexes, and triggers;
- what data will be inserted or backfilled and how many rows are expected;
- any destructive or irreversible effect.

This gate applies to `CREATE TABLE`, `ALTER TABLE`, indexes, triggers, and bulk inserts or backfills. Exploratory language such as “we may need to create” authorizes design only, not execution. Ordinary row-level reads and edits through existing application features do not require a schema preview.
