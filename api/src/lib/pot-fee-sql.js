// The fee of one cost-grid version as a scalar SQL expression: days × rate summed over its
// phases/tasks/roles. `alias` is the version's alias in the including query, always a literal
// written in the code, never an input. Internal aliases are prefixed `pf_` so they never collide
// with the including query's own.

function feeSql(alias, divisor) {
  return `COALESCE((
      SELECT SUM(pf_tr.days * COALESCE(
        pf_tr.rate_override,
        (SELECT pf_re.hourly_rate FROM ratecard_entries pf_re
         WHERE pf_re.ratecard_id = ${alias}.ratecard_id AND pf_re.role_id = pf_tr.role_id LIMIT 1),
        pf_ro.hourly_rate, 0))${divisor}
      FROM phases pf_ph
      JOIN tasks pf_tk ON pf_tk.phase_id = pf_ph.id
      JOIN task_roles pf_tr ON pf_tr.task_id = pf_tk.id
      JOIN roles pf_ro ON pf_ro.id = pf_tr.role_id
      WHERE pf_ph.version_id = ${alias}.id
    ), 0)`;
}

// Fee in EUR: the version's currency divided by its rate; a missing or zero rate counts as 1.
function feeEurSql(alias) {
  return feeSql(alias, `\n      / COALESCE(NULLIF(${alias}.currency_rate, 0), 1)`);
}

// Fee in the version's own currency.
function feeOriginalSql(alias) {
  return feeSql(alias, '');
}

// The reference version of every proposal, as the CTE `ref_v`: its non-Draft version that has
// projects (through either link), else its newest non-Draft one. Internal aliases are prefixed `rv`.
function referenceVersionsCte() {
  return `ref_v AS (
    SELECT DISTINCT ON (rv.cost_grid_id) rv.*
    FROM cost_grid_versions rv
    WHERE rv.pipeline <> 'Draft'
    ORDER BY rv.cost_grid_id,
             (EXISTS (SELECT 1 FROM cg_version_projects rv_c WHERE rv_c.cost_grid_version_id = rv.id)
              OR EXISTS (SELECT 1 FROM projects rv_p WHERE rv_p.cg_version_id = rv.id)) DESC,
             rv.created_at DESC
  )`;
}

// `ref_v` followed by the CTE `pot_v`: every reference version with its fee computed once, in its
// own currency (`fee_original`) and in EUR (`fee_eur`, a missing or zero rate counting as 1).
function potVersionsCte() {
  return `${referenceVersionsCte()},
  pot_v AS (
    SELECT ref_v.*, pf_fee.fee_original,
           pf_fee.fee_original / COALESCE(NULLIF(ref_v.currency_rate, 0), 1) AS fee_eur
    FROM ref_v
    CROSS JOIN LATERAL (SELECT ${feeSql('ref_v', '')} AS fee_original) pf_fee
  )`;
}

module.exports = { feeEurSql, feeOriginalSql, referenceVersionsCte, potVersionsCte };
