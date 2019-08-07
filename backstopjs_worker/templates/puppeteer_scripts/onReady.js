module.exports = async (page, scenario, vp) => {
  await page.evaluate(async scripts => {
    function cleanUp() {
      var id = window.setTimeout(function() {}, 0);
      while (id--) {
        window.clearTimeout(id);
      }
      var id = window.setInterval(function() {}, 0);
      while (id--) {
        window.clearInterval(id);
      }
    }
    cleanUp();
  }, page.scripts);
  console.log("(puppeteer) onReady.js has run for: " + vp.name + ".");
};
