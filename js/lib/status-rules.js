export function getStatusRule(pipeline) {
  const allOpts = ['Not started yet', 'Started At Risk', 'Started', 'Put on hold', 'Completed'];
  const rules = {
    'SIP':         { options: [],   disabled: true },
    'Expected':    { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Anticipated': { options: ['Not started yet', 'Started At Risk', 'Put on hold', 'Completed'], disabled: false },
    'Committed':   { options: ['Started', 'Started At Risk', 'Put on hold', 'Completed'],          disabled: false },
    'Canceled':    { options: null,  disabled: true },
  };
  return rules[pipeline] || { options: allOpts, disabled: false };
}

window.getStatusRule = getStatusRule;
