const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
    let filename;
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
      filename = `${uuidv4()}.${format}`;
      const uploadPath = path.join(process.cwd(), 'uploads', filename);

      // Process image
      const image = sharp(file.buffer);
      const metadata = await image.metadata();

      // Validate dimensions
      if (metadata.width < 224 || metadata.height < 224) {
        throw new ImageProcessingError('Image dimensions too small. Minimum: 224x224 pixels');
      }

      // Create a processed image instance
      const processedImage = image
        .resize(224, 224, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .normalize();

      // Get image stats before saving
      const stats = await processedImage.stats();
      const qualityScore = this._calculateQualityScore(stats);

      if (qualityScore < this.QUALITY_THRESHOLD) {
        throw new ImageProcessingError('Image quality too low. Please provide a clearer image.');
      }

      // Get processed buffer for ML analysis
      const processedBuffer = await processedImage.toBuffer();
      
      // Save the processed image
      await processedImage.toFile(uploadPath);

      return {
        filename,
        path: uploadPath,
        buffer: processedBuffer,
        metadata: {
          format,
          width: metadata.width,
          height: metadata.height,
          size: file.size,
          qualityScore
        }
      };
    } catch (error) {
      // Clean up any uploaded file if there was an error
      if (filename) {
        const uploadPath = path.join(process.cwd(), 'uploads', filename);
        if (fs.existsSync(uploadPath)) {
          fs.unlinkSync(uploadPath);
        }
      }

      if (error instanceof ImageProcessingError) {
        throw error;
      }
      throw new ImageProcessingError('Failed to process image: ' + error.message);
    }
  },

  _calculateQualityScore(stats) {
    try {
      // Basic quality assessment based on contrast and brightness
      const channels = ['r', 'g', 'b'];
      let totalContrast = 0;
      let totalBrightness = 0;

      channels.forEach(channel => {
        if (!stats.channels || !stats.channels[channel]) {
          throw new Error('Invalid image statistics');
        }
        const channelStats = stats.channels[channel];
        totalContrast += channelStats.stdev || 0;
        totalBrightness += channelStats.mean || 0;
      });

      const avgContrast = totalContrast / 3;
      const avgBrightness = totalBrightness / 3;

      // Normalize scores between 0 and 1
      const contrastScore = Math.min(avgContrast / 128, 1);
      const brightnessScore = 1 - Math.abs(0.5 - (avgBrightness / 255));

      return (contrastScore + brightnessScore) / 2;
    } catch (error) {
      console.error('Error calculating quality score:', error);
      // Return a default score if calculation fails
      return 0.7;
    }
  }
};

module.exports = imageProcessor;
