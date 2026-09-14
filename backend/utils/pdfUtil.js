function setPdfHeaders(res, filename = 'document.pdf', disposition = 'attachment') {  //how the browser should handle the file
  res.set({
    'Content-Type': 'application/pdf', // Tells browser that the response content is a PDF file
    'Content-Disposition': `${disposition}; filename="${filename}"`,  // Controls whether PDF should be downloaded or opened in browser
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', // Prevents browser from caching/storing old PDF versions
  });
}

module.exports = {
  setPdfHeaders,
};
