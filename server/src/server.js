require('dotenv').config();
const { checkConfig } = require('./utils/checkConfig');
checkConfig(); // in production: refuses the default JWT_SECRET and other unsafe settings
const app = require('./app');

const port = process.env.API_PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
require('./jobs/scheduler').startScheduler();