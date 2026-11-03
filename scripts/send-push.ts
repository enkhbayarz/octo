/**
 * Sends a test remote push through Expo's push service — what a backend would do,
 * e.g. when new lessons are published.
 *
 *   bun scripts/send-push.ts "ExponentPushToken[...]" [/path/to/open]
 *
 * Get the token on a device build: Profile → Тохиргоо → Push токен хуваалцах.
 */
const [token, url = '/'] = process.argv.slice(2);

if (!token?.startsWith('ExponentPushToken[')) {
  console.error('Usage: bun scripts/send-push.ts "ExponentPushToken[...]" [/path]');
  process.exit(1);
}

const response = await fetch('https://exp.host/--/api/v2/push/send', {
  method: 'POST',
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: token,
    title: 'Шинэ хичээл нэмэгдлээ 🎉',
    body: 'Өнөөдрийн хичээлээ үргэлжлүүлж, streak-ээ хадгалаарай.',
    data: { kind: 'push', url },
    channelId: 'reminders',
    sound: 'default',
  }),
});

console.log(response.status, JSON.stringify(await response.json(), null, 2));
