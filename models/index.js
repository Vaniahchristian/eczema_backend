// MySQL Models
const MySQLModels = require('./mysql');

// MongoDB Models
const MongoModels = {
    Diagnosis: require('./mongodb/Diagnosis'),
    Analytics: require('./mongodb/Analytics'),
    Advisory: require('./mongodb/Advisory')
};

// Export models
module.exports = {
    MySQL: MySQLModels,
    Mongo: MongoModels
};
