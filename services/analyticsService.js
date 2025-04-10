const mongoose = require('mongoose');

// User Analytics
const getUserDemographics = async () => {
    try {
        return await User.aggregate([
            {
                $group: {
                    _id: null,
                    ageDistribution: {
                        $push: {
                            age: { $subtract: [new Date(), "$dateOfBirth"] },
                            count: { $sum: 1 }
                        }
                    },
                    genderDistribution: {
                        $push: {
                            gender: "$gender",
                            count: { $sum: 1 }
                        }
                    },
                    totalUsers: { $sum: 1 }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching user demographics: ' + error.message);
    }
};

const getDiagnosisPatterns = async (timeRange) => {
    try {
        return await Diagnosis.aggregate([
            {
                $match: {
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: {
                        severity: "$severity",
                        month: { $month: "$createdAt" }
                    },
                    count: { $sum: 1 },
                    avgConfidenceScore: { $avg: "$mlConfidenceScore" }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching diagnosis patterns: ' + error.message);
    }
};

const getTreatmentAnalytics = async () => {
    try {
        return await Diagnosis.aggregate([
            {
                $lookup: {
                    from: "treatments",
                    localField: "treatmentId",
                    foreignField: "_id",
                    as: "treatment"
                }
            },
            {
                $group: {
                    _id: "$treatment.type",
                    successRate: {
                        $avg: { $cond: [{ $eq: ["$outcome", "successful"] }, 1, 0] }
                    },
                    averageRecoveryTime: { $avg: "$recoveryTime" },
                    totalCases: { $sum: 1 }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching treatment analytics: ' + error.message);
    }
};

// Doctor Analytics
const getDoctorPerformance = async (doctorId, timeRange) => {
    try {
        return await Diagnosis.aggregate([
            {
                $match: {
                    doctorId: mongoose.Types.ObjectId(doctorId),
                    createdAt: { $gte: timeRange.start, $lte: timeRange.end }
                }
            },
            {
                $group: {
                    _id: "$doctorId",
                    totalDiagnoses: { $sum: 1 },
                    avgResponseTime: { $avg: "$responseTime" },
                    accuracyRate: {
                        $avg: { 
                            $cond: [
                                { $eq: ["$doctorDiagnosis", "$mlDiagnosis"] },
                                1,
                                0
                            ]
                        }
                    },
                    patientSatisfaction: { $avg: "$satisfactionScore" }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching doctor performance: ' + error.message);
    }
};

const getAppointmentAnalytics = async (doctorId) => {
    try {
        return await Appointment.aggregate([
            {
                $match: { doctorId: mongoose.Types.ObjectId(doctorId) }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 },
                    avgDuration: { $avg: "$duration" },
                    completionRate: {
                        $avg: { 
                            $cond: [
                                { $eq: ["$status", "completed"] },
                                1,
                                0
                            ]
                        }
                    }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching appointment analytics: ' + error.message);
    }
};

const getClinicalInsights = async (doctorId) => {
    try {
        return await Diagnosis.aggregate([
            {
                $match: { doctorId: mongoose.Types.ObjectId(doctorId) }
            },
            {
                $lookup: {
                    from: "treatments",
                    localField: "treatmentId",
                    foreignField: "_id",
                    as: "treatment"
                }
            },
            {
                $group: {
                    _id: "$treatment.type",
                    prescriptionCount: { $sum: 1 },
                    successRate: {
                        $avg: { $cond: [{ $eq: ["$outcome", "successful"] }, 1, 0] }
                    },
                    avgReviewTime: { $avg: "$reviewTime" },
                    secondOpinionRate: {
                        $avg: { $cond: [{ $eq: ["$requiresSecondOpinion", true] }, 1, 0] }
                    }
                }
            }
        ]);
    } catch (error) {
        throw new Error('Error fetching clinical insights: ' + error.message);
    }
};

module.exports = {
    // User Analytics
    getUserDemographics,
    getDiagnosisPatterns,
    getTreatmentAnalytics,
    
    // Doctor Analytics
    getDoctorPerformance,
    getAppointmentAnalytics,
    getClinicalInsights
};
