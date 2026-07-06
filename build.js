const fs = require("fs");
const core = fs.readFileSync(__dirname + "/core.js", "utf8")
  .replace(/if \(typeof module[^]*$/m, "");    // strip node export block
const templates = fs.readFileSync("/home/claude/templates.json", "utf8");
let html = fs.readFileSync(__dirname + "/ui.html", "utf8");
html = html.replace("/*CORE*/", core);
html = html.replace("/*TEMPLATES*/null", templates);
fs.writeFileSync(__dirname + "/slapstack_playroom.html", html);
console.log("built:", (html.length / 1024).toFixed(0), "KB");
