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
            // Create form data with proper file field
            const formData = new FormData();
            
            // Create a Buffer from the image data if it's not already a Buffer
            const buffer = Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer);
            
            // Append as a proper file with correct field name matching Flask's request.files['image']
            formData.append('image', buffer, {
                filename: 'image.jpg',
                contentType: 'image/jpeg',
                knownLength: buffer.length
            });

            // Make request to Flask API with proper headers and configuration
            const response = await axios.post(`${this.apiUrl}/predict`, formData, {
                headers: {
                    ...formData.getHeaders(),
                    'Accept': 'application/json',
                    'Content-Length': formData.getLengthSync()
                },
                maxContentLength: Infinity,
                maxBodyLength: Infinity,
                timeout: 30000 // 30 second timeout for ML processing
            });

            // Process and format the response based on Flask app's JSON structure
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
            if (error.response) {
                // Log detailed error information
                console.error('Error response:', {
                    status: error.response.status,
                    data: error.response.data
                });
                throw new Error(`Failed to analyze image: ${error.response.data.error || error.message}`);
            }
            throw new Error('Failed to analyze image: ' + error.message);
        }
    }
}

module.exports = new MLService();
