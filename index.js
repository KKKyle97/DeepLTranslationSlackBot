// const emojiRegex = require('emoji-regex');
import pkg from '@slack/bolt';
import axios from 'axios';
// const express = require('express');
import dotenv from 'dotenv';
import { eld } from 'eld';

const { App, ExpressReceiver } = pkg;
dotenv.config();

const FLAG_LANG_MAP = {
  'flag-jp': 'JA',
  'flag-kr': 'KO',
  'flag-cn': 'ZH',
  'flag-us': 'EN'
};

var glossaryList = [];

const receiver = new ExpressReceiver({
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

async function translateText(text, sourceLang, targetLang) {

  var res = "";
  if (glossaryList.length > 0) {
    res = await axios.post('https://api-free.deepl.com/v2/translate', null, {
      params: {
        auth_key: process.env.DEEPL_API_KEY,
        text,
        source_lang: sourceLang,
        target_lang: targetLang,
        glossary_id: glossaryList[0].glossary_id
      }
    });
  } else {
      res = await axios.post('https://api-free.deepl.com/v2/translate', null, {
        params: {
          auth_key: process.env.DEEPL_API_KEY,
          text,
          target_lang: targetLang
        }
      });
  }


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

async function getAllGlossaries() {
  try {
    const response = await axios.get('https://api-free.deepl.com/v3/glossaries', {
      headers: {
        'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`
      }
    });

    const glossaries = response.data.glossaries;
    console.log('Available glossaries:', glossaries);
    return glossaries;
  } catch (error) {
    console.error('Failed to fetch glossaries:', error.message);
    return [];
  }
}

// Reaction added event
app.event('reaction_added', async ({ event, client }) => {
    const emojiKey = 'flag-' + event.reaction;
    const targetLang = FLAG_LANG_MAP[emojiKey];

    console.log(event);
    console.log(targetLang);

    // Only continue if the flag is in our list
    if (!targetLang) return;

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

        console.log(originalText);

        console.log(eld.detect(originalText));

        if (!originalText || originalText.trim() === '') return;

        console.log('translating');

        // 2. Translate via DeepL API
        const { translatedText, detectedSourceLang } = await translateText(originalText, eld.detect(originalText).language.toUpperCase(), targetLang);

        // 3. Skip if already in target language
        if (detectedSourceLang.toUpperCase() === targetLang.toUpperCase()) {
            console.log(`🔁 Skipping: Already in ${targetLang}`);
            return;
        }

        // 4. Post translated message as a threaded reply
        await client.chat.postMessage({
        channel: event.item.channel,
        thread_ts: event.item.ts,
        text: `🌐 *Translated (${targetLang}):*\n${translatedText}`
        });

        } catch (err) {
        console.error('Error processing reaction:', err);
    }
});



(async () => {
  await app.start(process.env.PORT || 3000);
  console.log('⚡️ Flag Emoji Bot is running!');
  glossaryList = await getAllGlossaries();
})();
