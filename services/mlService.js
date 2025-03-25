const sharp = require('sharp');
const path = require('path');

class MLService {
    constructor() {
        this.initialized = true; // Always initialized in mock mode
    }

    async initialize() {
        return Promise.resolve();
    }

    async analyzeSkin(imageBuffer) {
        try {
            // Process image with sharp to ensure it's valid
            await sharp(imageBuffer)
                .resize(224, 224)
                .toBuffer();

            // Return mock analysis results
            return {
                severity: 'moderate',
                confidence: 0.85,
                recommendations: [
                    'Keep the affected area moisturized',
                    'Avoid known triggers',
                    'Consider using over-the-counter hydrocortisone cream'
                ],
                requiresDoctorReview: true
            };
        } catch (error) {
            console.error('Error processing image:', error);
            throw new Error('Failed to process image');
        }
    }
}

module.exports = new MLService();
