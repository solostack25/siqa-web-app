-- Supabase security advisor: "Function Search Path Mutable".
-- Pin search_path so these functions can't be hijacked by objects in
-- another schema. No behavior change.
alter function public.squash_repeats(text) set search_path = public, pg_temp;
alter function public.normalize_for_filter(text) set search_path = public, pg_temp;
alter function public.chai_post_visible(public.chai_posts) set search_path = public, pg_temp;
alter function public.chai_touch_updated_at() set search_path = public, pg_temp;
alter function public.chai_comments_guard() set search_path = public, pg_temp;
alter function public.org_category(text) set search_path = public, pg_temp;
