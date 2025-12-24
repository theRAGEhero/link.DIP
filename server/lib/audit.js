const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

const csvPath = path.join(__dirname, "..", "..", "data", "audit", "links.csv");

function ensureCsv() {
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(
      csvPath,
      "timestamp,source,url,title,image,coherent,category,reason,category_reason,raw_ai\n",
      "utf-8"
    );
  }
}

async function appendAudit(entry) {
  ensureCsv();
  const csvWriter = createObjectCsvWriter({
    path: csvPath,
    header: [
      { id: "timestamp", title: "timestamp" },
      { id: "source", title: "source" },
      { id: "url", title: "url" },
      { id: "title", title: "title" },
      { id: "image", title: "image" },
      { id: "coherent", title: "coherent" },
      { id: "category", title: "category" },
      { id: "reason", title: "reason" },
      { id: "category_reason", title: "category_reason" },
      { id: "raw_ai", title: "raw_ai" },
    ],
    append: true,
  });

  await csvWriter.writeRecords([entry]);
}

module.exports = { appendAudit };
