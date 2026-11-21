// A fence is measured one of two ways: section by section, or as one total
// length with its gates and corners. Each question belongs to one of them.
export const FENCE_TOTAL_LENGTH_FIELDS = Object.freeze(['linearFeet', 'gates', 'cornerCount', 'closedRunCount', 'lfMethod']);
export const fenceMeasuringForm = (fields = []) => fields.some(field => field.type === 'fence_runs');
// A request restored with a total length and no section layout starts in total-length mode.
export const fenceStartsTotalOnly = (values = {}) => values.fenceRuns === undefined && values.linearFeet !== undefined;
// Whether a question belongs to the measuring method in use.
export const fenceFieldInMode = (field, totalOnly) => totalOnly ? field.name !== 'fenceRuns' : !FENCE_TOTAL_LENGTH_FIELDS.includes(field.name);
// The questions the step-by-step form asks for a fence: one measuring method only.
export const fenceWizardFields = (fields = [], totalOnly) => fenceMeasuringForm(fields) ? fields.filter(field => fenceFieldInMode(field, totalOnly)) : fields;
