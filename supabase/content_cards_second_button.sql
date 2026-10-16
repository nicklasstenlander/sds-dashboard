-- Andra knappen på nyhetskort.
-- Knapp 1 är de befintliga link_url / link_label / button_*_color-kolumnerna,
-- så gamla kort fortsätter fungera utan migrering. Knapp 2 är helt valfri:
-- är link_url_2 null renderas bara en knapp, precis som förut.
alter table content_cards
  add column if not exists link_url_2          text,
  add column if not exists link_label_2        text,
  add column if not exists button_bg_color_2   text,
  add column if not exists button_text_color_2 text;
