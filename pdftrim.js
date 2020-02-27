const fs = require('fs');
const pdfjs = require('pdfjs-dist');
const pdflib = require('pdf-lib');

/* NOTE: the PDF trimmer implemented here is (currently) somewhat shaky.
 *
 * First of all, it only looks at text in order to determine the trim height.
 * This means, that if your PDF contains non-text (e.g. images) at the bottom
 * of a page, it may get culled by this. If your footer non-text elements are
 * not dynamic, you can "fix" it by passing a larger yMargin value.
 *
 * Secondly, it uses two completely different PDF parsers in order to
 * accomplish this:
 *
 *  - pdf.js (pdfjs):   This is primarily a PDF renderer (to canvas or SVG),
 *                      but supports extracting page text elements, including
 *                      their positions (this is the feature we need).
 *
 *  - pdf-lib (pdflib): This can read and write PDF files, and you can draw new
 *                      elements on top of existing pages. However, it doesn't
 *                      seem possible to iterate graphical elements and
 *                      determine their positions (which is why we need
 *                      pdf.js). Changing page dimensions is easy (this is the
 *                      feature we need).
 *
 * AAAAND it might break for any reason. PDFs are complicated! Good luck!
 */

async function trimHeight(pathToPdf, yMargin) {
	if (yMargin === undefined) yMargin = 0;
	const pdfData = await fs.readFile(pathToPdf);

	/* Using pdf.js to find the y-coordinate of the bottom-most text
	 * element for each page */
	var pageMinimumElementY = [];
	{
		const pdfjsDocument = await pdfjs.getDocument(pdfData).promise;
		const nPages = pdfjsDocument.numPages;
		for (var pageIndex = 1; pageIndex <= nPages; pageIndex++) {
			const page = await pdfjsDocument.getPage(pageIndex);
			const text = await page.getTextContent();
			var minimumElementY = undefined;
			for (const item of text.items) {
				var y = item.transform[5];
				if (minimumElementY === undefined || y < minimumElementY) minimumElementY = y;
			}
			pageMinimumElementY.push(minimumElementY);
		}
	}

	/* Using pdf-lib to trim each page */
	const doc = await PDFDocument.load(pdfData);
	const pages = doc.getPages();
	for (const page of pages) {
		const pageHeight = page.getHeight();
		const minY = pageMinimumElementY.shift();
		const desiredHeight = pageHeight - minY + yMargin;
		const dy = page.getHeight() - desiredHeight;
		page.setHeight(desiredHeight);
		page.translateContent(0, -dy);
	}
	const dataToWrite = await doc.save();
	await fs.writeFile(pathToPdf, dataToWrite);
}

module.exports = {
	trimHeight: trimHeight,
}
