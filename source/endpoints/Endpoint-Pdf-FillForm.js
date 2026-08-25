const libFableServiceProviderBase = require('fable-serviceproviderbase');

const libConversionCore = require('../Conversion-Core.js');
const libMappingResolver = require('../AcroForm-MappingResolver.js');

/**
 * Fill an AcroForm PDF, preserving the document as-is (tags, calc chain, metadata).
 *
 * Unlike the image/PDF-page converters whose request body is a raw file, this converter's body is a
 * JSON envelope (so it can carry the template plus the values):
 *
 *   {
 *     "Template": "<base64-encoded template PDF>",
 *     "ValueMap": { "<pdfFieldName>": <value>, ... },      // OR provide Manifest + Document:
 *     "Manifest": { "SourceRootAddress": "...", "Descriptors": { ... } },
 *     "Document": { "FormData": { ... } },
 *     "Options":  { "UpdateFieldAppearances": true, "NeedAppearances": false }
 *   }
 *
 * Provide either a resolved `ValueMap`, or a `Manifest` (+ `Document`) to resolve one. Responds with
 * the filled `application/pdf` bytes.
 */
class EndpointPdfFillForm extends libFableServiceProviderBase
{
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'OratorFileTranslationEndpoint-PdfFillForm';

		this._FileTranslation = (pOptions && pOptions.FileTranslation) ? pOptions.FileTranslation : null;

		this.converterPath = 'pdf/fill-form';
	}

	convert(pInputBuffer, pRequest, fCallback)
	{
		let tmpEnvelope;
		try
		{
			tmpEnvelope = JSON.parse(pInputBuffer.toString('utf8'));
		}
		catch (pParseError)
		{
			return fCallback(new Error(`fill-form request body must be JSON: ${pParseError.message}`));
		}

		if (!tmpEnvelope || typeof tmpEnvelope !== 'object')
		{
			return fCallback(new Error('fill-form request body must be a JSON object.'));
		}
		if (!tmpEnvelope.Template)
		{
			return fCallback(new Error('fill-form requires a base64 "Template" (the AcroForm PDF).'));
		}

		let tmpTemplateBuffer;
		try
		{
			tmpTemplateBuffer = Buffer.from(tmpEnvelope.Template, 'base64');
		}
		catch (pDecodeError)
		{
			return fCallback(new Error(`fill-form "Template" must be base64: ${pDecodeError.message}`));
		}

		let tmpValueMap;
		if (tmpEnvelope.ValueMap && typeof tmpEnvelope.ValueMap === 'object')
		{
			tmpValueMap = tmpEnvelope.ValueMap;
		}
		else if (tmpEnvelope.Manifest)
		{
			tmpValueMap = libMappingResolver.resolveValueMap(tmpEnvelope.Manifest, tmpEnvelope.Document || {}).ValueMap;
		}
		else
		{
			return fCallback(new Error('fill-form requires either a "ValueMap" or a "Manifest" (+ "Document") to resolve one.'));
		}

		// The pure writer lives in ConversionCore (single source of truth, also used by the beacon).
		let tmpLog = (this._FileTranslation && this._FileTranslation.log && typeof this._FileTranslation.log.info === 'function')
			? this._FileTranslation.log.info.bind(this._FileTranslation.log)
			: undefined;
		let tmpCore = new libConversionCore(
			{
				log: tmpLog,
				LogLevel: (this._FileTranslation && this._FileTranslation.LogLevel) ? this._FileTranslation.LogLevel : 0
			});

		tmpCore.fillAcroForm(tmpTemplateBuffer, tmpValueMap, tmpEnvelope.Options || {},
			(pFillError, pOutputBuffer, pContentType) =>
			{
				if (pFillError)
				{
					return fCallback(pFillError);
				}
				return fCallback(null, pOutputBuffer, pContentType || 'application/pdf');
			});
	}
}

module.exports = EndpointPdfFillForm;
