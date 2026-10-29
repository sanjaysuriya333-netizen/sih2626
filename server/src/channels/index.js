// The channel interface: send(channel, user, message, ctx). The ONLY place that knows the adapters.
const inApp = require('./inAppChannel');
const email = require('./emailChannel');
const sms = require('./smsChannel');

const adapters = { IN_APP: inApp, EMAIL: email, SMS: sms };

async function send(channel, user, message, ctx = {}) {
  const adapter = adapters[channel];
  if (!adapter) throw new Error(`Unknown channel ${channel}`);
  return adapter.send(user, message, ctx);
}

module.exports = { send, adapters };