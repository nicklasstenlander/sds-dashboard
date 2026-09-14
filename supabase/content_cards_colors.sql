alter table content_cards
  add column if not exists title_color        text,
  add column if not exists body_color         text,
  add column if not exists button_bg_color    text,
  add column if not exists button_text_color  text;
