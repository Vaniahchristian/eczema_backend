'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('appointments', 'appointment_type', {
      type: Sequelize.ENUM('first_visit', 'follow_up', 'emergency'),
      allowNull: false,
      defaultValue: 'first_visit'
    });
  },

  down: async (queryInterface, Sequelize) => {
    // If you need to revert the change, define the previous state here
    await queryInterface.changeColumn('appointments', 'appointment_type', {
      type: Sequelize.STRING, // or whatever the previous type was
      allowNull: false
    });
  }
};
