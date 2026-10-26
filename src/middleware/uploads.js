const path = require("path");
const multer = require("multer");
function createUpload(extensions) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 },
    fileFilter(_req, file, cb) {
      if (!extensions.includes(path.extname(file.originalname).toLowerCase())) {
        return cb(Object.assign(new Error("Extensión no permitida. Use: " + extensions.join(", ")), { status: 400 }));
      }
      cb(null, true);
    },
  });
}
module.exports = {
  upload: createUpload([".xlsx", ".xlsm", ".enc"]),
  uploadEncrypted: createUpload([".enc"]),
};
