CREATE TABLE institution (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT institution_code CHECK(id IN ('public','uwa','curtin','ecu','murdoch')),
  name TEXT NOT NULL
);
CREATE TABLE suburb (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  source_url TEXT,
  checked_on TEXT,
  is_fixture INTEGER NOT NULL DEFAULT 0 CONSTRAINT suburb_fixture_boolean CHECK(is_fixture IN (0,1)),
  CONSTRAINT suburb_coordinates CHECK(latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180),
  CONSTRAINT suburb_real_source CHECK(is_fixture = 1 OR (source_url IS NOT NULL AND source_url LIKE 'https://%' AND checked_on IS NOT NULL))
);
CREATE TABLE library (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  institution_id TEXT NOT NULL REFERENCES institution(id),
  is_fixture INTEGER NOT NULL DEFAULT 0 CONSTRAINT library_fixture_boolean CHECK(is_fixture IN (0,1))
);
CREATE INDEX library_institution_idx ON library(institution_id);
CREATE TABLE library_revision (
  id TEXT PRIMARY KEY NOT NULL,
  library_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'draft' CONSTRAINT revision_status CHECK(status IN ('draft','published','archived')),
  content TEXT NOT NULL CONSTRAINT revision_content_json CHECK(json_valid(content) AND json_type(content) = 'object'),
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  CONSTRAINT revision_publication_date CHECK(status != 'published' OR published_at IS NOT NULL)
);
CREATE INDEX revision_library_status_idx ON library_revision(library_id, status, created_at);
CREATE UNIQUE INDEX one_published_revision ON library_revision(library_id) WHERE status = 'published';
-- Edits create another snapshot. Changing its publication state does not change its facts.
CREATE TRIGGER immutable_revision_content BEFORE UPDATE OF content, library_id, created_at ON library_revision
BEGIN
  SELECT RAISE(ABORT, 'Library snapshots are immutable; create a draft instead');
END;
CREATE TABLE user_preferences (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  suburb_id TEXT REFERENCES suburb(id) ON DELETE SET NULL
);
CREATE TABLE user_card (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL REFERENCES institution(id),
  PRIMARY KEY(user_id, institution_id),
  CONSTRAINT university_card_only CHECK(institution_id != 'public')
);
CREATE TABLE favourite (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  library_id TEXT NOT NULL REFERENCES library(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, library_id)
);
CREATE INDEX favourite_library_idx ON favourite(library_id);
CREATE TABLE user_role (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'user' CONSTRAINT user_role_value CHECK(role IN ('user','admin'))
);
INSERT INTO institution (id, name) VALUES
  ('public', 'Public libraries'), ('uwa', 'University of Western Australia'),
  ('curtin', 'Curtin University'), ('ecu', 'Edith Cowan University'), ('murdoch', 'Murdoch University');
