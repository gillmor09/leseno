-- Roman Recherche tab removed: drop orphaned KI roles.

delete from leseno.roman_ki_rollen
where key in ('recherche_coach', 'recherche_redakteur');
