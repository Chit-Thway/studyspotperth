-- D1 runs migrations in a transaction. Defer parent-table foreign keys while
-- replacing the institution constraint, preserving libraries and user cards.
PRAGMA defer_foreign_keys = ON;
CREATE TABLE institution_expanded (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT institution_code CHECK(id IN ('public','uwa','curtin','ecu','murdoch','notre-dame')),
  name TEXT NOT NULL
);
INSERT INTO institution_expanded(id,name) SELECT id,name FROM institution;
INSERT INTO institution_expanded(id,name) VALUES ('notre-dame','University of Notre Dame Australia');
DROP TABLE institution;
ALTER TABLE institution_expanded RENAME TO institution;
PRAGMA defer_foreign_keys = OFF;
