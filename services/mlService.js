const axios = require('axios');
const FormData = require('form-data');

class MLService {
    constructor() {
        this.apiUrl = process.env.FLASK_API_URL || 'https://eczema-model.onrender.com';
        this.initialized = true;
    }

    async analyzeSkin(imageBuffer) {
        try {
            const formData = new FormData();
            formData.append('image', imageBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg'
            });

            // Retry logic for flaky Flask service
            let attempts = 0;
            const maxAttempts = 3;
            while (attempts < maxAttempts) {
                try {
                    const response = await axios.post(`${this.apiUrl}/predict`, formData, {
                        headers: {
                            ...formData.getHeaders()
                        },
                        timeout: 60000 // 60 seconds timeout
                    });

                    // Assuming Flask returns: { eczema: boolean, confidence: number, ... }
                    const result = {
                        isEczema: response.data.eczema || false,
                        confidence: response.data.confidence || 0.5,
                        severity: response.data.severity || 'Moderate',
                        bodyPart: response.data.bodyPart || 'Unknown',
                        bodyPartConfidence: response.data.bodyPartConfidence || 0.5
                    };

                    if (result.isEczema) {
                        result.recommendations = response.data.recommendations || ['Moisturize regularly'];
                    } else {
                        result.skincareTips = response.data.skincareTips || ['Maintain skin hydration'];
                    }

                    console.log('ML Analysis Result:', result);
                    return result;
                } catch (error) {
                    attempts++;
                    if (attempts === maxAttempts) {
                        throw error;
                    }
                    console.warn(`Retry ${attempts}/${maxAttempts} due to error:`, error.message);
                    await new Promise(resolve => setTimeout(resolve, 2000 * attempts)); // Exponential backoff
                }
            }
        } catch (error) {
            console.error('Error analyzing image:', error.stack);
            throw new Error('Failed to analyze image: ' + error.message);
        }
    }
}

module.exports = new MLService();