const sharp = require('sharp');

const imageProcessor = {
  async processImage(file) {
    try {
      if (!file) {
        throw new Error('No file provided');
      }

      // Basic validation
      if (!file.mimetype.startsWith('image/')) {
        throw new Error('File must be an image');
      }

      // Resize image to match ML model input size (180x180)
      const processedBuffer = await sharp(file.buffer)
        .resize(180, 180, {
          fit: 'cover',
          position: 'center'
        })
        .toFormat('jpeg')
        .toBuffer();

      return {
        buffer: processedBuffer,
        format: 'jpeg',
        width: 180,
        height: 180
      };
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  }
};

module.exports = imageProcessor;
