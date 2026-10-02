-- GISVN vBulletin 4.1.7 source preflight.
-- Replace vb_ if TABLE_PREFIX differs.
-- Run against a READ-ONLY copy/account.

SELECT @@version AS mysql_version;
SELECT @@character_set_database AS character_set_database,
       @@collation_database AS collation_database,
       @@session.time_zone AS session_time_zone,
       @@global.time_zone AS global_time_zone;

SELECT 'user' AS entity, COUNT(*) AS total FROM vb_user
UNION ALL
SELECT 'usergroup', COUNT(*) FROM vb_usergroup
UNION ALL
SELECT 'forum', COUNT(*) FROM vb_forum
UNION ALL
SELECT 'thread', COUNT(*) FROM vb_thread
UNION ALL
SELECT 'post', COUNT(*) FROM vb_post
UNION ALL
SELECT 'attachment', COUNT(*) FROM vb_attachment
UNION ALL
SELECT 'pmtext', COUNT(*) FROM vb_pmtext
UNION ALL
SELECT 'userban', COUNT(*) FROM vb_userban;

-- Visibility/state distribution for reconciliation.
SELECT visible, COUNT(*) AS total
FROM vb_thread
GROUP BY visible
ORDER BY visible;

SELECT visible, COUNT(*) AS total
FROM vb_post
GROUP BY visible
ORDER BY visible;

-- Attachment storage indicators.
SELECT
  COUNT(*) AS attachments,
  SUM(CASE WHEN filedataid IS NOT NULL THEN 1 ELSE 0 END) AS with_filedataid
FROM vb_attachment;

-- Sample Vietnamese text for manual encoding verification.
SELECT userid, username, email
FROM vb_user
WHERE username REGEXP '[^ -~]'
ORDER BY userid
LIMIT 25;

SELECT threadid, title, dateline
FROM vb_thread
WHERE title REGEXP '[^ -~]'
ORDER BY threadid
LIMIT 25;
