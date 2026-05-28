const express = require("express");
const cors = require("cors");

const convertHandler = require("./api/convert");

const app = express();

app.use(cors());

app.use(express.static("public"));

app.post("/convert", (req, res) => {
  return convertHandler(req, res);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});