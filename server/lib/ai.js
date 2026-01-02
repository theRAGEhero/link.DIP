const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const defaultCategories = [
  "Digital Democracy",
  "Participation",
  "Elections & Integrity",
  "Digital Participation",
  "Civic Tech",
  "GovTech",
  "Innovation in Governance",
  "Future of Politics",
  "Policy Innovation",
  "Public Sector AI",
  "Open Government & Transparency",
  "Public Procurement & Gov Ops",
  "Civic Data & Open Data",
  "Deliberation & Dialogue",
  "Disinformation & Media Literacy",
  "Digital Rights & Privacy",
  "AI Policy & Regulation",
  "Public Services & Welfare",
  "Smart Cities & Urban Gov",
  "Platform Governance",
  "International Institutions",
  "Local Government",
  "Research",
  "Funding",
  "Europe",
  "USA",
  "Rejected",
];

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  return new GoogleGenerativeAI(apiKey);
}

function buildPrompt(url, title, source) {
  const template = loadPromptTemplate();
  const { categories } = loadCategoriesFromTemplate(template);
  const categoryList = categories.filter((c) => c !== "Rejected").join(", ");
  return template
    .replace(/{{categories}}/g, categoryList)
    .replace(/{{url}}/g, url)
    .replace(/{{title}}/g, title || "(unknown)")
    .replace(/{{source}}/g, source);
}

function loadPromptTemplate() {
  const customPromptPath = path.join(__dirname, "..", "..", "data", "custom-agent.md");
  const promptPath = path.join(__dirname, "..", "..", "agent.md");
  try {
    const raw = fs.readFileSync(customPromptPath, "utf-8");
    if (raw.trim()) {
      return raw.trim();
    }
  } catch (error) {
    // fall back to default
  }
  try {
    const raw = fs.readFileSync(promptPath, "utf-8");
    if (raw.trim()) {
      return raw.trim();
    }
  } catch (error) {
    // fall back to default
  }
  return [
    "You are a strict curator for a platform about digital democracy, civic tech, gov tech, innovation in governance, public sector technology, and the future of politics.",
    "",
    "Evaluate the link and respond ONLY with JSON.",
    "",
    "Rules:",
    "- If it is unrelated to the domain above, set coherent=false and category=\"Rejected\".",
    "- If coherent=true, choose exactly one category from this list: {{categories}}.",
    "- Always provide a concise reason.",
    "- Provide a category_reason explaining why that category fits more than others.",
    "- Provide a short title if possible.",
    "",
    "Input:",
    "URL: {{url}}",
    "Title: {{title}}",
    "Source: {{source}}",
    "",
    "Return JSON with keys: coherent (boolean), category (string), reason (string), category_reason (string), title (string).",
  ].join("\n");
}

async function evaluateLink({ url, title, source }) {
  const genAI = getClient();
  const modelName = process.env.GEMINI_MODEL || "models/gemini-2.5-flash";
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: { responseMimeType: "application/json" },
  });
  const prompt = buildPrompt(url, title, source);
  const result = await generateWithRetry(model, prompt);
  const text = result.response.text();
  const jsonText = extractJson(text);
  const { categories } = loadCategoriesFromTemplate(loadPromptTemplate());

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    parsed = {
      coherent: false,
      category: "Rejected",
      reason: "AI response was not valid JSON.",
      category_reason: "No valid category selection.",
      title: title || "",
      raw: text,
    };
  }

  if (!categories.includes(parsed.category)) {
    parsed.category = parsed.coherent ? "Digital Democracy" : "Rejected";
  }

  return { ...parsed, raw: text };
}

async function generateWithRetry(model, prompt) {
  const attempts = 3;
  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await model.generateContent(prompt);
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      const shouldRetry = isTransientAiError(message);
      if (!shouldRetry || i === attempts - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500 * (i + 1)));
    }
  }
  throw lastError;
}

function extractJson(text) {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const match = trimmed.match(/```json\\s*([\\s\\S]*?)```/i) || trimmed.match(/```\\s*([\\s\\S]*?)```/i);
  const candidate = match ? match[1].trim() : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

function loadCategoriesFromTemplate(template) {
  const categories = [];
  const lines = template.split("\n");
  let inSection = false;
  for (const line of lines) {
    if (line.trim().toLowerCase() === "categories:") {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (!line.trim() || !line.trim().startsWith("-")) {
        break;
      }
      const value = line.replace(/^-+/, "").trim();
      if (value) {
        categories.push(value);
      }
    }
  }
  if (!categories.length) {
    return { categories: defaultCategories };
  }
  if (!categories.includes("Rejected")) {
    categories.push("Rejected");
  }
  return { categories };
}

function isTransientAiError(error) {
  const message = String(error || "");
  return (
    message.includes("503") ||
    message.includes("429") ||
    message.toLowerCase().includes("overloaded")
  );
}

module.exports = { evaluateLink, defaultCategories, isTransientAiError };
