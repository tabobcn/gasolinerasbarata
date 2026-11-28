-- Aplicada el 28-11-2026 (migración "opiniones_de_usuarios"). Tabla de opiniones de "Danos tu opinión" y la
-- función con la que la web las guarda. Nadie puede leerlas desde fuera: se ven en el panel de Supabase.
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 3 and 2000),
  contact text check (contact is null or char_length(contact) <= 200),
  app text not null default 'web' check (app in ('web', 'android')),
  version text check (version is null or char_length(version) <= 20),
  page text check (page is null or char_length(page) <= 200),
  read boolean not null default false
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;
-- (función submit_feedback: ver la migración aplicada en Supabase; inserta validando y con un límite de 200 al día)
