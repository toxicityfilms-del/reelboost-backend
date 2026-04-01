const { Router } = require('express');
const { body } = require('express-validator');
const multer = require('multer');
const { analyze, analyzeMedia } = require('../controllers/postController');

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB
});

router.post(
  '/analyze',
  [
    body('idea').optional().isString(),
    body('imageBase64').optional().isString(),
    body('niche').optional().isString().trim(),
    body('bio').optional().isString().trim(),
    body().custom((value, { req }) => {
      const idea = (req.body.idea || '').trim();
      const img = (req.body.imageBase64 || '').trim();
      if (!idea && !img) {
        throw new Error('Provide an idea and/or imageBase64');
      }
      if (img.length > 14 * 1024 * 1024) {
        throw new Error('imageBase64 payload too large (max ~14MB)');
      }
      return true;
    }),
  ],
  analyze
);

router.post(
  '/analyze-media',
  upload.single('media'),
  [
    body('niche').optional().isString().trim(),
    body('bio').optional().isString().trim(),
    body('notes').optional().isString(),
    body('thumbnailDataUrl').optional().isString(),
    body().custom((value, { req }) => {
      if (!req.file) {
        throw new Error('Provide multipart field "media" (image or video)');
      }
      const mime = String(req.file.mimetype || '');
      const isImage = mime.startsWith('image/');
      const isVideo = mime.startsWith('video/');
      if (!isImage && !isVideo) {
        throw new Error('Unsupported media type. Upload image/* or video/*');
      }
      const thumb = String(req.body.thumbnailDataUrl || '').trim();
      if (isVideo && !thumb) {
        throw new Error('For video uploads, provide thumbnailDataUrl (data:image/...;base64,...)');
      }
      if (thumb.length > 14 * 1024 * 1024) {
        throw new Error('thumbnailDataUrl payload too large (max ~14MB)');
      }
      return true;
    }),
  ],
  analyzeMedia
);

module.exports = router;
