// Server-side proxy for Gemini book summaries.
// The Gemini key is read from the environment (Secret Manager in Cloud Run)
// so it never reaches the browser.
import http from 'node:http';
import { GoogleGenAI } from '@google/genai';

const PORT = Number(process.env.PORT) || 8080;
const MAX_DESCRIPTION_LENGTH = 5000;
const MODEL = 'gemini-3-flash-preview';

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('GEMINI_API_KEY is not set');
    process.exit(1);
}

// Comma-separated list, e.g. "https://nomansbookclub.com,https://www.nomansbookclub.com"
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

const ai = new GoogleGenAI({ apiKey });

const corsHeaders = (origin) => {
    if (!origin || !allowedOrigins.includes(origin)) return {};
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Vary': 'Origin',
    };
};

const sendJson = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
    res.end(JSON.stringify(body));
};

const readBody = (req) =>
    new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk) => {
            data += chunk;
            // Reject oversized bodies before buffering them all
            if (data.length > MAX_DESCRIPTION_LENGTH + 1000) {
                reject(new Error('Body too large'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });

const server = http.createServer(async (req, res) => {
    const headers = corsHeaders(req.headers.origin);

    if (req.method === 'OPTIONS') {
        res.writeHead(204, headers);
        return res.end();
    }

    if (req.method === 'GET' && req.url === '/healthz') {
        return sendJson(res, 200, { ok: true });
    }

    if (req.method !== 'POST' || req.url !== '/summarize') {
        return sendJson(res, 404, { error: 'Not found' }, headers);
    }

    let description;
    try {
        ({ description } = JSON.parse(await readBody(req)));
    } catch {
        return sendJson(res, 400, { error: 'Invalid request body' }, headers);
    }

    if (typeof description !== 'string' || !description.trim()) {
        return sendJson(res, 400, { error: 'description is required' }, headers);
    }
    if (description.length > MAX_DESCRIPTION_LENGTH) {
        return sendJson(res, 413, { error: 'description is too long' }, headers);
    }

    const prompt = `Summarize this book description for a book club in 2-3 concise sentences. Description: "${description}"`;

    try {
        const response = await ai.models.generateContent({ model: MODEL, contents: prompt });
        return sendJson(res, 200, { summary: response.text.trim() }, headers);
    } catch (error) {
        // Log the message only; never log the key or the full error object
        console.error('Gemini request failed:', error?.message || error);
        return sendJson(res, 502, { error: 'Summary unavailable' }, headers);
    }
});

server.listen(PORT, () => {
    console.log(`Summarize service listening on ${PORT}`);
});
