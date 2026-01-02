const fs = require("fs");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

const csvPath = path.join(__dirname, "..", "..", "data", "audit", "links.csv");

function ensureCsv() {
  if (!fs.existsSync(csvPath)) {
    fs.writeFileSync(
      csvPath,
      "timestamp,source,url,title,image,coherent,category,reason,category_reason,raw_ai,status,attempts,last_error,queued_at\n",
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
      { id: "status", title: "status" },
      { id: "attempts", title: "attempts" },
      { id: "last_error", title: "last_error" },
      { id: "queued_at", title: "queued_at" },
    ],
    append: true,
  });

  await csvWriter.writeRecords([entry]);
}

module.exports = { appendAudit };
