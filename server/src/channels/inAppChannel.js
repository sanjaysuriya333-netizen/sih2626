// IN_APP: writes a notification row. Runs inside the caller's transaction (ctx.db).
async function send(user, message, { db }) {
  return db.notification.create({
    data: {
      userId: user.id,
      channel: 'IN_APP',
      subject: message.subject,
      body: message.body,
      sentOn: new Date(),
      obligationId: message.obligationId ?? null,
    },
  });
}

module.exports = { name: 'IN_APP', send };