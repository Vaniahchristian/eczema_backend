const axios = require('axios');
const FormData = require('form-data');

class MLService {
    constructor() {
        this.apiUrl = 'http://localhost:5000';
    }

    async analyzeSkin(imageBuffer) {
        try {
            const formData = new FormData();
            formData.append('image', imageBuffer);

            const response = await axios.post(`${this.apiUrl}/predict`, formData);
            
            return {
                isEczema: response.data.eczemaPrediction === 'Eczema',
                confidence: response.data.eczemaConfidence || 0,
                severity: response.data.eczemaSeverity || 'Unknown',
                bodyPart: response.data.bodyPart || 'Unknown',
                bodyPartConfidence: response.data.bodyPartConfidence || 0,
                recommendations: response.data.recommendations || [],
                skincareTips: response.data.skincareTips || []
            };
        } catch (error) {
            console.error('ML Service Error:', error.message);
            throw new Error('Failed to analyze image');
        }
    }
}

module.exports = new MLService();
