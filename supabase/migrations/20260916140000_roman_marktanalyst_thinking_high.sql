-- Marktanalyst: thinking_level high for deeper review filtering.

update leseno.roman_ki_rollen
set reasoning_effort = 'high',
    updated_at = now()
where key = 'marktanalyst';
