const axios = require('axios');
const FormData = require('form-data');

class MLService {
    constructor() {
        this.apiUrl = 'http://localhost:5000';
        this.initialized = true;
    }

    async initialize() {
        try {
            // Test connection to Flask API
            await axios.get(this.apiUrl);
            console.log('ML API connection successful');
        } catch (error) {
            console.error('Error connecting to ML API:', error);
            throw new Error('Failed to connect to ML API');
        }
    }

    async analyzeSkin(imageBuffer) {
        try {
            // Create form data
            const formData = new FormData();
            formData.append('image', imageBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg'
            });

            // Make request to Flask API
            const response = await axios.post(`${this.apiUrl}/predict`, formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });

            // Process and format the response
            const result = {
                isEczema: response.data.eczemaPrediction === 'Eczema',
                confidence: response.data.eczemaConfidence,
                severity: response.data.eczemaSeverity,
                bodyPart: response.data.bodyPart,
                bodyPartConfidence: response.data.bodyPartConfidence
            };

            // Add recommendations or skincare tips based on diagnosis
            if (result.isEczema) {
                result.recommendations = response.data.recommendations;
            } else {
                result.skincareTips = response.data.skincareTips;
            }

            return result;
        } catch (error) {
            console.error('Error analyzing image:', error);
            throw new Error('Failed to analyze image: ' + error.message);
        }
    }
}

module.exports = new MLService();
