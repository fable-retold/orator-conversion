# Orator File Translation

> **[Read the Orator-Conversion Documentation](https://fable-retold.github.io/orator-conversion/)** - interactive docs with the full API reference.

> File format conversion endpoints for Orator service servers

Orator File Translation provides a simple way to add file format conversion endpoints to an Orator web server. It ships with built-in image converters (JPG to PNG, PNG to JPG), PDF page extraction (PDF to PNG/JPG via pdftoppm), and supports registering custom converters for any file format. All routes are versioned.

## Features

- **Image Conversion** - Convert between JPG and PNG formats via HTTP POST endpoints
- **PDF Page Extraction** - Extract individual pages from PDFs as PNG or JPEG images
- **Versioned Routes** - All endpoints include a configurable version segment
- **Extensible** - Register custom converters for any file format via `addConverter()`
- **Configurable** - Settings via constructor options or Fable settings
- **Size Limits** - Configurable maximum file size to prevent abuse
- **Fable Service Provider** - Registers as a standard Fable service

## Quick Start

```javascript
const libFable = require('fable');
const libOrator = require('orator');
const libOratorServiceServerRestify = require('orator-serviceserver-restify');
const libOratorFileTranslation = require('orator-conversion');

const _Fable = new libFable({
	Product: 'MyConversionServer',
	APIServerPort: 8080
});

// Set up Orator with Restify
_Fable.serviceManager.addServiceType('Orator', libOrator);
_Fable.serviceManager.addServiceType('OratorServiceServer', libOratorServiceServerRestify);
_Fable.serviceManager.instantiateServiceProvider('Orator');
_Fable.serviceManager.instantiateServiceProvider('OratorServiceServer');

// Set up file translation
_Fable.serviceManager.addServiceType('OratorFileTranslation', libOratorFileTranslation);
_Fable.serviceManager.instantiateServiceProvider('OratorFileTranslation');

// Initialize and start
_Fable.Orator.startService(
	() =>
	{
		_Fable.OratorFileTranslation.connectRoutes();
		// POST http://localhost:8080/conversion/1.0/image/jpg-to-png
		// POST http://localhost:8080/conversion/1.0/image/png-to-jpg
		// POST http://localhost:8080/conversion/1.0/pdf-to-page-png/:Page
		// POST http://localhost:8080/conversion/1.0/pdf-to-page-jpg/:Page
	});
```

## Installation

```bash
npm install orator-conversion
```

### System Dependencies

PDF page extraction requires `pdftoppm` (part of the poppler-utils package):

```bash
# macOS
brew install poppler

# Debian/Ubuntu
apt-get install poppler-utils
```

## Configuration

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `RoutePrefix` | string | `"/conversion"` | URL prefix for conversion endpoints |
| `Version` | string | `"1.0"` | Version segment in route URLs |
| `LogLevel` | number | `0` | Logging verbosity (higher = more output) |
| `MaxFileSize` | number | `10485760` | Maximum upload size in bytes (default 10MB) |
| `PdftkPath` | string | `"pdftk"` | Path to the pdftk binary |
| `PdftoppmPath` | string | `"pdftoppm"` | Path to the pdftoppm binary |

Settings can also be provided via Fable settings:

| Fable Setting | Maps To |
|---------------|---------|
| `OratorFileTranslationRoutePrefix` | `RoutePrefix` |
| `OratorFileTranslationVersion` | `Version` |
| `OratorFileTranslationLogLevel` | `LogLevel` |
| `OratorFileTranslationMaxFileSize` | `MaxFileSize` |
| `OratorFileTranslationPdftkPath` | `PdftkPath` |
| `OratorFileTranslationPdftoppmPath` | `PdftoppmPath` |

## API

### connectRoutes()

Register POST endpoints on the Orator service server for each registered converter. Routes are versioned: `{RoutePrefix}/{Version}/{converterPath}`. Call this after Orator has been started.

```javascript
_Fable.OratorFileTranslation.connectRoutes();
```

### addConverter(pPath, fConverter)

Register a custom converter. The path becomes part of the endpoint URL (`{RoutePrefix}/{Version}/{pPath}`). The converter function receives the input buffer, the request object, and a callback.

```javascript
_Fable.OratorFileTranslation.addConverter('document/csv-to-json',
	(pInputBuffer, pRequest, fCallback) =>
	{
		let tmpCSV = pInputBuffer.toString('utf8');
		let tmpJSON = convertCSVToJSON(tmpCSV);
		return fCallback(null, Buffer.from(JSON.stringify(tmpJSON)), 'application/json');
	});
```

### extractPdfPage(pPdfBuffer, pPageNumber, fCallback)

Extract a single page from a PDF buffer using pdftk, returning the single-page PDF as a buffer.

### renderPdfPageToImage(pPdfBuffer, pPageNumber, pFormat, fCallback)

Render a specific page of a PDF to an image buffer using pdftoppm. The `pFormat` parameter can be `'png'` or `'jpeg'`.

## Endpoints

All endpoints are versioned. Conversion endpoints accept raw binary data via POST and return the converted file:

```bash
# Convert JPG to PNG
curl -X POST --data-binary @photo.jpg \
	-H "Content-Type: application/octet-stream" \
	http://localhost:8080/conversion/1.0/image/jpg-to-png \
	-o photo.png

# Convert PNG to JPG
curl -X POST --data-binary @image.png \
	-H "Content-Type: application/octet-stream" \
	http://localhost:8080/conversion/1.0/image/png-to-jpg \
	-o image.jpg

# Extract page 1 from a PDF as PNG
curl -X POST --data-binary @document.pdf \
	-H "Content-Type: application/octet-stream" \
	http://localhost:8080/conversion/1.0/pdf-to-page-png/1 \
	-o page1.png

# Extract page 3 from a PDF as JPEG
curl -X POST --data-binary @document.pdf \
	-H "Content-Type: application/octet-stream" \
	http://localhost:8080/conversion/1.0/pdf-to-page-jpg/3 \
	-o page3.jpg
```

## Documentation

Full documentation is available in the [`docs`](./docs) folder, or served locally:

```bash
npx docsify-cli serve docs
```

## Related Packages

- [orator](https://github.com/fable-retold/orator) - API server abstraction
- [orator-serviceserver-restify](https://github.com/fable-retold/orator-serviceserver-restify) - Restify service server implementation
- [fable](https://github.com/fable-retold/fable) - Application services framework

## License

MIT

## Contributing

Pull requests are welcome. For details on our code of conduct, contribution process, and testing requirements, see the [Retold Contributing Guide](https://github.com/fable-retold/retold/blob/main/docs/contributing.md).
