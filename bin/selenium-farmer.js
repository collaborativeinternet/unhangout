#!/usr/bin/env node
/*
 * Automate the process of farming hangout URLs using a selenium browser.
 * Requires a configuration file, "farmingConf.json", which contains google
 * credentials for the account which will do the farming, containing the
 * following:
 *
 * {
 *   "serverUrl": "https://unhangout.media.mit.edu",
 *   "email": <google account email>,
 *   "password": <google password>,
 *   "count": <number of links to farm in one run>
 * }
 *
 * The google account specified must be configured to create hangout links for
 * every calendar event.  See DEVELOPMENT.md section "Hangout Creation" for
 * details.
 *
*/
 
var common = require("../test/common.js"),
    farmConf = require("../farmingConf.json");

function run(callback) {
    common.getSeleniumBrowser(function(browser) {
        // Authenticate first.
        browser.get(farmConf.serverUrl);
        browser.byLinkText("Login").click();
        browser.byCss("#Email").sendKeys(farmConf.email);
        browser.byCss("#Passwd").sendKeys(farmConf.password);
        browser.byCss("#signIn").click();
        browser.getCurrentUrl().then(function(url) {
            if (url.indexOf("AccountRecovery") != -1) {
                browser.byCss("#cancel").click();
            }
        });
        browser.getCurrentUrl().then(function(url) {
            if (url.indexOf("oauth2") != -1) {
                browser.byCss("#submit_approve_access").click();
            }
        });
        browser.getCurrentUrl().then(function(url) {
            if (url.indexOf(farmConf.serverUrl) == -1) {
                throw new Error("Unhandled sign-in interstitial!");
            }
        });
        browser.waitTime(2000);
        browser.getCurrentUrl().then(function(url) {
            if (url.indexOf("oauth2") != -1) {
                browser.byCss("#submit_approve_access").click();
                browser.get(farmConf.serverUrl + "/hangout-farming");
            }
        });
        browser.get(farmConf.serverUrl + "/hangout-farming");
        for (var i = 0; i < farmConf.count; i++) {
            browser.byLinkText("CLICK ME").click();
        };
        browser.then(function() {
            browser.quit().then(callback);
        });
    });
}
if (require.main === module) {
    run(function() {
        console.log("Successfully farmed", farmConf.count, "urls.");
        process.exit();
    });
}
