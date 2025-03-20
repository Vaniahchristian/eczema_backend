const tf = require('@tensorflow/tfjs-node');
const sharp = require('sharp');
const path = require('path');

class MLService {
    constructor() {
        this.model = null;
        this.modelPath = path.join(__dirname, '../models/ml/eczema_model');
        this.initialized = false;
    }

    async initialize() {
        try {
            if (!this.initialized) {
                this.model = await tf.loadLayersModel(`file://${this.modelPath}/model.json`);
                this.initialized = true;
                console.log('ML model loaded successfully');
            }
        } catch (error) {
            console.error('Failed to load ML model:', error);
            throw new Error('ML model initialization failed');
        }
    }

    async analyzeSkin(imageBuffer) {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Preprocess image
            const processedImage = await this.preprocessImage(imageBuffer);
            
            // Make prediction
            const prediction = await this.model.predict(processedImage);
            const results = await prediction.array();

            // Process results
            return this.interpretResults(results[0]);
        } catch (error) {
            console.error('Analysis error:', error);
            throw new Error('Failed to analyze skin image');
        }
    }

    async preprocessImage(imageBuffer) {
        try {
            // Resize and normalize image
            const image = await sharp(imageBuffer)
                .resize(224, 224, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
                .raw()
                .toBuffer();

            // Convert to tensor
            const tensor = tf.tensor3d(new Uint8Array(image), [224, 224, 3])
                .cast('float32')
                .div(255.0)
                .expandDims(0);

            return tensor;
        } catch (error) {
            console.error('Preprocessing error:', error);
            throw new Error('Failed to preprocess image');
        }
    }

    interpretResults(results) {
        // Define severity thresholds
        const SEVERITY_THRESHOLDS = {
            mild: 0.3,
            moderate: 0.6,
            severe: 0.8
        };

        // Define confidence thresholds
        const CONFIDENCE_THRESHOLD = 0.5;

        // Get the highest probability and its index
        const maxProb = Math.max(...results);
        const predictionIndex = results.indexOf(maxProb);

        // Determine severity based on probability
        let severity;
        if (maxProb >= SEVERITY_THRESHOLDS.severe) {
            severity = 'severe';
        } else if (maxProb >= SEVERITY_THRESHOLDS.moderate) {
            severity = 'moderate';
        } else if (maxProb >= SEVERITY_THRESHOLDS.mild) {
            severity = 'mild';
        } else {
            severity = 'unclear';
        }

        // Generate recommendations based on severity
        const recommendations = this.generateRecommendations(severity);

        return {
            isEczema: maxProb >= CONFIDENCE_THRESHOLD,
            confidence: maxProb,
            severity,
            recommendations,
            needsDoctorReview: severity === 'severe' || maxProb < CONFIDENCE_THRESHOLD
        };
    }

    generateRecommendations(severity) {
        const recommendations = {
            mild: [
                'Keep the affected area moisturized',
                'Avoid known triggers',
                'Use over-the-counter hydrocortisone cream',
                'Take lukewarm baths',
                'Wear soft, breathable clothing'
            ],
            moderate: [
                'Apply prescribed topical treatments',
                'Consider wet wrap therapy',
                'Identify and eliminate triggers',
                'Follow a regular skincare routine',
                'Schedule follow-up with healthcare provider'
            ],
            severe: [
                'Seek immediate medical attention',
                'Follow prescribed treatment plan strictly',
                'Document symptoms and triggers',
                'Consider phototherapy treatment',
                'Regular monitoring by healthcare provider'
            ],
            unclear: [
                'Consult with a healthcare provider',
                'Document your symptoms',
                'Take clear photos of affected areas',
                'Note any recent changes or triggers',
                'Maintain general skin care routine'
            ]
        };

        return recommendations[severity] || recommendations.unclear;
    }
}

module.exports = new MLService();
