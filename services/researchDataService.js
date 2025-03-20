const mongoose = require('mongoose');
const { mysqlPool } = require('../config/database');
const crypto = require('crypto');

class ResearchDataService {
    // Anonymize patient identifier
    static hashIdentifier(identifier) {
        return crypto
            .createHash('sha256')
            .update(identifier + process.env.ANONYMIZATION_SALT)
            .digest('hex');
    }

    // Collect anonymized diagnosis data for research
    static async collectDiagnosisData() {
        try {
            const connection = await mysqlPool.getConnection();
            
            // Get diagnosis data with minimal patient info
            const [diagnoses] = await connection.query(`
                SELECT 
                    d.diagnosis_id,
                    d.severity,
                    d.confidence_score,
                    d.affected_areas,
                    d.created_at,
                    TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
                    p.gender,
                    p.postal_code
                FROM diagnoses d
                JOIN patients p ON d.patient_id = p.patient_id
                WHERE p.research_consent = true
            `);
            
            connection.release();

            // Anonymize the data
            return diagnoses.map(diagnosis => ({
                diagnosis_id: this.hashIdentifier(diagnosis.diagnosis_id),
                severity: diagnosis.severity,
                confidence_score: diagnosis.confidence_score,
                affected_areas: diagnosis.affected_areas,
                diagnosis_date: diagnosis.created_at,
                patient_demographics: {
                    age_group: this.getAgeGroup(diagnosis.patient_age),
                    gender: diagnosis.gender,
                    region: diagnosis.postal_code.substring(0, 2) // Only use first two digits for general region
                }
            }));
        } catch (error) {
            console.error('Error collecting research data:', error);
            throw error;
        }
    }

    // Collect treatment effectiveness data
    static async collectTreatmentData() {
        try {
            const connection = await mysqlPool.getConnection();
            
            const [treatments] = await connection.query(`
                SELECT 
                    t.treatment_type,
                    t.duration,
                    t.effectiveness_rating,
                    d.severity as initial_severity,
                    f.severity as final_severity,
                    TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
                    p.gender
                FROM treatments t
                JOIN diagnoses d ON t.diagnosis_id = d.diagnosis_id
                JOIN follow_ups f ON t.treatment_id = f.treatment_id
                JOIN patients p ON d.patient_id = p.patient_id
                WHERE p.research_consent = true
            `);
            
            connection.release();

            return treatments.map(treatment => ({
                treatment_type: treatment.treatment_type,
                duration_days: treatment.duration,
                effectiveness: {
                    rating: treatment.effectiveness_rating,
                    severity_change: treatment.initial_severity - treatment.final_severity
                },
                patient_demographics: {
                    age_group: this.getAgeGroup(treatment.patient_age),
                    gender: treatment.gender
                }
            }));
        } catch (error) {
            console.error('Error collecting treatment data:', error);
            throw error;
        }
    }

    // Collect trigger analysis data
    static async collectTriggerData() {
        try {
            const connection = await mysqlPool.getConnection();
            
            const [triggers] = await connection.query(`
                SELECT 
                    t.trigger_type,
                    t.frequency,
                    t.severity_impact,
                    TIMESTAMPDIFF(YEAR, p.date_of_birth, CURDATE()) as patient_age,
                    p.gender,
                    p.postal_code
                FROM patient_triggers t
                JOIN patients p ON t.patient_id = p.patient_id
                WHERE p.research_consent = true
            `);
            
            connection.release();

            return triggers.map(trigger => ({
                trigger_type: trigger.trigger_type,
                frequency: trigger.frequency,
                severity_impact: trigger.severity_impact,
                patient_demographics: {
                    age_group: this.getAgeGroup(trigger.patient_age),
                    gender: trigger.gender,
                    region: trigger.postal_code.substring(0, 2)
                }
            }));
        } catch (error) {
            console.error('Error collecting trigger data:', error);
            throw error;
        }
    }

    // Helper method to group ages
    static getAgeGroup(age) {
        if (age < 12) return 'child';
        if (age < 18) return 'adolescent';
        if (age < 30) return 'young_adult';
        if (age < 50) return 'adult';
        return 'senior';
    }

    // Generate research insights
    static async generateResearchInsights() {
        try {
            const diagnosisData = await this.collectDiagnosisData();
            const treatmentData = await this.collectTreatmentData();
            const triggerData = await this.collectTriggerData();

            return {
                diagnosis_patterns: {
                    severity_distribution: this.analyzeSeverityDistribution(diagnosisData),
                    age_correlation: this.analyzeAgeCorrelation(diagnosisData),
                    regional_patterns: this.analyzeRegionalPatterns(diagnosisData)
                },
                treatment_effectiveness: {
                    by_type: this.analyzeTreatmentEffectiveness(treatmentData),
                    by_demographic: this.analyzeDemographicResponse(treatmentData)
                },
                trigger_analysis: {
                    common_triggers: this.analyzeCommonTriggers(triggerData),
                    demographic_variations: this.analyzeTriggerDemographics(triggerData)
                }
            };
        } catch (error) {
            console.error('Error generating research insights:', error);
            throw error;
        }
    }

    // Analysis helper methods
    static analyzeSeverityDistribution(data) {
        const distribution = {};
        data.forEach(d => {
            distribution[d.severity] = (distribution[d.severity] || 0) + 1;
        });
        return distribution;
    }

    static analyzeAgeCorrelation(data) {
        const correlation = {};
        data.forEach(d => {
            const ageGroup = d.patient_demographics.age_group;
            if (!correlation[ageGroup]) {
                correlation[ageGroup] = { total: 0, severity_sum: 0 };
            }
            correlation[ageGroup].total++;
            correlation[ageGroup].severity_sum += this.severityToNumber(d.severity);
        });
        
        Object.keys(correlation).forEach(age => {
            correlation[age].average_severity = 
                correlation[age].severity_sum / correlation[age].total;
        });
        
        return correlation;
    }

    static severityToNumber(severity) {
        const map = { mild: 1, moderate: 2, severe: 3 };
        return map[severity] || 0;
    }

    static analyzeRegionalPatterns(data) {
        const patterns = {};
        data.forEach(d => {
            const region = d.patient_demographics.region;
            if (!patterns[region]) {
                patterns[region] = { count: 0, severities: {} };
            }
            patterns[region].count++;
            const severity = d.severity;
            patterns[region].severities[severity] = 
                (patterns[region].severities[severity] || 0) + 1;
        });
        return patterns;
    }

    static analyzeTreatmentEffectiveness(data) {
        const effectiveness = {};
        data.forEach(t => {
            if (!effectiveness[t.treatment_type]) {
                effectiveness[t.treatment_type] = {
                    total_cases: 0,
                    success_cases: 0,
                    average_improvement: 0
                };
            }
            const record = effectiveness[t.treatment_type];
            record.total_cases++;
            if (t.effectiveness.severity_change > 0) {
                record.success_cases++;
            }
            record.average_improvement += t.effectiveness.severity_change;
        });

        Object.values(effectiveness).forEach(record => {
            record.success_rate = record.success_cases / record.total_cases;
            record.average_improvement /= record.total_cases;
        });

        return effectiveness;
    }
}

module.exports = ResearchDataService;
