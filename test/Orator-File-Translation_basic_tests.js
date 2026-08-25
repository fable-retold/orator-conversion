/**
* Unit tests for Orator File Translation - Basic Sanity
*
* @license     MIT
*
* @author      Steven Velozo <steven@velozo.com>
*/

const Chai = require("chai");
const Expect = Chai.expect;

const libFable = require('fable');
const libOrator = require('orator');
const libOratorFileTranslation = require('../source/Orator-File-Translation.js');

const defaultFableSettings = (
	{
		Product: 'OratorFileTranslation-Tests',
		ProductVersion: '0.0.0',
		APIServerPort: 0
	});

suite
(
	'Orator File Translation',
	() =>
	{
		suite
		(
			'Object Sanity',
			() =>
			{
				test
				(
					'the class should initialize itself into a happy little object',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						Expect(tmpFileTranslation).to.be.an('object', 'OratorFileTranslation should initialize as an object.');
						Expect(tmpFileTranslation.serviceType).to.equal('OratorFileTranslation');
						Expect(tmpFileTranslation).to.have.a.property('connectRoutes');
						Expect(tmpFileTranslation.connectRoutes).to.be.a('function');
						Expect(tmpFileTranslation).to.have.a.property('converters');
						Expect(tmpFileTranslation.converters).to.be.an('object');
						Expect(tmpFileTranslation).to.have.a.property('addConverter');
						Expect(tmpFileTranslation.addConverter).to.be.a('function');
						Expect(tmpFileTranslation).to.have.a.property('collectRequestBody');
						Expect(tmpFileTranslation.collectRequestBody).to.be.a('function');
						Expect(tmpFileTranslation).to.have.a.property('extractPdfPage');
						Expect(tmpFileTranslation.extractPdfPage).to.be.a('function');
						Expect(tmpFileTranslation).to.have.a.property('renderPdfPageToImage');
						Expect(tmpFileTranslation.renderPdfPageToImage).to.be.a('function');

						return fDone();
					}
				);

				test
				(
					'the service should have default converters registered',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						Expect(tmpFileTranslation.converters).to.have.a.property('image/jpg-to-png');
						Expect(tmpFileTranslation.converters['image/jpg-to-png']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('image/png-to-jpg');
						Expect(tmpFileTranslation.converters['image/png-to-jpg']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('image/resize');
						Expect(tmpFileTranslation.converters['image/resize']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('image/rotate/:Angle');
						Expect(tmpFileTranslation.converters['image/rotate/:Angle']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('image/convert/:Format');
						Expect(tmpFileTranslation.converters['image/convert/:Format']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('pdf-to-page-png/:Page');
						Expect(tmpFileTranslation.converters['pdf-to-page-png/:Page']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('pdf-to-page-jpg/:Page');
						Expect(tmpFileTranslation.converters['pdf-to-page-jpg/:Page']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('pdf-to-page-png/:Page/:LongSidePixels');
						Expect(tmpFileTranslation.converters['pdf-to-page-png/:Page/:LongSidePixels']).to.be.a('function');
						Expect(tmpFileTranslation.converters).to.have.a.property('pdf-to-page-jpg/:Page/:LongSidePixels');
						Expect(tmpFileTranslation.converters['pdf-to-page-jpg/:Page/:LongSidePixels']).to.be.a('function');

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Configuration',
			() =>
			{
				test
				(
					'the service should have default configuration values when no options are provided',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						Expect(tmpFileTranslation.RoutePrefix).to.equal('/conversion');
						Expect(tmpFileTranslation.Version).to.equal('1.0');
						Expect(tmpFileTranslation.LogLevel).to.equal(0);
						Expect(tmpFileTranslation.MaxFileSize).to.equal(10 * 1024 * 1024);
						Expect(tmpFileTranslation.PdftkPath).to.equal('pdftk');
						Expect(tmpFileTranslation.PdftoppmPath).to.equal('pdftoppm');

						return fDone();
					}
				);

				test
				(
					'the service should accept configuration via options',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation',
							{
								RoutePrefix: '/convert',
								Version: '2.0',
								LogLevel: 3,
								MaxFileSize: 5 * 1024 * 1024,
								PdftkPath: '/usr/local/bin/pdftk',
								PdftoppmPath: '/usr/local/bin/pdftoppm'
							});

						Expect(tmpFileTranslation.RoutePrefix).to.equal('/convert');
						Expect(tmpFileTranslation.Version).to.equal('2.0');
						Expect(tmpFileTranslation.LogLevel).to.equal(3);
						Expect(tmpFileTranslation.MaxFileSize).to.equal(5 * 1024 * 1024);
						Expect(tmpFileTranslation.PdftkPath).to.equal('/usr/local/bin/pdftk');
						Expect(tmpFileTranslation.PdftoppmPath).to.equal('/usr/local/bin/pdftoppm');

						return fDone();
					}
				);

				test
				(
					'the service should accept configuration via fable settings fallback',
					(fDone) =>
					{
						let tmpFableSettings = Object.assign({}, defaultFableSettings,
							{
								OratorFileTranslationRoutePrefix: '/api/convert',
								OratorFileTranslationVersion: '3.0',
								OratorFileTranslationLogLevel: 2,
								OratorFileTranslationMaxFileSize: 20 * 1024 * 1024,
								OratorFileTranslationPdftkPath: '/opt/pdftk/bin/pdftk',
								OratorFileTranslationPdftoppmPath: '/opt/poppler/bin/pdftoppm'
							});
						let tmpFable = new libFable(tmpFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						Expect(tmpFileTranslation.RoutePrefix).to.equal('/api/convert');
						Expect(tmpFileTranslation.Version).to.equal('3.0');
						Expect(tmpFileTranslation.LogLevel).to.equal(2);
						Expect(tmpFileTranslation.MaxFileSize).to.equal(20 * 1024 * 1024);
						Expect(tmpFileTranslation.PdftkPath).to.equal('/opt/pdftk/bin/pdftk');
						Expect(tmpFileTranslation.PdftoppmPath).to.equal('/opt/poppler/bin/pdftoppm');

						return fDone();
					}
				);

				test
				(
					'options should take precedence over fable settings',
					(fDone) =>
					{
						let tmpFableSettings = Object.assign({}, defaultFableSettings,
							{
								OratorFileTranslationRoutePrefix: '/fallback',
								OratorFileTranslationVersion: '0.1',
								OratorFileTranslationLogLevel: 1,
								OratorFileTranslationMaxFileSize: 1024
							});
						let tmpFable = new libFable(tmpFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation',
							{
								RoutePrefix: '/primary',
								Version: '9.0',
								LogLevel: 5,
								MaxFileSize: 2048
							});

						Expect(tmpFileTranslation.RoutePrefix).to.equal('/primary');
						Expect(tmpFileTranslation.Version).to.equal('9.0');
						Expect(tmpFileTranslation.LogLevel).to.equal(5);
						Expect(tmpFileTranslation.MaxFileSize).to.equal(2048);

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Converter Registry',
			() =>
			{
				test
				(
					'a custom converter can be added via addConverter',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						let tmpCustomConverter = (pInputBuffer, pRequest, fCallback) =>
						{
							return fCallback(null, pInputBuffer, 'text/plain');
						};

						tmpFileTranslation.addConverter('custom/echo', tmpCustomConverter);

						Expect(tmpFileTranslation.converters).to.have.a.property('custom/echo');
						Expect(tmpFileTranslation.converters['custom/echo']).to.be.a('function');

						return fDone();
					}
				);

				test
				(
					'the converter count should reflect defaults plus custom additions',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						// Should have 10 default converters (jpg-to-png, png-to-jpg, resize, rotate, convert, pdf-to-page-png, pdf-to-page-jpg, pdf-to-page-png sized, pdf-to-page-jpg sized, pdf/fill-form)
						Expect(Object.keys(tmpFileTranslation.converters).length).to.equal(10);

						tmpFileTranslation.addConverter('document/txt-to-html', (pInput, pReq, fCb) => { fCb(null, pInput, 'text/html'); });

						// Should now have 11
						Expect(Object.keys(tmpFileTranslation.converters).length).to.equal(11);

						return fDone();
					}
				);
			}
		);

		suite
		(
			'Route Registration',
			() =>
			{
				test
				(
					'connectRoutes should register versioned routes on the orator service server',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation', {});

						tmpOrator.startService(
							() =>
							{
								let tmpResult = tmpFileTranslation.connectRoutes();
								Expect(tmpResult).to.equal(true);

								// Verify versioned routes are registered via the IPC router
								let tmpJpgToPng = tmpOrator.serviceServer.router.find('POST', '/conversion/1.0/image/jpg-to-png');
								Expect(tmpJpgToPng).to.be.an('object');
								Expect(tmpJpgToPng).to.have.a.property('handler');

								let tmpPngToJpg = tmpOrator.serviceServer.router.find('POST', '/conversion/1.0/image/png-to-jpg');
								Expect(tmpPngToJpg).to.be.an('object');
								Expect(tmpPngToJpg).to.have.a.property('handler');

								// Verify PDF page extraction routes with parameterized path
								let tmpPdfToPng = tmpOrator.serviceServer.router.find('POST', '/conversion/1.0/pdf-to-page-png/1');
								Expect(tmpPdfToPng).to.be.an('object');
								Expect(tmpPdfToPng).to.have.a.property('handler');

								let tmpPdfToJpg = tmpOrator.serviceServer.router.find('POST', '/conversion/1.0/pdf-to-page-jpg/5');
								Expect(tmpPdfToJpg).to.be.an('object');
								Expect(tmpPdfToJpg).to.have.a.property('handler');

								return fDone();
							});
					}
				);

				test
				(
					'connectRoutes should use a custom version and route prefix',
					(fDone) =>
					{
						let tmpFable = new libFable(defaultFableSettings);

						tmpFable.serviceManager.addServiceType('Orator', libOrator);
						tmpFable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);

						let tmpOrator = tmpFable.serviceManager.instantiateServiceProvider('Orator', {});
						let tmpFileTranslation = tmpFable.serviceManager.instantiateServiceProvider('OratorFileTranslation',
							{
								RoutePrefix: '/api/convert',
								Version: '2.0'
							});

						tmpOrator.startService(
							() =>
							{
								tmpFileTranslation.connectRoutes();

								let tmpHandler = tmpOrator.serviceServer.router.find('POST', '/api/convert/2.0/image/jpg-to-png');
								Expect(tmpHandler).to.be.an('object');
								Expect(tmpHandler).to.have.a.property('handler');

								let tmpPdfHandler = tmpOrator.serviceServer.router.find('POST', '/api/convert/2.0/pdf-to-page-png/3');
								Expect(tmpPdfHandler).to.be.an('object');
								Expect(tmpPdfHandler).to.have.a.property('handler');

								return fDone();
							});
					}
				);
			}
		);
	}
);
