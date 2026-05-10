-- Data migration: remaining tables (no circular FK issues)
INSERT OR IGNORE INTO security (id, answer, user_id, question_id) VALUES
(1, 'Batman 2', 1, 1), (2, 'subway', 1, 2), (3, 'Mythical', 1, 12), (4, 'I dont do rizz', 1, 27), (5, 'A surreal topic but unsure on its content', 1, 24),
(81, 'foot', 18, 2), (82, 'none', 18, 3), (83, 'half blood prince', 18, 1), (84, 'system', 18, 7), (85, 'philosophy', 18, 21),
(86, 'sdff', 19, 7), (87, 'fds', 19, 9), (88, 'tyrht6', 19, 5), (89, 'fdsssd', 19, 4), (90, 'fd', 19, 20),
(91, 'A', 20, 10), (92, 'F', 20, 8), (93, 'C', 20, 20), (94, 'T', 20, 26), (95, 'Y', 20, 23),
(96, 'police', 21, 8), (97, 'walk away', 21, 10), (98, 'how to sleeop', 21, 22), (99, 'walk', 21, 2), (100, 'brew tea', 21, 25),
(101, 'wertyui', 22, 3), (102, 'sdfghjk,.', 22, 1), (103, 'sddfghjk', 22, 4), (104, 'fuck', 22, 7), (105, 'purrrr', 22, 5);

INSERT OR IGNORE INTO story (id, title, created_at, updated_at, description, user_id, tw_lim, genre, num_free, require_free) VALUES
(8, 'test', '2026-03-28 18:43:26.498', '2026-03-28 18:43:26.498', 'q', 18, 100000, 'philosophy', 0, 3),
(9, 'ghfd', '2026-03-28 18:49:06.587', '2026-03-29 08:58:42.987', 'dfg', 19, 100000, 'dystopian', 2, 3),
(12, 'firework', '2026-03-31 08:14:16.042', '2026-03-31 16:08:29.404', 'hello bakery', 21, 100000, 'tragedy', 4, 3);

INSERT OR IGNORE INTO subscription (id, status, start_date, end_date, payment_method, updated_at, created_at, plan_id, autorenew, mode, user_id, pre_col_lim, own_col_lim, own_wd_lim, refunded, payment_status) VALUES
(15, 'active', '2025-12-16 17:08:28.855', '2100-01-01 00:00:00.000', 'visa', '2025-12-16 17:08:28.855', '2025-12-16 17:08:28.855', 1, 0, 'forever', 1, 0, 1, 7123932, 0, 'completed'),
(25, 'active', '2026-03-28 17:46:15.892', '2100-01-01 00:00:00.000', 'visa', '2026-03-28 17:46:15.892', '2026-03-28 17:46:15.892', 1, 0, 'forever', 18, 0, 144, 100000, 0, 'completed'),
(26, 'active', '2026-03-28 18:48:38.783', '2100-01-01 00:00:00.000', 'visa', '2026-03-28 18:48:38.783', '2026-03-28 18:48:38.783', 1, 0, 'forever', 19, 0, 144, 100000, 0, 'completed'),
(27, 'active', '2026-03-29 10:19:54.178', '2100-01-01 00:00:00.000', 'visa', '2026-03-29 10:19:54.178', '2026-03-29 10:19:54.178', 1, 0, 'forever', 20, 0, 144, 100000, 0, 'completed'),
(28, 'active', '2026-03-30 09:20:41.674', '2100-01-01 00:00:00.000', 'visa', '2026-03-30 09:20:41.674', '2026-03-30 09:20:41.674', 1, 0, 'forever', 21, 0, 144, 100000, 0, 'completed'),
(29, 'active', '2026-04-09 20:14:22.038', '2100-01-01 00:00:00.000', 'visa', '2026-04-09 20:14:22.038', '2026-04-09 20:14:22.038', 1, 0, 'forever', 22, 0, 144, 100000, 0, 'completed');

INSERT OR IGNORE INTO writing (id, title, created_at, updated_at, text, story_id, live, word_count, free) VALUES
(14, 'sdf', '2026-03-29 07:56:47.423', '2026-03-29 07:58:11.737', 'fvds', 9, 0, 1, 1),
(15, 'hellow', '2026-03-29 08:58:42.984', '2026-03-29 08:59:20.195', 'kilo can be bad', 9, 0, 4, 1),
(19, 'test my mark', '2026-03-31 08:14:24.385', '2026-03-31 09:41:43.228', '# this is my job to write without confusion', 12, 0, 11, 1),
(20, 'dgf', '2026-03-31 15:53:25.444', '2026-03-31 15:53:25.444', 'ghd', 12, 0, 1, 1),
(21, 'gh', '2026-03-31 15:53:32.326', '2026-03-31 15:53:32.326', 'dfg', 12, 0, 1, 1),
(22, 'dfg', '2026-03-31 15:54:26.886', '2026-03-31 15:54:26.886', 'ae', 12, 0, 1, 1);

INSERT OR IGNORE INTO writing_view (id, writing_id, finger, updated, focused) VALUES
(12, 14, '19,21', '2026-03-31 03:57:11.086', 0),
(13, 15, '19,20,21', '2026-03-30 09:21:01.584', 0),
(17, 19, '21', '2026-03-31 08:49:50.333', 0),
(18, 22, '21', '2026-04-04 10:01:34.271', 0);
