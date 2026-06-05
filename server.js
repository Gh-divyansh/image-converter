const express = require("express");
const cors = require("cors");
const path = require("path");

const convertHandler = require("./api/convert");
const convertAllHandler = require("./api/convert-all");

const app = express();

app.use(cors());

app.use(express.static(path.join(__dirname, "public")));

app.post("/convert", (req, res) => {
  return convertHandler(req, res);
});

app.post("/convert-all", (req, res) => {
  return convertAllHandler(req, res);
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
