import express from "express";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json({ limit: "25mb" }));

function getGeminiClients(): { client: GoogleGenAI; keyId: string }[] {
  const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || "").trim();
  const baseUrl = (process.env.GEMINI_BASE_URL || process.env.GEMINI_API_BASE)?.trim();
  const keys = rawKeys
    .split(",")
    .map(k => k.trim())
    .filter(Boolean);

  if (keys.length === 0) return [];

  return keys.map((apiKey, idx) => ({
    keyId: `Key-${idx + 1}`,
    client: new GoogleGenAI({
      apiKey,
      httpOptions: {
        ...(baseUrl ? { baseUrl } : {}),
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    })
  }));
}

function repairTruncatedJson(jsonStr: string): string {
  let str = jsonStr.trim();
  let inString = false;
  let escapeNext = false;
  const stack: string[] = [];

  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char === '{' ? '}' : ']');
      } else if (char === '}' || char === ']') {
        if (stack.length > 0 && stack[stack.length - 1] === char) {
          stack.pop();
        }
      }
    }
  }

  if (inString) {
    str += '"';
  }

  str = str.replace(/,\s*$/, '');
  str = str.replace(/:\s*$/, ': null');

  while (stack.length > 0) {
    const expected = stack.pop();
    str += expected;
  }

  return str;
}

function extractAndParseJson(responseText: string): any {
  if (!responseText || typeof responseText !== 'string') {
    throw new Error('Response text is empty');
  }

  let s = responseText.trim();
  s = s.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  const jsonBlockMatch = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (jsonBlockMatch && jsonBlockMatch[1]) {
    s = jsonBlockMatch[1].trim();
  } else {
    const firstBrace = s.indexOf("{");
    const lastBrace = s.lastIndexOf("}");
    if (firstBrace !== -1) {
      if (lastBrace > firstBrace) {
        s = s.substring(firstBrace, lastBrace + 1);
      } else {
        s = s.substring(firstBrace);
      }
    }
  }

  try {
    return JSON.parse(s);
  } catch (err1) {
    const cleaned = s.replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(cleaned);
    } catch (err2) {
      const repaired = repairTruncatedJson(cleaned);
      try {
        return JSON.parse(repaired);
      } catch (err3) {
        console.error("Failed to parse JSON string. Raw response:", responseText);
        throw new Error("Unable to parse JSON");
      }
    }
  }
}

function parseAndEvaluateAmount(amountInput: any): number | string {
  if (amountInput === undefined || amountInput === null || amountInput === '') return '';
  const rawStr = String(amountInput).trim();
  if (!rawStr) return '';

  if (rawStr.includes('=')) {
    const parts = rawStr.split('=');
    const rightPart = parts[parts.length - 1].trim();
    const rightNum = parseFloat(rightPart.replace(/[^\d.]/g, ''));
    if (!isNaN(rightNum)) {
      return rightNum;
    }
  }

  const exprMatch = rawStr.match(/^(\d+(?:\.\d+)?)\s*[\+\*xX×]\s*(\d+(?:\.\d+)?)$/);
  if (exprMatch) {
    const num1 = parseFloat(exprMatch[1]);
    const num2 = parseFloat(exprMatch[2]);
    if (!isNaN(num1) && !isNaN(num2)) {
      return num1 * num2;
    }
  }

  const parsedFloat = parseFloat(rawStr.replace(/[^\d.]/g, ''));
  if (!isNaN(parsedFloat)) {
    return parsedFloat;
  }

  return rawStr;
}

// Rate limiter helper to strictly avoid Gemini API 429 Rate Limit (15 RPM / max 14 calls per min)
const requestTimestamps: number[] = [];
let lastCallTimestamp = 0;

async function enforceRateLimitAndDelay(): Promise<void> {
  const WINDOW_MS = 60000;
  const MAX_PER_WINDOW = 14; // Strictly cap at 14 calls per minute
  const MIN_GAP_MS = 4300;   // Enforce ~4.3s minimum gap between consecutive calls

  let now = Date.now();

  // 1. Minimum gap enforcement between consecutive API calls
  const timeSinceLast = now - lastCallTimestamp;
  if (timeSinceLast < MIN_GAP_MS) {
    const gapDelay = MIN_GAP_MS - timeSinceLast;
    console.log(`[RateLimiter] Smooth rate control: delaying ${gapDelay}ms to maintain <14 RPM...`);
    await new Promise((r) => setTimeout(r, gapDelay));
    now = Date.now();
  }

  // 2. Sliding 60-second window capacity enforcement
  while (true) {
    const windowStart = now - WINDOW_MS;
    while (requestTimestamps.length > 0 && requestTimestamps[0] < windowStart) {
      requestTimestamps.shift();
    }

    if (requestTimestamps.length < MAX_PER_WINDOW) {
      break;
    }

    const oldest = requestTimestamps[0];
    const waitTime = (oldest + WINDOW_MS) - now + 300;
    console.log(`[RateLimiter] 60s rate limit window full (${requestTimestamps.length}/${MAX_PER_WINDOW}). Pausing ${waitTime}ms...`);
    await new Promise((r) => setTimeout(r, waitTime));
    now = Date.now();
  }

  lastCallTimestamp = Date.now();
  requestTimestamps.push(lastCallTimestamp);
}

// API Route for product card detection
app.post("/api/detect-cards", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64 in request body" });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const geminiClients = getGeminiClients();

    if (geminiClients.length === 0) {
      res.status(400).json({ error: "服务器未配置 GEMINI_API_KEY 环境变量，请在 Vercel 设置 -> Environment Variables 中添加 GEMINI_API_KEY" });
      return;
    }

    const promptText = `You are an expert Computer Vision model analyzing product cards or price tags in an image.
Detect ALL distinct product card/tag rectangles (whether there are 1, 3, 6, 12, or 16 cards).

For EACH card detected:
1. Provide its 2D bounding box [ymin, xmin, ymax, xmax] normalized on 0..1000 scale.
2. Extract the card label or tag code (e.g. 'A654', 'かおり').
3. Extract the price or amount:
   - If price shows an expression like '3+2', '3*2', or '3x2', calculate MULTIPLICATION (3 * 2 = 6). Return 6.
   - If price is a single number like '560', '220', '440', return 560, 220, 440.
   - If gift/freebie (0 price), return 0.
4. Extract date on the card in M/D format (e.g. '7/30', '7/31').

Return JSON format with a 'cards' array.`;

    let responseText: string | null = null;
    let lastError: any = null;

    const imagePart = {
      inlineData: {
        data: cleanBase64,
        mimeType: mimeType,
      }
    };
    const textPart = { text: promptText };

    const callWithTimeout = <T>(promise: Promise<T>, timeoutMs = 35000): Promise<T> => {
      return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini API 响应超时 (${timeoutMs}ms)`)), timeoutMs)
        ),
      ]);
    };

    const configuredModel = process.env.GEMINI_MODEL?.trim();
    // Default model sequence: primary configured model, then high-quota models like gemini-3.1-flash-lite & 3.5-flash-lite (500 RPD), then 2.0-flash & 2.5-flash
    const candidateModels = [
      ...(configuredModel ? [configuredModel] : []),
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash-lite",
      "gemini-2.0-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-2.0-flash-lite"
    ].filter((v, i, a) => v && a.indexOf(v) === i);

    keyLoop: for (const { client: ai, keyId } of geminiClients) {
      for (const modelName of candidateModels) {
        try {
          // Enforce max 14 RPM rate limit and smooth gap delay before making API call
          await enforceRateLimitAndDelay();

          console.log(`Attempting Gemini detection with key '${keyId}' and model '${modelName}'...`);
          const response = await callWithTimeout(
            ai.models.generateContent({
              model: modelName,
              contents: [imagePart, textPart],
              config: {
                temperature: 0.1,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    cards: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          box_2d: {
                            type: Type.ARRAY,
                            items: { type: Type.INTEGER }
                          },
                          label: { type: Type.STRING },
                          amount: { type: Type.STRING, description: "Numeric string or evaluated math value" },
                          date: { type: Type.STRING },
                          confidence: { type: Type.NUMBER }
                        },
                        required: ["box_2d"]
                      }
                    },
                    summary_date: { type: Type.STRING },
                    total_amount: { type: Type.NUMBER }
                  },
                  required: ["cards"]
                }
              }
            }),
            35000
          );
          if (response && response.text) {
            console.log(`Success using key '${keyId}' and Gemini model '${modelName}'`);
            responseText = response.text;
            break keyLoop;
          }
        } catch (err: any) {
          const errMsg = err?.message || String(err);
          console.warn(`Gemini model '${modelName}' with key '${keyId}' failed:`, errMsg);
          lastError = err;
          if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('Quota')) {
            console.warn(`Hit 429 Quota Exceeded on ${modelName}. Waiting 3.5s before fallback model...`);
            await new Promise((r) => setTimeout(r, 3500));
          }
        }
      }
    }

    if (!responseText) {
      console.error("Gemini Vision API failed. Last error:", lastError);
      let rawErr = lastError?.message || String(lastError || '未捕获到具体的 API 错误信息');

      let userFriendlyMsg = `Gemini API 调用失败: ${rawErr}`;
      if (rawErr.includes('429') || rawErr.includes('RESOURCE_EXHAUSTED') || rawErr.includes('Quota')) {
        userFriendlyMsg = `Gemini 免费版 API 触及频率/额度限制 (429 Quota Exceeded)。原始错误信息: ${rawErr}。建议稍等几秒重试，或在 Vercel 中使用已绑定结算的 GEMINI_API_KEY。`;
      }
      res.status(500).json({ error: userFriendlyMsg });
      return;
    }

    let parsed: any = {};
    try {
      parsed = extractAndParseJson(responseText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response as JSON:", responseText);
      res.status(500).json({ error: "AI 输出的 JSON 数据格式无法正常解析" });
      return;
    }

    const cards = Array.isArray(parsed.cards)
      ? parsed.cards
      : Array.isArray(parsed.items)
      ? parsed.items
      : Array.isArray(parsed.card_list)
      ? parsed.card_list
      : Array.isArray(parsed.boxes)
      ? parsed.boxes
      : [];

    const formattedCards = cards.map((c: any, index: number) => {
      let box: [number, number, number, number] = [0, 0, 1000, 1000];
      if (Array.isArray(c.box_2d) && c.box_2d.length === 4) {
        box = [
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[0]) || 0))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[1]) || 0))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[2]) || 1000))),
          Math.max(0, Math.min(1000, Math.round(Number(c.box_2d[3]) || 1000)))
        ];
      }

      const valNum = parseAndEvaluateAmount(c.amount);

      return {
        id: `card-${index + 1}-${Date.now()}`,
        cardIndex: index + 1,
        box_2d: box,
        label: c.label || `商品 #${index + 1}`,
        amount: valNum,
        date: c.date || '',
        confidence: typeof c.confidence === 'number' ? c.confidence : 0.95
      };
    });

    const totalAmount = formattedCards.reduce((sum: number, card: any) => {
      const num = parseFloat(String(card.amount));
      return sum + (!isNaN(num) ? num : 0);
    }, 0);

    const dNow = new Date();
    const todayMD = `${dNow.getMonth() + 1}/${dNow.getDate()}`;

    let detectedDate = parsed.summary_date;
    if (!detectedDate) {
      const validDates = formattedCards.map((c: any) => c.date).filter(Boolean);
      detectedDate = validDates[0] || todayMD;
    }

    res.json({
      cards: formattedCards,
      summaryDate: detectedDate,
      totalAmount: parsed.total_amount || totalAmount,
      source: 'gemini',
      rawText: responseText
    });

  } catch (error: any) {
    console.error("Error in /api/detect-cards:", error);
    res.status(500).json({ error: error?.message || "服务器内部错误" });
  }
});

export default app;
