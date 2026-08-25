const libFableServiceProviderBase = require('fable-serviceproviderbase');

const libSharp = require('retold-sharp');
const libChildProcess = require('child_process');
const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');

const libBeaconService = require('ultravisor-beacon');
const libOratorConversionBeaconProvider = require('./Orator-Conversion-BeaconProvider.js');

const libEndpointImageJpgToPng = require('./endpoints/Endpoint-Image-JpgToPng.js');
const libEndpointImagePngToJpg = require('./endpoints/Endpoint-Image-PngToJpg.js');
const libEndpointImageResize = require('./endpoints/Endpoint-Image-Resize.js');
const libEndpointImageRotate = require('./endpoints/Endpoint-Image-Rotate.js');
const libEndpointImageConvert = require('./endpoints/Endpoint-Image-Convert.js');
const libEndpointPdfPageToPng = require('./endpoints/Endpoint-Pdf-PageToPng.js');
const libEndpointPdfPageToJpg = require('./endpoints/Endpoint-Pdf-PageToJpg.js');
const libEndpointPdfPageToPngSized = require('./endpoints/Endpoint-Pdf-PageToPng-Sized.js');
const libEndpointPdfPageToJpgSized = require('./endpoints/Endpoint-Pdf-PageToJpg-Sized.js');
const libEndpointPdfFillForm = require('./endpoints/Endpoint-Pdf-FillForm.js');

const _DEFAULT_ROUTE_PREFIX = '/conversion';
const _DEFAULT_VERSION = '1.0';
const _DEFAULT_LOG_LEVEL = 0;
const _DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const _DEFAULT_PDFTK_PATH = 'pdftk';
const _DEFAULT_PDFTOPPM_PATH = 'pdftoppm';

/**
 * Fable service that provides file format conversion endpoints for an Orator web server.
 * Includes built-in image converters (JPG to PNG, PNG to JPG), PDF page extraction
 * (PDF to PNG/JPG via pdftk + pdftoppm + sharp), and supports custom converters.
 *
 * All routes are versioned: {RoutePrefix}/{Version}/{converterPath}
 */
class OratorFileTranslation extends libFableServiceProviderBase
{
	/**
	 * Construct a service instance.
	 *
	 * @param {object} pFable The fable instance for the application.
	 * @param {object} pOptions Custom settings for this service instance.
	 * @param {string} pServiceHash The hash for this service instance.
	 *
	 * @return an OratorFileTranslation instance.
	 */
	constructor(pFable, pOptions, pServiceHash)
	{
		super(pFable, pOptions, pServiceHash);

		this.serviceType = 'OratorFileTranslation';

		// Configuration: options > fable.settings > defaults
		this.RoutePrefix = (`RoutePrefix` in this.options) ? this.options.RoutePrefix
						: `OratorFileTranslationRoutePrefix` in this.fable.settings ? this.fable.settings.OratorFileTranslationRoutePrefix
						: _DEFAULT_ROUTE_PREFIX;

		this.Version = (`Version` in this.options) ? this.options.Version
						: `OratorFileTranslationVersion` in this.fable.settings ? this.fable.settings.OratorFileTranslationVersion
						: _DEFAULT_VERSION;

		this.LogLevel = (`LogLevel` in this.options) ? this.options.LogLevel
						: `OratorFileTranslationLogLevel` in this.fable.settings ? this.fable.settings.OratorFileTranslationLogLevel
						: _DEFAULT_LOG_LEVEL;

		this.MaxFileSize = (`MaxFileSize` in this.options) ? this.options.MaxFileSize
						: `OratorFileTranslationMaxFileSize` in this.fable.settings ? this.fable.settings.OratorFileTranslationMaxFileSize
						: _DEFAULT_MAX_FILE_SIZE;

		this.PdftkPath = (`PdftkPath` in this.options) ? this.options.PdftkPath
						: `OratorFileTranslationPdftkPath` in this.fable.settings ? this.fable.settings.OratorFileTranslationPdftkPath
						: _DEFAULT_PDFTK_PATH;

		this.PdftoppmPath = (`PdftoppmPath` in this.options) ? this.options.PdftoppmPath
						: `OratorFileTranslationPdftoppmPath` in this.fable.settings ? this.fable.settings.OratorFileTranslationPdftoppmPath
						: _DEFAULT_PDFTOPPM_PATH;

		// Registry of available converters (extensible)
		this.converters = {};

		// Array of instantiated endpoint services
		this._endpointServices = [];

		// Beacon service reference (created on connectBeacon)
		this._BeaconService = null;

		// Initialize the built-in converters
		this.initializeDefaultConverters();
	}

	/**
	 * Register the default image format converters and PDF page extraction converters.
	 *
	 * Each converter is implemented as a separate Fable service in the endpoints/ folder.
	 */
	initializeDefaultConverters()
	{
		// Register endpoint service types with fable
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-ImageJpgToPng', libEndpointImageJpgToPng);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-ImagePngToJpg', libEndpointImagePngToJpg);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-ImageResize', libEndpointImageResize);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-ImageRotate', libEndpointImageRotate);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-ImageConvert', libEndpointImageConvert);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfPageToPng', libEndpointPdfPageToPng);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfPageToJpg', libEndpointPdfPageToJpg);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfPageToPngSized', libEndpointPdfPageToPngSized);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfPageToJpgSized', libEndpointPdfPageToJpgSized);
		this.fable.addServiceTypeIfNotExists('OratorFileTranslationEndpoint-PdfFillForm', libEndpointPdfFillForm);

		let tmpEndpointOptions = { FileTranslation: this };

		let tmpEndpointTypes =
			[
				'OratorFileTranslationEndpoint-ImageJpgToPng',
				'OratorFileTranslationEndpoint-ImagePngToJpg',
				'OratorFileTranslationEndpoint-ImageResize',
				'OratorFileTranslationEndpoint-ImageRotate',
				'OratorFileTranslationEndpoint-ImageConvert',
				'OratorFileTranslationEndpoint-PdfPageToPng',
				'OratorFileTranslationEndpoint-PdfPageToJpg',
				'OratorFileTranslationEndpoint-PdfPageToPngSized',
				'OratorFileTranslationEndpoint-PdfPageToJpgSized',
				'OratorFileTranslationEndpoint-PdfFillForm'
			];

		for (let i = 0; i < tmpEndpointTypes.length; i++)
		{
			let tmpEndpoint = this.fable.instantiateServiceProviderWithoutRegistration(tmpEndpointTypes[i], tmpEndpointOptions);
			this._endpointServices.push(tmpEndpoint);
			this.addConverter(tmpEndpoint.converterPath, tmpEndpoint.convert.bind(tmpEndpoint));
		}
	}

	/**
	 * Extract a single page from a PDF buffer using pdftk, returning the single-page PDF as a buffer.
	 *
	 * @param {Buffer} pPdfBuffer The input PDF buffer.
	 * @param {number} pPageNumber The 1-based page number to extract.
	 * @param {Function} fCallback Called with (pError, pSinglePagePdfBuffer).
	 */
	extractPdfPage(pPdfBuffer, pPageNumber, fCallback)
	{
		let tmpTempDir = libOS.tmpdir();
		let tmpInputPath = libPath.join(tmpTempDir, `orator_ft_input_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
		let tmpOutputPath = libPath.join(tmpTempDir, `orator_ft_output_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);

		let tmpCleanup = () =>
		{
			try { libFS.unlinkSync(tmpInputPath); } catch (pIgnore) { /* file may not exist */ }
			try { libFS.unlinkSync(tmpOutputPath); } catch (pIgnore) { /* file may not exist */ }
		};

		try
		{
			libFS.writeFileSync(tmpInputPath, pPdfBuffer);
		}
		catch (pWriteError)
		{
			tmpCleanup();
			return fCallback(new Error(`Failed to write temporary PDF file: ${pWriteError.message}`));
		}

		let tmpCommand = `${this.PdftkPath} "${tmpInputPath}" cat ${pPageNumber} output "${tmpOutputPath}"`;

		if (this.LogLevel > 1)
		{
			this.log.info(`OratorFileTranslation: executing pdftk command: ${tmpCommand}`);
		}

		libChildProcess.exec(tmpCommand,
			{
				timeout: 30000,
				maxBuffer: this.MaxFileSize
			},
			(pExecError, pStdout, pStderr) =>
			{
				if (pExecError)
				{
					tmpCleanup();
					let tmpMessage = pStderr ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`pdftk failed: ${tmpMessage}`));
				}

				try
				{
					let tmpOutputBuffer = libFS.readFileSync(tmpOutputPath);
					tmpCleanup();
					return fCallback(null, tmpOutputBuffer);
				}
				catch (pReadError)
				{
					tmpCleanup();
					return fCallback(new Error(`Failed to read pdftk output: ${pReadError.message}`));
				}
			});
	}

	/**
	 * Render a specific page of a PDF to an image buffer.
	 *
	 * Uses pdftk to extract the single page and pdftoppm to rasterize it.
	 * The output format is determined by the pFormat parameter ('png' or 'jpeg').
	 *
	 * When pOptions.LongSidePixels is provided, the image is rendered at 300 DPI
	 * and then resized so the longest dimension fits within the specified pixel count.
	 *
	 * @param {Buffer} pPdfBuffer The input PDF buffer.
	 * @param {number} pPageNumber The 1-based page number to render.
	 * @param {string} pFormat The output format: 'png' or 'jpeg'.
	 * @param {Function} fCallback Called with (pError, pImageBuffer).
	 * @param {object} [pOptions] Optional rendering options.
	 * @param {number} [pOptions.LongSidePixels] Target size for the longest side of the output image.
	 */
	renderPdfPageToImage(pPdfBuffer, pPageNumber, pFormat, fCallback, pOptions)
	{
		let tmpTempDir = libOS.tmpdir();
		let tmpUniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
		let tmpInputPath = libPath.join(tmpTempDir, `orator_ft_render_input_${tmpUniqueId}.pdf`);
		let tmpOutputPrefix = libPath.join(tmpTempDir, `orator_ft_render_output_${tmpUniqueId}`);

		let tmpLongSidePixels = (pOptions && pOptions.LongSidePixels) ? pOptions.LongSidePixels : 0;

		// When resizing is requested, render at 300 DPI for higher quality source material
		let tmpRenderDpi = (tmpLongSidePixels > 0) ? 300 : 150;

		// pdftoppm appends -NNNNNN.png (or .jpg) to the output prefix
		// When rendering a single page, it will be -01.png or similar
		let tmpExpectedSuffix = (pFormat === 'jpeg') ? '.jpg' : '.png';

		let tmpCleanup = () =>
		{
			try { libFS.unlinkSync(tmpInputPath); } catch (pIgnore) { /* file may not exist */ }
			// Clean up any pdftoppm output files matching the prefix
			try
			{
				let tmpDirContents = libFS.readdirSync(tmpTempDir);
				let tmpPrefix = libPath.basename(tmpOutputPrefix);
				for (let i = 0; i < tmpDirContents.length; i++)
				{
					if (tmpDirContents[i].startsWith(tmpPrefix))
					{
						try { libFS.unlinkSync(libPath.join(tmpTempDir, tmpDirContents[i])); } catch (pIgnore) { /* ignore */ }
					}
				}
			}
			catch (pIgnore) { /* ignore readdir errors */ }
		};

		try
		{
			libFS.writeFileSync(tmpInputPath, pPdfBuffer);
		}
		catch (pWriteError)
		{
			tmpCleanup();
			return fCallback(new Error(`Failed to write temporary PDF file: ${pWriteError.message}`));
		}

		// Build the pdftoppm command to render the specific page
		let tmpFormatFlag = (pFormat === 'jpeg') ? '-jpeg' : '-png';
		let tmpCommand = `${this.PdftoppmPath} ${tmpFormatFlag} -f ${pPageNumber} -l ${pPageNumber} -r ${tmpRenderDpi} "${tmpInputPath}" "${tmpOutputPrefix}"`;

		if (this.LogLevel > 1)
		{
			this.log.info(`OratorFileTranslation: executing pdftoppm command: ${tmpCommand}`);
		}

		libChildProcess.exec(tmpCommand,
			{
				timeout: 30000,
				maxBuffer: this.MaxFileSize
			},
			(pExecError, pStdout, pStderr) =>
			{
				if (pExecError)
				{
					tmpCleanup();
					let tmpMessage = pStderr ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`pdftoppm failed: ${tmpMessage}`));
				}

				// Find the output file — pdftoppm names it with a page number suffix
				try
				{
					let tmpDirContents = libFS.readdirSync(tmpTempDir);
					let tmpPrefix = libPath.basename(tmpOutputPrefix);
					let tmpOutputFile = null;

					for (let i = 0; i < tmpDirContents.length; i++)
					{
						if (tmpDirContents[i].startsWith(tmpPrefix) && tmpDirContents[i].endsWith(tmpExpectedSuffix))
						{
							tmpOutputFile = libPath.join(tmpTempDir, tmpDirContents[i]);
							break;
						}
					}

					if (!tmpOutputFile)
					{
						tmpCleanup();
						return fCallback(new Error('pdftoppm produced no output file.'));
					}

					let tmpImageBuffer = libFS.readFileSync(tmpOutputFile);
					tmpCleanup();

					// If LongSidePixels is specified, resize with sharp so the longest dimension
					// fits within the target pixel count, preserving aspect ratio.
					if (tmpLongSidePixels > 0)
					{
						let tmpSharpInstance = libSharp(tmpImageBuffer);

						tmpSharpInstance.metadata()
							.then(
								(pMetadata) =>
								{
									let tmpResizeOptions = {};
									if (pMetadata.width >= pMetadata.height)
									{
										tmpResizeOptions.width = tmpLongSidePixels;
									}
									else
									{
										tmpResizeOptions.height = tmpLongSidePixels;
									}

									let tmpResizer = tmpSharpInstance.resize(tmpResizeOptions);

									if (pFormat === 'jpeg')
									{
										tmpResizer = tmpResizer.jpeg();
									}
									else
									{
										tmpResizer = tmpResizer.png();
									}

									return tmpResizer.toBuffer();
								})
							.then(
								(pResizedBuffer) =>
								{
									return fCallback(null, pResizedBuffer);
								})
							.catch(
								(pResizeError) =>
								{
									return fCallback(new Error(`Image resize failed: ${pResizeError.message}`));
								});
					}
					else
					{
						return fCallback(null, tmpImageBuffer);
					}
				}
				catch (pReadError)
				{
					tmpCleanup();
					return fCallback(new Error(`Failed to read pdftoppm output: ${pReadError.message}`));
				}
			});
	}

	/**
	 * Register a converter function for a given path segment.
	 *
	 * The path may include route parameters using :paramName syntax (e.g. 'pdf-to-page-png/:Page').
	 * The converter function receives the input buffer, the request object (for accessing params),
	 * and a callback.
	 *
	 * @param {string} pPath The path segment (e.g. 'image/jpg-to-png' or 'pdf-to-page-png/:Page').
	 * @param {Function} fConverter A function(pInputBuffer, pRequest, fCallback) where fCallback is (pError, pOutputBuffer, pContentType).
	 */
	addConverter(pPath, fConverter)
	{
		this.converters[pPath] = fConverter;
		if (this.LogLevel > 0)
		{
			this.log.info(`OratorFileTranslation: registered converter [${pPath}]`);
		}
	}

	/**
	 * Collect the raw request body from the stream, enforcing the max file size limit.
	 *
	 * @param {object} pRequest The incoming HTTP request.
	 * @param {Function} fCallback Called with (pError, pBuffer).
	 */
	collectRequestBody(pRequest, fCallback)
	{
		// If the body parser has already provided the body as a Buffer, use it directly
		if (pRequest.body && Buffer.isBuffer(pRequest.body))
		{
			if (pRequest.body.length > this.MaxFileSize)
			{
				return fCallback(new Error(`File size exceeds maximum allowed size of ${this.MaxFileSize} bytes.`));
			}
			return fCallback(null, pRequest.body);
		}

		let tmpChunks = [];
		let tmpTotalLength = 0;
		let tmpErrored = false;

		pRequest.on('data',
			(pChunk) =>
			{
				if (tmpErrored)
				{
					return;
				}
				tmpTotalLength += pChunk.length;
				if (tmpTotalLength > this.MaxFileSize)
				{
					tmpErrored = true;
					pRequest.destroy();
					return fCallback(new Error(`File size exceeds maximum allowed size of ${this.MaxFileSize} bytes.`));
				}
				tmpChunks.push(pChunk);
			});

		pRequest.on('end',
			() =>
			{
				if (tmpErrored)
				{
					return;
				}
				let tmpBuffer = Buffer.concat(tmpChunks);
				return fCallback(null, tmpBuffer);
			});

		pRequest.on('error',
			(pError) =>
			{
				if (tmpErrored)
				{
					return;
				}
				tmpErrored = true;
				return fCallback(pError);
			});
	}

	/**
	 * Register POST routes on the Orator service server for each registered converter.
	 *
	 * Routes are versioned: {RoutePrefix}/{Version}/{converterPath}
	 *
	 * @return {boolean} True if routes were registered, false if Orator is not available.
	 */
	connectRoutes()
	{
		if (!this.fable.Orator)
		{
			this.log.error('OratorFileTranslation: Orator must be initialized before connecting routes.');
			return false;
		}

		let tmpConverterPaths = Object.keys(this.converters);

		for (let i = 0; i < tmpConverterPaths.length; i++)
		{
			let tmpPath = tmpConverterPaths[i];
			let tmpRoute = `${this.RoutePrefix}/${this.Version}/${tmpPath}`;
			let tmpConverter = this.converters[tmpPath];

			if (this.LogLevel > 0)
			{
				this.log.info(`OratorFileTranslation: registering POST route [${tmpRoute}]`);
			}

			this.fable.Orator.serviceServer.post(tmpRoute,
				(pRequest, pResponse, fNext) =>
				{
					this.collectRequestBody(pRequest,
						(pCollectError, pInputBuffer) =>
						{
							if (pCollectError)
							{
								this.log.error(`OratorFileTranslation: Error collecting request body for [${tmpRoute}]: ${pCollectError.message}`);
								pResponse.writeHead(413, { 'Content-Type': 'application/json' });
								pResponse.end(JSON.stringify({ error: pCollectError.message }));
								return fNext();
							}

							if (!pInputBuffer || pInputBuffer.length === 0)
							{
								pResponse.writeHead(400, { 'Content-Type': 'application/json' });
								pResponse.end(JSON.stringify({ error: 'No file data provided in request body.' }));
								return fNext();
							}

							tmpConverter(pInputBuffer, pRequest,
								(pConvertError, pOutputBuffer, pContentType) =>
								{
									if (pConvertError)
									{
										this.log.error(`OratorFileTranslation: Conversion error for [${tmpRoute}]: ${pConvertError.message}`);
										pResponse.writeHead(500, { 'Content-Type': 'application/json' });
										pResponse.end(JSON.stringify({ error: `Conversion failed: ${pConvertError.message}` }));
										return fNext();
									}

									pResponse.writeHead(200,
										{
											'Content-Type': pContentType,
											'Content-Length': pOutputBuffer.length
										});
									pResponse.end(pOutputBuffer);
									return fNext();
								});
						});
				});
		}

		return true;
	}

	/**
	 * Connect to an Ultravisor coordinator as a beacon, exposing the same
	 * MediaConversion capabilities available through the HTTP endpoints.
	 *
	 * This makes the running orator-conversion server discoverable by
	 * Ultravisor and allows it to receive work items from the mesh.
	 *
	 * @param {object} pBeaconConfig Beacon configuration:
	 *   - ServerURL {string} Ultravisor server URL (required)
	 *   - Name {string} Beacon name (default: 'orator-conversion')
	 *   - Password {string} Auth password (default: '')
	 *   - MaxConcurrent {number} Max concurrent work items (default: 2)
	 *   - StagingPath {string} Local staging directory (default: cwd)
	 *   - Tags {object} Beacon tags (default: {})
	 *   - HostID {string} Override for the host identity (default: os.hostname())
	 *   - SharedMounts {Array<{MountID, Root}>} Shared filesystem mounts to advertise
	 *     so the reachability matrix can detect zero-copy paths between this
	 *     beacon and other beacons on the same host
	 * @param {Function} fCallback Called with (pError, pBeaconInfo)
	 */
	connectBeacon(pBeaconConfig, fCallback)
	{
		if (!pBeaconConfig || !pBeaconConfig.ServerURL)
		{
			return fCallback(new Error('connectBeacon requires a ServerURL in the config.'));
		}

		if (this._BeaconService && this._BeaconService.isEnabled())
		{
			this.log.warn('OratorFileTranslation: beacon already connected.');
			return fCallback(null);
		}

		// Register the beacon service type with fable if not already present
		this.fable.addServiceTypeIfNotExists('UltravisorBeacon', libBeaconService);

		// Default staging path to dist/orator-conversion-staging
		let tmpStagingPath = pBeaconConfig.StagingPath || require('path').resolve(__dirname, '..', 'dist', 'orator-conversion-staging');

		// Ensure staging directory exists
		try
		{
			require('fs').mkdirSync(tmpStagingPath, { recursive: true });
		}
		catch (pMkdirError)
		{
			// Already exists — fine
		}

		// Build the beacon service options. SharedMounts is forwarded as-is so
		// the caller controls which mounts get advertised — and matches the
		// MountID computation done by other beacons on the same host.
		let tmpBeaconOptions =
			{
				ServerURL: pBeaconConfig.ServerURL,
				Name: pBeaconConfig.Name || 'orator-conversion',
				Password: pBeaconConfig.Password || '',
				MaxConcurrent: pBeaconConfig.MaxConcurrent || 2,
				StagingPath: tmpStagingPath,
				Tags: pBeaconConfig.Tags || {},
				BindAddresses: pBeaconConfig.BindAddresses || []
			};
		if (pBeaconConfig.HostID)
		{
			tmpBeaconOptions.HostID = pBeaconConfig.HostID;
		}
		if (Array.isArray(pBeaconConfig.SharedMounts) && pBeaconConfig.SharedMounts.length > 0)
		{
			tmpBeaconOptions.SharedMounts = pBeaconConfig.SharedMounts;
		}

		// Instantiate the beacon service with the provided config
		this._BeaconService = this.fable.instantiateServiceProviderWithoutRegistration('UltravisorBeacon', tmpBeaconOptions);

		// Create the MediaConversion capability provider and register it
		let tmpProvider = new libOratorConversionBeaconProvider(
			{
				PdftkPath: this.PdftkPath,
				PdftoppmPath: this.PdftoppmPath,
				FfmpegPath: pBeaconConfig.FfmpegPath || 'ffmpeg',
				FfprobePath: pBeaconConfig.FfprobePath || 'ffprobe',
				MaxFileSizeBytes: this.MaxFileSize,
				LogLevel: this.LogLevel
			});

		// Initialize the provider (checks tool availability), then register and enable
		tmpProvider.initialize(
			(pInitError) =>
			{
				if (pInitError)
				{
					this.log.error(`OratorFileTranslation: beacon provider init failed: ${pInitError.message}`);
					this._BeaconService = null;
					return fCallback(pInitError);
				}

				// Register the capability with the beacon service
				this._BeaconService.registerCapability(
					{
						Capability: tmpProvider.Capability,
						Name: tmpProvider.Name,
						actions: tmpProvider.actions,
						execute: tmpProvider.execute.bind(tmpProvider),
						initialize: (fCb) => { return fCb(null); },  // Already initialized above
						shutdown: (fCb) => { return fCb(null); }
					});

				// Enable the beacon — authenticate, register, begin polling
				this._BeaconService.enable(
					(pEnableError, pBeaconInfo) =>
					{
						if (pEnableError)
						{
							this.log.error(`OratorFileTranslation: beacon enable failed: ${pEnableError.message}`);
							this._BeaconService = null;
							return fCallback(pEnableError);
						}

						this.log.info(`OratorFileTranslation: beacon connected as ${pBeaconInfo.BeaconID}`);
						return fCallback(null, pBeaconInfo);
					});
			});
	}

	/**
	 * Disconnect the beacon from the Ultravisor coordinator.
	 *
	 * @param {Function} fCallback Called with (pError)
	 */
	disconnectBeacon(fCallback)
	{
		if (!this._BeaconService || !this._BeaconService.isEnabled())
		{
			if (this.log)
			{
				this.log.info('OratorFileTranslation: beacon not connected, nothing to disconnect.');
			}
			return fCallback(null);
		}

		this._BeaconService.disable(
			(pError) =>
			{
				if (pError)
				{
					this.log.warn(`OratorFileTranslation: beacon disconnect warning: ${pError.message}`);
				}
				else
				{
					this.log.info('OratorFileTranslation: beacon disconnected.');
				}
				this._BeaconService = null;
				return fCallback(pError || null);
			});
	}
}

module.exports = OratorFileTranslation;
