import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Initial PostgreSQL schema for the state that today lives in data/runtime/*.json.
 * Additive only (CREATE … IF NOT EXISTS); run with `pnpm --filter @lex/api db:migrate`
 * against a database you chose — never automatically (migrationsRun: false, synchronize: false).
 *
 * Design:
 * - Ownership columns (citizen_id, professional_id) are real columns, so every query can filter on them.
 * - Lifecycle columns that need constraints are columns; the rest of the record stays in `data` (jsonb).
 * - Secrets are stored only as SHA-256 hashes; no plaintext token column exists.
 * - audit_events is append-only: a trigger rejects UPDATE and DELETE.
 * - One submission per application, one receipt per submission, idempotency keys unique per scope.
 * - `version` columns support optimistic locking; transitions use compare-and-set UPDATEs.
 */
export class LexiInitialSchema1763712000000 implements MigrationInterface {
  name = "LexiInitialSchema1763712000000";

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS cases (
        id uuid PRIMARY KEY,
        user_id varchar(128),
        channel varchar(16) NOT NULL CHECK (channel IN ('web','bot')),
        status varchar(16) NOT NULL,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS cases_user_idx ON cases (user_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY,
        citizen_id varchar(64),
        case_id uuid REFERENCES cases(id),
        data jsonb NOT NULL,
        version integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS conversations_citizen_idx ON conversations (citizen_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS conversation_secrets (
        hash char(64) PRIMARY KEY,
        conversation_id uuid NOT NULL REFERENCES conversations(id),
        kind varchar(8) NOT NULL CHECK (kind IN ('token','handoff')),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        revoked_at timestamptz
      )`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id uuid PRIMARY KEY,
        case_id uuid NOT NULL REFERENCES cases(id),
        citizen_id varchar(64) NOT NULL,
        kind varchar(16) NOT NULL CHECK (kind IN ('PRIMARY','ESCALATION')),
        state varchar(16) NOT NULL CHECK (state IN ('DRAFT','CONSENTED','SIGNED','SUBMITTED')),
        parent_submission_id uuid,
        consent_at timestamptz,
        signed_at timestamptz,
        signed_pdf_sha256 char(64),
        submission_id uuid UNIQUE,
        version integer NOT NULL DEFAULT 0,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        CHECK (state <> 'SIGNED' OR (consent_at IS NOT NULL AND signed_at IS NOT NULL)),
        CHECK (state <> 'SUBMITTED' OR submission_id IS NOT NULL),
        UNIQUE (id, citizen_id)
      )`);
    // UNIQUE (id, citizen_id) is the target of composite FKs: a child row's citizen must be the application's.
    await q.query(`CREATE INDEX IF NOT EXISTS applications_citizen_idx ON applications (citizen_id)`);
    // At most one open primary draft per case and citizen.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS applications_open_primary_uq
        ON applications (case_id, citizen_id) WHERE kind = 'PRIMARY' AND submission_id IS NULL`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS application_documents (
        id uuid PRIMARY KEY,
        application_id uuid NOT NULL,
        citizen_id varchar(64) NOT NULL,
        checklist_item varchar(200),
        file_name varchar(120) NOT NULL,
        content_type varchar(32) NOT NULL CHECK (content_type IN ('application/pdf','image/png','image/jpeg')),
        size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
        sha256 char(64) NOT NULL,
        uploaded_at timestamptz NOT NULL,
        FOREIGN KEY (application_id, citizen_id) REFERENCES applications (id, citizen_id)
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS application_documents_app_idx ON application_documents (application_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS agency_submissions (
        id uuid PRIMARY KEY,
        application_id uuid NOT NULL UNIQUE REFERENCES applications(id),
        case_id uuid NOT NULL REFERENCES cases(id),
        agency_id varchar(64) NOT NULL,
        adapter_type varchar(16) NOT NULL CHECK (adapter_type IN ('MOCK','OFFICIAL')),
        status varchar(16) NOT NULL CHECK (status IN ('SUBMITTED','RECEIVED','IN_REVIEW','ANSWERED','OVERDUE','ESCALATED')),
        receipt_id varchar(64) NOT NULL UNIQUE,
        connector_idempotency_key varchar(128) NOT NULL UNIQUE,
        version integer NOT NULL DEFAULT 0,
        data jsonb NOT NULL,
        submitted_at timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS agency_submissions_agency_idx ON agency_submissions (agency_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key_hash char(64) PRIMARY KEY,
        citizen_id varchar(64) NOT NULL,
        application_id uuid NOT NULL,
        submission_id uuid REFERENCES agency_submissions(id),
        created_at timestamptz NOT NULL,
        FOREIGN KEY (application_id, citizen_id) REFERENCES applications (id, citizen_id)
      )`);

    // applications <-> agency_submissions reference each other: add these FKs once both tables exist.
    await q.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_submission_fk') THEN
          ALTER TABLE applications ADD CONSTRAINT applications_submission_fk
            FOREIGN KEY (submission_id) REFERENCES agency_submissions(id) DEFERRABLE INITIALLY DEFERRED;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'applications_parent_submission_fk') THEN
          ALTER TABLE applications ADD CONSTRAINT applications_parent_submission_fk
            FOREIGN KEY (parent_submission_id) REFERENCES agency_submissions(id);
        END IF;
      END $$`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        seq bigint PRIMARY KEY,
        id uuid NOT NULL UNIQUE,
        at timestamptz NOT NULL,
        type varchar(40) NOT NULL,
        actor_type varchar(16) NOT NULL CHECK (actor_type IN ('citizen','agency','professional','system')),
        actor_id varchar(64),
        application_id uuid,
        submission_id uuid,
        case_id uuid,
        data jsonb NOT NULL,
        prev_hash char(64) NOT NULL,
        hash char(64) NOT NULL UNIQUE
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS audit_events_app_idx ON audit_events (application_id)`);
    await q.query(`
      CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'audit_events is append-only';
      END $$`);
    // Recreate only our own triggers (no data is touched).
    await q.query(`DROP TRIGGER IF EXISTS audit_events_no_change ON audit_events`);
    await q.query(`
      CREATE TRIGGER audit_events_no_change BEFORE UPDATE OR DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION audit_events_append_only()`);
    await q.query(`DROP TRIGGER IF EXISTS audit_events_no_truncate ON audit_events`);
    await q.query(`
      CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON audit_events
        FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only()`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS consultations (
        id uuid PRIMARY KEY,
        citizen_id varchar(64) NOT NULL,
        professional_id varchar(64) NOT NULL,
        case_id uuid REFERENCES cases(id),
        status varchar(16) NOT NULL CHECK (status IN ('REQUESTED','ACCEPTED','DECLINED','CANCELLED','COMPLETED')),
        version integer NOT NULL DEFAULT 0,
        data jsonb NOT NULL,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS consultations_citizen_idx ON consultations (citizen_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS consultations_professional_idx ON consultations (professional_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS oneid_sessions (
        token_hash char(64) PRIMARY KEY,
        citizen_id varchar(64) NOT NULL,
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        last_seen_at timestamptz NOT NULL,
        revoked_at timestamptz
      )`);
  }

  /** Irreversible by policy: dropping tables would destroy data. Restore from a backup instead. */
  async down(): Promise<void> {
    throw new Error("LexiInitialSchema is irreversible (no destructive down migration); restore from backup");
  }
}
