// =============================================================
// api/transcribe.js
// =============================================================
// Vercel serverless function that transcribes audio using
// Azure Speech Services. Supports bilingual recognition:
// ga-IE (Irish) and en-IE (English Ireland).
//
// HOW IT WORKS:
//   1. The app records audio on the phone (M4A format)
//   2. The app reads the audio as base64 and POSTs it as JSON: { audio: "..." }
//   3. We decode the base64 back to a Buffer and send it to Azure
//   4. Azure's auto language detection picks between Irish and English
//   5. We return the transcript + detected language to the app
//
// ENVIRONMENT VARIABLES (set in Vercel dashboard):
//   AZURE_SPEECH_KEY    — your Azure Speech Services key
//   AZURE_SPEECH_REGION — your Azure region (e.g. 'australiaeast')
// =============================================================

import sdk from 'microsoft-cognitiveservices-speech-sdk';

// Allow larger request bodies (audio can be a few MB as base64).
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // Only accept POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // --- Get Azure credentials from environment variables ---
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      console.error('[TRANSCRIBE] Missing AZURE_SPEECH_KEY or AZURE_SPEECH_REGION env vars');
      return res.status(500).json({
        error: 'Azure Speech not configured. Add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION to Vercel environment variables.',
      });
    }

    // --- Get the audio data from the request body ---
    // The app sends base64-encoded audio inside a JSON body: { audio: "..." }
    // We decode it back to a Buffer for Azure.
    const { audio } = req.body || {};

    if (!audio) {
      return res.status(400).json({ error: 'No audio data received. Expected JSON with "audio" field.' });
    }

    const audioBuffer = Buffer.from(audio, 'base64');

    console.log('[TRANSCRIBE] Received audio:', audioBuffer.length, 'bytes');

    // --- Configure Azure Speech ---
    const speechConfig = sdk.SpeechConfig.fromSubscription(speechKey, speechRegion);

    // Enable profanity (don't mask Irish words that might look like profanity)
    speechConfig.setProfanity(sdk.ProfanityOption.Raw);

    // --- Bilingual recognition: Irish (ga-IE) and English (en-IE) ---
    // Azure's auto language detection will pick the best match for each
    // utterance. This handles the natural mix of Irish and English that
    // beginner learners speak.
    const autoDetectConfig = sdk.AutoDetectSourceLanguageConfig.fromLanguages([
      'ga-IE',    // Irish
      'en-IE',    // English (Ireland) — better accent match than en-US
    ]);

    // --- Feed the audio buffer to Azure ---
    // We create a "push stream" and write our audio bytes into it.
    // Azure reads from this stream to do the recognition.
    const pushStream = sdk.AudioInputStream.createPushStream();
    pushStream.write(audioBuffer);
    pushStream.close(); // Signal that all audio has been written

    const audioConfig = sdk.AudioConfig.fromStreamInput(pushStream);

    // --- Create the recognizer and transcribe ---
    // We wrap Azure's callback-based API in a Promise so we can await it.
    const transcript = await new Promise((resolve, reject) => {
      const recognizer = sdk.SpeechRecognizer.fromConfig(
        speechConfig,
        autoDetectConfig,
        audioConfig
      );

      // Use recognizeOnceAsync for single-utterance recognition.
      // Each audio chunk from the app is ~8 seconds — one utterance.
      recognizer.recognizeOnceAsync(
        (result) => {
          // Clean up the recognizer
          recognizer.close();

          if (result.reason === sdk.ResultReason.RecognizedSpeech) {
            // Successfully recognised speech
            const langResult = sdk.AutoDetectSourceLanguageResult.fromResult(result);
            const detectedLang = langResult.language || 'unknown';
            console.log('[TRANSCRIBE] Recognised:', result.text, '(lang:', detectedLang, ')');

            resolve({
              text: result.text,
              language: detectedLang,
            });
          } else if (result.reason === sdk.ResultReason.NoMatch) {
            // Azure heard audio but couldn't match it to speech
            console.log('[TRANSCRIBE] No speech recognised (NoMatch)');
            resolve({ text: '', language: '' });
          } else if (result.reason === sdk.ResultReason.Canceled) {
            // Something went wrong
            const cancellation = sdk.CancellationDetails.fromResult(result);
            console.error('[TRANSCRIBE] Canceled:', cancellation.reason, cancellation.errorDetails);
            reject(new Error(cancellation.errorDetails || 'Recognition canceled'));
          } else {
            console.log('[TRANSCRIBE] Unexpected result reason:', result.reason);
            resolve({ text: '', language: '' });
          }
        },
        (error) => {
          recognizer.close();
          console.error('[TRANSCRIBE] Recognition error:', error);
          reject(new Error(error));
        }
      );
    });

    // --- Return the result ---
    return res.status(200).json(transcript);

  } catch (error) {
    console.error('[TRANSCRIBE] Server error:', error.message || error);
    return res.status(500).json({
      error: 'Transcription failed: ' + (error.message || 'Unknown error'),
    });
  }
}
