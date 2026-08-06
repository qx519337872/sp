import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for base64 image uploads
app.use(express.json({ limit: "25mb" }));

// Helper to initialize Gemini clients safely
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

async function callRelayAPI(cleanBase64: string, mimeType: string, promptText: string): Promise<string | null> {
  const apiKey = (
    process.env.RELAY_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.SILICONFLOW_API_KEY ||
    "sk-tm-VcBvkr26j2npOfzdYy2HvB8RGdJ5iBXTB2l2I9M3LGX10G9o"
  )?.trim();

  if (!apiKey) return null;

  let baseUrl = (
    process.env.RELAY_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    process.env.OPENAI_API_BASE ||
    "https://api.tokenmix.ai/v1"
  ).trim();

  // Clean baseUrl: remove /chat/completions suffix if user provided full endpoint
  baseUrl = baseUrl.replace(/\/chat\/completions\/?$/, '');
  baseUrl = baseUrl.replace(/\/+$/, '');
  if (!baseUrl.endsWith('/v1')) {
    baseUrl += '/v1';
  }

  const model = (
    process.env.RELAY_MODEL ||
    process.env.OPENAI_MODEL ||
    "gemini-2.5-flash"
  ).trim();

  console.log(`Attempting Relay API call (${baseUrl}) with model '${model}'...`);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 40000);

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${cleanBase64}`
                }
              },
              {
                type: "text",
                text: promptText + "\nIMPORTANT: Return ONLY a JSON object containing a 'cards' array."
              }
            ]
          }
        ],
        response_format: { type: "json_object" },
        thinking_budget: 0,
        temperature: 0.1,
        max_tokens: 2048
      })
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const json = await response.json();
      return json?.choices?.[0]?.message?.content || null;
    } else {
      const errText = await response.text();
      console.warn(`Relay API returned HTTP ${response.status}:`, errText);
      throw new Error(`[HTTP ${response.status}]: ${errText}`);
    }
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error(`[超时]: TokenMix / 中转 API 响应超过 9 秒`);
    }
    throw err;
  }
}

// Utility helper to evaluate amount expressions and equations safely
function parseAndEvaluateAmount(amountInput: any): number | string {
  if (amountInput === undefined || amountInput === null || amountInput === '') return '';
  const rawStr = String(amountInput).trim();
  if (!rawStr) return '';

  // 1. If contains equals sign like "3+2=5" or "10*2=20" or "A+B = 120", extract number after '='
  if (rawStr.includes('=')) {
    const parts = rawStr.split('=');
    const rightPart = parts[parts.length - 1].trim();
    const rightNum = parseFloat(rightPart.replace(/[^\d.]/g, ''));
    if (!isNaN(rightNum)) {
      return rightNum;
    }
  }

  // 2. If expression without equals like "3+2", "3*2", "3x2", "3×2", calculate multiplication (3 * 2 = 6)
  const exprMatch = rawStr.match(/^(\d+(?:\.\d+)?)\s*[\+\*xX×]\s*(\d+(?:\.\d+)?)$/);
  if (exprMatch) {
    const num1 = parseFloat(exprMatch[1]);
    const num2 = parseFloat(exprMatch[2]);
    if (!isNaN(num1) && !isNaN(num2)) {
      return num1 * num2;
    }
  }

  // 3. Single number or currency string like "¥560" or "560"
  const parsedFloat = parseFloat(rawStr.replace(/[^\d.]/g, ''));
  if (!isNaN(parsedFloat)) {
    return parsedFloat;
  }

  return rawStr;
}

// API Route for product card detection with bounding boxes
app.post("/api/detect-cards", async (req, res) => {
  try {
    const { imageBase64, mimeType = "image/jpeg" } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: "Missing imageBase64 in request body" });
      return;
    }

    // Strip data URI header if present
    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");

    const geminiClients = getGeminiClients();
    const hasRelayKey = !!(
      process.env.RELAY_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.SILICONFLOW_API_KEY ||
      "sk-tm-VcBvkr26j2npOfzdYy2HvB8RGdJ5iBXTB2l2I9M3LGX10G9o"
    );

    if (geminiClients.length === 0 && !hasRelayKey) {
      console.warn("Neither GEMINI_API_KEY nor RELAY_API_KEY is set.");
      res.status(400).json({ error: "服务器未配置 GEMINI_API_KEY 或 RELAY_API_KEY 环境变量" });
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
    let relayErrorMsg: string | null = null;

    // 1. Try Relay API (OpenAI compatible) first if configured
    if (hasRelayKey) {
      try {
        responseText = await callRelayAPI(cleanBase64, mimeType, promptText);
      } catch (relayErr: any) {
        relayErrorMsg = relayErr?.message || String(relayErr);
        console.warn("Relay API call failed, falling back to Gemini SDK if available:", relayErrorMsg);
        lastError = relayErr;
      }
    }

    // 2. Try Gemini SDK if no response yet
    if (!responseText && geminiClients.length > 0) {
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
            setTimeout(() => reject(new Error(`Gemini API request timed out (${timeoutMs}ms)`)), timeoutMs)
          ),
        ]);
      };

      const configuredModel = process.env.GEMINI_MODEL?.trim();
      const candidateModels = [
        ...(configuredModel ? [configuredModel] : []),
        "gemini-2.5-flash",
        "gemini-2.0-flash",
        "gemini-2.5-pro",
        "gemini-2.0-flash-lite"
      ].filter((v, i, a) => v && a.indexOf(v) === i);

      keyLoop: for (const { client: ai, keyId } of geminiClients) {
        for (const modelName of candidateModels) {
          try {
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
              10000
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
              console.warn(`Key '${keyId}' hit 429 Quota Exceeded. Switching to next Key...`);
              break;
            }
          }
        }
      }
    }

    if (!responseText) {
      console.error("Gemini Vision API failed. Last error:", lastError);
      let rawErr = lastError?.message || '';

      if (relayErrorMsg && geminiClients.length === 0) {
        res.status(500).json({ error: `中转 API 调用失败: ${relayErrorMsg}` });
        return;
      }

      let userFriendlyMsg = `Gemini API 调用失败: ${rawErr || 'AI 识别服务未响应'}`;
      if (rawErr.includes('429') || rawErr.includes('RESOURCE_EXHAUSTED') || rawErr.includes('Quota')) {
        if (relayErrorMsg) {
          userFriendlyMsg = `中转 API 失败 (${relayErrorMsg})，且官方免费 Key 已达到调用上限`;
        } else {
          userFriendlyMsg = 'Gemini API 免费层级调用频次受限 (429 Quota Exceeded)，请稍后再试或配置付费 Key';
        }
      } else if (relayErrorMsg) {
        userFriendlyMsg = `中转 API 报错: ${relayErrorMsg}`;
      }
      res.status(500).json({ error: userFriendlyMsg });
      return;
    }

    let cleanedJsonText = responseText.trim();
    if (cleanedJsonText.startsWith("```json")) {
      cleanedJsonText = cleanedJsonText.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleanedJsonText.startsWith("```")) {
      cleanedJsonText = cleanedJsonText.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(cleanedJsonText);
    } catch (parseErr) {
      console.error("Failed to parse Gemini response as JSON:", responseText);
      res.status(500).json({ error: "AI 输出的 JSON 数据格式无法正常解析" });
      return;
    }

    const cards = Array.isArray(parsed.cards) ? parsed.cards : [];

    // Format cards with unique IDs and cardIndex
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

      // Evaluate amount expression if string like "3+2", "3x2", or equation like "3+2=5"
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

    // Calculate sum
    const totalAmount = formattedCards.reduce((sum: number, card: any) => {
      const num = parseFloat(String(card.amount));
      return sum + (!isNaN(num) ? num : 0);
    }, 0);

    const dNow = new Date();
    const todayMD = `${dNow.getMonth() + 1}/${dNow.getDate()}`;

    // Pick top recurring date extracted across cards if summary_date is missing
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
    res.status(500).json({ error: error?.message || "Internal server error" });
  }
});

// Start Server with Vite Middleware
async function startServer() {
  // Vite middleware in dev mode
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
