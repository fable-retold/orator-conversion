/**
 * Conversion-Core — Standalone conversion logic for images, video, and audio
 *
 * No Fable dependency. This module provides the raw conversion functions
 * used by both the Orator HTTP endpoints and the Ultravisor beacon provider.
 *
 * Capabilities:
 *   - Image format conversion (JPG↔PNG, any-to-any) via Sharp
 *   - Image resize, rotate, flip/flop via Sharp
 *   - PDF page extraction via pdftk
 *   - PDF page rendering via pdftoppm + optional Sharp resize
 *   - Media metadata probing via ffprobe
 *   - Video frame extraction via ffmpeg
 *   - Audio segment extraction and waveform generation via ffmpeg
 */

const libSharp = require('retold-sharp');
const libChildProcess = require('child_process');
const libFS = require('fs');
const libPath = require('path');
const libOS = require('os');

const _DEFAULT_PDFTK_PATH = 'pdftk';
const _DEFAULT_PDFTOPPM_PATH = 'pdftoppm';
const _DEFAULT_FFMPEG_PATH = 'ffmpeg';
const _DEFAULT_FFPROBE_PATH = 'ffprobe';
const _DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

class ConversionCore
{
	constructor(pOptions)
	{
		let tmpOptions = pOptions || {};

		this.PdftkPath = tmpOptions.PdftkPath || _DEFAULT_PDFTK_PATH;
		this.PdftoppmPath = tmpOptions.PdftoppmPath || _DEFAULT_PDFTOPPM_PATH;
		this.FfmpegPath = tmpOptions.FfmpegPath || _DEFAULT_FFMPEG_PATH;
		this.FfprobePath = tmpOptions.FfprobePath || _DEFAULT_FFPROBE_PATH;
		this.MaxFileSize = tmpOptions.MaxFileSize || _DEFAULT_MAX_FILE_SIZE;

		// Optional log function — if not provided, log to console
		this._log = tmpOptions.log || console.log;
		this.LogLevel = tmpOptions.LogLevel || 0;
	}

	// ================================================================
	// Image Format Conversions
	// ================================================================

	/**
	 * Convert a JPEG buffer to PNG.
	 *
	 * @param {Buffer} pInputBuffer - The JPEG image data.
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType).
	 */
	jpgToPng(pInputBuffer, fCallback)
	{
		libSharp(pInputBuffer)
			.png()
			.toBuffer()
			.then(
				(pOutputBuffer) =>
				{
					return fCallback(null, pOutputBuffer, 'image/png');
				})
			.catch(
				(pError) =>
				{
					return fCallback(pError);
				});
	}

	/**
	 * Convert a PNG buffer to JPEG.
	 *
	 * @param {Buffer} pInputBuffer - The PNG image data.
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType).
	 */
	pngToJpg(pInputBuffer, fCallback)
	{
		libSharp(pInputBuffer)
			.jpeg()
			.toBuffer()
			.then(
				(pOutputBuffer) =>
				{
					return fCallback(null, pOutputBuffer, 'image/jpeg');
				})
			.catch(
				(pError) =>
				{
					return fCallback(pError);
				});
	}

	/**
	 * Resize an image with Sharp.
	 *
	 * @param {Buffer|string} pInput - Image data (Buffer) or file path (string).
	 * @param {object} pOptions - Resize options.
	 * @param {number} [pOptions.Width] - Target width in pixels.
	 * @param {number} [pOptions.Height] - Target height in pixels.
	 * @param {string} [pOptions.Format] - Output format: 'png', 'jpeg', 'webp' (default: 'jpeg').
	 * @param {number} [pOptions.Quality] - Quality for lossy formats (1-100, default: 80).
	 * @param {boolean} [pOptions.AutoOrient] - Auto-orient from EXIF (default: true).
	 * @param {string} [pOptions.Fit] - Resize fit mode: 'cover', 'contain', 'fill', 'inside', 'outside'.
	 * @param {string} [pOptions.Position] - Resize position/gravity: 'centre', 'north', 'south', etc.
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType).
	 */
	imageResize(pInput, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpFormat = (tmpOptions.Format || 'jpeg').toLowerCase();
		let tmpQuality = tmpOptions.Quality || 80;
		let tmpAutoOrient = (tmpOptions.AutoOrient !== false);

		let tmpResizeConfig = {};
		if (tmpOptions.Width)
		{
			tmpResizeConfig.width = parseInt(tmpOptions.Width, 10);
		}
		if (tmpOptions.Height)
		{
			tmpResizeConfig.height = parseInt(tmpOptions.Height, 10);
		}
		if (tmpOptions.Fit)
		{
			tmpResizeConfig.fit = tmpOptions.Fit;
		}
		if (tmpOptions.Position)
		{
			tmpResizeConfig.position = tmpOptions.Position;
		}

		// Accept file path or buffer; disable pixel limit for large scans
		let tmpSharpInstance = libSharp(pInput, { limitInputPixels: false });

		if (tmpAutoOrient)
		{
			tmpSharpInstance = tmpSharpInstance.rotate();
		}

		if (tmpResizeConfig.width || tmpResizeConfig.height)
		{
			tmpSharpInstance = tmpSharpInstance.resize(tmpResizeConfig);
		}

		let tmpContentType;
		if (tmpFormat === 'png')
		{
			tmpSharpInstance = tmpSharpInstance.png();
			tmpContentType = 'image/png';
		}
		else if (tmpFormat === 'webp')
		{
			tmpSharpInstance = tmpSharpInstance.webp({ quality: tmpQuality });
			tmpContentType = 'image/webp';
		}
		else if (tmpFormat === 'avif')
		{
			tmpSharpInstance = tmpSharpInstance.avif({ quality: tmpQuality });
			tmpContentType = 'image/avif';
		}
		else if (tmpFormat === 'tiff')
		{
			tmpSharpInstance = tmpSharpInstance.tiff({ quality: tmpQuality });
			tmpContentType = 'image/tiff';
		}
		else
		{
			tmpSharpInstance = tmpSharpInstance.jpeg({ quality: tmpQuality });
			tmpContentType = 'image/jpeg';
		}

		tmpSharpInstance.toBuffer()
			.then(
				(pOutputBuffer) =>
				{
					return fCallback(null, pOutputBuffer, tmpContentType);
				})
			.catch(
				(pError) =>
				{
					return fCallback(pError);
				});
	}

	/**
	 * Rotate and/or flip an image buffer with Sharp.
	 *
	 * @param {Buffer} pInputBuffer - The image data (any format Sharp can read).
	 * @param {object} pOptions - Rotation options.
	 * @param {number} [pOptions.Angle] - Rotation angle in degrees (0, 90, 180, 270, or arbitrary).
	 * @param {boolean} [pOptions.Flip] - Flip vertically.
	 * @param {boolean} [pOptions.Flop] - Flip horizontally.
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType).
	 */
	imageRotate(pInputBuffer, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};

		let tmpSharpInstance = libSharp(pInputBuffer);

		if (typeof tmpOptions.Angle === 'number' || typeof tmpOptions.Angle === 'string')
		{
			tmpSharpInstance = tmpSharpInstance.rotate(parseInt(tmpOptions.Angle, 10));
		}

		if (tmpOptions.Flip)
		{
			tmpSharpInstance = tmpSharpInstance.flip();
		}

		if (tmpOptions.Flop)
		{
			tmpSharpInstance = tmpSharpInstance.flop();
		}

		tmpSharpInstance.toBuffer({ resolveWithObject: true })
			.then(
				(pResult) =>
				{
					let tmpContentType = 'application/octet-stream';
					let tmpFormat = pResult.info.format;
					if (tmpFormat === 'jpeg')
					{
						tmpContentType = 'image/jpeg';
					}
					else if (tmpFormat === 'png')
					{
						tmpContentType = 'image/png';
					}
					else if (tmpFormat === 'webp')
					{
						tmpContentType = 'image/webp';
					}
					else if (tmpFormat === 'avif')
					{
						tmpContentType = 'image/avif';
					}
					else if (tmpFormat === 'tiff')
					{
						tmpContentType = 'image/tiff';
					}
					return fCallback(null, pResult.data, tmpContentType);
				})
			.catch(
				(pError) =>
				{
					return fCallback(pError);
				});
	}

	/**
	 * Convert an image buffer to a different format via Sharp.
	 *
	 * @param {Buffer} pInputBuffer - The image data (any format Sharp can read).
	 * @param {object} pOptions - Conversion options.
	 * @param {string} pOptions.Format - Target format: 'jpeg', 'png', 'webp', 'avif', 'tiff'.
	 * @param {number} [pOptions.Quality] - Quality for lossy formats (1-100, default: 80).
	 * @param {boolean} [pOptions.AutoOrient] - Auto-orient from EXIF (default: true).
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType).
	 */
	imageConvert(pInputBuffer, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpFormat = (tmpOptions.Format || 'jpeg').toLowerCase();
		let tmpQuality = tmpOptions.Quality || 80;
		let tmpAutoOrient = (tmpOptions.AutoOrient !== false);

		let tmpSharpInstance = libSharp(pInputBuffer);

		if (tmpAutoOrient)
		{
			tmpSharpInstance = tmpSharpInstance.rotate();
		}

		let tmpContentType;
		switch (tmpFormat)
		{
			case 'png':
				tmpSharpInstance = tmpSharpInstance.png();
				tmpContentType = 'image/png';
				break;
			case 'webp':
				tmpSharpInstance = tmpSharpInstance.webp({ quality: tmpQuality });
				tmpContentType = 'image/webp';
				break;
			case 'avif':
				tmpSharpInstance = tmpSharpInstance.avif({ quality: tmpQuality });
				tmpContentType = 'image/avif';
				break;
			case 'tiff':
				tmpSharpInstance = tmpSharpInstance.tiff({ quality: tmpQuality });
				tmpContentType = 'image/tiff';
				break;
			default:
				tmpSharpInstance = tmpSharpInstance.jpeg({ quality: tmpQuality });
				tmpContentType = 'image/jpeg';
				break;
		}

		tmpSharpInstance.toBuffer()
			.then(
				(pOutputBuffer) =>
				{
					return fCallback(null, pOutputBuffer, tmpContentType);
				})
			.catch(
				(pError) =>
				{
					return fCallback(pError);
				});
	}

	// ================================================================
	// PDF Operations
	// ================================================================

	/**
	 * Extract a single page from a PDF buffer using pdftk.
	 *
	 * @param {Buffer} pPdfBuffer - The input PDF buffer.
	 * @param {number} pPageNumber - The 1-based page number to extract.
	 * @param {Function} fCallback - Called with (pError, pSinglePagePdfBuffer).
	 */
	extractPdfPage(pPdfBuffer, pPageNumber, fCallback)
	{
		let tmpTempDir = libOS.tmpdir();
		let tmpUniqueId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
		let tmpInputPath = libPath.join(tmpTempDir, `orator_ft_input_${tmpUniqueId}.pdf`);
		let tmpOutputPath = libPath.join(tmpTempDir, `orator_ft_output_${tmpUniqueId}.pdf`);

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
			this._log(`ConversionCore: executing pdftk command: ${tmpCommand}`);
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
	 * Uses pdftoppm to rasterize the page. When pOptions.LongSidePixels is
	 * provided, the image is rendered at 300 DPI then resized.
	 *
	 * @param {Buffer} pPdfBuffer - The input PDF buffer.
	 * @param {number} pPageNumber - The 1-based page number to render.
	 * @param {string} pFormat - Output format: 'png' or 'jpeg'.
	 * @param {Function} fCallback - Called with (pError, pImageBuffer).
	 * @param {object} [pOptions] - Optional rendering options.
	 * @param {number} [pOptions.LongSidePixels] - Target size for the longest side.
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
		let tmpExpectedSuffix = (pFormat === 'jpeg') ? '.jpg' : '.png';

		let tmpCleanup = () =>
		{
			try { libFS.unlinkSync(tmpInputPath); } catch (pIgnore) { /* file may not exist */ }
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

		let tmpFormatFlag = (pFormat === 'jpeg') ? '-jpeg' : '-png';
		let tmpCommand = `${this.PdftoppmPath} ${tmpFormatFlag} -f ${pPageNumber} -l ${pPageNumber} -r ${tmpRenderDpi} "${tmpInputPath}" "${tmpOutputPrefix}"`;

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: executing pdftoppm command: ${tmpCommand}`);
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

	// ================================================================
	// PDF Form Filling (AcroForm)
	// ================================================================

	/**
	 * Fill an AcroForm PDF's fields, preserving the document as-is.
	 *
	 * Loads the template, sets each field's value (dispatching on the field kind auto-detected from
	 * the loaded form), regenerates appearance streams, and saves. Uses pdf-lib's load->save path,
	 * which PRESERVES the structure tree (/StructTreeRoot, /MarkInfo, /Metadata, /ViewerPreferences)
	 * and the template's calculation actions (/AA, /CO) and embedded JavaScript — i.e. it fills "as
	 * if a user did it in Acrobat" without stripping, normalizing, or flattening anything.
	 *
	 * pdf-lib is required lazily so the image/video/audio capabilities keep working where pdf-lib
	 * is not installed.
	 *
	 * @param {Buffer} pTemplateBuffer - The template AcroForm PDF.
	 * @param {object} pValueMap - Flat map of { pdfFieldName: rawValue }. Field kind is auto-detected.
	 * @param {object} [pOptions] - Fill options.
	 * @param {boolean} [pOptions.UpdateFieldAppearances=true] - Regenerate field appearance streams on save.
	 * @param {boolean} [pOptions.IgnoreEncryption=true] - Load encrypted templates (output is decrypted).
	 * @param {boolean} [pOptions.NeedAppearances=false] - Set /NeedAppearances so viewers regenerate appearances.
	 * @param {*} [pOptions.ParseSpeed] - Optional pdf-lib ParseSpeeds value.
	 * @param {Function} fCallback - Called with (pError, pOutputBuffer, pContentType, pStats).
	 *   pStats: { Filled, MissingFields, Errors: [{ Field, Message }] }.
	 */
	fillAcroForm(pTemplateBuffer, pValueMap, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpValueMap = pValueMap || {};
		let tmpStats = { Filled: 0, MissingFields: 0, Errors: [] };

		let libPDFLib;
		try
		{
			libPDFLib = require('pdf-lib');
		}
		catch (pRequireError)
		{
			return fCallback(new Error(`pdf-lib is required for fillAcroForm but could not be loaded: ${pRequireError.message}`));
		}

		if (!Buffer.isBuffer(pTemplateBuffer) && !(pTemplateBuffer instanceof Uint8Array))
		{
			return fCallback(new Error('fillAcroForm requires a template PDF Buffer.'));
		}

		let tmpLoadOptions =
		{
			ignoreEncryption: (tmpOptions.IgnoreEncryption !== false),
			updateMetadata:   false
		};
		if (tmpOptions.ParseSpeed) { tmpLoadOptions.parseSpeed = tmpOptions.ParseSpeed; }

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: filling AcroForm with ${Object.keys(tmpValueMap).length} value(s).`);
		}

		libPDFLib.PDFDocument.load(pTemplateBuffer, tmpLoadOptions)
			.then(
				(pDocument) =>
				{
					let tmpForm = pDocument.getForm();

					// Build a name -> field lookup once.
					let tmpFieldByName = {};
					let tmpFields = tmpForm.getFields();
					for (let i = 0; i < tmpFields.length; i++)
					{
						let tmpName = '';
						try { tmpName = tmpFields[i].getName(); }
						catch (pNameError) { tmpName = ''; }
						if (tmpName) { tmpFieldByName[tmpName] = tmpFields[i]; }
					}

					let tmpNames = Object.keys(tmpValueMap);
					for (let i = 0; i < tmpNames.length; i++)
					{
						let tmpFieldName = tmpNames[i];
						let tmpField = tmpFieldByName[tmpFieldName];
						if (!tmpField)
						{
							tmpStats.MissingFields++;
							continue;
						}

						let tmpRawValue = tmpValueMap[tmpFieldName];
						let tmpKind = (tmpField.constructor && tmpField.constructor.name) || '';
						let tmpStringValue = (tmpRawValue === undefined || tmpRawValue === null) ? '' : String(tmpRawValue);
						try
						{
							if (tmpKind === 'PDFCheckBox')
							{
								let tmpTruthy = tmpRawValue === true
									|| tmpStringValue === '1'
									|| /^(true|yes|on|checked)$/i.test(tmpStringValue);
								if (tmpTruthy) { tmpField.check(); } else { tmpField.uncheck(); }
							}
							else if (tmpKind === 'PDFDropdown' || tmpKind === 'PDFOptionList' || tmpKind === 'PDFRadioGroup')
							{
								tmpField.select(tmpStringValue);
							}
							else
							{
								// PDFTextField, PDFSignature, anything else — coerce to string.
								tmpField.setText(tmpStringValue);
							}
							tmpStats.Filled++;
						}
						catch (pFieldError)
						{
							tmpStats.Errors.push({ Field: tmpFieldName, Message: pFieldError.message || String(pFieldError) });
						}
					}

					if (tmpOptions.NeedAppearances === true)
					{
						// Ask viewers to (re)generate appearances. We still regenerate below by default,
						// so this is a belt-and-suspenders fallback for viewers that honor the flag.
						try { tmpForm.acroForm.dict.set(libPDFLib.PDFName.of('NeedAppearances'), libPDFLib.PDFBool.True); }
						catch (pNeedAppError) { /* non-fatal */ }
					}

					return pDocument.save({ updateFieldAppearances: (tmpOptions.UpdateFieldAppearances !== false) });
				})
			.then(
				(pOutputBytes) =>
				{
					return fCallback(null, Buffer.from(pOutputBytes), 'application/pdf', tmpStats);
				})
			.catch(
				(pError) =>
				{
					return fCallback(new Error(`AcroForm fill failed: ${pError.message || pError}`));
				});
	}

	// ================================================================
	// Tool Availability Checks
	// ================================================================

	/**
	 * Check if Sharp is available and functional.
	 *
	 * @param {Function} fCallback - Called with (pError, pAvailable).
	 */
	checkSharp(fCallback)
	{
		try
		{
			// Create a minimal test image to verify Sharp works
			libSharp({
				create: {
					width: 1, height: 1,
					channels: 3,
					background: { r: 0, g: 0, b: 0 }
				}
			})
			.png()
			.toBuffer()
			.then(() =>
			{
				return fCallback(null, true);
			})
			.catch((pError) =>
			{
				return fCallback(new Error(`Sharp not functional: ${pError.message}`), false);
			});
		}
		catch (pError)
		{
			return fCallback(new Error(`Sharp not available: ${pError.message}`), false);
		}
	}

	/**
	 * Check if pdftoppm is available.
	 *
	 * @param {Function} fCallback - Called with (pError, pAvailable).
	 */
	checkPdftoppm(fCallback)
	{
		libChildProcess.exec(`${this.PdftoppmPath} -v`,
			{ timeout: 5000 },
			(pError, pStdout, pStderr) =>
			{
				// pdftoppm -v outputs version to stderr
				if (pError && !pStderr)
				{
					return fCallback(new Error(`pdftoppm not available: ${pError.message}`), false);
				}
				return fCallback(null, true);
			});
	}

	/**
	 * Check if pdftk is available.
	 *
	 * @param {Function} fCallback - Called with (pError, pAvailable).
	 */
	checkPdftk(fCallback)
	{
		libChildProcess.exec(`${this.PdftkPath} --version`,
			{ timeout: 5000 },
			(pError, pStdout, pStderr) =>
			{
				if (pError)
				{
					return fCallback(new Error(`pdftk not available: ${pError.message}`), false);
				}
				return fCallback(null, true);
			});
	}

	/**
	 * Check if ffmpeg is available.
	 *
	 * @param {Function} fCallback - Called with (pError, pAvailable).
	 */
	checkFfmpeg(fCallback)
	{
		libChildProcess.exec(`${this.FfmpegPath} -version`,
			{ timeout: 5000 },
			(pError, pStdout, pStderr) =>
			{
				if (pError)
				{
					return fCallback(new Error(`ffmpeg not available: ${pError.message}`), false);
				}
				return fCallback(null, true);
			});
	}

	/**
	 * Check if ffprobe is available.
	 *
	 * @param {Function} fCallback - Called with (pError, pAvailable).
	 */
	checkFfprobe(fCallback)
	{
		libChildProcess.exec(`${this.FfprobePath} -version`,
			{ timeout: 5000 },
			(pError, pStdout, pStderr) =>
			{
				if (pError)
				{
					return fCallback(new Error(`ffprobe not available: ${pError.message}`), false);
				}
				return fCallback(null, true);
			});
	}

	// ================================================================
	// Media Probing (ffprobe)
	// ================================================================

	/**
	 * Extract media metadata using ffprobe.
	 *
	 * @param {string} pFilePath - Path to the media file.
	 * @param {Function} fCallback - Called with (pError, pMetadataObject).
	 */
	mediaProbe(pFilePath, fCallback)
	{
		if (!pFilePath)
		{
			return fCallback(new Error('No file path provided for mediaProbe.'));
		}

		let tmpCommand = `${this.FfprobePath} -v quiet -print_format json -show_format -show_streams "${pFilePath}"`;

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: executing ffprobe command: ${tmpCommand}`);
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
					let tmpMessage = pStderr ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`ffprobe failed: ${tmpMessage}`));
				}

				try
				{
					let tmpMetadata = JSON.parse(pStdout.toString());
					return fCallback(null, tmpMetadata);
				}
				catch (pParseError)
				{
					return fCallback(new Error(`Failed to parse ffprobe output: ${pParseError.message}`));
				}
			});
	}

	// ================================================================
	// Video Operations (ffmpeg)
	// ================================================================

	/**
	 * Extract a single frame from a video file at a given timestamp.
	 *
	 * @param {string} pInputPath - Path to the input video file.
	 * @param {string} pOutputPath - Path for the output JPEG image.
	 * @param {object} pOptions - Extraction options.
	 * @param {string} [pOptions.Timestamp] - Seek position (default: '00:00:00').
	 * @param {number} [pOptions.Width] - Scale width (height auto-calculated).
	 * @param {number} [pOptions.Height] - Scale height (width auto-calculated).
	 * @param {Function} fCallback - Called with (pError, pOutputPath).
	 */
	videoExtractFrame(pInputPath, pOutputPath, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpTimestamp = tmpOptions.Timestamp || '00:00:00';

		let tmpScaleFilter = '';
		if (tmpOptions.Width || tmpOptions.Height)
		{
			let tmpW = tmpOptions.Width ? parseInt(tmpOptions.Width, 10) : -1;
			let tmpH = tmpOptions.Height ? parseInt(tmpOptions.Height, 10) : -1;
			tmpScaleFilter = ` -vf "scale=${tmpW}:${tmpH}:force_original_aspect_ratio=decrease"`;
		}

		// Ensure output directory exists
		let tmpOutputDir = libPath.dirname(pOutputPath);
		if (!libFS.existsSync(tmpOutputDir))
		{
			libFS.mkdirSync(tmpOutputDir, { recursive: true });
		}

		let tmpCommand = `${this.FfmpegPath} -ss ${tmpTimestamp} -i "${pInputPath}" -vframes 1${tmpScaleFilter} -f mjpeg -y "${pOutputPath}"`;

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: executing ffmpeg command: ${tmpCommand}`);
		}

		libChildProcess.exec(tmpCommand,
			{
				timeout: 60000,
				maxBuffer: this.MaxFileSize
			},
			(pExecError, pStdout, pStderr) =>
			{
				if (pExecError)
				{
					let tmpMessage = pStderr ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`ffmpeg frame extraction failed: ${tmpMessage}`));
				}

				if (!libFS.existsSync(pOutputPath))
				{
					return fCallback(new Error('ffmpeg produced no output file.'));
				}

				return fCallback(null, pOutputPath);
			});
	}

	/**
	 * Extract MULTIPLE frames from a video file in a single work item.
	 *
	 * This is the batch counterpart to videoExtractFrame. It exists so the
	 * dispatcher can request all N frames the video explorer wants in one
	 * trip — instead of triggering an entire operation graph 20 times — which
	 * means one address resolve, one file-transfer / shared-fs check, one
	 * probe (optional), and one ffmpeg invocation per frame all served from
	 * the same on-disk file.
	 *
	 * Each frame extraction is a separate ffmpeg call internally because
	 * ffmpeg's `-ss` before `-i` is fast (uses container index), and chaining
	 * `select=eq(t,X)+eq(t,Y)+...` filters is brittle and produces wrong-sized
	 * outputs for variable-bitrate streams. Sequential single-frame extracts
	 * give us the same correctness as videoExtractFrame, just amortized.
	 *
	 * @param {string} pInputPath - Path to the input video file.
	 * @param {Array}  pFrameSpecs - Frame specs:
	 *   [
	 *     { Timestamp: '00:00:05.000', OutputPath: '/abs/path/frame_0000.jpg' },
	 *     { Timestamp: '00:00:10.000', OutputPath: '/abs/path/frame_0001.jpg' },
	 *     ...
	 *   ]
	 * @param {object} pOptions - Shared extract options applied to every frame:
	 *   { Width, Height }
	 * @param {Function} fCallback - Called with (pError, pResult) where
	 *   pResult is { Frames: [{ Index, Timestamp, OutputPath, Size, Success, Error? }, ...] }
	 */
	videoExtractFramesBatch(pInputPath, pFrameSpecs, pOptions, fCallback)
	{
		let tmpSelf = this;

		if (!Array.isArray(pFrameSpecs) || pFrameSpecs.length === 0)
		{
			return fCallback(new Error('videoExtractFramesBatch: Frames array is required and must be non-empty.'));
		}

		// Quick existence check on the input video — fail fast rather than per-frame
		if (!libFS.existsSync(pInputPath))
		{
			return fCallback(new Error(`videoExtractFramesBatch: input video not found: ${pInputPath}`));
		}

		let tmpResults = [];
		let tmpIndex = 0;

		let _extractNext = () =>
		{
			if (tmpIndex >= pFrameSpecs.length)
			{
				return fCallback(null, { Frames: tmpResults });
			}

			let tmpI = tmpIndex;
			let tmpSpec = pFrameSpecs[tmpI];
			tmpIndex++;

			if (!tmpSpec || !tmpSpec.OutputPath || !tmpSpec.Timestamp)
			{
				tmpResults.push(
					{
						Index: tmpI,
						Timestamp: tmpSpec ? tmpSpec.Timestamp : null,
						OutputPath: tmpSpec ? tmpSpec.OutputPath : null,
						Size: 0,
						Success: false,
						Error: 'Missing Timestamp or OutputPath'
					});
				return _extractNext();
			}

			tmpSelf.videoExtractFrame(pInputPath, tmpSpec.OutputPath,
				{
					Timestamp: tmpSpec.Timestamp,
					Width: pOptions ? pOptions.Width : undefined,
					Height: pOptions ? pOptions.Height : undefined
				},
				(pError, pResultPath) =>
				{
					if (pError)
					{
						tmpResults.push(
							{
								Index: tmpI,
								Timestamp: tmpSpec.Timestamp,
								OutputPath: tmpSpec.OutputPath,
								Size: 0,
								Success: false,
								Error: pError.message
							});
						return _extractNext();
					}

					let tmpSize = 0;
					try { tmpSize = libFS.statSync(pResultPath).size; } catch (pIgnore) { /* ignore */ }
					tmpResults.push(
						{
							Index: tmpI,
							Timestamp: tmpSpec.Timestamp,
							OutputPath: pResultPath,
							Size: tmpSize,
							Success: true
						});
					return _extractNext();
				});
		};

		_extractNext();
	}

	/**
	 * Generate a thumbnail from a video file.
	 *
	 * Convenience wrapper around videoExtractFrame with sensible defaults.
	 *
	 * @param {string} pInputPath - Path to the input video file.
	 * @param {string} pOutputPath - Path for the output JPEG thumbnail.
	 * @param {object} pOptions - Thumbnail options.
	 * @param {string} [pOptions.Timestamp] - Seek position (default: '00:00:01').
	 * @param {number} [pOptions.Width] - Thumbnail width (default: 320).
	 * @param {Function} fCallback - Called with (pError, pOutputPath).
	 */
	videoThumbnail(pInputPath, pOutputPath, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};

		this.videoExtractFrame(pInputPath, pOutputPath,
			{
				Timestamp: tmpOptions.Timestamp || '00:00:01',
				Width: tmpOptions.Width || 320
			},
			fCallback);
	}

	// ================================================================
	// Audio Operations (ffmpeg)
	// ================================================================

	/**
	 * Extract a time-range segment from an audio or video file.
	 *
	 * @param {string} pInputPath - Path to the input file.
	 * @param {string} pOutputPath - Path for the output audio file.
	 * @param {object} pOptions - Extraction options.
	 * @param {string|number} [pOptions.Start] - Start time in seconds or HH:MM:SS (default: '0').
	 * @param {string|number} pOptions.Duration - Segment duration in seconds or HH:MM:SS.
	 * @param {string} [pOptions.Codec] - Output codec: 'mp3', 'wav', 'flac', 'ogg', 'aac' (default: 'mp3').
	 * @param {Function} fCallback - Called with (pError, pOutputPath).
	 */
	audioExtractSegment(pInputPath, pOutputPath, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpStart = tmpOptions.Start || '0';
		let tmpDuration = tmpOptions.Duration;
		let tmpCodec = (tmpOptions.Codec || 'mp3').toLowerCase();

		if (!tmpDuration)
		{
			return fCallback(new Error('Duration is required for audioExtractSegment.'));
		}

		let tmpCodecArgs =
		{
			'mp3': '-c:a libmp3lame -q:a 2',
			'wav': '-c:a pcm_s16le',
			'flac': '-c:a flac',
			'ogg': '-c:a libvorbis -q:a 5',
			'aac': '-c:a aac -b:a 192k'
		};

		let tmpArgs = tmpCodecArgs[tmpCodec] || tmpCodecArgs['mp3'];

		// Ensure output directory exists
		let tmpOutputDir = libPath.dirname(pOutputPath);
		if (!libFS.existsSync(tmpOutputDir))
		{
			libFS.mkdirSync(tmpOutputDir, { recursive: true });
		}

		let tmpCommand = `${this.FfmpegPath} -ss ${tmpStart} -t ${tmpDuration} -i "${pInputPath}" -vn ${tmpArgs} -y "${pOutputPath}"`;

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: executing ffmpeg command: ${tmpCommand}`);
		}

		libChildProcess.exec(tmpCommand,
			{
				timeout: 120000,
				maxBuffer: this.MaxFileSize
			},
			(pExecError, pStdout, pStderr) =>
			{
				if (pExecError)
				{
					let tmpMessage = pStderr ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`ffmpeg audio extraction failed: ${tmpMessage}`));
				}

				if (!libFS.existsSync(pOutputPath))
				{
					return fCallback(new Error('ffmpeg produced no output file.'));
				}

				return fCallback(null, pOutputPath);
			});
	}

	/**
	 * Extract waveform peak data from an audio file via ffmpeg PCM pipe.
	 *
	 * Returns an array of normalized peak amplitudes (0.0 to 1.0).
	 *
	 * @param {string} pInputPath - Path to the input audio/video file.
	 * @param {object} pOptions - Waveform options.
	 * @param {number} [pOptions.SampleRate] - PCM sample rate (default: 8000).
	 * @param {number} [pOptions.Samples] - Number of peak values to return (default: 800).
	 * @param {Function} fCallback - Called with (pError, pPeaksArray).
	 */
	audioWaveform(pInputPath, pOptions, fCallback)
	{
		let tmpOptions = pOptions || {};
		let tmpSampleRate = tmpOptions.SampleRate || 8000;
		let tmpSamples = tmpOptions.Samples || 800;

		let tmpCommand = `${this.FfmpegPath} -i "${pInputPath}" -ac 1 -ar ${tmpSampleRate} -f s16le -acodec pcm_s16le pipe:1`;

		if (this.LogLevel > 1)
		{
			this._log(`ConversionCore: executing ffmpeg waveform command: ${tmpCommand}`);
		}

		let tmpProcess = libChildProcess.exec(tmpCommand,
			{
				timeout: 60000,
				maxBuffer: 50 * 1024 * 1024, // 50MB for raw PCM
				encoding: 'buffer'
			},
			(pExecError, pStdout, pStderr) =>
			{
				if (pExecError)
				{
					let tmpMessage = (pStderr && pStderr.length > 0) ? pStderr.toString().trim() : pExecError.message;
					return fCallback(new Error(`ffmpeg waveform extraction failed: ${tmpMessage}`));
				}

				if (!pStdout || pStdout.length < 2)
				{
					return fCallback(new Error('ffmpeg produced no PCM output.'));
				}

				// Process PCM s16le data into peak values
				let tmpTotalSamples = Math.floor(pStdout.length / 2);
				let tmpWindowSize = Math.max(1, Math.floor(tmpTotalSamples / tmpSamples));
				let tmpPeaks = [];

				for (let i = 0; i < tmpSamples; i++)
				{
					let tmpStart = i * tmpWindowSize;
					let tmpEnd = Math.min(tmpStart + tmpWindowSize, tmpTotalSamples);
					let tmpPeak = 0;

					for (let j = tmpStart; j < tmpEnd; j++)
					{
						let tmpValue = Math.abs(pStdout.readInt16LE(j * 2));
						if (tmpValue > tmpPeak)
						{
							tmpPeak = tmpValue;
						}
					}

					tmpPeaks.push(tmpPeak / 32768.0);
				}

				return fCallback(null, tmpPeaks);
			});
	}
}

module.exports = ConversionCore;
