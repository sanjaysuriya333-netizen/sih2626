// SMS providers. To use a real gateway: add one entry here and set SMS_PROVIDER=<name>.
// A provider is { send(user, message) } and must throw if the gateway refuses the message.
const providers = {
  stub: {
    async send(user, message) {
      console.log(`[sms stub] to user ${user.id}: ${message.subject}`);
      return { mode: 'stub' };
    },
  },
};

async function send(user, message) {
  const provider = providers[process.env.SMS_PROVIDER || 'stub'];
  if (!provider) throw new Error(`Unknown SMS_PROVIDER "${process.env.SMS_PROVIDER}"`);
  return provider.send(user, message);
}

module.exports = { name: 'SMS', send, providers };