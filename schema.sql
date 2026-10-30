-- PostgreSQL target schema for the B2B single-company demo.
-- The local FastAPI fallback uses the same field names in MemoryStore.

create table if not exists clients (
  id text primary key,
  name text not null,
  subtitle text not null default '',
  industry text not null default '服装设计',
  accent text not null default '#5B6BFF',
  created_at timestamptz not null default now()
);

create table if not exists projects (
  id text primary key,
  client_id text not null references clients(id),
  name text not null,
  brief text not null default '',
  status text not null default 'active',
  current_revision integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists materials (
  id text primary key,
  name text not null,
  category text not null,
  color text,
  texture_url text not null,
  source text not null,
  license text not null,
  verified boolean not null default false,
  tags_json jsonb not null default '[]'::jsonb
);

create table if not exists project_materials (
  project_id text not null references projects(id),
  material_id text not null references materials(id),
  primary key (project_id, material_id)
);

create table if not exists references_library (
  id text primary key,
  title text not null,
  source_url text not null,
  thumbnail_url text not null,
  license_status text not null default '待确认',
  purpose text not null default '参考'
);

create table if not exists workflow_templates (
  id text primary key,
  project_id text not null references projects(id),
  name text not null,
  source_repo text not null,
  source_license text not null,
  revision integer not null default 1,
  graph_json jsonb not null
);

create table if not exists workflow_runs (
  id text primary key,
  project_id text not null references projects(id),
  node_id text not null,
  status text not null,
  brief_revision integer not null default 0,
  prompt text not null default '',
  parameters_json jsonb not null default '{}'::jsonb,
  references_json jsonb not null default '[]'::jsonb,
  materials_json jsonb not null default '[]'::jsonb,
  provider text not null default 'openai-compatible',
  error_code text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table workflow_runs add column if not exists mode text not null default 'generate';
alter table workflow_runs add column if not exists source_artifact_id text;
alter table workflow_runs add column if not exists phase text;
alter table workflow_runs add column if not exists attempt integer not null default 1;
alter table workflow_runs add column if not exists idempotency_key text;

create table if not exists artifact_versions (
  id text primary key,
  project_id text not null references projects(id),
  node_id text not null,
  version integer not null,
  status text not null default 'published',
  object_key text not null,
  image_url text not null,
  prompt text not null default '',
  references_json jsonb not null default '[]'::jsonb,
  materials_json jsonb not null default '[]'::jsonb,
  parent_artifact_id text references artifact_versions(id),
  created_at timestamptz not null default now(),
  unique (project_id, node_id, version)
);

create table if not exists audit_events (
  id text primary key,
  project_id text references projects(id),
  type text not null,
  payload_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_client_idx on projects(client_id);
create index if not exists runs_project_idx on workflow_runs(project_id, created_at desc);
create unique index if not exists runs_idempotency_idx on workflow_runs(project_id, idempotency_key) where idempotency_key is not null;
create index if not exists artifacts_project_idx on artifact_versions(project_id, created_at desc);

