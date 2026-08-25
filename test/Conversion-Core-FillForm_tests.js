/**
* Unit tests for Conversion-Core AcroForm fill + the AcroForm mapping resolver.
*
* The fill test is the regression that would have caught the pypdf export: it fills a REAL tagged,
* calc-bearing AcroForm (MDOT 1907J) and asserts the output still carries the accessibility tree
* (/StructTreeRoot, /MarkInfo, /Metadata) and the calculation chain (/CO) — the things pypdf's
* PdfWriter().append() stripped — while the value and its appearance stream were written.
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;

const libFS = require('fs');
const libPath = require('path');
const libPDFLib = require('pdf-lib');

const libFable = require('fable');

const libConversionCore = require('../source/Conversion-Core.js');
const libMappingResolver = require('../source/AcroForm-MappingResolver.js');
const libEndpointPdfFillForm = require('../source/endpoints/Endpoint-Pdf-FillForm.js');

// A real tagged, calc-bearing AcroForm. Inline PDFDocument.create() would have no
// StructTreeRoot / /CO, making the preservation assertions vacuous.
const _FIXTURE_PATH = libPath.join(__dirname, 'fixtures', 'tagged-acroform.pdf');
// A plain text field that exists on the 1907J template (not a calculated cell).
const _TEXT_FIELD = 'CONTROL SECTION';

suite
(
	'Conversion Core - AcroForm Fill',
	() =>
	{
		test
		(
			'preserves the accessibility tree + calc chain and writes /V + appearance',
			(fDone) =>
			{
				let tmpTemplate = libFS.readFileSync(_FIXTURE_PATH);
				let tmpCore = new libConversionCore();

				tmpCore.fillAcroForm(tmpTemplate, { [_TEXT_FIELD]: 'CS-TEST' }, {},
					(pError, pOutputBuffer, pContentType, pStats) =>
					{
						Expect(pError).to.equal(null);
						Expect(pOutputBuffer).to.be.an.instanceOf(Buffer);
						Expect(pContentType).to.equal('application/pdf');
						Expect(pStats.Filled).to.be.greaterThan(0);
						Expect(pStats.Errors.length).to.equal(0);

						// Re-load the OUTPUT and introspect the dictionaries directly.
						libPDFLib.PDFDocument.load(pOutputBuffer, { updateMetadata: false }).then(
							(pDocument) =>
							{
								let tmpCatalog = pDocument.catalog;

								// (i) accessibility tree preserved — would have caught pypdf
								Expect(tmpCatalog.get(libPDFLib.PDFName.of('StructTreeRoot')), 'StructTreeRoot').to.not.equal(undefined);
								Expect(tmpCatalog.get(libPDFLib.PDFName.of('MarkInfo')), 'MarkInfo').to.not.equal(undefined);
								Expect(tmpCatalog.get(libPDFLib.PDFName.of('Metadata')), 'Metadata').to.not.equal(undefined);

								// (ii) calc chain preserved (not stripped)
								let tmpForm = pDocument.getForm();
								Expect(tmpForm.acroForm.dict.get(libPDFLib.PDFName.of('CO')), '/CO calc order').to.not.equal(undefined);

								// (iii) value + appearance stream written
								Expect(tmpForm.getTextField(_TEXT_FIELD).getText()).to.equal('CS-TEST');
								let tmpWidget = tmpForm.getField(_TEXT_FIELD).acroField.getWidgets()[0];
								let tmpAP = tmpWidget.dict.get(libPDFLib.PDFName.of('AP'));
								Expect(tmpAP, '/AP').to.not.equal(undefined);
								let tmpAPDict = pDocument.context.lookup(tmpAP);
								Expect(tmpAPDict.get(libPDFLib.PDFName.of('N')), '/AP /N appearance stream').to.not.equal(undefined);

								return fDone();
							}).catch(
							(pLoadError) => { return fDone(pLoadError); });
					});
			}
		).timeout(20000);

		test
		(
			'counts a value targeting a missing field without throwing',
			(fDone) =>
			{
				let tmpTemplate = libFS.readFileSync(_FIXTURE_PATH);
				let tmpCore = new libConversionCore();

				tmpCore.fillAcroForm(tmpTemplate, { 'NoSuchField_ZZZ': 'ignored' }, {},
					(pError, pOutputBuffer, pContentType, pStats) =>
					{
						Expect(pError).to.equal(null);
						Expect(pOutputBuffer).to.be.an.instanceOf(Buffer);
						Expect(pStats.MissingFields).to.equal(1);
						Expect(pStats.Filled).to.equal(0);
						return fDone();
					});
			}
		).timeout(20000);

		test
		(
			'returns an error when the template is not a Buffer',
			(fDone) =>
			{
				let tmpCore = new libConversionCore();

				tmpCore.fillAcroForm('this is not a pdf buffer', { [_TEXT_FIELD]: 'x' }, {},
					(pError) =>
					{
						Expect(pError).to.not.equal(null);
						Expect(pError.message).to.include('Buffer');
						return fDone();
					});
			}
		);
	}
);

suite
(
	'AcroForm Mapping Resolver',
	() =>
	{
		test
		(
			'resolves a descriptor against FormData using SourceRootAddress + SourceAddressRaw',
			() =>
			{
				let tmpResult = libMappingResolver.resolveValueMap(
					{
						SourceRootAddress: 'H',
						Descriptors: { d1: { SourceAddressRaw: 'JobNo', TargetFieldName: 'JobNumber' } }
					},
					{ FormData: { H: { JobNo: '12345' } } });

				Expect(tmpResult.ValueMap.JobNumber).to.equal('12345');
				Expect(tmpResult.Stats.Resolved).to.equal(1);
				Expect(tmpResult.Stats.MissingValues).to.equal(0);
			}
		);

		test
		(
			'expands a Targets[] descriptor to every named field',
			() =>
			{
				let tmpResult = libMappingResolver.resolveValueMap(
					{
						SourceRootAddress: '',
						Descriptors:
						{
							'Lab.GmmCA':
							{
								SourceAddressRaw: 'Lab.GmmCA',
								Targets: [ { TargetFieldName: 'H AVG Gmm VALUE_1' }, { TargetFieldName: 'H AVG Gmm VALUE_2' } ]
							}
						}
					},
					{ FormData: { Lab: { GmmCA: 2.422 } } });

				Expect(tmpResult.ValueMap['H AVG Gmm VALUE_1']).to.equal(2.422);
				Expect(tmpResult.ValueMap['H AVG Gmm VALUE_2']).to.equal(2.422);
				Expect(tmpResult.Stats.Targets).to.equal(2);
			}
		);

		test
		(
			'counts a descriptor whose source is absent as a missing value and emits no target',
			() =>
			{
				let tmpResult = libMappingResolver.resolveValueMap(
					{
						SourceRootAddress: 'ReportData.FormData',
						Descriptors: { d1: { SourceAddressRaw: 'Nope.NotHere', TargetFieldName: 'Whatever' } }
					},
					{ FormData: {} });

				Expect(tmpResult.Stats.MissingValues).to.equal(1);
				Expect(Object.keys(tmpResult.ValueMap).length).to.equal(0);
			}
		);

		test
		(
			'walks bracketed array addresses',
			() =>
			{
				let tmpValue = libMappingResolver.walkAddress(
					{ CAGTable: [ { CAGBucketID: 'B7' } ] }, 'CAGTable[0].CAGBucketID');
				Expect(tmpValue).to.equal('B7');
			}
		);
	}
);

suite
(
	'Endpoint - PDF Fill Form',
	() =>
	{
		/** Instantiate the fill endpoint on a throwaway fable instance (no HTTP server). */
		function makeEndpoint()
		{
			let tmpFable = new libFable({ Product: 'OratorConversionFillFormTests', ProductVersion: '0.0.0' });
			tmpFable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfFillForm', libEndpointPdfFillForm);
			return tmpFable.instantiateServiceProviderWithoutRegistration('OratorFileTranslationEndpoint-PdfFillForm',
				{ FileTranslation: { log: tmpFable.log, LogLevel: 0 } });
		}

		test
		(
			'fills from a JSON envelope (Manifest + Document) and returns a preserved application/pdf',
			(fDone) =>
			{
				let tmpEndpoint = makeEndpoint();
				let tmpEnvelope =
				{
					Template: libFS.readFileSync(_FIXTURE_PATH).toString('base64'),
					Manifest: { SourceRootAddress: '', Descriptors: { d1: { SourceAddressRaw: 'Ctrl', TargetFieldName: _TEXT_FIELD } } },
					Document: { FormData: { Ctrl: 'CS-ENV' } }
				};

				tmpEndpoint.convert(Buffer.from(JSON.stringify(tmpEnvelope)), {},
					(pError, pOutputBuffer, pContentType) =>
					{
						Expect(pError).to.equal(null);
						Expect(pContentType).to.equal('application/pdf');
						Expect(pOutputBuffer).to.be.an.instanceOf(Buffer);

						libPDFLib.PDFDocument.load(pOutputBuffer, { updateMetadata: false }).then(
							(pDocument) =>
							{
								Expect(pDocument.getForm().getTextField(_TEXT_FIELD).getText()).to.equal('CS-ENV');
								Expect(pDocument.catalog.get(libPDFLib.PDFName.of('StructTreeRoot')), 'StructTreeRoot').to.not.equal(undefined);
								return fDone();
							}).catch(
							(pLoadError) => { return fDone(pLoadError); });
					});
			}
		).timeout(20000);

		test
		(
			'accepts a pre-resolved ValueMap envelope',
			(fDone) =>
			{
				let tmpEndpoint = makeEndpoint();
				let tmpEnvelope =
				{
					Template: libFS.readFileSync(_FIXTURE_PATH).toString('base64'),
					ValueMap: { [_TEXT_FIELD]: 'CS-MAP' }
				};

				tmpEndpoint.convert(Buffer.from(JSON.stringify(tmpEnvelope)), {},
					(pError, pOutputBuffer) =>
					{
						Expect(pError).to.equal(null);
						Expect(pOutputBuffer).to.be.an.instanceOf(Buffer);
						return fDone();
					});
			}
		).timeout(20000);

		test
		(
			'rejects a non-JSON request body',
			(fDone) =>
			{
				let tmpEndpoint = makeEndpoint();
				tmpEndpoint.convert(Buffer.from('this is not json'), {},
					(pError) =>
					{
						Expect(pError).to.not.equal(null);
						Expect(pError.message).to.include('JSON');
						return fDone();
					});
			}
		);

		test
		(
			'requires a Template in the envelope',
			(fDone) =>
			{
				let tmpEndpoint = makeEndpoint();
				tmpEndpoint.convert(Buffer.from(JSON.stringify({ ValueMap: {} })), {},
					(pError) =>
					{
						Expect(pError).to.not.equal(null);
						Expect(pError.message).to.include('Template');
						return fDone();
					});
			}
		);
	}
);
