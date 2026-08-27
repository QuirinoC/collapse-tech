drop policy if exists "Popularity rollups are public"
  on public.popularity_rollups;

create policy "Popularity rollups are public"
  on public.popularity_rollups for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.people
      where people.id = popularity_rollups.person_id
        and people.is_published
    )
  );
