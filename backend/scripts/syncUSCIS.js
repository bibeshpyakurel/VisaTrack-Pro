require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { runSync } = require('../services/dataSync');

runSync({ triggerSource: 'cli' })
  .then(({ run }) => {
    console.log(`USCIS sync completed. Imported ${run.records_imported} records across ${run.files_imported} files.`);
  })
  .catch((error) => {
    console.error('USCIS sync failed:', error.message);
    process.exit(1);
  });