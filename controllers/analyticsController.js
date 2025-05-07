const { MySQL: { User, Patient, Treatment, Appointment, DoctorProfile }, sequelize } = require('../models/index');
const Message = require('../models/mongodb/Message');
const Diagnosis = require('../models/mongodb/Diagnosis');
const analyticsService = require('../services/analyticsService');

const { logOperation, logger } = require('../middleware/logger');

const moment = require('moment');
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

// Get age distribution
exports.getAgeDistribution = async (req, res) => {
    try {
        const result = await User.findAll({
            attributes: [
                [sequelize.literal(`
                    CASE 
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 18 THEN 'Under 18'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN '18-30'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 31 AND 50 THEN '31-50'
                        ELSE 'Over 50'
                    END
                `), 'age_group'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: ['age_group']
        });

        res.json({
            success: true,
            data: {
                ageGroups: result
            }
        });
    } catch (error) {
        logger.error('Error in getAgeDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching age distribution',
            error: error.message
        });
    }
};

// Get geographical distribution
exports.getGeographicalDistribution = async (req, res) => {
    try {
        const result = await Patient.findAll({
            attributes: [
                'region',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: {
                region: {
                    [Op.not]: null
                }
            },
            group: ['region']
        });

        res.json({
            success: true,
            data: {
                regions: result
            }
        });
    } catch (error) {
        logger.error('Error in getGeographicalDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching geographical distribution',
            error: error.message
        });
    }
};

// Get severity distribution
exports.getSeverityDistribution = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: '$mlResults.severity',
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                severityLevels: result
            }
        });
    } catch (error) {
        logger.error('Error in getSeverityDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching severity distribution',
            error: error.message
        });
    }
};

// Get treatment effectiveness
exports.getTreatmentEffectiveness = async (req, res) => {
    try {
        const result = await Treatment.findAll({
            attributes: [
                'treatment_type',
                [sequelize.fn('COUNT', '*'), 'total_count'],
                [sequelize.literal('COUNT(CASE WHEN outcome = "improved" THEN 1 END)'), 'success_count'],
                [sequelize.literal('(COUNT(CASE WHEN outcome = "improved" THEN 1 END) * 100.0 / COUNT(*))'), 'success_rate']
            ],
            group: ['treatment_type']
        });

        res.json({
            success: true,
            data: {
                treatments: result
            }
        });
    } catch (error) {
        logger.error('Error in getTreatmentEffectiveness:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching treatment effectiveness',
            error: error.message
        });
    }
};

// Get diagnosis trends
exports.getDiagnosisTrends = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } },
                    count: { $sum: 1 },
                    avg_severity: { $avg: "$mlResults.severity" }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json({
            success: true,
            data: {
                trends: result
            }
        });
    } catch (error) {
        logger.error('Error in getDiagnosisTrends:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis trends',
            error: error.message
        });
    }
};

// Get survey analytics from diagnoses (pre and post)
exports.getSurveyAnalytics = async (req, res) => {
    try {
        // Aggregate POST-diagnosis survey
        const postResult = await Diagnosis.aggregate([
            { $match: { postDiagnosisSurvey: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    avgDiagnosisAccuracy: { $avg: "$postDiagnosisSurvey.diagnosisAccuracy" },
                    avgDiagnosisHelpfulness: { $avg: "$postDiagnosisSurvey.diagnosisHelpfulness" },
                    avgTreatmentClarity: { $avg: "$postDiagnosisSurvey.treatmentClarity" },
                    avgUserConfidence: { $avg: "$postDiagnosisSurvey.userConfidence" },
                    wouldRecommendCount: { $sum: { $cond: [{ $eq: ["$postDiagnosisSurvey.wouldRecommend", true] }, 1, 0] } }
                }
            }
        ]);

        // Aggregate PRE-diagnosis survey
        const preResult = await Diagnosis.aggregate([
            { $match: { preDiagnosisSurvey: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    eczemaHistory: { $push: "$preDiagnosisSurvey.eczemaHistory" },
                    lastFlareup: { $push: "$preDiagnosisSurvey.lastFlareup" },
                    flareupTriggers: { $push: "$preDiagnosisSurvey.flareupTriggers" },
                    currentSymptoms: { $push: "$preDiagnosisSurvey.currentSymptoms" },
                    previousTreatments: { $push: "$preDiagnosisSurvey.previousTreatments" },
                    preSeverity: { $push: "$preDiagnosisSurvey.severity" }
                }
            }
        ]);

        // --- Flare-up Trigger Analytics ---
        // Unwind and count most common triggers
        const triggerAgg = await Diagnosis.aggregate([
            { $match: { "preDiagnosisSurvey.flareupTriggers": { $exists: true, $ne: [] } } },
            { $unwind: "$preDiagnosisSurvey.flareupTriggers" },
            { $group: { _id: "$preDiagnosisSurvey.flareupTriggers", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);

        // Optionally, you can add more aggregation (e.g., counts per category) here for frontend charting

        res.json({
            success: true,
            data: {
                postDiagnosisSurvey: postResult[0] || {},
                preDiagnosisSurvey: {
                    ...(preResult[0] || {}),
                    topFlareupTriggers: triggerAgg
                }
            }
        });
    } catch (error) {
        logger.error('Error in getSurveyAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching survey analytics',
            error: error.message
        });
    }
};

// Get correlation analytics
exports.getCorrelationAnalytics = async (req, res) => {
    try {
        const result = await Diagnosis.aggregate([
            {
                $group: {
                    _id: { severity: "$mlResults.severity", weather_condition: "$weather_condition" },
                    count: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                correlations: result
            }
        });
    } catch (error) {
        logger.error('Error in getCorrelationAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching correlation analytics',
            error: error.message
        });
    }
};

// Get daily active users
exports.getDailyActiveUsers = async (req, res) => {
    try {
        const { start, end } = req.query;
        const result = await User.findAll({
            attributes: [
                [sequelize.fn('DATE', sequelize.col('last_login_at')), 'date'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: {
                last_login_at: {
                    [Op.between]: [new Date(start), new Date(end)]
                }
            },
            group: [sequelize.fn('DATE', sequelize.col('last_login_at'))],
            order: [[sequelize.fn('DATE', sequelize.col('last_login_at')), 'ASC']]
        });

        res.json(result);
    } catch (error) {
        logger.error('Error in getDailyActiveUsers:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching daily active users',
            error: error.message
        });
    }
};

// Get hourly diagnosis distribution
exports.getHourlyDiagnosisDistribution = async (req, res) => {
    try {
        const { start, end } = req.query;
        const result = await Diagnosis.aggregate([
            {
                $match: {
                    created_at: { $gte: new Date(start), $lte: new Date(end) }
                }
            },
            {
                $group: {
                    _id: { $hour: "$created_at" },
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.json(result);
    } catch (error) {
        logger.error('Error in getHourlyDiagnosisDistribution:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching hourly diagnosis distribution',
            error: error.message
        });
    }
};

// Get user retention
exports.getUserRetention = async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = moment(start);
        const endDate = moment(end);
        const weeks = [];

        while (startDate.isBefore(endDate)) {
            const weekStart = startDate.clone().startOf('week');
            const weekEnd = startDate.clone().endOf('week');

            const [totalUsers, retainedUsers] = await Promise.all([
                User.count({
                    where: {
                        created_at: {
                            [Op.lte]: weekEnd.toDate()
                        }
                    }
                }),
                User.count({
                    where: {
                        created_at: {
                            [Op.lte]: weekEnd.toDate()
                        },
                        last_login_at: {
                            [Op.between]: [weekStart.toDate(), weekEnd.toDate()]
                        }
                    }
                })
            ]);

            weeks.push({
                week: weekStart.format('YYYY-MM-DD'),
                total: totalUsers,
                retained: retainedUsers
            });

            startDate.add(1, 'week');
        }

        res.json(weeks);
    } catch (error) {
        logger.error('Error in getUserRetention:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user retention',
            error: error.message
        });
    }
};

// Get user activity
exports.getUserActivity = async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = moment(start);
        const endDate = moment(end);
        const days = [];

        while (startDate.isBefore(endDate)) {
            const dayStart = startDate.clone().startOf('day');
            const dayEnd = startDate.clone().endOf('day');

            const [diagnoses, messages, appointments] = await Promise.all([
                Diagnosis.countDocuments({
                    created_at: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() }
                }),
                Message.countDocuments({
                    createdAt: { $gte: dayStart.toDate(), $lte: dayEnd.toDate() }
                }),
                Appointment.count({
                    where: {
                        appointment_date: {
                            [Op.between]: [dayStart.toDate(), dayEnd.toDate()]
                        }
                    }
                })
            ]);

            days.push({
                date: dayStart.format('YYYY-MM-DD'),
                diagnoses,
                messages,
                appointments
            });

            startDate.add(1, 'day');
        }

        res.json(days);
    } catch (error) {
        logger.error('Error in getUserActivity:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching user activity',
            error: error.message
        });
    }
};

// Get model confidence distribution, overall average, and average by severity
exports.getModelConfidence = async (req, res) => {
    try {
        // Distribution buckets
        const distribution = await Diagnosis.aggregate([
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $gte: ["$mlResults.confidence", 0.9] },
                            then: "Very High",
                            else: {
                                $cond: {
                                    if: { $gte: ["$mlResults.confidence", 0.7] },
                                    then: "High",
                                    else: {
                                        $cond: {
                                            if: { $gte: ["$mlResults.confidence", 0.5] },
                                            then: "Moderate",
                                            else: "Low"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Overall average model confidence
        const avgResult = await Diagnosis.aggregate([
            {
                $group: {
                    _id: null,
                    avgConfidence: { $avg: "$mlResults.confidence" }
                }
            }
        ]);
        const averageConfidence = avgResult.length > 0 ? avgResult[0].avgConfidence : null;

        // Average model confidence by severity (mild, moderate, severe)
        const bySeverity = await Diagnosis.aggregate([
            {
                $group: {
                    _id: "$mlResults.severity",
                    avgConfidence: { $avg: "$mlResults.confidence" },
                    count: { $sum: 1 }
                }
            }
        ]);
        // Format as { mild: ..., moderate: ..., severe: ... }
        const averageConfidenceBySeverity = {};
        bySeverity.forEach(item => {
            if (item._id) averageConfidenceBySeverity[item._id] = {
                avgConfidence: item.avgConfidence,
                count: item.count
            };
        });

        res.json({
            success: true,
            data: {
                confidenceLevels: distribution,
                averageConfidence,
                averageConfidenceBySeverity
            }
        });
    } catch (error) {
        logger.error('Error in getModelConfidence:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching model confidence distribution',
            error: error.message
        });
    }
};

// Get diagnosis history
exports.getDiagnosisHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const userId = req.user.id;

        const diagnoses = await Diagnosis.find({
            user_id: userId,
            ...(startDate && endDate ? {
                created_at: { $gte: new Date(startDate), $lte: new Date(endDate) }
            } : {})
        }).sort({ created_at: -1 });

        res.json({
            success: true,
            data: {
                history: diagnoses
            }
        });
    } catch (error) {
        logger.error('Error in getDiagnosisHistory:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnosis history',
            error: error.message
        });
    }
};

// List all diagnoses
exports.listAllDiagnoses = async (req, res) => {
    try {
        const diagnoses = await Diagnosis.find({});
        res.json({
            success: true,
            count: diagnoses.length,
            data: diagnoses
        });
    } catch (error) {
        logger.error('Error in listAllDiagnoses:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching diagnoses',
            error: error.message
        });
    }
};

// Combined analytics endpoint
exports.getCombinedAnalytics = async (req, res) => {
    try {
        console.log('[Backend] getCombinedAnalytics called by user:', req.user?.id || 'anonymous');
        // Age Distribution
        const ageResult = await User.findAll({
            attributes: [
                [sequelize.literal(`
                    CASE 
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) < 18 THEN 'Under 18'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 18 AND 30 THEN '18-30'
                        WHEN TIMESTAMPDIFF(YEAR, date_of_birth, CURDATE()) BETWEEN 31 AND 50 THEN '31-50'
                        ELSE 'Over 50'
                    END
                `), 'age_group'],
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            group: [sequelize.literal('age_group')]
        });
        console.log('[Backend] Age distribution result:', ageResult);

        // Geographical Distribution
        const geoResult = await Patient.findAll({
            attributes: [
                'region',
                [sequelize.fn('COUNT', '*'), 'count']
            ],
            where: { region: { [Op.not]: null } },
            group: ['region']
        });
        console.log('[Backend] Geographical distribution result:', geoResult);

        // Severity Distribution
        const severityResult = await Diagnosis.aggregate([
            { $group: { _id: '$mlResults.severity', count: { $sum: 1 } } }
        ]);
        console.log('[Backend] Severity distribution result:', severityResult);

        // Treatment Effectiveness
        const treatmentResult = await Treatment.findAll({
            attributes: [
                'treatment_type',
                [sequelize.fn('COUNT', '*'), 'total_count'],
                [sequelize.literal('COUNT(CASE WHEN outcome = "improved" THEN 1 END)'), 'success_count'],
                [sequelize.literal('(COUNT(CASE WHEN outcome = "improved" THEN 1 END) * 100.0 / COUNT(*))'), 'success_rate']
            ],
            group: ['treatment_type']
        });
        console.log('[Backend] Treatment effectiveness result:', treatmentResult);

        // Diagnosis Trends
        const trendsResult = await Diagnosis.aggregate([
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$created_at" } },
                    count: { $sum: 1 },
                    avg_severity: { $avg: "$mlResults.severity" }
                }
            },
            { $sort: { _id: 1 } }
        ]);
        console.log('[Backend] Diagnosis trends result:', trendsResult);

        // Model Confidence
        const confidenceResult = await Diagnosis.aggregate([
            {
                $group: {
                    _id: {
                        $cond: {
                            if: { $gte: ["$mlResults.confidence", 0.9] },
                            then: "Very High",
                            else: {
                                $cond: {
                                    if: { $gte: ["$mlResults.confidence", 0.7] },
                                    then: "High",
                                    else: {
                                        $cond: {
                                            if: { $gte: ["$mlResults.confidence", 0.5] },
                                            then: "Moderate",
                                            else: "Low"
                                        }
                                    }
                                }
                            }
                        }
                    },
                    count: { $sum: 1 }
                }
            }
        ]);
        console.log('[Backend] Model confidence result:', confidenceResult);

        // Most Commonly Affected Body Parts
        const affectedAreasResult = await Diagnosis.aggregate([
            { $unwind: "$mlResults.affectedAreas" },
            { $group: { _id: "$mlResults.affectedAreas", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        console.log('[Backend] Most commonly affected areas result:', affectedAreasResult);

        // Most Common Treatments Recommended
        const recommendedTreatmentsResult = await Diagnosis.aggregate([
            { $unwind: "$mlResults.recommendations.treatments" },
            { $group: { _id: "$mlResults.recommendations.treatments", count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 5 }
        ]);
        console.log('[Backend] Most common treatments result:', recommendedTreatmentsResult);

        // Diagnosis History (last 10 for global analytics)
        const diagnosisHistoryResult = await Diagnosis.find({}).sort({ created_at: -1 }).limit(10);
        console.log('[Backend] Diagnosis history result:', diagnosisHistoryResult);

        // --- Doctor Analytics ---
        // Doctor profiles
        const doctorProfiles = await DoctorProfile.findAll({
            attributes: ['id', 'user_id', 'specialty', 'rating', 'experience_years'],
            raw: true
        });

        // Doctor analytics by doctor
        const doctorAnalytics = [];
        for (const doc of doctorProfiles) {
            // Appointments per doctor
            const totalAppointments = await Appointment.count({ where: { doctor_id: doc.id } });
            const completedAppointments = await Appointment.count({ where: { doctor_id: doc.id, status: 'completed' } });
            const cancelledAppointments = await Appointment.count({ where: { doctor_id: doc.id, status: 'cancelled' } });
            // Unique patients per doctor
            const uniquePatients = await Appointment.count({
                where: { doctor_id: doc.id },
                distinct: true,
                col: 'patient_id'
            });
            // Diagnoses reviewed by doctor (MongoDB)
            const reviewedDiagnoses = await Diagnosis.countDocuments({ 'doctorReview.doctorId': doc.id });
            doctorAnalytics.push({
                doctorId: doc.id,
                userId: doc.user_id,
                specialty: doc.specialty,
                rating: doc.rating,
                experience_years: doc.experience_years,
                totalAppointments,
                completedAppointments,
                cancelledAppointments,
                uniquePatients,
                reviewedDiagnoses
            });
        }

        // --- Admin/Global Analytics: Appointments ---
        const totalAppointments = await Appointment.count();
        const completedAppointments = await Appointment.count({ where: { status: 'completed' } });
        const cancelledAppointments = await Appointment.count({ where: { status: 'cancelled' } });
        const pendingAppointments = await Appointment.count({ where: { status: 'pending' } });
        const confirmedAppointments = await Appointment.count({ where: { status: 'confirmed' } });

        // --- Admin/Global Analytics: Users ---
        const totalUsers = await User.count();
        const totalPatients = await User.count({ where: { role: 'patient' } });
        const totalDoctors = await User.count({ where: { role: 'doctor' } });
        const totalAdmins = await User.count({ where: { role: 'admin' } });
        const totalResearchers = await User.count({ where: { role: 'researcher' } });

        // --- Admin/Global Analytics: Diagnoses ---
        const totalDiagnoses = await Diagnosis.countDocuments();
        // Diagnoses by severity (MongoDB)
        const diagnosesBySeverityAgg = await Diagnosis.aggregate([
            { $group: { _id: '$mlResults.severity', count: { $sum: 1 } } }
        ]);
        const diagnosesBySeverity = {};
        diagnosesBySeverityAgg.forEach(item => {
            if (item._id) diagnosesBySeverity[item._id] = item.count;
        });
        // Diagnoses by confidence
        const diagnosesByConfidenceAgg = await Diagnosis.aggregate([
            { $bucket: {
                groupBy: "$mlResults.confidence",
                boundaries: [0, 0.5, 0.7, 0.9, 1.01],
                default: "unknown",
                output: { count: { $sum: 1 } }
            }}
        ]);
        const diagnosesByConfidence = {};
        diagnosesByConfidenceAgg.forEach(item => {
            if (typeof item._id === 'number' || typeof item._id === 'string') diagnosesByConfidence[item._id] = item.count;
        });

        // --- Admin/Global Analytics: Reviews (check if model exists) ---
        let totalReviews = null;
        let averageReviewRating = null;
        try {
            const Review = require('../models/mysql/review.model');
            totalReviews = await Review.count();
            averageReviewRating = await Review.aggregate('rating', 'avg');
        } catch (e) {
            // No review model exists
        }

        res.json({
            success: true,
            data: {
                ageDistribution: ageResult,
                geographicalDistribution: geoResult,
                severityDistribution: severityResult,
                treatmentEffectiveness: treatmentResult,
                diagnosisTrends: trendsResult,
                modelConfidence: confidenceResult,
                mostCommonAffectedAreas: affectedAreasResult,
                mostCommonTreatments: recommendedTreatmentsResult,
                diagnosisHistory: diagnosisHistoryResult,
                doctorAnalytics: {
                    doctors: doctorAnalytics
                },
                adminAnalytics: {
                    appointments: {
                        total: totalAppointments,
                        completed: completedAppointments,
                        cancelled: cancelledAppointments,
                        pending: pendingAppointments,
                        confirmed: confirmedAppointments
                    },
                    users: {
                        total: totalUsers,
                        patients: totalPatients,
                        doctors: totalDoctors,
                        admins: totalAdmins,
                        researchers: totalResearchers
                    },
                    reviews: {
                        total: totalReviews,
                        averageRating: averageReviewRating
                    },
                    diagnoses: {
                        total: totalDiagnoses,
                        bySeverity: diagnosesBySeverity,
                        byConfidence: diagnosesByConfidence
                    }
                }
            }
        });
        console.log('[Backend] getCombinedAnalytics response sent');
    } catch (error) {
        console.error('[Backend] Error in getCombinedAnalytics:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching combined analytics',
            error: error.message
        });
    }
};

// --- Doctor Analytics Endpoints ---
exports.getDoctorPerformance = async (req, res) => {
    try {
        const doctorId = req.query.doctorId || req.user?.id;
        if (!doctorId) {
            return res.status(400).json({ success: false, message: 'doctorId is required' });
        }
        // Gather performance metrics for the doctor
        // 1. Total appointments
        // 2. Completed appointments
        // 3. Cancelled appointments
        // 4. Average rating (from doctor profile)
        // 5. Unique patients seen
        const [totalAppointments, completedAppointments, cancelledAppointments, uniquePatients, doctorProfile] = await Promise.all([
            Appointment.count({ where: { doctor_id: doctorId } }),
            Appointment.count({ where: { doctor_id: doctorId, status: 'completed' } }),
            Appointment.count({ where: { doctor_id: doctorId, status: 'cancelled' } }),
            Appointment.count({
                where: { doctor_id: doctorId },
                distinct: true,
                col: 'patient_id'
            }),
            DoctorProfile.findOne({ where: { user_id: doctorId } })
        ]);
        res.json({
            success: true,
            data: {
                totalAppointments,
                completedAppointments,
                cancelledAppointments,
                uniquePatients,
                averageRating: doctorProfile?.rating || null,
                specialty: doctorProfile?.specialty || null
            }
        });
    } catch (error) {
        logger.error('Error in getDoctorPerformance:', error);
        res.status(500).json({ success: false, message: 'Error fetching doctor performance', error: error.message });
    }
};

exports.getAppointmentAnalytics = async (req, res) => {
    try {
        const doctorId = req.query.doctorId || req.user?.id;
        if (!doctorId) {
            return res.status(400).json({ success: false, message: 'doctorId is required' });
        }
        // Gather appointment analytics for the doctor
        // 1. Appointments per status
        // 2. Appointments per month (last 6 months)
        // 3. Average appointment duration (if available)
        const statuses = ['pending', 'confirmed', 'completed', 'cancelled'];
        const statusCounts = {};
        for (const status of statuses) {
            statusCounts[status] = await Appointment.count({ where: { doctor_id: doctorId, status } });
        }
        // Appointments per month (last 6 months)
        const now = new Date();
        const months = [];
        for (let i = 5; i >= 0; i--) {
            const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
            const count = await Appointment.count({
                where: {
                    doctor_id: doctorId,
                    appointment_date: { [Op.between]: [start, end] }
                }
            });
            months.push({
                month: start.toLocaleString('default', { month: 'short', year: 'numeric' }),
                count
            });
        }
        // Average appointment duration (if available)
        const avgDurationResult = await Appointment.findOne({
            where: { doctor_id: doctorId },
            attributes: [[sequelize.fn('AVG', sequelize.col('duration')), 'avgDuration']]
        });
        const avgDuration = avgDurationResult?.get('avgDuration') || null;
        res.json({
            success: true,
            data: {
                statusCounts,
                appointmentsPerMonth: months,
                avgDuration
            }
        });
    } catch (error) {
        logger.error('Error in getAppointmentAnalytics:', error);
        res.status(500).json({ success: false, message: 'Error fetching appointment analytics', error: error.message });
    }
};

exports.getSurveyAnalyticsNew = async (req, res) => {
    try {
        const doctorId = req.query.doctorId || req.user?.id;
        if (!doctorId) {
            return res.status(400).json({ success: false, message: 'doctorId is required' });
        }
        // Aggregate MongoDB Diagnoses where doctorReview.doctorId matches
        const pipeline = [
            { $match: { 'doctorReview.doctorId': doctorId, postDiagnosisSurvey: { $exists: true, $ne: null } } },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    avgDiagnosisAccuracy: { $avg: '$postDiagnosisSurvey.diagnosisAccuracy' },
                    avgDiagnosisHelpfulness: { $avg: '$postDiagnosisSurvey.diagnosisHelpfulness' },
                    avgTreatmentClarity: { $avg: '$postDiagnosisSurvey.treatmentClarity' },
                    avgUserConfidence: { $avg: '$postDiagnosisSurvey.userConfidence' },
                    positiveRecommendations: { $sum: { $cond: ['$postDiagnosisSurvey.wouldRecommend', 1, 0] } }
                }
            }
        ];
        const [result] = await Diagnosis.aggregate(pipeline);
        res.json({
            success: true,
            data: result || {}
        });
    } catch (error) {
        logger.error('Error in getSurveyAnalyticsNew:', error);
        res.status(500).json({ success: false, message: 'Error fetching survey analytics', error: error.message });
    }
};

// Patient-specific severity distribution (token-based)
exports.getMySeverityDistribution = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            { $group: { _id: '$mlResults.severity', count: { $sum: 1 } } }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Patient-specific average model confidence (token-based)
exports.getMyAverageConfidence = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            { $group: { _id: null, avgConfidence: { $avg: '$mlResults.confidence' }, count: { $sum: 1 } } }
        ]);
        res.json({ success: true, data: result[0] || { avgConfidence: null, count: 0 } });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Patient-specific average confidence by severity (token-based)
exports.getMyAvgConfidenceBySeverity = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            { $group: { _id: '$mlResults.severity', avgConfidence: { $avg: '$mlResults.confidence' }, count: { $sum: 1 } } }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Patient-specific diagnosis trends over time (token-based)
exports.getMyDiagnosisTrends = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Patient-specific doctor review impact (token-based)
exports.getMyDoctorReviewImpact = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId, 'doctorReview.updatedSeverity': { $exists: true, $ne: null } } },
            {
                $project: {
                    date: '$createdAt',
                    original: '$mlResults.severity',
                    reviewed: '$doctorReview.updatedSeverity'
                }
            }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// --- ADMIN/DOCTOR WRAPPERS for patientId param endpoints ---
exports.getPatientSeverityDistribution = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMySeverityDistribution(req, res);
};
exports.getPatientAverageConfidence = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyAverageConfidence(req, res);
};
exports.getPatientAvgConfidenceBySeverity = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyAvgConfidenceBySeverity(req, res);
};
exports.getPatientDiagnosisTrends = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyDiagnosisTrends(req, res);
};
exports.getPatientDoctorReviewImpact = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyDoctorReviewImpact(req, res);
};

// Patient Summary
exports.getMySummary = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            {
                $group: {
                    _id: null,
                    totalDiagnoses: { $sum: 1 },
                    averageModelConfidence: { $avg: '$mlResults.confidence' },
                    severities: { $push: '$mlResults.severity' }
                }
            }
        ]);

        if (!result.length || !result[0].severities || result[0].severities.length === 0) {
            return res.json({
                success: true,
                data: {
                    totalDiagnoses: 0,
                    averageModelConfidence: null,
                    mostCommonSeverity: null
                }
            });
        }

        // Calculate most common severity
        const severityCount = {};
        result[0].severities.forEach(s => severityCount[s] = (severityCount[s] || 0) + 1);
        const mostCommonSeverity = Object.entries(severityCount)
            .sort((a, b) => b[1] - a[1])[0][0];

        res.json({
            success: true,
            data: {
                totalDiagnoses: result[0].totalDiagnoses,
                averageModelConfidence: result[0].averageModelConfidence,
                mostCommonSeverity
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Body Part Frequency
exports.getMyBodyPartFrequency = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            { $group: { _id: '$mlResults.affectedAreas', count: { $sum: 1 } } },
            { $unwind: '$_id' },
            { $group: { _id: '$_id', count: { $sum: '$count' } } },
            { $project: { bodyPart: '$_id', count: 1, _id: 0 } },
            { $sort: { count: -1 } }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Model Confidence Trend
exports.getMyModelConfidenceTrend = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.aggregate([
            { $match: { patientId } },
            {
                $project: {
                    date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    confidence: '$mlResults.confidence'
                }
            },
            { $sort: { date: 1 } }
        ]);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// Recent Diagnoses
exports.getMyRecentDiagnoses = async (req, res) => {
    try {
        const patientId = req.user.id;
        const result = await Diagnosis.find({ patientId })
            .select('diagnosisId mlResults.severity mlResults.confidence mlResults.affectedAreas recommendations needsDoctorReview imageUrl status createdAt doctorReview')
            .sort({ createdAt: -1 })
            .limit(10);
        res.json({ success: true, data: result });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error', error: error.message });
    }
};

// --- ADMIN/DOCTOR WRAPPERS for new endpoints ---
exports.getPatientBodyPartFrequency = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyBodyPartFrequency(req, res);
};

exports.getPatientModelConfidenceTrend = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyModelConfidenceTrend(req, res);
};

exports.getPatientRecentDiagnoses = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMyRecentDiagnoses(req, res);
};

// --- ADMIN/DOCTOR WRAPPER ---
exports.getPatientSummary = async (req, res) => {
    req.user = { id: req.params.patientId };
    return exports.getMySummary(req, res);
};

// --- ADMIN DASHBOARD ENDPOINTS ---

// Total Users
exports.getTotalUsers = async (req, res) => {
    try {
        const count = await User.count();
        res.json({ success: true, totalUsers: count });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch total users' });
    }
};

// System Uptime (returns process uptime in seconds)
exports.getSystemUptime = async (req, res) => {
    try {
        const uptime = process.uptime();
        res.json({ success: true, uptimeSeconds: uptime });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch uptime' });
    }
};

// Active Sessions
exports.getActiveSessions = async (req, res) => {
    try {
        const FIFTEEN_MINUTES = 15 * 60 * 1000;
        // Format date as YYYY-MM-DD HH:mm:ss for MySQL compatibility
        const sinceDate = new Date(Date.now() - FIFTEEN_MINUTES);
        const since = sinceDate.toISOString().slice(0, 19).replace('T', ' ');
        const count = await User.count({
            where: { last_active: { [Op.gte]: since } }
        });
        res.json({ success: true, activeSessions: count });
    } catch (err) {
        // Improved error logging
        logger.error('Error in getActiveSessions:', err);
        res.status(500).json({ success: false, error: 'Failed to fetch active sessions', details: err.message });
    }
};

// Error Rate
exports.getErrorRate = async (req, res) => {
    try {
        const logPath = path.join(__dirname, '../error.log');
        if (!fs.existsSync(logPath)) return res.json({ success: true, errorRate: 0 });
        const logData = fs.readFileSync(logPath, 'utf-8');
        const lines = logData.split('\n').filter(Boolean);
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        // Count lines that start with an ISO timestamp in the last 24h
        const recentErrors = lines.filter(line => {
            // Match ISO timestamp at start of line: 2025-04-21T15:11:07.373Z ...
            const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/);
            if (!match) return false;
            const logDate = new Date(match[1]);
            return logDate.getTime() >= oneDayAgo;
        });
        res.json({ success: true, errorRate: recentErrors.length });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch error rate' });
    }
};

// Recent Activity
exports.getRecentActivity = async (req, res) => {
    try {
        const logPath = path.join(__dirname, '../combined.log');
        if (!fs.existsSync(logPath)) return res.json({ success: true, activity: [] });
        const logData = fs.readFileSync(logPath, 'utf-8');
        const lines = logData.trim().split('\n').reverse();
        const activity = lines.slice(0, 10).map(line => {
            const match = line.match(/\[(.*?)\] (\w+) (.*)/);
            return match
                ? { date: match[1], level: match[2], event: match[3] }
                : { raw: line };
        });
        res.json({ success: true, activity });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch recent activity' });
    }
};

// Alerts
exports.getAlerts = async (req, res) => {
    try {
        res.json({
            success: true,
            alerts: [
                { type: 'maintenance', message: 'Scheduled maintenance on Sunday', level: 'warning' },
                { type: 'cpu', message: 'High CPU usage detected', level: 'danger' },
                { type: 'database', message: 'Database optimization complete', level: 'success' }
            ]
        });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Failed to fetch alerts' });
    }
};
