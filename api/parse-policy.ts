import { verifyMessage } from "ethers";

const MAX_PROMPT_LENGTH = 600;
const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

type RequestBody = {
  wallet?: string;
  timestamp?: number;
  prompt?: string;
  signature?: string;
};

function send(response: any, status: number, body: unknown) {
  response.status(status).json(body);
}

export default async function handler(request: any, response: any) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return send(response, 405, { error: "Method not allowed." });
  }

  const apiKey = process.env.OG_COMPUTE_API_KEY;
  if (!apiKey)
    return send(response, 503, { error: "0G Compute is not configured." });

  const body = (request.body || {}) as RequestBody;
  const wallet = String(body.wallet || "").toLowerCase();
  const prompt = String(body.prompt || "").trim();
  const timestamp = Number(body.timestamp);
  const signature = String(body.signature || "");

  if (
    !wallet ||
    prompt.length < 12 ||
    prompt.length > MAX_PROMPT_LENGTH ||
    !Number.isFinite(timestamp) ||
    Math.abs(Date.now() - timestamp) > MAX_REQUEST_AGE_MS ||
    !signature
  ) {
    return send(response, 400, { error: "Invalid or expired policy request." });
  }

  const message =
    "GhostKey policy request\nWallet:" +
    wallet +
    "\nTimestamp:" +
    timestamp +
    "\nPrompt:" +
    prompt;

  try {
    if (verifyMessage(message, signature).toLowerCase() !== wallet) {
      return send(response, 401, { error: "Wallet signature did not match." });
    }

    const computeResponse = await fetch(
      (process.env.OG_COMPUTE_BASE_URL || "https://router-api.0g.ai/v1") +
        "/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: process.env.OG_COMPUTE_MODEL || "deepseek-v4-flash",
          temperature: 0,
          max_tokens: 350,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "Convert a wallet-permission request into strict JSON. Return only: allowedActions (array containing SWAP and/or TRANSFER), maxPerTx (positive number), totalLimit (number >= maxPerTx), maxTransactions (integer 1-1000), expiryHours (integer 1-8760). Never add an action the user did not request. If unspecified, use conservative values: maxPerTx 5, totalLimit 20, maxTransactions 10, expiryHours 6.",
            },
            { role: "user", content: prompt },
          ],
        }),
      },
    );

    if (computeResponse.status === 402) {
      return send(response, 402, {
        error:
          "0G Compute needs account credits before it can interpret policies.",
      });
    }
    if (!computeResponse.ok) {
      return send(response, 502, { error: "0G Compute rejected the request." });
    }

    const completion = await computeResponse.json();
    const content = completion?.choices?.[0]?.message?.content;
    const parsed = JSON.parse(String(content || "{}"));
    const allowedActions = Array.isArray(parsed.allowedActions)
      ? parsed.allowedActions
          .filter((action: unknown) =>
            ["SWAP", "TRANSFER"].includes(String(action).toUpperCase()),
          )
          .map((action: unknown) => String(action).toUpperCase())
      : [];
    const maxPerTx = Number(parsed.maxPerTx);
    const totalLimit = Number(parsed.totalLimit);
    const maxTransactions = Number(parsed.maxTransactions);
    const expiryHours = Number(parsed.expiryHours);

    if (
      !allowedActions.length ||
      !Number.isFinite(maxPerTx) ||
      maxPerTx <= 0 ||
      !Number.isFinite(totalLimit) ||
      totalLimit < maxPerTx ||
      !Number.isInteger(maxTransactions) ||
      maxTransactions < 1 ||
      maxTransactions > 1000 ||
      !Number.isInteger(expiryHours) ||
      expiryHours < 1 ||
      expiryHours > 8760
    ) {
      return send(response, 502, {
        error: "0G Compute returned an invalid policy.",
      });
    }

    return send(response, 200, {
      allowedActions: [...new Set(allowedActions)],
      maxPerTx,
      totalLimit,
      maxTransactions,
      expiryHours,
    });
  } catch {
    return send(response, 500, {
      error: "Could not securely interpret this policy.",
    });
  }
}
