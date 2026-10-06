CREATE TABLE usage_visit (
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('account','anonymous')),
  actor_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  PRIMARY KEY(actor_kind,actor_hash,day)
);
CREATE INDEX usage_visit_day_idx ON usage_visit(day);
CREATE TABLE usage_directions (
  id TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('account','anonymous')),
  actor_hash TEXT NOT NULL,
  day TEXT NOT NULL,
  library_id TEXT NOT NULL,
  PRIMARY KEY(actor_kind,actor_hash,id)
);
CREATE INDEX usage_directions_day_idx ON usage_directions(day);
