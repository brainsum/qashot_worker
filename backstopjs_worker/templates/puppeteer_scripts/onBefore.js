module.exports = async (page, scenario, vp) => {
  var scripts = [];
  await require("./interceptImages")(page, scenario, scripts);
  page.scripts = scripts;
  console.log("(puppeteer) onBefore.js has run for: " + vp.name + ".");
};
