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

module.exports = { feeEurSql, feeOriginalSql };
