/**
 * AcroForm-MappingResolver — resolve a Form-Conversion mapping manifest against a Document's
 * FormData into a flat { TargetFieldName: value } map.
 *
 * No Fable dependency, no pdf-lib. This is the "what value goes where" half of the fill: it owns
 * descriptor resolution and 1:many target expansion; the PDF writer (ConversionCore.fillAcroForm)
 * owns "how to stamp it" (field-kind dispatch + appearance regeneration). Keeping them apart lets
 * each be unit-tested in isolation.
 *
 * The resolution logic (source-address candidates + the dotted/bracketed address walker) is ported
 * verbatim from headlight's browser fill (FormConversionExport-Editor.js: _applyMappingsToPDFForm
 * resolution half, _resolveSourceValue, _walkAddress) so the server-side fill produces exactly the
 * values the "Try It" preview did.
 *
 * @license MIT
 */

/**
 * Walk a dotted / bracketed address against a scope object. Dots split keys; [N] indexes arrays.
 * Byte-walked (not split) so addresses like `CAGTable[0].CAGBucketID` or `H.JobNo` resolve cleanly.
 *
 * @param {any} pScope - The object to walk into.
 * @param {string} pAddress - The address (e.g. `Lab.GmmCA`, `CAGTable[0].CAGBucketID`).
 * @return {any} The resolved value, or undefined.
 */
function walkAddress(pScope, pAddress)
{
	if (pScope === undefined || pScope === null) { return undefined; }
	if (!pAddress) { return pScope; }

	// Tokenise: dots split keys; [N] indexes arrays.
	const tmpTokens = [];
	let tmpBuffer = '';
	for (let i = 0; i < pAddress.length; i++)
	{
		const tmpCh = pAddress.charAt(i);
		if (tmpCh === '.')
		{
			if (tmpBuffer) { tmpTokens.push({ k: tmpBuffer }); tmpBuffer = ''; }
		}
		else if (tmpCh === '[')
		{
			if (tmpBuffer) { tmpTokens.push({ k: tmpBuffer }); tmpBuffer = ''; }
			const tmpClose = pAddress.indexOf(']', i + 1);
			if (tmpClose === -1) { return undefined; }
			const tmpIdx = pAddress.slice(i + 1, tmpClose).trim();
			tmpTokens.push({ i: parseInt(tmpIdx, 10) });
			i = tmpClose;
		}
		else
		{
			tmpBuffer += tmpCh;
		}
	}
	if (tmpBuffer) { tmpTokens.push({ k: tmpBuffer }); }

	let tmpCursor = pScope;
	for (let i = 0; i < tmpTokens.length; i++)
	{
		if (tmpCursor === undefined || tmpCursor === null) { return undefined; }
		const tmpKey = (typeof tmpTokens[i].k === 'string') ? tmpTokens[i].k : tmpTokens[i].i;
		tmpCursor = tmpCursor[tmpKey];
	}
	return tmpCursor;
}

/**
 * Resolve a source address against a Document's FormData. Tries, in order:
 *   1. document.FormData[<root>.<addr>]   (root + raw)
 *   2. document.FormData[<addr>]          (raw alone)
 *   3. document[<addr>]                    (top-level fallback)
 *
 * @param {object} pDocument - The document (carries FormData).
 * @param {string} pRoot - The manifest SourceRootAddress (e.g. `ReportData.FormData`).
 * @param {string} pAddress - The descriptor SourceAddressRaw (e.g. `Lab.GmmCA`).
 * @return {any} The resolved value, or undefined.
 */
function resolveSourceValue(pDocument, pRoot, pAddress)
{
	if (!pDocument || !pAddress) { return undefined; }
	const tmpFormData = pDocument.FormData || {};

	const tmpJoinedRootAddr = pRoot ? `${pRoot}.${pAddress}` : '';
	const tmpCandidates = [];
	if (tmpJoinedRootAddr) { tmpCandidates.push({ scope: tmpFormData, path: tmpJoinedRootAddr }); }
	tmpCandidates.push({ scope: tmpFormData, path: pAddress });
	tmpCandidates.push({ scope: pDocument,   path: pAddress });

	for (let i = 0; i < tmpCandidates.length; i++)
	{
		const tmpResolved = walkAddress(tmpCandidates[i].scope, tmpCandidates[i].path);
		if (tmpResolved !== undefined) { return tmpResolved; }
	}
	return undefined;
}

/**
 * Expand a descriptor into its list of target fields, supporting both the legacy inline
 * `TargetFieldName` shape and the 1:many `Targets:[{TargetFieldName}]` shape.
 *
 * @param {object} pDescriptor - The descriptor.
 * @return {Array<{TargetFieldName:string, TargetFieldType:string}>} The targets.
 */
function expandTargets(pDescriptor)
{
	if (Array.isArray(pDescriptor.Targets) && pDescriptor.Targets.length > 0)
	{
		return pDescriptor.Targets;
	}
	if (pDescriptor.TargetFieldName)
	{
		return [ { TargetFieldName: pDescriptor.TargetFieldName, TargetFieldType: pDescriptor.TargetFieldType || 'Text' } ];
	}
	return [];
}

/**
 * Resolve every Descriptor in a mapping manifest against a Document's FormData into a flat
 * { TargetFieldName: value } map. Values are returned raw (not string-coerced) — the writer coerces
 * per field kind. A descriptor whose source resolves to undefined/null is counted as a missing value
 * and contributes no target. When two descriptors target the same field, the later one wins.
 *
 * @param {object} pManifest - The Form-Conversion manifest ({ SourceRootAddress, Descriptors }).
 * @param {object} pDocument - The document ({ FormData, ... }).
 * @return {{ValueMap: Object<string,any>, Stats: {Resolved:number, MissingValues:number, Targets:number}}}
 */
function resolveValueMap(pManifest, pDocument)
{
	const tmpManifest = pManifest || {};
	const tmpDescriptors = tmpManifest.Descriptors || {};
	const tmpRoot = tmpManifest.SourceRootAddress || '';

	const tmpValueMap = {};
	const tmpStats = { Resolved: 0, MissingValues: 0, Targets: 0 };

	const tmpKeys = Object.keys(tmpDescriptors);
	for (let i = 0; i < tmpKeys.length; i++)
	{
		const tmpKey = tmpKeys[i];
		const tmpDescriptor = tmpDescriptors[tmpKey];
		if (!tmpDescriptor || typeof tmpDescriptor !== 'object') { continue; }

		const tmpSourceAddress = tmpDescriptor.SourceAddressRaw || tmpKey;
		const tmpValue = resolveSourceValue(pDocument, tmpRoot, tmpSourceAddress);
		if (tmpValue === undefined || tmpValue === null)
		{
			tmpStats.MissingValues++;
			continue;
		}
		tmpStats.Resolved++;

		const tmpTargets = expandTargets(tmpDescriptor);
		for (let t = 0; t < tmpTargets.length; t++)
		{
			const tmpTarget = tmpTargets[t];
			if (!tmpTarget || !tmpTarget.TargetFieldName) { continue; }
			tmpValueMap[tmpTarget.TargetFieldName] = tmpValue;
			tmpStats.Targets++;
		}
	}

	return { ValueMap: tmpValueMap, Stats: tmpStats };
}

module.exports = { resolveValueMap, resolveSourceValue, walkAddress, expandTargets };
