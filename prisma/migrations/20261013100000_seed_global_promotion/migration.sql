-- Ensure promotion routes do not fail when a new environment has no global record.
-- Preserve an existing operator-managed record; this only inserts the safe initial configuration.
INSERT INTO "PromotionConfig" ("id", "name", "startAt", "endAt", "active", "updatedAt", "createdAt")
VALUES ('global', 'Launch Promotion', CURRENT_TIMESTAMP, '2027-12-31 23:59:59.999', TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
