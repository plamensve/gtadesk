-- Apply when merging the delivery read-only feature into main.
-- Existing deliveries remain unlocked by default.
alter table public.gta_deliveries add column if not exists is_locked boolean not null default false;

-- Guard locked records against changes from any client, not just this UI.
create or replace function public.gta_deliveries_guard_locked()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.is_locked then raise exception 'Delivery is locked (read-only)'; end if;
    return old;
  end if;
  if old.is_locked then
    if new.is_locked = false and (to_jsonb(new) - 'is_locked') = (to_jsonb(old) - 'is_locked') then
      return new;
    end if;
    raise exception 'Delivery is locked (read-only): unlock it before editing';
  end if;
  return new;
end;
$$;

drop trigger if exists gta_deliveries_lock_guard on public.gta_deliveries;
create trigger gta_deliveries_lock_guard before update or delete on public.gta_deliveries
for each row execute function public.gta_deliveries_guard_locked();
