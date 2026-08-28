const apiKey = process.env.OG_COMPUTE_API_KEY;
if (!apiKey) throw new Error("OG_COMPUTE_API_KEY is required.");
const response = await fetch(
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
      max_tokens: 8,
      temperature: 0,
      messages: [{ role: "user", content: "Reply with OK." }],
    }),
  },
);
if (!response.ok) {
  throw new Error("0G Compute returned HTTP " + response.status);
}
const body = await response.json();
if (!body?.choices?.[0]?.message?.content) {
  throw new Error("0G Compute returned no content.");
}
console.log("0G Compute authenticated successfully.");
