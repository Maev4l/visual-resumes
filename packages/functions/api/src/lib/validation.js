// WHY import-assertions: esbuild's default JSON loader inlines the schema as a compile-time
// constant at bundle time, so no filesystem access is needed at runtime inside the zip.
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import resumeSchema from '../../../../shared/schema/resume.schema.json' with { type: 'json' };

// Inlined create-request schema (smaller than the full resume schema — just the 3
// fields the editor sends for POST /api/resumes).
const createSchema = {
  type: 'object',
  required: ['title', 'templateId', 'paperSize'],
  properties: {
    title:      { type: 'string', minLength: 1 },
    templateId: { type: 'string', enum: ['monaco', 'modern', 'avant'] },
    paperSize:  { type: 'string', enum: ['A4', 'Letter'] },
  },
  additionalProperties: true,
};

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const createValidator = ajv.compile(createSchema);
const resumeValidator = ajv.compile(resumeSchema);

const run = (fn, data) => {
  const valid = fn(data);
  return { valid, errors: valid ? null : fn.errors };
};

export const validateCreate = (data) => run(createValidator, data);
export const validateResume = (data) => run(resumeValidator, data);
