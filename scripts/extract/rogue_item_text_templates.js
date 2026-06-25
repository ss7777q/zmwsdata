const { renderTemplate } = require('./lib/overrides');

function hasTemplateToken(value) {
  return typeof value === 'string' && /\{[^}]+\}/.test(value);
}

function formatTemplateWarning(warning) {
  if (!warning) return null;
  if (typeof warning === 'string') return warning;
  return warning.detail || warning.code || null;
}

function renderTextValue(value, context, label, warnings) {
  if (typeof value !== 'string') return value;
  if (!hasTemplateToken(value)) return value;
  const rendered = renderTemplate(value, context, label);
  warnings.push(...rendered.warnings.map(formatTemplateWarning).filter(Boolean));
  return rendered.text;
}

function renderTextArray(values, context, label, warnings) {
  if (!Array.isArray(values)) return values;
  return values.map((value, index) => renderTextValue(value, context, `${label}#${index + 1} `, warnings));
}

function stageContext(context, stageKey) {
  return {
    ...context,
    stage: context.stagesById?.[stageKey] || context.stagesByLevel?.[stageKey] || null,
  };
}

function renderStageMechanics(stageMechanics, context, label, warnings) {
  if (!stageMechanics || typeof stageMechanics !== 'object') return stageMechanics;
  const rendered = {};
  for (const [stageKey, values] of Object.entries(stageMechanics)) {
    rendered[stageKey] = renderTextArray(values, stageContext(context, stageKey), `${label}stage ${stageKey} `, warnings);
  }
  return rendered;
}

function renderRogueItemOverride(override, context, label = 'rogue item override') {
  if (!override) return null;
  const warnings = [];
  const rendered = { ...override };
  rendered.summary = renderTextValue(override.summary, context, `${label}summary `, warnings);
  rendered.mechanics = renderTextArray(override.mechanics, context, `${label}mechanics `, warnings);
  rendered.stageMechanics = renderStageMechanics(override.stageMechanics, context, `${label} `, warnings);
  rendered.templateWarnings = [...new Set(warnings)];
  return rendered;
}

module.exports = {
  renderRogueItemOverride,
};
