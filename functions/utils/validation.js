function validatePdfParsingInput(body) {
  const { filePathInStorage, tenantId, userId, userEmail } = body;
  
  if (!filePathInStorage || typeof filePathInStorage !== 'string') {
    throw new Error('Invalid or missing filePathInStorage');
  }
  
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid or missing tenantId');
  }
  
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid or missing userId');
  }
  
  if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
    throw new Error('Invalid or missing userEmail');
  }
  
  if (!filePathInStorage.endsWith('.pdf')) {
    throw new Error('File must be a PDF');
  }
  
  return true;
}

module.exports = { validatePdfParsingInput };