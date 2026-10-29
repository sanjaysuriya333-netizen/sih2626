require('dotenv').config();
const app = require('./app');

const port = process.env.API_PORT || 4000;
app.listen(port, () => console.log(`API running on http://localhost:${port}`));
require('./jobs/scheduler').startScheduler();
