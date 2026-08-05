-- ---------------------------------------------------------------------------
-- Demo data for the onsite testing team.
--
-- Idempotent: it deletes anything it previously created (by name) and rebuilds.
-- Safe to re-run. Not intended for production — real masterdata replaces this.
--
-- Grading priority convention, decided here and enforced everywhere else:
--   HIGHER PRIORITY = WORSE.
-- recalc_activity_grading() takes `order by g.priority desc limit 1`, so an
-- inspection with one Critical reading and nine Good ones is Critical. That is
-- the only useful direction for a safety checklist: the worst finding is the
-- headline. If the numbers are ever reversed in real data, the fix is the one
-- `desc` in that function, not this file.
-- ---------------------------------------------------------------------------

begin;

-- Clear the grading-test fixtures and any previous demo run. Order matters:
-- children before parents.
delete from public.inspection_value;
delete from public.inspection_activity;
delete from public.incident;
delete from public.inspection_allocation;
delete from public.inspection_dropdown_option;
delete from public.inspection_rule;
delete from public.inspection;
delete from public.asset;
delete from public.incident_type;
delete from public.asset_type;
delete from public.location;
delete from public.grading;

-- ------------------------------------------------------------------ gradings
insert into public.grading (name, priority) values
  ('Good', 1),
  ('Monitor', 2),
  ('Attention', 3),
  ('Critical', 4);

-- ----------------------------------------------------------------- locations
insert into public.location (name) values
  ('Northside Reservoir'),
  ('Central Pump Station'),
  ('Riverside Treatment Works'),
  ('Eastfield Booster Station');

-- --------------------------------------------------------------- asset types
insert into public.asset_type (name) values
  ('Pump'),
  ('Pressure Valve'),
  ('Storage Tank'),
  ('Flow Meter');

-- ------------------------------------------------------------ incident types
insert into public.incident_type (name) values
  ('Leak'),
  ('Pump failure'),
  ('Electrical fault'),
  ('Blocked access'),
  ('Vandalism'),
  ('Chemical spill');

-- -------------------------------------------------------------------- assets
insert into public.asset (name, code, asset_type_id, location_id, purchase_date)
select v.name, v.code, t.id, l.id, v.purchased
from (values
  ('Intake Pump 1',        'PMP-001', 'Pump',           'Central Pump Station',      date '2019-04-12'),
  ('Intake Pump 2',        'PMP-002', 'Pump',           'Central Pump Station',      date '2019-04-12'),
  ('Booster Pump A',       'PMP-101', 'Pump',           'Eastfield Booster Station', date '2021-08-30'),
  ('Backwash Pump',        'PMP-201', 'Pump',           'Riverside Treatment Works', date '2017-02-01'),
  ('Main Isolation Valve', 'VLV-001', 'Pressure Valve', 'Central Pump Station',      date '2019-04-12'),
  ('Reservoir Outlet Valve','VLV-010','Pressure Valve', 'Northside Reservoir',       date '2015-11-05'),
  ('Reservoir Tank North', 'TNK-001', 'Storage Tank',   'Northside Reservoir',       date '2012-06-20'),
  ('Clearwell Tank',       'TNK-002', 'Storage Tank',   'Riverside Treatment Works', date '2014-09-15'),
  ('Inlet Flow Meter',     'FLM-001', 'Flow Meter',     'Riverside Treatment Works', date '2020-03-02'),
  ('Outlet Flow Meter',    'FLM-002', 'Flow Meter',     'Northside Reservoir',       date '2020-03-02')
) as v(name, code, type_name, location_name, purchased)
join public.asset_type t on t.name = v.type_name
join public.location  l on l.name = v.location_name;

-- --------------------------------------------------------------- inspections
insert into public.inspection (name, description, value_type, is_required) values
  ('Discharge pressure', 'Read the discharge gauge with the pump running. Bar.', 'decimal_value', true),
  ('Unusual noise or vibration', 'Stand beside the housing for ten seconds.', 'yes_no', true),
  ('Oil level', 'Check the sight glass.', 'drop_down', true),
  ('Casing leak', 'Any water escaping the casing or seals.', 'yes_no', true),
  ('Valve fully operable', 'Open and close through full travel.', 'yes_no', true),
  ('Visible corrosion', 'Inspect body and flanges.', 'drop_down', true),
  ('Water level', 'Percentage of capacity.', 'decimal_value', true),
  ('Lid or hatch secure', 'Confirm the hatch is closed and locked.', 'yes_no', true),
  ('Debris in tank', 'Anything floating or settled that should not be there.', 'yes_no', true),
  ('Meter reading', 'Cumulative total from the display. Cubic metres.', 'cumulative_value', true),
  ('Display legible', 'Screen readable, no cracks or condensation.', 'yes_no', true),
  ('General comments', 'Anything else worth recording.', 'text', false);

-- --------------------------------------------------------------- allocations
insert into public.inspection_allocation (asset_type_id, inspection_id, from_asset_type, priority)
select t.id, i.id, true, v.priority
from (values
  ('Pump',           'Discharge pressure',          0),
  ('Pump',           'Unusual noise or vibration',  1),
  ('Pump',           'Oil level',                   2),
  ('Pump',           'Casing leak',                 3),
  ('Pump',           'General comments',            4),
  ('Pressure Valve', 'Valve fully operable',        0),
  ('Pressure Valve', 'Visible corrosion',           1),
  ('Pressure Valve', 'General comments',            2),
  ('Storage Tank',   'Water level',                 0),
  ('Storage Tank',   'Lid or hatch secure',         1),
  ('Storage Tank',   'Debris in tank',              2),
  ('Storage Tank',   'General comments',            3),
  ('Flow Meter',     'Meter reading',               0),
  ('Flow Meter',     'Display legible',             1),
  ('Flow Meter',     'General comments',            2)
) as v(type_name, inspection_name, priority)
join public.asset_type t on t.name = v.type_name
join public.inspection i on i.name = v.inspection_name;

-- ------------------------------------------------ yes/no answers and grades
-- A yes_no inspection stores its two possible answers as dropdown options with
-- boolean_match set. resolve_grading() matches the recorded boolean against
-- boolean_match, which is why "Yes" can be good on one question and critical on
-- another.
insert into public.inspection_dropdown_option (inspection_id, name, priority, boolean_match, grading_id)
select i.id, v.name, v.priority, v.match, g.id
from (values
  ('Unusual noise or vibration', 'Yes', 0, true,  'Attention'),
  ('Unusual noise or vibration', 'No',  1, false, 'Good'),
  ('Casing leak',                'Yes', 0, true,  'Critical'),
  ('Casing leak',                'No',  1, false, 'Good'),
  ('Valve fully operable',       'Yes', 0, true,  'Good'),
  ('Valve fully operable',       'No',  1, false, 'Critical'),
  ('Lid or hatch secure',        'Yes', 0, true,  'Good'),
  ('Lid or hatch secure',        'No',  1, false, 'Attention'),
  ('Debris in tank',             'Yes', 0, true,  'Attention'),
  ('Debris in tank',             'No',  1, false, 'Good'),
  ('Display legible',            'Yes', 0, true,  'Good'),
  ('Display legible',            'No',  1, false, 'Monitor')
) as v(inspection_name, name, priority, match, grading_name)
join public.inspection i on i.name = v.inspection_name
join public.grading    g on g.name = v.grading_name;

-- ------------------------------------------------------ dropdown answers
insert into public.inspection_dropdown_option (inspection_id, name, priority, grading_id)
select i.id, v.name, v.priority, g.id
from (values
  ('Oil level',        'Full',    0, 'Good'),
  ('Oil level',        'Low',     1, 'Monitor'),
  ('Oil level',        'Empty',   2, 'Critical'),
  ('Visible corrosion','None',    0, 'Good'),
  ('Visible corrosion','Surface', 1, 'Monitor'),
  ('Visible corrosion','Severe',  2, 'Critical')
) as v(inspection_name, name, priority, grading_name)
join public.inspection i on i.name = v.inspection_name
join public.grading    g on g.name = v.grading_name;

-- ------------------------------------------------------------ numeric bands
-- Half-open [lower, upper). The GiST exclusion constraint rejects overlap, so
-- these must tile without gaps in the ranges that matter.
insert into public.inspection_rule (inspection_id, lower_limit, upper_limit, grading_id)
select i.id, v.lo, v.hi, g.id
from (values
  ('Discharge pressure', 0,   2,    'Critical'),
  ('Discharge pressure', 2,   4,    'Attention'),
  ('Discharge pressure', 4,   8,    'Good'),
  ('Discharge pressure', 8,   10,   'Attention'),
  ('Discharge pressure', 10,  100,  'Critical'),
  ('Water level',        0,   20,   'Critical'),
  ('Water level',        20,  40,   'Attention'),
  ('Water level',        40,  90,   'Good'),
  ('Water level',        90,  100,  'Monitor'),
  ('Water level',        100, 1000, 'Attention')
) as v(inspection_name, lo, hi, grading_name)
join public.inspection i on i.name = v.inspection_name
join public.grading    g on g.name = v.grading_name;

commit;
