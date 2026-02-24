// =============================================================
// api/transcribe.js
// =============================================================
// Vercel serverless function that transcribes audio using
// Azure Speech Services REST API. Supports bilingual recognition:
// ga-IE (Irish) and en-IE (English Ireland).
//
// WHY THE REST API INSTEAD OF THE SDK?
//   The Azure Speech SDK for JavaScript only supports raw PCM audio.
//   Our app records M4A (AAC compressed) audio. The REST API accepts
//   M4A/AAC natively — no audio format conversion needed.
//
// HOW IT WORKS:
//   1. The app records audio on the phone (M4A format)
//   2. The app reads the audio as base64 and POSTs it as JSON: { audio: "..." }
//   3. We decode the base64 back to a Buffer
//   4. We POST the audio to Azure's Fast Transcription REST API
//   5. Azure decodes the M4A and transcribes with language detection
//   6. We return the transcript + detected language to the app
//
// ENVIRONMENT VARIABLES (set in Vercel dashboard):
//   AZURE_SPEECH_KEY    — your Azure Speech Services key
//   AZURE_SPEECH_REGION — your Azure region (e.g. 'australiaeast')
// =============================================================

import FormData from 'form-data';

// Allow larger request bodies (audio can be a few MB as base64).
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS headers — same as chat.js and speak.js
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

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

    // --- Build the multipart request for Azure Fast Transcription API ---
    // This API accepts M4A/AAC audio natively (no conversion needed).
    // We send the audio file + a JSON "definition" that tells Azure
    // which languages to expect.
    const form = new FormData();

    // Attach the audio buffer as a file
    form.append('audio', audioBuffer, {
      filename: 'recording.m4a',
      contentType: 'audio/mp4',
    });

    // Attach the transcription settings.
    // Use en-IE as the primary locale so Azure doesn't fail trying to
    // auto-detect the language. ga-IE is listed as a candidate so Azure
    // can still recognise Irish when it hears it.
    form.append('definition', JSON.stringify({
      locales: ['en-IE'],
      languageIdentification: {
        candidateLocales: ['en-IE', 'ga-IE'],
      },
    }));

    // --- Send to Azure Fast Transcription REST API ---
    const endpoint =
      `https://${speechRegion}.api.cognitive.microsoft.com` +
      `/speechtotext/transcriptions:transcribe?api-version=2024-11-15`;

    // Convert the form-data stream to a Buffer.
    // Native fetch() in Node.js can't consume form-data streams directly —
    // it causes "Failed to read the request form" errors on Azure's end.
    // By reading the entire stream into a Buffer first, fetch() sends it correctly.
    const formBuffer = await new Promise((resolve, reject) => {
      const chunks = [];
      form.on('data', (chunk) => {
        // form-data emits strings for text fields and Buffers for binary fields.
        // Buffer.concat needs all items to be Buffers, so convert strings.
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      });
      form.on('end', () => resolve(Buffer.concat(chunks)));
      form.on('error', reject);
      form.resume(); // start reading the stream
    });

    const azureResponse = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': speechKey,
        ...form.getHeaders(),   // includes the correct Content-Type with boundary
      },
      body: formBuffer,         // Buffer instead of stream — works with native fetch()
    });

    if (!azureResponse.ok) {
      const errorText = await azureResponse.text();
      console.error('[TRANSCRIBE] Azure API error:', azureResponse.status, errorText);
      return res.status(502).json({
        error: 'Azure transcription failed: ' + errorText,
      });
    }

    const result = await azureResponse.json();
    console.log('[TRANSCRIBE] Azure result:', JSON.stringify(result).substring(0, 200));

    // --- Extract the transcript ---
    // Fast Transcription API returns:
    //   { combinedPhrases: [{ text: "full transcript" }],
    //     phrases: [{ text: "...", locale: "ga-IE", confidence: 0.9 }] }
    const fullText = result.combinedPhrases?.[0]?.text || '';

    // Try to get the detected language from the first phrase
    const detectedLang = result.phrases?.[0]?.locale || '';

    if (fullText) {
      console.log('[TRANSCRIBE] Recognised:', fullText, '(lang:', detectedLang, ')');
    } else {
      console.log('[TRANSCRIBE] No speech recognised');
    }

    return res.status(200).json({
      text: fullText,
      language: detectedLang,
    });

  } catch (error) {
    console.error('[TRANSCRIBE] Server error:', error.message || error);
    return res.status(500).json({
      error: 'Transcription failed: ' + (error.message || 'Unknown error'),
    });
  }
}
