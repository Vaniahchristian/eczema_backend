const { MySQL, Mongo } = require('../models');
const { User } = MySQL;
const { Diagnosis, Analytics } = Mongo;

// Get age distribution of eczema cases
exports.getAgeDistribution = async (req, res) => {
    try {
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'patient_id',
                    foreignField: 'user_id',
                    as: 'patient'
                }
            },
            {
                $group: {
                    _id: {
                        $floor: {
                            $divide: [
                                { $subtract: [new Date(), '$patient.date_of_birth'] },
                                365.25 * 24 * 60 * 60 * 1000
                            ]
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ];

        const ageDistribution = await Diagnosis.aggregate(pipeline);

        res.json({
            success: true,
            data: {
                ageGroups: ageDistribution.map(group => ({
                    ageRange: `${group._id}-${group._id + 9}`,
                    count: group.count
                }))
            }
        });
    } catch (error) {
        console.error('Age distribution error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching age distribution',
            error: error.message
        });
    }
};

// Get geographical distribution of cases
exports.getGeographicalDistribution = async (req, res) => {
    try {
        const pipeline = [
            {
                $lookup: {
                    from: 'users',
                    localField: 'patient_id',
                    foreignField: 'user_id',
                    as: 'patient'
                }
            },
            {
                $group: {
                    _id: '$patient.address',
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { 'count': -1 }
            }
        ];

        const geoDistribution = await Diagnosis.aggregate(pipeline);

        res.json({
            success: true,
            data: {
                regions: geoDistribution.map(region => ({
                    location: region._id,
                    count: region.count
                }))
            }
        });
    } catch (error) {
        console.error('Geographical distribution error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching geographical distribution',
            error: error.message
        });
    }
};

// Get treatment effectiveness statistics
exports.getTreatmentEffectiveness = async (req, res) => {
    try {
        const pipeline = [
            {
                $group: {
                    _id: '$treatment.type',
                    totalCases: { $sum: 1 },
                    improvedCases: {
                        $sum: {
                            $cond: [{ $eq: ['$treatment.outcome', 'improved'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $project: {
                    treatmentType: '$_id',
                    effectiveness: {
                        $multiply: [
                            { $divide: ['$improvedCases', '$totalCases'] },
                            100
                        ]
                    },
                    totalCases: 1
                }
            },
            {
                $sort: { 'effectiveness': -1 }
            }
        ];

        const treatmentStats = await Diagnosis.aggregate(pipeline);

        res.json({
            success: true,
            data: {
                treatments: treatmentStats.map(stat => ({
                    type: stat.treatmentType,
                    effectiveness: Math.round(stat.effectiveness * 100) / 100,
                    totalCases: stat.totalCases
                }))
            }
        });
    } catch (error) {
        console.error('Treatment effectiveness error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching treatment effectiveness',
            error: error.message
        });
    }
};

// Get ML model confidence distribution
exports.getModelConfidence = async (req, res) => {
    try {
        const pipeline = [
            {
                $group: {
                    _id: {
                        $switch: {
                            branches: [
                                { case: { $lte: ['$confidence', 0.6] }, then: 'low' },
                                { case: { $lte: ['$confidence', 0.8] }, then: 'medium' },
                                { case: { $lte: ['$confidence', 0.9] }, then: 'high' }
                            ],
                            default: 'very_high'
                        }
                    },
                    count: { $sum: 1 },
                    avgConfidence: { $avg: '$confidence' }
                }
            },
            {
                $sort: { 'avgConfidence': 1 }
            }
        ];

        const confidenceStats = await Diagnosis.aggregate(pipeline);

        res.json({
            success: true,
            data: {
                confidenceLevels: confidenceStats.map(stat => ({
                    level: stat._id,
                    count: stat.count,
                    averageConfidence: Math.round(stat.avgConfidence * 100) / 100
                }))
            }
        });
    } catch (error) {
        console.error('Model confidence error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching model confidence distribution',
            error: error.message
        });
    }
};

// Get diagnosis history with trends
exports.getDiagnosisHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const pipeline = [
            {
                $match: {
                    created_at: {
                        $gte: new Date(startDate || new Date().setMonth(new Date().getMonth() - 1)),
                        $lte: new Date(endDate || new Date())
                    }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$created_at'
                        }
                    },
                    totalCases: { $sum: 1 },
                    severeCases: {
                        $sum: {
                            $cond: [{ $eq: ['$severity', 'severe'] }, 1, 0]
                        }
                    }
                }
            },
            {
                $sort: { '_id': 1 }
            }
        ];

        const diagnosisHistory = await Diagnosis.aggregate(pipeline);

        res.json({
            success: true,
            data: {
                history: diagnosisHistory.map(day => ({
                    date: day._id,
                    totalCases: day.totalCases,
                    severeCases: day.severeCases
                }))
            }
        });
    } catch (error) {
        console.error('Diagnosis history error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis history',
            error: error.message
        });
    }
};
