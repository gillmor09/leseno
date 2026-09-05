-- Remove OTP/code lines from auth email templates (link-only).

update leseno.auth_email_templates
set
  html_body = regexp_replace(
    html_body,
    '<p[^>]*>\s*Oder Code eingeben:[\s\S]*?</p>\s*',
    '',
    'gi'
  ),
  updated_at = now()
where html_body ilike '%{{token}}%'
   or html_body ilike '%Oder Code eingeben%';

-- Also drop leftover bare {{token}} paragraphs if any.
update leseno.auth_email_templates
set
  html_body = regexp_replace(
    html_body,
    '<p[^>]*>[^<]*\{\{token\}\}[^<]*</p>\s*',
    '',
    'gi'
  ),
  updated_at = now()
where html_body like '%{{token}}%';
