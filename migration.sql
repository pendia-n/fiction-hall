-- Migration: MySQL → D1 for Nocative
-- Generated from /tmp/anecdote_dump.sql

-- story_label (was _collection_labels: A=label_id, B=story_id)
INSERT OR IGNORE INTO story_label (story_id, label_id) VALUES (12, 38);

-- writing_label (was _note_labels: A=label_id, B=writing_id)
INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (14, 34);
INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (15, 35);
INSERT OR IGNORE INTO writing_label (writing_id, label_id) VALUES (21, 37);

-- label
INSERT OR IGNORE INTO label (id, name) VALUES (38, 'back-to-roman-empire');
INSERT OR IGNORE INTO label (id, name) VALUES (35, 'fdddf');
INSERT OR IGNORE INTO label (id, name) VALUES (36, 'ffdddd');
INSERT OR IGNORE INTO label (id, name) VALUES (37, 'fg');
INSERT OR IGNORE INTO label (id, name) VALUES (34, 'sdf');

-- plan
INSERT OR IGNORE INTO plan (id, name, price, pre_col_lim, pre_col_up, own_col_lim, own_col_up, own_wd_lim, own_wd_up) VALUES
(1, 'Freemium', 0, 0, 4, 144, 999999999, 100000, 999999999),
(2, 'Basic', 12.99, 0, 2, 3, 2, 20000, 2),
(3, 'Standard', 29.99, 0, 2, 8, 2, 50000, 2),
(4, 'Exclusive', 69.99, 0, 2, NULL, 0, 125000, 2);

-- question
INSERT OR IGNORE INTO question (id, question) VALUES
(1, 'Which one film that you will watch at least once a year?'),
(2, 'What transport do you take mostly?'),
(3, 'What kind of wedding cake you like it to be?'),
(4, 'Whose songs you love to indulge into when you are bored?'),
(5, 'Whose songs you love to indulge into when you are sad?'),
(6, 'Whose songs you love to indulge into when you are delighted?'),
(7, 'Why this job?'),
(8, 'What childhood dream that you discarded?'),
(9, 'How would you like the world to be?'),
(10, 'Should you meet your role model, what will do you then?'),
(11, 'Most brilliant actor or actress in your opinion is?'),
(12, 'Favorite genre of films?'),
(13, 'What history you would like to change?'),
(14, 'Pop vs R&B vs Country vs Classical?'),
(15, 'Linux vs Mac vs Windows?'),
(16, 'What are your mbti and horoscope type?'),
(17, 'Any motto or quote from you or from others that you find aspirational?'),
(18, 'Particular meaning of your given name?'),
(19, 'Do you think advancing into workplace without college is great?'),
(20, 'Nickname of your close friend and why?'),
(21, 'Best subject at school being?'),
(22, 'If you have a trendy youtube channel, what content will be your focus?'),
(23, 'Do you like Young Sheldon or Sheldon from BBT?'),
(24, 'If you have a painting as a gift, what content will that be?'),
(25, 'Any habit you will like to develop?'),
(26, 'Coffee vs Tea vs Fruit Juice?'),
(27, 'Show me your best rizz?'),
(28, 'What languages do you know?'),
(29, 'Are you religious?'),
(30, 'Rocket Sport vs Contact Sport?');

-- user
INSERT OR IGNORE INTO user (id, display, username, introduction, password, created_at, updated_at, totp_secret, totp_enabled, subscription_id, contact, contact_on, last_view_fiction, crypto_address, admin) VALUES
(1, 'anecdote', 'adminnono', 'admin', '$2a$10$oqBxNIQTMSF6BJUgVvmGKOQ0bfVrpFgRQgw8HhlqSxFZyj1XlPBpa', '2025-07-05 17:42:30.474', '2025-12-19 05:18:30.037', NULL, 0, 15, 'pendia-community@protonmail.com', 1, '2,4,3,1', '5RC4tAHPgMXPMwoffUCjQ4ZaJbNfPz7Ky64BvSyjfHXJ', 1),
(18, 'fff', 'asdasd', '', '$2a$10$5DuYvfTqoizuTsFty.X6iulvp17DAALClAkS4kJbY/d713A/b6hUK', '2026-03-28 17:45:26.126', '2026-03-28 17:46:15.895', NULL, 0, 25, NULL, 0, NULL, NULL, 0),
(19, 'gdf', 'gfff', '', '$2a$10$50t7hyZ//IX6GLowP6H9d.2Kde7BHbPmDrmJRksOS5VYXI7LYB0rm', '2026-03-28 18:47:53.290', '2026-03-29 08:59:21.351', NULL, 0, 26, NULL, 0, '14,15', NULL, 0),
(20, 'gdfr', 'eee', '', '$2a$10$Mw9hmPsrlAGPJD3irWROdOU6646pIBEF1jZz3k2CYcy5ecwfmhxFK', '2026-03-29 10:19:19.374', '2026-03-29 11:18:27.780', NULL, 0, 27, NULL, 0, '15', NULL, 0),
(21, 'thisisit', 'tisisiht', '', '$2a$10$xLN0DbDJZiRr3Dy3/G4QRuS3s2FDDrpPxN9NjMHObGqiYGgrKks0e', '2026-03-30 09:20:04.492', '2026-04-04 10:01:34.948', NULL, 0, 28, NULL, 0, '16,17,18,14,15,19,22', NULL, 0),
(22, 'umeshaaaa', 'Umeshtiffin', '', '$2a$10$.kWu.vcNIMconR09UoZGsesM6oHOMfGYmDFoeR4Ariv4ZHH19WJU2', '2026-04-09 20:13:00.219', '2026-04-09 20:14:22.040', 'MJEEQ2ZZMJHCUOTSJFCXWY3MPBST42DM', 1, 29, NULL, 0, NULL, NULL, 0);

-- security
INSERT OR IGNORE INTO security (id, answer, user_id, question_id) VALUES
(1, 'Batman 2', 1, 1), (2, 'subway', 1, 2), (3, 'Mythical', 1, 12), (4, 'I dont do rizz', 1, 27), (5, 'A surreal topic but unsure on its content', 1, 24),
(81, 'foot', 18, 2), (82, 'none', 18, 3), (83, 'half blood prince', 18, 1), (84, 'system', 18, 7), (85, 'philosophy', 18, 21),
(86, 'sdff', 19, 7), (87, 'fds', 19, 9), (88, 'tyrht6', 19, 5), (89, 'fdsssd', 19, 4), (90, 'fd', 19, 20),
(91, 'A', 20, 10), (92, 'F', 20, 8), (93, 'C', 20, 20), (94, 'T', 20, 26), (95, 'Y', 20, 23),
(96, 'police', 21, 8), (97, 'walk away', 21, 10), (98, 'how to sleeop', 21, 22), (99, 'walk', 21, 2), (100, 'brew tea', 21, 25),
(101, 'wertyui', 22, 3), (102, 'sdfghjk,.', 22, 1), (103, 'sddfghjk', 22, 4), (104, 'fuck', 22, 7), (105, 'purrrr', 22, 5);

-- story
INSERT OR IGNORE INTO story (id, title, created_at, updated_at, description, user_id, tw_lim, genre, num_free, require_free) VALUES
(8, 'test', '2026-03-28 18:43:26.498', '2026-03-28 18:43:26.498', 'q', 18, 100000, 'philosophy', 0, 3),
(9, 'ghfd', '2026-03-28 18:49:06.587', '2026-03-29 08:58:42.987', 'dfg', 19, 100000, 'dystopian', 2, 3),
(12, 'firework', '2026-03-31 08:14:16.042', '2026-03-31 16:08:29.404', 'hello bakery', 21, 100000, 'tragedy', 4, 3);

-- subscription
INSERT OR IGNORE INTO subscription (id, status, start_date, end_date, payment_method, updated_at, created_at, plan_id, autorenew, mode, user_id, pre_col_lim, own_col_lim, own_wd_lim, refunded, payment_status) VALUES
(15, 'active', '2025-12-16 17:08:28.855', '2100-01-01 00:00:00.000', 'crypto', '2025-12-16 17:08:28.855', '2025-12-16 17:08:28.855', 1, 0, 'forever', 1, 0, 1, 7123932, 0, 'completed'),
(25, 'active', '2026-03-28 17:46:15.892', '2100-01-01 00:00:00.000', 'crypto', '2026-03-28 17:46:15.892', '2026-03-28 17:46:15.892', 1, 0, 'forever', 18, 0, 144, 100000, 0, 'completed'),
(26, 'active', '2026-03-28 18:48:38.783', '2100-01-01 00:00:00.000', 'crypto', '2026-03-28 18:48:38.783', '2026-03-28 18:48:38.783', 1, 0, 'forever', 19, 0, 144, 100000, 0, 'completed'),
(27, 'active', '2026-03-29 10:19:54.178', '2100-01-01 00:00:00.000', 'crypto', '2026-03-29 10:19:54.178', '2026-03-29 10:19:54.178', 1, 0, 'forever', 20, 0, 144, 100000, 0, 'completed'),
(28, 'active', '2026-03-30 09:20:41.674', '2100-01-01 00:00:00.000', 'crypto', '2026-03-30 09:20:41.674', '2026-03-30 09:20:41.674', 1, 0, 'forever', 21, 0, 144, 100000, 0, 'completed'),
(29, 'active', '2026-04-09 20:14:22.038', '2100-01-01 00:00:00.000', 'crypto', '2026-04-09 20:14:22.038', '2026-04-09 20:14:22.038', 1, 0, 'forever', 22, 0, 144, 100000, 0, 'completed');

-- writing
INSERT OR IGNORE INTO writing (id, title, created_at, updated_at, text, story_id, live, word_count, free) VALUES
(14, 'sdf', '2026-03-29 07:56:47.423', '2026-03-29 07:58:11.737', 'fvds', 9, 0, 1, 1),
(15, 'hellow', '2026-03-29 08:58:42.984', '2026-03-29 08:59:20.195', 'kilo can be bad', 9, 0, 4, 1),
(19, 'test my mark', '2026-03-31 08:14:24.385', '2026-03-31 09:41:43.228', '# this is my job\nto write without confusion\n\n## how\n\n## why\n\n## what', 12, 0, 11, 1),
(20, 'dgf', '2026-03-31 15:53:25.444', '2026-03-31 15:53:25.444', 'ghd', 12, 0, 1, 1),
(21, 'gh', '2026-03-31 15:53:32.326', '2026-03-31 15:53:32.326', 'dfg', 12, 0, 1, 1),
(22, 'dfg', '2026-03-31 15:54:26.886', '2026-03-31 15:54:26.886', 'ae', 12, 0, 1, 1);

-- writing_view
INSERT OR IGNORE INTO writing_view (id, writing_id, finger, updated, focused) VALUES
(12, 14, '19,21', '2026-03-31 03:57:11.086', 0),
(13, 15, '19,20,21', '2026-03-30 09:21:01.584', 0),
(17, 19, '21', '2026-03-31 08:49:50.333', 0),
(18, 22, '21', '2026-04-04 10:01:34.271', 0);
