const axios = require('axios');
const FormData = require('form-data');

class MLService {
    constructor() {
        // Use ML_API_URL from environment or default to localhost
        this.apiUrl = process.env.ML_API_URL || 'http://localhost:5000';
        console.log('ML Service initialized with API URL:', this.apiUrl);
    }

    async analyzeSkin(imageBuffer) {
        try {
            console.log('Creating form data for image analysis');
            const formData = new FormData();
            
            // Append the buffer directly with filename and mimetype
            formData.append('image', imageBuffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg',
                knownLength: imageBuffer.length
            });

            console.log('Sending request to ML API:', this.apiUrl);
            const response = await axios.post(`${this.apiUrl}/predict`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json'
                },
                maxBodyLength: Infinity,
                timeout: 30000 // 30 second timeout
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
                console.error('Error Response:', {
                    status: error.response.status,
                    data: error.response.data,
                    headers: error.response.headers
                });
            } else if (error.request) {
                console.error('No response received, request:', {
                    method: error.request.method,
                    path: error.request.path,
                    headers: error.request._header
                });
            }
            throw new Error('Failed to analyze image');
        }
    }
}

module.exports = new MLService();
