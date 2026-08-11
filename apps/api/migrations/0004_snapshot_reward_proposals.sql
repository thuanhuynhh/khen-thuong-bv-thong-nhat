ALTER TABLE reward_rules ADD COLUMN evaluation_year INTEGER;
ALTER TABLE reward_rules ADD COLUMN snapshot_updated_at TEXT;

UPDATE reward_rules
SET evaluation_year = CAST(strftime('%Y', created_at) AS INTEGER)
WHERE evaluation_year IS NULL;

CREATE TABLE proposal_members (
  proposal_id TEXT NOT NULL REFERENCES reward_rules(id) ON DELETE CASCADE,
  employee_id TEXT REFERENCES employees(id) ON DELETE SET NULL,
  citizen_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (proposal_id, citizen_id)
);

CREATE INDEX idx_proposal_members_proposal ON proposal_members(proposal_id, full_name);

-- Freeze the currently displayed result for proposals created before snapshot support.
WITH level_ranks(type, level, rank) AS (
  VALUES
    ('RESEARCH','CO_SO',1), ('RESEARCH','TRUONG_DAI_HOC',2), ('RESEARCH','THANH_PHO',3), ('RESEARCH','BO',4), ('RESEARCH','NHA_NUOC',5),
    ('TASK_COMPLETION','KHONG_HOAN_THANH',1), ('TASK_COMPLETION','HOAN_THANH',2), ('TASK_COMPLETION','HOAN_THANH_TOT',3), ('TASK_COMPLETION','HOAN_THANH_XUAT_SAC',4),
    ('EMULATION','CO_SO',1), ('EMULATION','THANH_PHO',2), ('EMULATION','BO',3), ('EMULATION','TOAN_QUOC',4),
    ('CERTIFICATE','THANH_PHO',1), ('CERTIFICATE','BO',2), ('CERTIFICATE','THU_TUONG',3),
    ('MEDAL','HANG_BA',1), ('MEDAL','HANG_HAI',2), ('MEDAL','HANG_NHAT',3)
), condition_results AS (
  SELECT
    r.id AS proposal_id,
    e.id AS employee_id,
    e.citizen_id,
    e.full_name,
    e.unit,
    g.key AS group_index,
    COALESCE(json_extract(r.conditions_json, '$.operator'), 'AND') AS rule_operator,
    COALESCE(json_extract(g.value, '$.operator'), 'AND') AS group_operator,
    CASE WHEN (
      SELECT COUNT(*)
      FROM achievements a
      WHERE a.employee_id = e.id
        AND a.type = json_extract(condition.value, '$.type')
        AND (
          (
            (COALESCE(json_extract(r.conditions_json, '$.exactLevel'), 0) = 1 OR json_extract(condition.value, '$.level') = 'KHAC')
            AND a.level = json_extract(condition.value, '$.level')
          )
          OR (
            COALESCE(json_extract(r.conditions_json, '$.exactLevel'), 0) = 0
            AND json_extract(condition.value, '$.level') <> 'KHAC'
            AND EXISTS (
              SELECT 1
              FROM level_ranks required_level
              JOIN level_ranks actual_level ON actual_level.type = required_level.type
              WHERE required_level.type = a.type
                AND required_level.level = json_extract(condition.value, '$.level')
                AND actual_level.level = a.level
                AND actual_level.rank >= required_level.rank
            )
          )
        )
        AND a.year <= r.evaluation_year
        AND (
          COALESCE(json_extract(condition.value, '$.withinYears'), 0) = 0
          OR a.year >= r.evaluation_year - COALESCE(json_extract(condition.value, '$.withinYears'), 0) + 1
        )
    ) >= COALESCE(json_extract(condition.value, '$.quantity'), 1) THEN 1 ELSE 0 END AS condition_met
  FROM reward_rules r
  JOIN employees e ON e.active = 1
  JOIN json_each(r.conditions_json, '$.groups') AS g
  JOIN json_each(g.value, '$.conditions') AS condition
  WHERE r.active = 1 AND r.evaluation_year IS NOT NULL
), group_results AS (
  SELECT
    proposal_id, employee_id, citizen_id, full_name, unit, group_index, rule_operator,
    CASE group_operator WHEN 'OR' THEN MAX(condition_met) ELSE MIN(condition_met) END AS group_met
  FROM condition_results
  GROUP BY proposal_id, employee_id, citizen_id, full_name, unit, group_index, rule_operator, group_operator
), proposal_results AS (
  SELECT
    proposal_id, employee_id, citizen_id, full_name, unit,
    CASE rule_operator WHEN 'OR' THEN MAX(group_met) ELSE MIN(group_met) END AS proposal_met
  FROM group_results
  GROUP BY proposal_id, employee_id, citizen_id, full_name, unit, rule_operator
)
INSERT INTO proposal_members (proposal_id, employee_id, citizen_id, full_name, unit)
SELECT proposal_id, employee_id, citizen_id, full_name, unit
FROM proposal_results
WHERE proposal_met = 1;

UPDATE reward_rules
SET snapshot_updated_at = datetime('now')
WHERE snapshot_updated_at IS NULL;
