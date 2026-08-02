-- ============================================
-- Recipe Fork – Sunday-first cooking plans
--
-- A plan now schedules the day a recipe is cooked. `planned_nights` records
-- how many meals that batch covers without creating dated leftover rows.
-- Weeks are stored Sunday-first (0 = Sunday … 6 = Saturday).
-- ============================================

ALTER TABLE meal_plan_recipes
  ADD COLUMN IF NOT EXISTS planned_nights smallint NOT NULL DEFAULT 1;

ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_planned_nights_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_planned_nights_check
  CHECK (planned_nights > 0 AND planned_nights <= 7);

COMMENT ON COLUMN meal_plan_recipes.planned_nights IS
  'Number of meals covered by one cook; only the cooking day is scheduled.';

-- Consolidate the old cook + dated leftover rows into the cook's multiplier.
-- Keep the legacy rows for rollback and compatibility with installed mobile
-- builds; the new clients hide them. Keep the existing cook servings because
-- the old clients already scaled that value for the whole batch.
UPDATE meal_plan_recipes AS cook
SET planned_nights = LEAST(7, GREATEST(
  cook.planned_nights,
  1 + (
    SELECT COUNT(*)::smallint
    FROM meal_plan_recipes AS extra
    WHERE extra.parent_id = cook.id
      AND extra.entry_type = 'batch'
  )
))
WHERE cook.entry_type = 'cook';

-- Existing clients formatted local Monday midnight through UTC. In the app's
-- Australian timezone that means the stored key is already the preceding
-- Sunday, so the keys stay in place. Make sure a following plan exists for
-- every old Sunday entry; those entries belong to the next Sunday-first week.
INSERT INTO meal_plans (user_id, week_start)
SELECT DISTINCT plan.user_id, plan.week_start + 7
FROM meal_plans AS plan
JOIN meal_plan_recipes AS entry ON entry.meal_plan_id = plan.id
WHERE entry.day_index = 6
ON CONFLICT (user_id, week_start) DO NOTHING;

CREATE TEMP TABLE meal_plan_sunday_moves (
  entry_id uuid PRIMARY KEY,
  target_plan_id uuid NOT NULL
) ON COMMIT DROP;

INSERT INTO meal_plan_sunday_moves (entry_id, target_plan_id)
SELECT entry.id, target.id
FROM meal_plan_recipes AS entry
JOIN meal_plans AS source ON source.id = entry.meal_plan_id
JOIN meal_plans AS target
  ON target.user_id = source.user_id
 AND target.week_start = source.week_start + 7
WHERE entry.day_index = 6;

-- Monday–Saturday shift one slot to the right under the new Sunday-first
-- indexing. Unplaced entries remain unplaced.
UPDATE meal_plan_recipes
SET day_index = day_index + 1
WHERE day_index BETWEEN 0 AND 5;

-- Move the snapshotted old Sundays to the following plan and make them the
-- first day. The snapshot keeps newly shifted Saturdays (now index 6) in place.
UPDATE meal_plan_recipes AS entry
SET meal_plan_id = move.target_plan_id,
    day_index = 0
FROM meal_plan_sunday_moves AS move
WHERE entry.id = move.entry_id;

COMMENT ON COLUMN meal_plans.week_start IS
  'Sunday that starts the plan week.';

COMMENT ON COLUMN meal_plan_recipes.day_index IS
  '0 = Sunday … 6 = Saturday; NULL means not assigned to a cooking day.';
