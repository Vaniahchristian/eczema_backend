const axios = require('axios');
const FormData = require('form-data');

class MLService {
    constructor() {
        this.apiUrl = 'http://localhost:5000';
    }

    async analyzeSkin(imageBuffer) {
        try {
            console.log('Creating form data for image analysis');
            const formData = new FormData();
            
            // Create a proper file object
            const blob = new Blob([imageBuffer], { type: 'image/jpeg' });
            formData.append('image', blob, 'image.jpg');

            console.log('Sending request to ML API');
            const response = await axios.post(`${this.apiUrl}/predict`, formData, {
                headers: {
                    ...formData.getHeaders()
                }
            });
            
            console.log('Received response:', response.data);
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
            if (error.response) {
                console.error('Error Response:', error.response.data);
            }
            throw new Error('Failed to analyze image');
        }
    }
}

module.exports = new MLService();
