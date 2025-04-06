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

            return response.data;
        } catch (error) {
            console.error('Error analyzing image:', error);
            throw new Error('Failed to analyze image: ' + error.message);
        }
    }
}

module.exports = new MLService();
