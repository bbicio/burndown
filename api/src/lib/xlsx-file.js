const XLSX_FILE_ERROR = 'Only .xlsx files are accepted';
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

function xlsxFileError(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < ZIP_SIGNATURE.length) return XLSX_FILE_ERROR;
  return buffer.subarray(0, ZIP_SIGNATURE.length).equals(ZIP_SIGNATURE) ? null : XLSX_FILE_ERROR;
}

module.exports = { xlsxFileError, XLSX_FILE_ERROR };
