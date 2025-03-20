const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class ImageProcessingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ImageProcessingError';
  }
}

const imageProcessor = {
  QUALITY_THRESHOLD: 0.6,
  ALLOWED_FORMATS: ['jpeg', 'jpg', 'png'],
  MAX_SIZE: 5 * 1024 * 1024, // 5MB

  async processImage(file) {
    try {
      // Validate format
      const format = file.mimetype.split('/')[1];
      if (!this.ALLOWED_FORMATS.includes(format)) {
        throw new ImageProcessingError('Invalid image format. Allowed formats: JPG, PNG');
      }

      // Validate size
      if (file.size > this.MAX_SIZE) {
        throw new ImageProcessingError('Image size too large. Maximum size: 5MB');
      }

      // Generate unique filename
      const filename = `${uuidv4()}.${format}`;
      const uploadPath = path.join(__dirname, '../uploads', filename);

      // Process image
      const image = sharp(file.buffer);
      const metadata = await image.metadata();

      // Validate dimensions
      if (metadata.width < 224 || metadata.height < 224) {
        throw new ImageProcessingError('Image dimensions too small. Minimum: 224x224 pixels');
      }

      // Resize and normalize
      await image
        .resize(224, 224, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .normalize()
        .toFile(uploadPath);

      // Calculate quality score (basic implementation)
      const stats = await image.stats();
      const qualityScore = this._calculateQualityScore(stats);

      if (qualityScore < this.QUALITY_THRESHOLD) {
        throw new ImageProcessingError('Image quality too low. Please provide a clearer image.');
      }

      return {
        filename,
        path: uploadPath,
        metadata: {
          format,
          width: metadata.width,
          height: metadata.height,
          size: file.size,
          qualityScore
        }
      };
    } catch (error) {
      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError('Failed to process image: ' + error.message);
    }
  },

  _calculateQualityScore(stats) {
    // Basic quality assessment based on contrast and brightness
    const channels = ['r', 'g', 'b'];
    let totalContrast = 0;
    let totalBrightness = 0;

    channels.forEach(channel => {
      const { mean, stdev } = stats[channel];
      totalContrast += stdev;
      totalBrightness += mean;
    });

    const avgContrast = totalContrast / 3;
    const avgBrightness = totalBrightness / 3;

    // Normalize scores between 0 and 1
    const contrastScore = Math.min(avgContrast / 128, 1);
    const brightnessScore = 1 - Math.abs(0.5 - (avgBrightness / 255));

    return (contrastScore + brightnessScore) / 2;
  }
};

module.exports = imageProcessor;
