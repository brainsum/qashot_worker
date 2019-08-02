module.exports = async (page, scenario, vp) => {
  require("./interceptImages")(page, scenario);
  console.log("(puppeteer) onBefore.js has run for: " + vp.name + ".");
};
