var server = require("../lib/unhangout-server"),
    models = require("../lib/server-models"),
    farming = require("../lib/hangout-farming"),
    common = require("./common"),
    expect = require("expect.js"),
    _ = require("underscore"),
    request = require("superagent"),
    async = require('async');

var session;
var suffix;

describe("HANGOUT REDIRECTS", function() {
    beforeEach(function(done) {
        common.standardSetup(function() {
            // Grab a session to work with.
            common.server.db.events.any(function(e) {
                if (e.get("sessions").length > 0) {
                    e.start();
                    session = e.get("sessions").at(0);
                    common.server.options.HANGOUT_APP_ID = "fun";
                    suffix = "?gid=" + common.server.options.HANGOUT_APP_ID +
                             "&gd=sessionId:" + session.id;
                    return true;
                }
            });
            if (!session) {
                console.log(common.server.db.events.toJSON());
                throw new Error("No sessions loaded!");
            }
            done();
        });
    });
    afterEach(common.standardShutdown);

    function checkRedirect(expected, user, done) {
        request.get("http://localhost:7777/session/" + session.get('session-key'))
            .timeout(20000)
            .set("x-mock-user", user)
            .redirects(0)
            .end(function(res) {
                expect(res.status).to.be(302);
                expect(res.headers.location).to.be(expected);
                done();
            });
    }
    it("Uses existing hangout link when present", function(done) {
        var success = session.setHangoutUrl("http://example.com/hangy");
        expect(success).to.be(true);
        checkRedirect("http://example.com/hangy" + suffix, "regular1", done);
    });
    it("Waits for a link when pending, and uses it when available", function(done) {
        var user = common.server.db.users.findWhere({"sock-key": "regular1"});
        session.startHangoutWithUser(user);
        expect(session.get("hangout-pending").userId).to.eql(user.id);
        expect(session.isHangoutPending()).to.be(true);
        async.parallel([
            function(done) {
                // Make sure this timeout is greater than the express default
                // timeout, so we can ensure that we've increased it on the express
                // route handler appropriately.
                setTimeout(function() {
                    session.setHangoutUrl("http://example.com/hangy");
                    expect(session.isHangoutPending()).to.be(false);
                    expect(session.get('hangout-url')).to.eql('http://example.com/hangy');
                    done();
                }, 1000);
            },
            function(done) {
                checkRedirect("http://example.com/hangy" + suffix, "regular1", done);
            },
        ], function() {
            expect(session.get("hangout-pending")).to.be(null);
            expect(session.isHangoutPending()).to.be(false);
            done();
        });
    });
    it("Uses a farmed hangout link when available", function(done) {
        farming.reuseUrl("http://example.com/farmed", function(err) {
            expect(err).to.be(null);
        
            var url = "http://example.com/farmed" + suffix;
            checkRedirect(url, "regular1", function() {
                farming.getNextHangoutUrl(function(err, url) {
                    expect(err).to.be(null);
                    expect(url).to.be(null);
                    done();
                });
            });
        });
    });
    it("Uses button URL when farmed hangout links are unavailable", function(done) {
        // Ensure we have nothing farmed...
        farming.getNextHangoutUrl(function(err, url) {
            expect(err).to.be(null);
            expect(url).to.be(null);
            var url = "https://plus.google.com/hangouts/_?gid=fun&gd=sessionId:" + session.id;
            checkRedirect(url, "regular1", function() {
                expect(session.isHangoutPending()).to.be(true);
                done();
            });
        });
    });
    it("Lets a 2nd user be the pending creator if the 1st times out", function(done) {
        this.timeout(30000); // We're testing long timeouts. :(
        var u1 = common.server.db.users.findWhere({"sock-key": "regular1"});
        var u2 = common.server.db.users.findWhere({"sock-key": "regular2"});
        var url = "https://plus.google.com/hangouts/_?gid=fun&gd=sessionId:" + session.id;
        // u1 is the user with the pending hangout...
        session.startHangoutWithUser(u1);
        // Make sure this timeout is greater than the "pending" timeout
        // set in lib/server-models.js
        setTimeout(function() {
            checkRedirect(url, u2.get("sock-key"), function() {
                expect(session.get("hangout-pending").userId).to.be(u2.id);
                done();
            });
        }, 20000);
    });
    it("Retains a farmed url after adding it to a session if someone joins", function(done) {
        this.timeout(30000); // We're testing long timeouts. :(
        var user = common.server.db.users.findWhere({"sock-key": "regular1"});
        var url = "http://example.com/good-url";
        farming.reuseUrl(url, function(err) {
            expect(err).to.be(null);
            checkRedirect(url + suffix, "regular1", function() {
                session.setConnectedParticipants([{id: user.id}]);
                setTimeout(function() {
                    expect(session.getHangoutUrl()).to.be(url);
                    done();
                }, 25000);
            });
        });
    });
    it("Times-out a farmed url (without re-using it) after adding it to a session if no one joins", function(done) {
        this.timeout(30000); // We're testing long timeouts. :(
        var url = "http://example.com/poison-url";
        expect(farming.getNumHangoutsAvailable()).to.be(0);
        farming.reuseUrl(url, function(err) {
            expect(err).to.be(null);
            // We should get the farmed (poison) url...
            checkRedirect(url + suffix, "regular1", function() {
                // ... but we don't enter the session, and never start it.
                setTimeout(function() {
                    expect(session.getHangoutUrl()).to.be(null);
                    // Ensure the URL wasn't reused..
                    farming.getNextHangoutUrl(function(err, url) {
                        expect(err).to.be(null);
                        expect(url).to.be(null);
                        done();
                    });
                }, 20000);
            });
        });
    });
});
