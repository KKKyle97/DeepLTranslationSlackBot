// const emojiRegex = require('emoji-regex');
const { App, ExpressReceiver } = require('@slack/bolt');
// const express = require('express');
const axios = require('axios');

require('dotenv').config();

const FLAG_LANG_MAP = {
  'flag-jp': 'JA',
  'flag-kr': 'KO',
  'flag-cn': 'ZH',
  'flag-us': 'EN'
};

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

async function translateText(text, targetLang) {
  const res = await axios.post('https://api-free.deepl.com/v2/translate', null, {
    params: {
      auth_key: process.env.DEEPL_API_KEY,
      text,
      target_lang: targetLang
    }
  });

  const translationData = res.data.translations[0];
  return {
    translatedText: translationData.text,
    detectedSourceLang: translationData.detected_source_language
  };
}

// Your bot token and signing secret
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  receiver
});

// receiver.router.use(express.json());

// receiver.router.post('/', async (req, res) => {
//   const { type, challenge } = req.body;
//   if (type === 'url_verification') {
//     return res.status(200).send(challenge);
//   }

//   res.status(200).end();
// });

// Reaction added event
app.event('reaction_added', async ({ event, client }) => {
    const emojiKey = 'flag-' + event.reaction;
    const lang = FLAG_LANG_MAP[emojiKey];

    console.log(event);
    console.log(lang);

    // Only continue if the flag is in our list
    if (!lang) return;

    try {
        // 1. Get the original message
        const result = await client.conversations.history({
        channel: event.item.channel,
        latest: event.item.ts,
        inclusive: true,
        limit: 1
        });

        const message = result.messages[0];
        const originalText = message.text;

        console.log(message);

        if (!originalText || originalText.trim() === '') return;

        console.log('translating');

        // 2. Translate via DeepL API
        const { translatedText, detectedSourceLang } = await translateText(originalText, lang);

        // 3. Skip if already in target language
        if (detectedSourceLang.toUpperCase() === lang.toUpperCase()) {
            console.log(`🔁 Skipping: Already in ${lang}`);
            return;
        }

        // 4. Post translated message as a threaded reply
        await client.chat.postMessage({
        channel: event.item.channel,
        thread_ts: event.item.ts,
        text: `🌐 *Translated (${lang}):*\n${translatedText}`
        });

        } catch (err) {
        console.error('Error processing reaction:', err);
    }
});



(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Flag Emoji Bot is running!');
})();
