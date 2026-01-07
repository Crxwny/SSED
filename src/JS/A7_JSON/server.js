const express = require('express');
const Ajv2020 = require('ajv/dist/2020');
const addFormats = require('ajv-formats');
const Joi = require('joi');
const metaSchema2020 = require('ajv/dist/refs/json-schema-2020-12');

const PORT = process.env.PORT || 3000;
const app = express();

const personSchema = require('./person.schema.json');

const ajv = new Ajv2020({ allErrors: true, strict: false });
ajv.addMetaSchema(metaSchema2020);
addFormats(ajv);
const validatePersonAjv = ajv.compile(personSchema);

const joiPersonSchema = Joi.object({
  vorname: Joi.string().min(1).max(50).required(),
  nachname: Joi.string().min(1).max(50).required(),
  email: Joi.string().email().max(254).required(),
}).required().unknown(false);

app.use(express.json());

const formatAjvErrors = (errors = []) =>
  errors.map((error) => ({
    path: error.instancePath || error.schemaPath,
    message: error.message,
    params: error.params,
  }));

const formatJoiErrors = (details = []) =>
  details.map((detail) => ({
    path: detail.path.join('.'),
    message: detail.message,
    type: detail.type,
  }));

app.get('/', (_req, res) => {
  res.json({
    message: 'JSON-Validierungsservice für vorname, nachname, email',
    routes: {
      ajv: { method: 'POST', path: '/validate/ajv' },
      joi: { method: 'POST', path: '/validate/joi' },
    },
    schema: personSchema,
  });
});

app.post('/validate/ajv', (req, res) => {
  const valid = validatePersonAjv(req.body);
  if (!valid) {
    res.status(400).json({
      valid: false,
      validator: 'ajv',
      errors: formatAjvErrors(validatePersonAjv.errors),
    });
    return;
  }

  res.json({ valid: true, validator: 'ajv', data: req.body });
});

app.post('/validate/joi', (req, res) => {
  const { error, value } = joiPersonSchema.validate(req.body, {
    abortEarly: false,
    convert: true,
  });

  if (error) {
    res.status(400).json({
      valid: false,
      validator: 'joi',
      errors: formatJoiErrors(error.details),
    });
    return;
  }

  res.json({ valid: true, validator: 'joi', data: value });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Interner Serverfehler' });
});

app.listen(PORT, () => {
  console.log(`JSON-Validierungsserver läuft auf http://localhost:${PORT}`);
  console.log(`AJV: POST http://localhost:${PORT}/validate/ajv`);
  console.log(`Joi: POST http://localhost:${PORT}/validate/joi`);
});


