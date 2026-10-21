// One-line customer definitions for judgment answers. The same text reaches the
// widget and the voice question contract. Definitions describe what a customer
// sees on site; they never carry prices, factors or internal keys.
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value || {}, key);

export const ANSWER_DEFINITION_STARTING_TEXT = Object.freeze({
  access: {
    easy: 'Clear, level path for workers and equipment right up to the work area.',
    moderate: 'Some obstacles on the way, such as a narrow gate, steps or a longer carry.',
    difficult: 'Hard to reach: tight or blocked paths, many steps, or materials carried a long way by hand.'
  },
  slope: {
    flat: 'Level ground you can walk and push a wheelbarrow across without effort.',
    moderate: 'A noticeable slope you can walk comfortably, but a wheelbarrow takes some effort.',
    steep: 'A slope that is hard to walk up or stand on comfortably.'
  },
  debris: {
    light: 'Scattered leaves, twigs and small litter.',
    moderate: 'Leaf piles, fallen branches or several bags of yard waste.',
    heavy: 'Deep leaf cover, large branches, brush piles or overgrowth throughout.'
  },
  grass: {
    maintained: 'Mowed regularly; the grass is at a normal mowing height.',
    overgrown: 'A few mowings missed; the grass is clearly long and may be clumping.',
    severe: 'Not mowed in a long time; tall, thick grass or weeds hide the ground.'
  },
  surface: {
    good: 'Clean and sound, with no peeling, cracks or patching needed.',
    fair: 'Some small cracks, nail holes, scuffs or light peeling that need touch-up.',
    poor: 'Widespread peeling, cracking, stains or damage that needs repair before painting.'
  },
  wall: {
    standard: 'A typical room height you can paint from a short step ladder.',
    high: 'Taller than a typical room; a tall ladder is needed to reach the top.',
    vaulted: 'A sloped or cathedral ceiling, or a two-storey space such as a foyer.'
  },
  pitch: {
    low: 'Nearly flat or gently sloped; easy to walk on.',
    medium: 'A typical house roof slope you can walk on with care.',
    steep: 'Too steep to walk on comfortably; roofers need safety gear.',
    very_steep: 'Very steep, close to a wall in places, such as a mansard or A-frame roof.'
  },
  complexity: {
    simple: 'A gable roof.',
    moderate: 'A hip roof or several valleys.',
    complex: 'Dormers or turrets.'
  },
  plant: {
    small: 'Perennials, groundcover or small shrubs in small nursery pots.',
    medium: 'Shrubs or small evergreens in larger nursery pots.',
    large: 'Trees or large shrubs, sold balled or in very large containers.'
  }
});

const UNSAFE = /[0-9$€£¢¥%×_]/;
export const ANSWER_DEFINITION_LIMIT = 160;
// Unsafe or malformed owner text never reaches customers; saves reject it.
const safeOwnerText = text => typeof text === 'string' && !/[\r\n]/.test(text) && text.trim().length <= ANSWER_DEFINITION_LIMIT && !UNSAFE.test(text) ? text.trim() : '';

const FIELD_SETS = Object.freeze({
  accessDifficulty: 'access', demolitionAccessDifficulty: 'access',
  terrainSlope: 'slope', slope: 'slope',
  debrisLevel: 'debris', grassCondition: 'grass',
  surfaceCondition: 'surface', ceilingSurfaceCondition: 'surface', trimSurfaceCondition: 'surface',
  wallHeight: 'wall', pitch: 'pitch', roofComplexity: 'complexity', plantsBySize: 'plant'
});
const CHOICE_LABELS = Object.freeze({ very_steep: 'Very steep' });
const choiceLabel = value => CHOICE_LABELS[value] || value[0].toUpperCase() + value.slice(1).replaceAll('_', ' ');
const BAND_KEYS = [['standard', 'standardMaxFeet'], ['high', 'highMaxFeet'], ['vaulted', 'vaultedMaxFeet']];
const feet = value => String(value) + ' ft';

function fieldChoices(name, field) {
  const set = FIELD_SETS[name];
  if (!set) return null;
  const values = name === 'plantsBySize' ? (field.values || Object.keys(ANSWER_DEFINITION_STARTING_TEXT.plant)) : field.values;
  const starting = ANSWER_DEFINITION_STARTING_TEXT[set];
  if (!Array.isArray(values) || values.length !== Object.keys(starting).length || values.some(value => !own(starting, value))) return null;
  return { set, values };
}
// Already-defined choices keep their own definitions: owner plant sizes and
// labelled roof shapes. Feet-band wall height is defined from the bands.
function ownerEditable(name, field) {
  const choices = fieldChoices(name, field);
  if (!choices) return null;
  if (name === 'plantsBySize' && field.options) return null;
  if (name === 'roofComplexity' && field.optionLabels) return null;
  return choices;
}

export function answerDefinitionFieldsVNext(fields = {}, pricing = {}) {
  return Object.entries(fields).flatMap(([name, field]) => {
    const choices = ownerEditable(name, field);
    if (!choices || name === 'wallHeight' && pricing.paintingSettings?.heightBands) return [];
    return [{ name, label: field.label, choices: choices.values.map(value => ({ value, label: choiceLabel(value), startingDefinition: ANSWER_DEFINITION_STARTING_TEXT[choices.set][value] })) }];
  });
}

export function applyAnswerDefinitionsVNext(contract, pricing = {}, rules = {}) {
  const owner = record(rules.answerDefinitions) ? rules.answerDefinitions : {};
  const fields = { ...contract.fields };
  for (const [name, field] of Object.entries(fields)) {
    const choices = ownerEditable(name, field);
    if (!choices) continue;
    const bands = name === 'wallHeight' ? pricing.paintingSettings?.heightBands : null;
    const definitions = {};
    BAND_KEYS.forEach(([value, key], index) => {
      if (bands && choices.values.includes(value)) definitions[value] = { label: choiceLabel(value), definition: (index ? 'over ' + feet(bands[BAND_KEYS[index - 1][1]]) + ' ' : '') + 'up to ' + feet(bands[key]) };
    });
    if (!bands) for (const value of choices.values) {
      const text = safeOwnerText(owner[name]?.[value]);
      definitions[value] = { label: choiceLabel(value), definition: text || ANSWER_DEFINITION_STARTING_TEXT[choices.set][value] };
    }
    fields[name] = { ...field, optionDefinitions: definitions };
  }
  return { ...contract, fields };
}

export function answerDefinitionIssuesVNext(rules = {}, fields = {}, pricing = {}) {
  if (!own(rules, 'answerDefinitions')) return [];
  const saved = rules.answerDefinitions;
  if (!record(saved)) return ['Answer descriptions must be saved as one line per choice.'];
  if (fields === null) return Object.values(saved).some(lines => !record(lines) || Object.values(lines).some(text => typeof text !== 'string' || text.trim() && !safeOwnerText(text))) ? ['Answer descriptions must be one line of text per choice, without numbers, prices, percentages or codes.'] : [];
  const editable = new Map(answerDefinitionFieldsVNext(fields, pricing).map(field => [field.name, field]));
  const issues = [];
  for (const [name, lines] of Object.entries(saved)) {
    const field = editable.get(name);
    if (!field || !record(lines)) { issues.push('Remove answer descriptions for a question this service does not ask.'); continue; }
    for (const [value, text] of Object.entries(lines)) {
      const choice = field.choices.find(item => item.value === value);
      if (!choice) { issues.push(`Remove the answer description for a choice that ${field.label} does not offer.`); continue; }
      const where = `${field.label}, ${choice.label}`;
      if (typeof text !== 'string') issues.push(`${where}: enter the description as text.`);
      else if (/[\r\n]/.test(text) || text.trim().length > ANSWER_DEFINITION_LIMIT) issues.push(`${where}: keep the description to one line of up to ${ANSWER_DEFINITION_LIMIT} characters.`);
      else if (UNSAFE.test(text)) issues.push(`${where}: describe what the customer sees, without numbers, prices, percentages or codes.`);
    }
  }
  return issues;
}
