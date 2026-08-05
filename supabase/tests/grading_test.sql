-- Grading test suite -- docs/specs/04-grading.md §6
--
-- Run against a database with slices 0-4 applied:
--   psql "$DATABASE_URL" -f supabase/tests/grading_test.sql
--
-- Expect: every `result` column reads PASS, and the four blocks marked
-- "must be REJECTED" each raise the named constraint error.
--
-- Idempotent: the preamble clears its own fixtures, so it can be re-run
-- freely. (It does NOT run inside a transaction, because several cases
-- deliberately trigger constraint violations, which would abort one.)

\set ON_ERROR_STOP off
\pset pager off
\pset format aligned

-- Preamble: clear fixtures from any previous run ---------------------------
delete from public.inspection_rule
 where inspection_id in ('b0000000-0000-0000-0000-000000000001',
                         'b0000000-0000-0000-0000-000000000002',
                         'b0000000-0000-0000-0000-000000000003');
delete from public.inspection_dropdown_option
 where inspection_id in ('b0000000-0000-0000-0000-000000000001',
                         'b0000000-0000-0000-0000-000000000002',
                         'b0000000-0000-0000-0000-000000000003');
delete from public.inspection
 where id in ('b0000000-0000-0000-0000-000000000001',
              'b0000000-0000-0000-0000-000000000002',
              'b0000000-0000-0000-0000-000000000003');
delete from public.grading
 where id in ('a0000000-0000-0000-0000-000000000001',
              'a0000000-0000-0000-0000-000000000002',
              'a0000000-0000-0000-0000-000000000003');
-- Fixtures -------------------------------------------------------------------
insert into public.grading (id, name, priority) values
  ('a0000000-0000-0000-0000-000000000001','Good', 1),
  ('a0000000-0000-0000-0000-000000000002','Warn', 2),
  ('a0000000-0000-0000-0000-000000000003','Bad',  3);

insert into public.inspection (id, name, value_type) values
  ('b0000000-0000-0000-0000-000000000001','Pressure',  'decimal_value'),
  ('b0000000-0000-0000-0000-000000000002','Condition', 'drop_down');

-- Contiguous half-open bands: [0,10) Good, [10,20) Warn, [20,30) Bad
insert into public.inspection_rule (inspection_id, grading_id, lower_limit, upper_limit) values
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001', 0, 10),
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002',10, 20),
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003',20, 30);

insert into public.inspection_dropdown_option (id, inspection_id, grading_id, name) values
  ('c0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000003','Cracked'),
  ('c0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Intact');
-- an option belonging to a DIFFERENT inspection
insert into public.inspection_dropdown_option (id, inspection_id, grading_id, name) values
  ('c0000000-0000-0000-0000-000000000009','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003','Foreign');

\echo ''
\echo '########## BOUNDARY TESTS  band [10,20) = Warn ##########'
select v as value,
       coalesce((select name from public.grading g
                 where g.id = public.resolve_grading(
                   'b0000000-0000-0000-0000-000000000001','decimal_value', v, null)), '(none)') as grading,
       expected,
       case when coalesce((select name from public.grading g
              where g.id = public.resolve_grading(
                'b0000000-0000-0000-0000-000000000001','decimal_value', v, null)), '(none)') = expected
            then 'PASS' else '*** FAIL ***' end as result
from (values
  (-0.0001::numeric,'(none)'),
  (0,      'Good'),
  (9.9999, 'Good'),
  (10.0000,'Warn'),
  (15,     'Warn'),
  (19.9999,'Warn'),
  (20.0000,'Bad'),
  (29.9999,'Bad'),
  (30.0000,'(none)'),
  (999,    '(none)')
) t(v, expected);

\echo ''
\echo '########## NULL decimal value ##########'
select coalesce(public.resolve_grading('b0000000-0000-0000-0000-000000000001','decimal_value', null, null)::text,'NULL') as r,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000001','decimal_value', null, null) is null
            then 'PASS' else '*** FAIL ***' end;

\echo ''
\echo '########## DROP_DOWN ##########'
select 'valid option (Cracked)' as case,
       (select name from public.grading where id = public.resolve_grading(
          'b0000000-0000-0000-0000-000000000002','drop_down',null,'c0000000-0000-0000-0000-000000000001')) as grading,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000002','drop_down',null,'c0000000-0000-0000-0000-000000000001')
                 = 'a0000000-0000-0000-0000-000000000003' then 'PASS' else '*** FAIL ***' end as result
union all
select 'null option',
       null,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000002','drop_down',null,null) is null
            then 'PASS' else '*** FAIL ***' end
union all
select 'option from another inspection',
       null,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000002','drop_down',null,'c0000000-0000-0000-0000-000000000009') is null
            then 'PASS' else '*** FAIL ***' end;

\echo ''
\echo '########## UNGRADED VALUE TYPES (reproducing Mendix) ##########'
select vt as value_type,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000001', vt::public.inspection_value_type, 15, null) is null
            then 'PASS (null)' else '*** FAIL ***' end as result
from (values ('cumulative_value'),('datetime'),('yes_no'),('text')) t(vt);

\echo ''
\echo '########## EXCLUSION CONSTRAINT: overlapping band must be REJECTED ##########'
insert into public.inspection_rule (inspection_id, grading_id, lower_limit, upper_limit)
values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000002', 5, 15);

\echo ''
\echo '########## adjacent band [30,40) must be ACCEPTED ##########'
insert into public.inspection_rule (inspection_id, grading_id, lower_limit, upper_limit)
values ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000003', 30, 40);
select 'rules for Pressure: ' || count(*) from public.inspection_rule
 where inspection_id='b0000000-0000-0000-0000-000000000001';

\echo ''
\echo '########## same band on a DIFFERENT inspection must be ACCEPTED ##########'
insert into public.inspection_rule (inspection_id, grading_id, lower_limit, upper_limit)
values ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001', 0, 10);
select 'accepted' as result;

\echo ''
\echo '########## lower > upper must be REJECTED ##########'
insert into public.inspection_rule (inspection_id, grading_id, lower_limit, upper_limit)
values ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001', 100, 50);

\echo ''
\echo '########## ACTIVITY ROLLUP: worst (highest priority) wins ##########'
with vals(grading_id) as (values
  ('a0000000-0000-0000-0000-000000000001'::uuid),
  ('a0000000-0000-0000-0000-000000000003'::uuid),
  ('a0000000-0000-0000-0000-000000000002'::uuid))
select (select name from public.grading where id =
        (select v.grading_id from vals v
          join public.grading g on g.id = v.grading_id
         order by g.priority desc limit 1)) as rollup,
       case when (select g.name from vals v join public.grading g on g.id=v.grading_id
                  order by g.priority desc limit 1) = 'Bad'
            then 'PASS' else '*** FAIL ***' end as result;

\echo ''
\echo '########## YES/NO GRADING (addition, spec Decision C) ##########'
-- Before any boolean_match options are configured: must be null (old behaviour)
select 'unconfigured yes_no (true)' as case,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000002','yes_no',null,null,true) is null
            then 'PASS (null, matches Mendix)' else '*** FAIL ***' end as result
union all
select 'unconfigured yes_no (false)',
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000002','yes_no',null,null,false) is null
            then 'PASS (null, matches Mendix)' else '*** FAIL ***' end;

-- Now configure: valve intact -> Good, not intact -> Bad
insert into public.inspection (id, name, value_type) values
  ('b0000000-0000-0000-0000-000000000003','Valve intact?', 'yes_no');
insert into public.inspection_dropdown_option (inspection_id, grading_id, name, boolean_match) values
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Yes', true),
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','No',  false);

select v::text as boolean_value,
       coalesce((select name from public.grading g where g.id =
          public.resolve_grading('b0000000-0000-0000-0000-000000000003','yes_no',null,null,v)),'(none)') as grading,
       expected,
       case when coalesce((select name from public.grading g where g.id =
              public.resolve_grading('b0000000-0000-0000-0000-000000000003','yes_no',null,null,v)),'(none)') = expected
            then 'PASS' else '*** FAIL ***' end as result
from (values (true,'Good'),(false,'Bad')) t(v,expected);

select 'null boolean' as case,
       case when public.resolve_grading('b0000000-0000-0000-0000-000000000003','yes_no',null,null,null) is null
            then 'PASS' else '*** FAIL ***' end as result;

\echo ''
\echo '########## inactive option must not resolve ##########'
update public.inspection_dropdown_option set active=false
 where inspection_id='b0000000-0000-0000-0000-000000000003' and boolean_match=false;
select case when public.resolve_grading('b0000000-0000-0000-0000-000000000003','yes_no',null,null,false) is null
            then 'PASS (inactive ignored)' else '*** FAIL ***' end as result;

\echo ''
\echo '########## duplicate boolean_match must be REJECTED ##########'
insert into public.inspection_dropdown_option (inspection_id, grading_id, name, boolean_match)
values ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000002','Yes again', true);
